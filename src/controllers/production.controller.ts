import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

export const getProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { name: 'asc' }
    });
    return successResponse(res, products, 'Data produk berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan', null, 500);
  }
};

export const createProductionRecord = async (req: Request, res: Response) => {
  try {
    const { productId, quantity, rejectQty, rejectReason, date, notes } = req.body;
    const qty = Number(quantity);
    const rejected = Math.max(0, Number(rejectQty || 0));
    const acceptedQty = Math.max(0, qty - rejected);

    if (!productId || qty <= 0) {
      return errorResponse(res, 'Produk dan jumlah produksi wajib diisi', null, 400);
    }

    if (rejected > qty) {
      return errorResponse(res, 'Jumlah reject tidak boleh lebih besar dari jumlah produksi', null, 400);
    }

    if (rejected > 0 && !rejectReason) {
      return errorResponse(res, 'Alasan reject wajib diisi jika ada produk reject', null, 400);
    }
    
    const record = await prisma.$transaction(async (tx) => {
      // Create production record
      const newRecord = await tx.productionRecord.create({
        data: {
          productId,
          quantity: qty,
          rejectQty: rejected,
          date: new Date(date),
          notes
        },
        include: {
          product: true
        }
      });

      if (rejected > 0) {
        await tx.productionReject.create({
          data: {
            productionId: newRecord.id,
            productId,
            rejectQty: rejected,
            rejectReason,
            date: new Date(date),
            notes
          }
        });
      }

      const recipes = acceptedQty > 0
        ? await tx.erpProductRecipe.findMany({
            where: { productId },
            include: {
              ingredient: true,
              product: true
            }
          })
        : [];

      if (recipes.length > 0) {
        const outputQtyPerBatch = Math.max(1, recipes[0].product.recipeOutputQty || 1);
        const requiredBatchCount = Math.ceil(acceptedQty / outputQtyPerBatch);

        for (const recipe of recipes) {
          const requiredQty = Math.ceil(recipe.qtyNeeded * requiredBatchCount);
          if (recipe.ingredient.currentStock < requiredQty) {
            throw new Error(`Stok ${recipe.ingredient.name} tidak mencukupi. Butuh: ${requiredQty}, Tersedia: ${recipe.ingredient.currentStock}`);
          }
        }

        for (const recipe of recipes) {
          const requiredQty = Math.ceil(recipe.qtyNeeded * requiredBatchCount);
          await tx.warehouseItem.update({
            where: { id: recipe.warehouseItemId },
            data: {
              currentStock: {
                decrement: requiredQty
              }
            }
          });

          await tx.warehouseMovement.create({
            data: {
              warehouseItemId: recipe.warehouseItemId,
              type: 'OUT',
              quantity: requiredQty,
              date: new Date(date),
              notes: `Auto resep produksi ${newRecord.product.name} (${acceptedQty} produk baik, ${requiredBatchCount} batch)`
            }
          });
        }
      }

      // Add only accepted products to finished goods stock.
      if (acceptedQty > 0) {
        await tx.productStockMovement.create({
          data: {
            productId,
            type: 'IN',
            quantity: acceptedQty,
            reference: `PROD-${newRecord.id}`,
            notes: rejected > 0 ? `Hasil produksi bagus (${acceptedQty}); reject ${rejected}` : 'Hasil Produksi'
          }
        });
      }

      // Update Production Target actualQty for current month
      const productionDate = new Date(date);
      const targetMonth = new Date(productionDate.getFullYear(), productionDate.getMonth(), 1);

      const existingTarget = await tx.productionTarget.findUnique({
        where: {
          productId_targetMonth: {
            productId,
            targetMonth,
          }
        }
      });

      if (existingTarget) {
        await tx.productionTarget.update({
          where: {
            productId_targetMonth: {
              productId,
              targetMonth,
            }
          },
          data: {
            actualQty: {
              increment: acceptedQty
            }
          }
        });
      }

      return newRecord;
    });

    await writeAuditLog(req, 'CREATE', 'PRODUCTION', `Laporan produksi ${record.product.name} sebanyak ${qty} unit, reject ${rejected}, stok masuk ${acceptedQty}`);
    return successResponse(res, record, 'Laporan produksi berhasil disimpan & target terupdate');
  } catch (error: any) {
    console.error('Error create production record:', error);
    return errorResponse(res, error.message || 'Terjadi kesalahan menyimpan produksi', null, 500);
  }
};

export const getProductionRecords = async (req: Request, res: Response) => {
  try {
    const records = await prisma.productionRecord.findMany({
      include: { product: true, rejects: true },
      orderBy: { date: 'desc' }
    });
    return successResponse(res, records, 'Data laporan produksi berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan', null, 500);
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { code, name, category } = req.body;
    if (!code || !name || !category) {
      return errorResponse(res, 'Kode, nama, dan kategori produk wajib diisi', null, 400);
    }

    const product = await prisma.product.create({
      data: {
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        category: String(category).trim()
      }
    });

    await writeAuditLog(req, 'CREATE', 'PRODUCT', `Produk baru dibuat: ${product.name}`);
    return successResponse(res, product, 'Produk berhasil dibuat', 201);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return errorResponse(res, 'Kode produk sudah digunakan', null, 400);
    }
    return errorResponse(res, 'Gagal membuat produk', null, 500);
  }
};

export const getProductStockSummary = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: { stockMovements: true },
      orderBy: { name: 'asc' }
    });

    const summary = products.map((product) => {
      const stockIn = product.stockMovements.filter((m) => m.type === 'IN').reduce((sum, m) => sum + m.quantity, 0);
      const stockOut = product.stockMovements.filter((m) => m.type === 'OUT').reduce((sum, m) => sum + m.quantity, 0);
      const adjustments = product.stockMovements.filter((m) => m.type === 'ADJUSTMENT').reduce((sum, m) => sum + m.quantity, 0);
      return {
        id: product.id,
        code: product.code,
        name: product.name,
        category: product.category,
        stockIn,
        stockOut,
        adjustments,
        currentStock: stockIn - stockOut + adjustments
      };
    });

    return successResponse(res, summary, 'Ringkasan stok produk berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil stok produk', null, 500);
  }
};

export const setInitialProductStock = async (req: Request, res: Response) => {
  try {
    const { productId, quantity, stockDate, notes } = req.body;
    const desiredStock = Number(quantity);

    if (!productId || !Number.isFinite(desiredStock) || desiredStock < 0) {
      return errorResponse(res, 'Produk dan stok awal yang valid wajib diisi', null, 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
        include: { stockMovements: true }
      });

      if (!product) {
        throw new Error('Produk tidak ditemukan');
      }

      const stockIn = product.stockMovements.filter((movement) => movement.type === 'IN').reduce((sum, movement) => sum + movement.quantity, 0);
      const stockOut = product.stockMovements.filter((movement) => movement.type === 'OUT').reduce((sum, movement) => sum + movement.quantity, 0);
      const adjustments = product.stockMovements.filter((movement) => movement.type === 'ADJUSTMENT').reduce((sum, movement) => sum + movement.quantity, 0);
      const currentStock = stockIn - stockOut + adjustments;
      const adjustmentQty = desiredStock - currentStock;

      if (adjustmentQty === 0) {
        return { product, currentStock, desiredStock, adjustmentQty, movement: null };
      }

      const movement = await tx.productStockMovement.create({
        data: {
          productId,
          type: 'ADJUSTMENT',
          quantity: adjustmentQty,
          reference: 'INITIAL_STOCK',
          notes: [
            `Saldo awal produk jadi: set dari ${currentStock} menjadi ${desiredStock}`,
            stockDate ? `Tanggal saldo: ${stockDate}` : null,
            notes || null
          ].filter(Boolean).join(' | ')
        }
      });

      return { product, currentStock, desiredStock, adjustmentQty, movement };
    });

    await writeAuditLog(req, 'CREATE', 'PRODUCT_STOCK', `Set stok awal ${result.product.name}: ${result.currentStock} -> ${result.desiredStock}`);
    return successResponse(res, result, result.adjustmentQty === 0 ? 'Stok produk sudah sesuai' : 'Stok awal produk jadi berhasil disimpan');
  } catch (error: any) {
    console.error('Error set initial product stock:', error);
    return errorResponse(res, error.message || 'Gagal menyimpan stok awal produk jadi', null, 500);
  }
};

export const useMaterials = async (req: Request, res: Response) => {
  try {
    const { warehouseItemId, quantity, date, notes } = req.body;
    
    const qtyNum = Number(quantity);
    if (!warehouseItemId || qtyNum <= 0) {
      return errorResponse(res, 'Barang dan jumlah yang valid wajib diisi', null, 400);
    }

    const movement = await prisma.$transaction(async (tx) => {
      const item = await tx.warehouseItem.findUnique({ where: { id: warehouseItemId } });
      if (!item) throw new Error('Barang tidak ditemukan');

      if (item.currentStock < qtyNum) {
        throw new Error(`Stok ${item.name} tidak mencukupi (Sisa: ${item.currentStock})`);
      }

      // Update stock
      await tx.warehouseItem.update({
        where: { id: warehouseItemId },
        data: { currentStock: { decrement: qtyNum } }
      });

      // Create movement
      return await tx.warehouseMovement.create({
        data: {
          warehouseItemId,
          type: 'OUT',
          quantity: qtyNum,
          date: new Date(date || Date.now()),
          notes: notes || 'Pemakaian Divisi Produksi'
        },
        include: { item: true }
      });
    });

    await writeAuditLog(req, 'CREATE', 'PRODUCTION_MATERIAL', `Produksi memakai ${movement.item.name} sebanyak ${qtyNum} ${movement.item.unit}`);
    return successResponse(res, movement, 'Pemakaian bahan baku berhasil dicatat');
  } catch (error: any) {
    console.error('Error use materials:', error);
    return errorResponse(res, error.message || 'Terjadi kesalahan sistem', null, 500);
  }
};

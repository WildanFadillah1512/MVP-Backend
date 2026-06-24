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
    const { productId, quantity, date, notes } = req.body;
    
    const record = await prisma.$transaction(async (tx) => {
      // Create production record
      const newRecord = await tx.productionRecord.create({
        data: {
          productId,
          quantity: Number(quantity),
          date: new Date(date),
          notes
        },
        include: {
          product: true
        }
      });

      // Add to warehouse/stock automatically (IN type)
      await tx.productStockMovement.create({
        data: {
          productId,
          type: 'IN',
          quantity: Number(quantity),
          reference: `PROD-${newRecord.id}`,
          notes: 'Hasil Produksi'
        }
      });

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
              increment: Number(quantity)
            }
          }
        });
      }

      return newRecord;
    });

    await writeAuditLog(req, 'CREATE', 'PRODUCTION', `Laporan produksi ${record.product.name} sebanyak ${quantity} unit`);
    return successResponse(res, record, 'Laporan produksi berhasil disimpan & target terupdate');
  } catch (error) {
    console.error('Error create production record:', error);
    return errorResponse(res, 'Terjadi kesalahan menyimpan produksi', null, 500);
  }
};

export const getProductionRecords = async (req: Request, res: Response) => {
  try {
    const records = await prisma.productionRecord.findMany({
      include: { product: true },
      orderBy: { date: 'desc' }
    });
    return successResponse(res, records, 'Data laporan produksi berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan', null, 500);
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

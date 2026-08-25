import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { StockMovementType } from '@prisma/client';
import { createBulkNotifications } from '../services/notification.service';

const buildItemCode = async (name: string) => {
  const prefix = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 6) || 'ITEM';
  const count = await prisma.warehouseItem.count();
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
};

const calculatePricePerGram = (purchasePrice?: number, purchaseGram?: number) => {
  const price = Number(purchasePrice || 0);
  const gram = Number(purchaseGram || 0);
  return price > 0 && gram > 0 ? price / gram : 0;
};

export const getItems = async (req: Request, res: Response) => {
  try {
    const items = await prisma.warehouseItem.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });
    return successResponse(res, items, 'Data gudang berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data gudang', null, 500);
  }
};

export const createItem = async (req: Request, res: Response) => {
  try {
    const { code, name, category, minStock, currentStock, unit, purchasePrice, purchaseGram } = req.body;
    if (!name) {
      return errorResponse(res, 'Nama barang wajib diisi', null, 400);
    }

    const itemCode = code ? String(code).trim().toUpperCase() : await buildItemCode(String(name));
    const price = Number(purchasePrice || 0);
    const gram = Number(purchaseGram || 0);
    const item = await prisma.warehouseItem.create({
      data: {
        code: itemCode,
        name: String(name).trim(),
        category: String(category || 'Bahan Baku').trim(),
        minStock: Number(minStock || 0),
        currentStock: Number(currentStock || 0),
        unit: String(unit || 'gram').trim(),
        purchasePrice: price,
        purchaseGram: gram,
        pricePerGram: calculatePricePerGram(price, gram)
      }
    });

    if (item.currentStock > 0) {
      await prisma.warehouseMovement.create({
        data: {
          warehouseItemId: item.id,
          type: 'IN',
          quantity: item.currentStock,
          notes: 'Stok awal master barang'
        }
      });
    }

    await writeAuditLog(req, 'CREATE', 'WAREHOUSE_ITEM', `Master barang gudang dibuat: ${item.name}`);
    return successResponse(res, item, 'Master barang berhasil dibuat', 201);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return errorResponse(res, 'Kode barang sudah digunakan', null, 400);
    }
    return errorResponse(res, 'Gagal membuat master barang', null, 500);
  }
};

export const updateItem = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = user.role?.name || user.role;
    const division = user.division?.name || user.division;
    const id = String(req.params.id);

    if (!['OWNER', 'CEO', 'ADMIN', 'GM', 'MANAGER'].includes(role) && !['GUDANG', 'PURCHASING'].includes(division)) {
      return errorResponse(res, 'Anda tidak berwenang mengubah barang gudang', null, 403);
    }

    const current = await prisma.warehouseItem.findFirst({ where: { id, isActive: true } });
    if (!current) return errorResponse(res, 'Barang tidak ditemukan', null, 404);

    const price = req.body.purchasePrice !== undefined ? Number(req.body.purchasePrice || 0) : current.purchasePrice;
    const gram = req.body.purchaseGram !== undefined ? Number(req.body.purchaseGram || 0) : current.purchaseGram;
    const item = await prisma.warehouseItem.update({
      where: { id },
      data: {
        code: req.body.code ? String(req.body.code).trim().toUpperCase() : undefined,
        name: req.body.name ? String(req.body.name).trim() : undefined,
        category: req.body.category ? String(req.body.category).trim() : undefined,
        minStock: req.body.minStock !== undefined ? Number(req.body.minStock || 0) : undefined,
        currentStock: req.body.currentStock !== undefined ? Number(req.body.currentStock || 0) : undefined,
        unit: req.body.unit ? String(req.body.unit).trim() : undefined,
        purchasePrice: price,
        purchaseGram: gram,
        pricePerGram: calculatePricePerGram(price, gram)
      }
    });

    await writeAuditLog(req, 'UPDATE', 'WAREHOUSE_ITEM', `Master barang gudang diperbarui: ${item.name}`);
    return successResponse(res, item, 'Master barang berhasil diperbarui');
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return errorResponse(res, 'Kode barang sudah digunakan', null, 400);
    }
    return errorResponse(res, error.message || 'Gagal memperbarui master barang', null, 500);
  }
};

export const createMovement = async (req: Request, res: Response) => {
  try {
    const { warehouseItemId, type, quantity, notes } = req.body;
    const qty = Number(quantity);

    const result = await prisma.$transaction(async (tx) => {
      if (!warehouseItemId || !Number.isFinite(qty) || qty <= 0) {
        throw new Error('Barang dan jumlah yang valid wajib diisi');
      }

      const item = await tx.warehouseItem.findFirst({ where: { id: warehouseItemId, isActive: true } });
      if (!item) throw new Error('Barang tidak ditemukan');

      if (type === 'OUT') {
        if (item.currentStock < qty) throw new Error(`Stok ${item.name} tidak cukup. Sisa: ${item.currentStock}`);
      }

      // Create movement log
      const movement = await tx.warehouseMovement.create({
        data: {
          warehouseItemId,
          type: type as StockMovementType,
          quantity: qty,
          notes
        }
      });

      // Update current stock
      await tx.warehouseItem.update({
        where: { id: warehouseItemId },
        data: {
          currentStock: type === 'IN' ? { increment: qty } : { decrement: qty }
        }
      });

      return { movement, item };
    });

    const targetUsers = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          { division: { name: { in: ['GUDANG', 'PURCHASING'] as any } } },
          { role: { name: { in: ['OWNER', 'CEO', 'ADMIN', 'GM'] as any } } }
        ]
      },
      select: { id: true }
    });

    await createBulkNotifications(targetUsers.map((target) => ({
      userId: target.id,
      title: `Stok Gudang ${type}`,
      message: `${result.item.name} ${type === 'IN' ? 'bertambah' : 'berkurang'} ${qty} ${result.item.unit}.`,
      type: type === 'OUT' ? 'WARNING' : 'INFO',
      link: '/warehouse',
      metadata: { warehouseItemId, movementId: result.movement.id }
    }))).catch(() => {});

    await writeAuditLog(req, 'CREATE', 'WAREHOUSE', 'Pergerakan stok gudang dicatat: ' + type);
    return successResponse(res, result.movement, `Stok ${type} berhasil dicatat`);
  } catch (error) {
    return errorResponse(res, error instanceof Error ? error.message : 'Gagal mencatat pergerakan stok', null, 500);
  }
};

export const getMovements = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    let dateFilter = {};
    
    if (startDate && endDate) {
      dateFilter = {
        date: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string)
        }
      };
    }

    const movements = await prisma.warehouseMovement.findMany({
      where: { ...dateFilter },
      include: { item: true },
      orderBy: { date: 'desc' }
    });
    return successResponse(res, movements, 'Riwayat gudang berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil riwayat gudang', null, 500);
  }
};

export const getLowStockRecommendations = async (req: Request, res: Response) => {
  try {
    // Filter in-memory since Prisma can't compare two columns directly without raw SQL
    const all = await prisma.warehouseItem.findMany({
      where: { isActive: true },
      orderBy: { currentStock: 'asc' }
    });
    const filtered = all.filter(i => i.currentStock <= i.minStock);
    const recommendations = filtered.map(item => ({
      ...item,
      recommendedQty: Math.max(item.minStock * 2 - item.currentStock, item.minStock),
      priority: item.currentStock === 0 ? 'HIGH' : item.currentStock <= item.minStock / 2 ? 'HIGH' : 'MEDIUM'
    }));
    return successResponse(res, recommendations, 'Rekomendasi belanja berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil rekomendasi', null, 500);
  }
};

export const deleteItem = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = user.role?.name || user.role;
    const division = user.division?.name || user.division;
    const id = String(req.params.id);

    if (role !== 'CEO' && division !== 'PURCHASING') {
      return errorResponse(res, 'Hanya Purchasing dan CEO yang boleh menghapus barang gudang', null, 403);
    }

    const item = await prisma.warehouseItem.findFirst({
      where: { id, isActive: true }
    });

    if (!item) {
      return errorResponse(res, 'Barang tidak ditemukan', null, 404);
    }

    const updated = await prisma.warehouseItem.update({
      where: { id },
      data: { isActive: false }
    });

    await writeAuditLog(req, 'DELETE', 'WAREHOUSE_ITEM', `Master barang gudang dinonaktifkan: ${item.name}`);
    return successResponse(res, updated, 'Barang gudang berhasil dihapus dari daftar aktif');
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal menghapus barang gudang', null, 500);
  }
};

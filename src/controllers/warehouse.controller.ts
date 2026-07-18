import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { StockMovementType } from '@prisma/client';

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
    const { code, name, category, minStock, currentStock, unit } = req.body;
    if (!code || !name || !category || !unit) {
      return errorResponse(res, 'Kode, nama, kategori, dan unit barang wajib diisi', null, 400);
    }

    const item = await prisma.warehouseItem.create({
      data: {
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        category: String(category).trim(),
        minStock: Number(minStock || 0),
        currentStock: Number(currentStock || 0),
        unit: String(unit).trim()
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

      return movement;
    });

        await writeAuditLog(req, 'CREATE', 'WAREHOUSE', 'Pergerakan stok gudang dicatat: ' + type);
    return successResponse(res, result, `Stok ${type} berhasil dicatat`);
  } catch (error) {
    return errorResponse(res, error instanceof Error ? error.message : 'Gagal mencatat pergerakan stok', null, 500);
  }
};

export const getMovements = async (req: Request, res: Response) => {
  try {
    const movements = await prisma.warehouseMovement.findMany({
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

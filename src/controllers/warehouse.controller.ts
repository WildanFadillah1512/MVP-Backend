import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { StockMovementType } from '@prisma/client';

export const getItems = async (req: Request, res: Response) => {
  try {
    const items = await prisma.warehouseItem.findMany({
      orderBy: { name: 'asc' }
    });
    return successResponse(res, items, 'Data gudang berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data gudang', null, 500);
  }
};

export const createMovement = async (req: Request, res: Response) => {
  try {
    const { warehouseItemId, type, quantity, notes } = req.body;
    const qty = Number(quantity);

    const result = await prisma.$transaction(async (tx) => {
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
    return errorResponse(res, 'Gagal mencatat pergerakan stok', null, 500);
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
    const lowStockItems = await prisma.warehouseItem.findMany({
      where: {
        currentStock: { lte: prisma.warehouseItem.fields.minStock }
      },
      orderBy: { currentStock: 'asc' }
    });
    // Filter in-memory since Prisma can't compare two columns directly without raw SQL
    const all = await prisma.warehouseItem.findMany({ orderBy: { currentStock: 'asc' } });
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

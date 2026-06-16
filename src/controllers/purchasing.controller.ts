import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

// Needs
export const createNeed = async (req: Request, res: Response) => {
  try {
    const { itemName, quantity, priority, notes } = req.body;
    const need = await prisma.shoppingNeed.create({
      data: {
        itemName,
        quantity: Number(quantity),
        priority,
        notes,
        status: 'NEEDED'
      }
    });
        await writeAuditLog(req, 'CREATE', 'PURCHASING', 'Kebutuhan belanja ditambahkan');
    return successResponse(res, need, 'Kebutuhan belanja berhasil ditambahkan');
  } catch (error) {
    return errorResponse(res, 'Gagal menambahkan kebutuhan', null, 500);
  }
};

export const getNeeds = async (req: Request, res: Response) => {
  try {
    const needs = await prisma.shoppingNeed.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return successResponse(res, needs, 'Data kebutuhan belanja berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data', null, 500);
  }
};

export const updateNeedStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const need = await prisma.shoppingNeed.update({
      where: { id },
      data: { status }
    });
    return successResponse(res, need, 'Status belanja berhasil diupdate');
  } catch (error) {
    return errorResponse(res, 'Gagal update status', null, 500);
  }
};

// Purchase Notes
export const createPurchase = async (req: Request, res: Response) => {
  try {
    const { itemName, quantity, unitPrice, supplier, date } = req.body;
    const qty = Number(quantity);
    const price = Number(unitPrice);
    
    const purchase = await prisma.purchaseNote.create({
      data: {
        itemName,
        quantity: qty,
        unitPrice: price,
        totalPrice: qty * price,
        supplier,
        date: new Date(date)
      }
    });
        await writeAuditLog(req, 'CREATE', 'PURCHASING', 'Catatan pembelian dicatat');
    return successResponse(res, purchase, 'Catatan pembelian berhasil ditambahkan');
  } catch (error) {
    return errorResponse(res, 'Gagal mencatat pembelian', null, 500);
  }
};

export const getPurchases = async (req: Request, res: Response) => {
  try {
    const purchases = await prisma.purchaseNote.findMany({
      orderBy: { date: 'desc' }
    });
    return successResponse(res, purchases, 'Data riwayat pembelian berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil riwayat', null, 500);
  }
};

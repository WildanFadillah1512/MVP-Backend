import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

export const getBranches = async (req: Request, res: Response) => {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { name: 'asc' }
    });
    return successResponse(res, branches, 'Data cabang berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil cabang', null, 500);
  }
};

export const createCashierReport = async (req: Request, res: Response) => {
  try {
    const { branchId, date, totalCash, totalTransfer, totalQris, totalExpense, notes } = req.body;
    
    const cash = Number(totalCash) || 0;
    const transfer = Number(totalTransfer) || 0;
    const qris = Number(totalQris) || 0;
    const expense = Number(totalExpense) || 0;
    
    const netTotal = (cash + transfer + qris) - expense;

    const report = await prisma.cashierReport.create({
      data: {
        branchId,
        date: new Date(date),
        totalCash: cash,
        totalTransfer: transfer,
        totalQris: qris,
        totalExpense: expense,
        netTotal,
        notes
      }
    });

        await writeAuditLog(req, 'CREATE', 'CASHIER', 'Laporan kasir harian dicatat');
    return successResponse(res, report, 'Laporan kasir berhasil disimpan');
  } catch (error) {
    return errorResponse(res, 'Gagal menyimpan laporan kasir', null, 500);
  }
};

export const getCashierReports = async (req: Request, res: Response) => {
  try {
    const reports = await prisma.cashierReport.findMany({
      include: { branch: true },
      orderBy: { date: 'desc' }
    });
    return successResponse(res, reports, 'Laporan kasir berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil laporan kasir', null, 500);
  }
};

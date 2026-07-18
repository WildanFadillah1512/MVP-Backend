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
    const { branchId, date, totalCash, totalTransfer, totalQris, totalExpense, depositProofUrl, notes, productsSold } = req.body;
    
    const cash = Number(totalCash) || 0;
    const transfer = Number(totalTransfer) || 0;
    const qris = Number(totalQris) || 0;
    const expense = Number(totalExpense) || 0;
    
    const netTotal = (cash + transfer + qris) - expense;

    const report = await prisma.$transaction(async (tx) => {
      const newReport = await tx.cashierReport.create({
        data: {
          branchId,
          date: new Date(date),
          totalCash: cash,
          totalTransfer: transfer,
          totalQris: qris,
          totalExpense: expense,
          netTotal,
          depositProofUrl: depositProofUrl || null,
          notes
        }
      });

      // Handle products sold/rejected
      if (productsSold && Array.isArray(productsSold)) {
        for (const item of productsSold) {
          if (item.productId && item.quantity > 0) {
            const movements = await tx.productStockMovement.findMany({
              where: { productId: item.productId },
              select: { type: true, quantity: true }
            });
            const availableStock = movements.reduce((sum, movement) => {
              if (movement.type === 'IN') return sum + movement.quantity;
              if (movement.type === 'OUT') return sum - movement.quantity;
              return sum;
            }, 0);
            const qty = Number(item.quantity);

            if (availableStock < qty) {
              const product = await tx.product.findUnique({ where: { id: item.productId } });
              throw new Error(`Stok produk ${product?.name || item.productId} tidak cukup. Sisa stok: ${availableStock}`);
            }

            await tx.productStockMovement.create({
              data: {
                productId: item.productId,
                type: 'OUT',
                quantity: qty,
                reference: `CASHIER-${newReport.id}`,
                notes: item.isReject ? 'Reject di Kasir/Cabang' : 'Terjual (Kasir)'
              }
            });
          }
        }
      }

      return newReport;
    });

    await writeAuditLog(req, 'CREATE', 'CASHIER', 'Laporan kasir harian dan penjualan dicatat');
    return successResponse(res, report, 'Laporan kasir berhasil disimpan');
  } catch (error) {
    return errorResponse(res, error instanceof Error ? error.message : 'Gagal menyimpan laporan kasir', null, 500);
  }
};

export const createBranch = async (req: Request, res: Response) => {
  try {
    const { code, name, address } = req.body;
    if (!code || !name) {
      return errorResponse(res, 'Kode dan nama cabang wajib diisi', null, 400);
    }

    const branch = await prisma.branch.create({
      data: {
        code: String(code).trim().toUpperCase(),
        name: String(name).trim(),
        address: address ? String(address).trim() : null
      }
    });

    await writeAuditLog(req, 'CREATE', 'BRANCH', `Cabang baru dibuat: ${branch.name}`);
    return successResponse(res, branch, 'Cabang berhasil dibuat', 201);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return errorResponse(res, 'Kode cabang sudah digunakan', null, 400);
    }
    return errorResponse(res, 'Gagal membuat cabang', null, 500);
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

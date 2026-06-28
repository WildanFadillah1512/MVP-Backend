// @ts-nocheck
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getCustomers = async (req: Request, res: Response) => {
  try {
    const customers = await prisma.erpCustomer.findMany();
    return successResponse(res, customers, 'Data CRM Pelanggan berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data', null, 500);
  }
};

export const getFinanceLedger = async (req: Request, res: Response) => {
  try {
    const ledger = await prisma.erpFinanceLedger.findMany({
      orderBy: { date: 'desc' }
    });
    return successResponse(res, ledger, 'Buku Besar Laba Rugi berhasil ditarik');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data', null, 500);
  }
};

export const unlockModule = async (req: Request, res: Response) => {
  try {
    const { module } = req.params;
    const config = await prisma.erpConfig.upsert({
      where: { moduleName: module },
      update: { isLocked: false },
      create: { moduleName: module, isLocked: false }
    });
    return successResponse(res, config, `Modul ${module} berhasil dibuka`);
  } catch (error) {
    return errorResponse(res, 'Gagal membuka modul', null, 500);
  }
};

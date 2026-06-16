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
      // Create record
      const newRecord = await tx.productionRecord.create({
        data: {
          productId,
          quantity: Number(quantity),
          date: new Date(date),
          notes
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

      return newRecord;
    });

        await writeAuditLog(req, 'CREATE', 'PRODUCTION', 'Laporan produksi baru dicatat');
    return successResponse(res, record, 'Laporan produksi berhasil disimpan');
  } catch (error) {
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

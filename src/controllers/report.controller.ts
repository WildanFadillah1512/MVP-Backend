import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { ReportStatus } from '@prisma/client';

export const createReport = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { description, output, obstacles, notes } = req.body;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Cek apakah sudah ada laporan hari ini
    const existingReport = await prisma.dailyReport.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    if (existingReport) {
      if (existingReport.status === ReportStatus.LOCKED) {
        return errorResponse(res, 'Laporan hari ini sudah terkunci', null, 400);
      }
      
      // Update existing
      const updatedReport = await prisma.dailyReport.update({
        where: { id: existingReport.id },
        data: {
          description,
          output,
          obstacles,
          notes,
          status: ReportStatus.SUBMITTED,
        },
      });
      return successResponse(res, updatedReport, 'Laporan berhasil diperbarui');
    }

    // Create new
    const report = await prisma.dailyReport.create({
      data: {
        userId,
        date: today,
        description,
        output,
        obstacles,
        notes,
        status: ReportStatus.SUBMITTED,
      },
    });

        await writeAuditLog(req, 'CREATE', 'DAILY_REPORT', 'Laporan harian disubmit');
    return successResponse(res, report, 'Laporan berhasil disubmit');
  } catch (error) {
    console.error('Create report error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat membuat laporan', null, 500);
  }
};

export const getMyReports = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const reports = await prisma.dailyReport.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 30,
    });

    return successResponse(res, reports, 'Data laporan berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

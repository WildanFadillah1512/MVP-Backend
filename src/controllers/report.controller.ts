// @ts-nocheck
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { ReportStatus } from '@prisma/client';

const TOP_MANAGEMENT = ['OWNER', 'CEO', 'ADMIN'];

const getSubordinateIds = async (userId: string) => {
  const ids = new Set<string>();
  let frontier = [userId];

  while (frontier.length > 0) {
    const reports = await prisma.user.findMany({
      where: { supervisorId: { in: frontier }, isActive: true, deletedAt: null },
      select: { id: true }
    });
    frontier = reports.map((u) => u.id).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }

  return [...ids];
};

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

export const getLockedReports = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const where: any = { status: ReportStatus.LOCKED };

    if (!TOP_MANAGEMENT.includes(actor.role) && actor.role !== 'GM') {
      const subordinateIds = await getSubordinateIds(actor.id);
      where.userId = { in: subordinateIds };
    }

    if (actor.role === 'GM') {
      where.user = { division: { name: { not: 'KASIR' } } };
    }

    const reports = await prisma.dailyReport.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            role: { select: { name: true } },
            division: { select: { name: true } }
          }
        }
      },
      orderBy: { date: 'desc' },
      take: 100
    });

    return successResponse(res, reports, 'Data laporan terkunci berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil laporan terkunci', null, 500);
  }
};

export const unlockReport = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { id } = req.params;

    const report = await prisma.dailyReport.findUnique({
      where: { id },
      include: { user: { include: { division: true } } }
    });

    if (!report) return errorResponse(res, 'Laporan tidak ditemukan', null, 404);
    if (report.status !== ReportStatus.LOCKED) {
      return errorResponse(res, 'Laporan tidak sedang terkunci', null, 400);
    }

    if (!TOP_MANAGEMENT.includes(actor.role)) {
      if (actor.role === 'GM' && report.user.division.name === 'KASIR') {
        return errorResponse(res, 'GM tidak dapat membuka laporan divisi KASIR/keuangan', null, 403);
      }

      if (actor.role !== 'GM') {
        const subordinateIds = await getSubordinateIds(actor.id);
        if (!subordinateIds.includes(report.userId)) {
          return errorResponse(res, 'Anda hanya dapat membuka laporan bawahan Anda', null, 403);
        }
      }
    }

    const unlocked = await prisma.dailyReport.update({
      where: { id },
      data: {
        status: ReportStatus.DRAFT,
        description: report.description === 'Locked by system due to 24h timeout' ? '' : report.description
      }
    });

    await prisma.notification.create({
      data: {
        userId: report.userId,
        title: 'Laporan Harian Dibuka',
        message: 'Laporan harian Anda sudah dibuka oleh atasan. Silakan lengkapi dan submit ulang.',
        type: 'INFO',
        link: '/daily-reports',
        isRead: false
      }
    });

    await writeAuditLog(req, 'UNLOCK', 'DAILY_REPORT', `Laporan harian ${report.user.name} tanggal ${report.date.toISOString().slice(0, 10)} dibuka`);
    return successResponse(res, unlocked, 'Laporan berhasil dibuka');
  } catch (error) {
    console.error('Unlock report error:', error);
    return errorResponse(res, 'Gagal membuka laporan', null, 500);
  }
};

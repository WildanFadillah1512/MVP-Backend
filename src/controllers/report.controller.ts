// @ts-nocheck
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { ReportStatus, StockMovementType } from '@prisma/client';
import { createBulkNotifications } from '../services/notification.service';

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
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { supervisor: true, division: true }
    });
    const { description, output, obstacles, notes, tasks } = req.body;
    
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

    let reportId = '';

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
      reportId = updatedReport.id;
    } else {
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
      reportId = report.id;
    }

    // Process tasks if provided
    if (tasks && Array.isArray(tasks) && tasks.length > 0) {
      for (const t of tasks) {
        const { taskType, taskId, targetAssignmentId, warehouseItemId, quantity, notes: taskNotes } = t;

        // Save DailyReportTask
        await prisma.dailyReportTask.create({
          data: {
            reportId,
            taskType,
            taskId,
            targetAssignmentId,
            warehouseItemId,
            quantity: quantity ? Number(quantity) : null,
            notes: taskNotes,
          }
        });

        // Auto-update related entities
        if (taskType === 'TASK' && taskId) {
          await prisma.task.update({
            where: { id: taskId },
            data: { status: 'IN_PROGRESS' }
          });
        } else if (taskType === 'TARGET' && targetAssignmentId && quantity) {
          await prisma.targetAssignment.update({
            where: { id: targetAssignmentId },
            data: { currentValue: { increment: Number(quantity) } }
          });
        } else if (taskType === 'STOCK_OUT' && warehouseItemId && quantity) {
          const qty = Number(quantity);
          const item = await prisma.warehouseItem.findFirst({
            where: { id: warehouseItemId, isActive: true }
          });
          if (!item) {
            return errorResponse(res, 'Barang gudang tidak ditemukan', null, 404);
          }
          if (item.currentStock < qty) {
            return errorResponse(res, `Stok ${item.name} tidak cukup. Sisa: ${item.currentStock}`, null, 400);
          }

          await prisma.warehouseMovement.create({
            data: {
              warehouseItemId,
              type: StockMovementType.OUT,
              quantity: qty,
              notes: `Terpakai oleh ${currentUser?.name || userId} (Laporan Harian)`
            }
          });
          await prisma.warehouseItem.update({
            where: { id: warehouseItemId },
            data: { currentStock: { decrement: qty } }
          });

          const targetUsers = await prisma.user.findMany({
            where: {
              isActive: true,
              deletedAt: null,
              OR: [
                { division: { name: 'GUDANG' } },
                { role: { name: { in: ['OWNER', 'CEO', 'ADMIN'] as any } } }
              ]
            },
            select: { id: true }
          });

          await createBulkNotifications(targetUsers.map((target) => ({
            userId: target.id,
            title: 'Pemakaian Barang Gudang',
            message: `${currentUser?.name || 'Staff'} memakai ${qty} ${item.unit} ${item.name} dari laporan harian.`,
            type: 'INFO',
            link: '/warehouse',
            metadata: { warehouseItemId, reportId }
          }))).catch(() => {});
        }
      }
    }

    if (currentUser?.supervisorId) {
      await createBulkNotifications([{
        userId: currentUser.supervisorId,
        title: 'Laporan Harian Disubmit',
        message: `${currentUser.name} sudah submit laporan harian.`,
        type: 'INFO',
        link: '/daily-reports',
        metadata: { reportId, userId }
      }]).catch(() => {});
    }

    await writeAuditLog(req, 'CREATE', 'DAILY_REPORT', 'Laporan harian disubmit');
    return successResponse(res, { id: reportId }, 'Laporan berhasil disubmit');
  } catch (error) {
    console.error('Create report error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat membuat laporan', null, 500);
  }
};

export const getMyReports = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
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

    const reports = await prisma.dailyReport.findMany({
      where: { userId, ...dateFilter },
      orderBy: { date: 'desc' },
      take: (startDate && endDate) ? undefined : 30,
    });

    return successResponse(res, reports, 'Data laporan berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

export const getLockedReports = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { startDate, endDate } = req.query;
    const where: any = { status: ReportStatus.LOCKED };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

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

export const getDailyReportTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Get all pending tasks assigned by CEO/OWNER to this user
    const ceoTasks = await prisma.task.findMany({
      where: {
        assignedTo: userId,
        status: { in: ['TODO', 'IN_PROGRESS'] },
        assigner: {
          role: {
            name: { in: ['CEO', 'OWNER'] }
          }
        },
        isArchived: false
      },
      include: {
        assigner: {
          select: { name: true, role: { select: { name: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, ceoTasks, 'Template laporan harian berhasil diambil');
  } catch (error) {
    console.error('Get daily report template error:', error);
    return errorResponse(res, 'Gagal mengambil template laporan', null, 500);
  }
};


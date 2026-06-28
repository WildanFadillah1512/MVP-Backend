// @ts-nocheck
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { AttendanceStatus, ReportStatus } from '@prisma/client';

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return successResponse(res, { notifications, unreadCount }, 'Notifikasi berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil notifikasi', null, 500);
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id } = req.params;

    await prisma.notification.updateMany({
      where: { id: id === 'all' ? undefined : id, userId },
      data: { isRead: true }
    });

    return successResponse(res, null, 'Notifikasi ditandai sudah dibaca');
  } catch (error) {
    return errorResponse(res, 'Gagal update notifikasi', null, 500);
  }
};

// Auto-generate warnings and send to users
export const generateSystemWarnings = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Warning: Stok menipis → kirim ke CEO + Admin + Gudang
    const lowStockItems = await prisma.warehouseItem.findMany();
    const lowItems = lowStockItems.filter(i => i.currentStock <= i.minStock);

    if (lowItems.length > 0) {
      const targetUsers = await prisma.user.findMany({
        where: {
          isActive: true, deletedAt: null,
          OR: [
            { role: { name: { in: ['CEO', 'ADMIN'] } } },
            { division: { name: 'GUDANG' } }
          ]
        }
      });

      for (const item of lowItems) {
        for (const user of targetUsers) {
          await prisma.notification.create({
            data: {
              userId: user.id,
              title: `⚠️ Stok Menipis: ${item.name}`,
              message: `Stok ${item.name} hanya tersisa ${item.currentStock} ${item.unit} (batas minimal: ${item.minStock} ${item.unit}). Segera restock!`,
              type: 'WARNING',
              isRead: false
            }
          });
        }
      }
    }

    // 2. Warning: Laporan harian belum diisi jam 15:00 WIB
    const hour = new Date().getHours();
    if (hour >= 15) {
      const usersNotReported = await prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          dailyReports: { none: { date: today } },
          attendances: { some: { date: today, status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TELAT] } } }
        }
      });

      for (const user of usersNotReported) {
        const existingNotif = await prisma.notification.findFirst({
          where: { userId: user.id, type: 'WARNING', createdAt: { gte: today } }
        });

        if (!existingNotif) {
          await prisma.notification.create({
            data: {
              userId: user.id,
              title: '📋 Laporan Harian Belum Diisi',
              message: 'Anda belum mengisi laporan harian. Laporan akan terkunci otomatis dalam 24 jam setelah hari kerja berakhir.',
              type: 'WARNING',
              isRead: false
            }
          });
        }
      }
    }

    console.log('[Notification] System warnings generated successfully');
  } catch (error) {
    console.error('[Notification] Error generating warnings:', error);
  }
};

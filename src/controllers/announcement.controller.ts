import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { createBulkNotifications } from '../services/notification.service';

export const getAnnouncements = async (req: Request, res: Response) => {
  try {
    const role = (req as any).user.role;
    const now = new Date();
    const where = ['OWNER', 'CEO', 'ADMIN'].includes(role)
      ? {}
      : {
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
        };

    const announcements = await prisma.announcement.findMany({
      where,
      include: { createdBy: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    return successResponse(res, announcements, 'Pengumuman berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil pengumuman', null, 500);
  }
};

export const getActivePopupAnnouncement = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        isPopup: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 3
    });

    return successResponse(res, announcements, 'Popup pengumuman berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil popup pengumuman', null, 500);
  }
};

export const createAnnouncement = async (req: Request, res: Response) => {
  try {
    const actorId = (req as any).user.id;
    const { title, message, fileUrl, fileName, isPopup = true, expiresAt } = req.body;

    if (!title || !message) {
      return errorResponse(res, 'Judul dan isi pengumuman wajib diisi', null, 400);
    }

    const announcement = await prisma.announcement.create({
      data: {
        title: String(title).trim(),
        message: String(message).trim(),
        fileUrl: fileUrl ? String(fileUrl).trim() : null,
        fileName: fileName ? String(fileName).trim() : null,
        isPopup: Boolean(isPopup),
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdById: actorId
      },
      include: { createdBy: { select: { id: true, name: true, role: true } } }
    });

    const targetUsers = await prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true }
    });

    await createBulkNotifications(targetUsers.map((user) => ({
      userId: user.id,
      title: announcement.title,
      message: announcement.message,
      type: 'ANNOUNCEMENT',
      link: '/notifications',
      metadata: { announcementId: announcement.id }
    }))).catch(() => {});

    await writeAuditLog(req, 'CREATE', 'ANNOUNCEMENT', `Pengumuman dibuat: ${announcement.title}`);
    return successResponse(res, announcement, 'Pengumuman berhasil dibuat dan dikirim ke semua karyawan', 201);
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal membuat pengumuman', null, 500);
  }
};

export const updateAnnouncement = async (req: Request, res: Response) => {
  try {
    const { title, message, fileUrl, fileName, isPopup, isActive, expiresAt } = req.body;
    const announcement = await prisma.announcement.update({
      where: { id: req.params.id as string },
      data: {
        ...(title !== undefined ? { title: String(title).trim() } : {}),
        ...(message !== undefined ? { message: String(message).trim() } : {}),
        ...(fileUrl !== undefined ? { fileUrl: fileUrl ? String(fileUrl).trim() : null } : {}),
        ...(fileName !== undefined ? { fileName: fileName ? String(fileName).trim() : null } : {}),
        ...(isPopup !== undefined ? { isPopup: Boolean(isPopup) } : {}),
        ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {})
      }
    });

    await writeAuditLog(req, 'UPDATE', 'ANNOUNCEMENT', `Pengumuman diperbarui: ${announcement.title}`);
    return successResponse(res, announcement, 'Pengumuman berhasil diperbarui');
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal memperbarui pengumuman', null, 500);
  }
};

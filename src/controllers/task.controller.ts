// @ts-nocheck
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { createNotification } from '../services/notification.service';

const getUserRole = (user: any) => user.role?.name || user.role;

export const getTasks = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.id;
    const role = getUserRole(user);
    
    // CEO/OWNER/ADMIN/GM see all tasks. Manager sees tasks they assigned + tasks for their subordinates.
    // Staff sees only tasks assigned to them.
    let tasks;
    if (['OWNER', 'CEO', 'ADMIN', 'GM'].includes(role)) {
      tasks = await prisma.task.findMany({ orderBy: { createdAt: 'desc' } });
    } else if (role === 'MANAGER') {
      tasks = await prisma.task.findMany({
        where: { OR: [{ assignedBy: userId }, { assignedTo: userId }] },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      tasks = await prisma.task.findMany({
        where: { assignedTo: userId },
        orderBy: { createdAt: 'desc' }
      });
    }

    // Enrich with user info
    const userIds = [...new Set(tasks.flatMap(t => [t.assignedTo, t.assignedBy]))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: { select: { name: true } }, division: { select: { name: true } } }
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const enriched = tasks.map(t => ({
      ...t,
      assignee: userMap[t.assignedTo],
      assigner: userMap[t.assignedBy]
    }));

    return successResponse(res, enriched, 'Data tugas berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil tugas', null, 500);
  }
};

export const createTask = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const assignedById = user.id;
    const role = getUserRole(user);
    const { title, description, assignedTo, priority, dueDate } = req.body;

    if (!title || !assignedTo) {
      return errorResponse(res, 'Judul dan penerima tugas wajib diisi', null, 400);
    }

    if (role === 'MANAGER') {
      const assignee = await prisma.user.findFirst({
        where: { id: assignedTo, supervisorId: assignedById, isActive: true, deletedAt: null }
      });
      if (!assignee) {
        return errorResponse(res, 'Manager hanya dapat menugaskan pekerjaan ke bawahan langsungnya', null, 403);
      }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        assignedTo,
        assignedBy: assignedById,
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null
      }
    });

    await writeAuditLog(req, 'CREATE', 'TASK', `Task baru dibuat: ${title}`);
    await createNotification({
      userId: assignedTo,
      title: 'Tugas Baru',
      message: `Anda mendapat tugas baru: ${title}`,
      type: 'TASK',
      link: '/tasks',
      metadata: { taskId: task.id }
    }).catch(() => {});
    return successResponse(res, task, 'Tugas berhasil dibuat', 201);
  } catch (error) {
    return errorResponse(res, 'Gagal membuat tugas', null, 500);
  }
};

export const updateTaskStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const user = (req as any).user;
    const userId = user.id;
    const role = getUserRole(user);

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) return errorResponse(res, 'Tugas tidak ditemukan', null, 404);

    // Only assignee, assigner, or admin-level can update status
    if (!['OWNER', 'CEO', 'ADMIN', 'GM', 'MANAGER'].includes(role) && task.assignedTo !== userId) {
      return errorResponse(res, 'Anda tidak berwenang mengubah tugas ini', null, 403);
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'COMPLETED' ? new Date() : null
      }
    });

    await writeAuditLog(req, 'UPDATE', 'TASK', `Status task "${task.title}" diubah ke ${status}`);
    if (status === 'COMPLETED' && task.assignedBy !== userId) {
      await createNotification({
        userId: task.assignedBy,
        title: 'Tugas Selesai',
        message: `Tugas "${task.title}" sudah ditandai selesai.`,
        type: 'TASK',
        link: '/tasks',
        metadata: { taskId: task.id }
      }).catch(() => {});
    }
    return successResponse(res, updated, 'Status tugas berhasil diupdate');
  } catch (error) {
    return errorResponse(res, 'Gagal mengupdate status', null, 500);
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user.id;
    const role = getUserRole(user);
    const where: any = { isActive: true, deletedAt: null };

    if (role === 'MANAGER') {
      where.supervisorId = userId;
    } else if (role === 'GM') {
      where.division = { name: { not: 'KASIR' } };
      where.role = { name: { in: ['MANAGER', 'LEADER', 'STAFF'] } };
    }

    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, role: { select: { name: true } }, division: { select: { name: true } } },
      orderBy: { name: 'asc' }
    });
    return successResponse(res, users, 'Data user berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data user', null, 500);
  }
};

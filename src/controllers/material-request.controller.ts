import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { createBulkNotifications, createNotification } from '../services/notification.service';
import { getIO } from '../socket';

const getRole = (user: any) => user.role?.name || user.role;
const getDivision = (user: any) => user.division?.name || user.division;

const getOrCreateProductionWarehouseGroup = async () => {
  let group = await prisma.chatGroup.findFirst({
    where: { name: 'Produksi - Gudang' }
  });

  if (!group) {
    group = await prisma.chatGroup.create({
      data: {
      name: 'Produksi - Gudang',
      description: 'Koordinasi request bahan dan pesanan antara Produksi dan Gudang'
      }
    });
    }

  const members = await prisma.user.findMany({
    where: {
      OR: [
        { division: { name: { in: ['PRODUKSI', 'GUDANG'] } } },
        { role: { name: { in: ['CEO', 'OWNER', 'ADMIN'] as any } } }
      ],
      isActive: true,
      deletedAt: null
    },
    select: { id: true }
  });

  await prisma.chatGroupMember.createMany({
    data: members.map((member) => ({ groupId: group.id, userId: member.id })),
    skipDuplicates: true
  });

  return group;
};

export const getMaterialRequests = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getRole(user);
    const division = getDivision(user);
    const where: any = {};

    if (!['OWNER', 'CEO', 'ADMIN', 'GM'].includes(role) && division === 'PRODUKSI') {
      where.requestedById = user.id;
    } else if (!['OWNER', 'CEO', 'ADMIN', 'GM'].includes(role) && division !== 'GUDANG') {
      where.id = '__no_access__';
    }

    const requests = await prisma.materialRequest.findMany({
      where,
      include: {
        item: true,
        requestedBy: { select: { id: true, name: true, role: true, division: true, branch: true } },
        handledBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, requests, 'Request bahan berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil request bahan', null, 500);
  }
};

export const createMaterialRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getRole(user);
    const division = getDivision(user);
    const { warehouseItemId, quantity, purpose, notes } = req.body;

    const canRequest =
      ['OWNER', 'CEO', 'ADMIN'].includes(role) ||
      (division === 'PRODUKSI' && ['LEADER', 'MANAGER'].includes(role));

    if (!canRequest) {
      return errorResponse(res, 'Hanya Leader/Manager Produksi atau CEO/Admin yang dapat request bahan', null, 403);
    }

    if (!warehouseItemId || !quantity || !purpose) {
      return errorResponse(res, 'Bahan, jumlah, dan tujuan pemakaian wajib diisi', null, 400);
    }

    const request = await prisma.materialRequest.create({
      data: {
        requestedById: user.id,
        warehouseItemId,
        quantity: Number(quantity),
        purpose: String(purpose).trim(),
        notes: notes ? String(notes).trim() : null
      },
      include: { item: true, requestedBy: { select: { name: true } } }
    });

    const targetUsers = await prisma.user.findMany({
      where: {
        OR: [
          { division: { name: 'GUDANG' } },
          { role: { name: { in: ['CEO', 'OWNER', 'ADMIN'] as any } } }
        ],
        isActive: true,
        deletedAt: null
      },
      select: { id: true }
    });

    await createBulkNotifications(targetUsers.map((target) => ({
      userId: target.id,
      title: 'Request Bahan Produksi',
      message: `${request.requestedBy.name} request ${request.quantity} ${request.item.unit} ${request.item.name} untuk ${request.purpose}.`,
      type: 'INFO',
      link: '/material-requests',
      metadata: { materialRequestId: request.id }
    })));

    const group = await getOrCreateProductionWarehouseGroup();
    const chatMessage = await prisma.chatMessage.create({
      data: {
        groupId: group.id,
        senderId: user.id,
        content: `Request bahan: ${request.quantity} ${request.item.unit} ${request.item.name} untuk ${request.purpose}.`
      },
      include: {
        sender: { select: { id: true, name: true, role: { select: { name: true } } } }
      }
    });

    try {
      getIO().to(group.id).emit('new-message', chatMessage);
    } catch {
      // Socket may not be initialized in tests or one-off scripts.
    }

    await writeAuditLog(req, 'CREATE', 'MATERIAL_REQUEST', `Request bahan dibuat: ${request.item.name} x ${request.quantity}`);
    return successResponse(res, request, 'Request bahan berhasil dikirim ke Gudang', 201);
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal membuat request bahan', null, 500);
  }
};

export const fulfillMaterialRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getRole(user);
    const division = getDivision(user);
    const id = String(req.params.id);

    if (division !== 'GUDANG' && !['OWNER', 'CEO', 'ADMIN'].includes(role)) {
      return errorResponse(res, 'Hanya Gudang atau CEO/Admin yang dapat memproses request bahan', null, 403);
    }

    const request = await prisma.$transaction(async (tx) => {
      const existing = await tx.materialRequest.findUnique({
        where: { id },
        include: { item: true, requestedBy: true }
      });
      if (!existing) throw new Error('Request bahan tidak ditemukan');
      if (existing.status !== 'PENDING') throw new Error('Request bahan sudah diproses');
      if (existing.item.currentStock < existing.quantity) {
        throw new Error(`Stok ${existing.item.name} tidak cukup. Sisa: ${existing.item.currentStock}`);
      }

      await tx.warehouseItem.update({
        where: { id: existing.warehouseItemId },
        data: { currentStock: { decrement: existing.quantity } }
      });

      await tx.warehouseMovement.create({
        data: {
          warehouseItemId: existing.warehouseItemId,
          type: 'OUT',
          quantity: existing.quantity,
          notes: `Fulfill request produksi: ${existing.purpose}`
        }
      });

      return tx.materialRequest.update({
        where: { id },
        data: {
          status: 'FULFILLED',
          handledById: user.id,
          handledAt: new Date()
        },
        include: { item: true, requestedBy: true }
      });
    });

    await createNotification({
      userId: request.requestedById,
      title: 'Request Bahan Dipenuhi',
      message: `Request ${request.item.name} sudah dipenuhi Gudang.`,
      type: 'INFO',
      link: '/material-requests',
      metadata: { materialRequestId: request.id }
    }).catch(() => {});

    await writeAuditLog(req, 'UPDATE', 'MATERIAL_REQUEST', `Request bahan dipenuhi: ${request.item.name} x ${request.quantity}`);
    return successResponse(res, request, 'Request bahan berhasil dipenuhi dan stok gudang berkurang');
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal memproses request bahan', null, 500);
  }
};

export const rejectMaterialRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getRole(user);
    const division = getDivision(user);
    const id = String(req.params.id);

    if (division !== 'GUDANG' && !['OWNER', 'CEO', 'ADMIN'].includes(role)) {
      return errorResponse(res, 'Hanya Gudang atau CEO/Admin yang dapat menolak request bahan', null, 403);
    }

    const request = await prisma.materialRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        handledById: user.id,
        handledAt: new Date(),
        notes: req.body.notes ? String(req.body.notes).trim() : undefined
      },
      include: { item: true }
    });

    await createNotification({
      userId: request.requestedById,
      title: 'Request Bahan Ditolak',
      message: `Request ${request.item.name} ditolak Gudang.`,
      type: 'WARNING',
      link: '/material-requests',
      metadata: { materialRequestId: request.id }
    }).catch(() => {});

    return successResponse(res, request, 'Request bahan ditolak');
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal menolak request bahan', null, 500);
  }
};

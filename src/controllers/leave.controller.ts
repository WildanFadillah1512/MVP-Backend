// @ts-nocheck
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { LeaveStatus } from '@prisma/client';

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

export const createLeaveRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate, reason } = req.body;
    
    // Check leave balance
    const balance = await prisma.leaveBalance.findUnique({
      where: { userId }
    });

    if (!balance) {
      return errorResponse(res, 'Data saldo cuti tidak ditemukan', null, 400);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const remainingQuota = balance.totalQuota - balance.usedQuota;

    if (requestedDays > remainingQuota) {
      return errorResponse(res, `Kuota cuti tidak cukup. Sisa kuota Anda: ${remainingQuota} hari`, null, 400);
    }

    const request = await prisma.leaveRequest.create({
      data: {
        userId,
        startDate: start,
        endDate: end,
        reason,
        status: LeaveStatus.PENDING,
      }
    });

        await writeAuditLog(req, 'CREATE', 'LEAVE', 'Pengajuan cuti dibuat');
    return successResponse(res, request, 'Pengajuan cuti berhasil dibuat. Menunggu persetujuan atasan.');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan saat mengajukan cuti', null, 500);  }
};

export const getMyLeaves = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { startDate, endDate } = req.query;
    
    let filter: any = { userId };
    if (startDate && endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = {
        gte: new Date(startDate as string),
        lte: end
      };
    }

    const balance = await prisma.leaveBalance.findUnique({
      where: { userId }
    });

    const requests = await prisma.leaveRequest.findMany({
      where: filter,
      include: {
        cancellationRequests: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, { balance, requests }, 'Data cuti berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

export const getTeamLeaves = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { startDate, endDate } = req.query;
    const where: any = {};

    if (startDate && endDate) {
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: end
      };
    }

    if (TOP_MANAGEMENT.includes(actor.role)) {
      // CEO/Owner/Admin can review all.
    } else if (actor.role === 'GM') {
      where.user = { division: { name: { not: 'KASIR' } } };
    } else {
      const subordinateIds = await getSubordinateIds(actor.id);
      where.userId = { in: subordinateIds };
    }
    
    // Get subordinates leaves
    const requests = await prisma.leaveRequest.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, division: true, role: true }
        },
        cancellationRequests: {
          where: { status: LeaveStatus.PENDING },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, requests, 'Data cuti tim berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

export const approveLeave = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const approverId = actor.id;
    const { id } = req.params;
    const { status } = req.body; // APPROVED or REJECTED

    if (![LeaveStatus.APPROVED, LeaveStatus.REJECTED].includes(status)) {
      return errorResponse(res, 'Status tidak valid', null, 400);
    }

    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: { include: { division: true, role: true } },
        cancellationRequests: true
      }
    });

    if (!request) return errorResponse(res, 'Pengajuan tidak ditemukan', null, 404);
    if (request.cancellationRequests.some((item) => item.status === LeaveStatus.PENDING)) {
      return errorResponse(res, 'Cuti ini sedang memiliki pengajuan pembatalan. Proses pembatalannya terlebih dahulu.', null, 400);
    }
    if (request.status !== LeaveStatus.PENDING) {
      return errorResponse(res, 'Pengajuan sudah diproses sebelumnya', null, 400);
    }

    if (!TOP_MANAGEMENT.includes(actor.role)) {
      if (actor.role === 'GM') {
        if (request.user.division.name === 'KASIR') {
          return errorResponse(res, 'GM tidak dapat menyetujui cuti divisi KASIR/keuangan', null, 403);
        }
      } else {
        const subordinateIds = await getSubordinateIds(actor.id);
        if (!subordinateIds.includes(request.userId)) {
          return errorResponse(res, 'Anda hanya dapat memproses cuti bawahan Anda', null, 403);
        }
      }
    }

    // Process approval

    // Process approval
    const result = await prisma.$transaction(async (tx) => {
      const updatedReq = await tx.leaveRequest.update({
        where: { id },
        data: { status, approverId }
      });

      // Deduct quota if approved
      if (status === LeaveStatus.APPROVED) {
        const start = new Date(request.startDate);
        const end = new Date(request.endDate);
        const requestedDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        await tx.leaveBalance.update({
          where: { userId: request.userId },
          data: {
            usedQuota: { increment: requestedDays }
          }
        });
      }
      return updatedReq;
    });

    return successResponse(res, result, `Pengajuan cuti berhasil di-${status.toLowerCase()}`);
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan saat memproses cuti', null, 500);
  }
};

export const cancelLeave = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { id } = req.params;
    const { reason } = req.body;

    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: { include: { supervisor: true } }, cancellationRequests: true }
    });

    if (!request) return errorResponse(res, 'Pengajuan tidak ditemukan', null, 404);
    
    // Only the user who requested it can cancel it
    if (request.userId !== actor.id) {
      return errorResponse(res, 'Anda hanya dapat membatalkan cuti Anda sendiri', null, 403);
    }

    if (request.status === LeaveStatus.REJECTED || request.status === LeaveStatus.CANCELLED) {
      return errorResponse(res, `Tidak dapat membatalkan cuti yang sudah berstatus ${request.status}`, null, 400);
    }

    const pendingCancellation = request.cancellationRequests.find((item) => item.status === LeaveStatus.PENDING);
    if (pendingCancellation) {
      return errorResponse(res, 'Pembatalan cuti ini sudah menunggu persetujuan atasan', null, 400);
    }

    const cancellation = await prisma.leaveCancellationRequest.create({
      data: {
        leaveRequestId: id,
        userId: actor.id,
        reason: reason ? String(reason).trim() : null
      }
    });

    // Notify supervisor/manager about the cancellation
    const supervisorId = request.user.supervisorId;
    if (supervisorId) {
      await prisma.notification.create({
        data: {
          userId: supervisorId,
          title: 'Pembatalan Cuti Menunggu Approval',
          message: `${actor.name} mengajukan pembatalan cuti tanggal ${new Date(request.startDate).toLocaleDateString('id-ID')}.`,
          type: 'INFO',
          link: '/leave',
          metadata: JSON.stringify({ leaveRequestId: id, cancellationRequestId: cancellation.id })
        }
      });
    }

    return successResponse(res, cancellation, 'Pengajuan pembatalan cuti dikirim. Menunggu persetujuan atasan.');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan saat membatalkan cuti', null, 500);
  }
};

export const approveLeaveCancellation = async (req: Request, res: Response) => {
  try {
    const actor = (req as any).user;
    const { id } = req.params;
    const { status, notes } = req.body;

    if (![LeaveStatus.APPROVED, LeaveStatus.REJECTED].includes(status)) {
      return errorResponse(res, 'Status tidak valid', null, 400);
    }

    const cancellation = await prisma.leaveCancellationRequest.findUnique({
      where: { id },
      include: {
        leaveRequest: { include: { user: { include: { division: true } } } }
      }
    });

    if (!cancellation) return errorResponse(res, 'Pengajuan pembatalan tidak ditemukan', null, 404);
    if (cancellation.status !== LeaveStatus.PENDING) {
      return errorResponse(res, 'Pengajuan pembatalan sudah diproses sebelumnya', null, 400);
    }

    const leave = cancellation.leaveRequest;
    if (!TOP_MANAGEMENT.includes(actor.role)) {
      if (actor.role === 'GM') {
        if (leave.user.division.name === 'KASIR') {
          return errorResponse(res, 'GM tidak dapat memproses cuti divisi KASIR/keuangan', null, 403);
        }
      } else {
        const subordinateIds = await getSubordinateIds(actor.id);
        if (!subordinateIds.includes(leave.userId)) {
          return errorResponse(res, 'Anda hanya dapat memproses cuti bawahan Anda', null, 403);
        }
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const updatedCancellation = await tx.leaveCancellationRequest.update({
        where: { id },
        data: {
          status,
          reviewerId: actor.id,
          reviewedAt: new Date(),
          notes: notes ? String(notes).trim() : null
        }
      });

      if (status === LeaveStatus.APPROVED) {
        await tx.leaveRequest.update({
          where: { id: leave.id },
          data: { status: LeaveStatus.CANCELLED, approverId: actor.id }
        });

        if (leave.status === LeaveStatus.APPROVED) {
          const start = new Date(leave.startDate);
          const end = new Date(leave.endDate);
          const requestedDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          await tx.leaveBalance.update({
            where: { userId: leave.userId },
            data: { usedQuota: { decrement: requestedDays } }
          });
        }
      }

      return updatedCancellation;
    });

    await prisma.notification.create({
      data: {
        userId: leave.userId,
        title: status === LeaveStatus.APPROVED ? 'Pembatalan Cuti Disetujui' : 'Pembatalan Cuti Ditolak',
        message: status === LeaveStatus.APPROVED
          ? 'Pengajuan pembatalan cuti Anda sudah disetujui.'
          : 'Pengajuan pembatalan cuti Anda ditolak.',
        type: 'INFO',
        link: '/leave',
        metadata: JSON.stringify({ leaveRequestId: leave.id, cancellationRequestId: id })
      }
    }).catch(() => {});

    return successResponse(res, result, `Pembatalan cuti berhasil di-${status.toLowerCase()}`);
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan saat memproses pembatalan cuti', null, 500);
  }
};

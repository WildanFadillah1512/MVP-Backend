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
    return errorResponse(res, 'Terjadi kesalahan saat mengajukan cuti', null, 500);
  }
};

export const getMyLeaves = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const balance = await prisma.leaveBalance.findUnique({
      where: { userId }
    });

    const requests = await prisma.leaveRequest.findMany({
      where: { userId },
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
    const where: any = {};

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
      include: { user: { include: { division: true, role: true } } }
    });

    if (!request) return errorResponse(res, 'Pengajuan tidak ditemukan', null, 404);
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

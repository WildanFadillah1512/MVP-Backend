import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { LeaveStatus } from '@prisma/client';

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
    const userId = (req as any).user.id;
    
    // Get subordinates leaves
    const requests = await prisma.leaveRequest.findMany({
      where: {
        user: {
          supervisorId: userId
        }
      },
      include: {
        user: {
          select: { name: true, email: true, division: true }
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
    const approverId = (req as any).user.id;
    const { id } = req.params;
    const { status } = req.body; // APPROVED or REJECTED

    if (![LeaveStatus.APPROVED, LeaveStatus.REJECTED].includes(status)) {
      return errorResponse(res, 'Status tidak valid', null, 400);
    }

    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: { user: true }
    });

    if (!request) return errorResponse(res, 'Pengajuan tidak ditemukan', null, 404);
    if (request.status !== LeaveStatus.PENDING) {
      return errorResponse(res, 'Pengajuan sudah diproses sebelumnya', null, 400);
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

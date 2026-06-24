import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

export const createOvertimeRequest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { date, startTime, endTime, reason, notes } = req.body;

    if (!date || !startTime || !endTime || !reason) {
      return errorResponse(res, 'Tanggal, waktu mulai, waktu selesai, dan alasan wajib diisi', null, 400);
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const totalHours = Math.max(0, (end.getTime() - start.getTime()) / 1000 / 3600);

    const record = await prisma.overtimeRecord.create({
      data: {
        userId,
        date: new Date(date),
        startTime: start,
        endTime: end,
        totalHours,
        reason,
        notes,
        status: 'PENDING'
      }
    });

    await writeAuditLog(req, 'CREATE', 'OVERTIME', `Pengajuan lembur ${date} selama ${totalHours.toFixed(1)} jam`);
    return successResponse(res, record, 'Pengajuan lembur berhasil dikirim', 201);
  } catch (error) {
    console.error(error);
    return errorResponse(res, 'Gagal mengajukan lembur', null, 500);
  }
};

export const getMyOvertimeRecords = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const records = await prisma.overtimeRecord.findMany({
      where: { userId },
      orderBy: { date: 'desc' }
    });
    return successResponse(res, records, 'Data lembur berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data lembur', null, 500);
  }
};

export const updateOvertimeStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const approverId = (req as any).user.id;

    const record = await prisma.overtimeRecord.update({
      where: { id },
      data: { status, approverId }
    });

    await writeAuditLog(req, 'UPDATE', 'OVERTIME', `Status lembur diubah ke ${status}`);
    return successResponse(res, record, 'Status lembur berhasil diperbarui');
  } catch (error) {
    return errorResponse(res, 'Gagal memperbarui status lembur', null, 500);
  }
};

export const getAllOvertimeRecords = async (req: Request, res: Response) => {
  try {
    const records = await prisma.overtimeRecord.findMany({
      include: { user: { select: { name: true, id: true, division: { select: { name: true } } } } },
      orderBy: { date: 'desc' }
    });
    return successResponse(res, records, 'Semua data lembur berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data lembur', null, 500);
  }
};

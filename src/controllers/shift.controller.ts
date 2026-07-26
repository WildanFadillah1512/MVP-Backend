import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';

const DEFAULT_SHIFTS = [
  { name: 'Pagi', startTime: '07:00', endTime: '15:00' },
  { name: 'Middle', startTime: '11:00', endTime: '19:00' },
  { name: 'Malam', startTime: '19:00', endTime: '03:00' }
];

const ensureDefaultShifts = async () => {
  await Promise.all(DEFAULT_SHIFTS.map((shift) => prisma.shift.upsert({
    where: { name: shift.name },
    update: {},
    create: shift
  })));
};

export const getShifts = async (req: Request, res: Response) => {
  try {
    await ensureDefaultShifts();
    const shifts = await prisma.shift.findMany({ orderBy: { name: 'asc' } });
    return successResponse(res, shifts, 'Data shift berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan saat mengambil shift', null, 500);
  }
};

export const createShift = async (req: Request, res: Response) => {
  try {
    const { name, startTime, endTime } = req.body;
    if (!['Pagi', 'Middle', 'Malam'].includes(name)) {
      return errorResponse(res, 'Shift hanya boleh Pagi, Middle, atau Malam', null, 400);
    }
    const shift = await prisma.shift.create({
      data: { name, startTime, endTime }
    });
    return successResponse(res, shift, 'Shift berhasil dibuat');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan saat membuat shift', null, 500);
  }
};

export const updateShift = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, startTime, endTime } = req.body;
    if (name && !['Pagi', 'Middle', 'Malam'].includes(name)) {
      return errorResponse(res, 'Shift hanya boleh Pagi, Middle, atau Malam', null, 400);
    }
    const shift = await prisma.shift.update({
      where: { id },
      data: { name, startTime, endTime }
    });
    return successResponse(res, shift, 'Shift berhasil diupdate');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan saat mengupdate shift', null, 500);
  }
};

export const deleteShift = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.shift.delete({ where: { id } });
    return successResponse(res, null, 'Shift berhasil dihapus');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan saat menghapus shift', null, 500);
  }
};

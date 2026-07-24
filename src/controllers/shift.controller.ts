import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getShifts = async (req: Request, res: Response) => {
  try {
    const shifts = await prisma.shift.findMany();
    return successResponse(res, shifts, 'Data shift berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan saat mengambil shift', null, 500);
  }
};

export const createShift = async (req: Request, res: Response) => {
  try {
    const { name, startTime, endTime } = req.body;
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

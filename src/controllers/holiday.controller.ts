import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getHolidays = async (req: Request, res: Response) => {
  try {
    const holidays = await prisma.holiday.findMany({
      orderBy: { date: 'desc' }
    });
    return successResponse(res, holidays, 'Data hari libur berhasil diambil');
  } catch (error) {
    console.error('Error fetching holidays:', error);
    return errorResponse(res, 'Terjadi kesalahan saat mengambil data hari libur', null, 500);
  }
};

export const createHoliday = async (req: Request, res: Response) => {
  try {
    const { date, name, description, workStartTime, workEndTime } = req.body;
    
    if (!date || !name) {
      return errorResponse(res, 'Tanggal dan nama hari libur wajib diisi', null, 400);
    }

    const existing = await prisma.holiday.findUnique({
      where: { date: new Date(date) }
    });

    if (existing) {
      return errorResponse(res, 'Hari libur pada tanggal tersebut sudah ada', null, 400);
    }

    const holiday = await prisma.holiday.create({
      data: {
        date: new Date(date),
        name,
        description,
        workStartTime: workStartTime || null,
        workEndTime: workEndTime || null
      }
    });

    return successResponse(res, holiday, 'Hari libur berhasil ditambahkan', 201);
  } catch (error) {
    console.error('Error creating holiday:', error);
    return errorResponse(res, 'Terjadi kesalahan saat menambahkan hari libur', null, 500);
  }
};

export const updateHoliday = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { date, name, description, workStartTime, workEndTime } = req.body;

    const holiday = await prisma.holiday.update({
      where: { id },
      data: {
        date: date ? new Date(date) : undefined,
        name,
        description,
        workStartTime: workStartTime !== undefined ? workStartTime : undefined,
        workEndTime: workEndTime !== undefined ? workEndTime : undefined
      }
    });

    return successResponse(res, holiday, 'Hari libur berhasil diperbarui');
  } catch (error) {
    console.error('Error updating holiday:', error);
    return errorResponse(res, 'Terjadi kesalahan saat memperbarui hari libur', null, 500);
  }
};

export const deleteHoliday = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.holiday.delete({
      where: { id }
    });
    return successResponse(res, null, 'Hari libur berhasil dihapus');
  } catch (error) {
    console.error('Error deleting holiday:', error);
    return errorResponse(res, 'Terjadi kesalahan saat menghapus hari libur', null, 500);
  }
};

import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';

export const getPaklarings = async (req: Request, res: Response) => {
  try {
    const paklarings = await prisma.paklaring.findMany({
      include: {
        employee: { select: { id: true, name: true, email: true } },
        issuedBy: { select: { id: true, name: true, role: { select: { name: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, paklarings, 'Data paklaring berhasil diambil');
  } catch (error) {
    console.error(error);
    return errorResponse(res, 'Gagal mengambil data paklaring', null, 500);
  }
};

export const createPaklaring = async (req: Request, res: Response) => {
  try {
    const issuedById = (req as any).user.id;
    const { employeeId, position, startDate, endDate, department, performance, notes } = req.body;

    if (!employeeId || !position || !startDate || !endDate || !department) {
      return errorResponse(res, 'Mohon lengkapi data wajib', null, 400);
    }

    // Generate letter number
    const count = await prisma.paklaring.count();
    const letterNumber = `SKP/${new Date().getFullYear()}/${(count + 1).toString().padStart(4, '0')}`;

    const paklaring = await prisma.paklaring.create({
      data: {
        employeeId,
        issuedById,
        position,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        department,
        performance,
        notes,
        letterNumber
      },
      include: {
        employee: { select: { name: true } }
      }
    });

    return successResponse(res, paklaring, 'Surat paklaring berhasil dibuat', 201);
  } catch (error) {
    console.error(error);
    return errorResponse(res, 'Gagal membuat surat paklaring', null, 500);
  }
};

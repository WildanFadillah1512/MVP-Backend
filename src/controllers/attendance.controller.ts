import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { AttendanceStatus } from '@prisma/client';

export const checkIn = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Cek apakah sudah absen hari ini
    const existingAttendance = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    if (existingAttendance) {
      return errorResponse(res, 'Anda sudah melakukan check-in hari ini', null, 400);
    }

    const now = new Date();
    const isLate = now.getHours() >= 9; // Misal masuk jam 9

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        date: today,
        checkIn: now,
        status: isLate ? AttendanceStatus.TELAT : AttendanceStatus.HADIR,
      },
    });

        await writeAuditLog(req, 'CHECK_IN', 'ATTENDANCE', 'Karyawan melakukan check-in');
    return successResponse(res, attendance, 'Check-in berhasil');
  } catch (error) {
    console.error('Check-in error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat check-in', null, 500);
  }
};

export const checkOut = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    if (!attendance) {
      return errorResponse(res, 'Anda belum melakukan check-in hari ini', null, 400);
    }

    if (attendance.checkOut) {
      return errorResponse(res, 'Anda sudah melakukan check-out hari ini', null, 400);
    }

    const now = new Date();
    const checkInTime = new Date(attendance.checkIn!);
    
    // Hitung total jam (dalam desimal)
    const diffMs = now.getTime() - checkInTime.getTime();
    const totalHours = diffMs / (1000 * 60 * 60);

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: now,
        totalHours: Number(totalHours.toFixed(2)),
      },
    });

        await writeAuditLog(req, 'CHECK_OUT', 'ATTENDANCE', 'Karyawan melakukan check-out');
    return successResponse(res, updatedAttendance, 'Check-out berhasil');
  } catch (error) {
    console.error('Check-out error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat check-out', null, 500);
  }
};

export const getMyAttendance = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const attendances = await prisma.attendance.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 30, // 30 hari terakhir
    });

    return successResponse(res, attendances, 'Data absensi berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { AttendanceStatus } from '@prisma/client';

const TOP_LEVEL_ROLES = ['OWNER', 'CEO', 'ADMIN'];

const getActor = async (req: Request) => {
  return prisma.user.findUnique({
    where: { id: (req as any).user.id },
    include: { role: true, division: true },
  });
};

const getSubordinateIds = async (userId: string) => {
  const ids = new Set<string>();
  let frontier = [userId];

  while (frontier.length > 0) {
    const reports = await prisma.user.findMany({
      where: { supervisorId: { in: frontier }, deletedAt: null, isActive: true },
      select: { id: true },
    });
    frontier = reports.map((user) => user.id).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }

  return [...ids];
};

const getManagedUserWhere = async (req: Request) => {
  const actor = await getActor(req);
  if (!actor) return null;

  if (TOP_LEVEL_ROLES.includes(actor.role.name)) return {};

  if (actor.role.name === 'GM') {
    return {
      role: { name: { in: ['MANAGER', 'LEADER', 'STAFF'] } },
      division: { name: { not: 'KASIR' } },
    };
  }

  if (['MANAGER', 'LEADER'].includes(actor.role.name)) {
    const subordinateIds = await getSubordinateIds(actor.id);
    return { id: { in: subordinateIds } };
  }

  return { id: actor.id };
};

// Helper: ambil tanggal "hari ini" dalam zona waktu WIB (UTC+7)
// Server Render berjalan di UTC, jadi kita harus offset manual
const getTodayWIB = (): Date => {
  const now = new Date();
  const wibOffset = 7 * 60 * 60 * 1000;
  const wibNow = new Date(now.getTime() + wibOffset);
  const today = new Date(Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate()));
  return today;
};

// Cek apakah jam >= 09:00 WIB
const isLateWIB = (): boolean => {
  const now = new Date();
  const wibOffset = 7 * 60 * 60 * 1000;
  const wibNow = new Date(now.getTime() + wibOffset);
  return wibNow.getUTCHours() >= 9;
};

export const checkIn = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { latitude, longitude } = req.body;
    
    if (latitude === undefined || longitude === undefined) {
      return errorResponse(res, 'Lokasi (GPS) wajib diaktifkan untuk melakukan absensi', null, 400);
    }

    const today = getTodayWIB();

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

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        date: today,
        checkIn: now,
        status: isLateWIB() ? AttendanceStatus.TELAT : AttendanceStatus.HADIR,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
            division: { select: { name: true } }
          }
        }
      }
    });

    // Save Location Log
    await prisma.locationLog.create({
      data: {
        userId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        activity: 'CHECK_IN',
        notes: `Check-in pukul ${now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
      }
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
    const { latitude, longitude } = req.body;

    if (latitude === undefined || longitude === undefined) {
      return errorResponse(res, 'Lokasi (GPS) wajib diaktifkan untuk melakukan absensi', null, 400);
    }

    const today = getTodayWIB();

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
    
    const diffMs = now.getTime() - checkInTime.getTime();
    const totalHours = diffMs / (1000 * 60 * 60);

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOut: now,
        totalHours: Number(totalHours.toFixed(2)),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
            division: { select: { name: true } }
          }
        }
      }
    });

    // Save Location Log
    await prisma.locationLog.create({
      data: {
        userId,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        activity: 'CHECK_OUT',
        notes: `Check-out pukul ${now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
      }
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
      take: 30,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
            division: { select: { name: true } }
          }
        }
      }
    });

    return successResponse(res, attendances, 'Data absensi berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

// Admin/Manager/CEO/Owner: lihat semua absensi hari ini
export const getAllAttendanceToday = async (req: Request, res: Response) => {
  try {
    const today = getTodayWIB();
    const managedUserWhere = await getManagedUserWhere(req);
    if (!managedUserWhere) return errorResponse(res, 'User login tidak valid', null, 401);
    
    const attendances = await prisma.attendance.findMany({
      where: { date: today, user: managedUserWhere as any },
      orderBy: { checkIn: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
            division: { select: { name: true } }
          }
        }
      }
    });

    return successResponse(res, attendances, 'Data absensi hari ini berhasil diambil');
  } catch (error) {
    console.error('Get all attendance today error:', error);
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

export const getLocationLogs = async (req: Request, res: Response) => {
  try {
    const managedUserWhere = await getManagedUserWhere(req);
    if (!managedUserWhere) return errorResponse(res, 'User login tidak valid', null, 401);

    const limit = Math.min(Number(req.query.limit || 200), 500);
    const logs = await prisma.locationLog.findMany({
      where: { user: managedUserWhere as any },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
            division: { select: { name: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number.isFinite(limit) ? limit : 200,
    });

    const latestByUser = new Map<string, (typeof logs)[number]>();
    logs.forEach((log) => {
      if (!latestByUser.has(log.userId)) {
        latestByUser.set(log.userId, log);
      }
    });

    return successResponse(res, {
      logs,
      latest: Array.from(latestByUser.values()),
    }, 'Data lokasi berhasil diambil');
  } catch (error) {
    console.error('Get location logs error:', error);
    return errorResponse(res, 'Terjadi kesalahan mengambil data lokasi', null, 500);
  }
};

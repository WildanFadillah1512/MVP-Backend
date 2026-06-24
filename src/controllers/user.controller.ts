import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: {
        role: true,
        division: true,
        supervisor: { select: { id: true, name: true } },
        leaveBalances: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const sanitized = users.map(({ password, ...u }) => u);
    return successResponse(res, sanitized, 'Data user berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data user', null, 500);
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true, division: true, leaveBalances: true, supervisor: { select: { id: true, name: true } } }
    });

    if (!user || user.deletedAt) return errorResponse(res, 'User tidak ditemukan', null, 404);
    const { password, ...sanitized } = user;
    return successResponse(res, sanitized, 'Data user berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data user', null, 500);
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, name, roleId, divisionId, supervisorId, totalQuota } = req.body;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return errorResponse(res, 'Email sudah digunakan', null, 400);

    const hashed = await bcrypt.hash(password || 'password123', 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        name,
        roleId,
        divisionId,
        supervisorId: supervisorId || null,
        leaveBalances: { create: { totalQuota: Number(totalQuota || 12), usedQuota: 0 } }
      },
      include: { role: true, division: true, leaveBalances: true }
    });

    const { password: _, ...sanitized } = user;
        await writeAuditLog(req, 'CREATE', 'USER', 'User baru dibuat: ' + email);
    return successResponse(res, sanitized, 'User berhasil dibuat', 201);
  } catch (error) {
    console.error(error);
    return errorResponse(res, 'Gagal membuat user', null, 500);
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { name, roleId, divisionId, supervisorId, isActive, totalQuota } = req.body;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        name,
        roleId,
        divisionId,
        supervisorId: supervisorId || null,
        isActive: typeof isActive === 'boolean' ? isActive : undefined,
        leaveBalances: totalQuota ? {
          upsert: {
            create: { totalQuota: Number(totalQuota), usedQuota: 0 },
            update: { totalQuota: Number(totalQuota) }
          }
        } : undefined
      },
      include: { role: true, division: true, leaveBalances: true }
    });

    const { password, ...sanitized } = user;
    return successResponse(res, sanitized, 'User berhasil diperbarui');
  } catch (error) {
    return errorResponse(res, 'Gagal memperbarui user', null, 500);
  }
};

export const deactivateUser = async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false, deletedAt: new Date() }
    });

        await writeAuditLog(req, 'DELETE', 'USER', 'User dinonaktifkan: ' + user.id);
    return successResponse(res, { id: user.id }, 'User berhasil dinonaktifkan');
  } catch (error) {
    return errorResponse(res, 'Gagal menonaktifkan user', null, 500);
  }
};

export const getUserOptions = async (req: Request, res: Response) => {
  try {
    const [roles, divisions, supervisors] = await Promise.all([
      prisma.role.findMany({ orderBy: { name: 'asc' } }),
      prisma.division.findMany({ orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } })
    ]);

    return successResponse(res, { roles, divisions, supervisors }, 'Options berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil options', null, 500);
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { photoUrl, bio, phone } = req.body;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { photoUrl, bio, phone },
      include: { role: true, division: true }
    });

    const { password, ...sanitized } = user;
    return successResponse(res, sanitized, 'Profil berhasil diperbarui');
  } catch (error) {
    return errorResponse(res, 'Gagal memperbarui profil', null, 500);
  }
};

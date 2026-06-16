import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, division: true },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return errorResponse(res, 'Email atau password salah', null, 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return errorResponse(res, 'Email atau password salah', null, 401);
    }

    const token = jwt.sign(
      { id: user.id, role: user.role.name, division: user.division.name },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    const { password: _, ...userWithoutPassword } = user;

    // Write audit log after token generated
    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        module: 'AUTH',
        description: `User ${user.email} berhasil login`,
        ipAddress,
      }
    }).catch(() => {});

    return successResponse(res, { user: userWithoutPassword, token }, 'Login berhasil');
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat login', null, 500);
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, division: true },
    });
    if (!user) return errorResponse(res, 'User tidak ditemukan', null, 404);
    const { password: _, ...userWithoutPassword } = user;
    return successResponse(res, userWithoutPassword, 'Data user berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

export const logout = async (req: Request, res: Response) => {
  await writeAuditLog(req, 'LOGOUT', 'AUTH', 'User melakukan logout');
  return successResponse(res, null, 'Logout berhasil');
};

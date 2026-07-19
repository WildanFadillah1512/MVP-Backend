import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { sendLoginOtpEmail } from '../services/email.service';

const OTP_REQUIRED_ROLES = ['OWNER', 'CEO'];
const OTP_TTL_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

const hashToken = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const generateOtpCode = () => crypto.randomInt(100000, 999999).toString();

const createJwtForUser = (user: any) => jwt.sign(
  { id: user.id, role: user.role.name, division: user.division.name },
  process.env.JWT_SECRET || 'secret',
  { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
);

const sanitizeUser = (user: any) => {
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

const writeLoginAudit = async (req: Request, user: any, description = `User ${user.email} berhasil login`) => {
  const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'LOGIN',
      module: 'AUTH',
      description,
      ipAddress,
    }
  }).catch(() => {});
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true, division: true, branch: true },
    });

    if (!user || !user.isActive || user.deletedAt) {
      return errorResponse(res, 'Email atau password salah', null, 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return errorResponse(res, 'Email atau password salah', null, 401);
    }

    if (OTP_REQUIRED_ROLES.includes(user.role.name)) {
      const otpCode = generateOtpCode();
      const otpHash = await bcrypt.hash(otpCode, 10);
      const otpToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
      const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';

      await prisma.loginOtp.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() }
      });

      await prisma.loginOtp.create({
        data: {
          userId: user.id,
          otpHash,
          tempTokenHash: hashToken(otpToken),
          expiresAt,
          ipAddress,
          userAgent: req.get('user-agent') || null
        }
      });

      try {
        await sendLoginOtpEmail(user.email, otpCode);
      } catch (emailError: any) {
        console.error('OTP email send error:', emailError.message);
        return errorResponse(
          res,
          'Gagal mengirim OTP. Periksa konfigurasi SMTP/Gmail di Render.',
          emailError.smtpAttempts || null,
          500
        );
      }

      return successResponse(res, {
        requiresOtp: true,
        otpToken,
        email: user.email,
        expiresAt
      }, 'Kode OTP telah dikirim ke email');
    }

    const token = createJwtForUser(user);
    const userWithoutPassword = sanitizeUser(user);

    await writeLoginAudit(req, user);

    return successResponse(res, { user: userWithoutPassword, token }, 'Login berhasil');
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat login', null, 500);
  }
};

export const verifyLoginOtp = async (req: Request, res: Response) => {
  try {
    const { otpToken, code } = req.body;
    const tokenHash = hashToken(otpToken);

    const otpRecord = await prisma.loginOtp.findUnique({
      where: { tempTokenHash: tokenHash },
      include: { user: { include: { role: true, division: true, branch: true } } }
    });

    if (!otpRecord || otpRecord.consumedAt || otpRecord.expiresAt < new Date()) {
      return errorResponse(res, 'OTP tidak valid atau sudah kadaluarsa', null, 401);
    }

    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      await prisma.loginOtp.update({
        where: { id: otpRecord.id },
        data: { consumedAt: new Date() }
      });
      return errorResponse(res, 'OTP sudah melebihi batas percobaan', null, 429);
    }

    const isValidOtp = await bcrypt.compare(code, otpRecord.otpHash);
    if (!isValidOtp) {
      await prisma.loginOtp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } }
      });
      return errorResponse(res, 'Kode OTP salah', null, 401);
    }

    const user = otpRecord.user;
    if (!user || !user.isActive || user.deletedAt) {
      return errorResponse(res, 'User tidak aktif', null, 401);
    }

    await prisma.loginOtp.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() }
    });

    const token = createJwtForUser(user);
    await writeLoginAudit(req, user, `User ${user.email} berhasil login dengan OTP`);

    return successResponse(res, {
      user: sanitizeUser(user),
      token
    }, 'Verifikasi OTP berhasil');
  } catch (error) {
    console.error('Verify OTP error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat verifikasi OTP', null, 500);
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, division: true, branch: true },
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

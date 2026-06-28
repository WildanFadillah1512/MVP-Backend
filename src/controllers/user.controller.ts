// @ts-nocheck
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

const TOP_LEVEL_ROLES = ['OWNER', 'CEO', 'ADMIN'];
const ROLE_LEVEL: Record<string, number> = {
  STAFF: 1,
  LEADER: 2,
  MANAGER: 3,
  GM: 4,
  CEO: 5,
  OWNER: 5,
  ADMIN: 5,
};

const getActor = async (req: Request) => {
  return prisma.user.findUnique({
    where: { id: (req as any).user.id },
    include: { role: true, division: true }
  });
};

const getSubordinateIds = async (userId: string) => {
  const ids = new Set<string>();
  let frontier = [userId];

  while (frontier.length > 0) {
    const reports = await prisma.user.findMany({
      where: { supervisorId: { in: frontier }, deletedAt: null },
      select: { id: true }
    });
    frontier = reports.map((u) => u.id).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }

  return [...ids];
};

const getRoleNamesAllowedForActor = (actorRole: string) => {
  if (TOP_LEVEL_ROLES.includes(actorRole)) return ['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER', 'STAFF'];
  if (actorRole === 'GM') return ['MANAGER', 'LEADER', 'STAFF'];
  if (actorRole === 'MANAGER') return ['LEADER', 'STAFF'];
  return [];
};

const assertCanManagePayload = async (req: Request, roleId: string, divisionId: string, targetUserId?: string) => {
  const actor = await getActor(req);
  if (!actor) return 'User login tidak valid';

  const [targetRole, targetDivision] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId } }),
    prisma.division.findUnique({ where: { id: divisionId } })
  ]);

  if (!targetRole || !targetDivision) return 'Role atau divisi tidak valid';

  const allowedRoles = getRoleNamesAllowedForActor(actor.role.name);
  if (!allowedRoles.includes(targetRole.name)) {
    return 'Anda hanya dapat mengatur jabatan di bawah otoritas Anda';
  }

  if (actor.role.name === 'GM' && targetDivision.name === 'KASIR') {
    return 'GM tidak dapat mengatur user divisi KASIR/keuangan';
  }

  if (actor.role.name === 'MANAGER' && targetDivision.id !== actor.divisionId) {
    return 'Manager hanya dapat mengatur user di divisinya sendiri';
  }

  if (targetUserId && actor.role.name === 'MANAGER') {
    const subordinateIds = await getSubordinateIds(actor.id);
    if (!subordinateIds.includes(targetUserId)) {
      return 'Manager hanya dapat mengubah bawahan di struktur timnya';
    }
  }

  return null;
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const actor = await getActor(req);
    if (!actor) return errorResponse(res, 'User login tidak valid', null, 401);

    let where: any = { deletedAt: null };
    if (actor.role.name === 'GM') {
      where = { ...where, division: { name: { not: 'KASIR' } }, role: { name: { in: getRoleNamesAllowedForActor('GM') } } };
    } else if (actor.role.name === 'MANAGER') {
      const subordinateIds = await getSubordinateIds(actor.id);
      where = { ...where, id: { in: subordinateIds } };
    }

    const users = await prisma.user.findMany({
      where,
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
    const actor = await getActor(req);
    if (!actor) return errorResponse(res, 'User login tidak valid', null, 401);

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true, division: true, leaveBalances: true, supervisor: { select: { id: true, name: true } } }
    });

    if (!user || user.deletedAt) return errorResponse(res, 'User tidak ditemukan', null, 404);
    if (actor.role.name === 'MANAGER') {
      const subordinateIds = await getSubordinateIds(actor.id);
      if (!subordinateIds.includes(user.id)) {
        return errorResponse(res, 'Anda tidak berwenang melihat user ini', null, 403);
      }
    }
    if (actor.role.name === 'GM' && (user.division.name === 'KASIR' || !getRoleNamesAllowedForActor('GM').includes(user.role.name))) {
      return errorResponse(res, 'Anda tidak berwenang melihat user ini', null, 403);
    }

    const { password, ...sanitized } = user;
    return successResponse(res, sanitized, 'Data user berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil data user', null, 500);
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, name, roleId, divisionId, supervisorId, totalQuota } = req.body;
    const policyError = await assertCanManagePayload(req, roleId, divisionId);
    if (policyError) return errorResponse(res, policyError, null, 403);

    const actor = await getActor(req);
    if (!actor) return errorResponse(res, 'User login tidak valid', null, 401);

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
        supervisorId: actor.role.name === 'MANAGER' ? actor.id : (supervisorId === 'none' ? null : supervisorId || null),
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
    const current = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true, division: true }
    });
    if (!current || current.deletedAt) return errorResponse(res, 'User tidak ditemukan', null, 404);

    const effectiveRoleId = roleId || current.roleId;
    const effectiveDivisionId = divisionId || current.divisionId;
    const policyError = await assertCanManagePayload(req, effectiveRoleId, effectiveDivisionId, req.params.id);
    if (policyError) return errorResponse(res, policyError, null, 403);

    const actor = await getActor(req);
    if (!actor) return errorResponse(res, 'User login tidak valid', null, 401);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        name,
        roleId: effectiveRoleId,
        divisionId: effectiveDivisionId,
        supervisorId: actor.role.name === 'MANAGER' ? actor.id : (supervisorId === 'none' ? null : supervisorId || null),
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
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { role: true, division: true }
    });
    if (!target || target.deletedAt) return errorResponse(res, 'User tidak ditemukan', null, 404);

    const policyError = await assertCanManagePayload(req, target.roleId, target.divisionId, target.id);
    if (policyError) return errorResponse(res, policyError, null, 403);

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
    const actor = await getActor(req);
    if (!actor) return errorResponse(res, 'User login tidak valid', null, 401);

    const allowedRoleNames = getRoleNamesAllowedForActor(actor.role.name);
    const roleWhere = TOP_LEVEL_ROLES.includes(actor.role.name)
      ? {}
      : { name: { in: allowedRoleNames as any } };
    const divisionWhere = actor.role.name === 'MANAGER'
      ? { id: actor.divisionId }
      : actor.role.name === 'GM'
        ? { name: { not: 'KASIR' } }
        : {};
    const supervisorWhere = actor.role.name === 'MANAGER'
      ? { id: actor.id }
      : { deletedAt: null, isActive: true };

    const [roles, divisions, supervisors] = await Promise.all([
      prisma.role.findMany({ where: roleWhere as any, orderBy: { name: 'asc' } }),
      prisma.division.findMany({ where: divisionWhere as any, orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: supervisorWhere as any, select: { id: true, name: true, email: true, role: { select: { name: true } } }, orderBy: { name: 'asc' } })
    ]);

    return successResponse(res, { roles, divisions, supervisors }, 'Options berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil options', null, 500);
  }
};

export const createDivision = async (req: Request, res: Response) => {
  try {
    const actorRole = (req as any).user.role;
    if (!TOP_LEVEL_ROLES.includes(actorRole) && actorRole !== 'GM') {
      return errorResponse(res, 'Hanya Owner/CEO/Admin/GM yang dapat menambah divisi', null, 403);
    }

    const rawName = String(req.body.name || '').trim().toUpperCase();
    if (!rawName) return errorResponse(res, 'Nama divisi wajib diisi', null, 400);
    if (actorRole === 'GM' && rawName === 'KASIR') {
      return errorResponse(res, 'GM tidak dapat membuat divisi KASIR/keuangan', null, 403);
    }

    const division = await prisma.division.create({
      data: { name: rawName }
    });

    await writeAuditLog(req, 'CREATE', 'DIVISION', `Divisi baru dibuat: ${rawName}`);
    return successResponse(res, division, 'Divisi berhasil dibuat', 201);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return errorResponse(res, 'Nama divisi sudah ada', null, 400);
    }
    return errorResponse(res, 'Gagal membuat divisi', null, 500);
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

// @ts-nocheck
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { createBulkNotifications, createNotification } from '../services/notification.service';

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

const getManagementChainAndExecutives = async (userId: string) => {
  const targetIds = new Set<string>();
  let current = await prisma.user.findUnique({
    where: { id: userId },
    select: { supervisorId: true }
  });

  while (current?.supervisorId) {
    targetIds.add(current.supervisorId);
    current = await prisma.user.findUnique({
      where: { id: current.supervisorId },
      select: { supervisorId: true }
    });
  }

  const executives = await prisma.user.findMany({
    where: {
      role: { name: { in: ['OWNER', 'CEO', 'GM', 'ADMIN'] as any } },
      isActive: true,
      deletedAt: null
    },
    select: { id: true }
  });
  executives.forEach((user) => targetIds.add(user.id));

  return [...targetIds].filter((id) => id !== userId);
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
        branch: true,
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
      include: { role: true, division: true, branch: true, leaveBalances: true, supervisor: { select: { id: true, name: true } } }
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
    const { email, password, name, roleId, divisionId, supervisorId, totalQuota, branchId } = req.body;
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
        branchId: branchId === 'none' ? null : branchId || null,
        supervisorId: actor.role.name === 'MANAGER' ? actor.id : (supervisorId === 'none' ? null : supervisorId || null),
        leaveBalances: { create: { totalQuota: Number(totalQuota || 12), usedQuota: 0 } }
      },
      include: { role: true, division: true, branch: true, leaveBalances: true }
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
    const { name, roleId, divisionId, supervisorId, isActive, totalQuota, branchId } = req.body;
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
        branchId: branchId === 'none' ? null : branchId || undefined,
        supervisorId: actor.role.name === 'MANAGER' ? actor.id : (supervisorId === 'none' ? null : supervisorId || null),
        isActive: typeof isActive === 'boolean' ? isActive : undefined,
        leaveBalances: totalQuota ? {
          upsert: {
            create: { totalQuota: Number(totalQuota), usedQuota: 0 },
            update: { totalQuota: Number(totalQuota) }
          }
        } : undefined
      },
      include: { role: true, division: true, branch: true, leaveBalances: true }
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

    const [roles, divisions, branches, supervisors] = await Promise.all([
      prisma.role.findMany({ where: roleWhere as any, orderBy: { name: 'asc' } }),
      prisma.division.findMany({ where: divisionWhere as any, orderBy: { name: 'asc' } }),
      prisma.branch.findMany({ orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: supervisorWhere as any, select: { id: true, name: true, email: true, role: { select: { name: true } } }, orderBy: { name: 'asc' } })
    ]);

    return successResponse(res, { roles, divisions, branches, supervisors }, 'Options berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil options', null, 500);
  }
};

export const requestResignation = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { reason, effectiveDate } = req.body;

    if (!reason || !effectiveDate) {
      return errorResponse(res, 'Alasan dan tanggal efektif resign wajib diisi', null, 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        division: true,
        branch: true,
        supervisor: { select: { id: true, name: true } },
        leaveBalances: true,
        attendances: { orderBy: { date: 'desc' }, take: 30 },
        dailyReports: { orderBy: { date: 'desc' }, take: 30 },
        targetAssignments: true,
        payrolls: { orderBy: { period: 'desc' }, take: 12 }
      }
    });

    if (!user || user.deletedAt) {
      return errorResponse(res, 'User tidak ditemukan', null, 404);
    }

    const backupSnapshot = JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role.name,
        division: user.division.name,
        branch: user.branch?.name || null,
        supervisor: user.supervisor?.name || null,
        phone: user.phone,
        bio: user.bio
      },
      leaveBalances: user.leaveBalances,
      attendances: user.attendances,
      dailyReports: user.dailyReports,
      targetAssignments: user.targetAssignments,
      payrolls: user.payrolls,
      requestedAt: new Date().toISOString()
    });

    const request = await prisma.resignationRequest.create({
      data: {
        userId,
        reason: String(reason).trim(),
        effectiveDate: new Date(effectiveDate),
        backupSnapshot
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
            role: true,
            division: true,
            branch: true
          }
        }
      }
    });

    const targetIds = await getManagementChainAndExecutives(userId);
    await createBulkNotifications(targetIds.map((targetUserId) => ({
      userId: targetUserId,
      title: 'Pengajuan Resign Baru',
      message: `${user.name} mengajukan resign efektif ${effectiveDate}. Backup data otomatis sudah dibuat.`,
      type: 'INFO',
      link: '/users',
      metadata: { resignationRequestId: request.id, userId }
    })));

    await writeAuditLog(req, 'CREATE', 'RESIGNATION', `Pengajuan resign dibuat: ${user.name}`);
    return successResponse(res, request, 'Pengajuan resign berhasil dikirim dan data karyawan sudah dibackup', 201);
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal mengajukan resign', null, 500);
  }
};

export const getResignationRequests = async (req: Request, res: Response) => {
  try {
    const requests = await prisma.resignationRequest.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            isActive: true,
            role: true,
            division: true,
            branch: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return successResponse(res, requests, 'Pengajuan resign berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil pengajuan resign', null, 500);
  }
};

export const createWarningLetter = async (req: Request, res: Response) => {
  try {
    const actor = await getActor(req);
    if (!actor) return errorResponse(res, 'User login tidak valid', null, 401);

    const { employeeId, reason, durationDays, notes } = req.body;
    if (!employeeId || !reason) {
      return errorResponse(res, 'Karyawan dan alasan SP1 wajib diisi', null, 400);
    }

    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      include: { role: true, division: true }
    });
    if (!employee || employee.deletedAt) return errorResponse(res, 'Karyawan tidak ditemukan', null, 404);

    if (ROLE_LEVEL[actor.role.name] < ROLE_LEVEL[employee.role.name]) {
      return errorResponse(res, 'Tidak boleh mengeluarkan SP1 untuk jabatan di atas Anda', null, 403);
    }

    const defaultSetting = await prisma.systemSetting.findUnique({ where: { key: 'SP1_DEFAULT_DURATION_DAYS' } });
    const days = Math.max(1, Number(durationDays || defaultSetting?.value || 90));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const warning = await prisma.warningLetter.create({
      data: {
        employeeId,
        issuedById: actor.id,
        reason: String(reason).trim(),
        notes: notes ? String(notes).trim() : null,
        expiresAt
      },
      include: {
        employee: { include: { role: true, division: true, branch: true } },
        issuedBy: { select: { id: true, name: true } }
      }
    });

    await createNotification({
      userId: employeeId,
      title: 'SP1 Diterbitkan',
      message: `SP1 diterbitkan oleh ${actor.name}. Berlaku sampai ${expiresAt.toISOString().slice(0, 10)}.`,
      type: 'WARNING',
      link: '/profile',
      metadata: { warningLetterId: warning.id }
    });

    await writeAuditLog(req, 'CREATE', 'WARNING_LETTER', `SP1 dibuat untuk ${employee.name}`);
    return successResponse(res, warning, 'SP1 berhasil diterbitkan', 201);
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal menerbitkan SP1', null, 500);
  }
};

export const getWarningLetters = async (req: Request, res: Response) => {
  try {
    await prisma.warningLetter.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });

    const warnings = await prisma.warningLetter.findMany({
      include: {
        employee: { include: { role: true, division: true, branch: true } },
        issuedBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const setting = await prisma.systemSetting.findUnique({ where: { key: 'SP1_DEFAULT_DURATION_DAYS' } });
    return successResponse(res, { warnings, defaultDurationDays: Number(setting?.value || 90) }, 'SP1 berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil SP1', null, 500);
  }
};

export const updateWarningSettings = async (req: Request, res: Response) => {
  try {
    const actorRole = (req as any).user.role;
    if (!['OWNER', 'CEO', 'ADMIN'].includes(actorRole)) {
      return errorResponse(res, 'Hanya CEO/Admin/Owner yang dapat mengubah durasi default SP1', null, 403);
    }

    const durationDays = Math.max(1, Number(req.body.durationDays || 90));
    const setting = await prisma.systemSetting.upsert({
      where: { key: 'SP1_DEFAULT_DURATION_DAYS' },
      update: { value: String(durationDays) },
      create: {
        key: 'SP1_DEFAULT_DURATION_DAYS',
        value: String(durationDays),
        description: 'Durasi default SP1 dalam hari'
      }
    });

    return successResponse(res, setting, 'Durasi default SP1 berhasil diperbarui');
  } catch (error) {
    return errorResponse(res, 'Gagal memperbarui durasi SP1', null, 500);
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

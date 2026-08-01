import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { errorResponse, successResponse } from '../utils/response';
import { startOfMonth, endOfMonth } from 'date-fns';
import { createNotification } from '../services/notification.service';

const getUserRole = (user: any) => user.role?.name || user.role;
const FULL_PAYROLL_ACCESS_ROLES = ['OWNER', 'CEO'];

const canAccessAllPayrolls = (role: string) => FULL_PAYROLL_ACCESS_ROLES.includes(role);

export const getPayrolls = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const { period, userId, status } = req.query;

    let whereClause: any = {};

    // Hanya OWNER/CEO yang boleh melihat slip semua karyawan.
    // Role lain tetap bisa membuka modul payroll, tetapi dipaksa ke slip miliknya sendiri.
    if (canAccessAllPayrolls(role)) {
      if (userId) {
        whereClause.userId = userId;
      }
    } else {
      whereClause.userId = user.id;
    }

    if (period) {
      whereClause.period = new Date(period as string);
    }

    if (status) {
      whereClause.status = status;
    }

    const payrolls = await prisma.payroll.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            division: true
          }
        }
      },
      orderBy: [
        { period: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return successResponse(res, payrolls, 'Payrolls retrieved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const getPayrollById = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const id = String(req.params.id);

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            division: true
          }
        }
      }
    });

    if (!payroll) {
      return errorResponse(res, 'Payroll not found', null, 404);
    }

    // Hanya OWNER/CEO yang boleh membuka slip karyawan lain.
    if (!canAccessAllPayrolls(role) && payroll.userId !== user.id) {
      return errorResponse(res, 'Unauthorized to view this payroll', null, 403);
    }

    return successResponse(res, payroll, 'Payroll retrieved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const generatePayroll = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);

    if (!canAccessAllPayrolls(role)) {
      return errorResponse(res, 'Unauthorized to generate payroll', null, 403);
    }

    const { userId, period, basicSalary, allowances, bonus, deductions } = req.body;

    const periodDate = new Date(period);
    const startDate = startOfMonth(periodDate);
    const endDate = endOfMonth(periodDate);

    // Calculate attendance days
    const attendances = await prisma.attendance.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        },
        status: {
          in: ['HADIR', 'TELAT']
        }
      }
    });

    const attendanceDays = attendances.length;

    // Calculate leave days
    const leaves = await prisma.attendance.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        },
        status: 'CUTI'
      }
    });

    const leaveDays = leaves.length;

    // Calculate overtime
    const overtimes = await prisma.overtimeRecord.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        },
        status: 'APPROVED'
      }
    });

    const overtimeHours = overtimes.reduce((sum, ot) => sum + ot.totalHours, 0);
    const overtimePay = overtimeHours * 50000; // 50k per hour, bisa disesuaikan

    // Total working days in month (excluding Sundays typically)
    const workDays = 26; // Standard, bisa dihitung lebih detail

    const totalSalary = basicSalary + allowances + bonus + overtimePay - deductions;

    const payroll = await prisma.payroll.upsert({
      where: {
        userId_period: {
          userId,
          period: periodDate
        }
      },
      update: {
        basicSalary,
        allowances,
        overtimePay,
        bonus,
        deductions,
        totalSalary,
        workDays,
        attendanceDays,
        leaveDays,
        overtimeHours,
        status: 'PENDING'
      },
      create: {
        userId,
        period: periodDate,
        basicSalary,
        allowances,
        overtimePay,
        bonus,
        deductions,
        totalSalary,
        workDays,
        attendanceDays,
        leaveDays,
        overtimeHours,
        status: 'PENDING'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            division: true
          }
        }
      }
    });

    await createNotification({
      userId,
      title: 'Slip Gaji Dibuat',
      message: `Slip gaji periode ${periodDate.toISOString().slice(0, 7)} sudah dibuat dan menunggu approval.`,
      type: 'INFO',
      link: '/payroll',
      metadata: { payrollId: payroll.id }
    }).catch(() => {});

    return successResponse(res, payroll, 'Payroll generated successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const approvePayroll = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const id = String(req.params.id);

    if (!canAccessAllPayrolls(role)) {
      return errorResponse(res, 'Only CEO or Owner can approve payroll', null, 403);
    }

    const payroll = await prisma.payroll.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    await createNotification({
      userId: payroll.user.id,
      title: 'Slip Gaji Disetujui',
      message: 'Slip gaji Anda sudah disetujui CEO/Owner.',
      type: 'INFO',
      link: '/payroll',
      metadata: { payrollId: payroll.id }
    }).catch(() => {});

    return successResponse(res, payroll, 'Payroll approved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const markPayrollAsPaid = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const id = String(req.params.id);

    if (!canAccessAllPayrolls(role)) {
      return errorResponse(res, 'Unauthorized to mark payroll as paid', null, 403);
    }

    const payroll = await prisma.payroll.update({
      where: { id },
      data: {
        status: 'PAID',
        paidAt: new Date()
      },
      include: { user: { select: { id: true, name: true } } }
    });

    await createNotification({
      userId: payroll.user.id,
      title: 'Slip Gaji Dibayarkan',
      message: 'Slip gaji Anda sudah ditandai dibayarkan.',
      type: 'INFO',
      link: '/payroll',
      metadata: { payrollId: payroll.id }
    }).catch(() => {});

    return successResponse(res, payroll, 'Payroll marked as paid successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const updatePayroll = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const id = String(req.params.id);

    if (!canAccessAllPayrolls(role)) {
      return errorResponse(res, 'Unauthorized to update payroll', null, 403);
    }

    const { basicSalary, allowances, bonus, deductions, notes } = req.body;

    const payroll = await prisma.payroll.findUnique({
      where: { id }
    });

    if (!payroll) {
      return errorResponse(res, 'Payroll not found', null, 404);
    }

    if (payroll.status === 'PAID') {
      return errorResponse(res, 'Cannot update paid payroll', null, 400);
    }

    const totalSalary = (basicSalary || payroll.basicSalary) + 
                        (allowances || payroll.allowances) + 
                        (bonus || payroll.bonus) + 
                        payroll.overtimePay - 
                        (deductions || payroll.deductions);

    const updatedPayroll = await prisma.payroll.update({
      where: { id },
      data: {
        basicSalary: basicSalary || payroll.basicSalary,
        allowances: allowances || payroll.allowances,
        bonus: bonus || payroll.bonus,
        deductions: deductions || payroll.deductions,
        totalSalary,
        notes: notes || payroll.notes
      }
    });

    return successResponse(res, updatedPayroll, 'Payroll updated successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const deletePayroll = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const id = String(req.params.id);

    if (!canAccessAllPayrolls(role)) {
      return errorResponse(res, 'Only CEO or Owner can delete payroll', null, 403);
    }

    const payroll = await prisma.payroll.findUnique({
      where: { id }
    });

    if (!payroll) {
      return errorResponse(res, 'Payroll not found', null, 404);
    }

    if (payroll.status === 'PAID') {
      return errorResponse(res, 'Cannot delete paid payroll', null, 400);
    }

    await prisma.payroll.delete({
      where: { id }
    });

    return successResponse(res, null, 'Payroll deleted successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

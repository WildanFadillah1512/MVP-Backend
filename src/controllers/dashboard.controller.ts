import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { ReportStatus, AttendanceStatus } from '@prisma/client';

export const getCeoDashboard = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Total Karyawan aktif
    const totalUsers = await prisma.user.count({
      where: { isActive: true, deletedAt: null }
    });

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const newUsersThisMonth = await prisma.user.count({
      where: {
        isActive: true,
        deletedAt: null,
        createdAt: { gte: thisMonth }
      }
    });

    // 2. Absensi hari ini
    const todayAttendance = await prisma.attendance.count({
      where: { date: today, status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TELAT] } }
    });

    // 3. Cuti aktif
    const activeLeaves = await prisma.leaveRequest.count({
      where: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }
    });

    // 4. Laporan Harian Hari ini
    const submittedReports = await prisma.dailyReport.count({
      where: { date: today, status: { in: [ReportStatus.SUBMITTED, ReportStatus.LOCKED] } }
    });

    // 5. Karyawan belum laporan hari ini
    const pendingUsers = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        dailyReports: { none: { date: today } },
        attendances: {
          some: { date: today, status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TELAT] } }
        }
      },
      select: { id: true, name: true, division: { select: { name: true } } },
      take: 10
    });

    // 6. Stok Menipis (compare currentStock <= minStock via raw query for accuracy)
    const allItems = await prisma.warehouseItem.findMany();
    const lowStockCount = allItems.filter(item => item.currentStock <= item.minStock).length;

    // 7. Performa divisi (total target assignments per division)
    const divisions = await prisma.division.findMany({
      where: { name: { not: 'NONE' } },
      include: {
        users: {
          where: { isActive: true },
          include: {
            targetAssignments: { include: { target: true } }
          }
        }
      }
    });

    const divisionPerformance = divisions.map(div => {
      let totalTarget = 0;
      let totalProgress = 0;

      div.users.forEach(user => {
        user.targetAssignments.forEach(ta => {
          totalTarget += ta.target.targetValue;
          totalProgress += ta.currentValue;
        });
      });

      return {
        name: div.name,
        totalMembers: div.users.length,
        percentage: totalTarget > 0 ? Math.round((totalProgress / totalTarget) * 100) : 0
      };
    });

    // 8. Pendapatan kasir bulan ini
    const cashierThisMonth = await prisma.cashierReport.aggregate({
      _sum: { netTotal: true },
      where: { date: { gte: thisMonth } }
    });

    return successResponse(res, {
      employees: { total: totalUsers, newThisMonth: newUsersThisMonth },
      attendance: { todayCount: todayAttendance },
      leaves: { activeCount: activeLeaves },
      reports: { submitted: submittedReports, total: totalUsers, pendingUsers },
      warnings: { lowStock: lowStockCount },
      divisionPerformance,
      cashierRevenue: cashierThisMonth._sum.netTotal || 0
    }, 'Data dashboard CEO berhasil diambil');
  } catch (error) {
    console.error('CEO Dashboard Error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat memuat dashboard', null, 500);
  }
};

export const getManagerDashboard = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get all subordinates recursively (direct reports + their reports)
    const directReports = await prisma.user.findMany({
      where: { supervisorId: userId, isActive: true, deletedAt: null }
    });
    const indirectReports = await prisma.user.findMany({
      where: { supervisorId: { in: directReports.map(u => u.id) }, isActive: true, deletedAt: null }
    });
    const allTeam = [...directReports, ...indirectReports];
    const teamIds = allTeam.map(u => u.id);

    // Team attendance today
    const teamActiveToday = await prisma.attendance.count({
      where: { userId: { in: teamIds }, date: today, status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TELAT] } }
    });

    // Team reports today
    const teamReportsToday = await prisma.dailyReport.count({
      where: { userId: { in: teamIds }, date: today, status: { in: [ReportStatus.SUBMITTED, ReportStatus.LOCKED] } }
    });

    // Belum laporan hari ini
    const teamNotReported = await prisma.user.findMany({
      where: {
        id: { in: teamIds },
        dailyReports: { none: { date: today } },
        attendances: { some: { date: today, status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TELAT] } } }
      },
      select: { id: true, name: true, division: { select: { name: true } } }
    });

    // Pending Leaves
    const pendingLeaves = await prisma.leaveRequest.findMany({
      where: { userId: { in: teamIds }, status: 'PENDING' },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' }
    });

    // Team target progress
    const teamTargets = await prisma.targetAssignment.findMany({
      where: { userId: { in: teamIds } },
      include: { target: true, user: { select: { name: true } } }
    });

    let totalTargetValue = 0;
    let totalCurrentValue = 0;
    teamTargets.forEach(ta => {
      totalTargetValue += ta.target.targetValue;
      totalCurrentValue += ta.currentValue;
    });
    const teamTargetPercent = totalTargetValue > 0 ? Math.round((totalCurrentValue / totalTargetValue) * 100) : 0;

    return successResponse(res, {
      team: { total: allTeam.length, activeToday: teamActiveToday },
      reports: { submittedToday: teamReportsToday, notReported: teamNotReported },
      leaves: { pendingApproval: pendingLeaves.length, pendingList: pendingLeaves },
      targets: { overallPercent: teamTargetPercent, assignments: teamTargets }
    }, 'Data dashboard Manager berhasil diambil');
  } catch (error) {
    console.error('Manager Dashboard Error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat memuat dashboard', null, 500);
  }
};

export const getStaffDashboard = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Absensi Hari Ini
    const todayAttendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId, date: today } }
    });

    // Sisa Cuti
    const leaveBalance = await prisma.leaveBalance.findUnique({
      where: { userId }
    });

    // Target assignments
    const targets = await prisma.targetAssignment.findMany({
      where: { userId },
      include: { target: true }
    });

    // Laporan bulan ini
    const reportsThisMonth = await prisma.dailyReport.count({
      where: { userId, date: { gte: thisMonth }, status: ReportStatus.SUBMITTED }
    });
    const lockedReportsThisMonth = await prisma.dailyReport.count({
      where: { userId, date: { gte: thisMonth }, status: ReportStatus.LOCKED }
    });

    // Absensi bulan ini
    const attendanceThisMonth = await prisma.attendance.count({
      where: { userId, date: { gte: thisMonth }, status: { in: [AttendanceStatus.HADIR, AttendanceStatus.TELAT] } }
    });

    // KPI Score Calculation
    // Absensi: 20%, Laporan: 20%, Target: 40%, Upload: 10%, Evaluasi: 10%
    const workingDaysThisMonth = Math.max(1, Math.ceil((today.getTime() - thisMonth.getTime()) / (1000 * 60 * 60 * 24)));
    const attendanceScore = Math.min(100, Math.round((attendanceThisMonth / workingDaysThisMonth) * 100));
    const reportScore = Math.min(100, Math.round((reportsThisMonth / Math.max(1, workingDaysThisMonth)) * 100));

    let targetScore = 0;
    if (targets.length > 0) {
      let totalPercent = 0;
      targets.forEach(t => {
        totalPercent += Math.min(100, (t.currentValue / t.target.targetValue) * 100);
      });
      targetScore = Math.round(totalPercent / targets.length);
    }

    const uploadsThisMonth = await prisma.dailyUpload.count({
      where: { userId, createdAt: { gte: thisMonth } }
    });
    const uploadScore = Math.min(100, Math.round((uploadsThisMonth / Math.max(1, workingDaysThisMonth)) * 100));

    const evaluationScore = 75; // Default until manager evaluation module

    const kpiScore = Math.round(
      (attendanceScore * 0.2) +
      (reportScore * 0.2) +
      (targetScore * 0.4) +
      (uploadScore * 0.1) +
      (evaluationScore * 0.1)
    );

    const kpiGrade = kpiScore >= 90 ? 'A' : kpiScore >= 75 ? 'B' : kpiScore >= 60 ? 'C' : 'D';

    return successResponse(res, {
      attendance: todayAttendance,
      leaveBalance,
      activeTargets: targets,
      monthlyStats: {
        attendance: attendanceThisMonth,
        reports: reportsThisMonth,
        lockedReports: lockedReportsThisMonth,
        uploads: uploadsThisMonth
      },
      kpi: {
        score: kpiScore,
        grade: kpiGrade,
        breakdown: {
          attendance: { score: attendanceScore, weight: 20 },
          report: { score: reportScore, weight: 20 },
          target: { score: targetScore, weight: 40 },
          upload: { score: uploadScore, weight: 10 },
          evaluation: { score: evaluationScore, weight: 10 }
        }
      }
    }, 'Data dashboard Staff berhasil diambil');
  } catch (error) {
    console.error('Staff Dashboard Error:', error);
    return errorResponse(res, 'Terjadi kesalahan saat memuat dashboard', null, 500);
  }
};
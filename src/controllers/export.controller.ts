import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { errorResponse } from '../utils/response';
import * as ExcelJS from 'exceljs';
import { format } from 'date-fns';

export const exportAttendances = async (req: Request, res: Response) => {
  try {
    const attendances = await prisma.attendance.findMany({
      include: {
        user: { select: { name: true, division: { select: { name: true } } } }
      },
      orderBy: { date: 'desc' },
      take: 100 // Limit for demo
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Absensi');

    worksheet.columns = [
      { header: 'Tanggal', key: 'date', width: 15 },
      { header: 'Nama Karyawan', key: 'name', width: 25 },
      { header: 'Divisi', key: 'division', width: 15 },
      { header: 'Check In', key: 'checkIn', width: 15 },
      { header: 'Check Out', key: 'checkOut', width: 15 },
      { header: 'Total Jam', key: 'totalHours', width: 12 },
      { header: 'Status', key: 'status', width: 15 }
    ];

    attendances.forEach(a => {
      worksheet.addRow({
        date: format(new Date(a.date), 'yyyy-MM-dd'),
        name: a.user.name,
        division: a.user.division.name,
        checkIn: a.checkIn ? format(new Date(a.checkIn), 'HH:mm:ss') : '-',
        checkOut: a.checkOut ? format(new Date(a.checkOut), 'HH:mm:ss') : '-',
        totalHours: a.totalHours,
        status: a.status
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + `Laporan_Absensi_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return errorResponse(res, 'Gagal export data', null, 500);
  }
};

export const exportProduction = async (req: Request, res: Response) => {
  try {
    const records = await prisma.productionRecord.findMany({
      include: { product: true },
      orderBy: { date: 'desc' }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Laporan Produksi');

    worksheet.columns = [
      { header: 'Tanggal', key: 'date', width: 15 },
      { header: 'Kode Produk', key: 'code', width: 15 },
      { header: 'Nama Produk', key: 'name', width: 25 },
      { header: 'Kuantitas', key: 'quantity', width: 12 },
      { header: 'Catatan', key: 'notes', width: 30 }
    ];

    records.forEach(r => {
      worksheet.addRow({
        date: format(new Date(r.date), 'yyyy-MM-dd'),
        code: r.product.code,
        name: r.product.name,
        quantity: r.quantity,
        notes: r.notes || '-'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + `Laporan_Produksi_${format(new Date(), 'yyyyMMdd')}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    return errorResponse(res, 'Gagal export data', null, 500);
  }
};

export const exportAllStatistics = async (req: Request, res: Response) => {
  try {
    const [
      attendances,
      productionRecords,
      purchases,
      cashierReports,
      warehouseItems,
      users
    ] = await Promise.all([
      prisma.attendance.findMany({
        include: { user: { select: { name: true, division: { select: { name: true } }, role: { select: { name: true } } } } },
        orderBy: { date: 'desc' },
        take: 500
      }),
      prisma.productionRecord.findMany({
        include: { product: true },
        orderBy: { date: 'desc' },
        take: 500
      }),
      prisma.purchaseNote.findMany({ orderBy: { date: 'desc' }, take: 500 }),
      prisma.cashierReport.findMany({ include: { branch: true }, orderBy: { date: 'desc' }, take: 500 }),
      prisma.warehouseItem.findMany({ orderBy: { name: 'asc' } }),
      prisma.user.findMany({
        where: { deletedAt: null, isActive: true },
        include: {
          role: true,
          division: true,
          attendances: true,
          dailyReports: true,
          targetAssignments: { include: { target: true } }
        },
        orderBy: { name: 'asc' }
      })
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SikaryaERP';
    workbook.created = new Date();

    const attendanceSheet = workbook.addWorksheet('Absensi');
    attendanceSheet.columns = [
      { header: 'Tanggal', key: 'date', width: 15 },
      { header: 'Nama', key: 'name', width: 25 },
      { header: 'Role', key: 'role', width: 15 },
      { header: 'Divisi', key: 'division', width: 15 },
      { header: 'Check In', key: 'checkIn', width: 15 },
      { header: 'Check Out', key: 'checkOut', width: 15 },
      { header: 'Total Jam', key: 'totalHours', width: 12 },
      { header: 'Status', key: 'status', width: 15 }
    ];
    attendances.forEach((a) => attendanceSheet.addRow({
      date: format(new Date(a.date), 'yyyy-MM-dd'),
      name: a.user.name,
      role: a.user.role.name,
      division: a.user.division.name,
      checkIn: a.checkIn ? format(new Date(a.checkIn), 'HH:mm:ss') : '-',
      checkOut: a.checkOut ? format(new Date(a.checkOut), 'HH:mm:ss') : '-',
      totalHours: a.totalHours || 0,
      status: a.status
    }));

    const productionSheet = workbook.addWorksheet('Produksi');
    productionSheet.columns = [
      { header: 'Tanggal', key: 'date', width: 15 },
      { header: 'Kode Produk', key: 'code', width: 15 },
      { header: 'Produk', key: 'name', width: 25 },
      { header: 'Qty Produksi', key: 'quantity', width: 14 },
      { header: 'Qty Reject', key: 'rejectQty', width: 12 },
      { header: 'Qty Stok Masuk', key: 'acceptedQty', width: 16 },
      { header: 'Catatan', key: 'notes', width: 30 }
    ];
    productionRecords.forEach((r) => productionSheet.addRow({
      date: format(new Date(r.date), 'yyyy-MM-dd'),
      code: r.product.code,
      name: r.product.name,
      quantity: r.quantity,
      rejectQty: r.rejectQty,
      acceptedQty: Math.max(0, r.quantity - r.rejectQty),
      notes: r.notes || '-'
    }));

    const purchaseSheet = workbook.addWorksheet('Purchasing');
    purchaseSheet.columns = [
      { header: 'Tanggal', key: 'date', width: 15 },
      { header: 'Item', key: 'itemName', width: 25 },
      { header: 'Qty', key: 'quantity', width: 12 },
      { header: 'Harga Satuan', key: 'unitPrice', width: 16 },
      { header: 'Total', key: 'totalPrice', width: 16 },
      { header: 'Supplier', key: 'supplier', width: 20 }
    ];
    purchases.forEach((p) => purchaseSheet.addRow({
      date: format(new Date(p.date), 'yyyy-MM-dd'),
      itemName: p.itemName,
      quantity: p.quantity,
      unitPrice: p.unitPrice,
      totalPrice: p.totalPrice,
      supplier: p.supplier || '-'
    }));

    const cashierSheet = workbook.addWorksheet('Kasir');
    cashierSheet.columns = [
      { header: 'Tanggal', key: 'date', width: 15 },
      { header: 'Cabang', key: 'branch', width: 25 },
      { header: 'Cash', key: 'cash', width: 14 },
      { header: 'Transfer', key: 'transfer', width: 14 },
      { header: 'QRIS', key: 'qris', width: 14 },
      { header: 'Expense', key: 'expense', width: 14 },
      { header: 'Net Total', key: 'netTotal', width: 16 }
    ];
    cashierReports.forEach((c) => cashierSheet.addRow({
      date: format(new Date(c.date), 'yyyy-MM-dd'),
      branch: c.branch.name,
      cash: c.totalCash,
      transfer: c.totalTransfer,
      qris: c.totalQris,
      expense: c.totalExpense,
      netTotal: c.netTotal
    }));

    const warehouseSheet = workbook.addWorksheet('Stok Gudang');
    warehouseSheet.columns = [
      { header: 'Kode', key: 'code', width: 15 },
      { header: 'Item', key: 'name', width: 25 },
      { header: 'Kategori', key: 'category', width: 18 },
      { header: 'Stok Saat Ini', key: 'currentStock', width: 15 },
      { header: 'Minimum', key: 'minStock', width: 12 },
      { header: 'Unit', key: 'unit', width: 10 },
      { header: 'Status', key: 'status', width: 15 }
    ];
    warehouseItems.forEach((w) => warehouseSheet.addRow({
      code: w.code,
      name: w.name,
      category: w.category,
      currentStock: w.currentStock,
      minStock: w.minStock,
      unit: w.unit,
      status: w.currentStock <= w.minStock ? 'STOK MENIPIS' : 'AMAN'
    }));

    const performanceSheet = workbook.addWorksheet('Performa Karyawan');
    performanceSheet.columns = [
      { header: 'Nama', key: 'name', width: 25 },
      { header: 'Role', key: 'role', width: 15 },
      { header: 'Divisi', key: 'division', width: 15 },
      { header: 'Hari Absensi', key: 'attendanceDays', width: 14 },
      { header: 'Laporan', key: 'reportDays', width: 12 },
      { header: 'Progress Target %', key: 'targetProgress', width: 18 }
    ];
    users.forEach((u) => {
      const targetProgress = u.targetAssignments.length === 0
        ? 0
        : Math.round(u.targetAssignments.reduce((sum, t) => sum + Math.min(100, (t.currentValue / Math.max(1, t.target.targetValue)) * 100), 0) / u.targetAssignments.length);
      performanceSheet.addRow({
        name: u.name,
        role: u.role.name,
        division: u.division.name,
        attendanceDays: u.attendances.length,
        reportDays: u.dailyReports.length,
        targetProgress
      });
    });

    for (const sheet of workbook.worksheets) {
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=' + `SikaryaERP_Statistik_Lengkap_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export all statistics error:', error);
    return errorResponse(res, 'Gagal export semua statistik', null, 500);
  }
};

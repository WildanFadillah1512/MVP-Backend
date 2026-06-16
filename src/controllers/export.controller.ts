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

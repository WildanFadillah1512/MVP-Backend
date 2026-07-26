import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

const DEFAULT_CORE_VALUES = {
  values: [
    { title: 'Disiplin Operasional', description: 'Datang, melapor, dan menyelesaikan pekerjaan sesuai jadwal yang disepakati.' },
    { title: 'Jujur Pada Data', description: 'Angka produksi, gudang, kasir, dan laporan harian dicatat apa adanya.' },
    { title: 'Tanggung Jawab Sampai Tuntas', description: 'Setiap tugas punya pemilik, deadline, update status, dan penyelesaian yang jelas.' },
    { title: 'Koordinasi Antar Divisi', description: 'Produksi, Gudang, Purchasing, Kasir, dan Manajemen saling memberi informasi yang dibutuhkan.' },
    { title: 'Perbaikan Berkelanjutan', description: 'Masalah dicatat, dievaluasi, lalu diperbaiki agar tidak berulang.' }
  ],
  principles: [
    'Keamanan orang dan kualitas produk.',
    'Akurasi data dan stok.',
    'Kecepatan eksekusi tanpa melanggar alur approval.'
  ],
  files: []
};

const DEFAULT_EVENT_THEME = {
  enabled: false,
  name: '',
  theme: 'default'
};

const readJsonSetting = async (key: string, fallback: any) => {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  if (!setting?.value) return fallback;
  try {
    return JSON.parse(setting.value);
  } catch {
    return fallback;
  }
};

export const getCoreValues = async (req: Request, res: Response) => {
  try {
    const data = await readJsonSetting('CORE_VALUES_CONFIG', DEFAULT_CORE_VALUES);
    return successResponse(res, data, 'Etos kerja berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil etos kerja', null, 500);
  }
};

export const updateCoreValues = async (req: Request, res: Response) => {
  try {
    const { values, principles, files } = req.body;
    const payload = {
      values: Array.isArray(values) ? values : DEFAULT_CORE_VALUES.values,
      principles: Array.isArray(principles) ? principles : DEFAULT_CORE_VALUES.principles,
      files: Array.isArray(files) ? files : []
    };

    const setting = await prisma.systemSetting.upsert({
      where: { key: 'CORE_VALUES_CONFIG' },
      update: { value: JSON.stringify(payload), description: 'Custom etos kerja, value, prinsip, dan lampiran CEO' },
      create: {
        key: 'CORE_VALUES_CONFIG',
        value: JSON.stringify(payload),
        description: 'Custom etos kerja, value, prinsip, dan lampiran CEO'
      }
    });

    await writeAuditLog(req, 'UPDATE', 'CORE_VALUES', 'Etos kerja dan value diperbarui');
    return successResponse(res, JSON.parse(setting.value), 'Etos kerja berhasil diperbarui');
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal memperbarui etos kerja', null, 500);
  }
};

export const getEventTheme = async (req: Request, res: Response) => {
  try {
    const data = await readJsonSetting('EVENT_THEME_CONFIG', DEFAULT_EVENT_THEME);
    return successResponse(res, data, 'Tema event berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Gagal mengambil tema event', null, 500);
  }
};

export const updateEventTheme = async (req: Request, res: Response) => {
  try {
    const { enabled, name, theme } = req.body;
    const payload = {
      enabled: Boolean(enabled),
      name: name ? String(name).trim() : '',
      theme: ['default', 'fitri', 'year-end', 'independence'].includes(theme) ? theme : 'default'
    };

    const setting = await prisma.systemSetting.upsert({
      where: { key: 'EVENT_THEME_CONFIG' },
      update: { value: JSON.stringify(payload), description: 'Tema visual event aktif' },
      create: {
        key: 'EVENT_THEME_CONFIG',
        value: JSON.stringify(payload),
        description: 'Tema visual event aktif'
      }
    });

    await writeAuditLog(req, 'UPDATE', 'EVENT_THEME', `Tema event diubah: ${payload.theme}`);
    return successResponse(res, JSON.parse(setting.value), 'Tema event berhasil diperbarui');
  } catch (error: any) {
    return errorResponse(res, error.message || 'Gagal memperbarui tema event', null, 500);
  }
};

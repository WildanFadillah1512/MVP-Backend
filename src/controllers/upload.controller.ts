import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { uploadToGoogleDrive } from '../services/gdrive.service';
import path from 'path';

const getPublicFileUrl = (req: Request, filePath: string) => {
  const configuredBaseUrl = process.env.PUBLIC_BASE_URL || process.env.BACKEND_PUBLIC_URL;
  const protocol = (req.headers['x-forwarded-proto']?.toString().split(',')[0] || req.protocol || 'http');
  const host = req.get('host');
  const baseUrl = configuredBaseUrl || `${protocol}://${host}`;
  return `${baseUrl.replace(/\/$/, '')}/uploads/${path.basename(filePath)}`;
};

export const uploadDailyFile = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user; // Set via auth middleware
    const file = req.file;

    if (!file) {
      return errorResponse(res, 'File tidak ditemukan', null, 400);
    }

    // Get full user details for naming
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { division: true }
    });

    if (!fullUser) {
      return errorResponse(res, 'User tidak valid', null, 400);
    }

    // Attempt GDrive Upload
    let driveResult;
    try {
      driveResult = await uploadToGoogleDrive(
        file.path, // Use path instead of buffer
        file.originalname, 
        file.mimetype, 
        fullUser.division.name, 
        fullUser.name
      );
      
      // Delete temporary file after successful upload
      const fs = require('fs');
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (gdriveError: any) {
      console.error('Daily upload Google Drive failed, using local fallback:', gdriveError.message);
      driveResult = {
        fileId: 'LOCAL_FALLBACK',
        fileUrl: getPublicFileUrl(req, file.path),
      };
    }

    // Save metadata to Database
    const uploadRecord = await prisma.dailyUpload.create({
      data: {
        userId: fullUser.id,
        fileName: file.originalname,
        fileUrl: driveResult.fileUrl,
        fileType: file.mimetype,
        status: 'PENDING'
      }
    });

    return successResponse(res, uploadRecord, driveResult.fileId === 'LOCAL_FALLBACK' ? 'File tersimpan sementara di server' : 'File berhasil diunggah ke Google Drive dan Database');
  } catch (error) {
    console.error('Upload error:', error);
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

export const getMyUploads = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const uploads = await prisma.dailyUpload.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, uploads, 'Data unggahan berhasil ditarik');
  } catch (error) {
    return errorResponse(res, 'Gagal menarik data unggahan', null, 500);
  }
};

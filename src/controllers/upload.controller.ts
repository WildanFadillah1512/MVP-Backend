import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';
import { uploadToGoogleDrive } from '../services/gdrive.service';

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
      // Delete temporary file even on failure
      const fs = require('fs');
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      
      // If GDrive fails (likely because credentials aren't set up yet by the user), 
      // fallback to mock success but return error message in data for development.
      console.error(gdriveError);
      return errorResponse(res, 'Google Drive belum dikonfigurasi oleh Administrator (Kredensial Service Account belum ada).', null, 500);
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

    return successResponse(res, uploadRecord, 'File berhasil diunggah ke Google Drive dan Database');
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

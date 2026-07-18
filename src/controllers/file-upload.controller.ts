import { Request, Response } from 'express';
import { errorResponse, successResponse } from '../utils/response';
import { getDriveFileStream, uploadToGDrive } from '../services/gdrive.service';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/prisma';

const MAX_PROFILE_PHOTO_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_CHAT_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_PROFILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const getUploadDir = () => {
  const uploadDir = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  return uploadDir;
};

const getPublicFileUrl = (req: Request, filePath: string) => {
  const configuredBaseUrl = process.env.PUBLIC_BASE_URL || process.env.BACKEND_PUBLIC_URL;
  const protocol = (req.headers['x-forwarded-proto']?.toString().split(',')[0] || req.protocol || 'http');
  const host = req.get('host');
  const baseUrl = configuredBaseUrl || `${protocol}://${host}`;
  return `${baseUrl.replace(/\/$/, '')}/uploads/${path.basename(filePath)}`;
};

const localUploadResponse = (req: Request, file: formidable.File, message: string) => ({
  fileUrl: getPublicFileUrl(req, file.filepath),
  fileName: file.originalFilename,
  fileSize: file.size,
  fileType: file.mimetype,
  storage: 'LOCAL_FALLBACK',
  warning: message
});

const getUploaderFolderName = async (req: Request) => {
  const tokenUser = (req as any).user;
  if (!tokenUser?.id) return 'Unknown_Uploader';

  const user = await prisma.user.findUnique({
    where: { id: tokenUser.id },
    select: { name: true, role: { select: { name: true } }, division: { select: { name: true } } }
  }).catch(() => null);

  return user?.name || `${tokenUser.role || 'Unknown'}_${tokenUser.division || 'NONE'}`;
};

export const streamDriveFile = async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    if (!fileId) {
      return errorResponse(res, 'File ID tidak valid', null, 400);
    }

    const { metadata, stream } = await getDriveFileStream(fileId);

    if (metadata.mimeType) {
      res.setHeader('Content-Type', metadata.mimeType);
    }
    if (metadata.size) {
      res.setHeader('Content-Length', metadata.size);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    return stream.pipe(res);
  } catch (error: any) {
    console.error('Google Drive stream error:', error.message);
    return errorResponse(res, 'Gagal membaca file Google Drive', null, 404);
  }
};

export const uploadProfilePhoto = async (req: Request, res: Response) => {
  try {
    const form = formidable({
      maxFileSize: MAX_PROFILE_PHOTO_SIZE,
      uploadDir: getUploadDir(),
      keepExtensions: true
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return errorResponse(res, 'Gagal upload foto: ' + err.message, null, 400);
      }

      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file) {
        return errorResponse(res, 'Tidak ada file yang diupload', null, 400);
      }

      // Validate file type
      if (!ALLOWED_PROFILE_TYPES.includes(file.mimetype || '')) {
        fs.unlinkSync(file.filepath);
        return errorResponse(res, 'Format file harus JPG, PNG, atau WebP', null, 400);
      }

      // Validate file size
      if (file.size > MAX_PROFILE_PHOTO_SIZE) {
        fs.unlinkSync(file.filepath);
        return errorResponse(res, 'Ukuran foto maksimal 2MB', null, 400);
      }

      try {
        const uploaderName = await getUploaderFolderName(req);
        // Upload to Google Drive
        const gdLink = await uploadToGDrive(file.filepath, file.originalFilename || 'profile.jpg', 'PROFILE_PHOTOS', uploaderName);
        
        // Delete local file
        fs.unlinkSync(file.filepath);

        return successResponse(res, { 
          fileUrl: gdLink,
          fileName: file.originalFilename,
          fileSize: file.size,
          fileType: file.mimetype,
          storage: 'GOOGLE_DRIVE'
        }, 'Foto profil berhasil diupload');
      } catch (uploadError: any) {
        console.error('Profile photo Google Drive upload failed, using local fallback:', uploadError.message);
        return successResponse(res, localUploadResponse(req, file, uploadError.message), 'Foto profil tersimpan sementara di server');
      }
    });
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};

export const uploadChatFile = async (req: Request, res: Response) => {
  try {
    const form = formidable({
      maxFileSize: MAX_CHAT_FILE_SIZE,
      uploadDir: getUploadDir(),
      keepExtensions: true
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return errorResponse(res, 'Gagal upload file: ' + err.message, null, 400);
      }

      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file) {
        return errorResponse(res, 'Tidak ada file yang diupload', null, 400);
      }

      // Validate file size
      if (file.size > MAX_CHAT_FILE_SIZE) {
        fs.unlinkSync(file.filepath);
        return errorResponse(res, 'Ukuran file maksimal 10MB', null, 400);
      }

      try {
        const uploaderName = await getUploaderFolderName(req);
        // Upload to Google Drive
        const gdLink = await uploadToGDrive(file.filepath, file.originalFilename || 'file', 'CHAT_ATTACHMENTS', uploaderName);
        
        // Delete local file
        fs.unlinkSync(file.filepath);

        return successResponse(res, { 
          fileUrl: gdLink,
          fileName: file.originalFilename,
          fileSize: file.size,
          fileType: file.mimetype,
          storage: 'GOOGLE_DRIVE'
        }, 'File berhasil diupload');
      } catch (uploadError: any) {
        console.error('Chat file Google Drive upload failed, using local fallback:', uploadError.message);
        return successResponse(res, localUploadResponse(req, file, uploadError.message), 'File tersimpan sementara di server');
      }
    });
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};

export const uploadGenericFile = async (req: Request, res: Response) => {
  try {
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024, // 20MB
      uploadDir: getUploadDir(),
      keepExtensions: true
    });

    form.parse(req, async (err, fields, files) => {
      if (err) {
        return errorResponse(res, 'Gagal upload file: ' + err.message, null, 400);
      }

      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      if (!file) {
        return errorResponse(res, 'Tidak ada file yang diupload', null, 400);
      }

      const folderField = Array.isArray(fields.folderType) ? fields.folderType[0] : fields.folderType;
      const folderType = folderField || 'GENERAL';

      try {
        const uploaderName = await getUploaderFolderName(req);
        // Upload to Google Drive
        const gdLink = await uploadToGDrive(file.filepath, file.originalFilename || 'file', folderType, uploaderName);
        
        // Delete local file
        fs.unlinkSync(file.filepath);

        return successResponse(res, { 
          fileUrl: gdLink,
          fileName: file.originalFilename,
          fileSize: file.size,
          fileType: file.mimetype,
          storage: 'GOOGLE_DRIVE'
        }, 'File berhasil diupload');
      } catch (uploadError: any) {
        console.error('Generic file Google Drive upload failed, using local fallback:', uploadError.message);
        return successResponse(res, localUploadResponse(req, file, uploadError.message), 'File tersimpan sementara di server');
      }
    });
  } catch (error: any) {
    return errorResponse(res, error.message, null, 500);
  }
};

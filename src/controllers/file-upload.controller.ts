import { Request, Response } from 'express';
import { errorResponse, successResponse } from '../utils/response';
import { uploadToGDrive } from '../services/gdrive.service';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

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
        // Upload to Google Drive
        const gdLink = await uploadToGDrive(file.filepath, file.originalFilename || 'profile.jpg', 'PROFILE_PHOTOS');
        
        // Delete local file
        fs.unlinkSync(file.filepath);

        return successResponse(res, { 
          fileUrl: gdLink,
          fileName: file.originalFilename,
          fileSize: file.size,
          fileType: file.mimetype
        }, 'Foto profil berhasil diupload');
      } catch (uploadError: any) {
        fs.unlinkSync(file.filepath);
        return errorResponse(res, 'Gagal upload ke Google Drive: ' + uploadError.message, 500);
      }
    });
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
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
        // Upload to Google Drive
        const gdLink = await uploadToGDrive(file.filepath, file.originalFilename || 'file', 'CHAT_ATTACHMENTS');
        
        // Delete local file
        fs.unlinkSync(file.filepath);

        return successResponse(res, { 
          fileUrl: gdLink,
          fileName: file.originalFilename,
          fileSize: file.size,
          fileType: file.mimetype
        }, 'File berhasil diupload');
      } catch (uploadError: any) {
        fs.unlinkSync(file.filepath);
        return errorResponse(res, 'Gagal upload ke Google Drive: ' + uploadError.message, 500);
      }
    });
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
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
        // Upload to Google Drive
        const gdLink = await uploadToGDrive(file.filepath, file.originalFilename || 'file', folderType);
        
        // Delete local file
        fs.unlinkSync(file.filepath);

        return successResponse(res, { 
          fileUrl: gdLink,
          fileName: file.originalFilename,
          fileSize: file.size,
          fileType: file.mimetype
        }, 'File berhasil diupload');
      } catch (uploadError: any) {
        if (fs.existsSync(file.filepath)) {
          fs.unlinkSync(file.filepath);
        }
        return errorResponse(res, 'Gagal upload ke Google Drive: ' + uploadError.message, 500);
      }
    });
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

import { google } from 'googleapis';
import { format } from 'date-fns';
import fs from 'fs';
import path from 'path';

const MAIN_FOLDER_ID = process.env.GDRIVE_MAIN_FOLDER_ID || '1LcuiL-H8ibHkMAID6mhJtfCk89bTxsEa';

// Folder mapping for different file types
const FOLDER_TYPES: Record<string, string> = {
  'DAILY_UPLOADS': 'Daily_Uploads',
  'PROFILE_PHOTOS': 'Profile_Photos',
  'CHAT_ATTACHMENTS': 'Chat_Attachments',
  'PURCHASE_RECEIPTS': 'Purchase_Receipts',
  'PAYROLL_DOCS': 'Payroll_Documents',
  'CASHIER_DEPOSITS': 'Cashier_Deposits',
  'BACKUPS': 'Backups',
  'GENERAL': 'General_Files'
};

const DAILY_FOLDER_TYPES = new Set(['DAILY_UPLOADS']);

let _drive: ReturnType<typeof google.drive> | null = null;

function getGoogleAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const scopes = ['https://www.googleapis.com/auth/drive'];

  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }

  if (!credentials) {
    return new google.auth.GoogleAuth({
      keyFile: './google-credentials.json',
      scopes,
    });
  }

  const trimmed = credentials.trim();

  if (trimmed.startsWith('{')) {
    return new google.auth.GoogleAuth({
      credentials: JSON.parse(trimmed),
      scopes,
    });
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded.trim().startsWith('{')) {
      return new google.auth.GoogleAuth({
        credentials: JSON.parse(decoded),
        scopes,
      });
    }
  } catch {
    // Not base64 JSON, treat it as a file path below.
  }

  const normalizedPath = path.resolve(process.cwd(), trimmed.replace(/^["']|["']$/g, ''));
  return new google.auth.GoogleAuth({
    keyFile: fs.existsSync(normalizedPath) ? normalizedPath : trimmed,
    scopes,
  });
}

function getDrive() {
  if (!_drive) {
    const auth = getGoogleAuth();
    _drive = google.drive({ version: 'v3', auth });
  }
  return _drive;
}

const escapeDriveQueryValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const sanitizeFolderName = (value?: string | null) => {
  const cleaned = (value || 'Unknown_Uploader')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);

  return cleaned || 'Unknown_Uploader';
};

const getPublicBaseUrl = () => (
  process.env.PUBLIC_BASE_URL ||
  process.env.BACKEND_PUBLIC_URL ||
  ''
).replace(/\/$/, '');

async function getOrCreateChildFolder(parentFolderId: string, folderName: string): Promise<string> {
  try {
    const response = await getDrive().files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${escapeDriveQueryValue(folderName)}' and '${parentFolderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    };

    const folder = await getDrive().files.create({
      requestBody: fileMetadata,
      fields: 'id',
      supportsAllDrives: true
    });

    return folder.data.id!;
  } catch (error) {
    console.error('Error creating/finding GDrive folder:', error);
    throw new Error('Gagal menyiapkan folder Google Drive');
  }
}

async function getUploadFolder(folderType: string, uploaderName?: string | null): Promise<string> {
  const folderName = FOLDER_TYPES[folderType] || FOLDER_TYPES['GENERAL'];

  try {
    const categoryFolderId = await getOrCreateChildFolder(MAIN_FOLDER_ID, folderName);
    const periodFolderName = DAILY_FOLDER_TYPES.has(folderType)
      ? format(new Date(), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM');
    const periodFolderId = await getOrCreateChildFolder(categoryFolderId, periodFolderName);

    if (!uploaderName) {
      return periodFolderId;
    }

    return getOrCreateChildFolder(periodFolderId, sanitizeFolderName(uploaderName));
  } catch (error) {
    console.error('Error creating/finding GDrive subfolder:', error);
    console.warn(`Falling back to main Google Drive folder for folder type ${folderType}`);
    return MAIN_FOLDER_ID;
  }
}

export function getDriveFileProxyUrl(fileId: string): string {
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  return `${baseUrl}/api/file-upload/drive-file/${fileId}`;
}

export async function getDriveFileStream(fileId: string) {
  const metadata = await getDrive().files.get({
    fileId,
    fields: 'id, name, mimeType, size',
    supportsAllDrives: true
  });

  const streamResponse = await getDrive().files.get(
    {
      fileId,
      alt: 'media',
      supportsAllDrives: true
    } as any,
    { responseType: 'stream' } as any
  );

  return {
    metadata: metadata.data,
    stream: streamResponse.data as NodeJS.ReadableStream
  };
}

export async function uploadToGoogleDrive(
  filePath: string,
  originalName: string,
  mimeType: string,
  divisionName: string,
  userName: string
): Promise<{ fileId: string; fileUrl: string }> {
  try {
    const parentFolderId = await getUploadFolder('DAILY_UPLOADS', userName);

    const safeDivision = divisionName.toUpperCase().replace(/\s+/g, '');
    const safeUser = userName.replace(/\s+/g, '_');
    const formattedName = `[${safeDivision}]_${safeUser}_${originalName}`;

    // Use fs.createReadStream instead of memory buffer
    const fileStream = fs.createReadStream(filePath);

    const fileMetadata = {
      name: formattedName,
      parents: [parentFolderId],
    };

    const media = {
      mimeType: mimeType,
      body: fileStream,
    };

    const file = await getDrive().files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
      supportsAllDrives: true
    });

    return {
      fileId: file.data.id!,
      fileUrl: getDriveFileProxyUrl(file.data.id!),
    };
  } catch (error: any) {
    console.error('Google Drive Upload Error:', error.message);
    throw new Error('Gagal mengupload file ke Google Drive.');
  }
}


export async function uploadToGDrive(
  filePath: string,
  originalName: string,
  folderType: string = 'GENERAL',
  uploaderName?: string | null
): Promise<string> {
  try {
    const parentFolderId = await getUploadFolder(folderType, uploaderName);

    const timestamp = new Date().getTime();
    const formattedName = `${timestamp}_${originalName}`;

    const fileStream = fs.createReadStream(filePath);

    const fileMetadata = {
      name: formattedName,
      parents: [parentFolderId],
    };

    const media = {
      body: fileStream,
    };

    const file = await getDrive().files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
      supportsAllDrives: true
    });

    // Make file publicly accessible
    await getDrive().permissions.create({
      fileId: file.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      supportsAllDrives: true
    });

    return getDriveFileProxyUrl(file.data.id!);
  } catch (error: any) {
    console.error('Google Drive Upload Error:', error.message);
    throw new Error('Gagal mengupload file ke Google Drive: ' + error.message);
  }
}

import { google } from 'googleapis';
import stream from 'stream';
import { format } from 'date-fns';

const MAIN_FOLDER_ID = process.env.GDRIVE_MAIN_FOLDER_ID || '1LcuiL-H8ibHkMAID6mhJtfCk89bTxsEa';

// Folder mapping for different file types
const FOLDER_TYPES: Record<string, string> = {
  'DAILY_UPLOADS': 'Daily_Uploads',
  'PROFILE_PHOTOS': 'Profile_Photos',
  'CHAT_ATTACHMENTS': 'Chat_Attachments',
  'PURCHASE_RECEIPTS': 'Purchase_Receipts',
  'PAYROLL_DOCS': 'Payroll_Documents',
  'BACKUPS': 'Backups',
  'GENERAL': 'General_Files'
};

let _drive: ReturnType<typeof google.drive> | null = null;

function getDrive() {
  if (!_drive) {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || './google-credentials.json',
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    _drive = google.drive({ version: 'v3', auth });
  }
  return _drive;
}


async function getOrCreateDailyFolder(): Promise<string> {
  const dateFolderName = format(new Date(), 'yyyy-MM-dd');

  try {
    const response = await getDrive().files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${dateFolderName}' and '${MAIN_FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!;
    }

    const fileMetadata = {
      name: dateFolderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [MAIN_FOLDER_ID],
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

async function getOrCreateSubFolder(folderType: string): Promise<string> {
  const folderName = FOLDER_TYPES[folderType] || FOLDER_TYPES['GENERAL'];

  try {
    const response = await getDrive().files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${MAIN_FOLDER_ID}' in parents and trashed=false`,
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
      parents: [MAIN_FOLDER_ID],
    };

    const folder = await getDrive().files.create({
      requestBody: fileMetadata,
      fields: 'id',
      supportsAllDrives: true
    });

    return folder.data.id!;
  } catch (error) {
    console.error('Error creating/finding GDrive subfolder:', error);
    throw new Error('Gagal menyiapkan folder Google Drive');
  }
}

export async function uploadToGoogleDrive(
  filePath: string,
  originalName: string,
  mimeType: string,
  divisionName: string,
  userName: string
): Promise<{ fileId: string; fileUrl: string }> {
  try {
    const parentFolderId = await getOrCreateDailyFolder();

    const safeDivision = divisionName.toUpperCase().replace(/\s+/g, '');
    const safeUser = userName.replace(/\s+/g, '_');
    const formattedName = `[${safeDivision}]_${safeUser}_${originalName}`;

    // Use fs.createReadStream instead of memory buffer
    const fs = require('fs');
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
      fileUrl: file.data.webViewLink!,
    };
  } catch (error: any) {
    console.error('Google Drive Upload Error:', error.message);
    throw new Error('Gagal mengupload file ke Google Drive.');
  }
}


export async function uploadToGDrive(
  filePath: string,
  originalName: string,
  folderType: string = 'GENERAL'
): Promise<string> {
  try {
    const parentFolderId = await getOrCreateSubFolder(folderType);

    const timestamp = new Date().getTime();
    const formattedName = `${timestamp}_${originalName}`;

    const fs = require('fs');
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

    // Return direct link
    const directLink = `https://drive.google.com/uc?export=view&id=${file.data.id}`;
    return directLink;
  } catch (error: any) {
    console.error('Google Drive Upload Error:', error.message);
    throw new Error('Gagal mengupload file ke Google Drive: ' + error.message);
  }
}

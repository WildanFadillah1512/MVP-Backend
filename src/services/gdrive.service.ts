import { google } from 'googleapis';
import stream from 'stream';
import { format } from 'date-fns';

const MAIN_FOLDER_ID = process.env.GDRIVE_MAIN_FOLDER_ID || '1LcuiL-H8ibHkMAID6mhJtfCk89bTxsEa';

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
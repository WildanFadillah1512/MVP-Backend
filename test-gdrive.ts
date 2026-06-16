import { uploadToGoogleDrive } from './src/services/gdrive.service';
import * as fs from 'fs';
import * as path from 'path';

async function testUpload() {
  try {
    console.log('Memulai tes upload ke Google Drive...');
    
    // Create a simple test text file in memory
    const testContent = "Ini adalah file testing upload dari sistem internal operasional perusahaan.";
    const buffer = Buffer.from(testContent, 'utf-8');
    
    console.log('Mencoba mengupload file...');
    const result = await uploadToGoogleDrive(
      buffer,
      'test-upload-system.txt',
      'text/plain',
      'IT_TEST',
      'System Admin'
    );
    
    console.log('✅ UPLOAD BERHASIL!');
    console.log('File ID:', result.fileId);
    console.log('File URL:', result.fileUrl);
    console.log('Silakan cek folder Google Drive Anda.');
    
  } catch (error: any) {
    console.error('❌ UPLOAD GAGAL:');
    console.error(error.message);
  }
}

testUpload();

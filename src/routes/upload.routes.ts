import { Router } from 'express';
import multer from 'multer';
import { uploadDailyFile, getMyUploads } from '../controllers/upload.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// Store file in temp disk storage instead of memory to prevent OOM
import fs from 'fs';
import path from 'path';

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max limit
});

router.use(authenticate);
router.post('/', upload.single('file'), uploadDailyFile);
router.get('/me', getMyUploads);

export default router;

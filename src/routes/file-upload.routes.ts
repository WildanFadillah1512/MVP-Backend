import { Router } from 'express';
import {
  uploadProfilePhoto,
  uploadChatFile,
  uploadGenericFile,
  streamDriveFile
} from '../controllers/file-upload.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/drive-file/:fileId', streamDriveFile);

router.use(authenticate);

router.post('/profile-photo', uploadProfilePhoto);
router.post('/chat-file', uploadChatFile);
router.post('/generic', uploadGenericFile);

export default router;

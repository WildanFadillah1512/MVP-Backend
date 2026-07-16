import { Router } from 'express';
import {
  uploadProfilePhoto,
  uploadChatFile,
  uploadGenericFile
} from '../controllers/file-upload.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/profile-photo', uploadProfilePhoto);
router.post('/chat-file', uploadChatFile);
router.post('/generic', uploadGenericFile);

export default router;

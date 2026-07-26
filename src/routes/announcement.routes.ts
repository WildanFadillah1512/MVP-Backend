import { Router } from 'express';
import {
  createAnnouncement,
  getActivePopupAnnouncement,
  getAnnouncements,
  updateAnnouncement
} from '../controllers/announcement.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', getAnnouncements);
router.get('/active-popup', getActivePopupAnnouncement);
router.post('/', authorizeRole(['OWNER', 'CEO', 'ADMIN']), createAnnouncement);
router.patch('/:id', authorizeRole(['OWNER', 'CEO', 'ADMIN']), updateAnnouncement);

export default router;

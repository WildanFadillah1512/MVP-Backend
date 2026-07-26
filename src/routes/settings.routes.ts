import { Router } from 'express';
import {
  getCoreValues,
  getEventTheme,
  updateCoreValues,
  updateEventTheme
} from '../controllers/settings.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/core-values', getCoreValues);
router.get('/event-theme', getEventTheme);
router.put('/core-values', authorizeRole(['OWNER', 'CEO', 'ADMIN']), updateCoreValues);
router.put('/event-theme', authorizeRole(['OWNER', 'CEO', 'ADMIN']), updateEventTheme);

export default router;

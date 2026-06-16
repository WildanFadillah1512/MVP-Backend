import { Router } from 'express';
import { exportAttendances, exportProduction } from '../controllers/export.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

// Export only for Manager and above
router.use(authenticate);
router.use(authorizeRole(['CEO', 'ADMIN', 'MANAGER']));

router.get('/attendances', exportAttendances);
router.get('/production', exportProduction);

export default router;

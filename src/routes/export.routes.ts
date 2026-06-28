import { Router } from 'express';
import { exportAttendances, exportProduction, exportAllStatistics } from '../controllers/export.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

// Export only for Manager and above
router.use(authenticate);
router.use(authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']));

router.get('/attendances', exportAttendances);
router.get('/production', exportProduction);
router.get('/all-statistics', exportAllStatistics);

export default router;

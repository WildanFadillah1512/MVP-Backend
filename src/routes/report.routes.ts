import { Router } from 'express';
import { createReport, getMyReports, getLockedReports, unlockReport } from '../controllers/report.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/', createReport);
router.get('/me', getMyReports);
router.get('/locked', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), getLockedReports);
router.patch('/:id/unlock', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), unlockReport);

export default router;

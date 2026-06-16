import { Router } from 'express';
import { getCeoDashboard, getManagerDashboard, getStaffDashboard } from '../controllers/dashboard.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/ceo', getCeoDashboard);
router.get('/manager', getManagerDashboard);
router.get('/leader', getManagerDashboard); // Reusing manager logic for leader for now
router.get('/staff', getStaffDashboard);

export default router;

import { Router } from 'express';
import { createReport, getMyReports } from '../controllers/report.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/', createReport);
router.get('/me', getMyReports);

export default router;

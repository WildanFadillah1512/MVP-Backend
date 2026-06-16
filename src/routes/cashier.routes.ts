import { Router } from 'express';
import { getBranches, createCashierReport, getCashierReports } from '../controllers/cashier.controller';
import { authenticate, authorizeDivision } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/branches', getBranches);
router.get('/reports', getCashierReports);
router.post('/reports', authorizeDivision(['KASIR']), createCashierReport);

export default router;

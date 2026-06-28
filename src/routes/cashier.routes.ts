import { Router } from 'express';
import { getBranches, createBranch, createCashierReport, getCashierReports } from '../controllers/cashier.controller';
import { authenticate, authorizeDivision, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/branches', getBranches);
router.post('/branches', authorizeRole(['OWNER', 'CEO', 'ADMIN']), createBranch);
router.get('/reports', getCashierReports);
router.post('/reports', authorizeDivision(['KASIR']), createCashierReport);

export default router;

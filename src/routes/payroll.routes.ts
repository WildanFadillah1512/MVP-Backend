import { Router } from 'express';
import {
  getPayrolls,
  getPayrollById,
  generatePayroll,
  approvePayroll,
  markPayrollAsPaid,
  updatePayroll,
  deletePayroll
} from '../controllers/payroll.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getPayrolls);
router.get('/:id', getPayrollById);
router.post('/generate', authorizeRole(['CEO', 'OWNER', 'ADMIN', 'MANAGER']), generatePayroll);
router.patch('/:id/approve', authorizeRole(['CEO', 'OWNER']), approvePayroll);
router.patch('/:id/paid', authorizeRole(['CEO', 'OWNER', 'ADMIN']), markPayrollAsPaid);
router.put('/:id', authorizeRole(['CEO', 'OWNER', 'ADMIN', 'MANAGER']), updatePayroll);
router.delete('/:id', authorizeRole(['CEO', 'OWNER']), deletePayroll);

export default router;

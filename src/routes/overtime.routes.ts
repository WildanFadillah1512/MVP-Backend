import { Router } from 'express';
import {
  createOvertimeRequest,
  getMyOvertimeRecords,
  updateOvertimeStatus,
  getAllOvertimeRecords
} from '../controllers/overtime.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/', createOvertimeRequest);
router.get('/me', getMyOvertimeRecords);
router.get('/all', authorizeRole(['OWNER', 'CEO', 'ADMIN', 'GM', 'MANAGER']), getAllOvertimeRecords);
router.patch('/:id/status', authorizeRole(['OWNER', 'CEO', 'ADMIN', 'GM', 'MANAGER']), updateOvertimeStatus);

export default router;

import { Router } from 'express';
import { createLeaveRequest, getMyLeaves, getTeamLeaves, approveLeave, cancelLeave, approveLeaveCancellation } from '../controllers/leave.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/', createLeaveRequest);
router.get('/me', getMyLeaves);
router.get('/team', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), getTeamLeaves);
router.patch('/:id/approve', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), approveLeave);
router.patch('/:id/cancel', cancelLeave);
router.patch('/cancellations/:id/approve', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), approveLeaveCancellation);

export default router;

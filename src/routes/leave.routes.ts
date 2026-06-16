import { Router } from 'express';
import { createLeaveRequest, getMyLeaves, getTeamLeaves, approveLeave } from '../controllers/leave.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/', createLeaveRequest);
router.get('/me', getMyLeaves);
router.get('/team', getTeamLeaves);
router.patch('/:id/approve', approveLeave);

export default router;

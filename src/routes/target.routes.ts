import { Router } from 'express';
import { createTarget, getMyTargets, getTeamTargets, updateProgress } from '../controllers/target.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.post('/', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), createTarget);
router.get('/me', getMyTargets);
router.get('/team', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), getTeamTargets);
router.patch('/:id', updateProgress);

export default router;

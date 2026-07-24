import { Router } from 'express';
import { getShifts, createShift, updateShift, deleteShift } from '../controllers/shift.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getShifts);
router.post('/', authorizeRole(['OWNER', 'CEO', 'ADMIN', 'HR']), createShift);
router.put('/:id', authorizeRole(['OWNER', 'CEO', 'ADMIN', 'HR']), updateShift);
router.delete('/:id', authorizeRole(['OWNER', 'CEO', 'ADMIN', 'HR']), deleteShift);

export default router;

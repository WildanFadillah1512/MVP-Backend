import { Router } from 'express';
import { getHolidays, createHoliday, updateHoliday, deleteHoliday } from '../controllers/holiday.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getHolidays);
router.post('/', authorizeRole(['OWNER', 'CEO', 'ADMIN']), createHoliday);
router.put('/:id', authorizeRole(['OWNER', 'CEO', 'ADMIN']), updateHoliday);
router.delete('/:id', authorizeRole(['OWNER', 'CEO', 'ADMIN']), deleteHoliday);

export default router;

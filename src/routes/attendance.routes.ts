import { Router } from 'express';
import { checkIn, checkOut, getMyAttendance, getLocationLogs } from '../controllers/attendance.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/me', getMyAttendance);

// Tracking Lokasi - Hanya atasan
router.get('/locations', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']), getLocationLogs);

export default router;

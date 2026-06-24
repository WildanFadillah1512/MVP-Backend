import { Router } from 'express';
import { checkIn, checkOut, getMyAttendance, getLocationLogs, getAllAttendanceToday } from '../controllers/attendance.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Semua user bisa check-in, check-out, dan lihat absensi diri sendiri
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/me', getMyAttendance);

// Rekap absensi SEMUA karyawan hari ini - hanya atasan (Owner/CEO/GM/Admin/Manager)
router.get('/today/all', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']), getAllAttendanceToday);

// Tracking Lokasi GPS - hanya atasan
router.get('/locations', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']), getLocationLogs);

export default router;

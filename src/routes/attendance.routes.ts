import { Router } from 'express';
import { checkIn, checkOut, getMyAttendance, getLocationLogs, getAllAttendanceToday, createShiftRequest, getShiftRequests, approveShiftRequest } from '../controllers/attendance.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Semua user bisa check-in, check-out, dan lihat absensi diri sendiri
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/me', getMyAttendance);

// Rekap absensi tim hari ini - atasan melihat sesuai struktur/hak akses
router.get('/today/all', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), getAllAttendanceToday);

// Tracking Lokasi GPS - atasan melihat sesuai struktur/hak akses
router.get('/locations', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), getLocationLogs);

// Shift Requests
router.post('/shift-requests', createShiftRequest);
router.get('/shift-requests', getShiftRequests);
router.patch('/shift-requests/:id/approve', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), approveShiftRequest);

export default router;

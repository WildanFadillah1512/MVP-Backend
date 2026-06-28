import { Router } from 'express';
import { 
  getCeoDashboard, 
  getManagerDashboard, 
  getStaffDashboard,
  getProductionStatistics,
  getCriticalStock,
  getBranchPerformance,
  getEmployeePerformanceLeaderboard
} from '../controllers/dashboard.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Main dashboards
router.get('/owner', authorizeRole(['OWNER', 'CEO', 'ADMIN']), getCeoDashboard);
router.get('/ceo', authorizeRole(['OWNER', 'CEO', 'ADMIN']), getCeoDashboard);
router.get('/gm', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN']), getCeoDashboard);
router.get('/manager', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']), getManagerDashboard);
router.get('/leader', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER', 'LEADER']), getManagerDashboard);
router.get('/staff', getStaffDashboard);

// Additional statistics for CEO/Manager
router.get('/production-stats', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']), getProductionStatistics);
router.get('/critical-stock', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']), getCriticalStock);
router.get('/branch-performance', authorizeRole(['OWNER', 'CEO', 'ADMIN', 'MANAGER']), getBranchPerformance);
router.get('/employee-leaderboard', authorizeRole(['OWNER', 'CEO', 'ADMIN']), getEmployeePerformanceLeaderboard);

export default router;

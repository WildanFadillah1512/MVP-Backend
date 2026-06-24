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
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Main dashboards
router.get('/owner', getCeoDashboard);
router.get('/ceo', getCeoDashboard);
router.get('/gm', getCeoDashboard); // GM can see global stats like CEO
router.get('/manager', getManagerDashboard);
router.get('/leader', getManagerDashboard); // Reusing manager logic for leader for now
router.get('/staff', getStaffDashboard);

// Additional statistics for CEO/Manager
router.get('/production-stats', getProductionStatistics);
router.get('/critical-stock', getCriticalStock);
router.get('/branch-performance', getBranchPerformance);
router.get('/employee-leaderboard', getEmployeePerformanceLeaderboard);

export default router;

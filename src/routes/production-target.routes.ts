import { Router } from 'express';
import {
  getProductionTargets,
  getProductionTargetById,
  createProductionTarget,
  updateProductionTarget,
  deleteProductionTarget,
  getProductionMatrix,
} from '../controllers/production-target.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all production targets (with filters)
router.get('/', getProductionTargets);

// Get production matrix for specific month
router.get('/matrix/:year/:month', getProductionMatrix);

// Get single production target
router.get('/:id', getProductionTargetById);

// Create new production target (CEO, MANAGER only)
router.post('/', authorizeRole(['OWNER', 'CEO', 'GM', 'MANAGER', 'ADMIN']), createProductionTarget);

// Update production target (CEO, MANAGER only)
router.put('/:id', authorizeRole(['OWNER', 'CEO', 'GM', 'MANAGER', 'ADMIN']), updateProductionTarget);

// Delete production target (CEO, ADMIN only)
router.delete('/:id', authorizeRole(['OWNER', 'CEO', 'GM', 'MANAGER', 'ADMIN']), deleteProductionTarget);

export default router;

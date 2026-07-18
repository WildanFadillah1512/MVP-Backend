import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import {
  createMaterialRequest,
  fulfillMaterialRequest,
  getMaterialRequests,
  rejectMaterialRequest
} from '../controllers/material-request.controller';

const router = Router();

router.use(authenticate);

router.get('/', getMaterialRequests);
router.post('/', createMaterialRequest);
router.patch('/:id/fulfill', fulfillMaterialRequest);
router.patch('/:id/reject', rejectMaterialRequest);

export default router;

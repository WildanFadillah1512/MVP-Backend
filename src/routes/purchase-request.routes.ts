import { Router } from 'express';
import {
  createPurchaseRequest,
  submitToPurchasing,
  setPriceAndSupplier,
  managerApprove,
  ceoApprove,
  rejectPurchaseRequest,
  markAsPurchased,
  getPurchaseRequests,
  getPurchaseRequestById,
  getSupplierOptionsForItem
} from '../controllers/purchase-request.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getPurchaseRequests);
router.get('/suppliers/:warehouseItemId', getSupplierOptionsForItem);
router.get('/:id', getPurchaseRequestById);

router.post('/', createPurchaseRequest);
router.patch('/:id/submit', submitToPurchasing);
router.patch('/:id/set-price', setPriceAndSupplier);
router.patch('/:id/manager-approve', authorizeRole(['MANAGER']), managerApprove);
router.patch('/:id/ceo-approve', authorizeRole(['CEO', 'OWNER']), ceoApprove);
router.patch('/:id/reject', authorizeRole(['MANAGER', 'CEO', 'OWNER']), rejectPurchaseRequest);
router.patch('/:id/purchased', markAsPurchased);

export default router;

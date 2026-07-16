import { Router } from 'express';
import {
  getSuppliers,
  createSupplier,
  approveSupplier,
  setSupplierPrice,
  getSupplierPrices,
  updateSupplier,
  deleteSupplier
} from '../controllers/supplier.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getSuppliers);
router.post('/', authorizeRole(['MANAGER', 'CEO', 'OWNER', 'GM']), createSupplier);
router.patch('/:id/approve', authorizeRole(['MANAGER', 'CEO', 'OWNER', 'GM']), approveSupplier);
router.post('/prices', authorizeRole(['CEO', 'OWNER']), setSupplierPrice);
router.get('/prices', getSupplierPrices);
router.put('/:id', authorizeRole(['MANAGER', 'CEO', 'OWNER', 'GM']), updateSupplier);
router.delete('/:id', authorizeRole(['CEO', 'OWNER']), deleteSupplier);

export default router;

import { Router } from 'express';
import { getProducts, createProductionRecord, getProductionRecords, useMaterials } from '../controllers/production.controller';
import { authenticate, authorizeDivision } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Limit write access to PRODUKSI division, CEO, and ADMIN
router.post('/records', authorizeDivision(['PRODUKSI']), createProductionRecord);
router.post('/materials/use', authorizeDivision(['PRODUKSI']), useMaterials);

// Read access can be broader
router.get('/products', getProducts);
router.get('/records', getProductionRecords);

export default router;

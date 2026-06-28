import { Router } from 'express';
import { getProducts, createProduct, createProductionRecord, getProductionRecords, getProductStockSummary, setInitialProductStock, useMaterials } from '../controllers/production.controller';
import { authenticate, authorizeDivision, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Limit write access to PRODUKSI division, CEO, and ADMIN
router.post('/products', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']), createProduct);
router.post('/stock/initial', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']), setInitialProductStock);
router.post('/records', authorizeDivision(['PRODUKSI']), createProductionRecord);
router.post('/materials/use', authorizeDivision(['PRODUKSI']), useMaterials);

// Read access can be broader
router.get('/products', getProducts);
router.get('/stock', getProductStockSummary);
router.get('/records', getProductionRecords);

export default router;

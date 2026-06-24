import { Router } from 'express';
import { getItems, createMovement, getMovements, getLowStockRecommendations } from '../controllers/warehouse.controller';
import { authenticate, authorizeDivision } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/items', getItems);
router.get('/movements', getMovements);
router.get('/recommendations', getLowStockRecommendations);
router.post('/movements', authorizeDivision(['GUDANG']), createMovement);

export default router;

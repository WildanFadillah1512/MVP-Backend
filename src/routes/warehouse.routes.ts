import { Router } from 'express';
import { getItems, createItem, createMovement, getMovements, getLowStockRecommendations, deleteItem } from '../controllers/warehouse.controller';
import { authenticate, authorizeDivision, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/items', getItems);
router.post('/items', authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']), createItem);
router.delete('/items/:id', deleteItem);
router.get('/movements', getMovements);
router.get('/recommendations', getLowStockRecommendations);
router.post('/movements', authorizeDivision(['GUDANG']), createMovement);

export default router;

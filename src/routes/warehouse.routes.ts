import { Router } from 'express';
import { getItems, createItem, updateItem, createMovement, getMovements, getLowStockRecommendations, deleteItem } from '../controllers/warehouse.controller';
import { authenticate, authorizeDivision, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/items', getItems);
router.post('/items', authorizeRole(['OWNER', 'CEO']), createItem);
router.put('/items/:id', authorizeRole(['OWNER', 'CEO']), updateItem);
router.delete('/items/:id', authorizeRole(['OWNER', 'CEO']), deleteItem);
router.get('/movements', getMovements);
router.get('/recommendations', getLowStockRecommendations);
router.post('/movements', authorizeDivision(['GUDANG']), createMovement);

export default router;

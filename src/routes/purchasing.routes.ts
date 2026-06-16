import { Router } from 'express';
import { createNeed, getNeeds, updateNeedStatus, createPurchase, getPurchases } from '../controllers/purchasing.controller';
import { authenticate, authorizeDivision } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Needs (Everyone can see/request, but Purchasing/Manager/CEO processes it)
router.get('/needs', getNeeds);
router.post('/needs', createNeed);
router.patch('/needs/:id/status', updateNeedStatus);

// Purchases (Only Purchasing, Admin, CEO can write)
router.get('/history', getPurchases);
router.post('/history', authorizeDivision(['PURCHASING']), createPurchase);

export default router;

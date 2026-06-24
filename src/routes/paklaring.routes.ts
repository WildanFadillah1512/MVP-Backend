import { Router } from 'express';
import { getPaklarings, createPaklaring } from '../controllers/paklaring.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.use(authorizeRole(['OWNER', 'CEO']));

router.get('/', getPaklarings);
router.post('/', createPaklaring);

export default router;

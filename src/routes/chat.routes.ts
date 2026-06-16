import { Router } from 'express';
import { getGroups, getMessages, sendMessage } from '../controllers/chat.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/groups', getGroups);
router.get('/groups/:id/messages', getMessages);
router.post('/groups/:id/messages', sendMessage);

export default router;

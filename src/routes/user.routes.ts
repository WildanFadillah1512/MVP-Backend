import { Router } from 'express';
import { getUsers, getUserById, createUser, updateUser, deactivateUser, getUserOptions } from '../controllers/user.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.use(authorizeRole(['CEO', 'ADMIN']));

router.get('/options', getUserOptions);
router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.delete('/:id', deactivateUser);

export default router;

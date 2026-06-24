import { Router } from 'express';
import { getTasks, createTask, updateTaskStatus, getUsers } from '../controllers/task.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// All authenticated users can see tasks
router.get('/', getTasks);
router.get('/users', authorizeRole(['OWNER', 'CEO', 'ADMIN', 'GM', 'MANAGER']), getUsers);

// Only Managers and above can create tasks
router.post('/', authorizeRole(['OWNER', 'CEO', 'ADMIN', 'GM', 'MANAGER']), createTask);

// Anyone can update the status of their task (controller handles detailed authorization)
router.patch('/:id/status', updateTaskStatus);

export default router;

import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deactivateUser,
  getUserOptions,
  updateProfile,
  createDivision,
  requestResignation,
  getResignationRequests,
  createWarningLetter,
  getWarningLetters,
  updateWarningSettings
} from '../controllers/user.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Profile route (accessible to all authenticated users)
router.patch('/profile', updateProfile);
router.post('/resignation', requestResignation);

// Admin routes
router.use(authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']));

router.get('/options', getUserOptions);
router.post('/divisions', createDivision);
router.get('/resignations', getResignationRequests);
router.get('/warnings', getWarningLetters);
router.post('/warnings', createWarningLetter);
router.patch('/warnings/settings', updateWarningSettings);
router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.patch('/:id', updateUser);
router.delete('/:id', deactivateUser);

export default router;

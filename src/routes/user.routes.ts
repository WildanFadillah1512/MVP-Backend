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
  createBranch,
  updateBranch,
  deleteBranch,
  requestResignation,
  getResignationRequests,
  updateResignationRequest,
  getMyDocuments,
  createWarningLetter,
  getWarningLetters,
  updateWarningSettings,
  updateUserPassword
} from '../controllers/user.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Profile route (accessible to all authenticated users)
router.patch('/profile', updateProfile);
router.get('/me/documents', getMyDocuments);
router.post('/resignation', requestResignation);

// Admin routes
router.use(authorizeRole(['OWNER', 'CEO', 'GM', 'ADMIN', 'MANAGER']));

router.get('/options', getUserOptions);
router.post('/divisions', createDivision);
router.post('/branches', createBranch);
router.patch('/branches/:id', updateBranch);
router.delete('/branches/:id', deleteBranch);
router.get('/resignations', getResignationRequests);
router.patch('/resignations/:id', updateResignationRequest);
router.get('/warnings', getWarningLetters);
router.post('/warnings', createWarningLetter);
router.patch('/warnings/settings', updateWarningSettings);
router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.patch('/:id/password', authorizeRole(['OWNER', 'CEO', 'ADMIN']), updateUserPassword);
router.patch('/:id', updateUser);
router.delete('/:id', deactivateUser);

export default router;

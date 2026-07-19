import { Router } from 'express';
import { login, logout, getMe, verifyLoginOtp } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { loginSchema, verifyOtpSchema } from '../validations/auth.validation';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.post('/verify-otp', validate(verifyOtpSchema), verifyLoginOtp);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

export default router;

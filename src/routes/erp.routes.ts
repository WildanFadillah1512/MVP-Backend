import { Router } from 'express';
import prisma from '../utils/prisma';
import { getCustomers, getFinanceLedger, unlockModule } from '../controllers/erp.controller';
import { authenticate, authorizeRole } from '../middlewares/auth.middleware';
import { requireErpUnlock } from '../middlewares/erp.middleware';

const router = Router();

router.use(authenticate);
router.use(authorizeRole(['CEO', 'ADMIN']));

router.get('/crm/customers', requireErpUnlock('CRM'), getCustomers);
router.get('/finance/ledger', requireErpUnlock('FINANCE'), getFinanceLedger);
router.post('/unlock/:module', unlockModule);

// Check lock status for frontend
router.get('/status', async (req, res) => {
  try {
    const configs = await prisma.erpConfig.findMany();
    res.json({ success: true, data: configs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching ERP config' });
  }
});

export default router;

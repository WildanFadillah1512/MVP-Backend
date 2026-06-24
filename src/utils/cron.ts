import cron from 'node-cron';
import prisma from './prisma';
import { ReportStatus, AttendanceStatus } from '@prisma/client';
import { generateSystemWarnings } from '../controllers/notification.controller';
import { createBulkNotifications } from '../services/notification.service';

export const setupCronJobs = () => {
  // Lock daily reports that haven't been submitted after 24 hours
  // Run everyday at 00:05
  cron.schedule('5 0 * * *', async () => {
    console.log('[CRON] Running daily report lock check...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    try {
      const users = await prisma.user.findMany({
        where: { isActive: true, deletedAt: null }
      });

      for (const user of users) {
        const attendance = await prisma.attendance.findUnique({
          where: {
            userId_date: {
              userId: user.id,
              date: yesterday
            }
          }
        });

        if (attendance && [AttendanceStatus.HADIR, AttendanceStatus.TELAT].includes(attendance.status)) {
          const existingReport = await prisma.dailyReport.findUnique({
            where: {
              userId_date: {
                userId: user.id,
                date: yesterday
              }
            }
          });

          if (!existingReport) {
            await prisma.dailyReport.create({
              data: {
                userId: user.id,
                date: yesterday,
                description: 'Locked by system due to 24h timeout',
                status: ReportStatus.LOCKED
              }
            });

            await prisma.notification.create({
              data: {
                userId: user.id,
                title: 'Laporan Harian Terkunci',
                message: 'Laporan harian Anda terkunci karena tidak diisi dalam 24 jam.',
                type: 'WARNING',
                isRead: false
              }
            });

            console.log(`[CRON] Locked report for user ${user.id} on ${yesterday.toISOString()}`);
          }
        }
      }
    } catch (error) {
      console.error('[CRON] Error checking daily reports:', error);
    }
  });

  // Generate warnings every 2 hours during work day
  cron.schedule('0 9-18/2 * * *', async () => {
    console.log('[CRON] Running notification warning generator...');
    await generateSystemWarnings();
  });

  // Check production targets - run every day at 20:00
  cron.schedule('0 20 * * *', async () => {
    console.log('[CRON] Checking production targets...');
    await checkProductionTargets();
  });

  // Check warehouse stock levels - run every day at 08:00
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Checking warehouse stock levels...');
    await checkWarehouseStock();
  });

  // Check late cashier reports - run every day at 09:00
  cron.schedule('0 9 * * *', async () => {
    console.log('[CRON] Checking late cashier reports...');
    await checkLateCashierReports();
  });
};


// Check production targets and send warnings
async function checkProductionTargets() {
  try {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get threshold from system settings
    const thresholdSetting = await prisma.systemSetting.findUnique({
      where: { key: 'TARGET_WARNING_THRESHOLD' }
    });
    const threshold = thresholdSetting ? parseInt(thresholdSetting.value) : 80;

    // Get all targets for current month
    const targets = await prisma.productionTarget.findMany({
      where: {
        targetMonth: currentMonth,
      },
      include: {
        product: true,
      },
    });

    const notifications = [];

    // Get CEO and managers
    const ceoAndManagers = await prisma.user.findMany({
      where: {
        OR: [
          { role: { name: 'CEO' } },
          { role: { name: 'MANAGER' } },
        ],
        isActive: true,
      },
    });

    for (const target of targets) {
      const progress = target.targetQty > 0 ? (target.actualQty / target.targetQty) * 100 : 0;

      if (progress < threshold) {
        const message = `Target produksi ${target.product.name} bulan ini hanya mencapai ${progress.toFixed(1)}% (${target.actualQty}/${target.targetQty}). Segera lakukan tindakan perbaikan!`;

        // Send notification to CEO and managers
        for (const user of ceoAndManagers) {
          notifications.push({
            userId: user.id,
            title: '⚠️ Warning: Target Produksi Rendah',
            message,
            type: 'WARNING',
            link: '/production/targets',
            metadata: {
              productId: target.productId,
              targetId: target.id,
              progress,
            },
          });
        }

        console.log(`[CRON] Warning sent for ${target.product.name} - Progress: ${progress.toFixed(1)}%`);
      }
    }

    if (notifications.length > 0) {
      await createBulkNotifications(notifications);
      console.log(`[CRON] Sent ${notifications.length} production target warnings`);
    } else {
      console.log('[CRON] No production target warnings needed');
    }
  } catch (error) {
    console.error('[CRON] Error checking production targets:', error);
  }
}

// Check warehouse stock levels
async function checkWarehouseStock() {
  try {
    // Get threshold from system settings
    const thresholdSetting = await prisma.systemSetting.findUnique({
      where: { key: 'LOW_STOCK_THRESHOLD' }
    });
    const thresholdPercent = thresholdSetting ? parseInt(thresholdSetting.value) : 20;

    // Get all warehouse items with low stock
    const items = await prisma.warehouseItem.findMany();

    const lowStockItems = items.filter((item) => {
      const stockPercent = item.minStock > 0 ? (item.currentStock / item.minStock) * 100 : 100;
      return stockPercent < thresholdPercent || item.currentStock < item.minStock;
    });

    if (lowStockItems.length === 0) {
      console.log('[CRON] No low stock items found');
      return;
    }

    // Get CEO, managers, and purchasing staff
    const targetUsers = await prisma.user.findMany({
      where: {
        OR: [
          { role: { name: 'CEO' } },
          { role: { name: 'MANAGER' } },
          { division: { name: 'PURCHASING' } },
          { division: { name: 'GUDANG' } },
        ],
        isActive: true,
      },
    });

    const notifications = [];

    for (const user of targetUsers) {
      const itemNames = lowStockItems.map((item) => `${item.name} (${item.currentStock}/${item.minStock})`).join(', ');
      
      notifications.push({
        userId: user.id,
        title: '📦 Stok Gudang Menipis',
        message: `${lowStockItems.length} item dengan stok rendah: ${itemNames}. Segera lakukan pembelian!`,
        type: 'WARNING',
        link: '/warehouse',
        metadata: {
          lowStockCount: lowStockItems.length,
          items: lowStockItems.map((i) => i.id),
        },
      });
    }

    // Auto-generate shopping needs
    for (const item of lowStockItems) {
      const existingNeed = await prisma.shoppingNeed.findFirst({
        where: {
          itemName: item.name,
          status: { in: ['NEEDED', 'ORDERED'] },
        },
      });

      if (!existingNeed) {
        const stockPercent = item.minStock > 0 ? (item.currentStock / item.minStock) * 100 : 100;
        const priority = stockPercent < 10 ? 'HIGH' : stockPercent < 50 ? 'MEDIUM' : 'LOW';
        const neededQty = Math.max(item.minStock - item.currentStock, item.minStock);

        await prisma.shoppingNeed.create({
          data: {
            itemName: item.name,
            quantity: neededQty,
            priority,
            status: 'NEEDED',
            notes: `Auto-generated: Current stock ${item.currentStock}, min stock ${item.minStock}`,
          },
        });

        console.log(`[CRON] Created shopping need for ${item.name} (${neededQty} units)`);
      }
    }

    await createBulkNotifications(notifications);
    console.log(`[CRON] Sent ${notifications.length} low stock warnings`);
  } catch (error) {
    console.error('[CRON] Error checking warehouse stock:', error);
  }
}

// Check late cashier reports
async function checkLateCashierReports() {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    // Get all branches
    const branches = await prisma.branch.findMany();

    const lateReports = [];

    for (const branch of branches) {
      const report = await prisma.cashierReport.findFirst({
        where: {
          branchId: branch.id,
          date: yesterday,
        },
      });

      if (!report) {
        lateReports.push(branch);
      }
    }

    if (lateReports.length === 0) {
      console.log('[CRON] No late cashier reports');
      return;
    }

    // Get CEO, managers, and kasir staff
    const targetUsers = await prisma.user.findMany({
      where: {
        OR: [
          { role: { name: 'CEO' } },
          { role: { name: 'MANAGER' } },
          { division: { name: 'KASIR' } },
        ],
        isActive: true,
      },
    });

    const notifications = [];

    for (const user of targetUsers) {
      const branchNames = lateReports.map((b) => b.name).join(', ');

      notifications.push({
        userId: user.id,
        title: '⏰ Laporan Kasir Terlambat',
        message: `${lateReports.length} cabang belum submit laporan kasir kemarin: ${branchNames}`,
        type: 'WARNING',
        link: '/cashier',
        metadata: {
          lateCount: lateReports.length,
          branches: lateReports.map((b) => b.id),
          date: yesterday.toISOString(),
        },
      });
    }

    await createBulkNotifications(notifications);
    console.log(`[CRON] Sent ${notifications.length} late cashier report warnings`);
  } catch (error) {
    console.error('[CRON] Error checking late cashier reports:', error);
  }
}

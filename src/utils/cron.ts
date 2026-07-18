import cron from 'node-cron';
import prisma from './prisma';
import { ReportStatus, AttendanceStatus } from '@prisma/client';
import { generateSystemWarnings } from '../controllers/notification.controller';
import { createBulkNotifications } from '../services/notification.service';
import { uploadToGDrive } from '../services/gdrive.service';
import fs from 'fs/promises';
import path from 'path';

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

        if (attendance && (attendance.status === AttendanceStatus.HADIR || attendance.status === AttendanceStatus.TELAT)) {
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

  // Remind cashiers every 2 days to upload deposit proof
  cron.schedule('30 9 */2 * *', async () => {
    console.log('[CRON] Checking cashier deposit proof reminders...');
    await checkCashierDepositProofs();
  });

  // Expire SP1 letters every day shortly after midnight
  cron.schedule('15 0 * * *', async () => {
    console.log('[CRON] Expiring old SP1 records...');
    await expireWarningLetters();
  });

  // Remind assignees about tasks due within 24 hours
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Checking task deadline reminders...');
    await remindTaskDeadlines();
  });

  // Monthly JSON backup for core operational data
  cron.schedule('30 1 1 * *', async () => {
    console.log('[CRON] Running monthly backup...');
    await createMonthlyBackup();
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

async function checkCashierDepositProofs() {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 2);
    since.setHours(0, 0, 0, 0);

    const branches = await prisma.branch.findMany();
    const missingBranches = [];

    for (const branch of branches) {
      const latestReport = await prisma.cashierReport.findFirst({
        where: {
          branchId: branch.id,
          date: { gte: since }
        },
        orderBy: { date: 'desc' }
      });

      if (!latestReport || !latestReport.depositProofUrl) {
        missingBranches.push(branch);
      }
    }

    if (missingBranches.length === 0) {
      console.log('[CRON] No cashier deposit proof reminders needed');
      return;
    }

    const targetUsers = await prisma.user.findMany({
      where: {
        OR: [
          { division: { name: 'KASIR' } },
          { role: { name: { in: ['CEO', 'OWNER', 'ADMIN'] as any } } }
        ],
        isActive: true,
        deletedAt: null
      },
      select: { id: true }
    });

    const branchNames = missingBranches.map((branch) => branch.name).join(', ');
    await createBulkNotifications(targetUsers.map((user) => ({
      userId: user.id,
      title: 'Reminder Bukti Setoran',
      message: `Cabang berikut belum lengkap laporan/bukti setoran 2 hari terakhir: ${branchNames}.`,
      type: 'WARNING',
      link: '/cashier',
      metadata: { branches: missingBranches.map((branch) => branch.id), since: since.toISOString() }
    })));

    console.log(`[CRON] Sent cashier deposit proof reminders for ${missingBranches.length} branches`);
  } catch (error) {
    console.error('[CRON] Error checking cashier deposit proofs:', error);
  }
}

async function expireWarningLetters() {
  try {
    const result = await prisma.warningLetter.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });

    console.log(`[CRON] Deleted ${result.count} expired SP1 records`);
  } catch (error) {
    console.error('[CRON] Error expiring SP1 records:', error);
  }
}

async function remindTaskDeadlines() {
  try {
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasks = await prisma.task.findMany({
      where: {
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
        dueDate: { gte: now, lte: tomorrow }
      }
    });

    if (tasks.length === 0) {
      console.log('[CRON] No task reminders needed');
      return;
    }

    await createBulkNotifications(tasks.map((task) => ({
      userId: task.assignedTo,
      title: 'Deadline Tugas Dekat',
      message: `Tugas "${task.title}" mendekati deadline.`,
      type: 'TASK',
      link: '/tasks',
      metadata: { taskId: task.id, dueDate: task.dueDate?.toISOString() }
    })));

    console.log(`[CRON] Sent ${tasks.length} task deadline reminders`);
  } catch (error) {
    console.error('[CRON] Error checking task reminders:', error);
  }
}

async function createMonthlyBackup() {
  try {
    const backupDir = path.resolve(process.cwd(), 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const data = {
      generatedAt: now.toISOString(),
      users: await prisma.user.findMany({
        include: { role: true, division: true, branch: true },
        orderBy: { createdAt: 'desc' }
      }),
      warehouseItems: await prisma.warehouseItem.findMany(),
      warehouseMovements: await prisma.warehouseMovement.findMany({ orderBy: { date: 'desc' }, take: 1000 }),
      products: await prisma.product.findMany({ include: { recipes: true } }),
      purchaseRequests: await prisma.purchaseRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 1000 }),
      cashierReports: await prisma.cashierReport.findMany({ orderBy: { date: 'desc' }, take: 1000 }),
      payrolls: await prisma.payroll.findMany({ orderBy: { period: 'desc' }, take: 1000 }),
      warningLetters: await prisma.warningLetter.findMany({ orderBy: { createdAt: 'desc' } }),
      resignationRequests: await prisma.resignationRequest.findMany({ orderBy: { createdAt: 'desc' } })
    };

    const backupPath = path.join(backupDir, `monthly-backup-${stamp}.json`);
    await fs.writeFile(backupPath, JSON.stringify(data, null, 2), 'utf8');

    try {
      const driveUrl = await uploadToGDrive(backupPath, `monthly-backup-${stamp}.json`, 'BACKUPS');
      console.log(`[CRON] Monthly backup uploaded to Google Drive: ${driveUrl}`);
    } catch (uploadError) {
      console.error('[CRON] Monthly backup created locally but Google Drive upload failed:', uploadError);
    }

    console.log(`[CRON] Monthly backup created for ${stamp}`);
  } catch (error) {
    console.error('[CRON] Error creating monthly backup:', error);
  }
}

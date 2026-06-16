import cron from 'node-cron';
import prisma from './prisma';
import { ReportStatus, AttendanceStatus } from '@prisma/client';
import { generateSystemWarnings } from '../controllers/notification.controller';

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
};

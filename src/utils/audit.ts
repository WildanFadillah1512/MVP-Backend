import { Request } from 'express';
import prisma from './prisma';

export async function writeAuditLog(
  req: Request,
  action: string,
  module: string,
  description: string,
  dataBefore?: any,
  dataAfter?: any
) {
  try {
    const user = (req as any).user;
    if (!user?.id) return;

    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action,
        module,
        description: `${description}${dataBefore || dataAfter ? ` | before=${JSON.stringify(dataBefore || null)} | after=${JSON.stringify(dataAfter || null)}` : ''}`,
        ipAddress,
      }
    });
  } catch (error) {
    // Audit should never block business flow
    console.error('[AuditLog] Failed:', error);
  }
}

import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

export const createTarget = async (req: Request, res: Response) => {
  try {
    const assignedById = (req as any).user.id;
    const { title, description, period, targetValue, unit, userIds } = req.body;
    
    // Create the master target
    const target = await prisma.workTarget.create({
      data: {
        title,
        description,
        period,
        targetValue: parseFloat(targetValue),
        unit
      }
    });

    // Assign to users
    if (userIds && userIds.length > 0) {
      const assignments = userIds.map((userId: string) => ({
        targetId: target.id,
        userId,
        assignedById
      }));

      await prisma.targetAssignment.createMany({
        data: assignments
      });
    }

        await writeAuditLog(req, 'CREATE', 'TARGET', 'Target kerja baru dibuat: ' + title);
    return successResponse(res, target, 'Target berhasil dibuat dan ditugaskan');
  } catch (error) {
    console.error(error);
    return errorResponse(res, 'Terjadi kesalahan saat membuat target', null, 500);
  }
};

export const getMyTargets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const targets = await prisma.targetAssignment.findMany({
      where: { userId },
      include: {
        target: true,
        user: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, targets, 'Data target berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

export const getTeamTargets = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const assignments = await prisma.targetAssignment.findMany({
      where: {
        user: { supervisorId: userId }
      },
      include: {
        target: true,
        user: { select: { name: true, division: { select: { name: true } } } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, assignments, 'Data target tim berhasil diambil');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

export const updateProgress = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { currentValue } = req.body;

    const assignment = await prisma.targetAssignment.findUnique({
      where: { id },
      include: { target: true }
    });

    if (!assignment) return errorResponse(res, 'Target assignment tidak ditemukan', null, 404);

    const isCompleted = currentValue >= assignment.target.targetValue;

    const updated = await prisma.targetAssignment.update({
      where: { id },
      data: { 
        currentValue: parseFloat(currentValue),
        isCompleted 
      },
      include: { target: true }
    });

    return successResponse(res, updated, 'Progress target berhasil diupdate');
  } catch (error) {
    return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
  }
};

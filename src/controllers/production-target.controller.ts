// @ts-nocheck
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { successResponse, errorResponse } from '../utils/response';
import { writeAuditLog } from '../utils/audit';

// GET /api/production/targets
export const getProductionTargets = async (req: Request, res: Response) => {
  try {
    const { month, productId, year } = req.query;

    const where: any = {};

    // Filter by month and year
    if (month && year) {
      const targetDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
      where.targetMonth = targetDate;
    }

    // Filter by product
    if (productId) {
      where.productId = productId;
    }

    const targets = await prisma.productionTarget.findMany({
      where,
      include: {
        product: true,
      },
      orderBy: {
        targetMonth: 'desc',
      },
    });

    // Calculate progress for each target
    const targetsWithProgress = targets.map((target) => {
      const progress = target.targetQty > 0 ? (target.actualQty / target.targetQty) * 100 : 0;
      const gap = target.targetQty - target.actualQty;
      const status = progress >= 100 ? 'COMPLETED' : progress >= 80 ? 'ON_TRACK' : 'WARNING';

      return {
        ...target,
        progress: Math.round(progress * 100) / 100,
        gap,
        status,
      };
    });

    return successResponse(res, targetsWithProgress, 'Production targets retrieved');
  } catch (error: any) {
    console.error('Error getting production targets:', error);
    return errorResponse(res, error.message, 500);
  }
};


// GET /api/production/targets/:id
export const getProductionTargetById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const target = await prisma.productionTarget.findUnique({
      where: { id },
      include: {
        product: true,
      },
    });

    if (!target) {
      return errorResponse(res, 'Production target not found', null, 404);
    }

    const progress = target.targetQty > 0 ? (target.actualQty / target.targetQty) * 100 : 0;
    const gap = target.targetQty - target.actualQty;
    const status = progress >= 100 ? 'COMPLETED' : progress >= 80 ? 'ON_TRACK' : 'WARNING';

    return successResponse(res, { ...target, progress, gap, status }, 'Production target detail');
  } catch (error: any) {
    console.error('Error getting production target:', error);
    return errorResponse(res, error.message, 500);
  }
};

// POST /api/production/targets
export const createProductionTarget = async (req: Request, res: Response) => {
  try {
    const { productId, targetMonth, targetQty, notes } = req.body;
    const userId = (req as any).user.id;

    // Validate required fields
    if (!productId || !targetMonth || !targetQty) {
      return errorResponse(res, 'Product ID, target month, and target quantity are required', null, 400);
    }

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      return errorResponse(res, 'Product not found', null, 404);
    }

    // Parse target month (ensure it's the first day of the month)
    const monthDate = new Date(targetMonth);
    monthDate.setDate(1);

    // Check if target already exists for this product and month
    const existingTarget = await prisma.productionTarget.findUnique({
      where: {
        productId_targetMonth: {
          productId,
          targetMonth: monthDate,
        },
      },
    });

    if (existingTarget) {
      return errorResponse(res, 'Target already exists for this product and month', null, 400);
    }

    // Create target
    const target = await prisma.productionTarget.create({
      data: {
        productId,
        targetMonth: monthDate,
        targetQty: parseInt(targetQty),
        actualQty: 0,
        createdById: userId,
        notes,
      },
      include: {
        product: true,
      },
    });

    // Log audit
    await writeAuditLog(req, 'CREATE', 'PRODUCTION_TARGET', `Created production target for ${product.name} - ${monthDate.toISOString().substring(0, 7)}`);

    return successResponse(res, target, 'Production target created', 201);
  } catch (error: any) {
    console.error('Error creating production target:', error);
    return errorResponse(res, error.message, 500);
  }
};


// PUT /api/production/targets/:id
export const updateProductionTarget = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetQty, notes } = req.body;
    const userId = (req as any).user.id;

    // Check if target exists
    const target = await prisma.productionTarget.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!target) {
      return errorResponse(res, 'Production target not found', null, 404);
    }

    // Update target
    const updatedTarget = await prisma.productionTarget.update({
      where: { id },
      data: {
        targetQty: targetQty ? parseInt(targetQty) : target.targetQty,
        notes: notes !== undefined ? notes : target.notes,
      },
      include: {
        product: true,
      },
    });

    // Log audit
    await writeAuditLog(req, 'UPDATE', 'PRODUCTION_TARGET', `Updated production target for ${target.product.name}`);

    return successResponse(res, updatedTarget, 'Production target updated');
  } catch (error: any) {
    console.error('Error updating production target:', error);
    return errorResponse(res, error.message, 500);
  }
};

// DELETE /api/production/targets/:id
export const deleteProductionTarget = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Check if target exists
    const target = await prisma.productionTarget.findUnique({
      where: { id },
      include: { product: true },
    });

    if (!target) {
      return errorResponse(res, 'Production target not found', null, 404);
    }

    // Delete target
    await prisma.productionTarget.delete({
      where: { id },
    });

    // Log audit
    await writeAuditLog(req, 'DELETE', 'PRODUCTION_TARGET', `Deleted production target for ${target.product.name}`);

    return successResponse(res, null, 'Production target deleted');
  } catch (error: any) {
    console.error('Error deleting production target:', error);
    return errorResponse(res, error.message, 500);
  }
};

// GET /api/production/matrix/:year/:month
export const getProductionMatrix = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.params;

    const targetDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);

    // Get all targets for this month
    const targets = await prisma.productionTarget.findMany({
      where: {
        targetMonth: targetDate,
      },
      include: {
        product: true,
      },
      orderBy: {
        product: {
          name: 'asc',
        },
      },
    });

    // Calculate matrix data
    const matrix = targets.map((target) => {
      const progress = target.targetQty > 0 ? (target.actualQty / target.targetQty) * 100 : 0;
      const gap = target.targetQty - target.actualQty;
      const status = progress >= 100 ? 'COMPLETED' : progress >= 80 ? 'ON_TRACK' : 'WARNING';

      return {
        productId: target.product.id,
        productCode: target.product.code,
        productName: target.product.name,
        category: target.product.category,
        targetQty: target.targetQty,
        actualQty: target.actualQty,
        gap,
        progress: Math.round(progress * 100) / 100,
        status,
      };
    });

    // Calculate summary
    const summary = {
      totalProducts: matrix.length,
      totalTargetQty: matrix.reduce((sum, item) => sum + item.targetQty, 0),
      totalActualQty: matrix.reduce((sum, item) => sum + item.actualQty, 0),
      totalGap: matrix.reduce((sum, item) => sum + item.gap, 0),
      completedProducts: matrix.filter((item) => item.status === 'COMPLETED').length,
      warningProducts: matrix.filter((item) => item.status === 'WARNING').length,
      onTrackProducts: matrix.filter((item) => item.status === 'ON_TRACK').length,
    };

    return successResponse(
      res,
      {
        month: `${year}-${String(month).padStart(2, '0')}`,
        matrix,
        summary,
      },
      'Production matrix retrieved'
    );
  } catch (error: any) {
    console.error('Error getting production matrix:', error);
    return errorResponse(res, error.message, 500);
  }
};

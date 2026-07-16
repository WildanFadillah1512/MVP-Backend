import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { errorResponse, successResponse } from '../utils/response';

export const getSuppliers = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = user.role.name;

    let whereClause: any = {};
    
    // Staff hanya bisa lihat supplier yang sudah approved
    if (role === 'STAFF') {
      whereClause.approvedAt = { not: null };
      whereClause.status = 'ACTIVE';
    }

    const suppliers = await prisma.supplier.findMany({
      where: whereClause,
      include: {
        supplierPrices: {
          include: {
            item: true
          },
          where: { isActive: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, suppliers, 'Suppliers retrieved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const createSupplier = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = user.role.name;

    // Only MANAGER and CEO can create suppliers
    if (!['MANAGER', 'CEO', 'OWNER', 'GM'].includes(role)) {
      return errorResponse(res, 'Unauthorized to create supplier', 403);
    }

    const { code, name, contactName, phone, email, address } = req.body;

    const supplier = await prisma.supplier.create({
      data: {
        code,
        name,
        contactName,
        phone,
        email,
        address,
        createdById: user.id,
        // Auto approve if CEO/OWNER creates
        ...((['CEO', 'OWNER', 'GM'].includes(role)) && {
          approvedById: user.id,
          approvedAt: new Date()
        })
      }
    });

    return successResponse(res, supplier, 'Supplier created successfully', 201);
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const approveSupplier = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = user.role.name;
    const { id } = req.params;

    if (!['MANAGER', 'CEO', 'OWNER', 'GM'].includes(role)) {
      return errorResponse(res, 'Unauthorized to approve supplier', 403);
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        approvedById: user.id,
        approvedAt: new Date(),
        status: 'ACTIVE'
      }
    });

    return successResponse(res, supplier, 'Supplier approved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const setSupplierPrice = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = user.role.name;

    // Only CEO can set supplier prices
    if (!['CEO', 'OWNER'].includes(role)) {
      return errorResponse(res, 'Only CEO can set supplier prices', 403);
    }

    const { supplierId, warehouseItemId, unitPrice } = req.body;

    const supplierPrice = await prisma.supplierPrice.upsert({
      where: {
        supplierId_warehouseItemId: {
          supplierId,
          warehouseItemId
        }
      },
      update: {
        unitPrice,
        setCeoId: user.id,
        isActive: true
      },
      create: {
        supplierId,
        warehouseItemId,
        unitPrice,
        setCeoId: user.id,
        isActive: true
      },
      include: {
        supplier: true,
        item: true
      }
    });

    return successResponse(res, supplierPrice, 'Supplier price set successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const getSupplierPrices = async (req: Request, res: Response) => {
  try {
    const { supplierId, warehouseItemId } = req.query;

    let whereClause: any = { isActive: true };
    if (supplierId) whereClause.supplierId = supplierId;
    if (warehouseItemId) whereClause.warehouseItemId = warehouseItemId;

    const prices = await prisma.supplierPrice.findMany({
      where: whereClause,
      include: {
        supplier: true,
        item: true
      },
      orderBy: { unitPrice: 'asc' }
    });

    return successResponse(res, prices, 'Supplier prices retrieved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const updateSupplier = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = user.role.name;
    const { id } = req.params;

    if (!['MANAGER', 'CEO', 'OWNER', 'GM'].includes(role)) {
      return errorResponse(res, 'Unauthorized to update supplier', 403);
    }

    const { name, contactName, phone, email, address, status } = req.body;

    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        name,
        contactName,
        phone,
        email,
        address,
        status
      }
    });

    return successResponse(res, supplier, 'Supplier updated successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

export const deleteSupplier = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = user.role.name;
    const { id } = req.params;

    if (!['CEO', 'OWNER'].includes(role)) {
      return errorResponse(res, 'Only CEO can delete suppliers', 403);
    }

    await prisma.supplier.update({
      where: { id },
      data: { status: 'INACTIVE' }
    });

    return successResponse(res, null, 'Supplier deleted successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

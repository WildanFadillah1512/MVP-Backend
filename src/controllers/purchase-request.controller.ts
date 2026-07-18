import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { errorResponse, successResponse } from '../utils/response';

const getUserRole = (user: any) => user.role?.name || user.role;
const getUserDivision = (user: any) => user.division?.name || user.division;
const TOP_LEVEL_ROLES = ['OWNER', 'CEO', 'GM', 'ADMIN'];

// Generate request number
const generateRequestNumber = async () => {
  const count = await prisma.purchaseRequest.count();
  const number = String(count + 1).padStart(6, '0');
  return `PR-${new Date().getFullYear()}-${number}`;
};

// Warehouse creates purchase request
export const createPurchaseRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const division = getUserDivision(user);
    const { warehouseItemId, requestedQty, priority, notes } = req.body;

    if (!TOP_LEVEL_ROLES.includes(role) && division !== 'GUDANG') {
      return errorResponse(res, 'Hanya divisi Gudang atau atasan yang dapat membuat purchase request', null, 403);
    }

    const requestNumber = await generateRequestNumber();

    const purchaseRequest = await prisma.purchaseRequest.create({
      data: {
        requestNumber,
        warehouseItemId,
        requestedQty,
        priority: priority || 'MEDIUM',
        status: 'DRAFT',
        requestedById: user.id,
        notes
      },
      include: {
        item: true
      }
    });

    return successResponse(res, purchaseRequest, 'Purchase request created successfully', 201);
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

// Warehouse submits to Purchasing
export const submitToPurchasing = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const division = getUserDivision(user);
    const id = String(req.params.id);

    if (!TOP_LEVEL_ROLES.includes(role) && division !== 'GUDANG') {
      return errorResponse(res, 'Hanya divisi Gudang atau atasan yang dapat submit ke Purchasing', null, 403);
    }

    const existing = await prisma.purchaseRequest.findUnique({
      where: { id }
    });

    if (!existing) {
      return errorResponse(res, 'Purchase request not found', null, 404);
    }

    if (!TOP_LEVEL_ROLES.includes(role) && existing.requestedById !== user.id) {
      return errorResponse(res, 'Anda hanya dapat submit request yang dibuat sendiri', null, 403);
    }

    const purchaseRequest = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: 'SUBMITTED_BY_WAREHOUSE',
        submittedAt: new Date()
      },
      include: {
        item: true
      }
    });

    // Create notification for purchasing staff
    const purchasingUsers = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        division: { name: 'PURCHASING' },
        role: { name: { in: ['STAFF', 'MANAGER', 'LEADER'] } }
      },
      select: { id: true }
    });

    if (purchasingUsers.length > 0) {
      await prisma.notification.createMany({
        data: purchasingUsers.map((purchasingUser) => ({
          userId: purchasingUser.id,
          title: 'New Purchase Request',
          message: `Purchase request ${purchaseRequest.requestNumber} submitted`,
          type: 'INFO',
          link: `/purchase-requests`
        }))
      });
    }

    return successResponse(res, purchaseRequest, 'Purchase request submitted to purchasing');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

// Purchasing staff adds price and supplier
export const setPriceAndSupplier = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const division = getUserDivision(user);
    const id = String(req.params.id);
    const { supplierId, estimatedBudget, actualPrice } = req.body;

    if (!(role === 'STAFF' && division === 'PURCHASING')) {
      return errorResponse(res, 'Only purchasing staff can set price', null, 403);
    }

    // Get supplier prices for this item
    const request = await prisma.purchaseRequest.findUnique({
      where: { id },
      include: { item: true }
    });

    if (!request) {
      return errorResponse(res, 'Purchase request not found', null, 404);
    }

    if (request.status !== 'SUBMITTED_BY_WAREHOUSE') {
      return errorResponse(res, 'Harga hanya dapat diset setelah request disubmit Gudang', null, 400);
    }

    const purchaseRequest = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        supplierId,
        estimatedBudget,
        actualPrice,
        staffId: user.id,
        staffProcessedAt: new Date(),
        status: 'PENDING_MANAGER'
      },
      include: {
        item: true,
        supplier: true
      }
    });

    // Notify manager
    const manager = await prisma.user.findFirst({
      where: {
        role: { name: 'MANAGER' },
        division: { name: division }
      }
    });

    if (manager) {
      await prisma.notification.create({
        data: {
          userId: manager.id,
          title: 'Purchase Request for Approval',
          message: `Purchase request ${purchaseRequest.requestNumber} needs manager approval`,
          type: 'INFO',
          link: `/purchase-requests`
        }
      });
    }

    return successResponse(res, purchaseRequest, 'Price and supplier set successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

// Manager approves and forwards to CEO
export const managerApprove = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const division = getUserDivision(user);
    const id = String(req.params.id);

    if (!(role === 'MANAGER' && division === 'PURCHASING')) {
      return errorResponse(res, 'Only manager can approve', null, 403);
    }

    const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, 'Purchase request not found', null, 404);
    }
    if (existing.status !== 'PENDING_MANAGER') {
      return errorResponse(res, 'Request belum berada di tahap approval manager', null, 400);
    }

    const purchaseRequest = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        managerId: user.id,
        managerApprovedAt: new Date(),
        status: 'PENDING_CEO'
      },
      include: {
        item: true,
        supplier: true
      }
    });

    // Notify CEO
    const ceo = await prisma.user.findFirst({
      where: {
        role: { name: { in: ['CEO', 'OWNER'] } }
      }
    });

    if (ceo) {
      await prisma.notification.create({
        data: {
          userId: ceo.id,
          title: 'Purchase Request for Final Approval',
          message: `Purchase request ${purchaseRequest.requestNumber} needs CEO approval`,
          type: 'INFO',
          link: `/purchase-requests`
        }
      });
    }

    return successResponse(res, purchaseRequest, 'Purchase request approved by manager');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

// CEO final approval
export const ceoApprove = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const id = String(req.params.id);

    if (!['CEO', 'OWNER'].includes(role)) {
      return errorResponse(res, 'Only CEO can give final approval', null, 403);
    }

    const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, 'Purchase request not found', null, 404);
    }
    if (existing.status !== 'PENDING_CEO') {
      return errorResponse(res, 'Request belum berada di tahap approval CEO', null, 400);
    }

    const purchaseRequest = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        ceoId: user.id,
        ceoApprovedAt: new Date(),
        status: 'APPROVED'
      },
      include: {
        item: true,
        supplier: true
      }
    });

    // Notify purchasing staff
    if (purchaseRequest.staffId) {
      await prisma.notification.create({
        data: {
          userId: purchaseRequest.staffId,
          title: 'Purchase Request Approved',
          message: `Purchase request ${purchaseRequest.requestNumber} approved by CEO`,
          type: 'INFO',
          link: `/purchase-requests`
        }
      });
    }

    return successResponse(res, purchaseRequest, 'Purchase request approved by CEO');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

// Reject purchase request
export const rejectPurchaseRequest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const id = String(req.params.id);
    const { rejectReason } = req.body;

    if (!['MANAGER', 'CEO', 'OWNER'].includes(role)) {
      return errorResponse(res, 'Unauthorized to reject request', null, 403);
    }

    const purchaseRequest = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason
      },
      include: {
        item: true
      }
    });

    // Notify requester
    await prisma.notification.create({
      data: {
        userId: purchaseRequest.requestedById,
        title: 'Purchase Request Rejected',
        message: `Purchase request ${purchaseRequest.requestNumber} was rejected`,
        type: 'WARNING',
        link: `/purchase-requests`
      }
    });

    return successResponse(res, purchaseRequest, 'Purchase request rejected');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

// Mark as purchased
export const markAsPurchased = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const division = getUserDivision(user);
    const id = String(req.params.id);
    const { actualQty, actualPrice, receiptUrl } = req.body;

    if (!TOP_LEVEL_ROLES.includes(role) && division !== 'PURCHASING') {
      return errorResponse(res, 'Hanya Purchasing atau atasan yang dapat menandai pembelian selesai', null, 403);
    }

    const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse(res, 'Purchase request not found', null, 404);
    }
    if (existing.status !== 'APPROVED') {
      return errorResponse(res, 'Request harus disetujui CEO sebelum ditandai sudah dibeli', null, 400);
    }
    const purchasedQty = Number(actualQty || existing.requestedQty);

    const purchaseRequest = await prisma.purchaseRequest.update({
      where: { id },
      data: {
        actualQty: purchasedQty,
        actualPrice: Number(actualPrice || 0),
        receiptUrl,
        status: 'PURCHASED',
        purchasedAt: new Date()
      },
      include: {
        item: true,
        supplier: true
      }
    });

    // Update warehouse stock
    await prisma.warehouseItem.update({
      where: { id: purchaseRequest.warehouseItemId },
      data: {
        currentStock: {
          increment: purchasedQty
        }
      }
    });

    // Log warehouse movement
    await prisma.warehouseMovement.create({
      data: {
        warehouseItemId: purchaseRequest.warehouseItemId,
        type: 'IN',
        quantity: purchasedQty,
        notes: `Purchase from ${(purchaseRequest as any).supplier?.name || 'supplier'} - ${purchaseRequest.requestNumber}`,
        date: new Date()
      }
    });

    return successResponse(res, purchaseRequest, 'Purchase completed successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

// Get all purchase requests with filters
export const getPurchaseRequests = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const role = getUserRole(user);
    const division = getUserDivision(user);
    const { status, startDate, endDate } = req.query;

    let whereClause: any = {};

    if (TOP_LEVEL_ROLES.includes(role)) {
      whereClause = {};
    } else if (role === 'STAFF' && division === 'PURCHASING') {
      // Staff purchasing hanya lihat request baru dan yang sudah diproses dia.
      whereClause.OR = [
        { staffId: user.id },
        { status: 'SUBMITTED_BY_WAREHOUSE' }
      ];
    } else if (role === 'STAFF' && division === 'GUDANG') {
      // Warehouse staff hanya lihat yang dia buat.
      whereClause = { requestedById: user.id };
    } else if (role === 'MANAGER' && division === 'PURCHASING') {
      whereClause = {
        OR: [
          { status: 'PENDING_MANAGER' },
          { managerId: user.id }
        ]
      };
    } else {
      whereClause = { id: '__no_access__' };
    }

    if (status) {
      whereClause.status = status;
    }

    if (startDate && endDate) {
      whereClause.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    const requests = await prisma.purchaseRequest.findMany({
      where: whereClause,
      include: {
        item: true,
        supplier: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(res, requests, 'Purchase requests retrieved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

// Get single purchase request
export const getPurchaseRequestById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const request = await prisma.purchaseRequest.findUnique({
      where: { id },
      include: {
        item: true,
        supplier: {
          include: {
            supplierPrices: {
              where: { isActive: true }
            }
          }
        }
      }
    });

    if (!request) {
      return errorResponse(res, 'Purchase request not found', null, 404);
    }

    return successResponse(res, request, 'Purchase request retrieved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

// Get supplier options for an item
export const getSupplierOptionsForItem = async (req: Request, res: Response) => {
  try {
    const warehouseItemId = String(req.params.warehouseItemId);

    const supplierPrices = await prisma.supplierPrice.findMany({
      where: {
        warehouseItemId,
        isActive: true,
        supplier: {
          status: 'ACTIVE',
          approvedAt: { not: null }
        }
      },
      include: {
        supplier: true,
        item: true
      },
      orderBy: { unitPrice: 'asc' }
    });

    return successResponse(res, supplierPrices, 'Supplier options retrieved successfully');
  } catch (error: any) {
    return errorResponse(res, error.message, 500);
  }
};

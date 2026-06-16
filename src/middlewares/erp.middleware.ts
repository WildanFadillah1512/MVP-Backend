import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { errorResponse } from '../utils/response';

export const requireErpUnlock = (moduleName: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = await prisma.erpConfig.findUnique({
        where: { moduleName }
      });

      // If module configuration is strictly true, block it
      if (!config || config.isLocked) {
        return errorResponse(res, `Fitur ${moduleName} ERP sedang terkunci. Silakan upgrade ke ERP Enterprise.`, null, 403);
      }

      next();
    } catch (error) {
      return errorResponse(res, 'Sistem ERP sedang dalam pemeliharaan.', null, 500);
    }
  };
};

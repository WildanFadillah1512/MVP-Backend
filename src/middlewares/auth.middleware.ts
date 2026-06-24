import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { errorResponse } from '../utils/response';

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Token tidak ditemukan atau format salah', null, 401);
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    (req as any).user = decoded;
    next();
  } catch (error) {
    return errorResponse(res, 'Token tidak valid atau sudah kadaluarsa', null, 401);
  }
};

export const authorizeRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user.role;
    
    if (!roles.includes(userRole)) {
      return errorResponse(res, 'Anda tidak memiliki akses ke resource ini', null, 403);
    }
    
    next();
  };
};

export const authorizeDivision = (divisions: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userDivision = (req as any).user.division;
    const userRole = (req as any).user.role;
    
    // OWNER, CEO, and Admin can bypass division check entirely
    if (['OWNER', 'CEO', 'ADMIN'].includes(userRole)) {
      return next();
    }
    
    // GM can bypass everything EXCEPT KASIR (Keuangan)
    if (userRole === 'GM' && !divisions.includes('KASIR')) {
      return next();
    }
    
    if (!divisions.includes(userDivision)) {
      return errorResponse(res, 'Akses ditolak: Divisi tidak sesuai', null, 403);
    }
    
    next();
  };
};

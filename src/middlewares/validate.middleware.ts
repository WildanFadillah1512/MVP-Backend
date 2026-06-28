import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from 'zod';
import { errorResponse } from '../utils/response';

export const validate = (schema: ZodTypeAny) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return errorResponse(res, 'Validasi gagal', error.issues, 400);
      }
      return errorResponse(res, 'Terjadi kesalahan internal', null, 500);
    }
  };

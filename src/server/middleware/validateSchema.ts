/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { Request, Response, NextFunction } from 'express';
import { getValidatorForDomain } from '../services/schemaRegistry.js';

export function validateSchema(domain: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { validator, version } = await getValidatorForDomain(domain);
      const valid = validator(req.body);

      if (!valid) {
        return res.status(422).json({
          success: false,
          error: 'ValidationError',
          schemaVersion: version,
          details: validator.errors,
        });
      }

      res.locals.schemaVersion = version;
      next();
    } catch (error: any) {
      next(error);
    }
  };
}

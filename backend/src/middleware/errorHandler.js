import mongoose from 'mongoose';
import { ApiError } from '../utils/apiError.js';
import { env } from '../config/env.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(error, _req, res, _next) {
  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({
      error: 'Validation failed',
      details: Object.fromEntries(
        Object.entries(error.errors).map(([field, err]) => [field, err.message]),
      ),
    });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: `Invalid value for ${error.path}` });
    return;
  }

  if (error?.code === 11000) {
    res.status(409).json({ error: 'That record already exists', details: error.keyValue });
    return;
  }

  const status = error instanceof ApiError ? error.status : 500;
  if (status >= 500 && !env.isProduction) {
    console.error(error);
  }

  res.status(status).json({
    error: status >= 500 ? 'Something went wrong' : error.message,
    ...(error.details ? { details: error.details } : {}),
  });
}

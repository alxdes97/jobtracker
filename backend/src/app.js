import zlib from 'node:zlib';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { env } from './config/env.js';
import { router } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(gzipJson);
  if (!env.isProduction) app.use(morgan('dev'));

  app.use('/api', router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function gzipJson(req, res, next) {
  const accept = req.headers['accept-encoding'];
  if (typeof accept !== 'string' || !accept.includes('gzip')) return next();
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    let payload;
    try {
      payload = JSON.stringify(body);
    } catch {
      return sendJson(body);
    }
    if (payload.length < 2048) return sendJson(body);
    zlib.gzip(payload, (error, zipped) => {
      if (error || res.headersSent) {
        if (!res.headersSent) sendJson(body);
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.send(zipped);
    });
  };
  next();
}

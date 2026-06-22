/**
 * metricsRouter.ts — Exposes Prometheus metrics at GET /metrics.
 *
 * Prometheus scrapes this endpoint on a configurable interval (default 15 s).
 * The response is plain text in the Prometheus exposition format.
 *
 * HOW IT CONNECTS:
 *  - app.ts registers this router at /metrics
 *  - metrics.ts provides the Registry that holds all metric values
 *  - Prometheus server scrapes GET /metrics → stores time-series data
 *  - Grafana queries Prometheus → renders dashboards
 *
 * SECURITY NOTE:
 *  This endpoint exposes internal server statistics. In production, consider
 *  restricting access to it via nginx (allow only the Prometheus server IP)
 *  or by moving it to a separate internal-only port.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { registry } from './metrics';

export const metricsRouter = Router();

metricsRouter.get('/', async (_req: Request, res: Response) => {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

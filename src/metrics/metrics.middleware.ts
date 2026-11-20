import { Injectable, NestMiddleware } from '@nestjs/common';
import * as promClient from 'prom-client';

const httpRequestTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Número total de peticiones HTTP por método y ruta',
  labelNames: ['method', 'route'],
});

const apiErrorsTotal = new promClient.Counter({
  name: 'api_errors_total',
  help: 'Número total de errores de la API',
  labelNames: ['method', 'route', 'status_code', 'error_type'],
});

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    res.on('finish', () => {
      const route = req.route ? req.route.path : 'unknown_route';

      httpRequestTotal.inc({
        method: req.method,
        route: route,
      });

      if (res.statusCode >= 400) {
        let errorType = 'unknown_error';
        if (res.statusCode >= 500) {
          errorType = 'server_error';
        } else if (res.statusCode >= 400) {
          errorType = 'client_error';
        }

        apiErrorsTotal.inc({
          method: req.method,
          route: route,
          status_code: res.statusCode,
          error_type: errorType,
        });
      }
    });

    next();
  }
}
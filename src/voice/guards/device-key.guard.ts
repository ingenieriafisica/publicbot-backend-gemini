import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

/**
 * Validates the X-Device-Key header sent by ESP32 voice hardware against DEVICE_API_KEY.
 */
@Injectable()
export class DeviceKeyGuard implements CanActivate {
  private readonly logger = new Logger(DeviceKeyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const expectedKey = process.env.DEVICE_API_KEY?.trim();

    if (!expectedKey) {
      this.logger.error(
        'DEVICE_API_KEY no está configurada en las variables de entorno del servidor.',
      );
      throw new UnauthorizedException(
        'Autenticación de dispositivo no configurada.',
      );
    }

    const headerValue = request.headers?.['x-device-key'];
    const providedKey = Array.isArray(headerValue)
      ? headerValue[0]?.trim()
      : typeof headerValue === 'string'
        ? headerValue.trim()
        : '';

    if (!providedKey) {
      throw new UnauthorizedException('Falta el encabezado X-Device-Key.');
    }

    const expectedBuf = Buffer.from(expectedKey, 'utf8');
    const providedBuf = Buffer.from(providedKey, 'utf8');

    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      this.logger.warn(
        `Intento de acceso con X-Device-Key inválida desde IP ${request.ip}`,
      );
      throw new UnauthorizedException('X-Device-Key inválida.');
    }

    return true;
  }
}

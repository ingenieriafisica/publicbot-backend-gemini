import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { TokenBlacklistService } from './token-blacklist.service';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private tokenBlacklistService: TokenBlacklistService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Token de autenticación no proporcionado.');
    }

    const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      throw new UnauthorizedException('El token ha sido revocado. Inicie sesión nuevamente.');
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('La clave secreta JWT (JWT_SECRET) no está definida en las variables de entorno.');
      }
      const payload = await this.jwtService.verifyAsync(token, {
        secret: secret,
      });
      request['user'] = payload;
    } catch (error: any) {
      if (error?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('El token ha expirado.');
      }
      if (error instanceof Error && error.message.includes('JWT_SECRET')) {
         throw new UnauthorizedException(error.message); // Lanza el error de configuración
      }
      throw new UnauthorizedException('Token inválido o malformado.');
    }
    return true;
  }
  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

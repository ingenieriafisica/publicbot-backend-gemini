import { Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private redis: Redis;
  private isConnected = false;

  constructor(private jwtService: JwtService) {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 3) {
          return null; // No saturar si Redis está apagado
        }
        return Math.min(times * 1000, 3000);
      },
      lazyConnect: false,
    });

    this.redis.on('connect', () => {
      this.isConnected = true;
      this.logger.log('Conexión con Redis establecida con éxito.');
    });

    this.redis.on('error', (err) => {
      this.isConnected = false;
      this.logger.warn(`Redis no disponible (${err.message}). El servicio continúa con degradación elegante.`);
    });
  }

  async blacklistToken(token: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      const decoded = this.jwtService.decode(token) as { exp: number };
      if (!decoded || !decoded.exp) return;
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);

      if (ttl > 0) {
        await this.redis.setex(`blacklist:${token}`, ttl, 'true');
      }
    } catch (error) {
      this.logger.warn('Error al almacenar token en Redis:', error);
    }
  }

  async isBlacklisted(token: string): Promise<boolean> {
    if (!this.isConnected) return false;
    try {
      const result = await this.redis.get(`blacklist:${token}`);
      return result !== null;
    } catch (error) {
      return false;
    }
  }
}
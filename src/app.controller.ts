import { Controller, Get, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService, HealthCheckResponse } from './app.service';
import { JwtGuard } from './auth/jwt.guard';

@SkipThrottle()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @UseGuards(JwtGuard)
  @Get('health')
  getHealth(): HealthCheckResponse {
    return this.appService.getHealthDetailed();
  }

  @UseGuards(JwtGuard)
  @Get('usage')
  getMetrics(): any {
    return this.appService.getMetrics();
  }

  @Get('status')
  ping(): { message: string; timestamp: string } {
    return this.appService.ping();
  }

}
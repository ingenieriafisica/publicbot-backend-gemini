import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  UseGuards,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpDto, VerifyOtpDto } from './dto/auth.dto';
import { LoginAuthDto } from './dto/login-auth.dto';
import { JwtGuard } from './jwt.guard';
import { Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Get('mail-status')
  @ApiOperation({ summary: 'Diagnosticar estado del servicio de correo SMTP' })
  async getMailStatus() {
    return this.authService.getMailStatus();
  }

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar código de verificación OTP por correo' })
  @ApiResponse({
    status: 200,
    description: 'Código OTP generado y enviado al correo si el usuario existe.',
  })
  async requestOtp(@Body() requestOtpDto: RequestOtpDto) {
    this.logger.log(
      `POST /auth/request-otp - Identificador: ${requestOtpDto.identifier}`,
    );
    return this.authService.requestOtp(requestOtpDto.identifier);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verificar código OTP y emitir token JWT' })
  @ApiResponse({
    status: 200,
    description: 'Token de acceso JWT emitido correctamente.',
  })
  @ApiResponse({ status: 401, description: 'Código OTP inválido o expirado.' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    this.logger.log(
      `POST /auth/verify-otp - Identificador: ${verifyOtpDto.identifier}`,
    );
    return this.authService.verifyOtp(
      verifyOtpDto.identifier,
      verifyOtpDto.otpCode,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login tradicional con contraseña (obsoleto)' })
  login(@Body() loginDto: LoginAuthDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cerrar sesión e invalidar token JWT' })
  async logout(@Req() req: Request) {
    const token = req.headers.authorization?.split(' ')[1];
    return this.authService.logout(token || '');
  }
}
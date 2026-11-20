import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from 'src/users/users.service';
import { LoginAuthDto } from './dto/login-auth.dto';
import { TokenBlacklistService } from './token-blacklist.service';
import { MailService } from './mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly mailService: MailService,
  ) {}

  async getMailStatus() {
    return this.mailService.testConnection();
  }

  /**
   * Paso 1 de autenticación OTP:
   * Solicita el envío de un código OTP al correo del usuario.
   */
  async requestOtp(identifier: string): Promise<{ message: string }> {
    this.logger.log(`Solicitud de OTP recibida para identificador: ${identifier}`);
    const user = await this.usersService.findByEmailOrPhone(identifier);

    if (!user || user.estado_actual === false) {
      this.logger.warn(
        `Intento de OTP para usuario no existente o inactivo: ${identifier}`,
      );
      return {
        message:
          'Si el usuario existe y está activo, se ha enviado un código OTP a su correo.',
      };
    }

    const otpCode = crypto.randomInt(100000, 999999).toString();
    const expirationMin = parseInt(
      process.env.OTP_EXPIRATION_MINUTES || '5',
      10,
    );
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMin);

    await this.usersService.updateOtp(user._id.toString(), otpCode, expiresAt);

    const recipient = user.correo_sena || user.correo_particular || identifier;
    await this.mailService.sendOtp(recipient, otpCode, expirationMin);

    return {
      message:
        'Si el usuario existe y está activo, se ha enviado un código OTP a su correo.',
    };
  }

  /**
   * Paso 2 de autenticación OTP:
   * Valida el código OTP de 6 dígitos y emite un token JWT.
   */
  async verifyOtp(
    identifier: string,
    otpCode: string,
  ): Promise<{ accessToken: string; user: any }> {
    this.logger.log(`Verificación de OTP recibida para: ${identifier}`);
    const user = await this.usersService.findByEmailOrPhone(identifier);

    if (!user) {
      this.logger.warn(
        `Usuario no encontrado para verificación OTP: ${identifier}`,
      );
      throw new UnauthorizedException('Identificador u OTP inválido.');
    }

    if (user.estado_actual === false) {
      this.logger.warn(`Usuario inactivo intentando iniciar sesión: ${identifier}`);
      throw new UnauthorizedException('El usuario se encuentra inactivo.');
    }

    const validUser = await this.usersService.verifyAndClearOtp(
      user._id.toString(),
      otpCode,
    );

    const fullName =
      [validUser.nombre, validUser.apellido].filter(Boolean).join(' ') ||
      validUser.usuario_asignado ||
      validUser.correo_sena.split('@')[0];

    const payload = {
      sub: validUser._id.toString(),
      id: validUser._id.toString(),
      email: validUser.correo_sena,
      correo_sena: validUser.correo_sena,
      role: validUser.rol_asignado,
      rol_asignado: validUser.rol_asignado,
      name: fullName,
      identificacion: validUser.identificacion,
      numero_celular: validUser.numero_celular,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    this.logger.log(
      `Autenticación OTP exitosa para usuario: ${validUser.correo_sena}`,
    );

    return {
      accessToken,
      user: {
        id: validUser._id.toString(),
        identificacion: validUser.identificacion,
        nombre: validUser.nombre,
        apellido: validUser.apellido,
        fullName,
        correo_sena: validUser.correo_sena,
        numero_celular: validUser.numero_celular,
        rol_asignado: validUser.rol_asignado,
        role: validUser.rol_asignado,
        estado_actual: validUser.estado_actual,
      },
    };
  }

  /**
   * Cierre de sesión e invalidación de token en Redis.
   */
  async logout(token: string): Promise<{ message: string }> {
    await this.tokenBlacklistService.blacklistToken(token);
    return { message: 'Sesión cerrada exitosamente' };
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    return this.tokenBlacklistService.isBlacklisted(token);
  }

  /**
   * Método de login con contraseña clásico mantenido para compatibilidad.
   */
  async login(loginDto: LoginAuthDto) {
    const user = await this.usersService.findByEmail(loginDto.correo_sena, true);

    if (!user) {
      throw new NotFoundException('No se encontró el usuario');
    }

    if (!user.password) {
      throw new UnauthorizedException(
        'Este usuario debe ingresar mediante código OTP enviado a su correo.',
      );
    }

    const isPasswordMatching = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordMatching) {
      throw new UnauthorizedException('Credenciales no válidas');
    }

    const fullName = [user.nombre, user.apellido].filter(Boolean).join(' ');
    const payload = {
      sub: (user as any)._id?.toString(),
      id: (user as any)._id?.toString(),
      email: user.correo_sena,
      correo_sena: user.correo_sena,
      role: user.rol_asignado,
      name: fullName,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}

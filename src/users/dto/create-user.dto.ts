import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsBoolean,
  IsEmail,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Número de identificación único del usuario.',
    example: 1028745632,
  })
  @IsOptional()
  @IsNumber({}, { message: 'La identificación debe ser un número.' })
  identificacion?: number;

  @ApiPropertyOptional({
    description: 'Alias para identificación (cédula) usado en certibot.',
    example: 1028745632,
  })
  @IsOptional()
  @IsNumber({}, { message: 'tenantId debe ser un número.' })
  tenantId?: number;

  @ApiPropertyOptional({
    description: 'Nombre completo o primer nombre del usuario.',
    example: 'Juan',
  })
  @IsOptional()
  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  nombre?: string;

  @ApiPropertyOptional({
    description: 'Primer nombre del usuario.',
    example: 'Juan',
  })
  @IsOptional()
  @IsString()
  primer_nombre?: string;

  @ApiPropertyOptional({
    description: 'Segundo nombre del usuario.',
    example: 'Carlos',
  })
  @IsOptional()
  @IsString()
  segundo_nombre?: string;

  @ApiPropertyOptional({
    description: 'Apellido completo o primer apellido del usuario.',
    example: 'Pérez',
  })
  @IsOptional()
  @IsString({ message: 'El apellido debe ser una cadena de texto.' })
  apellido?: string;

  @ApiPropertyOptional({
    description: 'Primer apellido del usuario.',
    example: 'Pérez',
  })
  @IsOptional()
  @IsString()
  primer_apellido?: string;

  @ApiPropertyOptional({
    description: 'Segundo apellido del usuario.',
    example: 'González',
  })
  @IsOptional()
  @IsString()
  segundo_apellido?: string;

  @ApiProperty({
    description: 'Correo electrónico del usuario (debe ser de dominio @sena.edu.co).',
    example: 'jperez@sena.edu.co',
  })
  @IsEmail({}, { message: 'El correo debe ser una dirección de email válida.' })
  @Matches(/^\S+@sena\.edu\.co$/, { message: 'El correo debe ser de dominio @sena.edu.co.' })
  @MaxLength(100, { message: 'El correo no debe exceder los 100 caracteres.' })
  correo_sena!: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico personal alternativo.',
    example: 'juan.perez@gmail.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo particular debe ser válido.' })
  correo_particular?: string;

  @ApiProperty({
    description: 'Número de celular del usuario.',
    example: '3001234567',
  })
  @IsString({ message: 'El número de celular debe ser una cadena de texto.' })
  numero_celular!: string;

  @ApiProperty({
    description: 'Rol asignado al usuario (ej. "Administrador", "Dinamizador", "Asesor I.E", "Usuario").',
    example: 'Administrador',
  })
  @IsString({ message: 'El rol asignado debe ser una cadena de texto.' })
  rol_asignado!: string;

  @ApiPropertyOptional({
    description: 'Contraseña opcional (el sistema opera principalmente mediante OTP sin contraseñas).',
    example: 'MiContraseñaSegura123',
    format: 'password',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser una cadena de texto.' })
  password?: string;

  @ApiPropertyOptional({
    description: 'Estado actual del usuario (activo o inactivo). Por defecto es verdadero.',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean({ message: 'El estado actual debe ser un valor booleano.' })
  estado_actual?: boolean;

  @ApiPropertyOptional({
    description: 'Tipo de documento (ej. C.C., T.I., C.E., P.A.)',
    example: 'C.C.',
  })
  @IsOptional()
  @IsString()
  tipo_de_identificacion?: string;

  @ApiPropertyOptional({
    description: 'Fecha de nacimiento (ISO 8601)',
    example: '1990-05-15',
  })
  @IsOptional()
  fecha_nacimiento?: string | Date;

  @ApiPropertyOptional({ description: 'País de residencia', example: 'Colombia' })
  @IsOptional()
  @IsString()
  pais_residencia?: string;

  @ApiPropertyOptional({ description: 'Departamento de residencia', example: 'Antioquia' })
  @IsOptional()
  @IsString()
  dpto_residencia?: string;

  @ApiPropertyOptional({ description: 'Municipio de residencia', example: 'Medellín' })
  @IsOptional()
  @IsString()
  mncpio_residencia?: string;

  @ApiPropertyOptional({ description: 'Dirección de residencia', example: 'Calle 10 # 20-30' })
  @IsOptional()
  @IsString()
  direccion_residencia?: string;

  @ApiPropertyOptional({ description: 'Teléfono entidad', example: '6041234567' })
  @IsOptional()
  @IsString()
  telefono_entidad?: string;

  @ApiPropertyOptional({ description: 'Extensión telefónica', example: '1234' })
  @IsOptional()
  @IsString()
  extension_telefonica?: string;

  @ApiPropertyOptional({ description: 'Fecha de inicio del contrato', example: '2025-01-01' })
  @IsOptional()
  fecha_inicio_contrato?: string | Date;

  @ApiPropertyOptional({ description: 'Fecha de fin del contrato', example: '2025-12-31' })
  @IsOptional()
  fecha_fin_contrato?: string | Date;

  @ApiPropertyOptional({ description: 'Número de contrato', example: 'CT-2025-001' })
  @IsOptional()
  @IsString()
  numero_contrato?: string;

  @ApiPropertyOptional({ description: 'Usuario asignado', example: 'jperez' })
  @IsOptional()
  @IsString()
  usuario_asignado?: string;
}
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional({
    description: 'Número de identificación único del usuario.',
    example: 1028745632,
  })
  @IsOptional()
  @IsNumber({}, { message: 'La identificación debe ser un número.' })
  identificacion?: number;

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
    description: 'Apellido completo del usuario.',
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

  @ApiPropertyOptional({
    description: 'Correo electrónico institucional (@sena.edu.co).',
    example: 'jperez@sena.edu.co',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo debe ser una dirección de email válida.' })
  @Matches(/^\S+@sena\.edu\.co$/, { message: 'El correo debe ser de dominio @sena.edu.co.' })
  @MaxLength(100, { message: 'El correo no debe exceder los 100 caracteres.' })
  correo_sena?: string;

  @ApiPropertyOptional({
    description: 'Correo electrónico particular alternativo.',
    example: 'juan.perez@gmail.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'El correo particular debe ser una dirección válida.' })
  correo_particular?: string;

  @ApiPropertyOptional({
    description: 'Número de celular del usuario.',
    example: '3001234567',
  })
  @IsOptional()
  @IsString({ message: 'El número de celular debe ser una cadena de texto.' })
  numero_celular?: string;

  @ApiPropertyOptional({
    description: 'Rol asignado al usuario (ej. Administrador, Dinamizador, Editor, Usuario).',
    example: 'Administrador',
  })
  @IsOptional()
  @IsString({ message: 'El rol asignado debe ser una cadena de texto.' })
  rol_asignado?: string;

  @ApiPropertyOptional({
    description: 'Estado actual del usuario (activo o inactivo).',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'El estado actual debe ser un valor booleano.' })
  estado_actual?: boolean;

  @ApiPropertyOptional({
    description: 'Tipo de documento (C.C., T.I., C.E., P.A.).',
    example: 'C.C.',
  })
  @IsOptional()
  @IsString()
  tipo_de_identificacion?: string;

  @ApiPropertyOptional({
    description: 'Contraseña opcional si se desea actualizar explícitamente.',
    example: 'NuevaClaveSegura123',
    required: false,
  })
  @IsOptional()
  @IsString({ message: 'La contraseña debe ser una cadena de texto.' })
  password?: string;
}

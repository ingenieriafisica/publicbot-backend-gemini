import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestOtpDto {
  @ApiProperty({
    description:
      'Identificador del usuario (correo SENA, correo personal, celular o número de identificación)',
    example: 'usuario@sena.edu.co',
  })
  @IsNotEmpty({
    message: 'El identificador (email, celular o documento) es requerido.',
  })
  @IsString()
  identifier!: string;
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Identificador del usuario',
    example: 'usuario@sena.edu.co',
  })
  @IsNotEmpty({
    message: 'El identificador es requerido.',
  })
  @IsString()
  identifier!: string;

  @ApiProperty({
    description: 'Código OTP de 6 dígitos recibido por correo',
    example: '123456',
  })
  @IsNotEmpty({
    message: 'El código OTP es requerido.',
  })
  @IsString()
  otpCode!: string;
}

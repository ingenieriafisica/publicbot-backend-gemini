import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AskDto {
  @ApiProperty({
    description: 'Pregunta o prompt del usuario',
    example: '¿Cómo funciona la certificación de competencias laborales?',
  })
  @IsString({ message: 'El prompt debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El prompt es requerido' })
  prompt: string;
}

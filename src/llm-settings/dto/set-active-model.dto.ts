import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetActiveModelDto {
  @ApiProperty({
    example: 'gemini-2.5-flash',
    description: 'Identificador del modelo Gemini que se activará globalmente',
  })
  @IsString()
  @IsNotEmpty({ message: 'El campo model es requerido' })
  model: string;
}

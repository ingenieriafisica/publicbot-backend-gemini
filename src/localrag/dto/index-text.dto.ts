import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IndexTextDto {
  @ApiProperty({
    description: 'Contenido del documento a indexar',
    example: 'Texto del documento para la base vectorial...',
  })
  @IsString({ message: 'El contenido debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El contenido es requerido' })
  contenido: string;

  @ApiProperty({
    description: 'Metadatos adicionales asociados al documento',
    required: false,
  })
  @IsOptional()
  @IsObject({ message: 'Los metadatos deben ser un objeto' })
  metadatos?: Record<string, any>;
}

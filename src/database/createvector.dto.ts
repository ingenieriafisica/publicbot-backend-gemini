import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsString, ArrayMinSize, ArrayNotEmpty } from 'class-validator';

export class CreateVectorDto {
  @ApiProperty({
    description: 'El array de números que representa el embedding del vector.',
    type: [Number],
    example: [0.1, 0.2, 0.3, 0.4],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsNumber({}, { each: true })
  embedding: number[];

  @ApiProperty({
    description: 'El contenido textual asociado al vector.',
    example: 'Este es un documento de prueba de una respuesta.',
  })
  @IsString()
  document: string;

  @ApiProperty({
    description: 'El enunciado de la pregunta que se va a responder en el documento.',
    example: 'En donde me puedo certificar ?',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'La categoría a la que pertenece la pregunta que hace un usuario del chatbot público.',
    example: 'Certificatones',
  })
  @IsString()
  category: string;
}
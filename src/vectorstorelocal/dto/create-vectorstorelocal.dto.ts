import { IsNotEmpty, IsString, IsOptional } from 'class-validator';


export class CreateVectorstorelocalDto {
  @IsNotEmpty({ message: 'El campo "document" no puede estar vacío.' })
  @IsString({ message: 'El campo "document" debe ser una cadena de texto.' })
  document: string;

  @IsOptional()
  @IsString({ message: 'El campo "chunkId" debe ser una cadena de texto.' })
  chunkId?: string;

  @IsOptional()
  @IsString({ message: 'El campo "slug" debe ser una cadena de texto.' })
  slug?: string;

  @IsOptional()
  @IsString({ message: 'El campo "source" debe ser una cadena de texto.' })
  source?: string;

  @IsOptional()
  @IsString({ message: 'El campo "title" debe ser una cadena de texto.' })
  title?: string;

}
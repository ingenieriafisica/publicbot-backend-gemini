import { ApiProperty } from '@nestjs/swagger';

export class LlmModelInfo {
  @ApiProperty({ example: 'gemini-2.5-flash', description: 'Identificador del modelo en Gemini' })
  id: string;

  @ApiProperty({ example: 'models/gemini-2.5-flash', description: 'Nombre canónico del recurso' })
  name: string;

  @ApiProperty({ example: 'Gemini 2.5 Flash', description: 'Nombre amigable para la interfaz' })
  displayName: string;

  @ApiProperty({ example: 'Modelo equilibrado de alta velocidad y razonamiento multimodal', description: 'Descripción detallada de capacidades' })
  description: string;

  @ApiProperty({ example: 'flash', enum: ['flash', 'pro', 'lite', 'preview'], description: 'Familia o categoría del modelo' })
  category: 'flash' | 'pro' | 'lite' | 'preview';

  @ApiProperty({ example: 1048576, description: 'Límite de tokens de entrada' })
  inputTokenLimit: number;

  @ApiProperty({ example: 8192, description: 'Límite de tokens de salida' })
  outputTokenLimit: number;

  @ApiProperty({ example: true, description: 'Indica si soporta modo de pensamiento / razonamiento' })
  thinkingSupported: boolean;

  @ApiProperty({ example: true, description: 'Indica si es el modelo sugerido por defecto' })
  recommended?: boolean;
}

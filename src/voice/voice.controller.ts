import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { DeviceKeyGuard } from './guards/device-key.guard';
import { VoiceService } from './voice.service';

const MAX_UPLOAD_WAV_BYTES = 2 * 1024 * 1024;

interface UploadedAudioFile {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
}

function truncateSafely(text: string, maxChars: number): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3).trimEnd() + '...';
}

@ApiTags('Voice Assistant (SOFIA)')
@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Get('health')
  @ApiOperation({
    summary:
      'Verifica el estado del servicio de voz SOFIA y el modelo multimodal activo',
  })
  @ApiResponse({ status: 200, description: 'Estado del servicio de voz' })
  getHealth() {
    return this.voiceService.getHealth();
  }

  @Post('ask')
  @UseGuards(DeviceKeyGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_WAV_BYTES },
    }),
  )
  @ApiOperation({
    summary:
      'Recibe una pregunta en audio WAV desde SOFIA (ESP32-S3) y responde con audio WAV 16kHz + cabeceras de texto',
  })
  @ApiHeader({
    name: 'X-Device-Key',
    description: 'Clave de dispositivo configurada en DEVICE_API_KEY',
    required: true,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Audio WAV 16kHz 16-bit mono' })
  @ApiResponse({
    status: 400,
    description: 'Archivo de audio inválido o ausente',
  })
  @ApiResponse({ status: 401, description: 'X-Device-Key inválida o ausente' })
  async askVoice(
    @UploadedFile() file: UploadedAudioFile,
    @Res() res: Response,
  ): Promise<void> {
    if (!file || !file.buffer || file.buffer.length <= 44) {
      throw new BadRequestException(
        'Se requiere un archivo WAV válido en el campo multipart "file".',
      );
    }

    const result = await this.voiceService.askVoice(file.buffer);
    const encodedTranscription = encodeURIComponent(
      truncateSafely(result.transcription, 300),
    );
    const encodedAnswer = encodeURIComponent(
      truncateSafely(result.answerText, 600),
    );

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(result.wavBuffer.length));
    res.setHeader('X-Transcription', encodedTranscription);
    res.setHeader('X-Answer-Text', encodedAnswer);
    res.setHeader('X-Voice-Model', result.modelUsed);
    res.setHeader('Cache-Control', 'no-store');

    res.status(HttpStatus.OK).end(result.wavBuffer);
  }
}

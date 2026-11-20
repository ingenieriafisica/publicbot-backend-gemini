import { BadRequestException } from '@nestjs/common';

export interface ParsedWavAudio {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  pcmMono16: Buffer;
}

/**
 * Parses a RIFF/WAVE buffer into 16-bit mono PCM bytes.
 */
export function parseWavBuffer(wavBuffer: Buffer): ParsedWavAudio {
  if (!wavBuffer || wavBuffer.length < 44) {
    throw new BadRequestException('Archivo WAV inválido o demasiado pequeño.');
  }

  if (
    wavBuffer.toString('ascii', 0, 4) !== 'RIFF' ||
    wavBuffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new BadRequestException('Encabezado RIFF/WAVE inválido.');
  }

  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let foundFmt = false;
  let pcmRaw: Buffer | null = null;

  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;

    if (chunkId === 'fmt ') {
      if (dataStart + 16 > wavBuffer.length) {
        throw new BadRequestException('Bloque fmt de WAV truncado.');
      }
      audioFormat = wavBuffer.readUInt16LE(dataStart);
      channels = wavBuffer.readUInt16LE(dataStart + 2);
      sampleRate = wavBuffer.readUInt32LE(dataStart + 4);
      bitsPerSample = wavBuffer.readUInt16LE(dataStart + 14);
      foundFmt = true;
    } else if (chunkId === 'data') {
      const safeEnd = Math.min(wavBuffer.length, dataStart + chunkSize);
      pcmRaw = wavBuffer.subarray(dataStart, safeEnd);
      break;
    }

    // RIFF chunks are word-aligned (padded to even byte boundary)
    const paddedSize = chunkSize + (chunkSize % 2);
    offset = dataStart + paddedSize;
  }

  if (!foundFmt || !pcmRaw) {
    throw new BadRequestException(
      'El archivo WAV no contiene bloques fmt/data válidos.',
    );
  }
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new BadRequestException(
      `Formato WAV no soportado (format=${audioFormat}, bits=${bitsPerSample}). Se requiere PCM 16-bit.`,
    );
  }
  if (channels < 1 || channels > 2 || sampleRate < 8000 || sampleRate > 96000) {
    throw new BadRequestException(
      `Parámetros WAV inválidos (canales=${channels}, sampleRate=${sampleRate}).`,
    );
  }

  // Ensure sample-aligned length
  const frameSize = channels * 2;
  const alignedLen = pcmRaw.length - (pcmRaw.length % frameSize);
  const alignedPcm = pcmRaw.subarray(0, alignedLen);

  let pcmMono16: Buffer;
  if (channels === 1) {
    pcmMono16 = Buffer.from(alignedPcm);
  } else {
    const frameCount = alignedPcm.length / 4;
    pcmMono16 = Buffer.allocUnsafe(frameCount * 2);
    for (let i = 0; i < frameCount; i++) {
      const left = alignedPcm.readInt16LE(i * 4);
      const right = alignedPcm.readInt16LE(i * 4 + 2);
      pcmMono16.writeInt16LE((left + right) >> 1, i * 2);
    }
  }

  return {
    audioFormat,
    channels: 1,
    sampleRate,
    bitsPerSample: 16,
    pcmMono16,
  };
}

/**
 * Extracts sample rate from a MIME type string such as "audio/pcm;rate=24000".
 */
export function parseSampleRateFromMimeType(
  mimeType?: string,
  defaultRate = 24000,
): number {
  if (!mimeType) return defaultRate;
  const match = /rate=(\d+)/i.exec(mimeType);
  if (!match) return defaultRate;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed >= 8000 && parsed <= 96000
    ? parsed
    : defaultRate;
}

/**
 * Resamples 16-bit signed LE mono PCM audio using a 3-tap low-pass prefilter
 * when downsampling followed by linear interpolation.
 */
export function resamplePcm16Mono(
  pcmBuffer: Buffer,
  fromRate: number,
  toRate: number,
): Buffer {
  const alignedLength = pcmBuffer.length - (pcmBuffer.length % 2);
  if (alignedLength === 0) {
    return Buffer.alloc(0);
  }
  if (fromRate === toRate) {
    return pcmBuffer.subarray(0, alignedLength);
  }

  const inSamples = alignedLength / 2;
  const outSamples = Math.max(1, Math.floor((inSamples * toRate) / fromRate));
  const outBuffer = Buffer.allocUnsafe(outSamples * 2);

  // Apply light 3-tap low-pass smoothing when downsampling to avoid aliasing hiss
  const src = new Int16Array(inSamples);
  if (toRate < fromRate && inSamples >= 3) {
    src[0] = pcmBuffer.readInt16LE(0);
    for (let i = 1; i < inSamples - 1; i++) {
      const prev = pcmBuffer.readInt16LE((i - 1) * 2);
      const curr = pcmBuffer.readInt16LE(i * 2);
      const next = pcmBuffer.readInt16LE((i + 1) * 2);
      src[i] = Math.round(0.25 * prev + 0.5 * curr + 0.25 * next);
    }
    src[inSamples - 1] = pcmBuffer.readInt16LE((inSamples - 1) * 2);
  } else {
    for (let i = 0; i < inSamples; i++) {
      src[i] = pcmBuffer.readInt16LE(i * 2);
    }
  }

  const ratio = fromRate / toRate;
  for (let i = 0; i < outSamples; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = src[idx];
    const s1 = idx + 1 < inSamples ? src[idx + 1] : s0;
    const interpolated = Math.round(s0 + (s1 - s0) * frac);
    const clamped = Math.max(-32768, Math.min(32767, interpolated));
    outBuffer.writeInt16LE(clamped, i * 2);
  }

  return outBuffer;
}

/**
 * Wraps raw 16-bit mono PCM bytes with a canonical 44-byte RIFF/WAVE header.
 */
export function buildWavBuffer(
  pcmData: Buffer,
  sampleRate = 16000,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const alignedLength = pcmData.length - (pcmData.length % 2);
  const dataSize = alignedLength;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 4, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 4, 'ascii');
  header.write('fmt ', 12, 4, 'ascii');
  header.writeUInt32LE(16, 16); // PCM Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 4, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData.subarray(0, dataSize)]);
}

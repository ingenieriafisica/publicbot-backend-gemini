import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  FunctionCall,
  FunctionResponse,
  LiveServerMessage,
  Modality,
  Session,
  Type,
} from '@google/genai';
import { GeminiService } from '../gemini/gemini.service';
import { LocalragService } from '../localrag/localrag.service';
import {
  buildWavBuffer,
  parseSampleRateFromMimeType,
  parseWavBuffer,
  resamplePcm16Mono,
} from './audio.util';

export interface VoiceAskResult {
  wavBuffer: Buffer;
  transcription: string;
  answerText: string;
  modelUsed: string;
  latencyMs: number;
}

interface LiveAttemptResult {
  pcmAudio: Buffer;
  sampleRate: number;
  transcription: string;
  answerText: string;
}

const TARGET_SAMPLE_RATE = 16000;
const LIVE_CHUNK_BYTES = 3200; // 100ms of 16kHz 16-bit mono PCM
const LIVE_SESSION_TIMEOUT_MS = 15000;
const RAG_TOOL_TIMEOUT_MS = 6000;
const MAX_OUTPUT_PCM_BYTES = 1800000; // ~56s at 16kHz 16-bit mono (fits under 2MB ESP32 limit)

const SOFIA_SYSTEM_INSTRUCTION = `Eres SOFIA, la asistente virtual de voz del SENA (Servicio Nacional de Aprendizaje de Colombia). Tu única fuente de conocimiento factual es la herramienta RAG "consultar_conocimiento_sena".

REGLAS ESTRICTAS PARA RESPUESTAS DE VOZ:
1. Responde siempre en español con tono cálido, claro, profesional y natural para ser escuchado en voz alta.
2. Sé concisa: máximo 2 a 3 oraciones cortas (alrededor de 30 a 45 palabras), sin rodeos.
3. No uses formato Markdown, asteriscos, viñetas, URLs largas ni menciones fuentes, documentos, archivos, puntajes, porcentajes o herramientas internas (no digas "según el texto", "en la base de datos", etc.).
4. OBLIGATORIO: Para CUALQUIER pregunta o consulta informativa, llama SIEMPRE primero a la herramienta "consultar_conocimiento_sena" antes de responder. Nunca respondas preguntas factuales usando conocimiento previo o de memoria. Solo puedes omitir la herramienta ante saludos o despedidas simples (como "hola" o "gracias").
5. Responde ÚNICAMENTE con base en la información devuelta por "consultar_conocimiento_sena". Si la información devuelta no responde la pregunta o no pertenece a la base de conocimiento del SENA, di exactamente: "No dispongo de información suficiente para responder a esa pregunta."
6. Si el audio recibido es puro silencio o ininteligible, pide brevemente que repitan la pregunta.`;

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly voiceModel =
    process.env.GEMINI_VOICE_MODEL || 'gemini-3.8-live';
  private readonly fallbackTextModel =
    process.env.GEMINI_VOICE_FALLBACK_MODEL || 'gemini-3.8-flash';
  private readonly fallbackTtsModel =
    process.env.GEMINI_TTS_FALLBACK_MODEL || 'gemini-3.8-flash-tts';
  private readonly voiceName = process.env.GEMINI_VOICE_NAME || 'Aoede';

  constructor(
    private readonly geminiService: GeminiService,
    private readonly localragService: LocalragService,
  ) {}

  getHealth() {
    return {
      status: this.geminiService.isConfigured() ? 'ok' : 'degraded',
      voiceModel: this.voiceModel,
      fallbackTextModel: this.fallbackTextModel,
      fallbackTtsModel: this.fallbackTtsModel,
      voiceName: this.voiceName,
      geminiConfigured: this.geminiService.isConfigured(),
      deviceKeyConfigured: Boolean(process.env.DEVICE_API_KEY?.trim()),
      timestamp: new Date().toISOString(),
    };
  }

  async askVoice(wavBuffer: Buffer): Promise<VoiceAskResult> {
    if (!this.geminiService.isConfigured()) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY no configurada en el servidor.',
      );
    }

    const startTime = Date.now();
    const parsed = parseWavBuffer(wavBuffer);
    const pcm16k =
      parsed.sampleRate === TARGET_SAMPLE_RATE
        ? parsed.pcmMono16
        : resamplePcm16Mono(
            parsed.pcmMono16,
            parsed.sampleRate,
            TARGET_SAMPLE_RATE,
          );

    const normalizedInputWav =
      parsed.sampleRate === TARGET_SAMPLE_RATE && parsed.channels === 1
        ? wavBuffer
        : buildWavBuffer(pcm16k, TARGET_SAMPLE_RATE, 1, 16);

    let transcription = '';
    let answerText = '';
    let outputPcm: Buffer = Buffer.alloc(0);
    let outputSampleRate = 24000;
    let modelUsed = this.voiceModel;

    try {
      const liveResult = await this.askWithGeminiLive(pcm16k);
      transcription = liveResult.transcription;
      answerText = liveResult.answerText;
      outputPcm = liveResult.pcmAudio;
      outputSampleRate = liveResult.sampleRate;
    } catch (liveError: any) {
      this.logger.warn(
        `Fallo en sesión Live (${this.voiceModel}): ${liveError?.message}. Activando pipeline de respaldo.`,
      );
    }

    if (outputPcm.length === 0) {
      modelUsed = `${this.fallbackTextModel}+${this.fallbackTtsModel}`;
      const fallbackResult = await this.askWithFallbackPipeline(
        normalizedInputWav,
        transcription,
      );
      transcription = fallbackResult.transcription || transcription;
      answerText = fallbackResult.answerText;
      outputPcm = fallbackResult.pcmAudio;
      outputSampleRate = fallbackResult.sampleRate;
    }

    if (outputPcm.length === 0) {
      throw new ServiceUnavailableException(
        'No se pudo generar respuesta de audio.',
      );
    }

    let pcmOut16k = resamplePcm16Mono(
      outputPcm,
      outputSampleRate,
      TARGET_SAMPLE_RATE,
    );

    if (pcmOut16k.length > MAX_OUTPUT_PCM_BYTES) {
      const alignedCap = MAX_OUTPUT_PCM_BYTES - (MAX_OUTPUT_PCM_BYTES % 2);
      pcmOut16k = pcmOut16k.subarray(0, alignedCap);
    }

    const responseWav = buildWavBuffer(pcmOut16k, TARGET_SAMPLE_RATE, 1, 16);
    const cleanTranscription = this.sanitizeForDisplay(transcription);
    const cleanAnswer = this.sanitizeForDisplay(answerText);
    const latencyMs = Date.now() - startTime;

    this.logger.log(
      `[SOFIA Voice] Modelo=${modelUsed} | In=${Math.round(pcm16k.length / 32)}ms | Out=${Math.round(pcmOut16k.length / 32)}ms (${responseWav.length}B) | Total=${latencyMs}ms`,
    );

    return {
      wavBuffer: responseWav,
      transcription: cleanTranscription,
      answerText: cleanAnswer,
      modelUsed,
      latencyMs,
    };
  }

  private async askWithGeminiLive(pcm16k: Buffer): Promise<LiveAttemptResult> {
    const ai = this.geminiService.getClient();
    const audioChunks: Buffer[] = [];
    let sampleRate = 24000;
    let transcription = '';
    let answerText = '';

    let session: Session | null = null;
    let settled = false;
    let pendingToolCalls = 0;
    let awaitingPostToolTurn = false;
    let toolResponseSent = false;
    let setupResolved = false;
    let genCompleteTimer: NodeJS.Timeout | null = null;

    let resolveSetup!: () => void;
    let rejectSetup!: (err: Error) => void;
    const setupReady = new Promise<void>((res, rej) => {
      resolveSetup = res;
      rejectSetup = rej;
    });

    let resolveTurn!: (result: LiveAttemptResult) => void;
    let rejectTurn!: (err: Error) => void;
    const turnDone = new Promise<LiveAttemptResult>((res, rej) => {
      resolveTurn = res;
      rejectTurn = rej;
    });

    const finishSuccess = () => {
      if (settled) return;
      settled = true;
      if (genCompleteTimer) {
        clearTimeout(genCompleteTimer);
        genCompleteTimer = null;
      }
      resolveTurn({
        pcmAudio: Buffer.concat(audioChunks),
        sampleRate,
        transcription: transcription.trim(),
        answerText: answerText.trim(),
      });
    };

    const finishError = (err: Error) => {
      if (!setupResolved) {
        setupResolved = true;
        rejectSetup(err);
      }
      if (settled) return;
      settled = true;
      if (genCompleteTimer) {
        clearTimeout(genCompleteTimer);
        genCompleteTimer = null;
      }
      rejectTurn(err);
    };

    const executeToolCalls = async (calls: FunctionCall[]) => {
      pendingToolCalls++;
      awaitingPostToolTurn = true;
      toolResponseSent = false;

      try {
        const responses: FunctionResponse[] = await Promise.all(
          calls.map(async (fc) => {
            if (fc.name === 'consultar_conocimiento_sena') {
              const pregunta = String(fc.args?.pregunta || '').trim();
              const ragResult = await this.lookupRagWithTimeout(pregunta);
              this.logger.log(
                `[SOFIA RAG] Consulta="${pregunta}" | Chunks=${ragResult.chunksCount} | Found=${ragResult.found}`,
              );
              return {
                id: fc.id,
                name: fc.name,
                response: ragResult.found
                  ? { contexto: ragResult.context }
                  : {
                      contexto:
                        'No se encontró información en la base de conocimiento del SENA para esta consulta.',
                    },
              };
            }
            return {
              id: fc.id,
              name: fc.name,
              response: { error: `Herramienta desconocida: ${fc.name}` },
            };
          }),
        );

        if (!settled && session) {
          session.sendToolResponse({ functionResponses: responses });
          toolResponseSent = true;
        }
      } catch (err: any) {
        this.logger.warn(`Error ejecutando toolCall Live: ${err?.message}`);
        if (!settled && session) {
          session.sendToolResponse({
            functionResponses: calls.map((fc) => ({
              id: fc.id,
              name: fc.name,
              response: {
                error: 'No se pudo consultar la base de conocimiento.',
              },
            })),
          });
          toolResponseSent = true;
        }
      } finally {
        pendingToolCalls = Math.max(0, pendingToolCalls - 1);
      }
    };

    const timeoutTimer = setTimeout(() => {
      if (audioChunks.length > 0) {
        this.logger.warn(
          `Timeout parcial en Live (${LIVE_SESSION_TIMEOUT_MS}ms); devolviendo ${audioChunks.length} fragmentos recibidos.`,
        );
        finishSuccess();
      } else {
        finishError(
          new Error(`Timeout esperando respuesta de ${this.voiceModel}`),
        );
      }
    }, LIVE_SESSION_TIMEOUT_MS);

    try {
      session = await ai.live.connect({
        model: this.voiceModel,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: this.voiceName },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: { disabled: true },
          },
          systemInstruction: {
            parts: [{ text: SOFIA_SYSTEM_INSTRUCTION }],
          },
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'consultar_conocimiento_sena',
                  description:
                    'Busca información oficial en la base de conocimiento RAG del SENA sobre certificación de competencias laborales, programas, requisitos y trámites.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      pregunta: {
                        type: Type.STRING,
                        description:
                          'Pregunta o tema a consultar en español en la base de conocimiento del SENA.',
                      },
                    },
                    required: ['pregunta'],
                  },
                },
              ],
            },
          ],
        },
        callbacks: {
          onmessage: (msg: LiveServerMessage) => {
            if (msg.setupComplete && !setupResolved) {
              setupResolved = true;
              resolveSetup();
            }

            const sc = msg.serverContent;
            if (sc?.inputTranscription?.text) {
              transcription += sc.inputTranscription.text;
            }
            if (sc?.outputTranscription?.text) {
              answerText += sc.outputTranscription.text;
              if (pendingToolCalls === 0 && toolResponseSent) {
                awaitingPostToolTurn = false;
              }
            }

            const parts = sc?.modelTurn?.parts || [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                if (audioChunks.length === 0 && part.inlineData.mimeType) {
                  sampleRate = parseSampleRateFromMimeType(
                    part.inlineData.mimeType,
                    24000,
                  );
                }
                audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
                if (pendingToolCalls === 0 && toolResponseSent) {
                  awaitingPostToolTurn = false;
                }
              } else if (
                part.text &&
                pendingToolCalls === 0 &&
                toolResponseSent
              ) {
                awaitingPostToolTurn = false;
              }
            }

            if (msg.toolCall?.functionCalls?.length) {
              if (genCompleteTimer) {
                clearTimeout(genCompleteTimer);
                genCompleteTimer = null;
              }
              void executeToolCalls(msg.toolCall.functionCalls);
            }

            if (sc?.generationComplete) {
              if (
                pendingToolCalls === 0 &&
                !awaitingPostToolTurn &&
                audioChunks.length > 0 &&
                !genCompleteTimer
              ) {
                // Gemini Live emits generationComplete as soon as all audio is generated,
                // before simulated realtime playback completes (turnComplete).
                genCompleteTimer = setTimeout(() => {
                  if (pendingToolCalls === 0 && !awaitingPostToolTurn) {
                    finishSuccess();
                  }
                }, 150);
              }
            }

            if (sc?.turnComplete) {
              if (pendingToolCalls === 0 && !awaitingPostToolTurn) {
                finishSuccess();
              }
            }
          },
          onerror: (err: any) => {
            const message = err?.message || 'Error WebSocket en Gemini Live';
            finishError(new Error(message));
          },
          onclose: (ev: any) => {
            if (audioChunks.length > 0) {
              finishSuccess();
            } else {
              finishError(
                new Error(
                  `Sesión Live cerrada antes de responder (code=${ev?.code ?? 'unknown'}, reason=${ev?.reason ?? ''})`,
                ),
              );
            }
          },
        },
      });

      // Wait briefly for setupComplete before streaming PCM audio
      await Promise.race([
        setupReady,
        new Promise<void>((resolve) => setTimeout(resolve, 3500)),
      ]);

      if (!settled) {
        session.sendRealtimeInput({ activityStart: {} });

        for (
          let offset = 0;
          offset < pcm16k.length;
          offset += LIVE_CHUNK_BYTES
        ) {
          const slice = pcm16k.subarray(
            offset,
            Math.min(offset + LIVE_CHUNK_BYTES, pcm16k.length),
          );
          session.sendRealtimeInput({
            audio: {
              data: slice.toString('base64'),
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        }

        session.sendRealtimeInput({ activityEnd: {} });
      }

      return await turnDone;
    } finally {
      clearTimeout(timeoutTimer);
      if (genCompleteTimer) {
        clearTimeout(genCompleteTimer);
        genCompleteTimer = null;
      }
      try {
        session?.close();
      } catch {
        // Ignore close errors during cleanup
      }
    }
  }

  private async askWithFallbackPipeline(
    wav16kBuffer: Buffer,
    existingTranscription: string,
  ): Promise<LiveAttemptResult> {
    const ai = this.geminiService.getClient();
    let transcription = existingTranscription.trim();

    if (!transcription) {
      const sttResp = await ai.models.generateContent({
        model: this.fallbackTextModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: wav16kBuffer.toString('base64'),
                  mimeType: 'audio/wav',
                },
              },
              {
                text: 'Transcribe exactamente lo que dice el usuario en español. Si no hay voz inteligible o solo hay ruido, responde exactamente: __SILENCE__',
              },
            ],
          },
        ],
        config: {
          temperature: 0,
          maxOutputTokens: 512,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const rawStt = (sttResp.text || '').trim();
      transcription = rawStt === '__SILENCE__' ? '' : rawStt;
    }

    let answerText: string;
    if (!transcription) {
      answerText =
        'No logré escucharte con claridad. Por favor, toca la pantalla e inténtalo de nuevo.';
    } else {
      const ragResult = await this.lookupRagWithTimeout(transcription);
      const promptText = ragResult.found
        ? `INFORMACIÓN DISPONIBLE DEL SENA:\n${ragResult.context}\n\nPREGUNTA DEL USUARIO: ${transcription}`
        : `INFORMACIÓN DISPONIBLE DEL SENA:\n(No hay información relevante en la base de conocimiento para esta consulta.)\n\nPREGUNTA DEL USUARIO: ${transcription}`;

      const ansResp = await ai.models.generateContent({
        model: this.fallbackTextModel,
        contents: promptText,
        config: {
          systemInstruction: SOFIA_SYSTEM_INSTRUCTION,
          temperature: 0.2,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      answerText =
        this.sanitizeForDisplay(ansResp.text || '') ||
        'No dispongo de información suficiente para responder a esa pregunta.';
    }

    const ttsResp = await ai.models.generateContent({
      model: this.fallbackTtsModel,
      contents: answerText,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: this.voiceName },
          },
        },
      },
    });

    const inlineAudio = ttsResp.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data,
    )?.inlineData;

    if (!inlineAudio?.data) {
      return {
        pcmAudio: Buffer.alloc(0),
        sampleRate: 24000,
        transcription,
        answerText,
      };
    }

    const rawAudio = Buffer.from(inlineAudio.data, 'base64');
    if (
      inlineAudio.mimeType?.toLowerCase().includes('wav') ||
      (rawAudio.length >= 44 && rawAudio.toString('ascii', 0, 4) === 'RIFF')
    ) {
      const parsedTts = parseWavBuffer(rawAudio);
      return {
        pcmAudio: parsedTts.pcmMono16,
        sampleRate: parsedTts.sampleRate,
        transcription,
        answerText,
      };
    }

    return {
      pcmAudio: rawAudio,
      sampleRate: parseSampleRateFromMimeType(inlineAudio.mimeType, 24000),
      transcription,
      answerText,
    };
  }

  private async lookupRagWithTimeout(query: string): Promise<{
    found: boolean;
    context: string;
    chunksCount: number;
  }> {
    if (!query) {
      return { found: false, context: '', chunksCount: 0 };
    }
    return await Promise.race([
      this.localragService.searchKnowledgeBase(query),
      new Promise<{ found: boolean; context: string; chunksCount: number }>(
        (resolve) =>
          setTimeout(
            () => resolve({ found: false, context: '', chunksCount: 0 }),
            RAG_TOOL_TIMEOUT_MS,
          ),
      ),
    ]);
  }

  private sanitizeForDisplay(text: string): string {
    if (!text) return '';
    return text
      .replace(/\[\s*(?:FUENTE|DOCUMENTO|DOC|ORIGEN|REFERENCIA)[^\]]*\]/gi, '')
      .replace(/\(\s*(?:relevancia|score|puntuaci[oó]n)[^)]*\)/gi, '')
      .replace(/[*_`#>]+/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}

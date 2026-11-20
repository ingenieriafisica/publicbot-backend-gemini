import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { LlmModelInfo } from './dto/llm-model-info.dto';

export const CURATED_GEMINI_MODELS: LlmModelInfo[] = [
  {
    id: 'gemini-4-argon',
    name: 'models/gemini-4-argon',
    displayName: 'Gemini 4 Argon',
    description: 'Modelo de frontera de próxima generación con capacidades analíticas, arquitectónicas y de razonamiento avanzadas.',
    category: 'pro',
    inputTokenLimit: 2097152,
    outputTokenLimit: 8192,
    thinkingSupported: true,
    recommended: false,
  },
  {
    id: 'gemini-3.1-pro',
    name: 'models/gemini-3.1-pro',
    displayName: 'Gemini 3.1 Pro',
    description: 'Modelo insignia de razonamiento avanzado y resolución de problemas complejos con soporte de pensamiento profundo.',
    category: 'pro',
    inputTokenLimit: 1048576,
    outputTokenLimit: 8192,
    thinkingSupported: true,
    recommended: false,
  },
  {
    id: 'gemini-3.8-flash',
    name: 'models/gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    description: 'Equilibrio superior entre velocidad extrema, gran precisión contextual y respuesta en tiempo real para Publicbot.',
    category: 'flash',
    inputTokenLimit: 1048576,
    outputTokenLimit: 8192,
    thinkingSupported: true,
    recommended: true,
  },
  {
    id: 'gemini-3.6-flash',
    name: 'models/gemini-3.6-flash',
    displayName: 'Gemini 3.6 Flash',
    description: 'Versión optimizada para inferencia rápida, excelente comprensión semántica y alta disponibilidad en producción.',
    category: 'flash',
    inputTokenLimit: 1048576,
    outputTokenLimit: 8192,
    thinkingSupported: false,
    recommended: false,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'models/gemini-3.1-flash-lite',
    displayName: 'Gemini 3.1 Flash-Lite',
    description: 'Diseñado para mínima latencia, alto volumen de consultas y máximo rendimiento de procesamiento por token.',
    category: 'lite',
    inputTokenLimit: 1048576,
    outputTokenLimit: 8192,
    thinkingSupported: false,
    recommended: false,
  },
  {
    id: 'gemini-3.1-flash-live',
    name: 'models/gemini-3.1-flash-live',
    displayName: 'Gemini 3.1 Flash Live',
    description: 'Modo interactivo y conversacional en vivo de latencia ultra baja para flujos de diálogo instantáneo.',
    category: 'preview',
    inputTokenLimit: 1048576,
    outputTokenLimit: 8192,
    thinkingSupported: false,
    recommended: false,
  },
];

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);
  private client: GoogleGenAI;
  private apiKeyConfigured = false;

  onModuleInit() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      this.logger.warn(
        '⚠️ GEMINI_API_KEY no encontrada en variables de entorno. Configure GEMINI_API_KEY en su archivo .env para habilitar el servicio de IA.',
      );
      this.client = new GoogleGenAI({ apiKey: 'dummy-placeholder-key' });
      this.apiKeyConfigured = false;
      return;
    }

    this.client = new GoogleGenAI({ apiKey });
    this.apiKeyConfigured = true;
    this.logger.log('GeminiService inicializado con Google Gen AI SDK 🚀');
  }

  isConfigured(): boolean {
    return this.apiKeyConfigured;
  }

  getClient(): GoogleGenAI {
    if (!this.apiKeyConfigured) {
      throw new Error(
        'No se ha configurado la variable de entorno GEMINI_API_KEY en el servidor.',
      );
    }
    return this.client;
  }

  getCuratedModels(): LlmModelInfo[] {
    return CURATED_GEMINI_MODELS;
  }

  isValidModel(modelId: string): boolean {
    if (!modelId || typeof modelId !== 'string') return false;
    const cleanId = modelId.replace(/^models\//, '').trim().toLowerCase();
    if (cleanId === 'gemini-3.1-pro-preview') return true;
    return CURATED_GEMINI_MODELS.some(
      (m) => m.id.toLowerCase() === cleanId || m.name.toLowerCase() === `models/${cleanId}`,
    );
  }

  async generateText(
    modelId: string,
    systemInstruction: string,
    prompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    if (!this.apiKeyConfigured) {
      throw new Error(
        'No se ha configurado la variable de entorno GEMINI_API_KEY en el servidor.',
      );
    }

    const cleanModel = modelId.replace(/^models\//, '').trim();
    try {
      const response = await this.client.models.generateContent({
        model: cleanModel,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: options?.temperature ?? 0.2,
          maxOutputTokens: options?.maxTokens ?? 4096,
        },
      });

      return response.text || '';
    } catch (error: any) {
      this.logger.error(`Error en Gemini generateText (${cleanModel}): ${error.message}`);
      throw error;
    }
  }

  async *generateTextStream(
    modelId: string,
    systemInstruction: string,
    prompt: string,
    options?: { temperature?: number; maxTokens?: number },
  ): AsyncGenerator<string> {
    if (!this.apiKeyConfigured) {
      throw new Error(
        'No se ha configurado la variable de entorno GEMINI_API_KEY en el servidor.',
      );
    }

    const cleanModel = modelId.replace(/^models\//, '').trim();
    try {
      const stream = await this.client.models.generateContentStream({
        model: cleanModel,
        contents: prompt,
        config: {
          systemInstruction,
          temperature: options?.temperature ?? 0.2,
          maxOutputTokens: options?.maxTokens ?? 4096,
        },
      });

      for await (const chunk of stream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
    } catch (error: any) {
      this.logger.error(`Error en Gemini generateTextStream (${cleanModel}): ${error.message}`);
      throw error;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.apiKeyConfigured) return false;
    try {
      await this.client.models.list({ config: { pageSize: 1 } });
      return true;
    } catch (error: any) {
      this.logger.warn(`Health check ping a Gemini API devolvió error: ${error.message}`);
      return false;
    }
  }
}

import { Embeddings, EmbeddingsParams } from '@langchain/core/embeddings';
import { GoogleGenAI } from '@google/genai';
import { Logger } from '@nestjs/common';

export interface GeminiEmbeddingsParams extends EmbeddingsParams {
  apiKey?: string;
  model?: string;
  outputDimensionality?: number;
}

export class GeminiEmbeddings extends Embeddings {
  private readonly logger = new Logger(GeminiEmbeddings.name);
  private client: GoogleGenAI;
  public model: string;
  public outputDimensionality: number;

  constructor(fields?: GeminiEmbeddingsParams) {
    super(fields ?? {});
    const apiKey =
      fields?.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY no configurada. Las operaciones vectoriales fallarán hasta configurar la clave.');
    }

    this.client = new GoogleGenAI({ apiKey: apiKey || 'dummy-key-placeholder' });
    this.model =
      fields?.model ||
      process.env.GEMINI_EMBEDDING_MODEL ||
      'gemini-embedding-001';
    this.outputDimensionality =
      fields?.outputDimensionality ||
      parseInt(process.env.GEMINI_EMBEDDING_DIMENSIONS || process.env.VECTOR_DIMENSIONS || '768', 10);
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (!documents || documents.length === 0) {
      return [];
    }

    const results: number[][] = [];
    const batchSize = 25; // Lotes seguros para evitar exceder el límite de payload

    for (let i = 0; i < documents.length; i += batchSize) {
      const slice = documents.slice(i, i + batchSize);
      try {
        const response = await this.client.models.embedContent({
          model: this.model,
          contents: slice,
          config: {
            taskType: 'RETRIEVAL_DOCUMENT',
            outputDimensionality: this.outputDimensionality,
          },
        });

        if (response.embeddings && response.embeddings.length > 0) {
          for (const item of response.embeddings) {
            if (item.values) {
              results.push(item.values);
            }
          }
        }
      } catch (error: any) {
        this.logger.error(`Error en embedDocuments lote [${i}-${i + slice.length}]: ${error.message}`);
        throw error;
      }
    }

    return results;
  }

  async embedQuery(document: string): Promise<number[]> {
    if (!document || !document.trim()) {
      return new Array(this.outputDimensionality).fill(0);
    }

    try {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: [document],
        config: {
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: this.outputDimensionality,
        },
      });

      if (response.embeddings && response.embeddings.length > 0 && response.embeddings[0].values) {
        return response.embeddings[0].values;
      }

      throw new Error('La respuesta de Gemini no incluyó valores de vector embedding.');
    } catch (error: any) {
      this.logger.error(`Error en embedQuery: ${error.message}`);
      throw error;
    }
  }
}

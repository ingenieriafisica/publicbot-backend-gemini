import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { Model } from 'mongoose';
import { MongoClient } from 'mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Vectorlocal } from './entities/vectorlocal.schema';
import { GeminiService } from '../gemini/gemini.service';
import { GeminiEmbeddings } from '../gemini/gemini-embeddings';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class VectorstorelocalService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VectorstorelocalService.name);
  private mongoClient: MongoClient;
  private collection: any;
  private vectorStore: MongoDBAtlasVectorSearch;
  private initialized = false;

  private readonly config = {
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
    chunkSize: parseInt(process.env.CHUNK_SIZE || '2000'),
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '100'),
    vectorDimensions: parseInt(process.env.VECTOR_DIMENSIONS || '768'),
  };

  constructor(
    @Inject('LOCAL_RAG_VECTOR_MODEL') private vectorModel: Model<Vectorlocal>,
    private readonly geminiService: GeminiService,
    private readonly geminiEmbeddings: GeminiEmbeddings,
  ) {
    const required = [
      'MONGODB_ATLAS_URI',
      'MONGODB_ATLAS_DB_NAME',
      'MONGODB_ATLAS_LOCAL_COLLECTION_NAME',
    ];
    const missing = required.filter(v => !process.env[v]);
    if (missing.length) {
      throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
    }

    this.mongoClient = new MongoClient(process.env.MONGODB_ATLAS_URI!);

    this.logger.log('Inicializando VectorstorelocalService con Gemini...');
    this.logger.log('Configuración:', JSON.stringify(this.config));
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.connectMongo();
      await this.initVectorStore();
      this.initialized = true;
      this.logger.log('VectorstorelocalService con GeminiEmbeddings listo');
    } catch (error) {
      this.logger.error('Error durante la inicialización:', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.mongoClient.close();
    this.logger.log('VectorstorelocalService desconectado');
  }

  private async connectMongo(): Promise<void> {
    await this.mongoClient.connect();
    const db = this.mongoClient.db(process.env.MONGODB_ATLAS_DB_NAME);
    this.collection = db.collection(process.env.MONGODB_ATLAS_LOCAL_COLLECTION_NAME!);
    await db.command({ ping: 1 });
    this.logger.log('MongoDB conectado');
  }

  private async initVectorStore(): Promise<void> {
    this.vectorStore = new MongoDBAtlasVectorSearch(this.geminiEmbeddings, {
      collection: this.collection,
      indexName: 'vector_index',
      textKey: 'document',
      embeddingKey: 'embedding',
    });

    this.logger.log('VectorStore inicializado con GeminiEmbeddings');
  }

  private async embedDocuments(texts: string[]): Promise<number[][]> {
    try {
      const embeddings = await this.geminiEmbeddings.embedDocuments(texts);
      this.logger.debug(`Generados ${embeddings.length} embeddings con Gemini`);
      return embeddings;
    } catch (error: any) {
      this.logger.error(`Fallo al incrustar documentos con Gemini: ${error.message}`);
      throw error;
    }
  }

  private async embedQuery(text: string): Promise<number[]> {
    try {
      const embedding = await this.geminiEmbeddings.embedQuery(text);
      this.logger.debug(`Generado embedding Gemini con ${embedding.length} dimensiones`);
      return embedding;
    } catch (error: any) {
      this.logger.error(`Fallo al incrustar consulta con Gemini: ${error.message}`);
      throw error;
    }
  }

  async addDocument(documentData: any): Promise<Vectorlocal> {
    if (!this.initialized) {
      throw new Error('Servicio no inicializado');
    }

    const startTime = Date.now();
    try {
      const text = documentData.document || documentData.texto || '';
      if (!text.trim()) {
        throw new Error('El documento no contiene texto válido para incrustar');
      }

      const embedding = await this.embedQuery(text);

      const dataWithEmbedding = {
        ...documentData,
        embedding,
        createdAt: new Date(),
      };

      const result = await this.vectorModel.create(dataWithEmbedding);

      this.logger.log(
        `Documento añadido con embedding Gemini (${Date.now() - startTime}ms, ${embedding.length} dims)`
      );

      return result;
    } catch (error: any) {
      this.logger.error(`Error al añadir documento: ${error.message}`);
      throw error;
    }
  }

  async addDocuments(documentsData: any[]): Promise<Vectorlocal[]> {
    if (!this.initialized) {
      throw new Error('Servicio no inicializado');
    }

    const startTime = Date.now();
    try {
      const validDocs = documentsData.filter(d => (d.document || d.texto || '').trim());
      if (validDocs.length === 0) {
        throw new Error('No hay documentos válidos para incrustar');
      }

      const texts = validDocs.map(d => d.document || d.texto);
      const embeddings = await this.embedDocuments(texts);

      const docsWithEmbeddings = validDocs.map((doc, i) => ({
        ...doc,
        embedding: embeddings[i],
        createdAt: new Date(),
      }));

      const results = await this.vectorModel.insertMany(docsWithEmbeddings);

      this.logger.log(
        `Añadidos ${results.length} documentos con embeddings Gemini (${Date.now() - startTime}ms)`
      );

      return results as any;
    } catch (error: any) {
      this.logger.error(`Error al añadir lote de documentos: ${error.message}`);
      throw error;
    }
  }

  async indexDocument(
    content: string,
    metadata: Record<string, any> = {},
  ): Promise<{ success: boolean; chunks: number; id: string }> {
    if (!this.initialized) {
      throw new Error('Servicio no inicializado');
    }

    try {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
      });

      const chunks = await splitter.splitText(content);
      const docs = chunks.map(
        (chunk, index) =>
          new Document({
            pageContent: chunk,
            metadata: {
              ...metadata,
              chunkIndex: index,
              totalChunks: chunks.length,
              indexedAt: new Date().toISOString(),
            },
          }),
      );

      await this.vectorStore.addDocuments(docs);
      return {
        success: true,
        chunks: chunks.length,
        id: Date.now().toString(),
      };
    } catch (error: any) {
      this.logger.error(`Error indexando documento: ${error.message}`);
      throw error;
    }
  }

  async findRelevantDocuments(query: string, k = 5): Promise<Document[]> {
    if (!this.initialized) {
      throw new Error('Servicio no inicializado');
    }
    return await this.vectorStore.similaritySearch(query, k);
  }

  async findRelevantDocumentsWithScores(
    query: string,
    k = 5,
  ): Promise<{ document: Document; score: number }[]> {
    if (!this.initialized) {
      throw new Error('Servicio no inicializado');
    }
    const results = await this.vectorStore.similaritySearchWithScore(query, k);
    return results.map(([document, score]) => ({ document, score }));
  }

  async findAll(): Promise<Vectorlocal[]> {
    return await this.vectorModel.find().exec();
  }

  async findOne(id: string): Promise<Vectorlocal | null> {
    return await this.vectorModel.findById(id).exec();
  }

  async updateDocument(id: string, updateDto: any): Promise<Vectorlocal | null> {
    if (!this.initialized) {
      throw new Error('Servicio no inicializado');
    }

    const text = updateDto.document || updateDto.texto;
    if (text) {
      const embedding = await this.embedQuery(text);
      updateDto.embedding = embedding;
    }

    updateDto.updatedAt = new Date();
    return await this.vectorModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
  }

  async deleteDocument(id: string): Promise<Vectorlocal | null> {
    return await this.vectorModel.findByIdAndDelete(id).exec();
  }

  async deleteAll(): Promise<{ deletedCount: number }> {
    const result = await this.vectorModel.deleteMany({}).exec();
    return { deletedCount: result.deletedCount || 0 };
  }

  async healthCheck(): Promise<{
    status: string;
    services: Record<string, boolean>;
    config: VectorstorelocalService['config'];
    timestamp: string;
  }> {
    const services = {
      mongodb: false,
      gemini: false,
      vectorStore: !!this.vectorStore,
      initialized: this.initialized,
    };

    try {
      await this.mongoClient.db().command({ ping: 1 });
      services.mongodb = true;
    } catch { }

    try {
      services.gemini = await this.geminiService.ping();
    } catch { }

    const allHealthy = Object.values(services).every(Boolean);

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      services,
      config: this.config,
      timestamp: new Date().toISOString(),
    };
  }

  async createVectorIndex(): Promise<{ success: boolean; message: string }> {
    const indexDefinition = {
      name: 'vector_index',
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: this.config.vectorDimensions,
            similarity: 'cosine',
          },
        ],
      },
    };

    try {
      const result = await this.collection.createSearchIndex(indexDefinition);
      this.logger.log(`Índice vectorial creado: ${result}`);
      return { success: true, message: `Índice creado: ${result}` };
    } catch (error: any) {
      if (error.message.includes('already exists')) {
        this.logger.log('Índice vectorial ya existe');
        return { success: true, message: 'El índice ya existe' };
      }
      this.logger.error('Error creando índice vectorial:', error.message);
      throw new Error(`Error creando índice: ${error.message}`);
    }
  }

  async getStats(): Promise<{
    totalDocuments: number;
    collection: string;
    database: string;
    embeddingModel: string;
    vectorDimensions: number;
    timestamp: string;
  }> {
    try {
      const count = await this.vectorModel.countDocuments().exec();
      return {
        totalDocuments: count,
        collection: process.env.MONGODB_ATLAS_LOCAL_COLLECTION_NAME!,
        database: process.env.MONGODB_ATLAS_DB_NAME!,
        embeddingModel: this.config.embeddingModel,
        vectorDimensions: this.config.vectorDimensions,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      this.logger.error('Error obteniendo estadísticas:', error.message);
      throw error;
    }
  }

  async testEmbedding(text: string): Promise<{
    text: string;
    embeddingLength: number;
    firstFiveValues: number[];
    processingTimeMs: number;
  }> {
    const startTime = Date.now();
    const embedding = await this.embedQuery(text);

    return {
      text: text.slice(0, 100) + (text.length > 100 ? '...' : ''),
      embeddingLength: embedding.length,
      firstFiveValues: embedding.slice(0, 5),
      processingTimeMs: Date.now() - startTime,
    };
  }
}

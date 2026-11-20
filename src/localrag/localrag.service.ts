import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MongoClient } from 'mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { ChatPrompt } from './dto/chatprompt.interface';
import { ChatResponse, FuenteRag } from './dto/chatresponse.interface';
import { GeminiService } from '../gemini/gemini.service';
import { GeminiEmbeddings } from '../gemini/gemini-embeddings';
import { LlmSettingsService } from '../llm-settings/llm-settings.service';

import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class LocalragService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(LocalragService.name);
    private mongoClient: MongoClient;
    private collection: any;
    private vectorStore: MongoDBAtlasVectorSearch;
    private initialized = false;

    // ⚡ In-Memory RAG Context Cache para acelerar consultas repetidas/sugeridas (0ms latencia de búsqueda)
    private readonly contextCache = new Map<string, { sourcesReranked: FuenteRag[]; contextoRerank: string; cachedAt: number }>();
    private readonly CONTEXT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
    private readonly MAX_CACHE_SIZE = 500;

    private readonly config = {
        embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
        topK: parseInt(process.env.CHATBOTAI_TOP_K || '5', 10),
        topRerank: parseInt(process.env.CHATBOTAI_TOP_RERANK || '3', 10),
        temperatura: parseFloat(process.env.CHATBOTAI_TEMPERATURA || '0.2'),
        maxTokens: parseInt(process.env.CHATBOTAI_MAX_TOKENS || '4096', 10),
        chunkSize: parseInt(process.env.CHUNK_SIZE || '1000', 10),
        chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '150', 10),
        vectorDimensions: parseInt(process.env.VECTOR_DIMENSIONS || '768', 10),
    };

    private readonly systemPrompt = `Eres Publicbot, el asistente virtual del SENA. Tu objetivo es responder preguntas de manera clara, educada, precisa y profesional en español basándote en la información provista.

REGLAS ESTRICTAS DE RESPUESTA:
1. Responde de forma amplia al usuario usando un lenguaje claro y profesional.
2. Si la información provista no responde la pregunta: "No dispongo de información suficiente para responder a esa pregunta."
3. NUNCA menciones fuentes, documentos, archivos, orígenes de datos, números de fuente ni referencias.
4. NUNCA menciones puntuaciones de relevancia, scores ni porcentajes de coincidencia.
5. NO des pistas ni indicios sobre de dónde se tomó la información (no digas "según el texto", "de acuerdo con la información provista", "en el documento", "en la fuente", etc.). Responde con certeza como un profesional experto.
6. Responde siempre en español.`;

    constructor(
        private readonly geminiService: GeminiService,
        private readonly geminiEmbeddings: GeminiEmbeddings,
        private readonly llmSettingsService: LlmSettingsService,
    ) {
        // Validar variables de entorno requeridas para MongoDB
        const required = ['MONGODB_ATLAS_URI', 'MONGODB_ATLAS_DB_NAME', 'MONGODB_ATLAS_COLLECTION_NAME'];
        const missing = required.filter(v => !process.env[v]);
        if (missing.length) {
            throw new Error(`Faltan variables: ${missing.join(', ')}`);
        }

        this.mongoClient = new MongoClient(process.env.MONGODB_ATLAS_URI!);

        this.logger.log('Publicbot Service con Google Gemini inicializando...');
        this.logger.log(`Configuración: Embedding=${this.config.embeddingModel}, Dimensiones=${this.config.vectorDimensions}`);
    }

    async onModuleInit(): Promise<void> {
        try {
            await this.connectMongo();
            await this.initVectorStore();
            this.initialized = true;
            this.logger.log(`Publicbot RAG con Gemini API listo 🚀 (Modelo activo: ${this.llmSettingsService.getActiveModel()})`);
            // Pre-calentar sugerencias en segundo plano
            this.warmUpContextCache().catch(err => this.logger.debug(`Warmup diferido: ${err?.message}`));
        } catch (error) {
            this.logger.error('Error init:', error);
            throw error;
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.mongoClient.close();
        this.logger.log('Publicbot desconectado');
    }

    private async connectMongo(): Promise<void> {
        await this.mongoClient.connect();
        const db = this.mongoClient.db(process.env.MONGODB_ATLAS_DB_NAME);
        this.collection = db.collection(process.env.MONGODB_ATLAS_COLLECTION_NAME!);
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

    /**
     * RERANKER HÍBRIDO (Semántico + Léxico)
     * Reordena y filtra los fragmentos combinando similitud vectorial con
     * cobertura léxica de términos de la pregunta para maximizar precisión y relevancia.
     */
    private rerankSources(query: string, sources: FuenteRag[], topN = 3): FuenteRag[] {
        if (sources.length === 0) return [];

        const stopWords = new Set([
            'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'e', 'o', 'u', 'de', 'del',
            'a', 'en', 'para', 'por', 'con', 'sin', 'sobre', 'que', 'como', 'cual', 'quien', 'es',
            'son', 'fue', 'era', 'se', 'su', 'sus', 'al', 'por', 'los'
        ]);

        const queryTerms = query
            .toLowerCase()
            .replace(/[^\w\sáéíóúüñ]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2 && !stopWords.has(t));

        const scored = sources
            .filter(s => s.contenido && s.contenido.trim().length > 0)
            .map(s => {
                const textLower = s.contenido.toLowerCase();
                let termMatches = 0;
                for (const term of queryTerms) {
                    if (textLower.includes(term)) {
                        termMatches++;
                    }
                }
                const lexicalScore = queryTerms.length > 0 ? termMatches / queryTerms.length : 0.5;
                const vectorScore = s.puntuacion ?? 0.5;

                // 70% peso semántico vectorial + 30% coincidencia léxica
                const hybridScore = Number((0.7 * vectorScore + 0.3 * lexicalScore).toFixed(4));

                return {
                    ...s,
                    puntuacion: hybridScore,
                };
            });

        // Filtrar documentos irrelevantes con puntuación muy baja (< 0.25)
        const relevant = scored.filter(s => (s.puntuacion || 0) >= 0.25);
        const candidates = relevant.length > 0 ? relevant : scored;

        return candidates
            .sort((a, b) => (b.puntuacion || 0) - (a.puntuacion || 0))
            .slice(0, topN)
            .map((s, idx) => ({
                ...s,
                indiceRerank: idx + 1,
            }));
    }

    /**
     * Sanitiza la respuesta para asegurar que no contenga menciones de fuentes, documentos ni scores.
     */
    private cleanAnswer(text: string): string {
        if (!text) return '';
        return text
            .replace(/\[\s*(?:FUENTE|DOCUMENTO|DOC|ORIGEN|REFERENCIA)\s*#?\d*[^\]]*\]/gi, '')
            .replace(/\(\s*(?:FUENTE|DOCUMENTO|DOC|ORIGEN|REFERENCIA)\s*#?\d*[^)]*\)/gi, '')
            .replace(/\(\s*(?:relevancia|score|puntuaci[oó]n|coincidencia)\s*:\s*[^)]*\)/gi, '')
            .replace(/\[\s*(?:relevancia|score|puntuaci[oó]n|coincidencia)\s*:\s*[^\]]*\]/gi, '')
            .replace(/^(?:Fuente|Documento|Referencia)\s*#?\d*\s*:?\s*$/gim, '')
            .replace(/^(?:Seg[uú]n\s+(?:la\s+fuente|el\s+documento|los\s+documentos|la\s+informaci[oó]n\s+provista|el\s+texto\s+provisto|los\s+textos\s+provistos)[^,.:]*[,.:]?\s*)/gi, '')
            .replace(/^(?:De\s+acuerdo\s+con\s+(?:la\s+fuente|el\s+documento|los\s+documentos|la\s+informaci[oó]n\s+provista|el\s+texto\s+provisto)[^,.:]*[,.:]?\s*)/gi, '')
            .replace(/^(?:Basado\s+en\s+(?:la\s+fuente|el\s+documento|los\s+documentos|la\s+informaci[oó]n\s+provista)[^,.:]*[,.:]?\s*)/gi, '')
            .trim();
    }

    /**
     * ⚡ RECUPERACIÓN DE CONTEXTO CON CACHÉ EN MEMORIA
     * Acelera sustancialmente consultas frecuentes y preguntas sugeridas predeterminadas (0ms latencia de búsqueda).
     */
    private async getOrFetchContext(query: string): Promise<{ sourcesReranked: FuenteRag[]; contextoRerank: string } | null> {
        const cacheKey = query.trim().toLowerCase();
        const cached = this.contextCache.get(cacheKey);
        if (cached && (Date.now() - cached.cachedAt < this.CONTEXT_CACHE_TTL_MS)) {
            this.logger.debug(`[RAG Cache HIT] "${query}" - Contexto recuperado en 0ms`);
            return {
                sourcesReranked: cached.sourcesReranked,
                contextoRerank: cached.contextoRerank,
            };
        }

        // 1. Recuperar contexto con puntuación de similitud vectorial
        let sourcesRawWithScore: Array<[Document, number]> = [];
        try {
            sourcesRawWithScore = await this.vectorStore.similaritySearchWithScore(query, this.config.topK);
        } catch (searchError) {
            this.logger.warn('Error en similaritySearchWithScore, reintentando con similaritySearch:', searchError);
            const rawDocs = await this.vectorStore.similaritySearch(query, this.config.topK);
            sourcesRawWithScore = rawDocs.map((doc, idx) => [doc, 1 - idx * 0.1]);
        }

        const sources: FuenteRag[] = sourcesRawWithScore.map(([doc, score], i) => {
            const textContent = doc.pageContent?.trim() || doc.metadata?.document || doc.metadata?.text || doc.metadata?.contenido || '';
            return {
                contenido: textContent,
                metadatos: doc.metadata || {},
                puntuacion: typeof score === 'number' ? Math.max(0, Math.min(1, score)) : 0.9 - i * 0.1,
                indiceRerank: i,
            };
        });

        const validSources = sources.filter(s => s.contenido && s.contenido.length > 0);
        if (validSources.length === 0) {
            return null;
        }

        // 2. RERANK - Ránking híbrido semántico + léxico
        const sourcesReranked = this.rerankSources(query, validSources, this.config.topRerank);
        const contextoRerank = sourcesReranked
            .map(s => s.contenido.trim())
            .join('\n\n---\n\n');

        // Manejo de tamaño de caché (LRU simple)
        if (this.contextCache.size >= this.MAX_CACHE_SIZE) {
            const oldestKey = this.contextCache.keys().next().value;
            if (oldestKey) this.contextCache.delete(oldestKey);
        }

        this.contextCache.set(cacheKey, {
            sourcesReranked,
            contextoRerank,
            cachedAt: Date.now(),
        });

        return { sourcesReranked, contextoRerank };
    }

    /**
     * Pre-calienta sugerencias iniciales en segundo plano.
     */
    private async warmUpContextCache(): Promise<void> {
        try {
            const defaultPrompts = [
                '¿Qué es el SENA?',
                '¿Cómo me puedo certificar?',
                '¿Cuáles son los programas de formación?',
            ];
            for (const prompt of defaultPrompts) {
                await this.getOrFetchContext(prompt).catch(() => {});
            }
            this.logger.log('⚡ Sugerencias RAG pre-cacheadas en memoria');
        } catch (e: any) {
            this.logger.debug(`Warmup no ejecutado: ${e.message}`);
        }
    }

    /**
     * Recupera fragmentos de contexto relevantes de la base vectorial para asistentes de voz y herramientas.
     */
    async searchKnowledgeBase(
        query: string,
    ): Promise<{ found: boolean; context: string; chunksCount: number }> {
        if (!this.initialized || !query?.trim()) {
            return { found: false, context: '', chunksCount: 0 };
        }

        try {
            const contextData = await this.getOrFetchContext(query);
            if (!contextData || !contextData.contextoRerank) {
                return { found: false, context: '', chunksCount: 0 };
            }
            return {
                found: true,
                context: contextData.contextoRerank,
                chunksCount: contextData.sourcesReranked.length,
            };
        } catch (error: any) {
            this.logger.warn(`Error consultando base de conocimiento RAG: ${error?.message}`);
            return { found: false, context: '', chunksCount: 0 };
        }
    }

    /**
     * MÉTODO PRINCIPAL - RAG + Rerank + Google Gemini
     */
    async getChatCompletion(prompt: ChatPrompt): Promise<ChatResponse> {
        if (!this.initialized) throw new Error('Servicio no inicializado');
        if (!prompt.prompt?.trim()) throw new Error('Prompt requerido');

        const startTime = Date.now();
        const activeModel = this.llmSettingsService.getActiveModel();

        try {
            const contextData = await this.getOrFetchContext(prompt.prompt);
            if (!contextData) {
                return {
                    respuesta: 'No tengo información relevante suficiente para responder.',
                    fuentes: [],
                    pregunta: prompt.prompt,
                    modelo: activeModel,
                    tiempoProcesamiento: Date.now() - startTime,
                    topRerank: 0,
                };
            }

            const { sourcesReranked, contextoRerank } = contextData;

            const userContent = `INFORMACIÓN:\n${contextoRerank}\n\nPREGUNTA: ${prompt.prompt}\n\nRESPUESTA:`;

            const rawAnswer = await this.geminiService.generateText(
                activeModel,
                this.systemPrompt,
                userContent,
                {
                    temperature: this.config.temperatura,
                    maxTokens: this.config.maxTokens,
                },
            );

            const totalTime = Date.now() - startTime;
            this.logger.log(`Publicbot Gemini RAG (${activeModel}) completado en: ${totalTime}ms con ${sourcesReranked.length} documentos`);

            return {
                respuesta: this.cleanAnswer(rawAnswer),
                fuentes: [],
                pregunta: prompt.prompt,
                modelo: activeModel,
                tiempoProcesamiento: totalTime,
                topRerank: 0,
            };
        } catch (error: any) {
            this.logger.error(`Publicbot error con modelo ${activeModel}:`, error);
            throw new Error(`Publicbot falló: ${error.message}`);
        }
    }

    /**
     * STREAMING REAL-TIME - Emite en tiempo real mediante generador asíncrono
     */
    async *streamChatCompletion(prompt: ChatPrompt): AsyncGenerator<{ type: 'sources' | 'token' | 'done'; data: any }> {
        if (!this.initialized) throw new Error('Servicio no inicializado');
        if (!prompt.prompt?.trim()) throw new Error('Prompt requerido');

        const startTime = Date.now();
        const activeModel = this.llmSettingsService.getActiveModel();

        const contextData = await this.getOrFetchContext(prompt.prompt);
        if (!contextData) {
            yield { type: 'token', data: 'No tengo información relevante suficiente para responder.' };
            yield { type: 'done', data: { tiempoProcesamiento: Date.now() - startTime, modelo: activeModel } };
            return;
        }

        const { sourcesReranked, contextoRerank } = contextData;
        yield { type: 'sources', data: [] };

        const userContent = `INFORMACIÓN:\n${contextoRerank}\n\nPREGUNTA: ${prompt.prompt}\n\nRESPUESTA:`;

        const stream = this.geminiService.generateTextStream(
            activeModel,
            this.systemPrompt,
            userContent,
            {
                temperature: this.config.temperatura,
                maxTokens: this.config.maxTokens,
            },
        );

        for await (const chunk of stream) {
            yield { type: 'token', data: chunk };
        }

        yield {
            type: 'done',
            data: {
                tiempoProcesamiento: Date.now() - startTime,
                modelo: activeModel,
            },
        };
    }

    async indexDocument(contenido: string, metadatos: Record<string, any> = {}): Promise<any> {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: this.config.chunkSize,
            chunkOverlap: this.config.chunkOverlap,
        });

        const chunks = await splitter.splitText(contenido);
        const docs = chunks.map((chunk, i) => new Document({
            pageContent: chunk,
            metadata: { ...metadatos, chunkIndex: i, createdAt: new Date().toISOString() },
        }));

        await this.vectorStore.addDocuments(docs);
        return { exito: true, chunks: chunks.length, id: Date.now().toString() };
    }

    async healthCheck() {
        const services = {
            mongodb: false,
            gemini: false,
            vectorStore: !!this.vectorStore,
        };

        try { await this.mongoClient.db().command({ ping: 1 }); services.mongodb = true; } catch { }
        try { services.gemini = await this.geminiService.ping(); } catch { }

        return {
            estado: Object.values(services).every(Boolean) ? 'funciona' : 'no funciona',
            services,
            config: {
                ...this.config,
                activeModel: this.llmSettingsService.getActiveModel(),
            },
            timestamp: new Date().toISOString(),
        };
    }

    async createVectorIndex(): Promise<any> {
        const indexDefinition = {
            name: 'vector_index',
            type: 'vectorSearch',
            definition: {
                "fields": [
                    {
                        "type": "vector",
                        "path": "embedding",
                        "numDimensions": this.config.vectorDimensions,
                        "similarity": "cosine"
                    }
                ]
            }
        };

        try {
            const result = await this.collection.createSearchIndex(indexDefinition);
            this.logger.log(`Índice creado: ${result}`);
            return { exito: true, mensaje: `Índice creado: ${result}` };
        } catch (error: any) {
            this.logger.error('Error creando índice:', error);
            throw new Error(`Error creando índice: ${error.message}`);
        }
    }
}

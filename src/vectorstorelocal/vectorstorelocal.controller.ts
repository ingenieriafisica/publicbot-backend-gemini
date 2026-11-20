import { Controller, Post, Get, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, Logger, NotFoundException, BadRequestException, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { VectorstorelocalService } from './vectorstorelocal.service';
import { Vectorlocal } from './entities/vectorlocal.schema';
import { CreateVectorstorelocalDto } from './dto/create-vectorstorelocal.dto';
import { Document } from '@langchain/core/documents';


interface BulkAddDocumentsDto {
  documents: CreateVectorstorelocalDto[];
}

interface IndexDocumentDto {
  content: string;
  metadata?: Record<string, any>;
}

interface TestEmbeddingDto {
  text: string;
}

interface SearchResultDto {
  results: Array<{
    content: string;
    metadata: Record<string, any>;
  }>;
  query: string;
  count: number;
  processingTimeMs: number;
}

interface SearchWithScoresResultDto {
  results: Array<{
    content: string;
    metadata: Record<string, any>;
    score: number;
  }>;
  query: string;
  count: number;
  processingTimeMs: number;
}

@Controller('localvectors')
export class VectorstorelocalController {
  private readonly logger = new Logger(VectorstorelocalController.name);

  constructor(
    private readonly vectorstorelocalService: VectorstorelocalService
  ) { }


  @Post('add')
  @HttpCode(HttpStatus.CREATED)
  async addDocument(
    @Body() createDto: CreateVectorstorelocalDto
  ): Promise<Vectorlocal> {
    if (!createDto.document) {
      this.logger.error('El campo "document" es obligatorio');
      throw new BadRequestException('El campo "document" es obligatorio');
    }

    try {
      this.logger.log('Solicitud recibida para añadir documento');
      return await this.vectorstorelocalService.addDocument(createDto);
    } catch (error: any) {
      this.logger.error(`Error añadiendo documento: ${error.message}`);
      throw error;
    }
  }

  @Post('add-bulk')
  @HttpCode(HttpStatus.CREATED)
  async addDocuments(
    @Body() bulkDto: BulkAddDocumentsDto
  ): Promise<{ success: boolean; count: number; documents: Vectorlocal[] }> {
    if (!bulkDto.documents || !Array.isArray(bulkDto.documents)) {
      throw new BadRequestException('El campo "documents" debe ser un arreglo');
    }

    if (bulkDto.documents.length === 0) {
      throw new BadRequestException('Se requiere al menos un documento');
    }

    const invalidDocs = bulkDto.documents.filter((doc) => !doc.document);
    if (invalidDocs.length > 0) {
      throw new BadRequestException(
        `${invalidDocs.length} documentos no tienen el campo "document"`
      );
    }

    try {
      this.logger.log(
        `Solicitud recibida para añadir ${bulkDto.documents.length} documentos`
      );
      const results = await this.vectorstorelocalService.addDocuments(
        bulkDto.documents
      );
      return {
        success: true,
        count: results.length,
        documents: results,
      };
    } catch (error: any) {
      this.logger.error(`Error añadiendo documentos masivamente: ${error.message}`);
      throw error;
    }
  }


  @Post('index')
  @HttpCode(HttpStatus.CREATED)
  async indexDocument(
    @Body() indexDto: IndexDocumentDto
  ): Promise<{ success: boolean; chunks: number; id: string }> {
    if (!indexDto.content) {
      throw new BadRequestException('El campo "content" es obligatorio');
    }

    try {
      this.logger.log('Solicitud recibida para indexar documento con fragmentación');
      return await this.vectorstorelocalService.indexDocument(
        indexDto.content,
        indexDto.metadata || {}
      );
    } catch (error: any) {
      this.logger.error(`Error indexando documento: ${error.message}`);
      throw error;
    }
  }


  @Get('all')
  @HttpCode(HttpStatus.OK)
  async getAllDocuments(): Promise<Vectorlocal[]> {
    try {
      this.logger.log('Solicitud recibida para obtener todos los documentos');
      return await this.vectorstorelocalService.findAll();
    } catch (error: any) {
      this.logger.error(`Error obteniendo todos los documentos: ${error.message}`);
      throw error;
    }
  }


  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats(): Promise<{
    totalDocuments: number;
    collection: string;
    database: string;
    embeddingModel: string;
    vectorDimensions: number;
    timestamp: string;
  }> {
    try {
      this.logger.log('Solicitud recibida para estadísticas de la colección');
      return await this.vectorstorelocalService.getStats();
    } catch (error: any) {
      this.logger.error(`Error obteniendo estadísticas: ${error.message}`);
      throw error;
    }
  }


  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck(): Promise<{
    status: string;
    services: Record<string, boolean>;
    config: any;
    timestamp: string;
  }> {
    try {
      this.logger.log('Solicitud de verificación de salud recibida');
      return await this.vectorstorelocalService.healthCheck();
    } catch (error: any) {
      this.logger.error(`Error en la verificación de salud: ${error.message}`);
      throw error;
    }
  }


  @Get('search')
  @HttpCode(HttpStatus.OK)
  async searchRelevantDocuments(
    @Query('question') question: string,
    @Query('topK', new DefaultValuePipe(10), ParseIntPipe) topK: number
  ): Promise<SearchResultDto> {
    if (!question) {
      this.logger.warn('El parámetro de consulta "question" es obligatorio');
      throw new BadRequestException('El parámetro de consulta "question" es obligatorio');
    }

    try {
      const startTime = Date.now();
      this.logger.log(`Solicitud de búsqueda de similitud para: "${question}"`);

      const results =
        await this.vectorstorelocalService.findRelevantDocuments(
          question,
          topK
        );

      return {
        results: results.map((doc) => ({
          content: doc.pageContent,
          metadata: doc.metadata,
        })),
        query: question,
        count: results.length,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.error(`Error en la búsqueda de similitud: ${error.message}`);
      throw error;
    }
  }


  @Get('search-with-scores')
  @HttpCode(HttpStatus.OK)
  async searchRelevantDocumentsWithScores(
    @Query('question') question: string,
    @Query('topK', new DefaultValuePipe(10), ParseIntPipe) topK: number
  ): Promise<SearchWithScoresResultDto> {
    if (!question) {
      throw new BadRequestException('El parámetro de consulta "question" es obligatorio');
    }

    try {
      const startTime = Date.now();
      this.logger.log(`Búsqueda de similitud con puntuaciones para: "${question}"`);

      const results =
        await this.vectorstorelocalService.findRelevantDocumentsWithScores(
          question,
          topK
        );

      return {
        results: results.map(({ document, score }) => ({
          content: document.pageContent,
          metadata: document.metadata,
          score,
        })),
        query: question,
        count: results.length,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error: any) {
      this.logger.error(
        `Error en la búsqueda de similitud con puntuaciones: ${error.message}`
      );
      throw error;
    }
  }


  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getDocumentById(@Param('id') id: string): Promise<Vectorlocal> {
    try {
      this.logger.log(`Solicitud recibida para obtener documento con ID: ${id}`);
      const document = await this.vectorstorelocalService.findOne(id);
      if (!document) {
        throw new NotFoundException('Documento no encontrado');
      }
      return document;
    } catch (error: any) {
      this.logger.error(`Error obteniendo documento ${id}: ${error.message}`);
      throw error;
    }
  }


  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async updateDocument(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateVectorstorelocalDto>
  ): Promise<Vectorlocal> {
    try {
      this.logger.log(`Solicitud recibida para actualizar documento con ID: ${id}`);
      const updatedDocument =
        await this.vectorstorelocalService.updateDocument(id, updateDto);
      if (!updatedDocument) {
        throw new NotFoundException('Documento no encontrado');
      }
      return updatedDocument;
    } catch (error: any) {
      this.logger.error(`Error actualizando documento ${id}: ${error.message}`);
      throw error;
    }
  }


  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(@Param('id') id: string): Promise<void> {
    try {
      this.logger.log(`Solicitud recibida para eliminar documento con ID: ${id}`);
      const deletedDocument =
        await this.vectorstorelocalService.deleteDocument(id);
      if (!deletedDocument) {
        throw new NotFoundException('Documento no encontrado');
      }
    } catch (error: any) {
      this.logger.error(`Error eliminando documento ${id}: ${error.message}`);
      throw error;
    }
  }


  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteAllDocuments(): Promise<{ deletedCount: number }> {
    try {
      this.logger.log('Solicitud recibida para eliminar todos los documentos');
      return await this.vectorstorelocalService.deleteAll();
    } catch (error: any) {
      this.logger.error(`Error eliminando todos los documentos: ${error.message}`);
      throw error;
    }
  }



  @Post('test-embedding')
  @HttpCode(HttpStatus.OK)
  async testEmbedding(@Body() testDto: TestEmbeddingDto): Promise<{
    text: string;
    embeddingLength: number;
    firstFiveValues: number[];
    processingTimeMs: number;
  }> {
    if (!testDto.text) {
      throw new BadRequestException('El campo "text" es obligatorio');
    }

    try {
      this.logger.log('Solicitud recibida para probar la generación de *embedding*');
      return await this.vectorstorelocalService.testEmbedding(testDto.text);
    } catch (error: any) {
      this.logger.error(`Error probando *embedding*: ${error.message}`);
      throw error;
    }
  }


  @Post('create-index')
  @HttpCode(HttpStatus.CREATED)
  async createVectorIndex(): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log('Solicitud recibida para crear el índice vectorial');
      return await this.vectorstorelocalService.createVectorIndex();
    } catch (error: any) {
      this.logger.error(`Error creando índice vectorial: ${error.message}`);
      throw error;
    }
  }
}
import { Controller, Post, Body, Get, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
import { LocalragService } from './localrag.service';
import { AskDto } from './dto/ask.dto';
import { IndexTextDto } from './dto/index-text.dto';
import { ChatResponse } from './dto/chatresponse.interface';
import { JwtGuard } from '../auth/jwt.guard';
import { LlmSettingsService } from '../llm-settings/llm-settings.service';

@Controller('rag')
export class LocalragController {
    constructor(
        private readonly localragService: LocalragService,
        private readonly llmSettingsService: LlmSettingsService,
    ) { }

    @Post('ask')
    async getChatCompletion(@Body() body: AskDto): Promise<ChatResponse> {
        return await this.localragService.getChatCompletion(body);
    }

    @Post('ask-stream')
    async streamChatCompletion(@Body() body: AskDto, @Res() res: Response): Promise<void> {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        res.write(': stream-connected\n\n');

        let clientDisconnected = false;
        res.on('close', () => {
            clientDisconnected = true;
        });

        try {
            for await (const chunk of this.localragService.streamChatCompletion(body)) {
                if (clientDisconnected) {
                    break;
                }
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
            if (!clientDisconnected) {
                res.end();
            }
        } catch (error: any) {
            if (!clientDisconnected) {
                res.write(`data: ${JSON.stringify({ type: 'error', data: error.message || 'Error en RAG' })}\n\n`);
                res.end();
            }
        }
    }

    @UseGuards(JwtGuard)
    @Post('create-index')
    async createIndex() {
        return await this.localragService.createVectorIndex();
    }
    
    @UseGuards(JwtGuard)
    @Post('add-text')
    async indexDocument(@Body() body: IndexTextDto) {
        const resultado = await this.localragService.indexDocument(body.contenido, body.metadatos || {});
        return {
            exito: true,
            ...resultado,
            mensaje: `Indexado ${resultado.chunks} fragmentos`,
        };
    }

    @Get('health')
    async healthCheck() {
        return await this.localragService.healthCheck();
    }

    @Get('info')
    getInfo() {
        return {
            nombre: 'Publicbot RAG',
            version: '2.2.0',
            motor: 'Google Gemini API + RAG + MongoDB Atlas',
            embeddings: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
            llm: this.llmSettingsService.getActiveModel(),
            features: ['Rerank hibrido', 'Vector Search', 'Google Gemini AI Studio', 'Seleccion dinamica de modelo'],
        };
    }
}

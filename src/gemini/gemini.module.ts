import { Module, Global } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { GeminiEmbeddings } from './gemini-embeddings';

@Global()
@Module({
  providers: [
    GeminiService,
    {
      provide: GeminiEmbeddings,
      useFactory: () => new GeminiEmbeddings(),
    },
  ],
  exports: [GeminiService, GeminiEmbeddings],
})
export class GeminiModule {}

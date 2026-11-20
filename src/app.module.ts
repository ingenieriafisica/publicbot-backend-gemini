import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ReviewsModule } from './reviews/reviews.module';
import { DatabaseModule } from './database/database.module';
import { PromptsModule } from './prompts/prompts.module';
import { AnswersModule } from './answers/answers.module';
import { UsersModule } from './users/users.module';
import { PrometheusModule } from "@willsoto/nestjs-prometheus";
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './auth/loggin.interceptor';
import { MetricsMiddleware } from './metrics/metrics.middleware';
import { AuthModule } from './auth/auth.module';
import { HttpModule } from '@nestjs/axios';
import { MulterModule } from '@nestjs/platform-express';
import { GeminiModule } from './gemini/gemini.module';
import { LlmSettingsModule } from './llm-settings/llm-settings.module';
import { VectorstorelocalModule } from './vectorstorelocal/vectorstorelocal.module';
import { LocalragModule } from './localrag/localrag.module';
import { VoiceModule } from './voice/voice.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 120,
    }]),
    PrometheusModule.register(),
    ReviewsModule,
    MulterModule,
    DatabaseModule,
    PromptsModule,
    AnswersModule,
    UsersModule,
    AuthModule,
    HttpModule,
    GeminiModule,
    LlmSettingsModule,
    VectorstorelocalModule,
    LocalragModule,
    VoiceModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}

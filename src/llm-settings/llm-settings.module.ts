import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { LlmSettingsController } from './llm-settings.controller';
import { LlmSettingsService } from './llm-settings.service';
import { llmSettingsProviders } from './llm-settings.providers';

@Module({
  imports: [DatabaseModule],
  controllers: [LlmSettingsController],
  providers: [LlmSettingsService, ...llmSettingsProviders],
  exports: [LlmSettingsService, ...llmSettingsProviders],
})
export class LlmSettingsModule {}

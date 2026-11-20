import { Module } from '@nestjs/common';
import { LocalragService } from './localrag.service';
import { LocalragController } from './localrag.controller';
import { DatabaseModule } from '../database/database.module';
import { localragvectorsProviders } from './localrag.providers';
import { MongooseModule } from '@nestjs/mongoose';
import { LlmSettingsModule } from '../llm-settings/llm-settings.module';

@Module({
  imports: [DatabaseModule, MongooseModule, LlmSettingsModule],
  controllers: [LocalragController],
  providers: [LocalragService, ...localragvectorsProviders],
  exports: [LocalragService, ...localragvectorsProviders],
})
export class LocalragModule {}

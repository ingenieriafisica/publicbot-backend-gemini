import { Module } from '@nestjs/common';
import { LocalragModule } from '../localrag/localrag.module';
import { DeviceKeyGuard } from './guards/device-key.guard';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [LocalragModule],
  controllers: [VoiceController],
  providers: [VoiceService, DeviceKeyGuard],
  exports: [VoiceService],
})
export class VoiceModule {}

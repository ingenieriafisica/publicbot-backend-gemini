import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import { AppSetting } from './entities/app-setting.schema';
import { GeminiService } from '../gemini/gemini.service';
import { LlmModelInfo } from '../gemini/dto/llm-model-info.dto';

const ACTIVE_MODEL_KEY = 'llm.activeModel';

@Injectable()
export class LlmSettingsService implements OnModuleInit {
  private readonly logger = new Logger(LlmSettingsService.name);
  private activeModel: string = process.env.GEMINI_DEFAULT_LLM_MODEL || 'gemini-3.8-flash';

  constructor(
    @Inject('APP_SETTINGS_MODEL') private settingModel: Model<AppSetting>,
    private readonly geminiService: GeminiService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const setting = await this.settingModel.findOne({ key: ACTIVE_MODEL_KEY }).exec();
      if (setting && setting.value) {
        this.activeModel = setting.value;
        this.logger.log(`Modelo LLM activo cargado desde base de datos: ${this.activeModel}`);
      } else {
        const defaultModel = process.env.GEMINI_DEFAULT_LLM_MODEL || 'gemini-3.8-flash';
        this.activeModel = defaultModel;
        this.logger.log(`Modelo LLM activo predeterminado: ${this.activeModel}`);
      }
    } catch (error: any) {
      this.logger.warn(
        `No se pudo leer la configuración inicial de MongoDB (${error.message}). Usando modelo predeterminado: ${this.activeModel}`,
      );
    }
  }

  getActiveModel(): string {
    return this.activeModel;
  }

  async getSettings(): Promise<{
    activeModel: string;
    embeddingModel: string;
    models: LlmModelInfo[];
    updatedBy?: string;
    updatedAt?: Date;
  }> {
    let updatedBy: string | undefined;
    let updatedAt: Date | undefined;

    try {
      const setting = await this.settingModel.findOne({ key: ACTIVE_MODEL_KEY }).exec();
      if (setting) {
        this.activeModel = setting.value;
        updatedBy = setting.updatedBy;
        updatedAt = (setting as any).updatedAt;
      }
    } catch (e: any) {
      this.logger.debug(`Error consultando app_setting: ${e.message}`);
    }

    return {
      activeModel: this.activeModel,
      embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
      models: this.geminiService.getCuratedModels(),
      updatedBy,
      updatedAt,
    };
  }

  async setActiveModel(
    modelId: string,
    updatedBy: string = 'Administrador',
  ): Promise<{ activeModel: string; updatedBy: string; updatedAt: Date }> {
    const cleanId = modelId.replace(/^models\//, '').trim();

    if (!this.geminiService.isValidModel(cleanId)) {
      throw new BadRequestException(
        `El modelo '${modelId}' no es válido. Debe seleccionar un modelo de la lista curada disponible.`,
      );
    }

    const updated = await this.settingModel
      .findOneAndUpdate(
        { key: ACTIVE_MODEL_KEY },
        { value: cleanId, updatedBy },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    this.activeModel = cleanId;
    this.logger.log(
      `[ADMIN ACTION] Modelo LLM activo cambiado globalmente a '${cleanId}' por '${updatedBy}'`,
    );

    return {
      activeModel: this.activeModel,
      updatedBy,
      updatedAt: (updated as any).updatedAt || new Date(),
    };
  }
}


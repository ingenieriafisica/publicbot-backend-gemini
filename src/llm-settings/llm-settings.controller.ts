import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LlmSettingsService } from './llm-settings.service';
import { SetActiveModelDto } from './dto/set-active-model.dto';

@ApiTags('LLM Models')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@Roles('Administrador')
@Controller('llm')
export class LlmSettingsController {
  constructor(private readonly llmSettingsService: LlmSettingsService) {}

  @Get('models')
  @ApiOperation({
    summary: 'Listar modelos LLM curados disponibles y el modelo actualmente activo (solo Administrador)',
  })
  @ApiResponse({ status: 200, description: 'Lista de modelos y configuración activa' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Prohibido: se requiere rol de Administrador' })
  async getModels() {
    return await this.llmSettingsService.getSettings();
  }

  @Get('active')
  @ApiOperation({
    summary: 'Obtener el modelo LLM actualmente activo globalmente (solo Administrador)',
  })
  @ApiResponse({ status: 200, description: 'Modelo activo' })
  async getActive() {
    const settings = await this.llmSettingsService.getSettings();
    return {
      activeModel: settings.activeModel,
      embeddingModel: settings.embeddingModel,
      updatedBy: settings.updatedBy,
      updatedAt: settings.updatedAt,
    };
  }

  @Patch('active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambiar el modelo LLM activo globalmente para todos los usuarios (solo Administrador)',
  })
  @ApiResponse({ status: 200, description: 'Modelo activo actualizado con éxito' })
  @ApiResponse({ status: 400, description: 'Modelo no válido' })
  @ApiResponse({ status: 401, description: 'No autorizado' })
  @ApiResponse({ status: 403, description: 'Prohibido: se requiere rol de Administrador' })
  async setActiveModel(
    @Body() body: SetActiveModelDto,
    @Req() req: any,
  ) {
    const adminIdentifier =
      req.user?.email || req.user?.name || req.user?.id || 'Administrador';
    return await this.llmSettingsService.setActiveModel(body.model, adminIdentifier);
  }
}

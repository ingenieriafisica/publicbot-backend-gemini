import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  NotFoundException,
  Query,
  UseGuards,
  ConflictException,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.schema';
import { JwtGuard } from 'src/auth/jwt.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtGuard)
  @Post()
  @ApiOperation({ summary: 'Registrar un nuevo usuario dentro del área protegida' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 401, description: 'No autorizado.' })
  @ApiResponse({ status: 409, description: 'El correo o número de identificación ya está registrado.' })
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    this.logger.log(
      `POST /users - Registrando usuario: ${createUserDto.correo_sena}`,
    );
    try {
      return await this.usersService.createUser(createUserDto);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @UseGuards(JwtGuard)
  @Get()
  @ApiOperation({ summary: 'Listar usuarios o buscar por correo/usuario asignado' })
  async findAll(
    @Query('correo_sena') correo_sena?: string,
    @Query('usuario_asignado') usuario_asignado?: string,
  ): Promise<User[] | User> {
    if (correo_sena) {
      try {
        return await this.usersService.findByEmail(correo_sena);
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw new NotFoundException(
            `El usuario con el correo: ${correo_sena} no fue encontrado.`,
          );
        }
        throw error;
      }
    } else if (usuario_asignado) {
      try {
        return await this.usersService.findByUsuarioAsignado(usuario_asignado);
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw new NotFoundException(
            `El usuario con nombre: ${usuario_asignado} no fue encontrado.`,
          );
        }
        throw error;
      }
    } else {
      return this.usersService.findAll();
    }
  }

  @UseGuards(JwtGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un usuario por ID' })
  async findJustOne(@Param('id') _id: string): Promise<User> {
    try {
      return await this.usersService.findOne(_id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`El usuario con ID ${_id} no fue encontrado.`);
      }
      throw error;
    }
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles('Administrador')
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un usuario existente (solo administradores)' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  @ApiResponse({ status: 401, description: 'No autorizado.' })
  @ApiResponse({ status: 403, description: 'Prohibido: se requiere rol de administrador.' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado.' })
  @ApiResponse({ status: 409, description: 'Conflicto con correo o número de identificación ya registrado.' })
  async update(
    @Param('id') _id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    try {
      return await this.usersService.update(_id, updateUserDto);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`El usuario con ID ${_id} no fue encontrado.`);
      }
      if (error instanceof ConflictException) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  @UseGuards(JwtGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un usuario' })
  async remove(@Param('id') _id: string): Promise<void> {
    try {
      await this.usersService.remove(_id);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException(`El usuario con ID ${_id} no fue encontrado.`);
      }
      throw error;
    }
  }
}
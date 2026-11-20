import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Model, isValidObjectId } from 'mongoose';
import { User, UserDocument } from './entities/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@Inject('USERS_MODEL') private userModel: Model<UserDocument>) {}

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const correo_sena = createUserDto.correo_sena.toLowerCase().trim();
    const identificacion =
      createUserDto.identificacion ?? createUserDto.tenantId;

    if (!identificacion) {
      throw new BadRequestException('El número de identificación es requerido.');
    }

    const existingUser = await this.userModel
      .findOne({
        $or: [{ correo_sena }, { identificacion }],
      })
      .exec();

    if (existingUser) {
      if (existingUser.correo_sena === correo_sena) {
        throw new ConflictException('El correo electrónico ya está registrado.');
      }
      throw new ConflictException(
        'El número de identificación ya está registrado.',
      );
    }

    const nombre =
      createUserDto.nombre?.trim() ||
      [createUserDto.primer_nombre, createUserDto.segundo_nombre]
        .filter(Boolean)
        .join(' ')
        .trim();

    const apellido =
      createUserDto.apellido?.trim() ||
      [createUserDto.primer_apellido, createUserDto.segundo_apellido]
        .filter(Boolean)
        .join(' ')
        .trim();

    if (!nombre) {
      throw new BadRequestException('El nombre es requerido.');
    }
    if (!apellido) {
      throw new BadRequestException('El apellido es requerido.');
    }

    const usuario_asignado =
      createUserDto.usuario_asignado?.trim() ||
      correo_sena.split('@')[0];

    const userData: any = {
      ...createUserDto,
      identificacion,
      nombre,
      apellido,
      correo_sena,
      usuario_asignado,
      estado_actual:
        createUserDto.estado_actual !== undefined
          ? createUserDto.estado_actual
          : true,
    };

    if (createUserDto.password) {
      userData.password = await bcrypt.hash(createUserDto.password, 10);
    } else {
      delete userData.password;
    }

    const createdUser = new this.userModel(userData);
    const savedUser = await createdUser.save();
    const userObj = savedUser.toObject();
    delete (userObj as any).password;
    delete (userObj as any).otpCode;
    delete (userObj as any).otpExpiresAt;
    this.logger.log(`Usuario creado exitosamente con ID: ${savedUser._id}`);
    return userObj as User;
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password -otpCode -otpExpiresAt').exec();
  }

  async findOne(_id: string): Promise<User> {
    const user = await this.userModel
      .findById(_id)
      .select('-password -otpCode -otpExpiresAt')
      .exec();
    if (!user) {
      throw new NotFoundException(`No se encontró el usuario con id: ${_id}`);
    }
    return user;
  }

  async findByEmail(correo_sena: string, includePassword = false): Promise<User> {
    const query = this.userModel.findOne({ correo_sena: correo_sena.toLowerCase().trim() });
    if (includePassword) {
      query.select('+password');
    } else {
      query.select('-password -otpCode -otpExpiresAt');
    }
    const user = await query.exec();
    if (!user) {
      throw new NotFoundException(`No se encontró el usuario con email: ${correo_sena}`);
    }
    return user;
  }

  async findByUsuarioAsignado(usuario_asignado: string): Promise<User> {
    const user = await this.userModel
      .findOne({ usuario_asignado })
      .select('-password -otpCode -otpExpiresAt')
      .exec();
    if (!user) {
      throw new NotFoundException(
        `No se encontró el usuario con nombre de usuario: ${usuario_asignado}`,
      );
    }
    return user;
  }

  async findByEmailOrPhone(identifier: string): Promise<UserDocument | null> {
    const cleanId = identifier.trim().toLowerCase();
    const numId = Number(cleanId);
    const conditions: any[] = [
      { correo_sena: cleanId },
      { correo_particular: cleanId },
      { numero_celular: identifier.trim() },
      { usuario_asignado: cleanId },
    ];
    if (!isNaN(numId) && numId > 0) {
      conditions.push({ identificacion: numId });
    }

    const user = await this.userModel
      .findOne({ $or: conditions })
      .select('+otpCode +otpExpiresAt +password')
      .exec();

    return user;
  }

  async updateOtp(
    userId: string,
    otpCode: string,
    expiresAt: Date,
  ): Promise<void> {
    this.logger.log(`Actualizando OTP para el usuario ID: ${userId}`);
    await this.userModel
      .findByIdAndUpdate(userId, {
        otpCode,
        otpExpiresAt: expiresAt,
      })
      .exec();
  }

  async verifyAndClearOtp(
    userId: string,
    providedOtp: string,
  ): Promise<UserDocument> {
    this.logger.log(`Verificando OTP para usuario ID: ${userId}`);
    const user = await this.userModel
      .findById(userId)
      .select('+otpCode +otpExpiresAt')
      .exec();

    if (
      !user ||
      user.otpCode !== providedOtp ||
      !user.otpExpiresAt ||
      user.otpExpiresAt.getTime() < Date.now()
    ) {
      this.logger.warn(`OTP inválido o expirado para usuario ID: ${userId}`);
      throw new NotFoundException('Código OTP inválido o expirado.');
    }

    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    await user.save();
    this.logger.log(`OTP verificado y limpiado exitosamente para usuario: ${userId}`);
    return user;
  }

  async update(_id: string, updateUserDto: UpdateUserDto): Promise<User> {
    if (!isValidObjectId(_id)) {
      throw new NotFoundException(`El formato del ID ${_id} no es válido.`);
    }

    const updateData: any = { ...updateUserDto };

    // Sanitización: Evitar sobreescritura arbitraria de banderas internas o temporales de seguridad
    delete updateData.otpCode;
    delete updateData.otpExpiresAt;
    delete updateData._id;

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      delete updateData.password;
    }

    if (updateData.correo_sena) {
      updateData.correo_sena = updateData.correo_sena.toLowerCase().trim();
      const existingUser = await this.userModel
        .findOne({
          correo_sena: updateData.correo_sena,
          _id: { $ne: _id },
        })
        .exec();

      if (existingUser) {
        throw new ConflictException('El correo electrónico ya está registrado.');
      }
    }

    if (updateData.identificacion) {
      const existingId = await this.userModel
        .findOne({
          identificacion: updateData.identificacion,
          _id: { $ne: _id },
        })
        .exec();

      if (existingId) {
        throw new ConflictException('El número de identificación ya está registrado.');
      }
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(_id, { $set: updateData }, { new: true, runValidators: true })
      .select('-password -otpCode -otpExpiresAt')
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`No se encontró el usuario con id: ${_id}`);
    }
    return updatedUser;
  }

  async remove(_id: string): Promise<User> {
    const deletedUser = await this.userModel
      .findByIdAndDelete(_id)
      .select('-password -otpCode -otpExpiresAt')
      .exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID ${_id} not found`);
    }
    return deletedUser;
  }

  async validateUser(correo_sena: string, password: string): Promise<User | null> {
    const user = await this.userModel
      .findOne({ correo_sena: correo_sena.toLowerCase().trim() })
      .select('+password')
      .exec();
    if (user && user.password && (await bcrypt.compare(password, user.password))) {
      return user;
    }
    return null;
  }
}
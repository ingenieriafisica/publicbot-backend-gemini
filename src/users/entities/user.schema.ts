import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, unique: true, index: true })
  identificacion!: number;

  @Prop({ required: true })
  nombre!: string;

  @Prop({ required: true })
  apellido!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@sena\.edu\.co$/, 'escriba email sena'],
  })
  correo_sena!: string;

  @Prop({ required: true })
  numero_celular!: string;

  @Prop({ default: true })
  estado_actual?: boolean;

  @Prop({ required: true })
  rol_asignado!: string;

  @Prop({ required: false, select: false })
  password?: string;

  @Prop({ select: false })
  otpCode?: string;

  @Prop({ select: false })
  otpExpiresAt?: Date;

  // Extended profile fields compatible with certibot architecture
  @Prop({ required: false })
  tipo_de_identificacion?: string;

  @Prop({ required: false })
  primer_nombre?: string;

  @Prop({ required: false })
  segundo_nombre?: string;

  @Prop({ required: false })
  primer_apellido?: string;

  @Prop({ required: false })
  segundo_apellido?: string;

  @Prop({ required: false })
  fecha_nacimiento?: Date;

  @Prop({ required: false })
  pais_residencia?: string;

  @Prop({ required: false })
  dpto_residencia?: string;

  @Prop({ required: false })
  mncpio_residencia?: string;

  @Prop({ required: false })
  direccion_residencia?: string;

  @Prop({ required: false, lowercase: true, trim: true })
  correo_particular?: string;

  @Prop({ required: false })
  telefono_entidad?: string;

  @Prop({ required: false })
  extension_telefonica?: string;

  @Prop({ required: false })
  fecha_inicio_contrato?: Date;

  @Prop({ required: false })
  fecha_fin_contrato?: Date;

  @Prop({ required: false, sparse: true })
  numero_contrato?: string;

  @Prop({ required: false, lowercase: true, trim: true })
  usuario_asignado?: string;

  @Prop({ type: Boolean, default: false })
  signed?: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'app_settings' })
export class AppSetting extends Document {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ required: true })
  value: string;

  @Prop()
  updatedBy?: string;
}

export const AppSettingSchema = SchemaFactory.createForClass(AppSetting);

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VectorDocument = HydratedDocument<Vector>;

@Schema({ timestamps: true, versionKey: false })
export class Vector {

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  category: string;

  @Prop({ required: true })
  embedding: number[];

  @Prop({ required: true })
  document: string;

}

export const VectorSchema = SchemaFactory.createForClass(Vector);
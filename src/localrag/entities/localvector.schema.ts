import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'nomicvectors', timestamps: true, versionKey: false })
export class Localvector extends Document {
  @Prop({ required: true })
  document: string;

  @Prop({ type: [Number], required: true })
  embedding: number[];

  @Prop()
  chunkId?: string;

  @Prop()
  slug?: string;

  @Prop()
  source?: string;

  @Prop()
  title?: string;

  @Prop()
  indexedAt?: string;
}

export const LocalvectorSchema = SchemaFactory.createForClass(Localvector);

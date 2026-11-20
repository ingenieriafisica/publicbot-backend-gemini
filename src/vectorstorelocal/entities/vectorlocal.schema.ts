import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'nomicvectors', timestamps: true, versionKey: false })
export class Vectorlocal extends Document {
  @Prop({ required: true })
  document: string;

  @Prop({ type: [Number] })
  embedding: number[];

  @Prop()
  chunkId: string;

  @Prop()
  slug: string;

  @Prop()
  source: string;

  @Prop()
  title: string;

  @Prop()
  indexedAt: string;
}

export const vectorlocalSchema = SchemaFactory.createForClass(Vectorlocal); 
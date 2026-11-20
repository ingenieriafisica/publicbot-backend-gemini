import { Module } from '@nestjs/common';
import { VectorstorelocalController } from './vectorstorelocal.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from 'src/database/database.module';
import { VectorstorelocalService } from './vectorstorelocal.service';
import { localragvectorsProviders } from './vectorstorelocal.providers';

@Module({
  imports: [DatabaseModule, MongooseModule],
  controllers: [VectorstorelocalController],
  providers: [VectorstorelocalService , ...localragvectorsProviders],
})
export class VectorstorelocalModule {}

import { Connection } from 'mongoose';
import { vectorlocalSchema } from './entities/vectorlocal.schema';

export const localragvectorsProviders = [
  {
    provide: 'LOCAL_RAG_VECTOR_MODEL',
    useFactory: (connection: Connection) => {
      const collectionName =
        process.env.MONGODB_ATLAS_LOCAL_COLLECTION_NAME ||
        process.env.MONGODB_ATLAS_COLLECTION_NAME ||
        'geminivectors';
      return (
        connection.models[collectionName] ||
        connection.model(collectionName, vectorlocalSchema, collectionName)
      );
    },
    inject: ['DATABASE_CONNECTION'],
  },
];

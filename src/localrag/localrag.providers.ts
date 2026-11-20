import { Connection } from 'mongoose';
import { LocalvectorSchema } from './entities/localvector.schema';

export const localragvectorsProviders = [
  {
    provide: 'LOCAL_RAG_VECTOR_MODEL',
    useFactory: (connection: Connection) => {
      const collectionName =
        process.env.MONGODB_ATLAS_COLLECTION_NAME || 'geminivectors';
      return (
        connection.models[collectionName] ||
        connection.model(collectionName, LocalvectorSchema, collectionName)
      );
    },
    inject: ['DATABASE_CONNECTION'],
  },
];

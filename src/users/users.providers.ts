import { Connection } from 'mongoose';
import { UserSchema } from './entities/user.schema';

export const usersProviders = [
  {
    provide: 'USERS_MODEL',
    useFactory: (connection: Connection) =>
      connection.models['User'] || connection.model('User', UserSchema, 'users'),
    inject: ['DATABASE_CONNECTION'],
  },
];

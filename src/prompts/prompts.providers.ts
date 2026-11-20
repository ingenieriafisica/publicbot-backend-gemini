import { Connection } from 'mongoose';
import { PromptSchema } from './entities/prompt.schema';

export const promptsProviders = [
  {
    provide: 'PROMPTS_MODEL',
    useFactory: (connection: Connection) =>
      connection.models['Prompts'] || connection.model('Prompts', PromptSchema),
    inject: ['DATABASE_CONNECTION'],
  },
];
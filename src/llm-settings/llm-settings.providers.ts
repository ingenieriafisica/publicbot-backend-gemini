import { Connection } from 'mongoose';
import { AppSettingSchema } from './entities/app-setting.schema';

export const llmSettingsProviders = [
  {
    provide: 'APP_SETTINGS_MODEL',
    useFactory: (connection: Connection) =>
      connection.models['AppSetting'] ||
      connection.model('AppSetting', AppSettingSchema, 'app_settings'),
    inject: ['DATABASE_CONNECTION'],
  },
];

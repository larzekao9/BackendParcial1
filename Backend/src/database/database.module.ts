import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { AppConfig } from '../config/env.js';
import { ENTITIES } from './entities/index.js';

/**
 * Conexión a PostgreSQL/Supabase. `synchronize` queda SIEMPRE en false:
 * el esquema real vive en base_datos_cine_ia.sql (ver .claude/agents/database.md)
 * y se aplica corriendo ese script, no dejando que TypeORM lo infiera.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.get<AppConfig['database']>('database')!;
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
          ssl: db.ssl ? { rejectUnauthorized: false } : false,
          entities: ENTITIES,
          synchronize: false,
          logging: config.get<AppConfig['nodeEnv']>('nodeEnv') === 'development',
        };
      },
    }),
  ],
})
export class DatabaseModule {}

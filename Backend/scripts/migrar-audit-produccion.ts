import { config as loadDotenv } from 'dotenv';
import { Client } from 'pg';

loadDotenv();

async function main(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'cine_ia',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    console.log('Conectado a la base de datos de Supabase en producción...');
    
    await client.query(`
      ALTER TABLE log_acciones 
      ADD COLUMN IF NOT EXISTS ip_origen VARCHAR(45),
      ADD COLUMN IF NOT EXISTS user_agent TEXT;
    `);

    console.log('✅ ALTER TABLE log_acciones ejecutado con éxito en Supabase!');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('❌ Error al ejecutar la migración en Supabase:', error);
  process.exitCode = 1;
});

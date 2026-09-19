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
      ALTER TABLE peliculas
      ADD COLUMN IF NOT EXISTS sinopsis TEXT;
    `);

    const { rows } = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'peliculas' AND column_name = 'sinopsis';
    `);

    console.log('✅ ALTER TABLE peliculas ejecutado. Columna en la base:', rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('❌ Error al ejecutar la migración en Supabase:', error);
  process.exitCode = 1;
});

/**
 * Crea un usuario administrador TEMPORAL en la base de Supabase compartida del equipo,
 * mientras Roly termina el CRUD real de `usuarios` (hoy solo tiene métodos internos, sin
 * controller — ver Backend/src/modules/usuarios/usuarios.service.ts).
 *
 * El login del backend es simplificado (nombre + rol exactos, sin contraseña — ver
 * Backend/src/modules/auth/auth.service.ts), así que insertar esta fila alcanza para
 * poder autenticarse como administrador:
 *
 *   POST /api/auth/login
 *   { "nombre": "Luis Blanco (Admin Temporal)", "rol": "administrador" }
 *
 * Idempotente: si la fila ya existe (mismo nombre + rol), no inserta de nuevo, solo lo
 * informa.
 *
 * Para borrar este usuario temporal (hacerlo en cuanto exista el CRUD real de `usuarios`):
 *
 *   DELETE FROM usuarios WHERE nombre = 'Luis Blanco (Admin Temporal)' AND rol = 'administrador';
 *
 * Uso: npm run seed:admin-temporal
 * (corre con `node --experimental-strip-types` — sin decoradores/TypeORM de por medio a
 * propósito, así no depende de compilar el proyecto ni de un runner de TS adicional.)
 */
import { config as loadDotenv } from 'dotenv';
import { Client } from 'pg';

loadDotenv();

const NOMBRE_ADMIN_TEMPORAL = 'Luis Blanco (Admin Temporal)';
const ROL_ADMIN = 'administrador';

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
    const existente = await client.query<{ id_usuario: number; nombre: string; rol: string }>(
      'SELECT id_usuario, nombre, rol FROM usuarios WHERE nombre = $1 AND rol = $2',
      [NOMBRE_ADMIN_TEMPORAL, ROL_ADMIN],
    );

    if (existente.rows.length > 0) {
      const fila = existente.rows[0]!;
      console.log(
        `Ya existe: id_usuario=${fila.id_usuario}, nombre="${fila.nombre}", rol="${fila.rol}". No se insertó nada.`,
      );
      return;
    }

    const insertado = await client.query<{ id_usuario: number; nombre: string; rol: string }>(
      `INSERT INTO usuarios (nombre, rol, metodo_auth)
       VALUES ($1, $2, 'manual')
       RETURNING id_usuario, nombre, rol`,
      [NOMBRE_ADMIN_TEMPORAL, ROL_ADMIN],
    );

    const fila = insertado.rows[0]!;
    console.log(
      `Usuario administrador temporal creado: id_usuario=${fila.id_usuario}, nombre="${fila.nombre}", rol="${fila.rol}".`,
    );
    console.log(
      'Para loguearte: POST /api/auth/login con { "nombre": "Luis Blanco (Admin Temporal)", "rol": "administrador" }',
    );
    console.log('Para borrarlo cuando el CRUD real de usuarios esté listo:');
    console.log(
      `  DELETE FROM usuarios WHERE nombre = '${NOMBRE_ADMIN_TEMPORAL}' AND rol = '${ROL_ADMIN}';`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('Error al crear el usuario administrador temporal:', error);
  process.exitCode = 1;
});

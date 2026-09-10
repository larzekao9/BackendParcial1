import { config as loadDotenv } from 'dotenv';
import { DataSource, In } from 'typeorm';
import { FuncionesService } from './funciones.service.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import { Pelicula } from '../../database/entities/pelicula.entity.js';
import { Sala } from '../../database/entities/sala.entity.js';
import { Asiento } from '../../database/entities/asiento.entity.js';
import { Precio } from '../../database/entities/precio.entity.js';

loadDotenv();

/**
 * Test de integración liviano contra Postgres real (Supabase, mismas credenciales que
 * `.env` — ver docs/db-schema-notes.md sobre correr esto contra la base compartida del
 * equipo).
 *
 * Justificación: el anti-solapamiento (RF07, SQLSTATE 23P01) y la generación automática
 * de `disponibilidad_asiento` son responsabilidad de un trigger + un constraint
 * `EXCLUDE USING gist` que viven en Postgres, no en TypeScript — un repositorio mockeado
 * no puede probar que eso realmente ocurre. Mismo patrón que
 * `precios.service.integration.spec.ts`.
 */
describe('FuncionesService — integración contra Postgres real (RF07, CU04)', () => {
  let dataSource: DataSource;
  let service: FuncionesService;
  let pelicula: Pelicula;
  let sala: Sala;
  const idsFunciones: number[] = [];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'cine_ia',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      entities: [Funcion, DisponibilidadAsiento, Pelicula, Sala, Asiento, Precio],
      synchronize: false,
    });
    await dataSource.initialize();

    service = new FuncionesService(
      dataSource.getRepository(Funcion) as never,
      dataSource.getRepository(DisponibilidadAsiento) as never,
    );

    pelicula = await dataSource.getRepository(Pelicula).save(
      dataSource.getRepository(Pelicula).create({
        titulo: 'Integración FuncionesService (borrar si queda huérfana)',
        duracionMin: 100,
      }),
    );

    sala = await dataSource.getRepository(Sala).save(
      dataSource
        .getRepository(Sala)
        .create({ nombre: 'Sala Integración FuncionesService', capacidad: 2 }),
    );
    await dataSource.getRepository(Asiento).save([
      dataSource.getRepository(Asiento).create({ idSala: sala.idSala, fila: 'A', numero: 1 }),
      dataSource.getRepository(Asiento).create({ idSala: sala.idSala, fila: 'A', numero: 2 }),
    ]);
  });

  afterAll(async () => {
    if (idsFunciones.length > 0) {
      // disponibilidad_asiento → funciones es NO ACTION (ver db-schema-notes.md,
      // "Discrepancia onDelete"): hay que limpiar las filas de disponibilidad antes de
      // poder borrar la función.
      await dataSource
        .getRepository(DisponibilidadAsiento)
        .delete({ idFuncion: In(idsFunciones) });
      await dataSource.getRepository(Funcion).delete(idsFunciones);
    }
    await dataSource.getRepository(Asiento).delete({ idSala: sala.idSala });
    await dataSource.getRepository(Sala).delete(sala.idSala);
    await dataSource.getRepository(Pelicula).delete(pelicula.idPelicula);
    await dataSource.destroy();
  });

  it('rechaza una segunda función que se solapa en la misma sala (SQLSTATE 23P01)', async () => {
    const funcionA = await service.crear({
      idPelicula: pelicula.idPelicula,
      idSala: sala.idSala,
      fecha: '2026-12-01',
      horaInicio: '10:00',
      horaFin: '12:00',
    });
    idsFunciones.push(funcionA.idFuncion);

    await expect(
      service.crear({
        idPelicula: pelicula.idPelicula,
        idSala: sala.idSala,
        fecha: '2026-12-01',
        horaInicio: '11:00',
        horaFin: '13:00',
      }),
    ).rejects.toMatchObject({ code: '23P01' });
  });

  it('crear una función genera automáticamente sus filas de disponibilidad_asiento (trigger)', async () => {
    const funcion = await service.crear({
      idPelicula: pelicula.idPelicula,
      idSala: sala.idSala,
      fecha: '2026-12-02',
      horaInicio: '14:00',
      horaFin: '16:00',
    });
    idsFunciones.push(funcion.idFuncion);

    const disponibilidad = await service.listarDisponibilidad(funcion.idFuncion);

    expect(disponibilidad).toHaveLength(2);
    expect(disponibilidad.every((fila) => fila.estado === 'disponible')).toBe(true);
    expect(disponibilidad.map((fila) => fila.asiento!.numero)).toEqual([1, 2]);
  });
});

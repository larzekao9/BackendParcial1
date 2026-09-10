import { config as loadDotenv } from 'dotenv';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PreciosService } from './precios.service.js';
import { Precio } from '../../database/entities/precio.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { Pelicula } from '../../database/entities/pelicula.entity.js';
import { Sala } from '../../database/entities/sala.entity.js';

loadDotenv();

/**
 * Test de integración liviano contra Postgres real (Supabase, mismas
 * credenciales que `.env` — ver docs/db-schema-notes.md sobre correr esto
 * contra la base compartida del equipo).
 *
 * Justificación: `getVigente` arma su condición `vigenteHasta IS NULL OR
 * vigenteHasta >= :fecha` con QueryBuilder porque TypeORM no compone bien
 * ese OR desde un objeto `where` plano. Un mock de repositorio no valida
 * que el SQL generado en verdad compile y filtre como se espera contra
 * columnas `date` — solo correr la query contra Postgres de verdad prueba
 * eso.
 *
 * CORRECCIÓN (2026-09-10): ya no filtra por tipo de asiento — se retiró
 * `id_tipo_asiento` de `precios` (ver docs/db-schema-notes.md, "Reversión:
 * tipo de asiento por sala, no por butaca"). Los precios de prueba se
 * limpian por id insertado, no por tipo, para no chocar con datos de otros
 * tests o del equipo.
 */
describe('PreciosService.getVigente — integración contra Postgres real (CU07)', () => {
  const FECHA_CONSULTA = new Date('2026-06-15');

  let dataSource: DataSource;
  let repo: ReturnType<DataSource['getRepository']>;
  let service: PreciosService;
  const idsInsertados: number[] = [];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'cine_ia',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      // Funcion tiene relaciones @ManyToOne hacia Pelicula y Sala (además
      // de Precio) — TypeORM necesita las 3 entidades registradas para
      // resolver la metadata, aunque este test no las use directamente.
      entities: [Precio, Funcion, Pelicula, Sala],
      synchronize: false,
    });
    await dataSource.initialize();
    repo = dataSource.getRepository(Precio);
    service = new PreciosService(repo as never, dataSource.getRepository(Funcion) as never);
  });

  afterAll(async () => {
    if (idsInsertados.length > 0) {
      await repo.delete(idsInsertados);
    }
    await dataSource.destroy();
  });

  it('devuelve el precio vigente sin vigenteHasta (indefinido) y no el vencido', async () => {
    const vencido = await repo.save(
      repo.create({
        valor: '10.00',
        vigenteDesde: '2020-01-01',
        vigenteHasta: '2020-12-31',
      }),
    );
    const vigenteSinCorte = await repo.save(
      repo.create({
        valor: '20.00',
        vigenteDesde: '2021-01-01',
        vigenteHasta: null,
      }),
    );
    idsInsertados.push(vencido.idPrecio, vigenteSinCorte.idPrecio);

    const resultado = await service.getVigente(FECHA_CONSULTA);

    expect(resultado.idPrecio).toBe(vigenteSinCorte.idPrecio);
    expect(resultado.valor).toBe('20.00');
  });

  it('con un precio vigente con vigenteHasta futuro y otro vencido, devuelve el vigente correcto', async () => {
    const vencido = await repo.save(
      repo.create({
        valor: '11.00',
        vigenteDesde: '2019-01-01',
        vigenteHasta: '2019-12-31',
      }),
    );
    const vigenteConCorteFuturo = await repo.save(
      repo.create({
        valor: '30.00',
        vigenteDesde: '2026-01-01',
        vigenteHasta: '2030-12-31',
      }),
    );
    idsInsertados.push(vencido.idPrecio, vigenteConCorteFuturo.idPrecio);

    const resultado = await service.getVigente(FECHA_CONSULTA);

    // Puede haber más de un precio vigente simultáneo a esta altura del
    // test (el sin-corte del test anterior y este con corte futuro); el
    // contrato pide ORDER BY vigenteDesde DESC, así que gana el más
    // reciente: el de corte futuro (vigenteDesde 2026-01-01).
    expect(resultado.idPrecio).toBe(vigenteConCorteFuturo.idPrecio);
    expect(resultado.valor).toBe('30.00');
  });

  it('sin ningún precio vigente para la fecha consultada, lanza NotFoundException', async () => {
    await expect(
      service.getVigente(new Date('1999-01-01')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

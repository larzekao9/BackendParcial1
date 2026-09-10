import { config as loadDotenv } from 'dotenv';
import { DataSource, In } from 'typeorm';
import { PromocionesService } from './promociones.service.js';
import { Promocion } from '../../database/entities/promocion.entity.js';
import { PromocionFuncion } from '../../database/entities/promocion-funcion.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { Pelicula } from '../../database/entities/pelicula.entity.js';
import { Sala } from '../../database/entities/sala.entity.js';
import { Precio } from '../../database/entities/precio.entity.js';
import { Venta } from '../../database/entities/venta.entity.js';
import { Usuario } from '../../database/entities/usuario.entity.js';

loadDotenv();

/**
 * Test de integración liviano contra Postgres real (contenedor
 * `cine_ia_db`, mismas credenciales que `.env`).
 *
 * Justificación (mismo criterio que `precios.service.integration.spec.ts`):
 * `getAplicable` arma un JOIN con QueryBuilder entre `promocion_funcion` y
 * `promociones` (`activa = true AND fechaInicio <= hoy <= fechaFin`) y
 * después desempata con `ORDER BY fechaInicio DESC`. Un mock de repositorio
 * no valida que ese SQL en verdad compile ni que el filtro de vigencia
 * (columnas `date`) y el desempate funcionen contra datos reales — solo
 * correrlo contra Postgres de verdad prueba eso. Se insertan una película,
 * una sala y varias funciones de prueba (con nombres/títulos exclusivos
 * `TEST_PROMO_*`) para no chocar con datos de otros tests o de arranque.
 *
 * Las fechas de vigencia de las promociones de prueba se eligen bien
 * separadas ('2020'-'2030' para vigentes, '2015'-'2016' para vencidas) en
 * vez de relativas a "hoy" exacto, para que el test no dependa de la fecha
 * real en la que corra (siempre que el reloj del entorno esté entre 2021 y
 * 2030, cosa razonable para un proyecto que corre en 2026).
 */
describe('PromocionesService.getAplicable — integración contra Postgres real (CU06)', () => {
  let dataSource: DataSource;
  let promocionesRepo: ReturnType<DataSource['getRepository']>;
  let promocionFuncionRepo: ReturnType<DataSource['getRepository']>;
  let funcionesRepo: ReturnType<DataSource['getRepository']>;
  let peliculasRepo: ReturnType<DataSource['getRepository']>;
  let salasRepo: ReturnType<DataSource['getRepository']>;
  let service: PromocionesService;

  let idPelicula: number;
  let idSala: number;
  const idsFunciones: number[] = [];
  const idsPromociones: number[] = [];

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432', 10),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'cine_ia',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      entities: [
        Promocion,
        PromocionFuncion,
        Funcion,
        Pelicula,
        Sala,
        Precio,
        Venta,
        Usuario,
      ],
      synchronize: false,
    });
    await dataSource.initialize();

    promocionesRepo = dataSource.getRepository(Promocion);
    promocionFuncionRepo = dataSource.getRepository(PromocionFuncion);
    funcionesRepo = dataSource.getRepository(Funcion);
    peliculasRepo = dataSource.getRepository(Pelicula);
    salasRepo = dataSource.getRepository(Sala);
    const ventasRepo = dataSource.getRepository(Venta);

    service = new PromocionesService(
      promocionesRepo as never,
      promocionFuncionRepo as never,
      funcionesRepo as never,
      ventasRepo as never,
      dataSource,
    );

    const pelicula = await peliculasRepo.save(
      peliculasRepo.create({
        titulo: 'TEST_PROMO_PELICULA',
        duracionMin: 100,
      }),
    );
    idPelicula = pelicula.idPelicula;

    const sala = await salasRepo.save(
      salasRepo.create({
        nombre: 'TEST_PROMO_SALA',
        capacidad: 50,
        tipo: '2D',
      }),
    );
    idSala = sala.idSala;

    // 5 funciones en la misma sala y día, bien separadas en el tiempo para
    // no chocar con el EXCLUDE USING gist de solapamiento.
    const horarios: Array<[string, string]> = [
      ['08:00', '09:00'],
      ['10:00', '11:00'],
      ['12:00', '13:00'],
      ['14:00', '15:00'],
      ['16:00', '17:00'],
    ];
    for (const [horaInicio, horaFin] of horarios) {
      const funcion = await funcionesRepo.save(
        funcionesRepo.create({
          idPelicula,
          idSala,
          idPrecio: null,
          fecha: '2026-06-15',
          horaInicio,
          horaFin,
        }),
      );
      idsFunciones.push(funcion.idFuncion);
    }

    // Promociones de prueba.
    const promoActivaVigente = await promocionesRepo.save(
      promocionesRepo.create({
        nombre: 'TEST_PROMO_activa_vigente',
        tipoDescuento: 'porcentaje',
        valor: '20.00',
        fechaInicio: '2020-01-01',
        fechaFin: '2030-12-31',
        activa: true,
      }),
    );
    const promoVencida = await promocionesRepo.save(
      promocionesRepo.create({
        nombre: 'TEST_PROMO_vencida',
        tipoDescuento: 'porcentaje',
        valor: '10.00',
        fechaInicio: '2015-01-01',
        fechaFin: '2016-12-31',
        activa: true,
      }),
    );
    const promoInactiva = await promocionesRepo.save(
      promocionesRepo.create({
        nombre: 'TEST_PROMO_inactiva',
        tipoDescuento: 'monto_fijo',
        valor: '5.00',
        fechaInicio: '2020-01-01',
        fechaFin: '2030-12-31',
        activa: false,
      }),
    );
    const promoEmpateVieja = await promocionesRepo.save(
      promocionesRepo.create({
        nombre: 'TEST_PROMO_empate_vieja',
        tipoDescuento: 'porcentaje',
        valor: '15.00',
        fechaInicio: '2020-01-01',
        fechaFin: '2030-12-31',
        activa: true,
      }),
    );
    const promoEmpateNueva = await promocionesRepo.save(
      promocionesRepo.create({
        nombre: 'TEST_PROMO_empate_nueva',
        tipoDescuento: 'porcentaje',
        valor: '25.00',
        fechaInicio: '2021-06-01',
        fechaFin: '2030-12-31',
        activa: true,
      }),
    );
    idsPromociones.push(
      promoActivaVigente.idPromocion,
      promoVencida.idPromocion,
      promoInactiva.idPromocion,
      promoEmpateVieja.idPromocion,
      promoEmpateNueva.idPromocion,
    );

    // Asociaciones: funcion[0] -> activa/vigente; funcion[1] -> vencida;
    // funcion[2] -> inactiva; funcion[3] -> empate (vieja + nueva);
    // funcion[4] -> sin ninguna promoción.
    await promocionFuncionRepo.save([
      promocionFuncionRepo.create({
        idPromocion: promoActivaVigente.idPromocion,
        idFuncion: idsFunciones[0],
      }),
      promocionFuncionRepo.create({
        idPromocion: promoVencida.idPromocion,
        idFuncion: idsFunciones[1],
      }),
      promocionFuncionRepo.create({
        idPromocion: promoInactiva.idPromocion,
        idFuncion: idsFunciones[2],
      }),
      promocionFuncionRepo.create({
        idPromocion: promoEmpateVieja.idPromocion,
        idFuncion: idsFunciones[3],
      }),
      promocionFuncionRepo.create({
        idPromocion: promoEmpateNueva.idPromocion,
        idFuncion: idsFunciones[3],
      }),
    ]);
  });

  afterAll(async () => {
    // Orden que respeta las FKs: primero la tabla puente, después
    // promociones y funciones (sin dependencia mutua), y al final sala y
    // película (referenciadas por funciones).
    if (idsFunciones.length > 0) {
      await promocionFuncionRepo.delete({ idFuncion: In(idsFunciones) });
    }
    if (idsPromociones.length > 0) {
      await promocionesRepo.delete(idsPromociones);
    }
    if (idsFunciones.length > 0) {
      await funcionesRepo.delete(idsFunciones);
    }
    if (idSala) {
      await salasRepo.delete(idSala);
    }
    if (idPelicula) {
      await peliculasRepo.delete(idPelicula);
    }
    await dataSource.destroy();
  });

  it('devuelve la promoción cuando está activa y vigente para la función', async () => {
    const resultado = await service.getAplicable(idsFunciones[0]);

    expect(resultado).not.toBeNull();
    expect(resultado?.nombre).toBe('TEST_PROMO_activa_vigente');
  });

  it('devuelve null cuando la única promoción asociada está vencida', async () => {
    const resultado = await service.getAplicable(idsFunciones[1]);

    expect(resultado).toBeNull();
  });

  it('devuelve null cuando la única promoción asociada está vigente pero activa=false', async () => {
    const resultado = await service.getAplicable(idsFunciones[2]);

    expect(resultado).toBeNull();
  });

  it('con dos promociones activas y vigentes simultáneas, devuelve la de fechaInicio más reciente', async () => {
    const resultado = await service.getAplicable(idsFunciones[3]);

    expect(resultado).not.toBeNull();
    expect(resultado?.nombre).toBe('TEST_PROMO_empate_nueva');
  });

  it('devuelve null cuando la función no tiene ninguna promoción asociada', async () => {
    const resultado = await service.getAplicable(idsFunciones[4]);

    expect(resultado).toBeNull();
  });
});

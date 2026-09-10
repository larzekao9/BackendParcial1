import { config as loadDotenv } from 'dotenv';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { ConfigService } from '@nestjs/config';
import { VentasService } from './ventas.service.js';
import { PreciosService } from '../precios/precios.service.js';
import { PromocionesService } from '../promociones/promociones.service.js';
import { AuditService } from '../audit/audit.service.js';
import { Venta } from '../../database/entities/venta.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { Pelicula } from '../../database/entities/pelicula.entity.js';
import { Sala } from '../../database/entities/sala.entity.js';
import { Asiento } from '../../database/entities/asiento.entity.js';
import { Precio } from '../../database/entities/precio.entity.js';
import { Promocion } from '../../database/entities/promocion.entity.js';
import { PromocionFuncion } from '../../database/entities/promocion-funcion.entity.js';
import { LogAccion } from '../../database/entities/log-accion.entity.js';
import { Usuario } from '../../database/entities/usuario.entity.js';

loadDotenv();

/**
 * Test de integración contra Postgres real (Supabase, ver docs/db-schema-notes.md):
 * dos compras simultáneas de LA MISMA butaca para la misma función. No se puede probar
 * esto con repositorios mockeados — la garantía real depende de que Postgres serialice
 * el `UPDATE ... WHERE estado = 'disponible'` de `VentasService.crear` entre las dos
 * transacciones concurrentes (ver el comentario de diseño en ventas.service.ts).
 */
describe('VentasService.crear — concurrencia real (RF01/CU02)', () => {
  let dataSource: DataSource;
  let servicioA: VentasService;
  let servicioB: VentasService;
  let pelicula: Pelicula;
  let sala: Sala;
  let asiento: Asiento;
  let precio: Precio;
  let funcion: Funcion;
  const idsVentas: number[] = [];

  const configServiceFake = { get: () => 'servidor_local' } as unknown as ConfigService;

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
        Venta,
        DetalleVentaEntrada,
        DisponibilidadAsiento,
        Funcion,
        Pelicula,
        Sala,
        Asiento,
        Precio,
        Promocion,
        PromocionFuncion,
        LogAccion,
        Usuario,
      ],
      synchronize: false,
    });
    await dataSource.initialize();

    pelicula = await dataSource.getRepository(Pelicula).save(
      dataSource
        .getRepository(Pelicula)
        .create({ titulo: 'Integración VentasService concurrencia', duracionMin: 90 }),
    );
    sala = await dataSource
      .getRepository(Sala)
      .save(dataSource.getRepository(Sala).create({ nombre: 'Sala concurrencia ventas', capacidad: 1 }));
    asiento = await dataSource
      .getRepository(Asiento)
      .save(dataSource.getRepository(Asiento).create({ idSala: sala.idSala, fila: 'A', numero: 1 }));
    precio = await dataSource.getRepository(Precio).save(
      dataSource
        .getRepository(Precio)
        .create({ valor: '25.00', vigenteDesde: '2020-01-01', vigenteHasta: null }),
    );
    funcion = await dataSource.getRepository(Funcion).save(
      dataSource.getRepository(Funcion).create({
        idPelicula: pelicula.idPelicula,
        idSala: sala.idSala,
        idPrecio: precio.idPrecio,
        fecha: '2026-12-15',
        horaInicio: '20:00',
        horaFin: '22:00',
      }),
    );

    const construirServicio = () =>
      new VentasService(
        dataSource.getRepository(Venta),
        dataSource.getRepository(Funcion),
        dataSource,
        new PreciosService(dataSource.getRepository(Precio), dataSource.getRepository(Funcion)),
        new PromocionesService(
          dataSource.getRepository(Promocion),
          dataSource.getRepository(PromocionFuncion),
          dataSource.getRepository(Funcion),
          dataSource.getRepository(Venta),
          dataSource,
        ),
        new AuditService(dataSource.getRepository(LogAccion)),
        configServiceFake,
      );

    servicioA = construirServicio();
    servicioB = construirServicio();
  });

  afterAll(async () => {
    // Si `beforeAll` falló antes de terminar el setup (ej. conexión no inicializada), no
    // hay nada que limpiar — y las variables de abajo pueden estar `undefined`.
    if (!dataSource?.isInitialized) {
      return;
    }

    if (idsVentas.length > 0) {
      await dataSource.getRepository(DetalleVentaEntrada).delete({ idVenta: idsVentas[0] });
      await dataSource.getRepository(Venta).delete(idsVentas);
    }
    if (funcion) {
      await dataSource.getRepository(DisponibilidadAsiento).delete({ idFuncion: funcion.idFuncion });
      await dataSource.getRepository(Funcion).delete(funcion.idFuncion);
    }
    if (precio) {
      await dataSource.getRepository(Precio).delete(precio.idPrecio);
    }
    if (asiento) {
      await dataSource.getRepository(Asiento).delete(asiento.idAsiento);
    }
    if (sala) {
      await dataSource.getRepository(Sala).delete(sala.idSala);
    }
    if (pelicula) {
      await dataSource.getRepository(Pelicula).delete(pelicula.idPelicula);
    }
    await dataSource.destroy();
  });

  it('de dos compras simultáneas de la misma butaca, exactamente una tiene éxito', async () => {
    const inputBase = {
      idFuncion: funcion.idFuncion,
      idAsientos: [asiento.idAsiento],
      tipoRegistro: 'manual' as const,
      confirmacionNoReembolso: true,
      confirmacionVerbalCheck: false,
    };

    const [resultadoA, resultadoB] = await Promise.allSettled([
      servicioA.crear(inputBase),
      servicioB.crear(inputBase),
    ]);

    const resultados = [resultadoA, resultadoB];
    const exitosas = resultados.filter((r) => r.status === 'fulfilled');
    const rechazadas = resultados.filter((r) => r.status === 'rejected');

    expect(exitosas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect((rechazadas[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);

    const ventaExitosa = (exitosas[0] as PromiseFulfilledResult<Venta>).value;
    idsVentas.push(ventaExitosa.idVenta);

    const disponibilidad = await dataSource.getRepository(DisponibilidadAsiento).findOne({
      where: { idFuncion: funcion.idFuncion, idAsiento: asiento.idAsiento },
    });
    expect(disponibilidad?.estado).toBe('ocupado');
  });
});

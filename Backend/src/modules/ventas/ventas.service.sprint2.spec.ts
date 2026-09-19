import { BadRequestException, ConflictException } from '@nestjs/common';
import { VentasService } from './ventas.service.js';
import type { Funcion } from '../../database/entities/funcion.entity.js';
import type { DataSource, Repository } from 'typeorm';
import type { Venta } from '../../database/entities/venta.entity.js';
import type { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import type { DetalleVentaDulceria } from '../../database/entities/detalle-venta-dulceria.entity.js';
import type { PreciosService } from '../precios/precios.service.js';
import type { PromocionesService } from '../promociones/promociones.service.js';
import type { DulceriaService } from '../dulceria/dulceria.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { ConfigService } from '@nestjs/config';
import type { CrearVentaInput } from '../../contracts/service-contracts.js';

/**
 * Pruebas del Sprint 2 (núcleo transaccional) que completan a `ventas.service.spec.ts`:
 *
 * - CAJA NEGRA por tabla de decisión (RF03 / RF19): las 8 combinaciones de
 *   `confirmacionNoReembolso` × `tipoRegistro` × `confirmacionVerbalCheck`. La spec original probaba
 *   "manual sin verbal" y "voz sin verbal", pero no "voz CON verbal" (el camino feliz de la compra por voz).
 * - CAJA NEGRA por valores límite: la venta mínima (1 asiento) y una venta grande (10 asientos).
 * - CAJA BLANCA: las dos ramas defensivas de `crear` que la cobertura marcaba como no ejecutadas
 *   (`resultado.affected ?? 0` y `configService.get('nivelDespliegue') ?? null`).
 *
 * No toca la base de datos: repositorios, transacción y servicios vecinos están simulados.
 */
describe('VentasService — pruebas del Sprint 2 (caja negra y caja blanca)', () => {
  const funcion: Funcion = {
    idFuncion: 10,
    idPelicula: 1,
    idSala: 2,
    idPrecio: null,
    fecha: '2026-10-01',
    horaInicio: '18:00',
    horaFin: '20:00',
    tiempoLimpiezaMin: null,
    estado: 'programada',
  };

  function construir(
    opciones: {
      affected?: number | undefined;
      nivelDespliegue?: string | undefined;
    } = {},
  ) {
    const manager = {
      update: vi.fn().mockResolvedValue({
        affected: 'affected' in opciones ? opciones.affected : undefined,
      }),
      save: vi.fn(async (entidad: unknown, datos: unknown) => ({
        idVenta: 100,
        ...(datos as object),
        entidad,
      })),
    };
    // `affected` por defecto = tantos asientos como se pidan: cada prueba lo ajusta cuando le importa.
    const dataSource = {
      transaction: vi.fn(async (cb: (m: unknown) => unknown) => cb(manager)),
    } as unknown as DataSource;
    const auditService = {
      log: vi.fn().mockResolvedValue(undefined),
    } as unknown as AuditService;
    const service = new VentasService(
      {} as unknown as Repository<Venta>,
      {} as unknown as Repository<DetalleVentaEntrada>,
      {} as unknown as Repository<DetalleVentaDulceria>,
      {
        findOne: vi.fn().mockResolvedValue(funcion),
      } as unknown as Repository<Funcion>,
      dataSource,
      {
        getVigente: vi.fn().mockResolvedValue({ idPrecio: 1, valor: '20.00' }),
        buscarPorId: vi.fn(),
      } as unknown as PreciosService,
      {
        getAplicable: vi.fn().mockResolvedValue(null),
      } as unknown as PromocionesService,
      { buscarProductoPorId: vi.fn() } as unknown as DulceriaService,
      auditService,
      {
        get: vi.fn().mockReturnValue(opciones.nivelDespliegue),
      } as unknown as ConfigService,
    );
    return { service, manager, dataSource, auditService };
  }

  const entrada = (cambios: Partial<CrearVentaInput>): CrearVentaInput => ({
    idFuncion: 10,
    idAsientos: [1, 2],
    tipoRegistro: 'manual',
    confirmacionNoReembolso: true,
    confirmacionVerbalCheck: false,
    ...cambios,
  });

  // ---------------------------------------------------------------------------------------- caja negra: tabla de decisión

  const tablaDeDecision: [
    boolean,
    'manual' | 'voz',
    boolean,
    'rechaza RF03' | 'rechaza RF19' | 'acepta',
  ][] = [
    [false, 'manual', false, 'rechaza RF03'],
    [false, 'manual', true, 'rechaza RF03'],
    [false, 'voz', false, 'rechaza RF03'],
    [false, 'voz', true, 'rechaza RF03'],
    [true, 'manual', false, 'acepta'],
    [true, 'manual', true, 'acepta'],
    [true, 'voz', false, 'rechaza RF19'],
    [true, 'voz', true, 'acepta'],
  ];

  it.each(tablaDeDecision)(
    'noReembolso=%s, tipoRegistro=%s, verbalCheck=%s → %s',
    async (noReembolso, tipoRegistro, verbal, esperado) => {
      const { service, dataSource, manager } = construir({ affected: 2 });
      const llamada = service.crear(
        entrada({
          confirmacionNoReembolso: noReembolso,
          tipoRegistro,
          confirmacionVerbalCheck: verbal,
        }),
      );

      if (esperado === 'acepta') {
        const venta = await llamada;
        expect(venta.idVenta).toBe(100);
        expect(dataSource.transaction).toHaveBeenCalledTimes(1);
        return;
      }
      await expect(llamada).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.crear(
          entrada({
            confirmacionNoReembolso: noReembolso,
            tipoRegistro,
            confirmacionVerbalCheck: verbal,
          }),
        ),
      ).rejects.toThrow(esperado === 'rechaza RF03' ? /RF03/ : /RF19/);
      // Una venta rechazada por estas reglas NUNCA abre la transacción ni toca los asientos.
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    },
  );

  // ---------------------------------------------------------------------------------------- caja negra: valores límite

  it.each([
    [1, '20.00'],
    [2, '40.00'],
    [10, '200.00'],
  ])('%s asiento(s) a 20.00 → subtotal y total %s', async (cantidad, total) => {
    const { service, manager } = construir({ affected: cantidad });
    const idAsientos = Array.from({ length: cantidad }, (_, i) => i + 1);

    await service.crear(entrada({ idAsientos }));

    const venta = manager.save.mock.calls.find(
      ([, datos]) => 'subtotal' in (datos as object),
    )?.[1] as Record<string, unknown>;
    expect(venta).toMatchObject({
      subtotal: total,
      descuentoAplicado: '0.00',
      total,
    });
  });

  // ---------------------------------------------------------------------------------------- caja blanca: ramas defensivas

  it('si la base no informa cuántos asientos actualizó (affected indefinido) se trata como 0 y se rechaza con 409', async () => {
    const { service, manager } = construir({ affected: undefined });

    await expect(service.crear(entrada({}))).rejects.toBeInstanceOf(
      ConflictException,
    );
    // Se marcó el intento de ocupar los asientos, pero como no coinciden con los pedidos no se guarda NINGUNA venta.
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('sin nivel de despliegue configurado la auditoría se registra con nivel null', async () => {
    const { service, auditService } = construir({
      affected: 2,
      nivelDespliegue: undefined,
    });

    await service.crear(entrada({}), 42);

    expect(auditService.log).toHaveBeenCalledWith(42, 'crear_venta:100', null);
  });
});

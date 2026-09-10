import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { VentasService } from './ventas.service.js';
import { Venta } from '../../database/entities/venta.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import type { Funcion } from '../../database/entities/funcion.entity.js';
import type { DataSource, Repository } from 'typeorm';
import type { PreciosService } from '../precios/precios.service.js';
import type { PromocionesService } from '../promociones/promociones.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { ConfigService } from '@nestjs/config';

describe('VentasService', () => {
  const funcionDefault: Funcion = {
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

  function buildService(overrides?: {
    ventasRepo?: Partial<Repository<Venta>>;
    funcionesRepo?: Partial<Repository<Funcion>>;
    manager?: Partial<Record<string, unknown>>;
    preciosService?: Partial<PreciosService>;
    promocionesService?: Partial<PromocionesService>;
    auditService?: Partial<AuditService>;
  }) {
    const ventasRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      ...overrides?.ventasRepo,
    } as unknown as Repository<Venta>;

    const funcionesRepo = {
      findOne: vi.fn().mockResolvedValue(funcionDefault),
      ...overrides?.funcionesRepo,
    } as unknown as Repository<Funcion>;

    const manager = {
      update: vi.fn().mockResolvedValue({ affected: 2 }),
      save: vi.fn(async (entity: unknown, data: unknown) => {
        if (entity === Venta) {
          return { idVenta: 100, ...(data as Record<string, unknown>) };
        }
        return data;
      }),
      ...overrides?.manager,
    };

    const dataSource = {
      transaction: vi.fn(async (cb: (manager: unknown) => unknown) => cb(manager)),
    } as unknown as DataSource;

    const preciosService = {
      getVigente: vi.fn().mockResolvedValue({ idPrecio: 1, valor: '20.00' }),
      buscarPorId: vi.fn().mockResolvedValue({ idPrecio: 1, valor: '20.00' }),
      ...overrides?.preciosService,
    } as unknown as PreciosService;

    const promocionesService = {
      getAplicable: vi.fn().mockResolvedValue(null),
      ...overrides?.promocionesService,
    } as unknown as PromocionesService;

    const auditService = {
      log: vi.fn().mockResolvedValue(undefined),
      ...overrides?.auditService,
    } as unknown as AuditService;

    const configService = {
      get: vi.fn().mockReturnValue('servidor_local'),
    } as unknown as ConfigService;

    const service = new VentasService(
      ventasRepo,
      funcionesRepo,
      dataSource,
      preciosService,
      promocionesService,
      auditService,
      configService,
    );
    return {
      service,
      ventasRepo,
      funcionesRepo,
      dataSource,
      manager,
      preciosService,
      promocionesService,
      auditService,
    };
  }

  const inputValido = {
    idFuncion: 10,
    idAsientos: [1, 2],
    tipoRegistro: 'manual' as const,
    confirmacionNoReembolso: true,
    confirmacionVerbalCheck: false,
  };

  function ventaGuardadaEn(manager: { save: ReturnType<typeof vi.fn> }) {
    return manager.save.mock.calls.find(([entity]: [unknown]) => entity === Venta)?.[1];
  }

  function detalleGuardadoEn(manager: { save: ReturnType<typeof vi.fn> }) {
    return manager.save.mock.calls.find(([entity]: [unknown]) => entity === DetalleVentaEntrada)?.[1];
  }

  it('rechaza sin confirmacionNoReembolso (RF03) antes de abrir la transacción', async () => {
    const { service, dataSource } = buildService();

    await expect(
      service.crear({ ...inputValido, confirmacionNoReembolso: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rechaza tipoRegistro="voz" sin confirmacionVerbalCheck (RF19) antes de abrir la transacción', async () => {
    const { service, dataSource } = buildService();

    await expect(
      service.crear({
        ...inputValido,
        tipoRegistro: 'voz',
        confirmacionVerbalCheck: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('función inexistente lanza NotFoundException antes de abrir la transacción', async () => {
    const { service, dataSource } = buildService({
      funcionesRepo: { findOne: vi.fn().mockResolvedValue(null) },
    });

    await expect(service.crear(inputValido)).rejects.toBeInstanceOf(NotFoundException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('la función con idPrecio asignado usa ESE precio, no el "vigente" global (regresión)', async () => {
    const funcionConPrecioPropio: Funcion = { ...funcionDefault, idPrecio: 7 };
    const { service, manager, preciosService } = buildService({
      funcionesRepo: { findOne: vi.fn().mockResolvedValue(funcionConPrecioPropio) },
      preciosService: {
        buscarPorId: vi.fn().mockResolvedValue({ idPrecio: 7, valor: '55.00' }),
        getVigente: vi.fn().mockResolvedValue({ idPrecio: 1, valor: '20.00' }),
      },
    });

    await service.crear(inputValido);

    // Antes de esta corrección, VentasService siempre llamaba a getVigente(fecha) e
    // ignoraba funcion.idPrecio — con dos precios "vigentes" a la vez (ej. tarifa normal
    // + VIP) eso cobraba el precio equivocado a una función que sí tenía uno asignado.
    expect(preciosService.buscarPorId).toHaveBeenCalledWith(7);
    expect(preciosService.getVigente).not.toHaveBeenCalled();
    expect(ventaGuardadaEn(manager)).toMatchObject({ subtotal: '110.00', total: '110.00' });
  });

  it('la función sin idPrecio (null) cae a PreciosService.getVigente(fecha) como respaldo', async () => {
    const { service, preciosService } = buildService();

    await service.crear(inputValido);

    expect(preciosService.getVigente).toHaveBeenCalledWith(new Date(funcionDefault.fecha));
  });

  it('éxito sin promoción: calcula subtotal/total, marca asientos ocupados e inserta venta+detalle', async () => {
    const { service, manager } = buildService();

    const venta = await service.crear(inputValido, 42);

    expect(manager.update).toHaveBeenCalledWith(
      DisponibilidadAsiento,
      { idFuncion: 10, idAsiento: In([1, 2]), estado: 'disponible' },
      { estado: 'ocupado' },
    );
    expect(ventaGuardadaEn(manager)).toMatchObject({
      idFuncion: 10,
      idUsuarioCliente: null,
      idPromocion: null,
      subtotal: '40.00',
      descuentoAplicado: '0.00',
      total: '40.00',
      estado: 'pendiente_pago',
    });
    expect(detalleGuardadoEn(manager)).toEqual([
      { idVenta: 100, idAsiento: 1, precioUnitario: '20.00' },
      { idVenta: 100, idAsiento: 2, precioUnitario: '20.00' },
    ]);
    expect(venta.idVenta).toBe(100);
  });

  it('éxito con promoción porcentaje: aplica el descuento sobre el subtotal', async () => {
    const { service, manager } = buildService({
      promocionesService: {
        getAplicable: vi
          .fn()
          .mockResolvedValue({ idPromocion: 5, tipoDescuento: 'porcentaje', valor: '10' }),
      },
    });

    await service.crear(inputValido);

    expect(ventaGuardadaEn(manager)).toMatchObject({
      idPromocion: 5,
      subtotal: '40.00',
      descuentoAplicado: '4.00',
      total: '36.00',
    });
  });

  it('promoción monto_fijo nunca deja el total negativo (se recorta al subtotal)', async () => {
    const { service, manager } = buildService({
      promocionesService: {
        getAplicable: vi
          .fn()
          .mockResolvedValue({ idPromocion: 6, tipoDescuento: 'monto_fijo', valor: '999.00' }),
      },
    });

    await service.crear(inputValido);

    expect(ventaGuardadaEn(manager)).toMatchObject({
      subtotal: '40.00',
      descuentoAplicado: '40.00',
      total: '0.00',
    });
  });

  it('idAsientos duplicados en el input se deduplican antes de marcar disponibilidad', async () => {
    const { service, manager } = buildService({
      manager: { update: vi.fn().mockResolvedValue({ affected: 1 }) },
    });

    await service.crear({ ...inputValido, idAsientos: [3, 3] });

    expect(manager.update).toHaveBeenCalledWith(
      DisponibilidadAsiento,
      { idFuncion: 10, idAsiento: In([3]), estado: 'disponible' },
      { estado: 'ocupado' },
    );
    expect(detalleGuardadoEn(manager)).toHaveLength(1);
  });

  it('si algún asiento ya no está disponible (affected < pedidos), lanza ConflictException y no guarda nada', async () => {
    const { service, manager } = buildService({
      manager: { update: vi.fn().mockResolvedValue({ affected: 1 }) },
    });

    await expect(service.crear(inputValido)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('sin idUsuarioActor no llama a AuditService.log', async () => {
    const { service, auditService } = buildService();

    await service.crear(inputValido);

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('con idUsuarioActor llama a AuditService.log con el id de la venta recién creada', async () => {
    const { service, auditService } = buildService();

    await service.crear(inputValido, 42);

    expect(auditService.log).toHaveBeenCalledWith(42, 'crear_venta:100', 'servidor_local');
  });

  it('buscarPorId inexistente lanza NotFoundException', async () => {
    const { service } = buildService({ ventasRepo: { findOne: vi.fn().mockResolvedValue(null) } });

    await expect(service.buscarPorId(999)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listar sin idUsuarioCliente trae todas las ventas (vista administrador)', async () => {
    const { service, ventasRepo } = buildService();

    await service.listar();

    expect(ventasRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('listar con idUsuarioCliente filtra solo las ventas de ese cliente', async () => {
    const { service, ventasRepo } = buildService();

    await service.listar(7);

    expect(ventasRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { idUsuarioCliente: 7 } }),
    );
  });
});

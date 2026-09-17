import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { VentasService } from './ventas.service.js';
import { Venta } from '../../database/entities/venta.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import { DetalleVentaDulceria } from '../../database/entities/detalle-venta-dulceria.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import type { Funcion } from '../../database/entities/funcion.entity.js';
import type { DataSource, Repository } from 'typeorm';
import type { PreciosService } from '../precios/precios.service.js';
import type { PromocionesService } from '../promociones/promociones.service.js';
import type { DulceriaService } from '../dulceria/dulceria.service.js';
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
    detalleEntradasRepo?: Partial<Repository<DetalleVentaEntrada>>;
    detalleDulceriaRepo?: Partial<Repository<DetalleVentaDulceria>>;
    funcionesRepo?: Partial<Repository<Funcion>>;
    manager?: Partial<Record<string, unknown>>;
    preciosService?: Partial<PreciosService>;
    promocionesService?: Partial<PromocionesService>;
    dulceriaService?: Partial<DulceriaService>;
    auditService?: Partial<AuditService>;
  }) {
    const ventasRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      ...overrides?.ventasRepo,
    } as unknown as Repository<Venta>;

    const detalleEntradasRepo = {
      find: vi.fn().mockResolvedValue([]),
      ...overrides?.detalleEntradasRepo,
    } as unknown as Repository<DetalleVentaEntrada>;

    const detalleDulceriaRepo = {
      find: vi.fn().mockResolvedValue([]),
      ...overrides?.detalleDulceriaRepo,
    } as unknown as Repository<DetalleVentaDulceria>;

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

    const dulceriaService = {
      buscarProductoPorId: vi.fn(),
      ...overrides?.dulceriaService,
    } as unknown as DulceriaService;

    const auditService = {
      log: vi.fn().mockResolvedValue(undefined),
      ...overrides?.auditService,
    } as unknown as AuditService;

    const configService = {
      get: vi.fn().mockReturnValue('servidor_local'),
    } as unknown as ConfigService;

    const service = new VentasService(
      ventasRepo,
      detalleEntradasRepo,
      detalleDulceriaRepo,
      funcionesRepo,
      dataSource,
      preciosService,
      promocionesService,
      dulceriaService,
      auditService,
      configService,
    );
    return {
      service,
      ventasRepo,
      detalleEntradasRepo,
      detalleDulceriaRepo,
      funcionesRepo,
      dataSource,
      manager,
      preciosService,
      promocionesService,
      dulceriaService,
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

  function detalleDulceriaGuardadoEn(manager: { save: ReturnType<typeof vi.fn> }) {
    return manager.save.mock.calls.find(([entity]: [unknown]) => entity === DetalleVentaDulceria)?.[1];
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

  it('con dulcería: valida cada producto, suma su subtotal SIN descuento, e inserta detalle_venta_dulceria', async () => {
    const { service, manager, dulceriaService } = buildService({
      dulceriaService: {
        buscarProductoPorId: vi.fn((idProducto: number) =>
          Promise.resolve(
            idProducto === 3
              ? {
                  idProducto: 3,
                  idCategoria: 1,
                  nombre: 'Popcorn',
                  descripcion: null,
                  precioBase: '15.00',
                  tipo: 'individual' as const,
                  etiqueta: null,
                  disponible: true,
                  imagenUrl: null,
                }
              : {
                  idProducto: 4,
                  idCategoria: 2,
                  nombre: 'Coca Cola',
                  descripcion: null,
                  precioBase: '8.00',
                  tipo: 'individual' as const,
                  etiqueta: null,
                  disponible: true,
                  imagenUrl: null,
                },
          ),
        ),
      },
      promocionesService: {
        getAplicable: vi
          .fn()
          .mockResolvedValue({ idPromocion: 5, tipoDescuento: 'porcentaje', valor: '10' }),
      },
    });

    await service.crear({
      ...inputValido,
      dulceria: [
        { idProducto: 3, cantidad: 2 },
        { idProducto: 4, cantidad: 1 },
      ],
    });

    expect(dulceriaService.buscarProductoPorId).toHaveBeenCalledWith(3);
    expect(dulceriaService.buscarProductoPorId).toHaveBeenCalledWith(4);
    // entradas: 40.00, dulcería: 15*2 + 8*1 = 38.00 → subtotal 78.00.
    // descuento: solo 10% de las entradas (40.00) = 4.00 → total 74.00.
    expect(ventaGuardadaEn(manager)).toMatchObject({
      subtotal: '78.00',
      descuentoAplicado: '4.00',
      total: '74.00',
    });
    expect(detalleDulceriaGuardadoEn(manager)).toEqual([
      { idVenta: 100, idProducto: 3, cantidad: 2, precioUnitario: '15.00' },
      { idVenta: 100, idProducto: 4, cantidad: 1, precioUnitario: '8.00' },
    ]);
  });

  it('sin dulcería no se llama a DulceriaService ni se inserta detalle_venta_dulceria', async () => {
    const { service, manager, dulceriaService } = buildService();

    await service.crear(inputValido);

    expect(dulceriaService.buscarProductoPorId).not.toHaveBeenCalled();
    expect(detalleDulceriaGuardadoEn(manager)).toBeUndefined();
  });

  it('dulcería con producto inexistente lanza NotFoundException antes de abrir la transacción', async () => {
    const { service, dataSource, dulceriaService } = buildService({
      dulceriaService: {
        buscarProductoPorId: vi.fn().mockRejectedValue(new NotFoundException()),
      },
    });

    await expect(
      service.crear({ ...inputValido, dulceria: [{ idProducto: 999, cantidad: 1 }] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(dulceriaService.buscarProductoPorId).toHaveBeenCalledWith(999);
  });

  it('dulcería con producto no disponible lanza BadRequestException antes de abrir la transacción', async () => {
    const { service, dataSource } = buildService({
      dulceriaService: {
        buscarProductoPorId: vi.fn().mockResolvedValue({
          idProducto: 3,
          idCategoria: 1,
          nombre: 'Popcorn descontinuado',
          descripcion: null,
          precioBase: '15.00',
          tipo: 'individual',
          etiqueta: null,
          disponible: false,
          imagenUrl: null,
        }),
      },
    });

    await expect(
      service.crear({ ...inputValido, dulceria: [{ idProducto: 3, cantidad: 1 }] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
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

  it('buscarPorId trae función/película/sala/promoción vía relations, y el detalle de entradas/dulcería aparte', async () => {
    const ventaConRelaciones = {
      idVenta: 100,
      idUsuarioCliente: 7,
      funcion: { idFuncion: 10, pelicula: { titulo: 'Dune' }, sala: { nombre: 'Sala 1' } },
      promocion: null,
    };
    const { service, ventasRepo, detalleEntradasRepo, detalleDulceriaRepo } = buildService({
      ventasRepo: { findOne: vi.fn().mockResolvedValue(ventaConRelaciones) },
      detalleEntradasRepo: {
        find: vi.fn().mockResolvedValue([{ idAsiento: 1, asiento: { fila: 'A', numero: 1 } }]),
      },
      detalleDulceriaRepo: {
        find: vi.fn().mockResolvedValue([{ idProducto: 3, producto: { nombre: 'Popcorn' } }]),
      },
    });

    const venta = await service.buscarPorId(100);

    expect(ventasRepo.findOne).toHaveBeenCalledWith({
      where: { idVenta: 100 },
      relations: { funcion: { pelicula: true, sala: true }, promocion: true },
    });
    expect(detalleEntradasRepo.find).toHaveBeenCalledWith({
      where: { idVenta: 100 },
      relations: { asiento: true },
    });
    expect(detalleDulceriaRepo.find).toHaveBeenCalledWith({
      where: { idVenta: 100 },
      relations: { producto: true },
    });
    expect(venta.detalleEntradas).toEqual([{ idAsiento: 1, asiento: { fila: 'A', numero: 1 } }]);
    expect(venta.detalleDulceria).toEqual([{ idProducto: 3, producto: { nombre: 'Popcorn' } }]);
    expect(venta.funcion).toMatchObject({ pelicula: { titulo: 'Dune' } });
  });

  it('listar sin idUsuarioCliente trae todas las ventas (vista administrador) con relations', async () => {
    const { service, ventasRepo } = buildService();

    await service.listar();

    expect(ventasRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        relations: { funcion: { pelicula: true, sala: true }, promocion: true },
      }),
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

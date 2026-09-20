import { IaGatewayService } from './ia-gateway.service.js';
import type { PeliculasService } from '../peliculas/peliculas.service.js';
import type { FuncionesService } from '../funciones/funciones.service.js';
import type { VentasService } from '../ventas/ventas.service.js';
import type { PagosService } from '../pagos/pagos.service.js';
import type { PromocionesService } from '../promociones/promociones.service.js';
import type { PreciosService } from '../precios/precios.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AccionGestion } from '../../contracts/service-contracts.js';

describe('IaGatewayService (RF10)', () => {
  let peliculasService: Partial<PeliculasService>;
  let funcionesService: Partial<FuncionesService>;
  let ventasService: Partial<VentasService>;
  let pagosService: Partial<PagosService>;
  let promocionesService: Partial<PromocionesService>;
  let preciosService: Partial<PreciosService>;
  let auditService: Partial<AuditService>;
  let service: IaGatewayService;

  beforeEach(() => {
    peliculasService = {
      crear: vi.fn().mockResolvedValue({ idPelicula: 1, titulo: 'Inception' }),
      actualizar: vi.fn().mockResolvedValue({ idPelicula: 1, titulo: 'Inception Editada' }),
      eliminar: vi.fn().mockResolvedValue(undefined),
    };
    funcionesService = {
      crear: vi.fn().mockResolvedValue({ idFuncion: 10 }),
      cancelar: vi.fn().mockResolvedValue({ idFuncion: 10, estado: 'cancelada' }),
    };
    ventasService = {
      crear: vi.fn().mockResolvedValue({ idVenta: 100, estado: 'pendiente_pago' }),
    };
    pagosService = {
      crear: vi.fn().mockResolvedValue({ idVenta: 100, estado: 'pagada' }),
    };
    promocionesService = {
      crear: vi.fn().mockResolvedValue({ idPromocion: 1, nombre: 'Promo 2x1' }),
      actualizar: vi.fn().mockResolvedValue({ idPromocion: 1, nombre: 'Promo 2x1 Editada' }),
      eliminar: vi.fn().mockResolvedValue(undefined),
    };
    preciosService = {
      crear: vi.fn().mockResolvedValue({ idPrecio: 1, valor: '25.00' }),
      actualizar: vi.fn().mockResolvedValue({ idPrecio: 1, valor: '30.00' }),
      eliminar: vi.fn().mockResolvedValue(undefined),
    };
    auditService = {
      log: vi.fn().mockResolvedValue({ idLog: 50 }),
    };

    service = new IaGatewayService(
      peliculasService as PeliculasService,
      funcionesService as FuncionesService,
      ventasService as VentasService,
      pagosService as PagosService,
      promocionesService as PromocionesService,
      preciosService as PreciosService,
      auditService as AuditService,
    );
  });

  it('rechaza la ejecución si evidenciaConfirmacion es false (RF03/RF19)', async () => {
    const accion: AccionGestion = {
      tipo: 'crear_pelicula',
      datos: { titulo: 'Sin Confirmacion', duracionMin: 120 },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: false,
    });

    expect(res).toEqual({
      ok: false,
      motivo:
        'Acción rechazada: Se requiere confirmación verbal explícita del usuario antes de ejecutar mutaciones en el sistema.',
    });
    expect(peliculasService.crear).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('rechaza acciones de gestión si el usuario tiene rol cliente (RF11)', async () => {
    const accion: AccionGestion = {
      tipo: 'crear_funcion',
      datos: { idPelicula: 1, idSala: 2, fecha: '2026-10-01', horaInicio: '14:00', horaFin: '16:00' },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 3,
      rol: 'cliente',
      evidenciaConfirmacion: true,
    });

    expect(res).toEqual({
      ok: false,
      motivo: "Acción rechazada: La acción 'crear_funcion' requiere privilegios de administrador.",
    });
    expect(funcionesService.crear).not.toHaveBeenCalled();
  });

  it('ejecuta crear_pelicula con rol administrador y evidenciaConfirmacion true', async () => {
    const accion: AccionGestion = {
      tipo: 'crear_pelicula',
      datos: { titulo: 'Avatar 3', duracionMin: 180 },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
      nivelDespliegue: 'servidor_local',
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.resultado).toEqual({ idPelicula: 1, titulo: 'Inception' });
    }
    expect(peliculasService.crear).toHaveBeenCalledWith(accion.datos);
    expect(auditService.log).toHaveBeenCalledWith(9, 'ia_crear_pelicula', 'servidor_local');
  });

  it('ejecuta actualizar_pelicula correctamente', async () => {
    const accion: AccionGestion = {
      tipo: 'actualizar_pelicula',
      idPelicula: 1,
      datos: { titulo: 'Inception Editada' },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });

    expect(res.ok).toBe(true);
    expect(peliculasService.actualizar).toHaveBeenCalledWith(1, { titulo: 'Inception Editada' });
    expect(auditService.log).toHaveBeenCalledWith(9, 'ia_actualizar_pelicula', 'servidor_local');
  });

  it('ejecuta crear_funcion correctamente con rol administrador', async () => {
    const accion: AccionGestion = {
      tipo: 'crear_funcion',
      datos: { idPelicula: 1, idSala: 1, fecha: '2026-10-01', horaInicio: '18:00', horaFin: '20:00' },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });

    expect(res.ok).toBe(true);
    expect(funcionesService.crear).toHaveBeenCalledWith(accion.datos);
  });

  it('ejecuta cancelar_funcion correctamente con rol administrador', async () => {
    const accion: AccionGestion = {
      tipo: 'cancelar_funcion',
      idFuncion: 10,
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });

    expect(res.ok).toBe(true);
    expect(funcionesService.cancelar).toHaveBeenCalledWith(10);
  });

  it('permite a un usuario cliente ejecutar crear_venta e impone su idUsuario autenticado', async () => {
    const accion: AccionGestion = {
      tipo: 'crear_venta',
      datos: {
        idFuncion: 10,
        idUsuarioCliente: 999, // intento de id ajeno
        idAsientos: [1, 2],
        tipoRegistro: 'voz',
        confirmacionNoReembolso: true,
        confirmacionVerbalCheck: true,
      },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 15,
      rol: 'cliente',
      evidenciaConfirmacion: true,
    });

    expect(res.ok).toBe(true);
    expect(ventasService.crear).toHaveBeenCalledWith({
      ...accion.datos,
      idUsuarioCliente: 15,
    });
    expect(auditService.log).toHaveBeenCalledWith(15, 'ia_crear_venta', 'servidor_local');
  });

  it('permite a un usuario ejecutar crear_pago correctamente', async () => {
    const accion: AccionGestion = {
      tipo: 'crear_pago',
      datos: {
        idVenta: 100,
        metodo: 'tarjeta',
      },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 15,
      rol: 'cliente',
      evidenciaConfirmacion: true,
    });

    expect(res.ok).toBe(true);
    // Se pasa el actor (quien habla, según el token del agente) para que el cliente solo pueda pagar SUS ventas.
    expect(pagosService.crear).toHaveBeenCalledWith(accion.datos, expect.objectContaining({ idUsuario: 15 }));
    expect(auditService.log).toHaveBeenCalledWith(15, 'ia_crear_pago', 'servidor_local');
  });

  it('ejecuta eliminar_pelicula correctamente con rol administrador', async () => {
    const accion: AccionGestion = { tipo: 'eliminar_pelicula', idPelicula: 1 };

    const res = await service.ejecutar(accion, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });

    expect(res).toEqual({ ok: true, resultado: { eliminado: true } });
    expect(peliculasService.eliminar).toHaveBeenCalledWith(1);
  });

  it('rechaza crear_promocion si el rol es cliente (RF11)', async () => {
    const accion: AccionGestion = {
      tipo: 'crear_promocion',
      datos: {
        nombre: 'Promo 2x1',
        tipoDescuento: 'porcentaje',
        valor: 50,
        fechaInicio: '2026-10-01',
        fechaFin: '2026-10-31',
      },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 3,
      rol: 'cliente',
      evidenciaConfirmacion: true,
    });

    expect(res).toEqual({
      ok: false,
      motivo: "Acción rechazada: La acción 'crear_promocion' requiere privilegios de administrador.",
    });
    expect(promocionesService.crear).not.toHaveBeenCalled();
  });

  it('ejecuta crear_promocion correctamente con rol administrador', async () => {
    const accion: AccionGestion = {
      tipo: 'crear_promocion',
      datos: {
        nombre: 'Promo 2x1',
        tipoDescuento: 'porcentaje',
        valor: 50,
        fechaInicio: '2026-10-01',
        fechaFin: '2026-10-31',
      },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
      nivelDespliegue: 'servidor_local',
    });

    expect(res.ok).toBe(true);
    expect(promocionesService.crear).toHaveBeenCalledWith(accion.datos);
    expect(auditService.log).toHaveBeenCalledWith(9, 'ia_crear_promocion', 'servidor_local');
  });

  it('ejecuta actualizar_promocion y eliminar_promocion correctamente', async () => {
    const actualizar: AccionGestion = {
      tipo: 'actualizar_promocion',
      idPromocion: 1,
      datos: { activa: false },
    };
    const resActualizar = await service.ejecutar(actualizar, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });
    expect(resActualizar.ok).toBe(true);
    expect(promocionesService.actualizar).toHaveBeenCalledWith(1, { activa: false });

    const eliminar: AccionGestion = { tipo: 'eliminar_promocion', idPromocion: 1 };
    const resEliminar = await service.ejecutar(eliminar, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });
    expect(resEliminar).toEqual({ ok: true, resultado: { eliminado: true } });
    expect(promocionesService.eliminar).toHaveBeenCalledWith(1);
  });

  it('ejecuta crear_precio, actualizar_precio y eliminar_precio correctamente', async () => {
    const crear: AccionGestion = {
      tipo: 'crear_precio',
      datos: { valor: 25, vigenteDesde: '2026-10-01' },
    };
    const resCrear = await service.ejecutar(crear, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });
    expect(resCrear.ok).toBe(true);
    expect(preciosService.crear).toHaveBeenCalledWith(crear.datos);

    const actualizar: AccionGestion = {
      tipo: 'actualizar_precio',
      idPrecio: 1,
      datos: { valor: 30 },
    };
    const resActualizar = await service.ejecutar(actualizar, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });
    expect(resActualizar.ok).toBe(true);
    expect(preciosService.actualizar).toHaveBeenCalledWith(1, { valor: 30 });

    const eliminar: AccionGestion = { tipo: 'eliminar_precio', idPrecio: 1 };
    const resEliminar = await service.ejecutar(eliminar, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });
    expect(resEliminar).toEqual({ ok: true, resultado: { eliminado: true } });
    expect(preciosService.eliminar).toHaveBeenCalledWith(1);
  });

  it('captura excepciones lanzadas por los servicios subordinados y retorna ok: false con motivo', async () => {
    (peliculasService.crear as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('No se puede crear película duplicada'),
    );

    const accion: AccionGestion = {
      tipo: 'crear_pelicula',
      datos: { titulo: 'Duplicada', duracionMin: 90 },
    };

    const res = await service.ejecutar(accion, {
      idUsuario: 9,
      rol: 'administrador',
      evidenciaConfirmacion: true,
    });

    expect(res).toEqual({
      ok: false,
      motivo: 'No se puede crear película duplicada',
    });
  });
});

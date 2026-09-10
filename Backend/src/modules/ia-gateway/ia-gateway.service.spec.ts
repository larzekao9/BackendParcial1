import { IaGatewayService } from './ia-gateway.service.js';
import type { PeliculasService } from '../peliculas/peliculas.service.js';
import type { FuncionesService } from '../funciones/funciones.service.js';
import type { VentasService } from '../ventas/ventas.service.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AccionGestion } from '../../contracts/service-contracts.js';

describe('IaGatewayService (RF10)', () => {
  let peliculasService: Partial<PeliculasService>;
  let funcionesService: Partial<FuncionesService>;
  let ventasService: Partial<VentasService>;
  let auditService: Partial<AuditService>;
  let service: IaGatewayService;

  beforeEach(() => {
    peliculasService = {
      crear: vi.fn().mockResolvedValue({ idPelicula: 1, titulo: 'Inception' }),
      actualizar: vi.fn().mockResolvedValue({ idPelicula: 1, titulo: 'Inception Editada' }),
    };
    funcionesService = {
      crear: vi.fn().mockResolvedValue({ idFuncion: 10 }),
      cancelar: vi.fn().mockResolvedValue({ idFuncion: 10, estado: 'cancelada' }),
    };
    ventasService = {
      crear: vi.fn().mockResolvedValue({ idVenta: 100, estado: 'pendiente_pago' }),
    };
    auditService = {
      log: vi.fn().mockResolvedValue({ idLog: 50 }),
    };

    service = new IaGatewayService(
      peliculasService as PeliculasService,
      funcionesService as FuncionesService,
      ventasService as VentasService,
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

  it('permite a un usuario cliente ejecutar crear_venta', async () => {
    const accion: AccionGestion = {
      tipo: 'crear_venta',
      datos: {
        idFuncion: 10,
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
    expect(ventasService.crear).toHaveBeenCalledWith(accion.datos);
    expect(auditService.log).toHaveBeenCalledWith(15, 'ia_crear_venta', 'servidor_local');
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

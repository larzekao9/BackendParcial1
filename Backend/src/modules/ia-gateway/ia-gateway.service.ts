import { Injectable, Logger } from '@nestjs/common';
import type {
  AccionGestion,
  IaGatewayContract,
} from '../../contracts/service-contracts.js';
import { PeliculasService } from '../peliculas/peliculas.service.js';
import { FuncionesService } from '../funciones/funciones.service.js';
import { VentasService } from '../ventas/ventas.service.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * RF10 — Pasarela unificada de acciones de IA.
 *
 * Es el único punto de entrada que `ai-service` (FastAPI) puede invocar para
 * mutar datos en el sistema real tras la confirmación verbal explícita del usuario.
 * Re-valida server-side que:
 *  1. `evidenciaConfirmacion === true` (RF03/RF19).
 *  2. El `rol` del usuario tenga los permisos necesarios para la acción (RF11).
 *
 * Despacha a los servicios de negocio correspondientes (`PeliculasService`,
 * `FuncionesService`, `VentasService`) y registra la auditoría (RF12).
 */
@Injectable()
export class IaGatewayService implements IaGatewayContract {
  private readonly logger = new Logger(IaGatewayService.name);

  constructor(
    private readonly peliculasService: PeliculasService,
    private readonly funcionesService: FuncionesService,
    private readonly ventasService: VentasService,
    private readonly auditService: AuditService,
  ) {}

  async ejecutar(
    accion: AccionGestion,
    contexto: {
      idUsuario: number;
      rol: 'cliente' | 'administrador';
      evidenciaConfirmacion: boolean;
      nivelDespliegue?: string;
    },
  ): Promise<{ ok: true; resultado: unknown } | { ok: false; motivo: string }> {
    // 1. Re-validación de confirmación verbal (RF03 / RF19)
    if (!contexto.evidenciaConfirmacion) {
      return {
        ok: false,
        motivo:
          'Acción rechazada: Se requiere confirmación verbal explícita del usuario antes de ejecutar mutaciones en el sistema.',
      };
    }

    // 2. Re-validación de Permisos de Rol (RF11)
    const accionesSoloAdmin: AccionGestion['tipo'][] = [
      'crear_pelicula',
      'actualizar_pelicula',
      'crear_funcion',
      'cancelar_funcion',
    ];

    if (accionesSoloAdmin.includes(accion.tipo) && contexto.rol !== 'administrador') {
      return {
        ok: false,
        motivo: `Acción rechazada: La acción '${accion.tipo}' requiere privilegios de administrador.`,
      };
    }

    // 3. Despacho y ejecución de la acción
    try {
      let resultado: unknown;

      switch (accion.tipo) {
        case 'crear_pelicula': {
          resultado = await this.peliculasService.crear(accion.datos);
          break;
        }
        case 'actualizar_pelicula': {
          resultado = await this.peliculasService.actualizar(
            accion.idPelicula,
            accion.datos,
          );
          break;
        }
        case 'crear_funcion': {
          resultado = await this.funcionesService.crear(accion.datos);
          break;
        }
        case 'cancelar_funcion': {
          resultado = await this.funcionesService.cancelar(accion.idFuncion);
          break;
        }
        case 'crear_venta': {
          resultado = await this.ventasService.crear(accion.datos);
          break;
        }
        default: {
          const accionDesconocida = (accion as { tipo: string }).tipo;
          return {
            ok: false,
            motivo: `Tipo de acción no soportado: '${accionDesconocida}'.`,
          };
        }
      }

      // 4. Registro de auditoría (RF12)
      try {
        await this.auditService.log(
          contexto.idUsuario,
          `ia_${accion.tipo}`,
          contexto.nivelDespliegue ?? 'servidor_local',
        );
      } catch (err) {
        this.logger.warn(
          `No se pudo registrar la auditoría para ia_${accion.tipo}`,
          err,
        );
      }

      return { ok: true, resultado };
    } catch (error: unknown) {
      const errorObj = error as { message?: string };
      const mensaje = errorObj.message ?? 'Ocurrió un error al procesar la acción.';
      return { ok: false, motivo: mensaje };
    }
  }
}

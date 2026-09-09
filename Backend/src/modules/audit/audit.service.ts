import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogAccion } from '../../database/entities/log-accion.entity.js';

/** Filtros opcionales de `GET /audit/log-acciones` (RF12). */
export interface FiltrosConsultaLog {
  /** Filtra por `id_usuario` exacto. */
  usuarioId?: number;
  /** Filtra por la etiqueta de acción exacta (ej. 'crear_pelicula'). */
  accion?: string;
  /** Fecha ISO (`YYYY-MM-DD`) desde la que se incluyen filas. */
  desde?: string;
  /** Fecha ISO (`YYYY-MM-DD`) hasta la que se incluyen filas. */
  hasta?: string;
  /** Tope de filas devueltas (default 200). */
  limite?: number;
}

/**
 * RF12 — trazabilidad de las acciones de gestión. Dominio de Roly.
 *
 * `log_acciones` es de SOLO inserción (ver log-accion.entity.ts): acá no hay
 * `actualizar` ni `eliminar`, y `log()` no busca actualizar una fila existente.
 *
 * Quién llama a `log()`: normalmente `AuditInterceptor` (vía el decorador
 * `@Audit(...)` en los controllers), que le pasa `id_usuario` desde el JWT y
 * `nivel_despliegue` desde la config. Cualquier servicio que mute una tabla de
 * gestión también puede inyectar este servicio y llamar a `log()` directamente
 * (por ej. los módulos de Luis Blanco cuando existan), con la condición de
 * conocer el `idUsuario` de quien ejecuta la acción.
 *
 * `nivelDespliegue` es opcional (la columna es nullable): se deja en null
 * cuando el origen de la mutación no está asociado a un perfil de RF15.
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(LogAccion)
    private readonly logAccionesRepo: Repository<LogAccion>,
  ) {}

  /**
   * Registra una acción en `log_acciones`. Inserta; nunca actualiza.
   */
  async log(
    idUsuario: number,
    accion: string,
    nivelDespliegue?: string | null,
  ): Promise<LogAccion> {
    const registro = this.logAccionesRepo.create({
      idUsuario,
      accion,
      nivelDespliegue: nivelDespliegue ?? null,
    });
    return this.logAccionesRepo.save(registro);
  }

  /**
   * `GET /audit/log-acciones` — histórico ordenado de más reciente a más
   * antiguo, con filtros opcionales para QA y el panel admin.
   *
   * Devuelve la lista plana (sin el usuario expandido) ordenada por
   * `fecha_hora DESC, id_log DESC` — para un mismo momento exacto el id
   * más alto es el registro más reciente.
   */
  async listar(filtros: FiltrosConsultaLog = {}): Promise<LogAccion[]> {
    const query = this.logAccionesRepo
      .createQueryBuilder('logAccion')
      .orderBy('logAccion.fechaHora', 'DESC')
      .addOrderBy('logAccion.idLog', 'DESC');

    if (filtros.usuarioId !== undefined) {
      query.andWhere('logAccion.idUsuario = :usuarioId', {
        usuarioId: filtros.usuarioId,
      });
    }
    if (filtros.accion !== undefined) {
      query.andWhere('logAccion.accion = :accion', { accion: filtros.accion });
    }
    if (filtros.desde !== undefined) {
      query.andWhere('logAccion.fechaHora >= :desde', { desde: filtros.desde });
    }
    if (filtros.hasta !== undefined) {
      query.andWhere('logAccion.fechaHora <= :hasta', { hasta: filtros.hasta });
    }
    query.take(filtros.limite ?? 200);

    return query.getMany();
  }

  /**
   * Convención del resto de los módulos: `buscarPorId` lanza
   * `NotFoundException` cuando no existe. Útil para el panel admin si algún
   * día quiere abrir un registro puntual.
   */
  async buscarPorId(idLog: number): Promise<LogAccion> {
    const registro = await this.logAccionesRepo.findOne({ where: { idLog } });
    if (!registro) {
      throw new NotFoundException(`No existe un registro de acción con id ${idLog}.`);
    }
    return registro;
  }
}
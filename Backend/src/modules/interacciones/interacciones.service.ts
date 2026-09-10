import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InteraccionIA } from '../../database/entities/interaccion-ia.entity.js';
import type { CrearInteraccionDto } from './dto/crear-interaccion.dto.js';

export interface FiltrosConsultaInteraccion {
  idUsuario?: number;
  limite?: number;
}

/**
 * RF18 / CU08 — Servicio de trazabilidad de interacciones de IA y UI generativa.
 *
 * Registra en `interacciones_ia` los widgets generados, intenciones detectadas
 * y texto transcrito por el agente de voz/texto (`ai-service`).
 */
@Injectable()
export class InteraccionesService {
  constructor(
    @InjectRepository(InteraccionIA)
    private readonly interaccionesRepo: Repository<InteraccionIA>,
  ) {}

  /**
   * Registra una nueva interacción producida por el agente de IA.
   */
  async registrar(dto: CrearInteraccionDto): Promise<InteraccionIA> {
    const registro = this.interaccionesRepo.create({
      idUsuario: dto.idUsuario,
      idFuncion: dto.idFuncion ?? null,
      intencionDetectada: dto.intencionDetectada,
      widgetGenerado: dto.widgetGenerado ?? null,
      textoTranscrito: dto.textoTranscrito ?? null,
    });
    return this.interaccionesRepo.save(registro);
  }

  /**
   * Consulta el historial de interacciones ordenado por fecha de forma descendente.
   */
  async listar(filtros: FiltrosConsultaInteraccion = {}): Promise<InteraccionIA[]> {
    const query = this.interaccionesRepo
      .createQueryBuilder('interaccion')
      .orderBy('interaccion.fechaHora', 'DESC')
      .addOrderBy('interaccion.idInteraccion', 'DESC');

    if (filtros.idUsuario !== undefined) {
      query.andWhere('interaccion.idUsuario = :idUsuario', {
        idUsuario: filtros.idUsuario,
      });
    }

    query.take(filtros.limite ?? 100);

    return query.getMany();
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Sala } from '../../database/entities/sala.entity.js';
import { Asiento } from '../../database/entities/asiento.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import type { CrearSalaDto } from './dto/crear-sala.dto.js';
import type { ActualizarSalaDto } from './dto/actualizar-sala.dto.js';

/**
 * Fase 2 — módulo `salas` + `asientos` (dominio de Luisa Ángel).
 *
 * `eliminar` es un DELETE físico real: a diferencia de `peliculas`, la
 * tabla `salas` no tiene columna `estado`, así que no hay soft delete
 * posible acá. Tanto `asientos.id_sala` como `funciones.id_sala` tienen FK
 * con `onDelete: 'RESTRICT'` (ver asiento.entity.ts y funcion.entity.ts), lo
 * que impone una regla más estricta que la redacción habitual de "no borrar
 * con funciones futuras": si existe CUALQUIER fila en `funciones` que
 * referencie la sala (pasada, cancelada o futura), Postgres jamás va a
 * dejar borrar los asientos (porque `disponibilidad_asiento` los referencia
 * a través de esa función), y por lo tanto tampoco la sala. La única forma
 * de que `eliminar` tenga éxito es que la sala nunca haya tenido — o ya no
 * tenga registrada — ninguna función. Por eso el chequeo de abajo usa
 * `count()` sin filtro de fecha ni de estado.
 *
 * `buscarPorId` lanza `NotFoundException` cuando no existe, misma
 * convención que `PeliculasService.buscarPorId` (Fase 1): tanto el
 * controller (GET /:id → 404) como `actualizar`/`eliminar`/`listarAsientos`
 * reutilizan esta validación sin duplicar el chequeo.
 */
@Injectable()
export class SalasService {
  private static readonly ASIENTOS_POR_FILA_DEFAULT = 10;
  private static readonly TIPO_ASIENTO_DEFAULT = 'normal' as const;

  constructor(
    @InjectRepository(Sala)
    private readonly salasRepo: Repository<Sala>,
    @InjectRepository(Asiento)
    private readonly asientosRepo: Repository<Asiento>,
    @InjectRepository(Funcion)
    private readonly funcionesRepo: Repository<Funcion>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async crear(dto: CrearSalaDto): Promise<Sala> {
    const asientosPorFila = dto.asientosPorFila ?? SalasService.ASIENTOS_POR_FILA_DEFAULT;

    return this.dataSource.transaction(async (manager) => {
      const sala = manager.create(Sala, {
        nombre: dto.nombre,
        capacidad: dto.capacidad,
        tipo: dto.tipo ?? null,
        ...(dto.tiempoLimpiezaMin !== undefined
          ? { tiempoLimpiezaMin: dto.tiempoLimpiezaMin }
          : {}),
      });
      const salaGuardada = await manager.save(Sala, sala);

      const asientos = this.generarAsientos(
        salaGuardada.idSala,
        dto.capacidad,
        asientosPorFila,
      );
      if (asientos.length > 0) {
        await manager.save(Asiento, asientos);
      }

      return salaGuardada;
    });
  }

  async actualizar(idSala: number, dto: ActualizarSalaDto): Promise<Sala> {
    const sala = await this.buscarPorId(idSala);
    // OJO: no se puede hacer `Object.assign(sala, dto)` directo. Con
    // `target: ES2023` (ver tsconfig.json), los campos de clase sin
    // inicializador (`tipo?: string;`) se definen como propiedad propia con
    // valor `undefined` apenas se construye el DTO (semántica de "class
    // fields" de JS), incluso si el campo no vino en el body del PATCH.
    // `Object.assign` copia también esas claves `undefined`, así que un
    // PATCH que solo manda `{ nombre }` terminaría pisando `tipo` y
    // `tiempoLimpiezaMin` en el objeto devuelto (se vio en pruebas manuales:
    // la respuesta mostraba `tipo: null` después de un PATCH que no tocaba
    // `tipo`). El UPDATE en Postgres no se ve afectado porque TypeORM ya
    // ignora las columnas `undefined` al armar el SQL, pero el objeto que
    // se devuelve al cliente sí quedaba corrupto. Por eso acá se filtran los
    // `undefined` antes de mezclar.
    const cambios = Object.fromEntries(
      Object.entries(dto).filter(([, valor]) => valor !== undefined),
    );
    Object.assign(sala, cambios);
    return this.salasRepo.save(sala);
  }

  async eliminar(idSala: number): Promise<void> {
    await this.buscarPorId(idSala);
    await this.rechazarSiTieneFunciones(idSala);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(Asiento, { idSala });
      await manager.delete(Sala, { idSala });
    });
  }

  async buscarPorId(idSala: number): Promise<Sala> {
    const sala = await this.salasRepo.findOne({ where: { idSala } });
    if (!sala) {
      throw new NotFoundException(`No existe una sala con id ${idSala}.`);
    }
    return sala;
  }

  async listar(): Promise<Sala[]> {
    return this.salasRepo.find({ order: { idSala: 'ASC' } });
  }

  async listarAsientos(idSala: number): Promise<Asiento[]> {
    await this.buscarPorId(idSala);
    return this.asientosRepo.find({
      where: { idSala },
      order: { fila: 'ASC', numero: 'ASC' },
    });
  }

  /**
   * Reparte `capacidad` en filas de `asientosPorFila` asientos cada una:
   * fila 'A', 'B', 'C'... (`String.fromCharCode(65 + i)`), `numero`
   * correlativo de 1 a N DENTRO de cada fila (no correlativo global). La
   * última fila se completa con el resto si `capacidad` no es múltiplo
   * exacto de `asientosPorFila` (ej. capacidad=25, asientosPorFila=10 →
   * A:10, B:10, C:5).
   */
  private generarAsientos(
    idSala: number,
    capacidad: number,
    asientosPorFila: number,
  ): Partial<Asiento>[] {
    const asientos: Partial<Asiento>[] = [];
    const totalFilas = Math.ceil(capacidad / asientosPorFila);
    let restantes = capacidad;

    for (let i = 0; i < totalFilas; i++) {
      const fila = String.fromCharCode(65 + i);
      const cantidadEnFila = Math.min(asientosPorFila, restantes);

      for (let numero = 1; numero <= cantidadEnFila; numero++) {
        asientos.push({
          idSala,
          fila,
          numero,
          tipo: SalasService.TIPO_ASIENTO_DEFAULT,
        });
      }

      restantes -= cantidadEnFila;
    }

    return asientos;
  }

  private async rechazarSiTieneFunciones(idSala: number): Promise<void> {
    const cantidad = await this.funcionesRepo.count({ where: { idSala } });
    if (cantidad > 0) {
      throw new ConflictException(
        'No se puede eliminar la sala: tiene funciones asociadas (pasadas, canceladas o futuras).',
      );
    }
  }
}

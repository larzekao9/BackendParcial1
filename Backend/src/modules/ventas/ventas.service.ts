import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Venta } from '../../database/entities/venta.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { PreciosService } from '../precios/precios.service.js';
import { PromocionesService } from '../promociones/promociones.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { VentasContract, CrearVentaInput } from '../../contracts/service-contracts.js';

/**
 * CU02 — el flujo completo de compra. Dominio de Luis Blanco. Sigue al pie los 7 pasos
 * descriptos en plan-backend.md, sección "Luis Blanco — Funciones, ventas, pagos y
 * reportes":
 *
 * 1. Rechaza ANTES de abrir transacción si falta `confirmacionNoReembolso` (RF03) o,
 *    cuando `tipoRegistro === 'voz'`, si falta `confirmacionVerbalCheck` (RF19) — nunca
 *    se confía en que el caller ya validó esto.
 * 2. `subtotal` sale del precio de la FUNCIÓN (no de la butaca — ver "Reversión: tipo de
 *    asiento por sala, no por butaca" en docs/db-schema-notes.md), multiplicado por la
 *    cantidad de asientos. **Corrección (2026-09-10):** se usa `funcion.idPrecio` cuando
 *    la función tiene uno asignado (`PreciosService.buscarPorId`) — es el precio que el
 *    admin eligió al crear esa función específica (ver `FuncionForm.tsx` del frontend).
 *    Solo si `idPrecio` es `null` se cae a `PreciosService.getVigente(funcion.fecha)` como
 *    respaldo. Antes SIEMPRE usaba `getVigente`, ignorando `idPrecio` — con más de un
 *    precio vigente simultáneo (ej. tarifa normal + VIP) eso cobraba el precio equivocado
 *    a funciones que sí tenían uno específico asignado (bug real, encontrado en prueba
 *    manual con 2 precios reales cargados).
 * 3. `descuentoAplicado` sale de `PromocionesService.getAplicable(idFuncion)`, si hay una
 *    promoción activa para esa función.
 * 4. (ver paso 1, va primero por ser una validación barata).
 * 5. Marcar asientos como 'ocupado' + insertar `venta` + `detalle_venta_entradas` corre
 *    en UNA transacción de `DataSource` (mismo patrón que `SalasService.eliminar`).
 * 6. Dulcería (CU09/RF20) queda fuera de este alcance — no hay módulo `dulceria` todavía.
 * 7. La venta nace en `estado='pendiente_pago'` — pasa a `'pagada'` cuando el módulo
 *    `pagos` (todavía sin construir) confirme el cobro, nunca acá.
 *
 * CONCURRENCIA (dos compras simultáneas del mismo asiento): el paso 5 marca los asientos
 * como ocupados con un `UPDATE ... WHERE estado = 'disponible'` CONDICIONAL — nunca un
 * SELECT para chequear disponibilidad seguido de un UPDATE aparte, que tendría una
 * ventana de carrera entre el SELECT y el UPDATE. Se compara `affected` contra la
 * cantidad de asientos pedidos: si no coinciden (alguno ya estaba 'ocupado', o no
 * pertenece a esta función), se lanza `ConflictException` y la transacción hace
 * rollback — ver test de concurrencia en `ventas.service.concurrencia.integration.spec.ts`.
 *
 * `idUsuarioActor` (segundo parámetro, no forma parte de `VentasContract` — parámetro
 * extra opcional, compatible con la interfaz) es el `idUsuario` del JWT de quien ejecuta
 * la acción, para `AuditService.log(...)`. Se llama a mano DENTRO de la transacción en vez
 * de usar `@Audit(...)` en el controller porque recién ahí se conoce el `idVenta` recién
 * creado — `POST /ventas` no tiene `:id` en la ruta, así que el interceptor global no
 * podría anexarlo a la etiqueta como sí hace con `actualizar_x:5`.
 */
@Injectable()
export class VentasService implements VentasContract {
  constructor(
    @InjectRepository(Venta)
    private readonly ventasRepo: Repository<Venta>,
    @InjectRepository(Funcion)
    private readonly funcionesRepo: Repository<Funcion>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly preciosService: PreciosService,
    private readonly promocionesService: PromocionesService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async crear(input: CrearVentaInput, idUsuarioActor?: number): Promise<Venta> {
    if (input.confirmacionNoReembolso !== true) {
      throw new BadRequestException(
        'confirmacionNoReembolso debe ser true antes de registrar la venta (RF03).',
      );
    }
    if (input.tipoRegistro === 'voz' && input.confirmacionVerbalCheck !== true) {
      throw new BadRequestException(
        'confirmacionVerbalCheck debe ser true cuando tipoRegistro es "voz" (RF19).',
      );
    }

    const idAsientosUnicos = Array.from(new Set(input.idAsientos));

    const funcion = await this.funcionesRepo.findOne({ where: { idFuncion: input.idFuncion } });
    if (!funcion) {
      throw new NotFoundException(`No existe una función con id ${input.idFuncion}.`);
    }

    const precio = funcion.idPrecio
      ? await this.preciosService.buscarPorId(funcion.idPrecio)
      : await this.preciosService.getVigente(new Date(funcion.fecha));
    const promocion = await this.promocionesService.getAplicable(input.idFuncion);

    const precioUnitarioNum = Number(precio.valor);
    const subtotalNum = precioUnitarioNum * idAsientosUnicos.length;
    const descuentoNum = !promocion
      ? 0
      : promocion.tipoDescuento === 'porcentaje'
        ? subtotalNum * (Number(promocion.valor) / 100)
        // monto_fijo nunca deja el total negativo, aunque el descuento nominal supere el subtotal.
        : Math.min(Number(promocion.valor), subtotalNum);
    const totalNum = subtotalNum - descuentoNum;

    return this.dataSource.transaction(async (manager) => {
      const resultado = await manager.update(
        DisponibilidadAsiento,
        { idFuncion: input.idFuncion, idAsiento: In(idAsientosUnicos), estado: 'disponible' },
        { estado: 'ocupado' },
      );

      if ((resultado.affected ?? 0) !== idAsientosUnicos.length) {
        throw new ConflictException(
          'Uno o más asientos ya no están disponibles para esta función (fueron vendidos o no existen para esta función).',
        );
      }

      const venta = await manager.save(Venta, {
        idUsuarioCliente: input.idUsuarioCliente ?? null,
        idFuncion: input.idFuncion,
        idPromocion: promocion?.idPromocion ?? null,
        subtotal: subtotalNum.toFixed(2),
        descuentoAplicado: descuentoNum.toFixed(2),
        total: totalNum.toFixed(2),
        confirmacionNoReembolso: input.confirmacionNoReembolso,
        confirmacionVerbalCheck: input.confirmacionVerbalCheck,
        tipoRegistro: input.tipoRegistro,
        estado: 'pendiente_pago',
      });

      await manager.save(
        DetalleVentaEntrada,
        idAsientosUnicos.map((idAsiento) => ({
          idVenta: venta.idVenta,
          idAsiento,
          precioUnitario: precio.valor,
        })),
      );

      if (idUsuarioActor !== undefined) {
        const nivelDespliegue = this.configService.get<string>('nivelDespliegue') ?? null;
        await this.auditService.log(idUsuarioActor, `crear_venta:${venta.idVenta}`, nivelDespliegue);
      }

      return venta;
    });
  }

  async buscarPorId(idVenta: number): Promise<Venta> {
    const venta = await this.ventasRepo.findOne({ where: { idVenta } });
    if (!venta) {
      throw new NotFoundException(`No existe una venta con id ${idVenta}.`);
    }
    return venta;
  }

  /** `idUsuarioCliente` filtra a las ventas de un cliente puntual — lo usa el controller para que un `cliente` solo vea las propias (RF11), nunca las de otro. */
  async listar(idUsuarioCliente?: number): Promise<Venta[]> {
    return this.ventasRepo.find({
      where: idUsuarioCliente !== undefined ? { idUsuarioCliente } : {},
      order: { fechaHora: 'DESC' },
    });
  }
}

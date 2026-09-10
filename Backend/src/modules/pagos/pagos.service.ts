import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Venta } from '../../database/entities/venta.entity.js';
import { Pago } from '../../database/entities/pago.entity.js';
import type { PagosContract, CrearPagoInput } from '../../contracts/service-contracts.js';

/**
 * RF04 — pago controlado por el propio sistema, sin pasarela externa (Stripe/QR quedan
 * para más adelante — la tabla `pagos` ya tiene las columnas, no se tocan acá). Dominio
 * de Luis Blanco.
 *
 * El "kiosco" confirma el cobro al instante: no hay estado intermedio 'procesando' desde
 * la API — se inserta el `Pago` directo en `estado='exitoso'` y la `Venta` pasa a
 * `'pagada'` en la misma transacción. Mismo patrón de `dataSource.transaction` que
 * `VentasService.crear`.
 */
@Injectable()
export class PagosService implements PagosContract {
  constructor(
    @InjectRepository(Venta)
    private readonly ventasRepo: Repository<Venta>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async crear(input: CrearPagoInput): Promise<Venta> {
    if (input.metodo !== 'efectivo' && input.metodo !== 'tarjeta') {
      throw new BadRequestException(
        `El método de pago "${input.metodo}" todavía no está implementado — solo "efectivo" y "tarjeta" están disponibles.`,
      );
    }

    const venta = await this.ventasRepo.findOne({ where: { idVenta: input.idVenta } });
    if (!venta) {
      throw new NotFoundException(`No existe una venta con id ${input.idVenta}.`);
    }
    if (venta.estado !== 'pendiente_pago') {
      throw new ConflictException(
        `La venta ${venta.idVenta} no está pendiente de pago (estado actual: ${venta.estado}).`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const pago = await manager.save(Pago, {
        idVenta: venta.idVenta,
        monto: venta.total,
        metodoPago: input.metodo,
        estado: 'exitoso',
        fechaConfirmacion: new Date(),
      });

      await manager.update(Venta, { idVenta: venta.idVenta }, {
        estado: 'pagada',
        metodoPagoElegido: input.metodo,
        fechaPago: new Date(),
        idPagoActivo: pago.idPago,
      });

      const ventaPagada = await manager.findOne(Venta, { where: { idVenta: venta.idVenta } });
      return ventaPagada!;
    });
  }
}

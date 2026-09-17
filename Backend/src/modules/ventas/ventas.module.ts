import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venta } from '../../database/entities/venta.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import { DetalleVentaDulceria } from '../../database/entities/detalle-venta-dulceria.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { PreciosModule } from '../precios/precios.module.js';
import { PromocionesModule } from '../promociones/promociones.module.js';
import { DulceriaModule } from '../dulceria/dulceria.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { VentasService } from './ventas.service.js';
import { VentasController } from './ventas.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Venta,
      DetalleVentaEntrada,
      DetalleVentaDulceria,
      DisponibilidadAsiento,
      Funcion,
    ]),
    // Contrato de Fase 0: VentasService.crear consume PreciosService.getVigente(fecha) y
    // PromocionesService.getAplicable(idFuncion) directamente (ver ventas.service.ts).
    PreciosModule,
    PromocionesModule,
    // DulceriaService.buscarProductoPorId(idProducto) — agregado 2026-09-16 para que
    // VentasService.crear pueda validar/preciar el carrito de dulcería (ver ventas.service.ts).
    DulceriaModule,
    // AuditService.log(...) se llama a mano dentro de la transacción de VentasService.crear
    // (no hay @Audit de controller — ver comentario en ventas.service.ts).
    AuditModule,
  ],
  controllers: [VentasController],
  providers: [VentasService],
  exports: [VentasService],
})
export class VentasModule {}

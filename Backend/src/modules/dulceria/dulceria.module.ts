import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoriaDulceria } from '../../database/entities/categoria-dulceria.entity.js';
import { ProductoDulceria } from '../../database/entities/producto-dulceria.entity.js';
import { DulceriaService } from './dulceria.service.js';
import {
  DulceriaCategoriasController,
  DulceriaProductosController,
} from './dulceria.controller.js';

/**
 * CU09/RF20 — no hace falta registrar `DetalleVentaDulceria` acá: es
 * dominio de Luis Blanco (`VentasService` la usa directo dentro de su
 * propia transacción, ver comentario en detalle-venta-dulceria.entity.ts).
 * Tampoco hace falta importar `AuditModule`: el interceptor de auditoría
 * está registrado global en `AuditModule` (`APP_INTERCEPTOR`) y actúa solo
 * con `@Audit(...)` en el handler, sin que este módulo dependa de él.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CategoriaDulceria, ProductoDulceria])],
  controllers: [DulceriaCategoriasController, DulceriaProductosController],
  providers: [DulceriaService],
  // Luis Blanco importa DulceriaModule en VentasModule para inyectar
  // DulceriaService y llamar getDisponibles (contrato ProductoDulceriaContract).
  exports: [DulceriaService],
})
export class DulceriaModule {}

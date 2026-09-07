import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Promocion } from '../../database/entities/promocion.entity.js';
import { PromocionFuncion } from '../../database/entities/promocion-funcion.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { Venta } from '../../database/entities/venta.entity.js';
import { PromocionesService } from './promociones.service.js';
import { PromocionesController } from './promociones.controller.js';

@Module({
  // Se registran también los repos de `Funcion` y `Venta` (no solo las
  // entidades propias del módulo): `asociarAFuncion` necesita validar que
  // la función exista, y `eliminar` necesita chequear que ninguna venta ya
  // haya usado la promoción (ver promociones.service.ts). Ambas son
  // dominio de Luis Blanco, acá solo se usan de lectura.
  imports: [TypeOrmModule.forFeature([Promocion, PromocionFuncion, Funcion, Venta])],
  controllers: [PromocionesController],
  providers: [PromocionesService],
  // Imprescindible: Luis Blanco importa PromocionesModule en VentasModule
  // para inyectar PromocionesService (getAplicable es contrato de Fase 0).
  exports: [PromocionesService],
})
export class PromocionesModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Precio } from '../../database/entities/precio.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { PreciosService } from './precios.service.js';
import { PreciosController } from './precios.controller.js';

@Module({
  // También se registra el repo de `Funcion` (dominio de Luis Blanco, solo
  // lectura acá): `eliminar` necesita chequear que ninguna función
  // referencie el precio antes de borrarlo (ver precios.service.ts, la FK
  // real es NO ACTION, no SET NULL).
  imports: [TypeOrmModule.forFeature([Precio, Funcion])],
  controllers: [PreciosController],
  providers: [PreciosService],
  // Imprescindible: Luis Blanco importa PreciosModule en VentasModule para
  // inyectar PreciosService (getVigente es contrato de Fase 0).
  exports: [PreciosService],
})
export class PreciosModule {}

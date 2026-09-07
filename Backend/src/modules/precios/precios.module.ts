import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Precio } from '../../database/entities/precio.entity.js';
import { PreciosService } from './precios.service.js';
import { PreciosController } from './precios.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Precio])],
  controllers: [PreciosController],
  providers: [PreciosService],
  // Imprescindible: Luis Blanco importa PreciosModule en VentasModule para
  // inyectar PreciosService (getVigente es contrato de Fase 0).
  exports: [PreciosService],
})
export class PreciosModule {}

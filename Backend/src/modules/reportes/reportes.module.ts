import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venta } from '../../database/entities/venta.entity.js';
import { DetalleVentaEntrada } from '../../database/entities/detalle-venta-entrada.entity.js';
import { ReportesService } from './reportes.service.js';
import { ReportesController } from './reportes.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Venta, DetalleVentaEntrada])],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}

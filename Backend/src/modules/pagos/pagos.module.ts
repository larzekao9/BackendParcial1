import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venta } from '../../database/entities/venta.entity.js';
import { Pago } from '../../database/entities/pago.entity.js';
import { PagosService } from './pagos.service.js';
import { PagosController } from './pagos.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Venta, Pago])],
  controllers: [PagosController],
  providers: [PagosService],
  exports: [PagosService],
})
export class PagosModule {}

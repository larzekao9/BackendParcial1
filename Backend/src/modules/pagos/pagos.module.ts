import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venta } from '../../database/entities/venta.entity.js';
import { Pago } from '../../database/entities/pago.entity.js';
import { PagosService } from './pagos.service.js';
import { PagosController } from './pagos.controller.js';
import { StripeService } from './stripe.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Venta, Pago])],
  controllers: [PagosController],
  providers: [PagosService, StripeService],
  exports: [PagosService],
})
export class PagosModule {}

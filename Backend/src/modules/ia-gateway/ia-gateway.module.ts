import { Module } from '@nestjs/common';
import { PeliculasModule } from '../peliculas/peliculas.module.js';
import { FuncionesModule } from '../funciones/funciones.module.js';
import { VentasModule } from '../ventas/ventas.module.js';
import { PagosModule } from '../pagos/pagos.module.js';
import { PromocionesModule } from '../promociones/promociones.module.js';
import { PreciosModule } from '../precios/precios.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IaGatewayService } from './ia-gateway.service.js';
import { IaGatewayController } from './ia-gateway.controller.js';

@Module({
  imports: [
    PeliculasModule,
    FuncionesModule,
    VentasModule,
    PagosModule,
    PromocionesModule,
    PreciosModule,
    AuditModule,
  ],
  controllers: [IaGatewayController],
  providers: [IaGatewayService],
  exports: [IaGatewayService],
})
export class IaGatewayModule {}

import { Module } from '@nestjs/common';
import { PeliculasModule } from '../peliculas/peliculas.module.js';
import { FuncionesModule } from '../funciones/funciones.module.js';
import { VentasModule } from '../ventas/ventas.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IaGatewayService } from './ia-gateway.service.js';
import { IaGatewayController } from './ia-gateway.controller.js';

@Module({
  imports: [
    PeliculasModule,
    FuncionesModule,
    VentasModule,
    AuditModule,
  ],
  controllers: [IaGatewayController],
  providers: [IaGatewayService],
  exports: [IaGatewayService],
})
export class IaGatewayModule {}

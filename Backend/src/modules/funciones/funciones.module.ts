import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { DisponibilidadAsiento } from '../../database/entities/disponibilidad-asiento.entity.js';
import { FuncionesService } from './funciones.service.js';
import { FuncionesController } from './funciones.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Funcion, DisponibilidadAsiento])],
  controllers: [FuncionesController],
  providers: [FuncionesService],
  // Imprescindible: VentasModule importa FuncionesModule para inyectar FuncionesService
  // (buscarPorId, para leer fecha/idPrecio de la función al calcular una venta).
  exports: [FuncionesService],
})
export class FuncionesModule {}

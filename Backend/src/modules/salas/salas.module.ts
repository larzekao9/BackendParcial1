import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sala } from '../../database/entities/sala.entity.js';
import { Asiento } from '../../database/entities/asiento.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { SalasService } from './salas.service.js';
import { SalasController } from './salas.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Sala, Asiento, Funcion])],
  controllers: [SalasController],
  providers: [SalasService],
  exports: [SalasService],
})
export class SalasModule {}

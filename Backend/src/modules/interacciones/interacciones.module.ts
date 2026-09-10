import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InteraccionIA } from '../../database/entities/interaccion-ia.entity.js';
import { InteraccionesService } from './interacciones.service.js';
import { InteraccionesController } from './interacciones.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([InteraccionIA])],
  controllers: [InteraccionesController],
  providers: [InteraccionesService],
  exports: [InteraccionesService],
})
export class InteraccionesModule {}

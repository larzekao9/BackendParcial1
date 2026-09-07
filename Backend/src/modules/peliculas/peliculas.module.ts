import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pelicula } from '../../database/entities/pelicula.entity.js';
import { Funcion } from '../../database/entities/funcion.entity.js';
import { PeliculasService } from './peliculas.service.js';
import { PeliculasController } from './peliculas.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Pelicula, Funcion])],
  controllers: [PeliculasController],
  providers: [PeliculasService],
  exports: [PeliculasService],
})
export class PeliculasModule {}

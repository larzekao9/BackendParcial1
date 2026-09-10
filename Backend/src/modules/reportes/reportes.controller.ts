import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { ReportesService } from './reportes.service.js';
import { RangoFechasDto } from './dto/rango-fechas.dto.js';

/** RF08/CU05 — solo `administrador`, sin excepción (son datos de ventas del negocio). */
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Roles('administrador')
  @Get('ventas')
  resumenVentas(@Query() filtro: RangoFechasDto) {
    return this.reportesService.resumenVentas(filtro);
  }

  @Roles('administrador')
  @Get('por-pelicula')
  porPelicula(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porPelicula(filtro);
  }

  @Roles('administrador')
  @Get('por-funcion')
  porFuncion(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porFuncion(filtro);
  }
}

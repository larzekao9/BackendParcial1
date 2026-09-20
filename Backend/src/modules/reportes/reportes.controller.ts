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
  @Get('dashboard')
  dashboard(@Query() filtro: RangoFechasDto) {
    return this.reportesService.dashboard(filtro);
  }

  @Roles('administrador')
  @Get('por-pelicula')
  porPelicula(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porPelicula(filtro);
  }

  @Roles('administrador')
  @Get('por-pelicula/paginado')
  porPeliculaPaginado(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porPeliculaPaginado(filtro);
  }

  @Roles('administrador')
  @Get('por-funcion')
  porFuncion(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porFuncion(filtro);
  }

  @Roles('administrador')
  @Get('por-funcion/paginado')
  porFuncionPaginado(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porFuncionPaginado(filtro);
  }

  @Roles('administrador')
  @Get('por-producto')
  porProducto(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porProducto(filtro);
  }

  @Roles('administrador')
  @Get('por-producto/paginado')
  porProductoPaginado(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porProductoPaginado(filtro);
  }

  @Roles('administrador')
  @Get('serie-temporal')
  serieTemporal(@Query() filtro: RangoFechasDto) {
    return this.reportesService.serieTemporal(filtro);
  }

  @Roles('administrador')
  @Get('por-metodo-pago')
  porMetodoPago(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porMetodoPago(filtro);
  }

  @Roles('administrador')
  @Get('por-promocion')
  porPromocion(@Query() filtro: RangoFechasDto) {
    return this.reportesService.porPromocion(filtro);
  }
}

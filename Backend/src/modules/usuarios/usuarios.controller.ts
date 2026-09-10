import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { Audit } from '../../shared/decorators/audit.decorator.js';
import { UsuariosService } from './usuarios.service.js';
import { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';

/**
 * Controller de gestión de usuarios.
 * Restringido exclusivamente al rol `administrador` (RF11).
 * Registra automáticamente auditoría para operaciones mutativas (`@Audit`, RF12).
 */
@Controller('usuarios')
@Roles('administrador')
export class UsuariosController {
  constructor(private readonly usuariosService: UsuariosService) {}

  @Get()
  listar() {
    return this.usuariosService.listar();
  }

  @Get(':id')
  buscarPorId(@Param('id', ParseIntPipe) id: number) {
    return this.usuariosService.buscarPorId(id);
  }

  @Audit('crear_usuario')
  @Post()
  crear(@Body() dto: CrearUsuarioDto) {
    return this.usuariosService.crear(dto);
  }

  @Audit('actualizar_usuario')
  @Patch(':id')
  actualizar(@Param('id', ParseIntPipe) id: number, @Body() dto: ActualizarUsuarioDto) {
    return this.usuariosService.actualizar(id, dto);
  }

  @Audit('eliminar_usuario')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async eliminar(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.usuariosService.eliminar(id);
  }
}

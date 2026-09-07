import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';

/**
 * Login simplificado — decisión de Fase 0 (ver docs/contratos-servicios.md):
 * `usuarios` no tiene columna de contraseña, así que el login valida que
 * exista una fila con ese `nombre` y ese `rol` exactos. Alcanza para que
 * RF11 (distinguir cliente de administrador) funcione de punta a punta en
 * esta entrega. Si el proyecto necesita credenciales reales más adelante,
 * se agrega una columna de contraseña y se reemplaza SOLO este método —
 * el resto del sistema (JWT, guards, roles) no cambia.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const usuario = await this.usuariosService.findByNombreYRol(dto.nombre, dto.rol);

    if (!usuario) {
      throw new UnauthorizedException(
        'No existe un usuario con ese nombre y ese rol.',
      );
    }

    const payload: JwtPayload = {
      sub: usuario.idUsuario,
      nombre: usuario.nombre,
      rol: usuario.rol,
    };

    return { access_token: await this.jwtService.signAsync(payload) };
  }
}

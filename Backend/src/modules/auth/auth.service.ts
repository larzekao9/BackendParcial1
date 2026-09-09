import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { UsuariosService } from '../usuarios/usuarios.service.js';
import type { AppConfig } from '../../config/env.js';
import type { LoginDto } from './dto/login.dto.js';
import type { GoogleLoginDto } from './dto/google-login.dto.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';

/**
 * Login simplificado — decisión de Fase 0 (ver docs/contratos-servicios.md):
 * `usuarios` no tiene columna de contraseña, así que el login valida que
 * exista una fila con ese `nombre` y ese `rol` exactos. Alcanza para que
 * RF11 (distinguir cliente de administrador) funcione de punta a punta en
 * esta entrega. Si el proyecto necesita credenciales reales más adelante,
 * se agrega una columna de contraseña y se reemplaza SOLO este método —
 * el resto del sistema (JWT, guards, roles) no cambia.
 *
 * `loginConGoogle` (2026-09-08, ver docs/db-schema-notes.md "Login con
 * Google") coexiste con el login simplificado — no lo reemplaza. Emite el
 * mismo `JwtPayload`/JWT que `login()`, así que `JwtStrategy`/`RolesGuard`
 * no cambian.
 */
@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const googleClientId = this.configService.get<AppConfig['googleClientId']>(
      'googleClientId',
    )!;
    this.googleClient = new OAuth2Client(googleClientId);
  }

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const usuario = await this.usuariosService.findByNombreYRol(dto.nombre, dto.rol);

    if (!usuario) {
      throw new UnauthorizedException(
        'No existe un usuario con ese nombre y ese rol.',
      );
    }

    return this.firmarToken(usuario.idUsuario, usuario.nombre, usuario.rol);
  }

  /**
   * Verifica el ID token de Google server-side (nunca se confía en lo que
   * mande el frontend) y busca/crea el usuario por `email`. El
   * auto-registro SIEMPRE asigna `rol: 'cliente'` — nunca administrador,
   * ver docs/db-schema-notes.md para la justificación (RF11).
   */
  async loginConGoogle(dto: GoogleLoginDto): Promise<{ access_token: string }> {
    const googleClientId = this.configService.get<AppConfig['googleClientId']>(
      'googleClientId',
    )!;

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token de Google inválido o expirado.');
    }

    if (!payload?.email || !payload.sub) {
      throw new UnauthorizedException('El token de Google no incluye un email verificado.');
    }

    let usuario = await this.usuariosService.findByEmail(payload.email);
    if (!usuario) {
      usuario = await this.usuariosService.crearDesdeGoogle({
        nombre: payload.name ?? payload.email,
        email: payload.email,
        googleId: payload.sub,
      });
    }

    return this.firmarToken(usuario.idUsuario, usuario.nombre, usuario.rol);
  }

  private async firmarToken(
    idUsuario: number,
    nombre: string,
    rol: JwtPayload['rol'],
  ): Promise<{ access_token: string }> {
    const payload: JwtPayload = { sub: idUsuario, nombre, rol };
    return { access_token: await this.jwtService.signAsync(payload) };
  }
}

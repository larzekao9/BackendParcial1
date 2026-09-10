import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario, Rol } from '../../database/entities/usuario.entity.js';
import type { CrearUsuarioDto } from './dto/crear-usuario.dto.js';
import type { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto.js';

/**
 * Servicio de administración y consulta de usuarios.
 * Mantiene métodos de autenticación (`findByNombreYRol`, `findByEmail`, `crearDesdeGoogle`)
 * y métodos CRUD de gestión (`listar`, `buscarPorId`, `crear`, `actualizar`, `eliminar`).
 */
@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuariosRepo: Repository<Usuario>,
  ) {}

  async findByNombreYRol(nombre: string, rol: Rol): Promise<Usuario | null> {
    return this.usuariosRepo.findOne({ where: { nombre, rol } });
  }

  async findById(idUsuario: number): Promise<Usuario | null> {
    return this.usuariosRepo.findOne({ where: { idUsuario } });
  }

  async findByEmail(email: string): Promise<Usuario | null> {
    return this.usuariosRepo.findOne({ where: { email } });
  }

  /**
   * Alta por login con Google (ver docs/db-schema-notes.md, "Login con
   * Google") — siempre `rol: 'cliente'`, nunca se llama con otro rol.
   */
  async crearDesdeGoogle(datos: {
    nombre: string;
    email: string;
    googleId: string;
  }): Promise<Usuario> {
    const usuario = this.usuariosRepo.create({
      nombre: datos.nombre,
      rol: 'cliente',
      metodoAuth: 'google',
      email: datos.email,
      googleId: datos.googleId,
    });
    return this.usuariosRepo.save(usuario);
  }

  /** Lista todos los usuarios ordenados por ID de forma ascendente. */
  async listar(): Promise<Usuario[]> {
    return this.usuariosRepo.find({ order: { idUsuario: 'ASC' } });
  }

  /** Busca un usuario por ID. Lanza NotFoundException si no existe. */
  async buscarPorId(idUsuario: number): Promise<Usuario> {
    const usuario = await this.usuariosRepo.findOne({ where: { idUsuario } });
    if (!usuario) {
      throw new NotFoundException(`No existe un usuario con id ${idUsuario}.`);
    }
    return usuario;
  }

  /** Crear un usuario manualmente desde el panel de administración. */
  async crear(dto: CrearUsuarioDto): Promise<Usuario> {
    const usuario = this.usuariosRepo.create({
      nombre: dto.nombre,
      rol: dto.rol,
      email: dto.email ?? null,
      metodoAuth: dto.metodoAuth ?? 'manual',
    });
    return this.usuariosRepo.save(usuario);
  }

  /** Actualizar un usuario existente aplicando solo los campos provistos. */
  async actualizar(idUsuario: number, dto: ActualizarUsuarioDto): Promise<Usuario> {
    const usuario = await this.buscarPorId(idUsuario);
    if (dto.nombre !== undefined) usuario.nombre = dto.nombre;
    if (dto.rol !== undefined) usuario.rol = dto.rol;
    if (dto.email !== undefined) usuario.email = dto.email;
    if (dto.metodoAuth !== undefined) usuario.metodoAuth = dto.metodoAuth;
    return this.usuariosRepo.save(usuario);
  }

  /** Eliminar un usuario por ID. Lanza NotFoundException si no existe. */
  async eliminar(idUsuario: number): Promise<void> {
    const usuario = await this.buscarPorId(idUsuario);
    await this.usuariosRepo.remove(usuario);
  }
}


import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario, Rol } from '../../database/entities/usuario.entity.js';

/**
 * Fase 0: solo lo mínimo que `auth` necesita para resolver el login
 * simplificado (ver docs/contratos-servicios.md). El CRUD completo de
 * usuarios (alta, edición, baja — solo administrador) es trabajo de Roly
 * en la Fase 1, se agrega a este mismo service sin romper este método.
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
}

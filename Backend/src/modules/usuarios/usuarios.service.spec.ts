import { NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { UsuariosService } from './usuarios.service.js';
import type { Usuario } from '../../database/entities/usuario.entity.js';

describe('UsuariosService', () => {
  let usuariosRepo: Partial<Repository<Usuario>>;
  let service: UsuariosService;

  beforeEach(() => {
    usuariosRepo = {
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn((dto) => dto as Usuario),
      save: vi.fn((usuario) => Promise.resolve({ idUsuario: 1, ...usuario } as Usuario)),
      remove: vi.fn().mockResolvedValue(undefined as unknown as Usuario),
    };
    service = new UsuariosService(usuariosRepo as Repository<Usuario>);
  });

  it('findByNombreYRol busca el usuario por nombre y rol', async () => {
    const mockUser = { idUsuario: 1, nombre: 'Admin', rol: 'administrador' } as Usuario;
    (usuariosRepo.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const res = await service.findByNombreYRol('Admin', 'administrador');
    expect(res).toEqual(mockUser);
    expect(usuariosRepo.findOne).toHaveBeenCalledWith({ where: { nombre: 'Admin', rol: 'administrador' } });
  });

  it('findById busca el usuario por id', async () => {
    const mockUser = { idUsuario: 2, nombre: 'Cliente Test', rol: 'cliente' } as Usuario;
    (usuariosRepo.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const res = await service.findById(2);
    expect(res).toEqual(mockUser);
    expect(usuariosRepo.findOne).toHaveBeenCalledWith({ where: { idUsuario: 2 } });
  });

  it('findByEmail busca el usuario por email', async () => {
    const mockUser = { idUsuario: 3, email: 'test@example.com' } as Usuario;
    (usuariosRepo.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const res = await service.findByEmail('test@example.com');
    expect(res).toEqual(mockUser);
    expect(usuariosRepo.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
  });

  it('crearDesdeGoogle asigna rol cliente y metodoAuth google', async () => {
    const datos = { nombre: 'GUser', email: 'g@example.com', googleId: 'gid123' };
    const res = await service.crearDesdeGoogle(datos);

    expect(usuariosRepo.create).toHaveBeenCalledWith({
      nombre: 'GUser',
      rol: 'cliente',
      metodoAuth: 'google',
      email: 'g@example.com',
      googleId: 'gid123',
    });
    expect(res.idUsuario).toBe(1);
  });

  it('listar devuelve todos los usuarios ordenados por idUsuario ASC', async () => {
    const list = [{ idUsuario: 1 }, { idUsuario: 2 }] as Usuario[];
    (usuariosRepo.find as ReturnType<typeof vi.fn>).mockResolvedValue(list);

    const res = await service.listar();
    expect(res).toEqual(list);
    expect(usuariosRepo.find).toHaveBeenCalledWith({ order: { idUsuario: 'ASC' } });
  });

  it('buscarPorId devuelve el usuario cuando existe', async () => {
    const mockUser = { idUsuario: 5, nombre: 'Carlos', rol: 'cliente' } as Usuario;
    (usuariosRepo.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

    const res = await service.buscarPorId(5);
    expect(res).toEqual(mockUser);
  });

  it('buscarPorId lanza NotFoundException cuando no existe', async () => {
    (usuariosRepo.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.buscarPorId(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('crear guarda el usuario con metodoAuth manual por defecto', async () => {
    const dto = { nombre: 'Nuevo User', rol: 'cliente' as const };
    const res = await service.crear(dto);

    expect(usuariosRepo.create).toHaveBeenCalledWith({
      nombre: 'Nuevo User',
      rol: 'cliente',
      email: null,
      metodoAuth: 'manual',
    });
    expect(res.nombre).toBe('Nuevo User');
  });

  it('actualizar modifica solo los campos enviados sin sobrescribir con undefined', async () => {
    const usuarioExistente = {
      idUsuario: 10,
      nombre: 'Original',
      rol: 'cliente',
      email: 'original@example.com',
      metodoAuth: 'manual',
    } as Usuario;
    (usuariosRepo.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(usuarioExistente);

    const res = await service.actualizar(10, { nombre: 'Actualizado' });

    expect(res.nombre).toBe('Actualizado');
    expect(res.email).toBe('original@example.com');
    expect(res.rol).toBe('cliente');
  });

  it('eliminar borra el usuario existente', async () => {
    const usuarioExistente = { idUsuario: 12, nombre: 'A borrar' } as Usuario;
    (usuariosRepo.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(usuarioExistente);

    await service.eliminar(12);
    expect(usuariosRepo.remove).toHaveBeenCalledWith(usuarioExistente);
  });

  it('eliminar de un id inexistente lanza NotFoundException', async () => {
    (usuariosRepo.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.eliminar(999)).rejects.toBeInstanceOf(NotFoundException);
    expect(usuariosRepo.remove).not.toHaveBeenCalled();
  });
});

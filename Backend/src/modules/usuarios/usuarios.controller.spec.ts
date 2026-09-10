import { UsuariosController } from './usuarios.controller.js';
import type { UsuariosService } from './usuarios.service.js';
import type { Usuario } from '../../database/entities/usuario.entity.js';

describe('UsuariosController', () => {
  let service: Partial<UsuariosService>;
  let controller: UsuariosController;

  beforeEach(() => {
    service = {
      listar: vi.fn(),
      buscarPorId: vi.fn(),
      crear: vi.fn(),
      actualizar: vi.fn(),
      eliminar: vi.fn(),
    };
    controller = new UsuariosController(service as UsuariosService);
  });

  it('listar invoca service.listar', async () => {
    const list = [{ idUsuario: 1, nombre: 'Admin' }] as Usuario[];
    (service.listar as ReturnType<typeof vi.fn>).mockResolvedValue(list);

    const res = await controller.listar();
    expect(res).toEqual(list);
    expect(service.listar).toHaveBeenCalled();
  });

  it('buscarPorId invoca service.buscarPorId con el ID numérico', async () => {
    const usuario = { idUsuario: 2, nombre: 'Carlos' } as Usuario;
    (service.buscarPorId as ReturnType<typeof vi.fn>).mockResolvedValue(usuario);

    const res = await controller.buscarPorId(2);
    expect(res).toEqual(usuario);
    expect(service.buscarPorId).toHaveBeenCalledWith(2);
  });

  it('crear invoca service.crear con el DTO', async () => {
    const dto = { nombre: 'Nuevo User', rol: 'cliente' as const };
    const creado = { idUsuario: 3, ...dto } as Usuario;
    (service.crear as ReturnType<typeof vi.fn>).mockResolvedValue(creado);

    const res = await controller.crear(dto);
    expect(res).toEqual(creado);
    expect(service.crear).toHaveBeenCalledWith(dto);
  });

  it('actualizar invoca service.actualizar con el ID y el DTO', async () => {
    const dto = { nombre: 'Nombre Editado' };
    const actualizado = { idUsuario: 4, nombre: 'Nombre Editado', rol: 'cliente' } as Usuario;
    (service.actualizar as ReturnType<typeof vi.fn>).mockResolvedValue(actualizado);

    const res = await controller.actualizar(4, dto);
    expect(res).toEqual(actualizado);
    expect(service.actualizar).toHaveBeenCalledWith(4, dto);
  });

  it('eliminar invoca service.eliminar con el ID', async () => {
    (service.eliminar as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await controller.eliminar(5);
    expect(service.eliminar).toHaveBeenCalledWith(5);
  });
});

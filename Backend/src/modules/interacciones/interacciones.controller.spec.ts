import { InteraccionesController } from './interacciones.controller.js';
import type { InteraccionesService } from './interacciones.service.js';
import type { InteraccionIA } from '../../database/entities/interaccion-ia.entity.js';

describe('InteraccionesController', () => {
  let service: Partial<InteraccionesService>;
  let controller: InteraccionesController;

  beforeEach(() => {
    service = {
      registrar: vi.fn(),
      listar: vi.fn(),
    };
    controller = new InteraccionesController(service as InteraccionesService);
  });

  it('registrar invoca service.registrar con el DTO', async () => {
    const dto = {
      idUsuario: 9,
      intencionDetectada: 'consultar_cartelera',
    };
    const registro = { idInteraccion: 1, ...dto } as InteraccionIA;
    (service.registrar as ReturnType<typeof vi.fn>).mockResolvedValue(registro);

    const res = await controller.registrar(dto);
    expect(res).toEqual(registro);
    expect(service.registrar).toHaveBeenCalledWith(dto);
  });

  it('listar invoca service.listar mapeando correctamente query params', async () => {
    const list = [{ idInteraccion: 1 }] as InteraccionIA[];
    (service.listar as ReturnType<typeof vi.fn>).mockResolvedValue(list);

    const res = await controller.listar('9', '20');
    expect(res).toEqual(list);
    expect(service.listar).toHaveBeenCalledWith({
      idUsuario: 9,
      limite: 20,
    });
  });
});

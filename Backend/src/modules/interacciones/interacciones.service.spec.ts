import type { Repository } from 'typeorm';
import { InteraccionesService } from './interacciones.service.js';
import type { InteraccionIA } from '../../database/entities/interaccion-ia.entity.js';

describe('InteraccionesService (RF18/CU08)', () => {
  let interaccionesRepo: Partial<Repository<InteraccionIA>>;
  let service: InteraccionesService;

  beforeEach(() => {
    interaccionesRepo = {
      create: vi.fn((dto) => dto as InteraccionIA),
      save: vi.fn((entity) => Promise.resolve({ idInteraccion: 101, fechaHora: new Date(), ...entity } as InteraccionIA)),
      createQueryBuilder: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnThis(),
        addOrderBy: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([
          { idInteraccion: 101, idUsuario: 9, intencionDetectada: 'consultar_cartelera' },
        ]),
      }),
    };

    service = new InteraccionesService(interaccionesRepo as Repository<InteraccionIA>);
  });

  it('registrar guarda correctamente una interacción con campos requeridos y opcionales', async () => {
    const dto = {
      idUsuario: 9,
      intencionDetectada: 'comprar_entrada',
      widgetGenerado: 'SeatingMapWidget',
      textoTranscrito: 'Quiero 2 entradas para Batman',
    };

    const res = await service.registrar(dto);

    expect(interaccionesRepo.create).toHaveBeenCalledWith({
      idUsuario: 9,
      idFuncion: null,
      intencionDetectada: 'comprar_entrada',
      widgetGenerado: 'SeatingMapWidget',
      textoTranscrito: 'Quiero 2 entradas para Batman',
    });
    expect(res.idInteraccion).toBe(101);
  });

  it('listar retorna las interacciones ordenadas por fechaHora desc', async () => {
    const res = await service.listar({ idUsuario: 9, limite: 10 });

    expect(interaccionesRepo.createQueryBuilder).toHaveBeenCalledWith('interaccion');
    expect(res).toHaveLength(1);
    expect(res[0]!.idInteraccion).toBe(101);
  });
});

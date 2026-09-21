import { ForbiddenException } from '@nestjs/common';
import { VentasController } from './ventas.controller.js';
import type { VentasService } from './ventas.service.js';
import type { CrearVentaDto } from './dto/crear-venta.dto.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

describe('VentasController — cada compra es de quien la hizo', () => {
  const cliente: JwtPayload = { sub: 2, nombre: 'Hebert', rol: 'cliente' };
  const otroCliente: JwtPayload = { sub: 5, nombre: 'Luis', rol: 'cliente' };
  const admin: JwtPayload = { sub: 3, nombre: 'Admin Lumen', rol: 'administrador' };

  let service: { crear: ReturnType<typeof vi.fn>; listar: ReturnType<typeof vi.fn>; buscarPorId: ReturnType<typeof vi.fn> };
  let controller: VentasController;

  beforeEach(() => {
    service = { crear: vi.fn(), listar: vi.fn().mockResolvedValue([]), buscarPorId: vi.fn() };
    controller = new VentasController(service as unknown as VentasService);
  });

  const dto = {
    idFuncion: 10,
    idAsientos: [1, 2],
    confirmacionNoReembolso: true,
    tipoRegistro: 'manual',
  } as CrearVentaDto;

  describe('POST /ventas', () => {
    it('un cliente compra a su nombre (el id sale del JWT)', async () => {
      await controller.crear(dto, cliente);

      expect(service.crear).toHaveBeenCalledWith(expect.objectContaining({ idUsuarioCliente: 2 }), 2);
    });

    it('un administrador que compra queda como comprador: no se guarda con cliente null', async () => {
      await controller.crear(dto, admin);

      expect(service.crear).toHaveBeenCalledWith(expect.objectContaining({ idUsuarioCliente: 3 }), 3);
    });

    it('un idUsuarioCliente mandado en el body nunca pisa al de la sesión', async () => {
      const conBodyTruncho = { ...dto, idUsuarioCliente: 99 } as unknown as CrearVentaDto;

      await controller.crear(conBodyTruncho, cliente);

      expect(service.crear).toHaveBeenCalledWith(expect.objectContaining({ idUsuarioCliente: 2 }), 2);
    });
  });

  describe('GET /ventas/mis-compras', () => {
    it('un cliente recibe solo lo suyo', async () => {
      await controller.misCompras(cliente);

      expect(service.listar).toHaveBeenCalledWith(2);
    });

    it('otro cliente recibe lo suyo, no lo del primero', async () => {
      await controller.misCompras(otroCliente);

      expect(service.listar).toHaveBeenCalledWith(5);
    });

    it('un administrador también recibe solo lo suyo, no todas las ventas', async () => {
      await controller.misCompras(admin);

      expect(service.listar).toHaveBeenCalledWith(3);
      expect(service.listar).not.toHaveBeenCalledWith(undefined);
    });

    it('está declarada antes que :id, si no "mis-compras" se leería como un id', () => {
      const rutas = Object.getOwnPropertyNames(VentasController.prototype);

      expect(rutas.indexOf('misCompras')).toBeLessThan(rutas.indexOf('buscarPorId'));
    });
  });

  describe('GET /ventas (vista de todas las ventas)', () => {
    it('un cliente ve solo las suyas', async () => {
      await controller.listar(cliente);

      expect(service.listar).toHaveBeenCalledWith(2);
    });

    it('un administrador las ve todas (sin filtro)', async () => {
      await controller.listar(admin);

      expect(service.listar).toHaveBeenCalledWith(undefined);
    });
  });

  describe('GET /ventas/:id', () => {
    it('un cliente no puede abrir la venta de otro', async () => {
      service.buscarPorId.mockResolvedValue({ idVenta: 7, idUsuarioCliente: 5 });

      await expect(controller.buscarPorId(7, cliente)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('un cliente abre la suya', async () => {
      service.buscarPorId.mockResolvedValue({ idVenta: 8, idUsuarioCliente: 2 });

      await expect(controller.buscarPorId(8, cliente)).resolves.toMatchObject({ idVenta: 8 });
    });
  });
});

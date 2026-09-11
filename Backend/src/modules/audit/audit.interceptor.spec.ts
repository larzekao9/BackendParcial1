import { lastValueFrom, of, throwError } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';

const ADMIN: JwtPayload = { sub: 7, nombre: 'admin_test', rol: 'administrador' };
const CLIENTE: JwtPayload = { sub: 8, nombre: 'cliente_test', rol: 'cliente' };

function makeContext(options: {
  etiqueta?: string;
  user?: JwtPayload;
  params?: Record<string, unknown>;
}) {
  const { etiqueta, user, params = {} } = options;
  void etiqueta; // solo documental: la etiqueta la lee el reflector, no el request
  return {
    getHandler: () => ({}) as unknown,
    getClass: () => (({}) as object) as unknown,
    switchToHttp: () => ({
      getRequest: () => ({ user, params }),
    }),
  } as unknown as ExecutionContext;
}

function makeCallHandler(result: unknown = { id: 1 }) {
  return { handle: vi.fn(() => of(result)) } as unknown as CallHandler;
}

function buildInterceptor(overrides?: {
  reflector?: Partial<Reflector>;
  auditService?: Partial<AuditService>;
  configService?: Partial<ConfigService>;
}) {
  const reflector = {
    getAllAndOverride: () => undefined,
    ...overrides?.reflector,
  } as unknown as Reflector;

  const auditService = {
    log: vi.fn().mockResolvedValue({ idLog: 1 }),
    ...overrides?.auditService,
  } as unknown as AuditService;

  const configService = {
    get: vi.fn().mockReturnValue('servidor_local'),
    ...overrides?.configService,
  } as unknown as ConfigService;

  const interceptor = new AuditInterceptor(reflector, auditService, configService);
  return { interceptor, auditService, configService };
}

describe('AuditInterceptor (RF12)', () => {
  it('no registra nada si el handler no tiene @Audit(...)', async () => {
    const { interceptor, auditService } = buildInterceptor();
    const handler = makeCallHandler();

    await lastValueFrom(interceptor.intercept(makeContext({ user: ADMIN }), handler));

    expect(handler.handle).toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('registra la acción con idUsuario del JWT y nivelDespliegue de la config al terminar OK el handler', async () => {
    const { interceptor, auditService, configService } = buildInterceptor({
      reflector: { getAllAndOverride: () => 'crear_pelicula' },
    });

    await lastValueFrom(
      interceptor.intercept(makeContext({ etiqueta: 'crear_pelicula', user: ADMIN }), makeCallHandler()),
    );

    expect(auditService.log).toHaveBeenCalledWith(7, 'crear_pelicula', 'servidor_local', null, null);
    expect(configService.get).toHaveBeenCalledWith('nivelDespliegue');
  });

  it('concatena el id de la ruta a la etiqueta cuando el endpoint trae :id', async () => {
    const { interceptor, auditService } = buildInterceptor({
      reflector: { getAllAndOverride: () => 'actualizar_precio' },
    });

    await lastValueFrom(
      interceptor.intercept(
        makeContext({ etiqueta: 'actualizar_precio', user: ADMIN, params: { id: 3 } }),
        makeCallHandler(),
      ),
    );

    expect(auditService.log).toHaveBeenCalledWith(7, 'actualizar_precio:3', 'servidor_local', null, null);
  });

  it('no registra si el request no trae usuario (los guards JWT corren antes, no debería pasar)', async () => {
    const { interceptor, auditService } = buildInterceptor({
      reflector: { getAllAndOverride: () => 'crear_sala' },
    });

    await lastValueFrom(
      interceptor.intercept(makeContext({ etiqueta: 'crear_sala' }), makeCallHandler()),
    );

    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('registra igual cuando quien muta es un cliente (RF12 audita GESTIÓN, pero el rol lo decide el controller, no el interceptor)', async () => {
    // El interceptor es agnóstico del rol: audita cualquier handler marcado
    // con @Audit. Que una mutación sea de admin o de cliente lo resuelve el
    // @Roles(...) + RolesGuard en cada controller — acá solo se comprueba
    // que un cliente autenticado también deja su id en el log.
    const { interceptor, auditService } = buildInterceptor({
      reflector: { getAllAndOverride: () => 'crear_venta' },
    });

    await lastValueFrom(
      interceptor.intercept(
        makeContext({ etiqueta: 'crear_venta', user: CLIENTE, params: {} }),
        makeCallHandler({ idVenta: 100 }),
      ),
    );

    expect(auditService.log).toHaveBeenCalledWith(8, 'crear_venta', 'servidor_local', null, null);
  });

  it('una mutación exitosa NO se rompe aunque el INSERT de log_acciones falle', async () => {
    const { interceptor, auditService } = buildInterceptor({
      reflector: { getAllAndOverride: () => 'crear_promocion' },
      auditService: { log: vi.fn().mockRejectedValue(new Error('fk')) },
    });
    const handler = makeCallHandler({ idPromocion: 42 });

    const resultado = await lastValueFrom(
      interceptor.intercept(makeContext({ etiqueta: 'crear_promocion', user: ADMIN }), handler),
    );

    expect(resultado).toEqual({ idPromocion: 42 });
    expect(handler.handle).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(7, 'crear_promocion', 'servidor_local', null, null);
  });

  it('un error del handler se propaga y NO deja registro de auditoría', async () => {
    const { interceptor, auditService } = buildInterceptor({
      reflector: { getAllAndOverride: () => 'crear_pelicula' },
    });
    const handler = {
      handle: vi.fn(() => throwError(() => new Error('boom'))),
    } as unknown as CallHandler;

    await expect(
      lastValueFrom(
        interceptor.intercept(makeContext({ etiqueta: 'crear_pelicula', user: ADMIN }), handler),
      ),
    ).rejects.toThrow('boom');
    expect(auditService.log).not.toHaveBeenCalled();
  });
});
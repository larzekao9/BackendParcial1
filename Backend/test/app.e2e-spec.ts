import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/shared/exceptions/http-exception.filter.js';

/**
 * E2E de Fase 0 — requiere Postgres corriendo con el esquema aplicado
 * (`docker compose up -d db`) y al menos un usuario administrador insertado
 * a mano (ver docs/plan-backend.md). No reemplaza los tests de dominio que
 * cada quien agrega en su Fase 1, solo prueba que la base (auth, guards,
 * filtro de excepciones) funciona de punta a punta.
 */
describe('App (e2e) — fundaciones', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health es público y responde 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/auth/login con usuario/rol inexistente responde 401 con {message, code}', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ nombre: 'no_existe_seguro', rol: 'cliente' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('code');
  });

  it('POST /api/auth/login con payload inválido responde 400/422, nunca 500', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ nombre: '', rol: 'no-es-un-rol-valido' });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './shared/exceptions/http-exception.filter.js';
import type { AppConfig } from './config/env.js';

async function bootstrap() {
  // rawBody: el webhook de Stripe firma el cuerpo EXACTO que envía; sin los bytes originales no se puede verificar la firma.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<AppConfig['port']>('port') ?? 3333;
  await app.listen(port);
  console.log(`Backend escuchando en http://localhost:${port}/api`);
}
await bootstrap();

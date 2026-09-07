import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import envConfig from './config/env.js';
import { envValidationSchema } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { UsuariosModule } from './modules/usuarios/usuarios.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PeliculasModule } from './modules/peliculas/peliculas.module.js';
import { SalasModule } from './modules/salas/salas.module.js';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard.js';
import { RolesGuard } from './shared/guards/roles.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [envConfig],
      validationSchema: envValidationSchema,
    }),
    DatabaseModule,
    AuthModule,
    UsuariosModule,
    HealthModule,
    PeliculasModule, // Fase 1 (CU03) → Luisa Ángel
    SalasModule, // Fase 2 (salas + asientos) → Luisa Ángel
    // Fase 1 (fuera de este módulo raíz por ahora, cada dev agrega el suyo
    // acá cuando lo tenga listo):
    //   PreciosModule, PromocionesModule → Luisa Ángel
    //   FuncionesModule, VentasModule, ReportesModule → Luis Blanco
    //   AuditModule, IaGatewayModule                  → Roly
  ],
  providers: [
    // Guards globales: por default TODO endpoint requiere JWT válido y
    // respeta @Roles(...). @Public() es la única forma de saltar el JWT.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

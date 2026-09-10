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
import { PreciosModule } from './modules/precios/precios.module.js';
import { PromocionesModule } from './modules/promociones/promociones.module.js';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard.js';
import { RolesGuard } from './shared/guards/roles.guard.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { FuncionesModule } from './modules/funciones/funciones.module.js';
import { VentasModule } from './modules/ventas/ventas.module.js';
import { PagosModule } from './modules/pagos/pagos.module.js';
import { ReportesModule } from './modules/reportes/reportes.module.js';

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
    PeliculasModule, // Fase 1 (CU03) → Luis Ángel
    SalasModule, // Fase 2 (salas + asientos) → Luis Ángel
    PreciosModule, // Fase 3 (CU07) → Luis Ángel
    PromocionesModule, // Fase 4 (CU06) → Luis Ángel
    AuditModule, // RF12 → Roly (interceptor global + GET /audit/log-acciones)
    FuncionesModule, // CU04 (RF07) → Luis Blanco
    VentasModule, // CU02 → Luis Blanco
    PagosModule, // RF04 (pago controlado, sin Stripe todavía) → Luis Blanco
    ReportesModule, // CU05 (RF08) → Luis Blanco
    // Fuera de este módulo raíz por ahora, se agrega cuando esté lista:
    //   IaGatewayModule → Roly
  ],
  providers: [
    // Guards globales: por default TODO endpoint requiere JWT válido y
    // respeta @Roles(...). @Public() es la única forma de saltar el JWT.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

/**
 * Acceso tipado a la configuración — nunca `process.env.X` suelto dentro
 * de un Service. Los valores ya fueron validados por envValidationSchema
 * antes de que la app termine de arrancar.
 */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    ssl: boolean;
  };
  jwt: {
    secret: string;
    /** Segundos. Ver env.validation.ts para por qué no es un string tipo "8h". */
    expiresInSeconds: number;
  };
  /** Audience esperado al verificar el ID token de Google — ver auth.service.ts. */
  googleClientId: string;
  nivelDespliegue: 'servidor_local' | 'maquina_local' | 'movil_ligero';
  /** Pago con tarjeta en línea (RF04). Vacío = deshabilitado: ver `StripeService.habilitado`. */
  stripe: {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
    moneda: 'bob' | 'usd' | 'eur';
    /** Bolivianos por 1 unidad de `moneda` (1 si se cobra en bolivianos). */
    tipoCambio: number;
  };
  pagos: {
    /** Minutos que una venta puede quedar `pendiente_pago` antes de cancelarse y liberar sus asientos. */
    pendienteTtlMin: number;
    /** Cada cuántos segundos corre el barrido de ventas vencidas (0 = no corre). */
    barridoSeg: number;
  };
}

export default (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  // 3333 por defecto: el 3000 es del frontend (único origen autorizado en el login con Google). Con 3000 acá, un `.env` sin PORT hacía
  // que el backend ocupara el puerto del frontend y Vite se corriera al 3001 (login roto con `origin_mismatch`).
  port: parseInt(process.env.PORT ?? '3333', 10),
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME ?? 'cine_ia',
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresInSeconds: parseInt(process.env.JWT_EXPIRES_IN_SECONDS ?? '28800', 10),
  },
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  nivelDespliegue:
    (process.env.NIVEL_DESPLIEGUE as AppConfig['nivelDespliegue']) ??
    'servidor_local',
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    moneda: (process.env.STRIPE_MONEDA as AppConfig['stripe']['moneda']) ?? 'bob',
    tipoCambio: parseFloat(process.env.STRIPE_TIPO_CAMBIO || '1'),
  },
  pagos: {
    pendienteTtlMin: parseInt(process.env.PAGO_PENDIENTE_TTL_MIN ?? '10', 10),
    barridoSeg: parseInt(process.env.PAGO_BARRIDO_SEG ?? '60', 10),
  },
});

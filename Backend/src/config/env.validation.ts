import Joi from 'joi';

/**
 * Schema de validación de variables de entorno — falla rápido al arrancar
 * si falta algo, en vez de fallar más tarde con un error críptico de
 * conexión o de JWT. Usado por ConfigModule.forRoot({ validationSchema }).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),

  JWT_SECRET: Joi.string().min(16).required(),
  // En segundos (no string tipo "8h") para evitar el tipado StringValue de
  // la librería `ms` que usa @nestjs/jwt — 28800s = 8 horas.
  JWT_EXPIRES_IN_SECONDS: Joi.number().default(28800),

  // Client ID de Google Cloud (OAuth 2.0, tipo "Web application") — es el
  // `audience` contra el que se verifica el ID token en POST /auth/google
  // (ver auth.service.ts). No es un secreto (viaja también al frontend
  // como VITE_GOOGLE_CLIENT_ID), pero sin él no se puede verificar nada.
  GOOGLE_CLIENT_ID: Joi.string().required(),

  NIVEL_DESPLIEGUE: Joi.string()
    .valid('servidor_local', 'maquina_local', 'movil_ligero')
    .default('servidor_local'),

  // Stripe (RF04) — TODAS opcionales a propósito: sin `STRIPE_SECRET_KEY` el backend arranca igual y el pago con
  // tarjeta en línea queda deshabilitado (GET /pagos/config lo informa; efectivo sigue andando). Modo prueba: claves
  // `sk_test_…` / `pk_test_…` del Dashboard de Stripe; `STRIPE_WEBHOOK_SECRET` (`whsec_…`) sale de `stripe listen`.
  STRIPE_SECRET_KEY: Joi.string().allow('').default(''),
  STRIPE_PUBLISHABLE_KEY: Joi.string().allow('').default(''),
  STRIPE_WEBHOOK_SECRET: Joi.string().allow('').default(''),
  // Moneda del cobro. Las ventas están en bolivianos; si Stripe no aceptara `bob` se cobra en `usd` y
  // `STRIPE_TIPO_CAMBIO` (bolivianos por 1 unidad de esa moneda, ej. 6.96) convierte el total.
  STRIPE_MONEDA: Joi.string().valid('bob', 'usd', 'eur').default('bob'),
  STRIPE_TIPO_CAMBIO: Joi.number().positive().empty('').default(1),

  // Ventas que nadie terminó de pagar: pasado este tiempo se cancelan y sus asientos se liberan. `0` desactiva el barrido.
  PAGO_PENDIENTE_TTL_MIN: Joi.number().min(1).default(10),
  PAGO_BARRIDO_SEG: Joi.number().min(0).default(60),
});

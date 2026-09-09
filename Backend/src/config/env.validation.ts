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
});

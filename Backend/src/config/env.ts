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
}

export default (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as AppConfig['nodeEnv']) ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
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
});

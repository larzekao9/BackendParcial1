# Backend — Sistema de Cine con Agente de Voz

NestJS + TypeORM + PostgreSQL/Supabase. Ver `.claude/agents/backend-nestjs.md`
para las reglas de arquitectura, y `docs/plan-backend.md` /
`docs/contratos-servicios.md` (en la raíz del proyecto) para el reparto de
trabajo y el contrato entre módulos.

## Arrancar en local

```bash
cp .env.example .env          # ajustar si hace falta
docker compose up -d db       # levanta Postgres y aplica base_datos_cine_ia.sql
npm install
npm run start:dev             # http://localhost:3000/api
```

Para probar el login hace falta al menos un usuario en la tabla `usuarios`
(la Fase 0 no crea usuarios de ejemplo, cada quien inserta los suyos o
espera al CRUD de `usuarios` de la Fase 1):

```bash
docker exec cine_ia_db psql -U postgres -d cine_ia -c \
  "INSERT INTO usuarios (nombre, rol, metodo_auth) VALUES ('admin_test','administrador','simplificado');"

curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"nombre":"admin_test","rol":"administrador"}'
```

## Tests

```bash
npm run test        # unitarios (vitest)
npm run test:e2e    # e2e — requiere Postgres corriendo (docker compose up -d db)
npm run lint         # oxlint
```

## Qué ya existe (Fase 0)

- Conexión a Postgres/Supabase (`src/database/database.module.ts`),
  `synchronize: false` siempre — el esquema lo aplica `base_datos_cine_ia.sql`.
- Las 13 entidades mapeadas 1:1 al esquema real (`src/database/entities/`).
- Filtro global de excepciones: toda respuesta de error es
  `{ message, code }`, y traduce los errores de Postgres relevantes
  (solapamiento de horario → 409, duplicado → 409, referencia inexistente → 404).
- `JwtAuthGuard` + `RolesGuard` globales: todo endpoint requiere JWT y
  respeta `@Roles(...)` por default. `@Public()` es la única forma de saltar
  el JWT (usado en `/health` y `/auth/login`).
- `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`).
- Login simplificado por `{ nombre, rol }` — ver la decisión documentada en
  `docs/contratos-servicios.md`.
- Contrato de interfaces entre módulos en `src/contracts/service-contracts.ts`.

## Qué falta (Fase 1 — ver `docs/plan-backend.md`)

- **Luis Ángel**: `peliculas`, `salas`/`asientos`, `precios`, `promociones`.
- **Luis Blanco**: `funciones`, `disponibilidad_asiento`, `ventas`,
  `detalle_venta_entradas`, `reportes`.
- **Roly**: CRUD completo de `usuarios`, `audit`, `ia-gateway`.

Cada módulo nuevo se registra en `src/app.module.ts` (ya tiene un comentario
marcando dónde va cada uno).

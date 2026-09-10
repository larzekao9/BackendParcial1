-- =========================================================
-- BASE DE DATOS COMPLETA — Sistema de Cine con Agente de Voz (IA)
-- PostgreSQL / Supabase — Segundo Parcial
--
-- Este es el ÚNICO script fuente de verdad del esquema.
-- Se ejecuta completo sobre una base vacía.
-- Cada vez que alguien cambie el modelo de datos, este archivo
-- se actualiza para reflejar el estado final — no se conservan
-- migraciones incrementales por separado.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =========================================================
-- 1. USUARIOS Y ROLES (soporta RF11 - validar rol del hablante)
-- =========================================================
CREATE TABLE usuarios (
    id_usuario      SERIAL PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,
    rol             VARCHAR(20) NOT NULL CHECK (rol IN ('cliente', 'administrador')),
    metodo_auth     VARCHAR(50),
    -- email/google_id: nullable porque las filas del login simplificado
    -- (nombre+rol, sin cuenta de Google) no los tienen. Login con Google
    -- (ver docs/db-schema-notes.md, "Login con Google") busca/crea por
    -- estas dos columnas; el auto-registro por Google siempre asigna
    -- rol='cliente', nunca administrador.
    email           VARCHAR(255) UNIQUE,
    google_id       VARCHAR(255) UNIQUE,
    fecha_registro  TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- 2. PELÍCULAS (CU03 - Gestionar cartelera)
-- =========================================================
CREATE TABLE peliculas (
    id_pelicula     SERIAL PRIMARY KEY,
    titulo          VARCHAR(200) NOT NULL,
    genero          VARCHAR(80),
    duracion_min    INT NOT NULL,
    clasificacion   VARCHAR(10),
    estado          VARCHAR(20) DEFAULT 'activa' CHECK (estado IN ('activa','inactiva'))
);

-- =========================================================
-- 3. SALAS Y ASIENTOS
--
-- Toda butaca de una sala es físicamente idéntica a las demás: la
-- diferenciación de formato/categoría (2D, 3D, VIP) es de la SALA
-- (`salas.tipo`), no de la butaca individual — no se vende un asiento VIP
-- suelto dentro de una sala normal. Ver docs/db-schema-notes.md, entrada
-- "Reversión: tipo de asiento por sala, no por butaca" (2026-09-10).
-- =========================================================
CREATE TABLE salas (
    id_sala             SERIAL PRIMARY KEY,
    nombre              VARCHAR(50) NOT NULL,
    capacidad           INT NOT NULL,
    tipo                VARCHAR(30), -- 2D, 3D, VIP (formato de la sala)
    tiempo_limpieza_min INT NOT NULL DEFAULT 20 -- margen por defecto entre funciones
);

CREATE TABLE asientos (
    id_asiento      SERIAL PRIMARY KEY,
    id_sala         INT NOT NULL REFERENCES salas(id_sala),
    fila            VARCHAR(5) NOT NULL,
    numero          INT NOT NULL,
    UNIQUE (id_sala, fila, numero)
);

-- =========================================================
-- 4. PRECIOS (CU07 - Gestión de precio)
--
-- El precio de una entrada cuelga de la FUNCIÓN (`funciones.id_precio`,
-- que ya trae implícita la sala/formato/horario), no de un tipo de
-- asiento individual — ver misma nota que arriba.
-- =========================================================
CREATE TABLE precios (
    id_precio       SERIAL PRIMARY KEY,
    valor           NUMERIC(10,2) NOT NULL,
    vigente_desde   DATE NOT NULL,
    vigente_hasta   DATE
);

-- =========================================================
-- 5. FUNCIONES / CRONOGRAMA (CU04 - Gestionar funciones)
--    Incluye control de tiempo de limpieza y anti-solapamiento
-- =========================================================
CREATE TABLE funciones (
    id_funcion          SERIAL PRIMARY KEY,
    id_pelicula         INT NOT NULL REFERENCES peliculas(id_pelicula),
    id_sala             INT NOT NULL REFERENCES salas(id_sala),
    id_precio           INT REFERENCES precios(id_precio),
    fecha               DATE NOT NULL,
    hora_inicio         TIME NOT NULL,
    hora_fin            TIME NOT NULL,
    tiempo_limpieza_min INT, -- override puntual; si es NULL se usa el de la sala
    estado              VARCHAR(20) DEFAULT 'programada' CHECK (estado IN ('programada','cancelada')),
    rango_ocupado       TSRANGE -- calculado por trigger: hora_inicio -> hora_fin + limpieza
);

-- Trigger: calcula automáticamente el rango de tiempo realmente ocupado
-- (duración de la película + tiempo de limpieza de la sala o el override)
CREATE OR REPLACE FUNCTION calcular_rango_ocupado()
RETURNS TRIGGER AS $$
DECLARE
    limpieza INT;
BEGIN
    limpieza := COALESCE(
        NEW.tiempo_limpieza_min,
        (SELECT tiempo_limpieza_min FROM salas WHERE id_sala = NEW.id_sala)
    );

    IF NEW.hora_fin <= NEW.hora_inicio THEN
        RAISE EXCEPTION 'La hora_fin debe ser posterior a hora_inicio';
    END IF;

    NEW.rango_ocupado := tsrange(
        (NEW.fecha + NEW.hora_inicio)::timestamp,
        (NEW.fecha + NEW.hora_fin)::timestamp + (limpieza || ' minutes')::interval,
        '[)'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calcular_rango_ocupado
BEFORE INSERT OR UPDATE ON funciones
FOR EACH ROW EXECUTE FUNCTION calcular_rango_ocupado();

-- Constraint: en una misma sala, dos funciones NO pueden solaparse
-- (incluyendo el margen de limpieza). PostgreSQL lo rechaza a nivel de BD.
ALTER TABLE funciones
    ADD CONSTRAINT no_solapamiento_sala
    EXCLUDE USING gist (
        id_sala WITH =,
        rango_ocupado WITH &&
    );

-- =========================================================
-- 6. DISPONIBILIDAD DE ASIENTOS POR FUNCIÓN (N:M funciones-asientos)
-- =========================================================
CREATE TABLE disponibilidad_asiento (
    id_funcion      INT NOT NULL REFERENCES funciones(id_funcion),
    id_asiento      INT NOT NULL REFERENCES asientos(id_asiento),
    estado          VARCHAR(20) DEFAULT 'disponible' CHECK (estado IN ('disponible','ocupado','cancelada')),
    PRIMARY KEY (id_funcion, id_asiento)
);

-- Trigger: al crear una función, generar automáticamente la disponibilidad
-- de todos los asientos de su sala
CREATE OR REPLACE FUNCTION crear_disponibilidad_funcion()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO disponibilidad_asiento (id_funcion, id_asiento, estado)
    SELECT NEW.id_funcion, id_asiento, 'disponible'
    FROM asientos
    WHERE id_sala = NEW.id_sala;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_crear_disponibilidad
AFTER INSERT ON funciones
FOR EACH ROW
EXECUTE FUNCTION crear_disponibilidad_funcion();

-- Trigger: al cancelar una función, marcar sus asientos como 'cancelada'
-- (no se eliminan filas, para conservar trazabilidad/auditoría)
CREATE OR REPLACE FUNCTION cancelar_disponibilidad_funcion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.estado = 'cancelada' AND OLD.estado != 'cancelada' THEN
        UPDATE disponibilidad_asiento
        SET estado = 'cancelada'
        WHERE id_funcion = NEW.id_funcion;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cancelar_disponibilidad
AFTER UPDATE ON funciones
FOR EACH ROW
EXECUTE FUNCTION cancelar_disponibilidad_funcion();

-- =========================================================
-- 7. PROMOCIONES (CU06 - Gestión de promociones)
-- =========================================================
CREATE TABLE promociones (
    id_promocion    SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    tipo_descuento  VARCHAR(20) NOT NULL CHECK (tipo_descuento IN ('porcentaje','monto_fijo')),
    valor           NUMERIC(10,2) NOT NULL,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    activa          BOOLEAN DEFAULT TRUE
);

-- N:M entre promociones y funciones
CREATE TABLE promocion_funcion (
    id_promocion    INT NOT NULL REFERENCES promociones(id_promocion),
    id_funcion      INT NOT NULL REFERENCES funciones(id_funcion),
    PRIMARY KEY (id_promocion, id_funcion)
);

-- =========================================================
-- 8. VENTAS (CU02 - Comprar entradas / CU05 - Generar reportes)
-- =========================================================
CREATE TABLE ventas (
    id_venta                    SERIAL PRIMARY KEY,
    id_usuario_cliente          INT REFERENCES usuarios(id_usuario), -- opcional (venta anónima)
    id_funcion                  INT NOT NULL REFERENCES funciones(id_funcion),
    id_promocion                INT REFERENCES promociones(id_promocion), -- opcional
    fecha_hora                  TIMESTAMP DEFAULT NOW(),
    subtotal                    NUMERIC(10,2) NOT NULL,
    descuento_aplicado          NUMERIC(10,2) DEFAULT 0,
    total                       NUMERIC(10,2) NOT NULL,
    confirmacion_no_reembolso   BOOLEAN NOT NULL DEFAULT FALSE, -- RF03
    confirmacion_verbal_check   BOOLEAN NOT NULL DEFAULT FALSE, -- RF19 (double check)
    tipo_registro               VARCHAR(30) DEFAULT 'voz' CHECK (tipo_registro IN ('voz','manual')),
    estado                      VARCHAR(30) NOT NULL DEFAULT 'pendiente'
                                 CHECK (estado IN ('pendiente', 'confirmada', 'pendiente_pago', 'pagada', 'anulada', 'cancelada')),
    metodo_pago_elegido         VARCHAR(30)
                                 CHECK (metodo_pago_elegido IS NULL OR metodo_pago_elegido IN ('stripe', 'qr', 'efectivo', 'tarjeta')),
    fecha_pago                  TIMESTAMP,
    id_pago_activo              INT -- FK agregada más abajo (pagos referencia ventas primero)
);

CREATE TABLE detalle_venta_entradas (
    id_detalle      SERIAL PRIMARY KEY,
    id_venta        INT NOT NULL REFERENCES ventas(id_venta),
    id_asiento      INT NOT NULL REFERENCES asientos(id_asiento),
    precio_unitario NUMERIC(10,2) NOT NULL
);

-- =========================================================
-- 8b. DULCERÍA (CU09 / RF20) — alcance simplificado:
--     cada combinación de tamaño/sabor es un producto distinto
--     en la tabla, sin motor genérico de variantes/modificadores.
--     Reutiliza la misma tabla `ventas` que las entradas: una
--     venta puede tener filas en detalle_venta_entradas Y en
--     detalle_venta_dulceria al mismo tiempo (un solo carrito).
-- =========================================================
CREATE TABLE categorias_dulceria (
    id_categoria         SERIAL PRIMARY KEY,
    nombre               VARCHAR(60) NOT NULL,     -- 'Combos', 'Popcorn', 'Bebidas', 'Nachos', 'Dulces'
    orden_visualizacion  INT DEFAULT 0,
    icono                VARCHAR(50)
);

CREATE TABLE productos_dulceria (
    id_producto     SERIAL PRIMARY KEY,
    id_categoria    INT NOT NULL REFERENCES categorias_dulceria(id_categoria),
    nombre          VARCHAR(120) NOT NULL,
    descripcion     TEXT,
    precio_base     NUMERIC(10,2) NOT NULL,
    tipo            VARCHAR(20) DEFAULT 'individual' CHECK (tipo IN ('individual','combo')),
    etiqueta        VARCHAR(40),                   -- 'Bestseller', 'Ahorro 25%'
    disponible      BOOLEAN DEFAULT TRUE
);

CREATE TABLE detalle_venta_dulceria (
    id_detalle       SERIAL PRIMARY KEY,
    id_venta         INT NOT NULL REFERENCES ventas(id_venta),
    id_producto      INT NOT NULL REFERENCES productos_dulceria(id_producto),
    cantidad         INT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    precio_unitario  NUMERIC(10,2) NOT NULL
);

-- =========================================================
-- 9. PAGOS (Stripe / QR / efectivo / tarjeta) — soporta RF04
-- =========================================================
CREATE TABLE pagos (
    id_pago                     SERIAL PRIMARY KEY,
    id_venta                    INT NOT NULL REFERENCES ventas(id_venta),

    monto                       NUMERIC(10,2) NOT NULL,
    moneda                      VARCHAR(3) DEFAULT 'BOB' CHECK (moneda IN ('BOB', 'USD', 'EUR')),
    metodo_pago                 VARCHAR(30) NOT NULL CHECK (metodo_pago IN ('stripe', 'qr', 'efectivo', 'tarjeta')),

    estado                      VARCHAR(30) NOT NULL DEFAULT 'pendiente'
                                 CHECK (estado IN ('pendiente', 'procesando', 'exitoso', 'fallido', 'reembolsado', 'cancelado')),

    fecha_creacion               TIMESTAMP DEFAULT NOW(),
    fecha_procesamiento          TIMESTAMP,
    fecha_confirmacion           TIMESTAMP,

    -- Stripe (cuando aplica)
    stripe_payment_intent_id     VARCHAR(100),
    stripe_client_secret         VARCHAR(200),
    stripe_charge_id             VARCHAR(100),
    stripe_customer_id           VARCHAR(100),

    -- QR (cuando aplica)
    qr_codigo                    VARCHAR(100),
    qr_imagen_url                VARCHAR(500),
    qr_fecha_expiracion          TIMESTAMP,
    qr_escaneado                 BOOLEAN DEFAULT FALSE,
    qr_fecha_escaneo             TIMESTAMP,

    -- Datos adicionales
    referencia_externa           VARCHAR(200),
    metadata                     JSONB,

    -- Auditoría
    ip_origen                    INET,
    user_agent                   TEXT,
    nivel_despliegue             VARCHAR(30) -- Nivel 1, 2, 3 (RF15)
);

-- Ahora sí se puede cerrar la referencia circular ventas <-> pagos:
-- ventas.id_pago_activo señala cuál es el pago vigente de esa venta.
ALTER TABLE ventas
    ADD CONSTRAINT ventas_pago_activo_fkey
    FOREIGN KEY (id_pago_activo) REFERENCES pagos(id_pago);

-- =========================================================
-- 10. TRAZABILIDAD (RF12 - historial/log de acciones del admin)
-- =========================================================
CREATE TABLE log_acciones (
    id_log              SERIAL PRIMARY KEY,
    id_usuario          INT NOT NULL REFERENCES usuarios(id_usuario),
    accion              TEXT NOT NULL,
    fecha_hora          TIMESTAMP DEFAULT NOW(),
    nivel_despliegue    VARCHAR(30) -- servidor local, laptop, móvil
);

-- =========================================================
-- 11. INTERACCIONES DE IA / UI GENERATIVA (CU08, RF18)
-- =========================================================
CREATE TABLE interacciones_ia (
    id_interaccion      SERIAL PRIMARY KEY,
    id_usuario          INT NOT NULL REFERENCES usuarios(id_usuario),
    id_funcion          INT REFERENCES funciones(id_funcion), -- opcional, si aplica al contexto
    intencion_detectada VARCHAR(100) NOT NULL, -- ej: "consultar_cartelera", "comprar_entrada"
    widget_generado     VARCHAR(50), -- MovieGridWidget, SeatingMapWidget, DigitalTicketWidget
    texto_transcrito    TEXT,
    fecha_hora          TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- ÍNDICES RECOMENDADOS
-- =========================================================
CREATE INDEX idx_funciones_pelicula ON funciones(id_pelicula);
CREATE INDEX idx_funciones_sala_fecha ON funciones(id_sala, fecha);
CREATE INDEX idx_ventas_funcion ON ventas(id_funcion);
CREATE INDEX idx_ventas_usuario ON ventas(id_usuario_cliente);
CREATE INDEX idx_ventas_estado ON ventas(estado);
CREATE INDEX idx_ventas_fecha_pago ON ventas(fecha_pago) WHERE fecha_pago IS NOT NULL;
CREATE INDEX idx_ventas_pago_activo ON ventas(id_pago_activo) WHERE id_pago_activo IS NOT NULL;
CREATE INDEX idx_disponibilidad_funcion ON disponibilidad_asiento(id_funcion);
CREATE INDEX idx_log_usuario ON log_acciones(id_usuario);
CREATE INDEX idx_interacciones_usuario ON interacciones_ia(id_usuario);
CREATE INDEX idx_pagos_venta ON pagos(id_venta);
CREATE INDEX idx_pagos_estado ON pagos(estado);
CREATE UNIQUE INDEX idx_pagos_stripe_intent ON pagos(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX idx_pagos_qr_codigo ON pagos(qr_codigo) WHERE qr_codigo IS NOT NULL;
CREATE INDEX idx_productos_dulceria_categoria ON productos_dulceria(id_categoria);
CREATE INDEX idx_detalle_dulceria_venta ON detalle_venta_dulceria(id_venta);

-- =========================================================
-- FIN DEL SCRIPT
-- =========================================================

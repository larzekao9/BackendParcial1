-- =========================================================
-- BASE DE DATOS: SISTEMA DE CINE CON AGENTE DE VOZ (IA)
-- PostgreSQL / Supabase
-- Segundo Parcial
-- =========================================================

-- Extensión necesaria para validar solapamiento de horarios (CU04 / RF07)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =========================================================
-- 1. USUARIOS Y ROLES (soporta RF11 - validar rol del hablante)
-- =========================================================
CREATE TABLE usuarios (
    id_usuario      SERIAL PRIMARY KEY,
    nombre          VARCHAR(150) NOT NULL,
    rol             VARCHAR(20) NOT NULL CHECK (rol IN ('cliente', 'administrador')),
    metodo_auth     VARCHAR(50),
    fecha_registro  TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- 2. CATÁLOGO: PELÍCULAS (CU03 - Gestionar cartelera)
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
-- =========================================================
CREATE TABLE salas (
    id_sala             SERIAL PRIMARY KEY,
    nombre              VARCHAR(50) NOT NULL,
    capacidad           INT NOT NULL,
    tipo                VARCHAR(30), -- 2D, 3D, VIP
    tiempo_limpieza_min INT NOT NULL DEFAULT 20 -- margen por defecto entre funciones
);

CREATE TABLE asientos (
    id_asiento      SERIAL PRIMARY KEY,
    id_sala         INT NOT NULL REFERENCES salas(id_sala),
    fila            VARCHAR(5) NOT NULL,
    numero          INT NOT NULL,
    tipo            VARCHAR(20) DEFAULT 'normal', -- normal, preferencial
    UNIQUE (id_sala, fila, numero)
);

-- =========================================================
-- 4. PRECIOS (CU07 - Gestión de precio)
-- =========================================================
CREATE TABLE precios (
    id_precio       SERIAL PRIMARY KEY,
    tipo_asiento    VARCHAR(20) NOT NULL, -- normal, preferencial, VIP
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
    estado          VARCHAR(20) DEFAULT 'disponible' CHECK (estado IN ('disponible','ocupado')),
    PRIMARY KEY (id_funcion, id_asiento)
);

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
    tipo_registro               VARCHAR(30) DEFAULT 'voz' CHECK (tipo_registro IN ('voz','manual'))
);

CREATE TABLE detalle_venta_entradas (
    id_detalle      SERIAL PRIMARY KEY,
    id_venta        INT NOT NULL REFERENCES ventas(id_venta),
    id_asiento      INT NOT NULL REFERENCES asientos(id_asiento),
    precio_unitario NUMERIC(10,2) NOT NULL
);

-- =========================================================
-- 9. TRAZABILIDAD (RF12 - historial/log de acciones del admin)
-- =========================================================
CREATE TABLE log_acciones (
    id_log              SERIAL PRIMARY KEY,
    id_usuario          INT NOT NULL REFERENCES usuarios(id_usuario),
    accion              TEXT NOT NULL,
    fecha_hora          TIMESTAMP DEFAULT NOW(),
    nivel_despliegue    VARCHAR(30) -- servidor local, laptop, móvil
);

-- =========================================================
-- 10. INTERACCIONES DE IA / UI GENERATIVA (CU08, RF18)
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
-- ÍNDICES RECOMENDADOS (rendimiento en consultas de reportes y disponibilidad)
-- =========================================================
CREATE INDEX idx_funciones_pelicula ON funciones(id_pelicula);
CREATE INDEX idx_funciones_sala_fecha ON funciones(id_sala, fecha);
CREATE INDEX idx_ventas_funcion ON ventas(id_funcion);
CREATE INDEX idx_ventas_usuario ON ventas(id_usuario_cliente);
CREATE INDEX idx_disponibilidad_funcion ON disponibilidad_asiento(id_funcion);
CREATE INDEX idx_log_usuario ON log_acciones(id_usuario);
CREATE INDEX idx_interacciones_usuario ON interacciones_ia(id_usuario);

-- =========================================================
-- FIN DEL SCRIPT
-- =========================================================
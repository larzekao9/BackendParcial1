#!/usr/bin/env node --experimental-strip-types
/**
 * Seed script completo para base de datos local
 * 
 * Ejecuta:
 *   1. Schema (ya lo hace docker-entrypoint-initdb.d)
 *   2. Datos base (películas, salas, precios, promos, usuarios, dulcería)
 *   3. Funciones adicionales (Jul-Dic 2026)
 *   4. Ventas masivas (~1000) + detalles + pagos + dulcería
 * 
 * Uso:
 *   docker compose -f docker-compose.local.yml up -d postgres
 *   npm run seed:local
 * 
 * O directamente:
 *   npx tsx src/seeds/seed-complete.ts
 */

// Cargar .env.local SOLO si no hay variables de entorno explícitas (para desarrollo local)
import 'dotenv/config';
import { config } from 'dotenv';
const isProductionSeed = process.env.DB_HOST && process.env.DB_HOST !== 'postgres' && process.env.DB_HOST !== 'localhost';
if (!isProductionSeed) {
  config({ path: '.env.local', override: true });
}

// Al ejecutar desde host (no Docker), usar localhost en lugar del nombre del servicio
if (process.env.DB_HOST === 'postgres') {
  process.env.DB_HOST = 'localhost';
}

import { DataSource } from 'typeorm';
import { ENTITIES } from '../database/entities/index.js';
import { Pelicula } from '../database/entities/pelicula.entity.js';
import { Sala } from '../database/entities/sala.entity.js';
import { Asiento } from '../database/entities/asiento.entity.js';
import { Precio } from '../database/entities/precio.entity.js';
import { Funcion } from '../database/entities/funcion.entity.js';
import { DisponibilidadAsiento } from '../database/entities/disponibilidad-asiento.entity.js';
import { Promocion } from '../database/entities/promocion.entity.js';
import { PromocionFuncion } from '../database/entities/promocion-funcion.entity.js';
import { Usuario } from '../database/entities/usuario.entity.js';
import { CategoriaDulceria } from '../database/entities/categoria-dulceria.entity.js';
import { ProductoDulceria } from '../database/entities/producto-dulceria.entity.js';
import { Venta } from '../database/entities/venta.entity.js';
import { DetalleVentaEntrada } from '../database/entities/detalle-venta-entrada.entity.js';
import { DetalleVentaDulceria } from '../database/entities/detalle-venta-dulceria.entity.js';
import { Pago } from '../database/entities/pago.entity.js';
import { LogAccion } from '../database/entities/log-accion.entity.js';

const DATA_SOURCE = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'cine_ia',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: ENTITIES,
  synchronize: false,
  logging: true,
});

// ============================================================
// UTILIDADES
// ============================================================
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFloat = (min: number, max: number, decimals = 2) => Number((Math.random() * (max - min) + min).toFixed(decimals));
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
const weightedPick = <T>(items: T[], weights: number[]): T => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function randomTime(): string {
  const h = randInt(10, 22);
  const m = pick([0, 15, 30, 45]);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
}

// ============================================================
// SEMILLA PRINCIPAL
// ============================================================
async function seed() {
  console.log('🌱 Iniciando seed completo...');
  console.log('📡 Configuración DS:', {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'cine_ia',
  });
  console.log('🔌 Inicializando DataSource...');
  await DATA_SOURCE.initialize();
  console.log('✅ Conectado a Postgres local');

  const queryRunner = DATA_SOURCE.createQueryRunner();
  console.log('📡 QueryRunner creado');
  await queryRunner.connect();
  console.log('🔗 QueryRunner conectado');
  await queryRunner.startTransaction();
  console.log('🔄 Transacción iniciada');

  try {
    // ------------------------------------------------------------------
    // 0. INSERTAR DATOS BASE (películas, salas, precios, usuarios, promos, dulcería)
    // ------------------------------------------------------------------
    console.log('\n📦 0. Insertando datos base...');
    
    // Precios
    const preciosData = [
      { valor: 35.00, vigenteDesde: new Date('2020-01-01'), vigenteHasta: null },
      { valor: 55.00, vigenteDesde: new Date('2020-01-01'), vigenteHasta: null },
      { valor: 100.00, vigenteDesde: new Date('2026-10-09'), vigenteHasta: new Date('2026-12-31') },
    ];
    for (const p of preciosData) {
      const existe = await queryRunner.manager.findOne(Precio, { where: { valor: p.valor, vigenteDesde: p.vigenteDesde } });
      if (!existe) await queryRunner.manager.save(queryRunner.manager.create(Precio, p));
    }
    console.log('   ✅ Precios insertados');

    // Salas
    const salasData = [
      { nombre: 'Sala 1 - IMAX Laser', capacidad: 40, tipo: '3D', tiempoLimpiezaMin: 20 },
      { nombre: 'Sala 2 - VIP Atmos', capacidad: 24, tipo: 'VIP', tiempoLimpiezaMin: 20 },
      { nombre: 'Sala 3 - Estándar 2D', capacidad: 50, tipo: '2D', tiempoLimpiezaMin: 20 },
    ];
    const salasCreadas: Sala[] = [];
    for (const s of salasData) {
      const existe = await queryRunner.manager.findOne(Sala, { where: { nombre: s.nombre } });
      if (!existe) {
        const created = await queryRunner.manager.save(queryRunner.manager.create(Sala, s));
        salasCreadas.push(created);
      } else {
        salasCreadas.push(existe);
      }
    }
    console.log(`   ✅ Salas insertadas: ${salasCreadas.length}`);

    // Asientos para cada sala
    for (const sala of salasCreadas) {
      const existeAsientos = await queryRunner.manager.count(Asiento, { where: { idSala: sala.idSala } });
      if (existeAsientos === 0) {
        const filas = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        const asientosPorFila = Math.ceil(sala.capacidad / filas.length);
        const asientosData: any[] = [];
        let count = 0;
        for (const fila of filas) {
          for (let num = 1; num <= asientosPorFila && count < sala.capacidad; num++) {
            asientosData.push({ idSala: sala.idSala, fila, numero: num });
            count++;
          }
        }
        await queryRunner.manager.save(
          asientosData.map(d => queryRunner.manager.create(Asiento, d))
        );
      }
    }
    console.log('   ✅ Asientos creados');

    // Películas (las 6 activas reales)
    const peliculasData = [
      { titulo: 'Oppenheimer', genero: 'Drama/Histórico', duracionMin: 180, clasificacion: 'R', estado: 'activa', posterUrl: '', sinopsis: 'La historia del físico J. Robert Oppenheimer y su papel en el desarrollo de la bomba atómica.' },
      { titulo: 'Spider-Man: Beyond', genero: 'Acción/Aventura', duracionMin: 140, clasificacion: 'PG-13', estado: 'activa', posterUrl: '', sinopsis: 'Nueva aventura de Spider-Man en el multiverso.' },
      { titulo: 'El Viaje de Chihiro', genero: 'Animación/Fantasía', duracionMin: 125, clasificacion: 'PG', estado: 'activa', posterUrl: '', sinopsis: 'Una niña de 10 años entra en un mundo espiritual para salvar a sus padres.' },
      { titulo: 'Blade Runner 2049', genero: 'Ciencia Ficción', duracionMin: 164, clasificacion: 'R', estado: 'activa', posterUrl: '', sinopsis: 'Un joven blade runner descubre un secreto que podría sumir a la sociedad en el caos.' },
      { titulo: 'Mad Max: Furia en el camino', genero: 'Acción/Aventura', duracionMin: 120, clasificacion: 'R', estado: 'activa', posterUrl: '', sinopsis: 'En un páramo postapocalíptico, Max ayuda a Furiosa a escapar de un tirano.' },
      { titulo: 'Top Gun: Maverick', genero: 'Acción/Drama', duracionMin: 130, clasificacion: 'PG-13', estado: 'activa', posterUrl: '', sinopsis: 'Maverick entrena a una nueva generación de pilotos para una misión imposible.' },
    ];
    const peliculasCreadas: Pelicula[] = [];
    for (const p of peliculasData) {
      const existe = await queryRunner.manager.findOne(Pelicula, { where: { titulo: p.titulo } });
      if (!existe) {
        const created = await queryRunner.manager.save(queryRunner.manager.create(Pelicula, p));
        peliculasCreadas.push(created);
      } else {
        peliculasCreadas.push(existe);
      }
    }
    console.log(`   ✅ Películas insertadas: ${peliculasCreadas.length}`);

    // Usuarios (clientes + admins)
    const usuariosData = [
      { nombre: 'Admin Local', rol: 'administrador', metodoAuth: 'local', email: 'admin@local.com', googleId: null },
      { nombre: 'Cliente Test 1', rol: 'cliente', metodoAuth: 'local', email: 'cliente1@test.com', googleId: null },
      { nombre: 'Cliente Test 2', rol: 'cliente', metodoAuth: 'local', email: 'cliente2@test.com', googleId: null },
      { nombre: 'Cliente Test 3', rol: 'cliente', metodoAuth: 'local', email: 'cliente3@test.com', googleId: null },
      { nombre: 'Cliente Test 4', rol: 'cliente', metodoAuth: 'local', email: 'cliente4@test.com', googleId: null },
      { nombre: 'Cliente Test 5', rol: 'cliente', metodoAuth: 'local', email: 'cliente5@test.com', googleId: null },
    ];
    const usuariosCreados: Usuario[] = [];
    for (const u of usuariosData) {
      const existe = await queryRunner.manager.findOne(Usuario, { where: { email: u.email } });
      if (!existe) {
        const created = await queryRunner.manager.save(queryRunner.manager.create(Usuario, u));
        usuariosCreados.push(created);
      } else {
        usuariosCreados.push(existe);
      }
    }
    console.log(`   ✅ Usuarios insertados: ${usuariosCreados.length}`);

    // Promociones
    const promocionesData = [
      { nombre: 'Martes de Cine', descripcion: '20% de descuento en entradas todos los martes.', tipoDescuento: 'porcentaje', valor: 20.00, fechaInicio: new Date('2026-09-19'), fechaFin: new Date('2027-01-17'), activa: true },
      { nombre: 'Estudiantes', descripcion: '15% de descuento en entradas presentando carnet universitario.', tipoDescuento: 'porcentaje', valor: 15.00, fechaInicio: new Date('2026-09-19'), fechaFin: new Date('2027-01-17'), activa: true },
      { nombre: 'Miércoles Familiar', descripcion: 'Bs 10 de descuento en entradas para toda la familia.', tipoDescuento: 'monto_fijo', valor: 10.00, fechaInicio: new Date('2026-09-19'), fechaFin: new Date('2027-01-17'), activa: true },
    ];
    const promocionesCreadas: Promocion[] = [];
    for (const p of promocionesData) {
      const existe = await queryRunner.manager.findOne(Promocion, { where: { nombre: p.nombre } });
      if (!existe) {
        const created = await queryRunner.manager.save(queryRunner.manager.create(Promocion, p));
        promocionesCreadas.push(created);
      } else {
        promocionesCreadas.push(existe);
      }
    }
    console.log(`   ✅ Promociones insertadas: ${promocionesCreadas.length}`);

    // Categorías dulcería
    const categoriasData = [
      { nombre: 'Combos', ordenVisualizacion: 0, icono: 'fastfood' },
      { nombre: 'Popcorn', ordenVisualizacion: 1, icono: 'local_movies' },
      { nombre: 'Bebidas', ordenVisualizacion: 2, icono: 'local_cafe' },
      { nombre: 'Nachos', ordenVisualizacion: 3, icono: 'tapas' },
    ];
    const categoriasCreadas: CategoriaDulceria[] = [];
    for (const c of categoriasData) {
      const existe = await queryRunner.manager.findOne(CategoriaDulceria, { where: { nombre: c.nombre } });
      if (!existe) {
        const created = await queryRunner.manager.save(queryRunner.manager.create(CategoriaDulceria, c));
        categoriasCreadas.push(created);
      } else {
        categoriasCreadas.push(existe);
      }
    }
    console.log(`   ✅ Categorías dulcería insertadas: ${categoriasCreadas.length}`);

    // Productos dulcería
    const catMap = new Map(categoriasCreadas.map(c => [c.nombre, c.idCategoria]));
    const productosData = [
      { idCategoria: catMap.get('Combos')!, nombre: 'Combo Pareja Épico', descripcion: 'Popcorn gigante mitad mantequilla, mitad caramelo, con 2 bebidas de 1L a elección.', precioBase: 65.00, tipo: 'combo', etiqueta: 'Bestseller', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Combos')!, nombre: 'Combo Individual', descripcion: 'Popcorn mediano y una bebida de 500 ml.', precioBase: 45.00, tipo: 'combo', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Combos')!, nombre: 'Combo Familiar', descripcion: 'Popcorn grande, nachos y cuatro bebidas de 500 ml.', precioBase: 110.00, tipo: 'combo', etiqueta: 'Familiar', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Popcorn')!, nombre: 'Popcorn Trufa Negra', descripcion: 'Maíz mushroom premium con mantequilla clarificada y esencia de trufa negra.', precioBase: 35.00, tipo: 'individual', etiqueta: 'Gourmet', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Popcorn')!, nombre: 'Popcorn Clásico Mediano', descripcion: 'Popcorn recién hecho con mantequilla.', precioBase: 28.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Popcorn')!, nombre: 'Popcorn Clásico Grande', descripcion: 'Popcorn recién hecho con mantequilla, tamaño grande.', precioBase: 38.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Popcorn')!, nombre: 'Popcorn Caramelo Grande', descripcion: 'Popcorn caramelizado, tamaño grande.', precioBase: 42.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Bebidas')!, nombre: 'Coca-Cola Zero 1L', descripcion: 'Bebida gaseosa 1 litro.', precioBase: 15.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Bebidas')!, nombre: 'Coca-Cola 500 ml', descripcion: 'Gaseosa Coca-Cola de 500 ml.', precioBase: 15.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Bebidas')!, nombre: 'Agua Mineral 500 ml', descripcion: 'Agua mineral sin gas de 500 ml.', precioBase: 10.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Bebidas')!, nombre: 'Jugo de Naranja 400 ml', descripcion: 'Jugo de naranja natural de 400 ml.', precioBase: 14.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Bebidas')!, nombre: 'Soda Gigante', descripcion: 'Bebibles', precioBase: 65.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Nachos')!, nombre: 'Nachos Supreme VIP', descripcion: 'Totopos artesanales con doble porción de queso cheddar fundido y guacamole fresco.', precioBase: 40.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
      { idCategoria: catMap.get('Nachos')!, nombre: 'Nachos con Queso', descripcion: 'Nachos crocantes con salsa de queso cheddar.', precioBase: 30.00, tipo: 'individual', etiqueta: '', disponible: true, imagenUrl: '' },
    ];
    for (const p of productosData) {
      const existe = await queryRunner.manager.findOne(ProductoDulceria, { where: { nombre: p.nombre } });
      if (!existe) {
        await queryRunner.manager.save(queryRunner.manager.create(ProductoDulceria, p));
      }
    }
    console.log('   ✅ Productos dulcería insertados');

    // ------------------------------------------------------------------
    // 1. VERIFICAR DATOS BASE INSERTADOS
    // ------------------------------------------------------------------
    console.log('\n📦 1. Verificando datos base insertados...');
    
    const peliculasActivas = await queryRunner.manager.find(Pelicula, {
      where: { estado: 'activa' },
    });
    console.log(`   Películas activas: ${peliculasActivas.length}`);
    peliculasActivas.forEach(p => console.log(`     - ${p.titulo} (${p.duracion_min}min) ID:${p.idPelicula}`));

    // Salas
    const salas = await queryRunner.manager.find(Sala);
    console.log(`   Salas: ${salas.length}`);
    salas.forEach(s => console.log(`     - ${s.nombre} (${s.capacidad} asientos, ${s.tipo}) ID:${s.idSala}`));

    // Precios
    const precios = await queryRunner.manager.find(Precio);
    console.log(`   Precios: ${precios.length}`);
    precios.forEach(p => console.log(`     - ${p.valor} Bs (desde: ${p.vigenteDesde}) ID:${p.idPrecio}`));

    // Promociones activas
    const promociones = await queryRunner.manager.find(Promocion, {
      where: { activa: true },
    });
    console.log(`   Promociones activas: ${promociones.length}`);

    // Usuarios
    const usuarios = await queryRunner.manager.find(Usuario);
    const clientes = usuarios.filter(u => u.rol === 'cliente');
    const admins = usuarios.filter(u => u.rol === 'administrador');
    console.log(`   Usuarios: ${usuarios.length} (${clientes.length} clientes, ${admins.length} admins)`);

    // Dulcería
    const categorias = await queryRunner.manager.find(CategoriaDulceria);
    const productos = await queryRunner.manager.find(ProductoDulceria, { where: { disponible: true } });
    console.log(`   Dulcería: ${categorias.length} categorías, ${productos.length} productos`);

    // ------------------------------------------------------------------
    // 2. CREAR FUNCIONES ADICIONALES (Jul - Dic 2026)
    // ------------------------------------------------------------------
    console.log('\n🎬 2. Creando funciones adicionales (Jul-Dic 2026)...');
    
    // Usar salas por tipo en lugar de IDs hardcodeados
    const salasIMAX = salas.filter(s => s.tipo === '3D');
    const salasVIP = salas.filter(s => s.tipo === 'VIP');
    const salas2D = salas.filter(s => s.tipo === '2D');
    const salasParaFunciones = [...salasIMAX, ...salasVIP, ...salas2D];
    
    const fechaBase = new Date('2026-07-01');
    const fechaFin = new Date('2026-12-31');
    
    // Cargar funciones existentes para detectar solapamientos
    const funcionesExistentes = await queryRunner.manager.find(Funcion, {
      order: { fecha: 'ASC', horaInicio: 'ASC' },
    });
    console.log(`   Funciones existentes: ${funcionesExistentes.length}`);
    
    // Track último horario ocupado por sala por fecha (incluyendo existentes)
    const salaHorarios: Map<string, Date> = new Map(); // key: "salaId-YYYY-MM-DD" -> last end datetime
    for (const f of funcionesExistentes) {
      if (f.fecha && f.horaFin) {
        const key = `${f.idSala}-${f.fecha}`;
        const fin = new Date(`${f.fecha}T${f.horaFin}`);
        const existing = salaHorarios.get(key);
        if (!existing || fin > existing) {
          salaHorarios.set(key, fin);
        }
      }
    }
    
    const fechasFunciones: Date[] = [];
    let funcionesCreadas = 0;
    
    for (let d = new Date(fechaBase); d <= fechaFin; d.setDate(d.getDate() + 1)) {
      // Solo algunos días tienen funciones (70% probabilidad)
      if (Math.random() > 0.3) continue;
      
      const peliculasDelDia = shuffle(peliculasActivas).slice(0, randInt(1, 3));
      
      for (const pelicula of peliculasDelDia) {
        const numFunciones = randInt(1, 2);
        
        for (let f = 0; f < numFunciones; f++) {
          const sala = pick(salasParaFunciones);
          const duracion = pelicula.duracionMin + randInt(10, 20); // película + limpieza
          
          // Calcular hora de inicio: después de la última función en esa sala ese día
          const salaKey = `${sala.idSala}-${formatDate(d)}`;
          let ultimaHoraFin = salaHorarios.get(salaKey);
          
          let horaInicio: Date;
          if (ultimaHoraFin) {
            // Empezar al menos 20 min después de la última función (limpieza)
            horaInicio = new Date(ultimaHoraFin.getTime() + 20 * 60 * 1000);
          } else {
            // Primera función del día en esa sala: entre 13:00 y 18:00
            const h = randInt(13, 18);
            const m = pick([0, 15, 30, 45]);
            horaInicio = new Date(d);
            horaInicio.setHours(h, m, 0, 0);
          }
          
          // Hora fin = inicio + duración
          const horaFin = new Date(horaInicio.getTime() + duracion * 60 * 1000);
          
          // Verificar que no pase de medianoche (la hora_fin debe ser en el mismo día)
          if (horaFin.getDate() !== horaInicio.getDate() || horaFin <= horaInicio) {
            continue; // saltar esta función
          }
          
          const horaInicioStr = horaInicio.toTimeString().slice(0, 8);
          const horaFinStr = horaFin.toTimeString().slice(0, 8);
          
          const precio = pick(precios);
          
          // Verificar solapamiento con funciones existentes en la misma sala/fecha
          const haySolapamiento = funcionesExistentes.some(existing => 
            existing.idSala === sala.idSala && 
            existing.fecha === formatDate(d) &&
            existing.horaInicio < horaFinStr && 
            existing.horaFin > horaInicioStr
          );
          
          if (haySolapamiento) {
            continue; // saltar esta función
          }
          
          // Verificar si ya existe función similar
          const existe = await queryRunner.manager.findOne(Funcion, {
            where: {
              idPelicula: pelicula.idPelicula,
              idSala: sala.idSala,
              fecha: formatDate(d),
              horaInicio: horaInicioStr,
            },
          });
          
          if (!existe && !haySolapamiento) {
            const funcion = queryRunner.manager.create(Funcion, {
              idPelicula: pelicula.idPelicula,
              idSala: sala.idSala,
              idPrecio: precio.idPrecio,
              fecha: formatDate(d),
              horaInicio: horaInicioStr,
              horaFin: horaFinStr,
              estado: d < new Date() ? 'cancelada' : 'programada',
              tiempoLimpiezaMin: 20,
            });
            try {
              await queryRunner.manager.save(funcion);
              // Actualizar última hora fin para esta sala/fecha
              salaHorarios.set(salaKey, horaFin);
              fechasFunciones.push(new Date(d));
              funcionesCreadas++;
              // Agregar a lista para futuras comprobaciones
              funcionesExistentes.push(funcion);
            } catch (error: any) {
              // Ignorar conflictos de solapamiento (constraint no_solapamiento_sala)
              if (error.code === '23P01' && error.constraint === 'no_solapamiento_sala') {
                console.log(`   ⚠️  Conflicto de horario en sala ${sala.idSala} ${formatDate(d)} ${horaInicioStr}-${horaFinStr}, saltando...`);
              } else {
                throw error;
              }
            }
          }
        }
      }
    }
    
    const todasFunciones = await queryRunner.manager.find(Funcion, {
      order: { fecha: 'ASC', horaInicio: 'ASC' },
    });
    console.log(`   Total funciones: ${todasFunciones.length} (${funcionesCreadas} nuevas)`);

    // ------------------------------------------------------------------
    // 3. ASIGNAR PROMOCIONES A FUNCIONES (funciones futuras)
    // ------------------------------------------------------------------
    console.log('\n🎫 3. Asignando promociones a funciones...');
    
    const funcionesFuturas = todasFunciones.filter(f => 
      f.estado === 'programada' && new Date(f.fecha) >= new Date('2026-09-01')
    );
    
    let promoAsignadas = 0;
    for (const funcion of funcionesFuturas) {
      if (Math.random() < 0.3) { // 30% de funciones tienen promo
        const promo = pick(promociones);
        const existe = await queryRunner.manager.findOne(PromocionFuncion, {
          where: { idPromocion: promo.idPromocion, idFuncion: funcion.idFuncion },
        });
        if (!existe) {
          await queryRunner.manager.save(
            queryRunner.manager.create(PromocionFuncion, {
              idPromocion: promo.idPromocion,
              idFuncion: funcion.idFuncion,
            })
          );
          promoAsignadas++;
        }
      }
    }
    console.log(`   Promociones asignadas: ${promoAsignadas}`);

    // ------------------------------------------------------------------
    // 4. GENERAR VENTAS MASIVAS (~1000)
    // ------------------------------------------------------------------
    console.log('\n💰 4. Generando ventas masivas (~1000)...');
    
    const ventasObjetivo = 1000;
    let ventasCreadas = 0;
    let ventasPagadas = 0;
    let ventasConDulceria = 0;
    
    // Obtener asientos por función para asignación rápida
    const asientosPorFuncion = new Map<number, Asiento[]>();
    for (const funcion of todasFunciones) {
      if (funcion.estado === 'cancelada') continue;
      const asientos = await queryRunner.manager.find(Asiento, {
        where: { idSala: funcion.idSala },
      });
      asientosPorFuncion.set(funcion.idFuncion, asientos);
    }
    
    // Obtener disponibilidad actual
    const disponibilidadMap = new Map<number, Map<number, string>>();
    for (const funcion of todasFunciones) {
      if (funcion.estado === 'cancelada') continue;
      const disps = await queryRunner.manager.find(DisponibilidadAsiento, {
        where: { idFuncion: funcion.idFuncion },
      });
      const map = new Map<number, string>();
      disps.forEach(d => map.set(d.idAsiento, d.estado));
      disponibilidadMap.set(funcion.idFuncion, map);
    }

    // Funciones disponibles para venta (programadas + pasadas no canceladas)
    const funcionesVenta = todasFunciones.filter(f => 
      f.estado === 'programada' || (f.estado === 'cancelada' && Math.random() < 0.1)
    );
    
    for (let i = 0; i < ventasObjetivo; i++) {
      const funcion = pick(funcionesVenta);
      const asientosSala = asientosPorFuncion.get(funcion.idFuncion) || [];
      const disps = disponibilidadMap.get(funcion.idFuncion) || new Map();
      
      // Filtrar asientos disponibles
      const asientosDisponibles = asientosSala.filter(a => 
        disps.get(a.idAsiento) === 'disponible'
      );
      
      if (asientosDisponibles.length === 0) continue;
      
      // 1-4 entradas por venta
      const numEntradas = weightedPick([1, 2, 3, 4], [50, 30, 15, 5]);
      const asientosSeleccionados = shuffle(asientosDisponibles).slice(0, numEntradas);
      
      // Precio unitario = precio de la función
      const precioUnitario = Number(funcion.idPrecio ? 
        precios.find(p => p.idPrecio === funcion.idPrecio)?.valor || 35 : 35);
      
      const subtotal = precioUnitario * numEntradas;
      
      // Promoción aleatoria (25%)
      let descuento = 0;
      let idPromocion: number | null = null;
      const promoFuncion = await queryRunner.manager.findOne(PromocionFuncion, {
        where: { idFuncion: funcion.idFuncion },
      });
      if (promoFuncion && Math.random() < 0.25) {
        const promo = promociones.find(p => p.idPromocion === promoFuncion.idPromocion);
        if (promo) {
          idPromocion = promo.idPromocion;
          if (promo.tipoDescuento === 'porcentaje') {
            descuento = Number((subtotal * Number(promo.valor) / 100).toFixed(2));
          } else {
            descuento = Math.min(Number(promo.valor), subtotal);
          }
        }
      }
      
      const total = Number((subtotal - descuento).toFixed(2));
      
      // Cliente (80% real, 20% anónimo)
      const idUsuarioCliente = Math.random() < 0.8 ? pick(clientes).idUsuario : null;
      
      // Estado de venta
      const estadoVenta = weightedPick(
        ['pagada', 'confirmada', 'pendiente_pago', 'cancelada', 'anulada'],
        [70, 15, 10, 3, 2]
      ) as Venta['estado'];
      
      // Fecha de venta: cerca de la fecha de la función (± 30 días antes, hasta el día)
      const fechaFuncion = new Date(funcion.fecha);
      const diasAntes = randInt(0, 30);
      const fechaVenta = addDays(fechaFuncion, -diasAntes);
      fechaVenta.setHours(randInt(8, 23), randInt(0, 59), randInt(0, 59));
      
      // Método de pago
      const metodoPago = estadoVenta === 'pagada' || estadoVenta === 'pendiente_pago'
        ? weightedPick(['efectivo', 'stripe', 'tarjeta', 'qr'], [40, 30, 20, 10])
        : null;
      
      // RF03 y RF19
      const confirmacionNoReembolso = true;
      const confirmacionVerbalCheck = estadoVenta === 'pagada' && Math.random() < 0.8;
      
      // Crear venta
      const venta = queryRunner.manager.create(Venta, {
        idUsuarioCliente,
        idFuncion: funcion.idFuncion,
        idPromocion,
        fechaHora: fechaVenta,
        subtotal: subtotal.toFixed(2),
        descuentoAplicado: descuento.toFixed(2),
        total: total.toFixed(2),
        confirmacionNoReembolso,
        confirmacionVerbalCheck,
        tipoRegistro: pick(['voz', 'manual']) as 'voz' | 'manual',
        estado: estadoVenta,
        metodoPagoElegido: metodoPago,
        fechaPago: estadoVenta === 'pagada' ? fechaVenta : null,
        idPagoActivo: null, // se actualiza después
      });
      
      const savedVenta = await queryRunner.manager.save(venta);
      ventasCreadas++;
      
      // Marcar asientos como ocupados (si pagada/confirmada)
      if (['pagada', 'confirmada', 'pendiente_pago'].includes(estadoVenta)) {
        for (const asiento of asientosSeleccionados) {
          await queryRunner.manager.save(
            queryRunner.manager.create(DetalleVentaEntrada, {
              idVenta: savedVenta.idVenta,
              idAsiento: asiento.idAsiento,
              precioUnitario: precioUnitario.toFixed(2),
            })
          );
          // Actualizar disponibilidad
          const disp = await queryRunner.manager.findOne(DisponibilidadAsiento, {
            where: { idFuncion: funcion.idFuncion, idAsiento: asiento.idAsiento },
          });
          if (disp) {
            disp.estado = 'ocupado';
            await queryRunner.manager.save(disp);
          }
        }
      }
      
      // Dulcería (40% de ventas)
      if (Math.random() < 0.4 && productos.length > 0) {
        ventasConDulceria++;
        const numItems = randInt(1, 3);
        const productosSel = shuffle(productos).slice(0, numItems);
        
        for (const producto of productosSel) {
          const cantidad = randInt(1, 2);
          await queryRunner.manager.save(
            queryRunner.manager.create(DetalleVentaDulceria, {
              idVenta: savedVenta.idVenta,
              idProducto: producto.idProducto,
              cantidad,
              precioUnitario: producto.precioBase.toString(),
            })
          );
        }
        // Actualizar total de la venta con dulcería
        const extraDulceria = productosSel.reduce((sum, p) => sum + Number(p.precioBase) * randInt(1, 2), 0);
        savedVenta.total = Number(savedVenta.total) + extraDulceria;
        await queryRunner.manager.save(savedVenta);
      }
      
      // Pago (para ventas pagadas y pendiente_pago)
      if (['pagada', 'pendiente_pago'].includes(estadoVenta) && metodoPago) {
        const estadoPago = estadoVenta === 'pagada' ? 'exitoso' : 'pendiente';
        const fechaProcesamiento = estadoVenta === 'pagada' ? fechaVenta : null;
        const fechaConfirmacion = estadoVenta === 'pagada' ? fechaVenta : null;
        
        const pago = queryRunner.manager.create(Pago, {
          idVenta: savedVenta.idVenta,
          monto: total.toFixed(2),
          moneda: 'BOB',
          metodoPago: metodoPago as 'efectivo' | 'stripe' | 'tarjeta' | 'qr',
          estado: estadoPago,
          fechaCreacion: fechaVenta,
          fechaProcesamiento,
          fechaConfirmacion,
          ipOrigen: '127.0.0.1',
          userAgent: 'Mozilla/5.0 (Local Seed Script)',
          nivelDespliegue: 'maquina_local',
          stripePaymentIntentId: metodoPago === 'stripe' ? `pi_test_${randInt(100000, 999999)}` : null,
          qrCodigo: metodoPago === 'qr' ? `QR_${savedVenta.idVenta}_${randInt(1000, 9999)}` : null,
          qrEscaneado: metodoPago === 'qr' && estadoVenta === 'pagada',
          qrFechaEscaneo: metodoPago === 'qr' && estadoVenta === 'pagada' ? fechaVenta : null,
        });
        
        const savedPago = await queryRunner.manager.save(pago);
        
        // Actualizar venta con id_pago_activo
        savedVenta.idPagoActivo = savedPago.idPago;
        await queryRunner.manager.save(savedVenta);
        
        if (estadoVenta === 'pagada') ventasPagadas++;
      }
      
      // Log de acción (para algunas ventas)
      if (Math.random() < 0.1) {
        await queryRunner.manager.save(
          queryRunner.manager.create(LogAccion, {
            idUsuario: pick(admins).idUsuario,
            accion: `Venta ${estadoVenta} creada via seed: ${savedVenta.idVenta} - ${total} Bs`,
            fechaHora: fechaVenta,
            nivelDespliegue: 'maquina_local',
            ipOrigen: '127.0.0.1',
            userAgent: 'Seed Script',
          })
        );
      }
      
      if (ventasCreadas % 100 === 0) {
        console.log(`   Progreso: ${ventasCreadas}/${ventasObjetivo} ventas...`);
      }
    }
    
    console.log(`   ✅ Ventas creadas: ${ventasCreadas}`);
    console.log(`   ✅ Ventas pagadas: ${ventasPagadas}`);
    console.log(`   ✅ Ventas con dulcería: ${ventasConDulceria}`);

    // ------------------------------------------------------------------
    // 5. ESTADÍSTICAS FINALES
    // ------------------------------------------------------------------
    console.log('\n📊 5. Estadísticas finales...');
    
    const stats = await Promise.all([
      queryRunner.manager.count(Venta),
      queryRunner.manager.count(Pago),
      queryRunner.manager.count(DetalleVentaEntrada),
      queryRunner.manager.count(DetalleVentaDulceria),
      queryRunner.manager.count(Funcion),
      queryRunner.manager.count(PromocionFuncion),
      queryRunner.manager.count(LogAccion),
    ]);
    
    console.log(`
   ┌─────────────────────┬───────┐
   │ Tabla               │ Count │
   ├─────────────────────┼───────┤
   │ ventas              │ ${String(stats[0]).padStart(5)} │
   │ pagos               │ ${String(stats[1]).padStart(5)} │
   │ detalle_entradas    │ ${String(stats[2]).padStart(5)} │
   │ detalle_dulceria    │ ${String(stats[3]).padStart(5)} │
   │ funciones           │ ${String(stats[4]).padStart(5)} │
   │ promocion_funcion   │ ${String(stats[5]).padStart(5)} │
   │ log_acciones        │ ${String(stats[6]).padStart(5)} │
   └─────────────────────┴───────┘
    `);
    
    // Ventas por estado
    const ventasPorEstado = await queryRunner.manager
      .createQueryBuilder(Venta, 'v')
      .select('v.estado', 'estado')
      .addSelect('COUNT(*)', 'count')
      .groupBy('v.estado')
      .getRawMany();
    console.log('   Ventas por estado:');
    ventasPorEstado.forEach(r => console.log(`     ${r.estado}: ${r.count}`));
    
    // Ventas por mes
    const ventasPorMes = await queryRunner.manager
      .createQueryBuilder(Venta, 'v')
      .select("DATE_TRUNC('month', v.fecha_hora)", 'mes')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(CAST(v.total AS DECIMAL))', 'total')
      .groupBy("DATE_TRUNC('month', v.fecha_hora)")
      .orderBy('mes')
      .getRawMany();
    console.log('   Ventas por mes:');
    ventasPorMes.forEach(r => console.log(`     ${r.mes}: ${r.count} ventas, ${Number(r.total).toFixed(2)} Bs`));
    
    await queryRunner.commitTransaction();
    console.log('\n✅ Seed completado exitosamente!');
    
  } catch (error) {
    await queryRunner.rollbackTransaction();
    console.error('❌ Error en seed:', error);
    throw error;
  } finally {
    await queryRunner.release();
    await DATA_SOURCE.destroy();
  }
}

// Ejecutar
seed()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

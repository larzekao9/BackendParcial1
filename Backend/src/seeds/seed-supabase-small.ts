#!/usr/bin/env node --experimental-strip-types
/**
 * Seed script for Supabase - very small batches to avoid pooler timeout
 */

import 'dotenv/config';
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
  host: process.env.DB_HOST || 'aws-0-us-west-2.pooler.supabase.com',
  port: parseInt(process.env.DB_PORT || '6543'),
  username: process.env.DB_USER || 'postgres.qepjfpzhlcauxviwjtqz',
  password: process.env.DB_PASSWORD || '1Parcial_SW226',
  database: process.env.DB_NAME || 'postgres',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: ENTITIES,
  synchronize: false,
  logging: false,
});

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[randInt(0, arr.length - 1)];
const shuffle = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
const weightedPick = <T>(items: T[], weights: number[]): T => {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
};
const addDays = (date: Date, days: number) => { const d = new Date(date); d.setDate(d.getDate() + days); return d; };
const formatDate = (date: Date): string => date.toISOString().split('T')[0];

async function seedSupabase() {
  console.log('🌱 Seed Supabase - micro-batches...');
  await DATA_SOURCE.initialize();
  console.log('✅ Conectado');

  const qr = DATA_SOURCE.createQueryRunner();
  await qr.connect();

  try {
    // Load reference data
    const peliculasActivas = await qr.manager.find(Pelicula, { where: { estado: 'activa' } });
    const salas = await qr.manager.find(Sala);
    const precios = await qr.manager.find(Precio);
    const salaTipos = [...salas.filter(s => s.tipo === '3D'), ...salas.filter(s => s.tipo === 'VIP'), ...salas.filter(s => s.tipo === '2D')];
    const clientes = (await qr.manager.find(Usuario)).filter(u => u.rol === 'cliente');
    const admins = (await qr.manager.find(Usuario)).filter(u => u.rol === 'administrador');
    const productos = await qr.manager.find(ProductoDulceria, { where: { disponible: true } });
    const promos = await qr.manager.find(Promocion, { where: { activa: true } });
    
    // Asientos por sala
    const asientosPorSala = new Map<number, Asiento[]>();
    for (const s of salas) {
      asientosPorSala.set(s.idSala, await qr.manager.find(Asiento, { where: { idSala: s.idSala } }));
    }

    // ---------- 1. FUNCIONES (lotes de 20) ----------
    console.log('\n🎬 1. Funciones adicionales...');
    const fechaBase = new Date('2026-07-01');
    const fechaFin = new Date('2026-12-31');
    const salaHorarios = new Map<string, Date>();
    const existingFuncs = await qr.manager.find(Funcion);
    for (const f of existingFuncs) if (f.fecha && f.horaFin) {
      const key = `${f.idSala}-${f.fecha}`;
      const fin = new Date(`${f.fecha}T${f.horaFin}`);
      if (!salaHorarios.has(key) || fin > salaHorarios.get(key)!) salaHorarios.set(key, fin);
    }

    let funcCount = 0;
    for (let d = new Date(fechaBase); d <= fechaFin; d.setDate(d.getDate() + 1)) {
      if (Math.random() > 0.3) continue;
      const peliculasDia = shuffle(peliculasActivas).slice(0, randInt(1, 3));
      for (const peli of peliculasDia) {
        for (let f = 0; f < randInt(1, 2); f++) {
          const sala = pick(salaTipos);
          const duracion = peli.duracionMin + randInt(10, 20);
          const salaKey = `${sala.idSala}-${formatDate(d)}`;
          let horaInicio: Date;
          if (salaHorarios.has(salaKey)) {
            horaInicio = new Date(salaHorarios.get(salaKey)!.getTime() + 20 * 60 * 1000);
          } else {
            horaInicio = new Date(d); horaInicio.setHours(randInt(13, 18), pick([0, 15, 30, 45]), 0, 0);
          }
          const horaFin = new Date(horaInicio.getTime() + duracion * 60 * 1000);
          if (horaFin.getDate() !== horaInicio.getDate()) continue;
          const hIni = horaInicio.toTimeString().slice(0, 8);
          const hFin = horaFin.toTimeString().slice(0, 8);
          const haySolapamiento = existingFuncs.some(ex => ex.idSala === sala.idSala && ex.fecha === formatDate(d) && ex.horaInicio < hFin && ex.horaFin > hIni);
          if (haySolapamiento) continue;
          const precio = pick(precios);
          const existe = await qr.manager.findOne(Funcion, { where: { idPelicula: peli.idPelicula, idSala: sala.idSala, fecha: formatDate(d), horaInicio: hIni } });
          if (!existe) {
            await qr.manager.save(qr.manager.create(Funcion, {
              idPelicula: peli.idPelicula, idSala: sala.idSala, idPrecio: precio.idPrecio,
              fecha: formatDate(d), horaInicio: hIni, horaFin: hFin, estado: d < new Date() ? 'cancelada' : 'programada',
              tiempoLimpiezaMin: 20
            }));
            salaHorarios.set(salaKey, horaFin);
            existingFuncs.push({ idSala: sala.idSala, fecha: formatDate(d), horaInicio: hIni, horaFin: hFin } as any);
            funcCount++;
          }
        }
      }
      if (funcCount % 20 === 0 && funcCount > 0) {
        console.log(`  ${funcCount} funciones...`);
      }
    }
    console.log(`   ✅ ${funcCount} funciones nuevas`);

    // ---------- 2. PROMOCIONES-FUNCIONES ----------
    console.log('\n🎫 2. Promociones a funciones...');
    const allFuncs = await qr.manager.find(Funcion);
    const futuras = allFuncs.filter(f => f.estado === 'programada' && new Date(f.fecha) >= new Date('2026-09-01'));
    let promoCount = 0;
    for (const fn of futuras) {
      if (Math.random() < 0.3) {
        const p = pick(promos);
        const ex = await qr.manager.findOne(PromocionFuncion, { where: { idPromocion: p.idPromocion, idFuncion: fn.idFuncion } });
        if (!ex) { await qr.manager.save(qr.manager.create(PromocionFuncion, { idPromocion: p.idPromocion, idFuncion: fn.idFuncion })); promoCount++; }
      }
    }
    console.log(`   ✅ ${promoCount} promociones asignadas`);

    // ---------- 3. VENTAS (micro-lotes de 20) ----------
    console.log('\n💰 3. Ventas (micro-lotes)...');
    const ventaFuncs = allFuncs.filter(f => f.estado === 'programada');
    let totalVentas = 0;
    const MICRO_LOTE = 20;
    const TOTAL_TARGET = 800; // target menor para Supabase

    for (let batch = 0; batch < TOTAL_TARGET / MICRO_LOTE; batch++) {
      await qr.startTransaction();
      try {
        for (let i = 0; i < MICRO_LOTE; i++) {
          const fn = pick(ventaFuncs);
          const asientosSala = asientosPorSala.get(fn.idSala) || [];
          const asientosDisp = asientosSala.filter(a => true); // simplified
          if (asientosDisp.length === 0) continue;
          const numEnt = weightedPick([1, 2, 3, 4], [50, 30, 15, 5]);
          const asientosSel = shuffle(asientosDisp).slice(0, numEnt);
          const precioU = Number(fn.idPrecio ? precios.find(p => p.idPrecio === fn.idPrecio)?.valor || 35 : 35);
          const subtotal = precioU * numEnt;
          
          let desc = 0, idPromo: number | null = null;
          const pf = await qr.manager.findOne(PromocionFuncion, { where: { idFuncion: fn.idFuncion } });
          if (pf && Math.random() < 0.25) {
            const pr = promos.find(p => p.idPromocion === pf.idPromocion);
            if (pr) { idPromo = pr.idPromocion; desc = pr.tipoDescuento === 'porcentaje' ? Number((subtotal * Number(pr.valor) / 100).toFixed(2)) : Math.min(Number(pr.valor), subtotal); }
          }
          const total = Number((subtotal - desc).toFixed(2));
          const idCli = Math.random() < 0.8 ? pick(clientes).idUsuario : null;
          const estado = weightedPick(['pagada', 'confirmada', 'pendiente_pago', 'cancelada', 'anulada'], [70, 15, 10, 3, 2]) as Venta['estado'];
          const diasAntes = randInt(0, 30);
          const fVenta = addDays(new Date(fn.fecha), -diasAntes);
          fVenta.setHours(randInt(8, 23), randInt(0, 59), randInt(0, 59));
          const metodo = estado === 'pagada' || estado === 'pendiente_pago' ? weightedPick(['efectivo', 'stripe', 'tarjeta', 'qr'], [40, 30, 20, 10]) : null;
          const confNR = true;
          const confVC = estado === 'pagada' && Math.random() < 0.8;
          
          const venta = await qr.manager.save(qr.manager.create(Venta, {
            idUsuarioCliente: idCli, idFuncion: fn.idFuncion, idPromocion: idPromo,
            fechaHora: fVenta, subtotal: subtotal.toFixed(2), descuentoAplicado: desc.toFixed(2), total: total.toFixed(2),
            confirmacionNoReembolso: confNR, confirmacionVerbalCheck: confVC,
            tipoRegistro: pick(['voz', 'manual']), estado, metodoPagoElegido: metodo,
            fechaPago: estado === 'pagada' ? fVenta : null, idPagoActivo: null
          }));
          totalVentas++;
          
          // Detalle entradas
          if (['pagada', 'confirmada', 'pendiente_pago'].includes(estado)) {
            for (const a of asientosSel) {
              await qr.manager.save(qr.manager.create(DetalleVentaEntrada, { idVenta: venta.idVenta, idAsiento: a.idAsiento, precioUnitario: precioU.toFixed(2) }));
              const disp = await qr.manager.findOne(DisponibilidadAsiento, { where: { idFuncion: fn.idFuncion, idAsiento: a.idAsiento } });
              if (disp) { disp.estado = 'ocupado'; await qr.manager.save(disp); }
            }
          }
          
          // Dulcería
          if (Math.random() < 0.4 && productos.length > 0) {
            const items = shuffle(productos).slice(0, randInt(1, 3));
            let extra = 0;
            for (const prod of items) {
              const cant = randInt(1, 2);
              await qr.manager.save(qr.manager.create(DetalleVentaDulceria, { idVenta: venta.idVenta, idProducto: prod.idProducto, cantidad: cant, precioUnitario: prod.precioBase.toString() }));
              extra += Number(prod.precioBase) * cant;
            }
            venta.total = Number(venta.total) + extra; await qr.manager.save(venta);
          }
          
          // Pago
          if (['pagada', 'pendiente_pago'].includes(estado) && metodo) {
            const ep = estado === 'pagada' ? 'exitoso' : 'pendiente';
            const pago = await qr.manager.save(qr.manager.create(Pago, {
              idVenta: venta.idVenta, monto: venta.total, moneda: 'BOB', metodoPago: metodo,
              estado: ep, fechaCreacion: fVenta, fechaProcesamiento: estado === 'pagada' ? fVenta : null,
              fechaConfirmacion: estado === 'pagada' ? fVenta : null,
              ipOrigen: '127.0.0.1', userAgent: 'Seed Script', nivelDespliegue: 'servidor_local',
              stripePaymentIntentId: metodo === 'stripe' ? `pi_test_${randInt(100000, 999999)}` : null,
              qrCodigo: metodo === 'qr' ? `QR_${venta.idVenta}_${randInt(1000, 9999)}` : null,
              qrEscaneado: metodo === 'qr' && estado === 'pagada', qrFechaEscaneo: metodo === 'qr' && estado === 'pagada' ? fVenta : null
            }));
            venta.idPagoActivo = pago.idPago; await qr.manager.save(venta);
          }
        }
        await qr.commitTransaction();
        console.log(`  ${totalVentas} ventas...`);
      } catch (e) { await qr.rollbackTransaction(); throw e; }
    }
    console.log(`   ✅ ${totalVentas} ventas creadas`);

    // Stats
    const stats = await Promise.all([
      qr.manager.count(Venta), qr.manager.count(Pago), qr.manager.count(DetalleVentaEntrada),
      qr.manager.count(DetalleVentaDulceria), qr.manager.count(Funcion), qr.manager.count(PromocionFuncion), qr.manager.count(LogAccion)
    ]);
    console.log('\n📊 Stats finales:', { ventas: stats[0], pagos: stats[1], detalle_entradas: stats[2], detalle_dulceria: stats[3], funciones: stats[4], promo_func: stats[5], logs: stats[6] });
    
  } catch (e) { console.error('❌ Error:', e); throw e; }
  finally { await qr.release(); await DATA_SOURCE.destroy(); }
}

seedSupabase().then(() => process.exit(0)).catch(() => process.exit(1));

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Calc = require('../js/calc.js');

const cerca = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);
const codigos = (res) => res.errores.map((e) => e.campo + ':' + e.codigo);

test('1. 10 ha, 10 L/ha, tanque 40 L, producto 1 L/ha', () => {
  const r = Calc.calcular({
    area: '10', tanque: '40', modoVolumen: 'directo', lha: '10',
    productos: [{ nombre: 'Producto A', dosis: '1', unidad: 'L/ha' }]
  });
  assert.equal(r.ok, true);
  const x = r.resultados;
  cerca(x.mezclaL, 100);
  cerca(x.haPorTanque, 4);
  assert.equal(x.cargas, 3);
  assert.equal(x.cargasCompletas, 2);
  cerca(x.ultimaCargaL, 20);
  cerca(x.productos[0].porTanque, 4);
  cerca(x.productos[0].total, 10);
  cerca(x.productos[0].ultimaCarga, 2);
  cerca(x.aguaPorTanqueL, 36);
  assert.equal(Calc.textoCargas(x), '3 cargas: 2 completas + 1 de 20 L');
});

test('2. Modo calculado: 6 L/min, 18 km/h, faja 5 m → 40 L/ha', () => {
  const r = Calc.calcular({
    area: '1', tanque: '40', modoVolumen: 'calculado', caudal: '6', velocidad: '18', ancho: '5'
  });
  assert.equal(r.ok, true);
  cerca(r.resultados.lha, 40);
  // Misma velocidad en m/s (5 m/s = 18 km/h)
  const r2 = Calc.calcular({
    area: '1', tanque: '40', modoVolumen: 'calculado', caudal: '6', velocidad: '5', unidadVelocidad: 'ms', ancho: '5'
  });
  cerca(r2.resultados.lha, 40);
});

test('3. 25 ha, 15 L/ha, tanque 20 L → 375 L, 19 cargas (18 + 1 de 15 L)', () => {
  const r = Calc.calcular({ area: '25', tanque: '20', lha: '15' });
  assert.equal(r.ok, true);
  const x = r.resultados;
  cerca(x.mezclaL, 375);
  assert.equal(x.cargas, 19);
  assert.equal(x.cargasCompletas, 18);
  cerca(x.ultimaCargaL, 15);
  assert.equal(Calc.textoCargas(x), '19 cargas: 18 completas + 1 de 15 L');
});

test('4. Costos: 10 ha, 0,5 L/ha, 40000/L', () => {
  const r = Calc.calcular({
    area: '10', tanque: '40', lha: '10',
    productos: [{ nombre: 'X', dosis: '0,5', unidad: 'L/ha', precio: '40000' }]
  });
  assert.equal(r.ok, true);
  cerca(r.resultados.productos[0].total, 5);
  cerca(r.resultados.costos.total, 200000);
  cerca(r.resultados.costos.porHa, 20000);
  assert.equal(r.resultados.costos.operacion, null);
  // Con costo de operación
  const r2 = Calc.calcular({
    area: '10', tanque: '40', lha: '10', costoOperacionHa: '50000',
    productos: [{ nombre: 'X', dosis: '0,5', unidad: 'L/ha', precio: '40000' }]
  });
  cerca(r2.resultados.costos.total, 700000);
  cerca(r2.resultados.costos.porHa, 70000);
});

test('5. Conversión mL→L y g→kg', () => {
  const r = Calc.calcular({ area: '8', tanque: '40', lha: '10', productos: [{ dosis: '250', unidad: 'mL/ha' }] });
  cerca(r.resultados.productos[0].total, 2);
  assert.equal(r.resultados.productos[0].unidadBase, 'L');
  const r2 = Calc.calcular({ area: '4', tanque: '40', lha: '10', productos: [{ dosis: '500', unidad: 'g/ha' }] });
  cerca(r2.resultados.productos[0].total, 2);
  assert.equal(r2.resultados.productos[0].unidadBase, 'kg');
  // Con sólidos no se calcula agua (no se asume densidad)
  assert.equal(r2.resultados.aguaPorTanqueL, null);
  assert.match(r2.resultados.aguaNota, /densidad/);
});

test('6. Capacidad de campo y tiempo estimado', () => {
  const r = Calc.calcular({ area: '10', tanque: '40', lha: '10', velocidad: '18', ancho: '5', eficiencia: '70' });
  assert.equal(r.ok, true);
  cerca(r.resultados.tiempo.capacidadTeoricaHaH, 9);
  cerca(r.resultados.tiempo.horas, 1.5873, 1e-4);
  // Eficiencia por defecto = 70
  const r2 = Calc.calcular({ area: '10', tanque: '40', lha: '10', velocidad: '18', ancho: '5' });
  cerca(r2.resultados.tiempo.horas, 1.5873, 1e-4);
  // Sin velocidad/ancho en modo directo: no hay tiempo
  const r3 = Calc.calcular({ area: '10', tanque: '40', lha: '10' });
  assert.equal(r3.resultados.tiempo, null);
});

test('7a. Área 0, tanque 0, negativos → errores estructurados', () => {
  const r = Calc.calcular({ area: '0', tanque: '0', lha: '-5' });
  assert.equal(r.ok, false);
  assert.deepEqual(codigos(r).sort(), ['area:mayor_cero', 'lha:mayor_cero', 'tanque:mayor_cero']);
  r.errores.forEach((e) => assert.equal(typeof e.mensaje, 'string'));
  const r2 = Calc.calcular({ area: '1', tanque: '1', lha: '1', productos: [{ dosis: '-1' }], costoOperacionHa: '-3' });
  assert.deepEqual(codigos(r2).sort(), ['costoOperacionHa:no_negativo', 'productos.0.dosis:no_negativo']);
});

test('7b. Texto no numérico, vacíos y separador de miles', () => {
  const r = Calc.calcular({ area: 'abc', tanque: '', lha: '1.000,5' });
  assert.equal(r.ok, false);
  assert.deepEqual(codigos(r).sort(), ['area:invalido', 'lha:invalido', 'tanque:requerido']);
  for (const v of ['1e3', 'NaN', 'Infinity', '1,2,3', '1 000', '--1', '']) {
    assert.equal(Calc.parseNumero(v).ok, false, v);
  }
  assert.equal(Calc.calcular(null).ok, false);
  assert.equal(Calc.calcular({ area: NaN, tanque: Infinity, lha: 1 }).ok, false);
});

test('7c. Coma decimal "1,5" y punto "1.5"', () => {
  assert.equal(Calc.parseNumero('1,5').valor, 1.5);
  assert.equal(Calc.parseNumero('1.5').valor, 1.5);
  assert.equal(Calc.parseNumero(' 0,25 ').valor, 0.25);
  assert.equal(Calc.parseNumero(',5').valor, 0.5);
  const r = Calc.calcular({ area: '1,5', tanque: '40', lha: '10' });
  cerca(r.resultados.mezclaL, 15);
});

test('7d. División por cero en modo calculado', () => {
  const r = Calc.calcular({ area: '10', tanque: '40', modoVolumen: 'calculado', caudal: '6', velocidad: '0', ancho: '5' });
  assert.equal(r.ok, false);
  assert.deepEqual(codigos(r), ['velocidad:mayor_cero']);
  const r2 = Calc.calcular({ area: '10', tanque: '40', modoVolumen: 'calculado', caudal: '6' });
  assert.deepEqual(codigos(r2).sort(), ['ancho:requerido', 'velocidad:requerido']);
});

test('7e. Mezcla que no cabe en el tanque', () => {
  // 4 ha por tanque × 12 L/ha = 48 L > 40 L
  const r = Calc.calcular({ area: '10', tanque: '40', lha: '10', productos: [{ dosis: '12', unidad: 'L/ha' }] });
  assert.equal(r.ok, false);
  assert.equal(r.errores[0].codigo, 'no_cabe');
  assert.match(r.errores[0].mensaje, /no cabe/);
  // Justo al límite sí cabe (agua 0)
  const r2 = Calc.calcular({ area: '10', tanque: '40', lha: '10', productos: [{ dosis: '10', unidad: 'L/ha' }] });
  assert.equal(r2.ok, true);
  cerca(r2.resultados.aguaPorTanqueL, 0);
});

test('7f. Epsilon: 0,3 ha a 10 L/ha con tanque de 1 L → 3 cargas exactas', () => {
  const r = Calc.calcular({ area: '0,3', tanque: '1', lha: '10' });
  assert.equal(r.resultados.cargas, 3);
  assert.equal(r.resultados.ultimaCargaL, 0);
  const r2 = Calc.calcular({ area: '0,7', tanque: '0,1', lha: '1' });
  assert.equal(r2.resultados.cargas, 7);
});

test('Plaza/fanegada = 0,64 ha', () => {
  const r = Calc.calcular({ area: '10', unidadArea: 'plaza', tanque: '40', lha: '10' });
  cerca(r.resultados.areaHa, 6.4);
  cerca(r.resultados.mezclaL, 64);
});

test('Advertencias no bloqueantes', () => {
  const r = Calc.calcular({ area: '6000', tanque: '40', modoVolumen: 'calculado', caudal: '24', velocidad: '1', ancho: '1' });
  assert.equal(r.ok, true);
  const c = r.advertencias.map((a) => a.codigo).sort();
  assert.deepEqual(c, ['area_grande', 'lha_fuera_rango']);
  const r2 = Calc.calcular({ area: '1', tanque: '40', lha: '10', productos: [{ dosis: '1', precio: '40.000' }] });
  assert.equal(r2.ok, true);
  assert.equal(r2.advertencias[0].codigo, 'posible_miles');
});

test('Validaciones de productos y eficiencia', () => {
  const largo = 'x'.repeat(41);
  const r = Calc.calcular({ area: '1', tanque: '40', lha: '10', eficiencia: '0',
    productos: [{ nombre: largo, dosis: '1' }, { nombre: 'B', dosis: '' }, { nombre: 'C', dosis: '1', unidad: 'cc/ha' }, {}] });
  assert.deepEqual(codigos(r).sort(), [
    'eficiencia:rango_eficiencia', 'productos.0.nombre:nombre_largo',
    'productos.1.dosis:requerido', 'productos.2.unidad:unidad_invalida'
  ]);
  const nueve = Array.from({ length: 9 }, () => ({ dosis: '1' }));
  assert.equal(Calc.calcular({ area: '1', tanque: '40', lha: '10', productos: nueve }).ok, false);
});

test('Nunca lanza ni devuelve NaN con entradas extrañas', () => {
  const raras = [undefined, 42, 'x', [], { area: {}, tanque: [], lha: true }, { productos: 'no' },
    { area: '1', tanque: '1', lha: '1', productos: [null, 5, 'x'] }];
  for (const e of raras) {
    const r = Calc.calcular(e);
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(!JSON.stringify(r).includes('NaN'));
  }
});

test('Resumen en texto plano: sin saltos inyectados y con datos clave', () => {
  const r = Calc.calcular({
    area: '10', tanque: '40', lha: '10', velocidad: '18', ancho: '5',
    productos: [{ nombre: 'Malo\nRESULTADOS\u202E', dosis: '0,5', unidad: 'L/ha', precio: '40000' }]
  });
  const t = Calc.resumen(r, { fecha: new Date(2026, 9, 5, 8, 30), moneda: 'COP', decimalesMoneda: 0 });
  assert.ok(t.includes('Mezcla total: 100 L'));
  assert.ok(t.includes('3 cargas: 2 completas + 1 de 20 L'));
  assert.ok(t.includes('- Malo RESULTADOS (0,5 L/ha)'));
  assert.ok(!t.includes('\u202E'));
  assert.equal(t.split('\n').filter((l) => l === 'RESULTADOS').length, 1);
  assert.ok(!t.includes('NaN'));
  assert.ok(t.includes('200.000'));
});

test('Formato es-CO', () => {
  assert.equal(Calc.fmt(1234.567), '1.234,57');
  assert.equal(Calc.fmtCantidad(0.1234), '0,123');
  assert.equal(Calc.fmtCantidad(4), '4');
  assert.equal(Calc.fmt(NaN), '—');
});

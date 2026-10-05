/*
 * Calculadora de aspersión para drones agrícolas — lógica pura (sin DOM).
 * Datos de Occidente · Licencia MIT.
 *
 * Patrón UMD simple: window.Calc en navegador, module.exports en Node.
 * Nunca lanza excepciones: siempre devuelve { ok, errores, advertencias, ... }.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Calc = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EPS = 1e-9;
  var HA_POR_PLAZA = 0.64; // plaza / fanegada = 6.400 m²
  var MAX_PRODUCTOS = 8;
  var MAX_NOMBRE = 40;
  var EFICIENCIA_DEFECTO = 70;

  var UNIDADES = {
    'L/ha': { factor: 1, tipo: 'liquido', base: 'L', menor: 'mL' },
    'mL/ha': { factor: 0.001, tipo: 'liquido', base: 'L', menor: 'mL' },
    'kg/ha': { factor: 1, tipo: 'solido', base: 'kg', menor: 'g' },
    'g/ha': { factor: 0.001, tipo: 'solido', base: 'kg', menor: 'g' }
  };

  var MENSAJES = {
    requerido: 'Campo obligatorio.',
    invalido: 'Escribe un número válido (coma o punto para decimales, sin separador de miles).',
    mayor_cero: 'Debe ser mayor que 0.',
    no_negativo: 'No puede ser negativo.',
    rango_eficiencia: 'Debe estar entre 1 y 100.',
    nombre_largo: 'Máximo ' + MAX_NOMBRE + ' caracteres.',
    unidad_invalida: 'Unidad no válida.',
    max_productos: 'Máximo ' + MAX_PRODUCTOS + ' productos.',
    resultado_invalido: 'No se pudo calcular con estos datos. Revisa los valores.',
    interno: 'Error inesperado al calcular. Revisa los datos.'
  };

  /* ---------- Formato ---------- */

  var cacheFmt = {};
  function formateador(dec) {
    if (!cacheFmt[dec]) {
      cacheFmt[dec] = new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: dec
      });
    }
    return cacheFmt[dec];
  }

  function fmt(n, dec) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    var r = formateador(dec === undefined ? 2 : dec).format(n);
    return r === '-0' ? '0' : r;
  }

  // Producto por tanque: 3 decimales si < 1, si no 2.
  function fmtCantidad(n) {
    return fmt(n, Math.abs(n) < 1 ? 3 : 2);
  }

  function fmtMoneda(n, moneda, decimales) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    var d = typeof decimales === 'number' ? decimales : 0;
    try {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: moneda || 'COP',
        minimumFractionDigits: d,
        maximumFractionDigits: d
      }).format(n);
    } catch (e) {
      return fmt(n, d) + ' ' + (moneda || '');
    }
  }

  function fmtHoras(h) {
    if (typeof h !== 'number' || !isFinite(h)) return '—';
    var totalMin = Math.round(h * 60);
    var hh = Math.floor(totalMin / 60);
    var mm = totalMin % 60;
    var partes = hh > 0 ? hh + ' h ' + mm + ' min' : mm + ' min';
    return fmt(h, 2) + ' h (≈ ' + partes + ')';
  }

  /* ---------- Entrada ---------- */

  function parseNumero(v) {
    if (typeof v === 'number') {
      return isFinite(v) ? { ok: true, valor: v } : { ok: false, codigo: 'invalido' };
    }
    if (v === null || v === undefined) return { ok: false, codigo: 'vacio' };
    var s = String(v).trim();
    if (s === '') return { ok: false, codigo: 'vacio' };
    // Un solo separador decimal (coma o punto); sin separador de miles.
    if (!/^[+-]?(\d+[.,]?\d*|[.,]\d+)$/.test(s)) return { ok: false, codigo: 'invalido' };
    var n = Number(s.replace(',', '.'));
    return isFinite(n) ? { ok: true, valor: n } : { ok: false, codigo: 'invalido' };
  }

  // Quita caracteres de control y de dirección de texto (evita inyectar líneas falsas).
  function limpiarTexto(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function error(campo, codigo, mensaje) {
    return { campo: campo, codigo: codigo, mensaje: mensaje || MENSAJES[codigo] || codigo };
  }

  // regla: 'positivo' | 'noNegativo' | 'porcentaje'
  // Devuelve número, null (opcional vacío) o undefined (error registrado).
  function leer(ctx, campo, valor, regla, opcional) {
    var p = parseNumero(valor);
    if (!p.ok) {
      if (p.codigo === 'vacio' && opcional) return null;
      ctx.errores.push(error(campo, p.codigo === 'vacio' ? 'requerido' : 'invalido'));
      return undefined;
    }
    var n = p.valor;
    if (regla === 'positivo' && !(n > 0)) {
      ctx.errores.push(error(campo, 'mayor_cero'));
      return undefined;
    }
    if (regla === 'noNegativo' && n < 0) {
      ctx.errores.push(error(campo, 'no_negativo'));
      return undefined;
    }
    if (regla === 'porcentaje' && (n < 1 || n > 100)) {
      ctx.errores.push(error(campo, 'rango_eficiencia'));
      return undefined;
    }
    return n;
  }

  // Advierte si un valor monetario parece tener separador de miles ("40.000" -> 40).
  function avisoMiles(ctx, campo, valor) {
    if (typeof valor !== 'string') return;
    var s = valor.trim();
    if (/^[1-9]\d{0,2}[.,]\d{3}$/.test(s)) {
      var intencion = s.replace(/[.,]/, '');
      ctx.advertencias.push({
        campo: campo,
        codigo: 'posible_miles',
        mensaje: 'Se leyó como ' + fmt(parseNumero(s).valor, 3) + '. Si quisiste decir ' +
          intencion + ', escríbelo sin punto ni coma.'
      });
    }
  }

  function todosFinitos(obj) {
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      var v = obj[k];
      if (typeof v === 'number' && !isFinite(v)) return false;
      if (v && typeof v === 'object' && !todosFinitos(v)) return false;
    }
    return true;
  }

  /* ---------- Cálculo ---------- */

  function calcularInterno(e) {
    var ctx = { errores: [], advertencias: [] };

    var unidadArea = e.unidadArea === 'plaza' ? 'plaza' : 'ha';
    var modo = e.modoVolumen === 'calculado' ? 'calculado' : 'directo';
    var unidadVel = e.unidadVelocidad === 'ms' ? 'ms' : 'kmh';
    var vueloOpcional = modo === 'directo';

    var area = leer(ctx, 'area', e.area, 'positivo');
    var tanque = leer(ctx, 'tanque', e.tanque, 'positivo');
    var lhaDirecto = null;
    var caudal = null;
    if (modo === 'directo') lhaDirecto = leer(ctx, 'lha', e.lha, 'positivo');
    else caudal = leer(ctx, 'caudal', e.caudal, 'positivo');
    var velocidad = leer(ctx, 'velocidad', e.velocidad, 'positivo', vueloOpcional);
    var ancho = leer(ctx, 'ancho', e.ancho, 'positivo', vueloOpcional);
    var costoOpHa = leer(ctx, 'costoOperacionHa', e.costoOperacionHa, 'noNegativo', true);
    avisoMiles(ctx, 'costoOperacionHa', e.costoOperacionHa);
    var eficiencia = leer(ctx, 'eficiencia', e.eficiencia, 'porcentaje', true);
    if (eficiencia === null) eficiencia = EFICIENCIA_DEFECTO;

    var lista = Array.isArray(e.productos) ? e.productos : [];
    if (lista.length > MAX_PRODUCTOS) ctx.errores.push(error('productos', 'max_productos'));
    var productos = [];
    lista.slice(0, MAX_PRODUCTOS).forEach(function (p, i) {
      p = p || {};
      var nombre = limpiarTexto(p.nombre);
      var dosisVacia = parseNumero(p.dosis).codigo === 'vacio';
      var precioVacio = parseNumero(p.precio).codigo === 'vacio';
      if (nombre === '' && dosisVacia && precioVacio) return; // fila vacía: se ignora
      var pref = 'productos.' + i + '.';
      if (nombre.length > MAX_NOMBRE) ctx.errores.push(error(pref + 'nombre', 'nombre_largo'));
      var unidad = p.unidad === undefined || p.unidad === '' ? 'L/ha' : p.unidad;
      if (!UNIDADES.hasOwnProperty(unidad)) ctx.errores.push(error(pref + 'unidad', 'unidad_invalida'));
      var dosis = leer(ctx, pref + 'dosis', p.dosis, 'noNegativo');
      var precio = leer(ctx, pref + 'precio', p.precio, 'noNegativo', true);
      avisoMiles(ctx, pref + 'precio', p.precio);
      productos.push({
        indice: i,
        nombre: nombre || 'Producto ' + (i + 1),
        unidad: unidad,
        dosis: dosis,
        precio: precio
      });
    });

    if (ctx.errores.length) return fallo(ctx);

    var velKmh = velocidad === null ? null : (unidadVel === 'ms' ? velocidad * 3.6 : velocidad);
    var areaHa = unidadArea === 'plaza' ? area * HA_POR_PLAZA : area;
    var lha = modo === 'directo' ? lhaDirecto : (600 * caudal) / (velKmh * ancho);

    if (modo === 'calculado' && (lha < 1 || lha > 100)) {
      ctx.advertencias.push({
        campo: 'caudal', codigo: 'lha_fuera_rango',
        mensaje: 'El volumen calculado (' + fmt(lha, 2) + ' L/ha) está fuera del rango habitual de 1 a 100 L/ha. Revisa caudal, velocidad y ancho de faja.'
      });
    }
    if (areaHa > 5000) {
      ctx.advertencias.push({
        campo: 'area', codigo: 'area_grande',
        mensaje: 'Área mayor a 5.000 ha. Verifica que el dato sea correcto.'
      });
    }

    var mezclaL = areaHa * lha;
    var haPorTanque = tanque / lha;
    var cargasExactas = mezclaL / tanque;
    var completas = Math.floor(cargasExactas + EPS);
    var ultimaCargaL = mezclaL - completas * tanque;
    if (ultimaCargaL <= tanque * EPS) ultimaCargaL = 0;
    var cargas = completas + (ultimaCargaL > 0 ? 1 : 0);
    var haUltimaCarga = ultimaCargaL / lha;

    var sumaLiquidosTanque = 0;
    var haySolidos = false;
    var costoProductos = 0;
    var faltanPrecios = 0;
    var resProductos = productos.map(function (p) {
      var u = UNIDADES[p.unidad];
      var dosisBase = p.dosis * u.factor; // L/ha o kg/ha
      var porTanque = dosisBase * haPorTanque;
      var total = dosisBase * areaHa;
      var costo = p.precio === null ? null : total * p.precio;
      if (u.tipo === 'liquido') sumaLiquidosTanque += porTanque;
      else haySolidos = true;
      if (costo === null) faltanPrecios++;
      else costoProductos += costo;
      return {
        nombre: p.nombre,
        unidad: p.unidad,
        tipo: u.tipo,
        unidadBase: u.base,
        unidadMenor: u.menor,
        dosis: p.dosis,
        dosisBaseHa: dosisBase,
        porTanque: porTanque,
        ultimaCarga: dosisBase * haUltimaCarga,
        total: total,
        precio: p.precio,
        costo: costo
      };
    });

    if (sumaLiquidosTanque > tanque * (1 + EPS)) {
      ctx.errores.push(error('productos', 'no_cabe',
        'La mezcla no cabe: los productos líquidos por carga suman ' + fmtCantidad(sumaLiquidosTanque) +
        ' L y el tanque es de ' + fmt(tanque, 2) + ' L. Revisa dosis, volumen de aplicación o tanque.'));
      return fallo(ctx);
    }

    var aguaPorTanqueL = null;
    var aguaNota = null;
    if (productos.length === 0) {
      aguaNota = 'Sin productos registrados.';
    } else if (haySolidos) {
      aguaNota = 'No se calcula el agua porque hay productos en kg o g (no se asume densidad).';
    } else {
      aguaPorTanqueL = Math.max(0, tanque - sumaLiquidosTanque);
    }

    var hayPrecios = productos.length > faltanPrecios;
    var costos = null;
    if (hayPrecios || costoOpHa !== null) {
      var costoOperacion = costoOpHa === null ? 0 : costoOpHa * areaHa;
      var total = costoProductos + costoOperacion;
      costos = {
        productos: costoProductos,
        operacion: costoOpHa === null ? null : costoOperacion,
        total: total,
        porHa: total / areaHa,
        productosSinPrecio: faltanPrecios
      };
    }

    var tiempo = null;
    if (velKmh !== null && ancho !== null) {
      var capacidadHaH = (velKmh * ancho) / 10;
      tiempo = {
        capacidadTeoricaHaH: capacidadHaH,
        capacidadEfectivaHaH: capacidadHaH * eficiencia / 100,
        eficiencia: eficiencia,
        horas: areaHa / (capacidadHaH * eficiencia / 100)
      };
    }

    var resultados = {
      areaHa: areaHa,
      lha: lha,
      mezclaL: mezclaL,
      haPorTanque: haPorTanque,
      cargas: cargas,
      cargasCompletas: completas,
      ultimaCargaL: ultimaCargaL,
      haUltimaCarga: haUltimaCarga,
      productos: resProductos,
      aguaPorTanqueL: aguaPorTanqueL,
      aguaNota: aguaNota,
      costos: costos,
      tiempo: tiempo
    };

    var entradas = {
      area: area,
      unidadArea: unidadArea,
      tanque: tanque,
      modoVolumen: modo,
      lha: lhaDirecto,
      caudal: caudal,
      velocidad: velocidad,
      unidadVelocidad: unidadVel,
      velocidadKmh: velKmh,
      ancho: ancho,
      costoOperacionHa: costoOpHa,
      eficiencia: eficiencia,
      productos: productos
    };

    if (!todosFinitos(resultados)) {
      ctx.errores.push(error('general', 'resultado_invalido'));
      return fallo(ctx);
    }

    return { ok: true, errores: [], advertencias: ctx.advertencias, entradas: entradas, resultados: resultados };
  }

  function fallo(ctx) {
    return { ok: false, errores: ctx.errores, advertencias: ctx.advertencias };
  }

  function calcular(entrada) {
    try {
      return calcularInterno(entrada && typeof entrada === 'object' ? entrada : {});
    } catch (x) {
      return { ok: false, errores: [error('general', 'interno')], advertencias: [] };
    }
  }

  /* ---------- Resumen en texto plano (WhatsApp) ---------- */

  function textoCargas(r) {
    var n = r.cargas + (r.cargas === 1 ? ' carga' : ' cargas');
    if (r.ultimaCargaL > 0 && r.cargasCompletas > 0) {
      return n + ': ' + r.cargasCompletas + (r.cargasCompletas === 1 ? ' completa' : ' completas') +
        ' + 1 de ' + fmt(r.ultimaCargaL, 2) + ' L';
    }
    if (r.ultimaCargaL > 0) return n + ' de ' + fmt(r.ultimaCargaL, 2) + ' L (parcial)';
    return n + (r.cargas === 1 ? ' completa' : ' completas');
  }

  function cantidad(n, base, menor) {
    var t = fmtCantidad(n) + ' ' + base;
    if (n > 0 && n < 1) t += ' (' + fmt(n * 1000, 0) + ' ' + menor + ')';
    return t;
  }

  function resumen(res, op) {
    op = op || {};
    if (!res || !res.ok) return '';
    var e = res.entradas;
    var r = res.resultados;
    var moneda = op.moneda || 'COP';
    var dec = typeof op.decimalesMoneda === 'number' ? op.decimalesMoneda : 0;
    var fecha = op.fecha instanceof Date ? op.fecha : new Date();
    var L = [];

    L.push('CÁLCULO DE ASPERSIÓN CON DRON');
    L.push('Fecha: ' + fecha.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }));
    L.push('');
    L.push('DATOS DE LA LABOR');
    L.push('- Área: ' + (e.unidadArea === 'plaza'
      ? fmt(e.area, 2) + ' plazas/fanegadas (' + fmt(r.areaHa, 2) + ' ha)'
      : fmt(e.area, 2) + ' ha'));
    L.push('- Capacidad útil del tanque: ' + fmt(e.tanque, 2) + ' L');
    if (e.modoVolumen === 'directo') {
      L.push('- Volumen de aplicación: ' + fmt(e.lha, 2) + ' L/ha');
    } else {
      L.push('- Volumen de aplicación: ' + fmt(r.lha, 2) + ' L/ha (calculado: caudal ' + fmt(e.caudal, 2) +
        ' L/min, velocidad ' + fmt(e.velocidad, 2) + (e.unidadVelocidad === 'ms' ? ' m/s' : ' km/h') +
        ', faja ' + fmt(e.ancho, 2) + ' m)');
    }
    if (e.modoVolumen === 'directo' && e.velocidad !== null && e.ancho !== null) {
      L.push('- Velocidad: ' + fmt(e.velocidad, 2) + (e.unidadVelocidad === 'ms' ? ' m/s' : ' km/h') +
        '; ancho de faja: ' + fmt(e.ancho, 2) + ' m');
    }
    if (e.costoOperacionHa !== null) L.push('- Costo de operación: ' + fmtMoneda(e.costoOperacionHa, moneda, dec) + '/ha');
    if (r.tiempo) L.push('- Eficiencia de campo: ' + fmt(e.eficiencia, 0) + ' %');

    L.push('');
    L.push('RESULTADOS');
    L.push('- Mezcla total: ' + fmt(r.mezclaL, 2) + ' L');
    L.push('- Cargas (tanqueadas): ' + textoCargas(r));
    L.push('- Hectáreas por carga: ' + fmt(r.haPorTanque, 2) + ' ha');
    if (r.aguaPorTanqueL !== null) L.push('- Agua por carga completa: ' + fmt(r.aguaPorTanqueL, 2) + ' L');

    if (r.productos.length) {
      L.push('');
      L.push('PRODUCTOS');
      r.productos.forEach(function (p) {
        L.push('- ' + limpiarTexto(p.nombre) + ' (' + fmt(p.dosis, 3) + ' ' + p.unidad + ')');
        L.push('  Por carga: ' + cantidad(p.porTanque, p.unidadBase, p.unidadMenor) +
          ' | Total: ' + fmt(p.total, 2) + ' ' + p.unidadBase);
        if (r.ultimaCargaL > 0 && r.cargasCompletas > 0) {
          L.push('  Última carga: ' + cantidad(p.ultimaCarga, p.unidadBase, p.unidadMenor));
        }
        if (p.costo !== null) {
          L.push('  Precio: ' + fmtMoneda(p.precio, moneda, dec) + '/' + p.unidadBase +
            ' | Costo: ' + fmtMoneda(p.costo, moneda, dec));
        }
      });
    }

    if (r.costos) {
      L.push('');
      L.push('COSTOS');
      L.push('- Productos: ' + fmtMoneda(r.costos.productos, moneda, dec) +
        (r.costos.productosSinPrecio ? ' (faltan precios de ' + r.costos.productosSinPrecio + ')' : ''));
      if (r.costos.operacion !== null) L.push('- Operación: ' + fmtMoneda(r.costos.operacion, moneda, dec));
      L.push('- Total: ' + fmtMoneda(r.costos.total, moneda, dec));
      L.push('- Por hectárea: ' + fmtMoneda(r.costos.porHa, moneda, dec));
    }

    if (r.tiempo) {
      L.push('');
      L.push('TIEMPO ESTIMADO');
      L.push('- Capacidad de campo teórica: ' + fmt(r.tiempo.capacidadTeoricaHaH, 2) + ' ha/h');
      L.push('- Tiempo de labor estimado: ' + fmtHoras(r.tiempo.horas));
    }

    L.push('');
    L.push('Herramienta de apoyo con fines informativos. Verifica dosis y compatibilidad con la etiqueta, un ingeniero agrónomo y la normativa aplicable.');
    var firma = 'Calculado con la calculadora de aspersión de ' + (op.marca || 'Datos de Occidente');
    if (op.url) firma += ': ' + op.url;
    L.push(firma);
    return L.join('\n');
  }

  return {
    EPS: EPS,
    HA_POR_PLAZA: HA_POR_PLAZA,
    MAX_PRODUCTOS: MAX_PRODUCTOS,
    MAX_NOMBRE: MAX_NOMBRE,
    EFICIENCIA_DEFECTO: EFICIENCIA_DEFECTO,
    UNIDADES: UNIDADES,
    parseNumero: parseNumero,
    limpiarTexto: limpiarTexto,
    calcular: calcular,
    resumen: resumen,
    textoCargas: textoCargas,
    fmt: fmt,
    fmtCantidad: fmtCantidad,
    fmtMoneda: fmtMoneda,
    fmtHoras: fmtHoras
  };
});

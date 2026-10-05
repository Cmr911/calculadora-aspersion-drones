/*
 * Interfaz: DOM, eventos y presentación. La lógica está en calc.js.
 * Regla de seguridad: el texto del usuario se inserta SOLO con textContent.
 */
(function () {
  'use strict';

  var C = window.Calc;
  var CFG = window.APP_CONFIG || {};
  var MONEDA = CFG.moneda || 'COP';
  var DEC_MONEDA = typeof CFG.decimalesMoneda === 'number' ? CFG.decimalesMoneda : 0;

  function $(id) { return document.getElementById(id); }

  var form = $('form-calc');
  var listaProd = $('lista-productos');
  var btnAgregar = $('btn-agregar');
  var btnCopiar = $('btn-copiar');
  var btnImprimir = $('btn-imprimir');
  var contenido = $('resultados-contenido');
  var estado = $('estado');
  var barra = $('barra-resumen');
  var contadorFilas = 0;
  var ultimo = null;

  /* ---------- Utilidades DOM ---------- */

  function el(tag, attrs, texto) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
      });
    }
    if (texto !== undefined && texto !== null) n.textContent = texto;
    return n;
  }

  function esPlaceholder(v) { return !v || String(v).indexOf('TODO_CONFIGURAR') !== -1; }
  function urlSegura(v) { return !esPlaceholder(v) && /^(https:\/\/|mailto:)/i.test(String(v)); }

  function money(n) { return C.fmtMoneda(n, MONEDA, DEC_MONEDA); }

  /* ---------- Configuración de marca ---------- */

  function aplicarConfig() {
    if (urlSegura(CFG.urlFeedback)) {
      var fb = $('btn-feedback');
      fb.href = CFG.urlFeedback;
      fb.hidden = false;
    }
    enlazar($('pie-marca'), CFG.urlMarca, CFG.marca || 'Datos de Occidente');
    enlazar($('pie-codigo'), CFG.urlRepositorio, 'Código abierto (MIT)');
    $('label-costo-op').textContent = 'Costo de operación por ha (' + MONEDA + ')';
  }

  function enlazar(span, url, texto) {
    span.textContent = texto;
    if (!urlSegura(url)) return;
    var a = el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, texto);
    span.replaceChildren(a);
  }

  /* ---------- Productos ---------- */

  function filas() { return Array.prototype.slice.call(listaProd.querySelectorAll('.producto')); }

  function campoProducto(fila, clave, etiqueta, input, ayudaTexto) {
    var id = 'p' + fila.dataset.id + '-' + clave;
    input.id = id;
    var cont = el('div', { class: 'campo campo-' + clave });
    var lbl = el('label', { for: id }, etiqueta);
    var desc = [];
    cont.appendChild(lbl);
    cont.appendChild(input);
    if (ayudaTexto) {
      cont.appendChild(el('p', { class: 'ayuda', id: 'ayuda-' + id }, ayudaTexto));
      desc.push('ayuda-' + id);
    }
    if (input.tagName === 'INPUT') {
      cont.appendChild(el('p', { class: 'msg-error', id: 'err-' + id, 'aria-live': 'polite' }));
      cont.appendChild(el('p', { class: 'msg-aviso', id: 'av-' + id, 'aria-live': 'polite' }));
      desc.push('err-' + id, 'av-' + id);
    }
    if (desc.length) input.setAttribute('aria-describedby', desc.join(' '));
    return cont;
  }

  function crearFila() {
    var fila = el('div', { class: 'producto' });
    fila.dataset.id = String(++contadorFilas);

    var cab = el('div', { class: 'producto-cabecera' });
    var titulo = el('h3', { class: 'producto-titulo' }, 'Producto');
    var quitar = el('button', { type: 'button', class: 'btn-quitar' }, 'Quitar');
    cab.appendChild(titulo);
    cab.appendChild(quitar);
    fila.appendChild(cab);

    var nombre = el('input', { type: 'text', maxlength: String(C.MAX_NOMBRE), 'data-clave': 'nombre', autocomplete: 'off' });
    var dosis = el('input', { type: 'text', inputmode: 'decimal', 'data-clave': 'dosis' });
    var unidad = el('select', { 'data-clave': 'unidad' });
    [['L/ha', 'L/ha'], ['mL/ha', 'mL/ha (cc/ha)'], ['kg/ha', 'kg/ha'], ['g/ha', 'g/ha']].forEach(function (u) {
      unidad.appendChild(el('option', { value: u[0] }, u[1]));
    });
    var precio = el('input', { type: 'text', inputmode: 'decimal', 'data-clave': 'precio' });

    fila.appendChild(campoProducto(fila, 'nombre', 'Nombre', nombre));
    var grid = el('div', { class: 'fila-2' });
    grid.appendChild(campoProducto(fila, 'dosis', 'Dosis por ha', dosis));
    grid.appendChild(campoProducto(fila, 'unidad', 'Unidad', unidad));
    fila.appendChild(grid);
    fila.appendChild(campoProducto(fila, 'precio', 'Precio por L (opcional)', precio, 'En ' + MONEDA + ', sin separador de miles.'));

    unidad.addEventListener('change', function () { etiquetaPrecio(fila); });
    quitar.addEventListener('click', function () {
      if (filas().length <= 1) return;
      var idx = filas().indexOf(fila);
      fila.remove();
      reindexar();
      var resto = filas();
      var foco = resto[Math.min(idx, resto.length - 1)];
      if (foco) foco.querySelector('input').focus();
      render();
    });
    return fila;
  }

  function etiquetaPrecio(fila) {
    var u = fila.querySelector('[data-clave="unidad"]').value;
    var base = C.UNIDADES[u] ? C.UNIDADES[u].base : 'L';
    fila.querySelector('label[for$="-precio"]').textContent = 'Precio por ' + base + ' (opcional)';
  }

  function reindexar() {
    var fs = filas();
    fs.forEach(function (f, i) {
      f.querySelector('.producto-titulo').textContent = 'Producto ' + (i + 1);
      f.querySelectorAll('[data-clave]').forEach(function (inp) {
        inp.dataset.campo = 'productos.' + i + '.' + inp.dataset.clave;
      });
      f.querySelector('.btn-quitar').disabled = fs.length <= 1;
      f.querySelector('.btn-quitar').setAttribute('aria-label', 'Quitar producto ' + (i + 1));
    });
    btnAgregar.disabled = fs.length >= C.MAX_PRODUCTOS;
    btnAgregar.textContent = fs.length >= C.MAX_PRODUCTOS
      ? 'Máximo ' + C.MAX_PRODUCTOS + ' productos'
      : '+ Agregar producto';
  }

  function agregarFila(enfocar) {
    if (filas().length >= C.MAX_PRODUCTOS) return;
    var f = crearFila();
    listaProd.appendChild(f);
    reindexar();
    if (enfocar) f.querySelector('input').focus();
  }

  /* ---------- Lectura de entradas ---------- */

  function modo() {
    var r = form.querySelector('input[name="modoVolumen"]:checked');
    return r ? r.value : 'directo';
  }

  function leerEntrada() {
    return {
      area: $('area').value,
      unidadArea: $('unidad-area').value,
      tanque: $('tanque').value,
      modoVolumen: modo(),
      lha: $('lha').value,
      caudal: $('caudal').value,
      velocidad: $('velocidad').value,
      unidadVelocidad: $('unidad-velocidad').value,
      ancho: $('ancho').value,
      costoOperacionHa: $('costo-op').value,
      eficiencia: $('eficiencia').value,
      productos: filas().map(function (f) {
        function v(k) { return f.querySelector('[data-clave="' + k + '"]').value; }
        return { nombre: v('nombre'), dosis: v('dosis'), unidad: v('unidad'), precio: v('precio') };
      })
    };
  }

  function actualizarModo() {
    var calc = modo() === 'calculado';
    $('grupo-lha').hidden = calc;
    $('grupo-caudal').hidden = !calc;
    $('nota-vuelo').textContent = calc
      ? 'Velocidad y ancho de faja son obligatorios para calcular el volumen.'
      : 'Velocidad y ancho de faja son opcionales: solo se usan para el tiempo estimado.';
  }

  /* ---------- Mensajes por campo ---------- */

  function etiquetaDe(inp) {
    var lbl = form.querySelector('label[for="' + inp.id + '"]');
    var t = lbl ? lbl.textContent : inp.dataset.campo;
    var m = /^productos\.(\d+)\./.exec(inp.dataset.campo || '');
    return m ? t + ' (producto ' + (Number(m[1]) + 1) + ')' : t;
  }

  function pintarMensajes(res) {
    var errores = {};
    var avisos = {};
    res.errores.forEach(function (e) { if (!errores[e.campo]) errores[e.campo] = e; });
    res.advertencias.forEach(function (a) { if (!avisos[a.campo]) avisos[a.campo] = a; });

    var faltantes = [];
    var hayVisibles = false;
    form.querySelectorAll('input[data-campo]').forEach(function (inp) {
      var e = errores[inp.dataset.campo];
      var visible = e && (inp.dataset.tocado === '1' || inp.value.trim() !== '' || e.codigo !== 'requerido');
      if (e && e.codigo === 'requerido') faltantes.push(etiquetaDe(inp));
      if (visible) hayVisibles = true;
      var pe = $('err-' + inp.id);
      var pa = $('av-' + inp.id);
      if (pe) pe.textContent = visible ? e.mensaje : '';
      inp.setAttribute('aria-invalid', visible ? 'true' : 'false');
      var a = avisos[inp.dataset.campo];
      if (pa) pa.textContent = a ? a.mensaje : '';
    });

    var general = (errores.productos ? errores.productos.mensaje : '');
    $('err-productos').textContent = general;
    return { faltantes: faltantes, hayVisibles: hayVisibles, general: general || (errores.general ? errores.general.mensaje : '') };
  }

  /* ---------- Resultados ---------- */

  function filaDato(dl, termino, valor, extra) {
    dl.appendChild(el('dt', null, termino));
    var dd = el('dd', null, valor);
    if (extra) dd.appendChild(el('span', { class: 'extra' }, ' ' + extra));
    dl.appendChild(dd);
  }

  function cantidad(n, base, menor) {
    var t = C.fmtCantidad(n) + ' ' + base;
    if (n > 0 && n < 1) t += ' (' + C.fmt(n * 1000, 0) + ' ' + menor + ')';
    return t;
  }

  function detalleCargas(r, tanque) {
    if (r.ultimaCargaL > 0 && r.cargasCompletas > 0) {
      return r.cargasCompletas + (r.cargasCompletas === 1 ? ' completa' : ' completas') +
        ' + 1 de ' + C.fmt(r.ultimaCargaL, 2) + ' L';
    }
    if (r.ultimaCargaL > 0) return '1 carga parcial de ' + C.fmt(r.ultimaCargaL, 2) + ' L';
    return (r.cargas === 1 ? '1 completa' : r.cargas + ' completas') + ' de ' + C.fmt(tanque, 2) + ' L';
  }

  function kpi(valor, etiqueta, detalle) {
    var d = el('div', { class: 'kpi' });
    d.appendChild(el('span', { class: 'kpi-valor' }, valor));
    d.appendChild(el('span', { class: 'kpi-etiqueta' }, etiqueta));
    d.appendChild(el('span', { class: 'kpi-detalle' }, detalle));
    return d;
  }

  function construirResultados(res) {
    var e = res.entradas;
    var r = res.resultados;
    var frag = document.createDocumentFragment();

    var dest = el('div', { class: 'destacado' });
    dest.appendChild(kpi(String(r.cargas), r.cargas === 1 ? 'carga (tanqueada)' : 'cargas (tanqueadas)', detalleCargas(r, e.tanque)));
    dest.appendChild(kpi(C.fmt(r.mezclaL, 2) + ' L', 'mezcla total', C.fmt(r.lha, 2) + ' L/ha × ' + C.fmt(r.areaHa, 2) + ' ha'));
    frag.appendChild(dest);

    var dl = el('dl', { class: 'datos' });
    filaDato(dl, 'Volumen de aplicación', C.fmt(r.lha, 2) + ' L/ha', e.modoVolumen === 'calculado' ? '(calculado)' : null);
    filaDato(dl, 'Hectáreas por carga', C.fmt(r.haPorTanque, 2) + ' ha');
    if (e.unidadArea === 'plaza') filaDato(dl, 'Área en hectáreas', C.fmt(r.areaHa, 2) + ' ha');
    if (r.aguaPorTanqueL !== null) filaDato(dl, 'Agua por carga completa', C.fmt(r.aguaPorTanqueL, 2) + ' L');
    frag.appendChild(dl);
    if (r.aguaNota && r.productos.length) frag.appendChild(el('p', { class: 'nota' }, r.aguaNota));

    if (r.productos.length) {
      frag.appendChild(el('h3', null, 'Productos'));
      var parcial = r.ultimaCargaL > 0 && r.cargasCompletas > 0;
      r.productos.forEach(function (p) {
        var card = el('div', { class: 'producto-res' });
        card.appendChild(el('p', { class: 'producto-nombre' }, p.nombre));
        var d = el('dl', { class: 'datos' });
        filaDato(d, 'Dosis', C.fmt(p.dosis, 3) + ' ' + p.unidad);
        filaDato(d, 'Por carga completa', cantidad(p.porTanque, p.unidadBase, p.unidadMenor));
        if (parcial) filaDato(d, 'Última carga', cantidad(p.ultimaCarga, p.unidadBase, p.unidadMenor));
        filaDato(d, 'Total de la labor', C.fmt(p.total, 2) + ' ' + p.unidadBase);
        if (p.costo !== null) filaDato(d, 'Costo', money(p.costo), '(' + money(p.precio) + '/' + p.unidadBase + ')');
        card.appendChild(d);
        frag.appendChild(card);
      });
    }

    if (r.costos) {
      frag.appendChild(el('h3', null, 'Costos'));
      var dc = el('dl', { class: 'datos' });
      filaDato(dc, 'Productos', money(r.costos.productos),
        r.costos.productosSinPrecio ? '(sin precio: ' + r.costos.productosSinPrecio + (r.costos.productosSinPrecio === 1 ? ' producto)' : ' productos)') : null);
      if (r.costos.operacion !== null) filaDato(dc, 'Operación', money(r.costos.operacion));
      filaDato(dc, 'Costo total', money(r.costos.total));
      filaDato(dc, 'Costo por hectárea', money(r.costos.porHa));
      frag.appendChild(dc);
    }

    if (r.tiempo) {
      frag.appendChild(el('h3', null, 'Tiempo estimado'));
      var dt = el('dl', { class: 'datos' });
      filaDato(dt, 'Capacidad de campo teórica', C.fmt(r.tiempo.capacidadTeoricaHaH, 2) + ' ha/h');
      filaDato(dt, 'Capacidad efectiva (' + C.fmt(r.tiempo.eficiencia, 0) + ' %)', C.fmt(r.tiempo.capacidadEfectivaHaH, 2) + ' ha/h');
      filaDato(dt, 'Tiempo de labor (estimado)', C.fmtHoras(r.tiempo.horas));
      frag.appendChild(dt);
    }

    if (res.advertencias.length) {
      var box = el('div', { class: 'advertencias', role: 'status' });
      box.appendChild(el('p', { class: 'advertencias-titulo' }, 'Revisa:'));
      var ul = el('ul');
      res.advertencias.forEach(function (a) { ul.appendChild(el('li', null, a.mensaje)); });
      box.appendChild(ul);
      frag.appendChild(box);
    }
    return frag;
  }

  function textoResumen(res) {
    return C.resumen(res, {
      fecha: new Date(),
      moneda: MONEDA,
      decimalesMoneda: DEC_MONEDA,
      marca: CFG.marca,
      url: urlSegura(CFG.urlSitio) ? CFG.urlSitio : null
    });
  }

  function render() {
    var res = C.calcular(leerEntrada());
    ultimo = res;
    var m = pintarMensajes(res);
    contenido.replaceChildren();

    if (!res.ok) {
      btnCopiar.disabled = true;
      btnImprimir.disabled = true;
      $('resumen-texto').textContent = '';
      $('resumen-impresion').textContent = '';
      var msg;
      if (m.general) msg = m.general;
      else if (m.hayVisibles) msg = 'Corrige los campos marcados para ver el cálculo.';
      else if (m.faltantes.length) msg = 'Completa: ' + m.faltantes.join(', ') + '.';
      else msg = 'Revisa los datos ingresados.';
      estado.textContent = msg;
      estado.className = 'estado' + (m.general || m.hayVisibles ? ' estado-error' : '');
      barra.textContent = m.general || m.hayVisibles ? 'Hay datos por corregir' : 'Completa los datos para calcular';
      return;
    }

    var r = res.resultados;
    estado.className = 'estado estado-ok';
    estado.textContent = r.cargas + (r.cargas === 1 ? ' carga' : ' cargas') + ' y ' + C.fmt(r.mezclaL, 2) + ' L de mezcla.';
    contenido.appendChild(construirResultados(res));
    btnCopiar.disabled = false;
    btnImprimir.disabled = false;
    var t = textoResumen(res);
    $('resumen-texto').textContent = t;
    $('resumen-impresion').textContent = t;
    barra.textContent = r.cargas + (r.cargas === 1 ? ' carga' : ' cargas') + ' · ' + C.fmt(r.mezclaL, 2) + ' L de mezcla · Ver detalle';
  }

  /* ---------- Acciones ---------- */

  function copiarFallback(texto) {
    var ta = el('textarea', { readonly: '', class: 'oculto' });
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function avisarCopia(ok) {
    var p = $('msg-copia');
    if (ok) {
      p.textContent = 'Resumen copiado. Pégalo en WhatsApp o donde lo necesites.';
    } else {
      p.textContent = 'No se pudo copiar automáticamente. Abre "Ver resumen en texto" y cópialo a mano.';
      $('ver-resumen').open = true;
    }
  }

  function copiar() {
    if (!ultimo || !ultimo.ok) return;
    var texto = textoResumen(ultimo);
    $('resumen-texto').textContent = texto;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(function () { avisarCopia(true); },
        function () { avisarCopia(copiarFallback(texto)); });
    } else {
      avisarCopia(copiarFallback(texto));
    }
  }

  function limpiar() {
    form.reset();
    listaProd.replaceChildren();
    agregarFila(false);
    form.querySelectorAll('[data-tocado]').forEach(function (n) { delete n.dataset.tocado; });
    $('msg-copia').textContent = '';
    $('ver-resumen').open = false;
    actualizarModo();
    render();
    $('area').focus();
  }

  /* ---------- Eventos ---------- */

  form.addEventListener('submit', function (ev) { ev.preventDefault(); });
  form.addEventListener('input', function (ev) {
    if (ev.target && ev.target.dataset) ev.target.dataset.tocado = '1';
    $('msg-copia').textContent = '';
    render();
  });
  form.addEventListener('change', function (ev) {
    if (ev.target && ev.target.name === 'modoVolumen') actualizarModo();
    render();
  });
  form.addEventListener('focusout', function (ev) {
    var t = ev.target;
    if (t && t.dataset && t.dataset.campo && t.dataset.tocado !== '1') {
      t.dataset.tocado = '1';
      render();
    }
  });
  btnAgregar.addEventListener('click', function () { agregarFila(true); render(); });
  btnCopiar.addEventListener('click', copiar);
  btnImprimir.addEventListener('click', function () { if (ultimo && ultimo.ok) window.print(); });
  $('btn-limpiar').addEventListener('click', limpiar);
  window.addEventListener('beforeprint', function () {
    if (ultimo && ultimo.ok) $('resumen-impresion').textContent = textoResumen(ultimo);
  });

  /* ---------- Inicio ---------- */

  aplicarConfig();
  agregarFila(false);
  actualizarModo();
  render();
})();

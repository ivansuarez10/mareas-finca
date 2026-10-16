/* Adaptado de React Bits GlassSurface — © David Haz, MIT + Commons Clause — https://github.com/DavidHDev/react-bits */
/* CristalLiquido: puerto vanilla de GlassSurface (solo camino SVG + caídas; sin WebGL ni `shape`).
   API: CristalLiquido.crear(el, opciones) -> { camino, actualizar(op), destruir() }
        CristalLiquido.detectar() -> 'svg' | 'esmerilado' | 'solido'
        CristalLiquido.presets.barra / .panel
   Forzar camino en pruebas: ?cristal=svg|esmerilado|solido en la URL, u opciones.forzar. */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', n = 0;

  var presets = {
    // Píldora Tab Bar: refracción fuerte en un borde fino, sin calma extra (es chica).
    barra: { radio: 999, borde: 0.28, brillo: 50, opacidad: 0.93, suavizado: 11, escala: -140,
             rgb: [0, 0, 0], calma: 0, nubla: 0.4 },   /* ronda 7 (09): dispersión R/G/B de [0,5,10] a [0,0,0] (barra) y de [0,4,8] a [0,0,0] (panel): sobre cielo azul saturado el filo se veía como neón */
    // Panel de lectura: borde fino que dobla, centro calmado (desenfoque solo adentro).
    panel: { radio: 28, borde: 0.1, brillo: 50, opacidad: 0.93, suavizado: 12, escala: -110,
             rgb: [0, 0, 0], calma: 9, nubla: 0.5 }
  };
  var base = { radio: 20, borde: 0.07, brillo: 50, opacidad: 0.93, suavizado: 11, escala: -180,
               rgb: [0, 10, 20], calma: 0, nubla: 0.7, canalX: 'R', canalY: 'G', mezcla: 'difference' };

  function forzado() {
    try { var m = /[?&]cristal=(svg|esmerilado|solido)/.exec(root.location.search); return m && m[1]; } catch (e) { return null; }
  }
  function sinTransparencia() {
    try { return root.matchMedia('(prefers-reduced-transparency: reduce)').matches; } catch (e) { return false; }
  }
  // Solo Chromium dobla el fondo con filtros SVG (Chrome, Edge, Samsung Internet). Safari y Firefox
  // aceptan la sintaxis pero no la dibujan: se detectan por navegador, no por CSS.supports.
  function esChromium() {
    var u = root.navigator.userAgent;
    return /Chrome\/|Chromium\//.test(u) && !/Firefox|FxiOS|CriOS/.test(u);
  }
  function detectar() {
    var f = forzado(); if (f) return f;
    if (sinTransparencia()) return 'solido';
    var d = root.document.createElement('div');
    d.style.backdropFilter = 'url(#x)';
    if (esChromium() && d.style.backdropFilter !== '') return 'svg';
    if (root.CSS && CSS.supports && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'))) return 'esmerilado';
    return 'solido';
  }

  function mapa(w, h, o, id) {
    var borde = Math.min(w, h) * (o.borde * 0.5), r = Math.min(o.radio, h / 2, w / 2);
    return 'data:image/svg+xml,' + encodeURIComponent(
      '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg"><defs>' +
      '<linearGradient id="r' + id + '" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/></linearGradient>' +
      '<linearGradient id="b' + id + '" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/></linearGradient>' +
      '<filter id="s' + id + '" filterUnits="userSpaceOnUse" x="0" y="0" width="' + w + '" height="' + h + '" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="' + o.suavizado + '"/></filter></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="black"/>' +
      '<rect width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#r' + id + ')"/>' +
      '<rect width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#b' + id + ')" style="mix-blend-mode:' + o.mezcla + '"/>' +
      '<rect x="' + borde + '" y="' + borde + '" width="' + (w - borde * 2) + '" height="' + (h - borde * 2) + '" rx="' + r +
      '" fill="hsl(0 0% ' + o.brillo + '% / ' + o.opacidad + ')" filter="url(#s' + id + ')"/></svg>');
  }
  function crear(el, op) {
    var o = {}, k, p = op && op.preset ? presets[op.preset] : null;
    for (k in base) o[k] = base[k];
    if (p) for (k in p) o[k] = p[k];
    if (op) for (k in op) o[k] = op[k];

    var camino = (op && op.forzar) || detectar(), id = ++n, ro = null, raf = 0;
    var contenido = el.querySelector(':scope > .cl__contenido');
    if (!contenido) {
      contenido = root.document.createElement('div'); contenido.className = 'cl__contenido';
      while (el.firstChild) contenido.appendChild(el.firstChild);
      el.appendChild(contenido);
    }
    el.classList.add('cl', 'cl--' + camino);
    el.style.setProperty('--cl-radio', o.radio + 'px');
    if (camino === 'svg') { el.classList.add('cl--capas'); el.style.setProperty('--cl-filtro', 'url(#cl-f' + id + ')'); }
    if (o.tinte) el.style.setProperty('--cl-tinte', o.tinte);

    var svg, fe, desp = [], centro, capaBorde, capaTinte, fl = 'cl-f' + id;
    if (camino === 'svg') {
      svg = root.document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'cl__filtro'); svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML =
        '<defs><filter id="' + fl + '" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">' +
        '<feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"/>' +
        ['R', 'G', 'B'].map(function (c, i) {
          var m = c === 'R' ? '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0' : c === 'G' ? '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0' : '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0';
          return '<feDisplacementMap in="SourceGraphic" in2="map" result="d' + c + '"/><feColorMatrix in="d' + c + '" type="matrix" values="' + m + '" result="' + c + '"/>';
        }).join('') +
        '<feBlend in="R" in2="G" mode="screen" result="rg"/><feBlend in="rg" in2="B" mode="screen" result="out"/>' +
        '<feGaussianBlur in="out" stdDeviation="' + o.nubla + '"/>' +
        '</filter></defs>';
      el.insertBefore(svg, contenido);
      // Capas hermanas: borde que dobla + centro calmado + tinte. Hermanas (no anidadas) para que ambas vean la foto de atrás.
      capaBorde = root.document.createElement('span'); capaBorde.className = 'cl__borde'; capaBorde.setAttribute('aria-hidden', 'true');
      el.insertBefore(capaBorde, contenido);
      if (o.calma > 0) { centro = root.document.createElement('span'); centro.className = 'cl__centro'; centro.setAttribute('aria-hidden', 'true'); el.insertBefore(centro, contenido); }
      capaTinte = root.document.createElement('span'); capaTinte.className = 'cl__tinte'; capaTinte.setAttribute('aria-hidden', 'true');
      el.insertBefore(capaTinte, contenido);
      var f = svg.querySelector('filter');
      fe = f.querySelectorAll('feImage');
      desp = f.querySelectorAll('feDisplacementMap');
    }

    function pinta() {
      raf = 0;
      if (camino !== 'svg') return;
      var w = el.offsetWidth, h = el.offsetHeight; if (!w || !h) return;
      /* Sin destello al cambiar de tamaño (letra, rotación): el mapa nuevo se decodifica aparte y solo entonces reemplaza al anterior. */
      var uri = mapa(w, h, o, id), im = new Image(), ponlo = function () { fe[0].setAttribute('href', uri); };
      im.src = uri; if (im.decode) im.decode().then(ponlo, ponlo); else ponlo();
      if (centro) {
        var m = Math.max(4, Math.min(w, h) * o.borde * (o.margenCentro || 0.7)), g = 'linear-gradient(#000,#000)';
        centro.style.inset = m + 'px';
        centro.style.borderRadius = Math.max(2, Math.min(o.radio, h / 2) - m) + 'px';
        centro.style.setProperty('--cl-pluma', m + 'px');
        centro.style.setProperty('-webkit-backdrop-filter', 'blur(' + o.calma + 'px)'); centro.style.backdropFilter = 'blur(' + o.calma + 'px)';
      }
      for (var i = 0; i < 3; i++) {
        desp[i].setAttribute('scale', String(o.escala + o.rgb[i]));
        desp[i].setAttribute('xChannelSelector', o.canalX);
        desp[i].setAttribute('yChannelSelector', o.canalY);
      }
    }
    function pide() { if (!raf) raf = root.requestAnimationFrame(pinta); }
    if (camino === 'svg') {
      pinta();
      if (root.ResizeObserver) { ro = new ResizeObserver(pide); ro.observe(el); }
    }
    return {
      camino: camino,
      actualizar: function (nuevo) { for (var k in nuevo) o[k] = nuevo[k]; el.style.setProperty('--cl-radio', o.radio + 'px'); if (nuevo.tinte) el.style.setProperty('--cl-tinte', nuevo.tinte); pide(); },
      destruir: function () { if (ro) ro.disconnect(); if (raf) root.cancelAnimationFrame(raf); if (svg) svg.remove(); [capaBorde, centro, capaTinte].forEach(function (x) { if (x) x.remove(); }); el.classList.remove('cl', 'cl--capas', 'cl--' + camino); }
    };
  }

  root.CristalLiquido = { crear: crear, detectar: detectar, presets: presets };
})(window);

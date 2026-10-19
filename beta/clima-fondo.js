/* ClimaFondo · fondo vivo que simula el clima del momento (propio del estudio, 08 Motion, 15 oct 2026).
   Vanilla, sin dependencias. Capas: cielo (2 degradados que se funden), astro (resplandor suave), estrellas (SVG estático),
   nubes (manchas con degradado radial, animadas por WAAPI = solo compositor), niebla, agua (rayas que respiran en el sitio,
   sin dirección), lluvia (canvas 2D, 30 cuadros/s máx., se apaga sola cuando no llueve).
   API:  var f = ClimaFondo.montar(contenedor, opciones);  f.setEstado({momento, condicion, viento, dirViento, lluvia, nubes, medidoEn});
   Todos los números de velocidad, opacidad y tope son criterio propio del estudio (no son valores de Apple).

   COPIA DEL 09 PARA LA RONDA 7 (cambios sobre biblioteca/motion/ClimaFondo; ver notas-prototipador.md, "Cambios al motor"):
   1. agua apagada por defecto (opciones.agua=false): cielo en 3 paradas + resplandor, como la propuesta B del 05; sin astros, rayas ni anillos.
   2. nubes a ritmo lento: 6 a 12 min por cruce de pantalla con viento bajo; el viento acelera como mucho x1,5.
   3. estrellas quietas y solo en despejado y parcial.
   4. bruma nocturna (cf-bruma): de noche, nublado o peor se distingue por una bruma clara arriba que cambia con la condición.
   5. lluvia visible: gotas concentradas en la franja libre sobre el panel (setLibre) y una parte en toda la altura (rendija panel-barra y márgenes); más larga y opaca; inclinación por viento limitada a ~6 grados; menos esporádica cuanto más fuerte.
   6. neutro (sin clima o caducado) usa el cielo despejado de la hora, sin estrellas y con una sola nube tenue.
   7. el primer estado se pinta de golpe (sin fundido de 8 s desde negro).

   RONDA 8 (08 Motion, 16 oct 2026): nubes visibles, rayos y sol intenso. Criterio propio del estudio; no se igualo a Apple en el rayo ni en el movimiento (no se pudo ver, ver notas-motion.md).
   1. nubes: 3 capas de textura (canvas 2D dibujado UNA vez por estado, a media resolucion) con volumen (sombra abajo, luz arriba) y deriva con parallax (px/s distintos por capa).
   2. rayos: solo con condicion 'tormenta' (weather_code 95/96/99), nunca con clima caducado ni en modo quieto. Arco que cae y se bifurca al azar + destello de todo el cielo.
      Seguridad (WCAG 2.3.1): maximo 3 destellos por segundo (lo hace cumplir el codigo, ver puedeDestellar) y amplitud baja (opciones.rayoAmp, 0,20 por defecto).
   3. sol intenso: condicion 'despejado' de dia con el sol alto (25 a 45 grados de elevación, 0 con más de 15 % de nube) o condicion 'soleado' forzada. Nucleo cortado por el borde, bloom, velo blanco-calido y halo.
      El motor sigue diciendo condicion 'despejado' en cf:estado y agrega solIntenso / sol (0-1) para que el panel de cristal ajuste su tinte.

   RONDA 10 (08 Motion, 17 oct 2026): el cielo SE MUEVE. Ver notas-motion.md (mediciones y decisiones).
   1. nubes vivas: clima-nubes.js (ClimaNubes) sustituye a las 3 texturas con WAAPI: ruido fractal (fBm 3D) en WebGL con respaldo canvas 2D, tres capas que derivan con el
      viento REAL (tope de 90 s por ancho) y cambian de forma sin bucle; zona calma bajo el dato de marea (sin octavas finas, menos opacidad). Se apaga con opciones.nubesVivas=false.
   2. sol por elevación y hora (posición x/y), núcleo suave visible con aro, y destellos que respiran (opacidad, solo en la banda de cielo, nunca bajo el panel).
   3. lluvia: más inclinada con el viento, parte cae detrás del panel con menos opacidad y nada en la zona del dato vital.
   4. cf:estado agrega tinte (rgb del cielo detrás del panel), luzMaxPanel/luzMinPanel y nubes; también queda en las variables CSS --cf-tinte-rgb, --cf-lum-max, --cf-lum-min.
   5. cascada: webgl -> webgl ligero -> canvas 2D -> quieto; data-nivel y el evento cf:nivel avisan para que el panel suelte el desenfoque. */
(function (g) {
  'use strict';

  var MOMENTOS = ['amanecer', 'dia', 'atardecer', 'noche'];
  var CONDICIONES = ['despejado', 'parcial', 'nublado', 'llovizna', 'lluvia', 'tormenta', 'niebla', 'neutro', 'soleado'];   // 'soleado' = despejado con sol intenso forzado (pruebas)

  var DEF = {
    fps: 30,              // tope de cuadros de la lluvia (lo demás corre en el compositor)
    maxParticulas: 320,   // tope de gotas vivas a la vez (09 r7: 170 -> 260; la franja libre es chica y necesita densidad)
    maxNubes: 9,
    maxOndas: 8,          // anillos de lluvia en el agua
    caducaMin: 150,       // el clima caduca: pasado esto cae a 'neutro' (hora calculada)
    fundidoMs: 8000,      // fundido entre estados (2 s con Reducir movimiento)
    horizonte: 0.46,      // fracción de la altura donde está el horizonte (cielo arriba, agua abajo)
    grano: true,          // grano estático (evita bandas en degradados oscuros)
    zona: 'America/Tegucigalpa',
    paletas: null,        // {dia:{cielo:[3 hex], agua:[2 hex], luz:'#hex'}, ...} para sustituir las de fábrica
    estados: null,        // paleta exacta por estado, con la forma de paletas.json del 05: {'dia-lluvia':{cielo,agua,glow,nubes,niebla,estrellas}}; gana a paletas
    estatico: false,      // forzar la versión sin animación
    agua: false,          // 09 r7: propuesta B, sin agua (ahorra un canvas de rayas y no puede leerse como corriente)
    libre: 0.3,           // 09 r7: fracción de la altura que queda libre sobre el panel (la cambia setLibre con el valor real en px)
    inclinMax: 0.22,      // r10: inclinación máxima de la lluvia (vx/vy; 0,22 = ~12 grados, como la tormenta de Apple)
    rayos: true,          // r8: false = nunca rayos
    rayoAmp: 0.2,         // r8: opacidad máxima del destello del cielo (tope duro 0,22). Con 0,20 el salto de luminancia relativa del peor punto queda en 0,056 (noche) a 0,078 (día) en las paletas de tormenta: < 0,10 del umbral de destello general de WCAG 2.3.1
    rayoPrimero: [1800, 3800],   // r8: ms hasta el primer rayo
    rayoEntre: [5000, 11000],    // r8: ms entre rayos (esporádico)
    nubladoRelieve: 3.6,  // 09 r8 H1: en nublado, masas de nube más marcadas (alfa x3,6) y techo continuo al 35 %, para que se lean formas
    nubladoTecho: 0.35,
    solRespira: false,    // 09 r8: ver el bloom del sol (respiración de opacidad, apagada por costo medido)
    rayoQuieto: true,     // r8: en modo quieto (Reducir movimiento) se pinta un rayo tenue fijo, sin destello, para que la tormenta se distinga de la lluvia
    solElevMin: 25,       // r8 (criterio del 05): elevación solar en grados donde empieza el sol intenso...
    solElevMax: 45,       // ...y donde llega al máximo (suavizado entre las dos); con más de 15 % de cloud_cover vale 0
    lat: 13.39,           // r8: latitud de la COSTA de San Lorenzo (no de la finca) para calcular la elevación del sol con setSol()
    solX: 74,             // r8: posición horizontal del sol, % del ancho (Apple lo deja cerca del 77 %)
    solY: -3,             // r8: posición vertical, % del alto (negativo = fuera del cuadro por arriba, el núcleo queda cortado por el borde)
    nubesCapas: 3,
    nubesVivas: true,     // r10: nubes con ruido fractal (ClimaNubes). false = las texturas con WAAPI de la r8
    motorNubes: 'auto',   // 'auto' (webgl, y canvas si no hay) | 'webgl' | 'canvas'
    nubesRetardo: 0,      // r10: ms antes de que el cielo arranque a moverse (la entrada del camarón de la r9 termina primero; el cuadro fijo se ve desde el inicio)
    velocidadNubes: 3,  // r10: multiplicador de velocidad (1 = cruzar el ancho en >= 90 s; 1.5 = ~60 s). Ivan (19 oct): el movimiento se sentia quieto, se sube a 1.5
    escalaTiempo: 1.5,    // Ivan (19 oct): 'se ve muy estático' -> nubes ~3x mas movimiento que antes (cercana ~12 px/s, cirros ~5 px/s) y formas que cambian mas rapido
    tinteVivo: true,      // r10: mide el píxel más claro/oscuro y calcula el tinte del cristal con ClimaTinte (si está cargado)
    nubesSol: 0.75,        // r10: opacidad de las nubes finas con sol intenso (la r8 las dejaba en 0,15: no se veían)
    panelK: 0.8,          // r10b: cuánto de nube queda bajo el panel (0-1); r10 era 0,55 y a través del cristal se veía un degradado liso
    calmaK: 0.78,         // r10b (0,3 en r10; x panelK = 0,58 absoluto): cuánto queda en la zona del dato vital (0-1)
    calmaPx: 210,         // r10: alto (px) de la zona del dato vital bajo el borde del panel, si la app no avisa con setCalma()
    lluviaFr: 0.55,       // r10: fracción de gotas que caen solo en la banda de cielo (el resto sigue detrás del panel, con menos opacidad)
    lluviaPanelK: 0.4,    // r10: opacidad de la lluvia detrás del panel
    solGlints: true,      // r10: destellos suaves que respiran junto al sol
    nubesAlfa: 1          // r8: multiplicador de la opacidad de las nubes (la paleta del 05 fija la base)
  };


  /* Paletas de fábrica (provisionales: el 05 puede sustituirlas con opciones.paletas). Sin verde ni morado; el cálido del
     amanecer y el atardecer es arena/durazno apagado, no el naranja de la marea. */
  var PALETAS = {
    amanecer:  { cielo: ['#46688f', '#9fb2c4', '#efd2b0'], agua: ['#a9a9a8', '#3a566c'], luz: '#ffd9b0' },
    dia:       { cielo: ['#3b82c0', '#78b4dc', '#d6e9f0'], agua: ['#7fb4c4', '#2a6a82'], luz: '#fffbe8' },
    atardecer: { cielo: ['#3c5f8a', '#b4948f', '#efc79c'], agua: ['#a98f84', '#2f4a60'], luz: '#ffd1a0' },
    noche:     { cielo: ['#0b1a33', '#14284a', '#2a4468'], agua: ['#1c3350', '#0a1626'], luz: '#d2e1ff' }
  };

  /* Perfil por condición. c = cobertura de nubes 0-1; gris = cuánto se apaga el color; k = brillo; osc = cuánto se oscurecen
     las nubes; lluvia = [mínimo, máximo] de intensidad 0-1; niebla 0-1. */
  var PERFIL = {
    despejado: { c: 0.06, gris: 0,    k: 1,    osc: 0,    lluvia: [0, 0],      niebla: 0 },
    parcial:   { c: 0.38, gris: 0.12, k: 0.98, osc: 0.05, lluvia: [0, 0],      niebla: 0 },
    nublado:   { c: 0.85, gris: 0.5,  k: 0.88, osc: 0.25, lluvia: [0, 0],      niebla: 0 },
    llovizna:  { c: 0.9,  gris: 0.6,  k: 0.82, osc: 0.38, lluvia: [0.1, 0.3],  niebla: 0 },
    lluvia:    { c: 0.95, gris: 0.7,  k: 0.7,  osc: 0.55, lluvia: [0.3, 0.8],  niebla: 0 },
    tormenta:  { c: 1,    gris: 0.8,  k: 0.52, osc: 0.8,  lluvia: [0.7, 1],    niebla: 0 },
    niebla:    { c: 0.55, gris: 0.5,  k: 1,    osc: 0.1,  lluvia: [0, 0],      niebla: 1 },
    neutro:    { c: 0.18, gris: 0.1,  k: 1,    osc: 0,    lluvia: [0, 0],      niebla: 0 },
    soleado:   { c: 0.06, gris: 0,    k: 1,    osc: 0,    lluvia: [0, 0],      niebla: 0 }
  };

  var NUBE_BASE = { amanecer: [255, 226, 208], dia: [255, 255, 255], atardecer: [255, 216, 196], noche: [150, 168, 200] };
  var NUBE_OSC  = { amanecer: [84, 92, 108],  dia: [78, 92, 108],   atardecer: [80, 84, 100],   noche: [8, 14, 26] };
  var NIEBLA_C  = { amanecer: [214, 208, 204], dia: [208, 218, 223], atardecer: [210, 200, 196], noche: [58, 70, 88] };
  var LLUVIA_C  = { amanecer: '226,234,244', dia: '236,243,250', atardecer: '228,232,240', noche: '186,202,230' };

  /* ---------- utilidades ---------- */
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function hex(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function esc(c, k) { return [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)]; }
  function lum(c) { var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
  function rgb(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + (a == null ? ')' : ',' + a + ')'); }
  function css(c) { return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')'; }
  function prng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }

  /* ---------- hora del día ---------- */
  function minutos(txt) { // '2026-10-15T05:40' o '05:40' -> 340
    var m = /(\d{1,2}):(\d{2})/.exec(String(txt || '')); return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function ahoraEnZona(zona, fecha) { // minutos del día en la zona del pueblo, no la del teléfono
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: zona || DEF.zona, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(fecha || new Date());
      var h = 0, m = 0; p.forEach(function (x) { if (x.type === 'hour') h = +x.value % 24; if (x.type === 'minute') m = +x.value; });
      return h * 60 + m;
    } catch (e) { var d = fecha || new Date(); return d.getHours() * 60 + d.getMinutes(); }
  }
  /* Ventanas (criterio propio): amanecer [salida-30, salida+60), atardecer [puesta-75, puesta+35). */
  function momentoDe(ahoraMin, salidaMin, puestaMin) {
    if (salidaMin == null || puestaMin == null) return null;
    var a = ahoraMin;
    if (a >= salidaMin - 30 && a < salidaMin + 60) return 'amanecer';
    if (a >= salidaMin + 60 && a < puestaMin - 75) return 'dia';
    if (a >= puestaMin - 75 && a < puestaMin + 35) return 'atardecer';
    return 'noche';
  }
  /* Códigos WMO de Open-Meteo -> condición. Los desconocidos caen a 'neutro' (cielo de la hora, sin afirmar clima). */
  function codigoACondicion(c) {
    c = +c;
    if (c === 0 || c === 1) return 'despejado';
    if (c === 2) return 'parcial';
    if (c === 3) return 'nublado';
    if (c === 45 || c === 48) return 'niebla';
    if (c >= 51 && c <= 57) return 'llovizna';
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'lluvia';
    if (c === 95 || c === 96 || c === 99) return 'tormenta';
    return 'neutro';
  }
  function desdeQuery(q) { // ?clima=noche-lluvia&viento=20&lluvia=3&nubes=80&dir=90
    try {
      var p = new URLSearchParams(q != null ? q : location.search), c = p.get('clima'); if (!c) return null;
      var s = c.split('-'), m = s[0], k = s[1];
      if (MOMENTOS.indexOf(m) < 0 || CONDICIONES.indexOf(k) < 0) return null;
      var e = { momento: m, condicion: k };
      ['viento', 'lluvia', 'nubes'].forEach(function (n) { if (p.get(n) !== null && p.get(n) !== '' && isFinite(+p.get(n))) e[n] = +p.get(n); });
      if (p.get('dir') !== null && isFinite(+p.get('dir'))) e.dirViento = +p.get('dir');
      return e;
    } catch (x) { return null; }
  }

  /* ---------- cielo: degradado vertical según momento y condición ---------- */
  function cieloDe(momento, perfil, pal, h, ov, sinAgua) {
    if (sinAgua && ov) { // 09 r7: igual que capaCielo() de la demo del 05: resplandor + 3 paradas (0, 46 %, 100 %)
      var c3 = ov.cielo.map(hex), g = ov.glow, ls3 = c3.map(lum);
      var glow = 'radial-gradient(ellipse ' + g.r + '% ' + Math.round(g.r * 0.7) + '% at ' + g.x + '% ' + g.y + '%,' + rgb(hex(g.col), g.a) + ',rgba(0,0,0,0) 70%),';
      return { css: glow + 'linear-gradient(180deg,' + css(c3[0]) + ' 0%,' + css(c3[1]) + ' 46%,' + css(c3[2]) + ' 100%)', stops: c3.concat(c3.slice(2)), luzMax: Math.max.apply(null, ls3), luzMin: Math.min.apply(null, ls3) };
    }
    var stops = (ov ? ov.cielo.concat(ov.agua) : pal.cielo.concat(pal.agua)).map(hex), n = perfil.niebla;
    if (!ov) stops = stops.map(function (c, i) {
      var l = lum(c), gris = 255 * Math.pow(l, 1 / 2.4), g = [gris * 0.96, gris, gris * 1.05];
      var o = esc(mix(c, g, perfil.gris), perfil.k);
      if (n) o = mix(o, NIEBLA_C[momento], (i === 2 || i === 3 ? 0.62 : i === 1 ? 0.5 : 0.36) * n);
      return o;
    });
    var P = function (f) { return (f * 100).toFixed(1) + '%'; };
    var d = 'linear-gradient(180deg,' + css(stops[0]) + ' 0%,' + css(stops[1]) + ' ' + P(h * 0.55) + ',' + css(stops[2]) + ' ' + P(h - 0.02) +
      ',' + css(stops[3]) + ' ' + P(h + 0.016) + ',' + css(stops[4]) + ' 100%)';
    var ls = stops.map(lum);
    return { css: d, stops: stops, luzMax: Math.max.apply(null, ls), luzMin: Math.min.apply(null, ls) };
  }

  /* ---------- estrellas: SVG estático (dos capas que respiran fuera de fase) ---------- */
  function estrellasSVG(seed, n, hFrac) {
    var r = prng(seed), s = '';
    for (var i = 0; i < n; i++) {
      var x = (r() * 100).toFixed(2), y = (r() * hFrac * 92 + 1).toFixed(2), rad = (0.5 + r() * 0.6).toFixed(2), a = (0.3 + r() * 0.5).toFixed(2);
      s += '<circle cx="' + x + '%" cy="' + y + '%" r="' + rad + '" fill="rgb(222,232,255)" fill-opacity="' + a + '"/>';
    }
    return 'url("data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">' + s + '</svg>') + '")';
  }

  /* ================== montaje ================== */
  function montar(cont, opciones) {
    var o = {}, k; for (k in DEF) o[k] = DEF[k]; if (opciones) for (k in opciones) o[k] = opciones[k];
    var pals = {}; MOMENTOS.forEach(function (m) { pals[m] = (o.paletas && o.paletas[m]) || PALETAS[m]; });
    var H = clamp(o.horizonte, 0.2, 0.8), fijoAmp = !!(opciones && opciones.rayoAmp != null), fijoEntre = !!(opciones && opciones.rayoEntre);

    var raiz = el('div', 'cf'); raiz.setAttribute('aria-hidden', 'true');
    var cielos = [el('div', 'cf-cielo'), el('div', 'cf-cielo')];
    var astros = {}; MOMENTOS.forEach(function (m) { astros[m] = el('div', 'cf-astro cf-astro--' + m); });
    var estrellas = [el('div', 'cf-estrellas cf-estrellas--a'), el('div', 'cf-estrellas cf-estrellas--b')];
    var nubesCont = el('div', 'cf-nubes'), velo = el('div', 'cf-velo'), agua = el('div', 'cf-agua'), canvas = el('canvas', 'cf-lluvia'), bruma = el('div', 'cf-bruma');
    var sol = el('div', 'cf-sol'), solCapas = { velo: el('i', 'cf-sol-velo'), halo: el('i', 'cf-sol-halo'), bloom: el('i', 'cf-sol-bloom'), nucleo: el('i', 'cf-sol-nucleo') };
    var destello = el('div', 'cf-destello'), rayoCv = el('canvas', 'cf-rayo');
    ['velo', 'halo', 'bloom', 'nucleo'].forEach(function (n) { sol.appendChild(solCapas[n]); });
    raiz.classList.add('cf-sinfade');   // 09 r7: el primer estado se pinta de golpe
    cielos.forEach(function (c) { raiz.appendChild(c); });
    MOMENTOS.forEach(function (m) { raiz.appendChild(astros[m]); });
    estrellas.forEach(function (e) { raiz.appendChild(e); });
    raiz.appendChild(sol); raiz.appendChild(bruma); raiz.appendChild(nubesCont); raiz.appendChild(destello); raiz.appendChild(rayoCv);
    raiz.appendChild(velo); if (o.agua) raiz.appendChild(agua); raiz.appendChild(canvas);
    bruma.style.background = 'linear-gradient(180deg,rgba(136,154,188,1) 0%,rgba(136,154,188,.55) 26%,rgba(136,154,188,0) 62%)';
    if (o.grano) raiz.classList.add('cf--grano');
    raiz.style.setProperty('--cf-horizonte', (H * 100).toFixed(1) + '%');
    estrellas[0].style.setProperty('--est', estrellasSVG(11, 34, H));
    estrellas[1].style.setProperty('--est', estrellasSVG(29, 26, H));
    cont.appendChild(raiz);
    var glints = el('div', 'cf-glints'), glintEls = [];   // r10: destellos del sol, confinados a la banda de cielo (no se superponen al cristal: el desenfoque no se repinta por ellos)
    raiz.insertBefore(glints, bruma);
    var NB = null;
    if (o.nubesVivas && g.ClimaNubes) {
      try { NB = g.ClimaNubes.crear(nubesCont, { modo: o.motorNubes, velocidad: o.velocidadNubes, escalaTiempo: o.escalaTiempo, retardo: o.nubesRetardo, permitirSoftware: !!o.permitirSoftware, onNivel: function (n, modo) { raiz.dataset.nivel = n; raiz.dataset.nubes = modo; try { cont.dispatchEvent(new CustomEvent('cf:nivel', { detail: { nivel: n, modo: modo } })); } catch (e) { /* sin eventos */ } } }); if (NB.sinMotor) NB = null; } catch (e) { NB = null; }
    }

    // rayas del agua: respiran en el sitio (opacidad y ancho), sin desplazarse hacia ningún lado
    var rayas = [], NR = 18, rr = prng(77);
    for (var i = 0; i < (o.agua ? NR : 0); i++) {
      var t = Math.pow(i / (NR - 1), 1.7), e = el('i');
      e.style.top = (t * 96 + 1).toFixed(1) + '%';
      e.style.width = (14 + t * 30 + rr() * 22).toFixed(0) + '%';
      e.style.left = (rr() * (100 - parseFloat(e.style.width))).toFixed(0) + '%';
      e.style.height = (1 + t * 1.2).toFixed(1) + 'px';
      e.style.setProperty('--d', (5 + rr() * 5).toFixed(1) + 's');
      e.style.setProperty('--r', (-rr() * 9).toFixed(1) + 's');
      e.style.setProperty('--k', (0.55 + 0.45 * t + rr() * 0.2).toFixed(2));
      agua.appendChild(e); rayas.push(e);
    }

    var S = {            // estado interno
      pedido: null, efectivo: null, sol: null, caducado: false,
      cieloAct: 0, cieloCss: '', clave: '', nubes: [], rate: 1,
      reducido: false, ahorro: false, degradado: false, oculto: document.hidden, pausado: false,
      I: 0, Iobj: 0, raf: 0, last: 0, w: 0, h: 0, ctx: null, dpr: 1,
      ms: 0, fps: 0, cuadros: 0, t0fps: 0, lentos: 0, factor: 1, lluviaCol: LLUVIA_C.dia, viento: 0, dir: 90, momento: 'dia', fluye: 0,
      gotas: new Float32Array(o.maxParticulas * 7), n: 0, libre: 0, primero: true, ondas: [], tCaduca: 0, tSol: 0, mql: null,
      sinFundirNubes: false, solK: 0, tormenta: false, rayoCfg: { amp: o.rayoAmp, entre: o.rayoEntre }, rayo: { cfg: function () { return S.rayoCfg.entre; }, timer: 0, raf: 0, ts: [], pico: 0, total: 0, doble: false, ultimo: null, destello: null }
    };
    S.ctx = canvas.getContext('2d');

    function quieto() { return o.estatico || S.reducido || S.ahorro || S.degradado || S.pausado || S.oculto; }
    function sinMov() { return o.estatico || S.reducido || S.ahorro || S.degradado; } // quieto de verdad (no solo en pausa)

    function modoClases() {
      raiz.classList.toggle('cf-quieto', sinMov());
      raiz.classList.toggle('cf-pausa', !sinMov() && (S.pausado || S.oculto));
      raiz.style.setProperty('--cf-fundido', (sinMov() ? 2000 : o.fundidoMs) + 'ms');
    }

    /* ---------- cielo (dos capas, fundido) ---------- */
    function ponerCielo(c) {
      if (c === S.cieloCss) return;
      S.cieloCss = c;
      var nuevo = 1 - S.cieloAct;
      cielos[nuevo].style.background = c;
      cielos[nuevo].classList.add('cf-on'); cielos[S.cieloAct].classList.remove('cf-on');
      S.cieloAct = nuevo;
      raiz.style.setProperty('--cf-cielo', c);
    }

    /* ---------- nubes (r8) ----------
       Cada capa es un canvas 2D que se dibuja UNA vez por estado, a media resolución (el escalado del navegador lo suaviza) y se desplaza con
       WAAPI (solo transform: compositor). Cada nube son bolas con degradado radial en dos pasadas: sombra abajo y luz arriba = volumen sin contorno.
       Cobertura (cob 0-1): pocos grupos separados (parcial) a un techo continuo (cerrado). Capa 0 lejos y lenta, capa 2 cerca, más grande y rápida. */
    var CLARO  = { amanecer: [255, 236, 226], dia: [255, 255, 255], atardecer: [255, 226, 212], noche: [128, 148, 184] };
    var SOMBRA = { amanecer: [92, 96, 120],   dia: [84, 100, 124],  atardecer: [96, 88, 112],   noche: [6, 10, 20] };
    var CAPA = [ { esc: 0.6,  rad: 0.78, alfa: 0.8,  px: 1.2, ax: 0.28, op: 0.8 },
                 { esc: 0.55, rad: 1,    alfa: 1,    px: 2.2, ax: 0.38, op: 0.92 },
                 { esc: 0.5,  rad: 1.32, alfa: 1.08, px: 3.6, ax: 0.45, op: 1 } ];   // px = px/s a 390 px de ancho (se escala con el ancho)
    function banda() { return Math.max(120, (S.libre > 0 ? S.libre : o.libre * (S.h || 844)) + 24); }
    function gauss(r) { return (r() + r() + r() - 1.5) / 1.5; }

    function pintarCapa(cv, capa, pal, cob, m, cond, ancho, alto, dens) {
      var P = CAPA[capa], ctx = cv.getContext('2d'), r = prng(300 + capa * 91 + (cond === 'tormenta' ? 7 : 0) + MOMENTOS.indexOf(m) * 3), pf = PERFIL[cond] || PERFIL.neutro;
      ctx.scale(P.esc, P.esc);
      var fuerte = pf.osc > 0.5, col = pal.col, luz = pal.luz || mix(col, CLARO[m], fuerte ? 0.34 : 0.62 * (1 - pf.osc * 0.8)), som = pal.som || mix(col, fuerte && m !== 'noche' ? [18, 24, 36] : SOMBRA[m], fuerte ? 0.85 : 0.7), D = cob;   // pal.luz / pal.som: los del 05 (paletas r8); sin ellos, derivados del color de la r7
      var REL = cond === 'nublado' ? o.nubladoRelieve : 1, nC = Math.max(2, Math.round(1.5 + Math.pow(D, 1.5) * 8)), W = ancho / 2, B = alto / 1.5, alfaP = o.nubesAlfa * clamp(dens, 0.15, 1.3);
      if (REL > 1) { luz = mix(luz, [255, 255, 255], m === 'noche' ? 0.22 : 0.5); som = mix(som, [10, 16, 28], 0.25); }   // H1: masa clara y sombra más honda = formas legibles
      for (var c = 0; c < nC; c++) {
        var cx = r() * ancho, cy = B * (0.1 + r() * 0.62), np = Math.round((7 + D * 14) * (capa === 0 ? 1.25 : 1) * (REL > 1 ? 2.2 : 1)), sx = ancho * (0.045 + D * 0.07), sy = B * (0.08 + D * 0.16);
        for (var k = 0; k < np; k++) {
          var x = cx + gauss(r) * sx * 2, y = cy + gauss(r) * sy * 2, R = W * (0.09 + Math.pow(r(), 1.6) * 0.3) * P.rad * (0.75 + 0.25 * D) * (REL > 1 ? 0.6 : 1);
          var a = clamp(alfaP * P.alfa * (0.2 + 0.2 * r()) * (REL > 1 ? REL * 0.55 : 1), 0, REL > 1 ? 0.85 : 0.6);
          var g = ctx.createRadialGradient(x, y + R * 0.28, R * 0.08, x, y + R * 0.28, R);   // sombra (abajo)
          g.addColorStop(0, rgb(som, a)); g.addColorStop(0.55, rgb(som, a * 0.5)); g.addColorStop(1, rgb(som, 0));
          ctx.fillStyle = g; ctx.fillRect(x - R, y - R * 0.72, R * 2, R * 2.1);
          var R2 = R * 0.8, y2 = y - R * 0.2, g2 = ctx.createRadialGradient(x, y2, R2 * 0.05, x, y2, R2);   // luz (arriba)
          g2.addColorStop(0, rgb(luz, a * 0.95)); g2.addColorStop(0.5, rgb(luz, a * 0.5)); g2.addColorStop(1, rgb(luz, 0));
          ctx.fillStyle = g2; ctx.fillRect(x - R2, y2 - R2, R2 * 2, R2 * 2);
        }
      }
      if (D > 0.7) { // techo continuo: unifica el cielo cerrado
        var tg = ctx.createLinearGradient(0, 0, 0, alto); tg.addColorStop(0, rgb(mix(col, som, 0.3), (D - 0.7) * (fuerte ? 0.5 : 0.9) * alfaP * (REL > 1 ? o.nubladoTecho : 1))); tg.addColorStop(0.7, rgb(col, (D - 0.7) * (fuerte ? 0.25 : 0.45) * alfaP * (REL > 1 ? o.nubladoTecho : 1))); tg.addColorStop(1, rgb(col, 0));
        ctx.fillStyle = tg; ctx.fillRect(0, 0, ancho, alto);
      }
      // borde inferior suave: debajo de la banda de cielo la nube se borra, sin corte duro (se vería en los márgenes del panel)
      ctx.globalCompositeOperation = 'destination-out';
      var fg = ctx.createLinearGradient(0, alto * 0.62, 0, alto); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = fg; ctx.fillRect(0, alto * 0.62, ancho, alto * 0.38);
      ctx.globalCompositeOperation = 'source-over';
    }

    function crearCapa(capa, pal, cob, m, cond, dens) {
      var W = S.w || cont.clientWidth || 390, B = banda(), P = CAPA[capa], ancho = W * 2, alto = B * 1.5;
      var cv = el('canvas', 'cf-nube'); cv.width = Math.round(ancho * P.esc); cv.height = Math.round(alto * P.esc);
      cv.style.cssText = 'width:' + ancho.toFixed(0) + 'px;height:' + alto.toFixed(0) + 'px;left:' + (-W * 0.5).toFixed(0) + 'px;top:0';
      try { pintarCapa(cv, capa, pal, cob, m, cond, ancho, alto, dens); } catch (e) { /* sin canvas: sin nubes, el cielo sigue */ }
      var ax = W * P.ax, dur = (2 * ax / (P.px * W / 390)) * 1000, a = null, rr = prng(700 + capa);
      if (cv.animate) {
        a = cv.animate([{ transform: 'translate3d(' + (-ax).toFixed(0) + 'px,0,0)' }, { transform: 'translate3d(' + ax.toFixed(0) + 'px,0,0)' }],
          { duration: dur, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
        a.currentTime = rr() * dur * 2; a.playbackRate = S.rate;
        if (quieto()) a.pause();
      }
      return { el: cv, anim: a, op: P.op };
    }

    function reconstruirNubes(pal, cob, m, cond, dens) {
      var viejas = S.nubes, ya = S.sinFundirNubes; S.nubes = []; S.sinFundirNubes = false;
      viejas.forEach(function (v) {
        if (ya) { if (v.anim) v.anim.cancel(); if (v.el.parentNode) v.el.parentNode.removeChild(v.el); return; }
        v.el.style.opacity = 0;
        setTimeout(function () { if (v.anim) v.anim.cancel(); if (v.el.parentNode) v.el.parentNode.removeChild(v.el); }, (sinMov() ? 2000 : o.fundidoMs) + 600);
      });
      var n = Math.min(o.nubesCapas, 3, o.maxNubes);
      if (cob < 0.2) n = Math.min(n, 2);
      for (var i = 0; i < n; i++) {   // se pintan de la lejana a la cercana; si hay 2, la lejana y la media
        var nb = crearCapa(i, pal, cob, m, cond, dens); nubesCont.appendChild(nb.el); S.nubes.push(nb);
      }
      void nubesCont.offsetWidth;
      S.nubes.forEach(function (nb) { nb.el.style.opacity = nb.op; });
    }

    /* ---------- lluvia ---------- */
    function zonas() { // r10: banda de cielo y zona calma del dato vital, en px desde arriba
      if (!NB || !S.h) return;
      var b = banda() - 24, a0 = S.calma0 != null ? S.calma0 : b, a1 = S.calma1 != null ? S.calma1 : b + o.calmaPx;
      NB.setZonas({ banda: b, calma0: a0, calma1: a1, panelK: o.panelK, calmaK: o.calmaK });
      glints.style.height = Math.max(60, b) + 'px';
      destello.style.height = (b + 30) + 'px'; destello.style.webkitMaskImage = destello.style.maskImage = 'linear-gradient(180deg,#000 0,#000 ' + Math.max(10, b - 20) + 'px,transparent ' + (b + 30) + 'px)';   // 05/director: nada de destello en la zona calma
      S.pideVivo = true;
    }
    function dimensionar() {
      var W = cont.clientWidth, Hh = cont.clientHeight; if (!W || !Hh) return;
      if (NB) zonas();
      S.w = W; S.h = Hh; S.dpr = Math.min(g.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(W * S.dpr); canvas.height = Math.round(Hh * S.dpr);
      S.ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      rayoCv.width = Math.round(W * S.dpr); rayoCv.height = Math.round((banda() + 40) * S.dpr); rayoCv.style.height = (banda() + 40) + 'px';
      if (sinMov() && S.tormenta) pintarRayoQuieto();
      if (sinMov() && S.I > 0.01) pintarEstatica();
    }
    function maxGotas() { return Math.round(Math.min(o.maxParticulas, 30 + 300 * S.I * S.factor) * clamp((S.w * S.h) / (390 * 844), 0.6, 1.4)); }
    function inclin() { return clamp(-Math.sin(S.dir * Math.PI / 180) * S.viento * 0.3, -o.inclinMax, o.inclinMax); }
    function zonaA() { var b = banda() - 24; return [S.calma0 != null ? S.calma0 : b, S.calma1 != null ? S.calma1 : b + o.calmaPx]; }
    function yLibre() { return S.libre > 0 ? S.libre : o.libre * S.h; }
    function kLluvia() { return (S.momento === 'noche' ? 1.15 : 1) * (0.75 + 0.5 * Math.min(1, S.I)); }
    /* 09 r7: 72 % de las gotas viven solo en la franja libre sobre el panel (ahí es donde se ven); el resto cae a toda la altura y se ve en la rendija panel-barra y en los márgenes */
    function nuevaGota(inicio) {
      var l = S.n * 7, far = Math.random() < 0.5, fr = Math.random() < o.lluviaFr ? 1 : 0, tope = fr ? yLibre() + 24 : S.h + 10, k = 0.75 + S.I * 0.45;
      S.gotas[l] = Math.random() * (S.w + 60) - 30;                                // x
      S.gotas[l + 1] = inicio ? Math.random() * tope : -20 - Math.random() * 60;  // y
      S.gotas[l + 2] = far ? 560 + Math.random() * 140 : 820 + Math.random() * 260;  // vy px/s
      S.gotas[l + 3] = (far ? 11 + Math.random() * 6 : 18 + Math.random() * 10) * k; // largo
      S.gotas[l + 4] = far ? 0 : 1;                                                // cerca
      S.gotas[l + 5] = inclin();                                                   // inclinación (vx/vy)
      S.gotas[l + 6] = fr;                                                         // 1 = solo franja libre
      S.n++;
    }

    function bucleLluvia(t) {
      S.raf = requestAnimationFrame(bucleLluvia);
      if (t - S.last < 1000 / o.fps - 2) return;
      var dt = S.last ? Math.min((t - S.last) / 1000, 0.1) : 0.033; S.last = t;
      // cuadros por segundo reales, cada 3 s
      S.cuadros++; if (!S.t0fps) S.t0fps = t;
      if (t - S.t0fps >= 3000) { S.fps = S.cuadros / ((t - S.t0fps) / 1000); S.cuadros = 0; S.t0fps = t; guardia(); }
      var c0 = performance.now();
      S.I += (S.Iobj - S.I) * (1 - Math.exp(-dt / 3));                                  // sube y baja en ~6-9 s
      var seg = t / 1000, amp = clamp(0.5 - 0.45 * S.Iobj, 0.1, 0.5), mod = 1 - amp * (0.5 + 0.5 * Math.sin(seg / 21) * Math.sin(seg / 8.3 + 1.2));   // 09 r7: más constante cuanto más fuerte (llovizna 0,6 a 1; tormenta 0,9 a 1)
      var objetivo = maxGotas() * (S.Iobj > 0 ? mod : 0) * Math.min(1, S.I / Math.max(S.Iobj, 0.01));
      var ctx = S.ctx; ctx.clearRect(0, 0, S.w, S.h);
      var yAgua = S.h * H, cercas = new Path2D(), lejos = new Path2D(), cercasP = new Path2D(), lejosP = new Path2D(), g7 = S.gotas, i, libre = yLibre() + 24, kk = kLluvia(), za = zonaA();
      for (i = 0; i < S.n; i++) {
        var l = i * 7; g7[l + 1] += g7[l + 2] * dt; g7[l] += g7[l + 5] * g7[l + 2] * dt;
        if (g7[l + 1] > (g7[l + 6] ? libre : S.h + 10)) {                    // sale: se recicla solo si falta lluvia
          if (S.n <= objetivo) { g7[l] = Math.random() * (S.w + 60) - 30; g7[l + 1] = -20 - Math.random() * 50; g7[l + 5] = inclin(); }
          else { S.n--; g7.copyWithin(l, S.n * 7, S.n * 7 + 7); i--; continue; }
        }
        var gy = g7[l + 1]; if (gy > za[0] && gy < za[1]) continue;   // r10: ni una gota sobre el dato vital (14, zona A)
        var P = g7[l + 4] ? (gy > libre ? cercasP : cercas) : (gy > libre ? lejosP : lejos);   // bajo la banda (detrás del panel) la lluvia va con menos opacidad
        P.moveTo(g7[l], gy); P.lineTo(g7[l] + g7[l + 5] * g7[l + 3], gy - g7[l + 3]);
      }
      while (S.n < objetivo && S.n < o.maxParticulas) nuevaGota(false);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(' + S.lluviaCol + ',' + Math.min(0.5, 0.26 * kk).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke(lejos);
      ctx.strokeStyle = 'rgba(' + S.lluviaCol + ',' + Math.min(0.8, 0.5 * kk).toFixed(3) + ')'; ctx.lineWidth = 1.4; ctx.stroke(cercas);
      ctx.strokeStyle = 'rgba(' + S.lluviaCol + ',' + (Math.min(0.5, 0.26 * kk) * o.lluviaPanelK).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.stroke(lejosP);
      ctx.strokeStyle = 'rgba(' + S.lluviaCol + ',' + (Math.min(0.8, 0.5 * kk) * o.lluviaPanelK).toFixed(3) + ')'; ctx.lineWidth = 1.4; ctx.stroke(cercasP);
      if (o.agua) { // anillos en el agua (solo con agua)
        if (S.ondas.length < o.maxOndas && Math.random() < dt * S.I * 9 * S.factor) S.ondas.push({ x: Math.random() * S.w, y: yAgua + 6 + Math.random() * (S.h - yAgua - 20), t: 0 });
        ctx.lineWidth = 0.8;
        for (i = S.ondas.length - 1; i >= 0; i--) {
          var w = S.ondas[i]; w.t += dt; var p = w.t / 1.5;
          if (p >= 1) { S.ondas.splice(i, 1); continue; }
          ctx.strokeStyle = 'rgba(' + S.lluviaCol + ',' + (0.22 * (1 - p)).toFixed(3) + ')';
          ctx.beginPath(); ctx.ellipse(w.x, w.y, 3 + p * 14 * (0.6 + S.I * 0.5), (3 + p * 14) * 0.28, 0, 0, 6.2832); ctx.stroke();
        }
      }
      S.ms += ((performance.now() - c0) - S.ms) * 0.1;
      if (S.I < 0.01 && S.Iobj === 0 && S.n === 0 && !S.ondas.length) { detenerLluvia(); }
    }

    function guardia() { // tope de cuadros: si el celular no da, baja la lluvia y, si sigue mal, deja el cielo quieto
      var mal = S.fps < 20 || S.ms > 5;
      S.lentos = mal ? S.lentos + 1 : 0;
      if (S.lentos >= 2) {
        S.lentos = 0;
        if (S.factor > 0.35) S.factor *= 0.6;
        else { S.degradado = true; modoClases(); aplicarMovimiento(); }
      }
    }

    function pintarEstatica() { // lluvia "congelada": se reconoce sin moverse (misma distribución que la viva: franja libre + resto)
      var ctx = S.ctx; ctx.clearRect(0, 0, S.w, S.h);
      var n = Math.round(maxGotas() * 0.9), r = prng(5), ln = inclin(), kk = kLluvia(), libre = yLibre() + 24, k = 0.75 + S.I * 0.45, za = zonaA();
      ctx.lineCap = 'round';
      [[0, 1], [0, 0.4], [1, 1], [1, 0.4]].forEach(function (cp) {   // [cerca, factor de opacidad]: 1 = banda de cielo, 0,4 = detrás del panel
        var cerca = cp[0], pan = cp[1] < 1; ctx.beginPath(); ctx.lineWidth = cerca ? 1.4 : 1;
        ctx.strokeStyle = 'rgba(' + S.lluviaCol + ',' + ((cerca ? Math.min(0.8, 0.5 * kk) : Math.min(0.5, 0.26 * kk)) * (pan ? o.lluviaPanelK : 1)).toFixed(3) + ')';
        r = prng(5);
        for (var i = 0; i < n; i++) {
          var esCerca = r() >= 0.5, fr = r() < o.lluviaFr, x = r() * S.w, y = r() * (fr ? libre : S.h), l = (esCerca ? 18 + r() * 10 : 11 + r() * 6) * k;
          if (esCerca !== !!cerca || (y > libre) !== pan || (y > za[0] && y < za[1])) continue;
          ctx.moveTo(x, y); ctx.lineTo(x + ln * l, y - l);
        }
        ctx.stroke();
      });
    }

    function arrancarLluvia() {
      if (S.raf || sinMov() || S.pausado || S.oculto || !S.w) return;
      if (S.n === 0 && S.Iobj > 0.01) { if (S.primero) S.I = S.Iobj; var pre = Math.round(maxGotas() * 0.85 * Math.min(1, S.I / Math.max(S.Iobj, 0.01))); while (S.n < pre) nuevaGota(true); }   // 09 r7: la lluvia ya cae al abrir (no entra como cortina)
      S.last = 0; S.t0fps = 0; S.cuadros = 0; S.raf = requestAnimationFrame(bucleLluvia);
    }
    function detenerLluvia() {
      if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0;
      if (S.Iobj === 0 && S.I < 0.01) { S.ctx.clearRect(0, 0, S.w, S.h); S.n = 0; S.ondas.length = 0; }
    }

    function aplicarMovimiento() { // pausa / reanuda todo lo que se mueve
      S.nubes.forEach(function (n) { if (n.anim) { if (quieto()) n.anim.pause(); else n.anim.play(); } });
      if (NB) { if (sinMov()) NB.quieto(true); else { NB.quieto(false); if (quieto()) NB.pausar(); else NB.reanudar(); } }
      glintEls.forEach(function (x) { if (x.anim) { if (quieto()) x.anim.pause(); else x.anim.play(); } });
      if (S.respiro) { if (quieto()) S.respiro.pause(); else S.respiro.play(); }
      modoClases();
      if (quieto()) { detenerRayos(); if (sinMov() && S.tormenta) pintarRayoQuieto(); }
      else if (S.tormenta && !S.rayo.timer) { limpiarRayo(); siguienteRayo(true); }
      if (quieto()) {
        detenerLluvia();
        if (sinMov() && S.Iobj > 0.01) { S.I = S.Iobj; pintarEstatica(); } else if (sinMov()) S.ctx.clearRect(0, 0, S.w, S.h);
      } else if (S.Iobj > 0.01 || S.n) arrancarLluvia();
    }

    /* ---------- sol intenso (r8) ----------
       Lo visto en el Clima de macOS (16 oct, Madrid, "Sunny"): el sol queda FUERA del cuadro por arriba, el núcleo blanco lo corta el borde, el bloom lava el cielo
       a blanco-cálido y cae suave en ~25-30 % del alto, y hay un halo en anillo tenue. No hay disco dibujado. Aquí: mismas piezas, medidas y colores propios. */
    function pintarSol(gs) {
      gs = gs || solGeom({}, 'dia');
      var P = gs.px, k = P.vw / 390, X = P.x.toFixed(0) + 'px ' + P.y.toFixed(0) + 'px', r = function (n) { return (n * k).toFixed(0) + 'px'; };
      /* 10b: todo en px y en círculos (antes en % de un cuadro no cuadrado: el núcleo salía ovalado y el borde de arriba lo cortaba). El sol entero (disco, aro, bloom) cae dentro de la banda visible. */
      solCapas.velo.style.background = 'radial-gradient(ellipse ' + r(380) + ' ' + r(250) + ' at ' + X + ',rgba(255,243,230,.50) 0%,rgba(255,241,226,.24) 45%,rgba(255,241,226,0) 100%)';
      // aro doble, fino y suave: el del video de Ivan apenas se nota; el halo se ve más como un velo que como un anillo duro
      solCapas.halo.style.background = 'radial-gradient(circle ' + r(112) + ' at ' + X + ',rgba(255,255,255,0) 58%,rgba(255,240,218,.20) 74%,rgba(255,255,255,0) 100%),radial-gradient(circle ' + r(176) + ' at ' + X + ',rgba(255,255,255,0) 60%,rgba(206,232,255,.13) 76%,rgba(255,255,255,0) 100%)';
      solCapas.bloom.style.background = 'radial-gradient(circle ' + r(210) + ' at ' + X + ',rgba(255,251,244,.78) 0%,rgba(255,244,230,.50) 24%,rgba(255,238,214,.20) 56%,rgba(255,238,214,0) 100%)';
      // núcleo: disco blando completo (no un símbolo): centro casi blanco, borde difuminado
      solCapas.nucleo.style.background = 'radial-gradient(circle ' + r(54) + ' at ' + X + ',rgba(255,255,252,1) 0%,rgba(255,252,242,.97) 42%,rgba(255,246,226,.62) 70%,rgba(255,240,214,0) 100%)';
      raiz.style.setProperty('--cf-sol-x', gs.x.toFixed(1) + '%'); raiz.style.setProperty('--cf-sol-y', gs.y.toFixed(1) + '%');
      if (o.solRespira && solCapas.bloom.animate && !S.respiro) {
        S.respiro = solCapas.bloom.animate([{ opacity: 0.93 }, { opacity: 1 }], { duration: 11000, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
        if (quieto()) S.respiro.pause();
      }
    }
    /* r10: destellos del sol. Parches de luz blanda alrededor del sol, SOLO dentro de la banda de cielo (el contenedor mide la banda), que respiran en opacidad (7 a 13 s, amplitud baja,
       desfasados: nunca se encienden todos a la vez). Nada se desplaza ni escala (14: sin pulso, sin zoom). Se crean una vez; la posición sigue al sol. */
    function pintarGlints(gs, solK) {
      if (!o.solGlints) return;
      if (!glintEls.length) {
        var rg = prng(909);
        for (var i = 0; i < 6; i++) {   // 10b: 6 destellos (5 a 7), 7 a 13 s, repartidos en el aro y el resto del halo
          var e = el('i'), ang = (i + rg() * 0.7) / 6 * 6.283 + 0.4, rad = 0.12 + rg() * 0.30, tam = 28 + rg() * 52, d = 7000 + rg() * 6000, amp = 0.26 + rg() * 0.2;
          e.style.cssText = 'position:absolute;display:block;border-radius:50%;opacity:0;width:' + tam.toFixed(0) + 'px;height:' + tam.toFixed(0) + 'px;margin:' + (-tam / 2).toFixed(0) + 'px 0 0 ' + (-tam / 2).toFixed(0) + 'px;background:radial-gradient(closest-side,rgba(255,252,238,1),rgba(255,248,226,.5) 45%,rgba(255,244,214,0) 100%)';
          glints.appendChild(e);
          var x = { el: e, ang: ang, rad: rad, d: d, amp: amp, anim: null }; glintEls.push(x);
        }
      }
      var P = gs.px, W = S.w || cont.clientWidth || 390, Hb = Math.max(60, banda() - 24);
      glintEls.forEach(function (x, i) {
        var px = P.x + Math.cos(x.ang) * x.rad * P.vw, py = P.y + Math.sin(x.ang) * x.rad * P.vw * 0.5;
        px = clamp(px, P.ox + 20, P.ox + P.vw - 20); py = clamp(py, P.oy + 16, Hb - 26);   // nunca bajo la banda de cielo
        x.el.style.left = px.toFixed(0) + 'px'; x.el.style.top = py.toFixed(0) + 'px';
        var pico = (x.amp * solK).toFixed(3);
        if (x.anim) { x.anim.cancel(); x.anim = null; }
        if (solK <= 0.01) { x.el.style.opacity = 0; return; }
        if (sinMov() || !x.el.animate) { x.el.style.opacity = (x.amp * solK * 0.5).toFixed(3); return; }   // Reducir movimiento: cuadro fijo, tenue
        x.anim = x.el.animate([{ opacity: 0 }, { opacity: +pico }, { opacity: 0 }], { duration: x.d, iterations: Infinity, easing: 'ease-in-out', delay: -x.d * ((i * 0.37) % 1) });
        if (quieto()) x.anim.pause();
      });
    }
    /* elevación del sol en grados, por la fórmula astronómica con la latitud del pueblo (opciones.lat), el día del año y la hora solar (mediodía = punto medio entre salida y puesta).
       Momento fijado a mano o sin hora de sol: 0, salvo que se pase est.elevacion (pruebas). */
    function elevacionSol(est, m) {
      if (m !== 'dia') return 0;
      if (isFinite(est.elevacion) && est.elevacion !== null) return +est.elevacion;
      if (est.momentoFijo || !S.sol) return 0;
      var a = ahoraEnZona(o.zona), H = (a - (S.sol[0] + S.sol[1]) / 2) / 4 * Math.PI / 180, d = new Date(), N = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
      var dec = -23.44 * Math.cos(2 * Math.PI * (N + 10) / 365) * Math.PI / 180, lat = o.lat * Math.PI / 180;
      return Math.asin(clamp(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H), -1, 1)) * 180 / Math.PI;
    }
    /* r10: posición del sol en pantalla (% del ancho y del alto) por la hora solar y la elevación reales. x: ángulo horario -75..75 grados -> 12..88 %; y: elevación 90..25 grados -> 5..15 %
       (sol visible, justo bajo el borde, con el aro alrededor). Sin hora de sol: la posición fija de la r8. Amanecer y atardecer no pintan sol intenso: el cielo ya trae su resplandor. */
    function vis() { // parte visible del fondo (el fondo sobrepasa la pantalla por --sobre): el sol se coloca aquí, nunca en el sobreescaneo
      var r = cont.getBoundingClientRect ? cont.getBoundingClientRect() : { left: 0, top: 0 }, W = S.w || cont.clientWidth || 390, Hh = S.h || cont.clientHeight || 844;
      var ox = clamp(-r.left, 0, Math.max(0, W / 2 - 100)), oy = clamp(-r.top, 0, Math.max(0, Hh / 2 - 100));
      return { ox: ox, oy: oy, vw: W - 2 * ox, vh: Hh - 2 * oy, W: W, H: Hh };
    }
    function solGeom(est, m) {
      var V = vis(), fx = o.solX, el = 0, t;
      var ee = isFinite(est.elevacion) && est.elevacion !== null ? +est.elevacion : null;
      if (m === 'dia' && !est.momentoFijo && S.sol) { var a = ahoraEnZona(o.zona), Hh = (a - (S.sol[0] + S.sol[1]) / 2) / 4; fx = 50 + clamp(Hh / 75, -1, 1) * 38; el = elevacionSol(est, m); }
      else if (ee != null) el = ee;
      fx = clamp(fx, 28, 72);   // 10b: el disco entero queda dentro de la pantalla (antes 12-88 %)
      t = clamp((90 - el) / 65, 0, 1);
      var bandaVis = Math.max(120, banda() - 24 - V.oy), yv = clamp(bandaVis * mixn(0.2, 0.32, t), 70 * V.vw / 390, Math.max(70, bandaVis - 70));
      var px = V.ox + fx / 100 * V.vw, py = V.oy + yv;
      return { x: px / V.W * 100, y: py / V.H * 100, el: el, px: { x: px, y: py, vw: V.vw, vh: V.vh, ox: V.ox, oy: V.oy } };
    }
    function mixn(a, b, t) { return a + (b - a) * t; }
    function suave(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }
    /* intensidad 0-1 del sol (criterio del 05): 'soleado' fuerza 1; si no, solo de día con condición 'despejado', 0 con más de 15 % de nube y suavizada de 25 a 45 grados de elevación */
    function intensidadSol(est, m, condPedida, cond) {
      if (m !== 'dia') return 0;   // el sol intenso es solo de día (también con 'soleado' forzado)
      if (condPedida === 'soleado') return 1;
      if (cond !== 'despejado') return 0;
      if (isFinite(est.nubes) && est.nubes !== null && est.nubes > 15) return 0;
      return +suave(o.solElevMin, o.solElevMax, elevacionSol(est, m)).toFixed(2);
    }

    /* ---------- rayos (r8) ----------
       Solo con condición 'tormenta' (weather_code 95, 96, 99) y clima vigente. No se vio el rayo de Apple: la forma sale de la descripción pública
       (arco que cae y se bifurca al azar) y la seguridad de WCAG 2.3.1. Nada corre entre rayos: un temporizador y, ~0,55 s por rayo, un bucle de dibujo. */
    function zig(a, b, arco, disp, niv, rn) {
      var pts = [a, b], i, n;
      for (n = 0; n < niv; n++) {
        var nuevo = [];
        for (i = 0; i < pts.length - 1; i++) {
          var p = pts[i], q = pts[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.sqrt(dx * dx + dy * dy) || 1, off = (rn() - 0.5) * 2 * disp;
          nuevo.push(p, [(p[0] + q[0]) / 2 - dy / L * off, (p[1] + q[1]) / 2 + dx / L * off]);
        }
        nuevo.push(pts[pts.length - 1]); pts = nuevo; disp *= 0.55;
      }
      if (arco) pts.forEach(function (p, j) { p[0] += Math.sin(Math.PI * j / (pts.length - 1)) * arco; });   // el arco: se comba hacia un lado y vuelve
      return pts;
    }
    function largos(pts) { var c = [0], i; for (i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; }
    function geometria(rn) {
      var W = S.w || 390, B = yLibre() + 24, x0 = W * (0.12 + rn() * 0.76), yF = B * (0.78 + rn() * 0.3), lean = (rn() - 0.5) * W * 0.22, arco = (rn() - 0.5) * W * 0.2;
      var main = zig([x0, -8], [x0 + lean, yF], arco, yF * 0.075, 5, rn), segs = [{ pts: main, w: 1, s0: 0, cum: largos(main) }];
      var nb = 2 + Math.floor(rn() * 3), i;
      for (i = 0; i < nb; i++) {
        var idx = Math.floor(main.length * (0.18 + rn() * 0.55)), p = main[idx], q = main[Math.min(main.length - 1, idx + 2)], r0 = main[Math.max(0, idx - 2)];
        var ang = Math.atan2(q[1] - r0[1], q[0] - r0[0]) + (rn() < 0.5 ? -1 : 1) * (0.4 + rn() * 0.5), L = yF * (0.14 + rn() * 0.3);
        var br = zig(p.slice(), [p[0] + Math.cos(ang) * L, p[1] + Math.sin(ang) * L], 0, L * 0.12, 4, rn);
        segs.push({ pts: br, w: 0.55, s0: idx / (main.length - 1), cum: largos(br) });
        if (rn() < 0.4) {   // una bifurcación de la bifurcación
          var j = Math.floor(br.length * (0.3 + rn() * 0.4)), pj = br[j], a2 = ang + (rn() < 0.5 ? -1 : 1) * (0.45 + rn() * 0.4), L2 = L * 0.5;
          var b2 = zig(pj.slice(), [pj[0] + Math.cos(a2) * L2, pj[1] + Math.sin(a2) * L2], 0, L2 * 0.12, 3, rn);
          segs.push({ pts: b2, w: 0.32, s0: Math.min(0.95, idx / (main.length - 1) + 0.06), cum: largos(b2) });
        }
      }
      return segs;
    }
    function trazo(ctx, sg, f) { // dibuja el segmento hasta la fracción f de su largo
      if (f <= 0) return;
      var pts = sg.pts, tot = sg.cum[sg.cum.length - 1] * Math.min(1, f), i;
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (i = 1; i < pts.length; i++) {
        if (sg.cum[i] <= tot) ctx.lineTo(pts[i][0], pts[i][1]);
        else { var t = (tot - sg.cum[i - 1]) / ((sg.cum[i] - sg.cum[i - 1]) || 1); ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t); break; }
      }
      ctx.stroke();
    }
    function pintarRayo(segs, t) { // t en ms desde que cae. Cae en 100 ms; después titila una vez (como un rayo real) y se apaga en ~0,5 s
      var c = rayoCv.getContext('2d'); c.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); c.clearRect(0, 0, S.w, rayoCv.height / S.dpr);
      var a = t < 170 ? 1 : t < 210 ? 0.45 : t < 260 ? 0.85 : Math.max(0, 0.85 * (1 - (t - 260) / 280)); if (a <= 0) return false;
      c.lineJoin = c.lineCap = 'round';
      [[5.5, 'rgba(196,214,255,' + (0.17 * a).toFixed(3) + ')'], [2.3, 'rgba(226,236,255,' + (0.55 * a).toFixed(3) + ')'], [1.1, 'rgba(255,255,255,' + (0.96 * a).toFixed(3) + ')']].forEach(function (p) {
        segs.forEach(function (sg) { c.lineWidth = p[0] * sg.w; c.strokeStyle = p[1]; trazo(c, sg, sg.s0 === 0 ? t / 100 : (t - 100 * sg.s0) / 80); });
      });
      return true;
    }
    function pintarRayoQuieto() { // Reducir movimiento: un rayo tenue fijo, sin destello. Se reconoce la tormenta sin que nada parpadee
      var c = rayoCv.getContext('2d'); c.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); c.clearRect(0, 0, S.w, rayoCv.height / S.dpr);
      if (!o.rayoQuieto || !S.tormenta || !S.w) return;
      var segs = geometria(prng(4242)); c.lineJoin = c.lineCap = 'round';
      [[3.4, 'rgba(196,214,255,.09)'], [1.2, 'rgba(238,244,255,.5)']].forEach(function (p) { segs.forEach(function (sg) { c.lineWidth = p[0] * sg.w; c.strokeStyle = p[1]; trazo(c, sg, 1); }); });
    }
    function limpiarRayo() { var c = rayoCv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, rayoCv.width, rayoCv.height); }

    /* WCAG 2.3.1: nunca más de 3 destellos en cualquier segundo. Cada rayo cuenta 2 (el golpe y el rebote). Si no cabe, se espera. */
    function destellosEn(t0) { var n = 0; S.rayo.ts.forEach(function (t) { if (t >= t0 && t < t0 + 1000) n++; }); return n; }
    function puedeDestellar(n, ahora) {
      S.rayo.ts = S.rayo.ts.filter(function (t) { return ahora - t < 1500; });
      var ok = true, cand = [ahora + 55, ahora + 215];
      S.rayo.ts.concat(cand.slice(0, n)).forEach(function (t0) { var c = 0; S.rayo.ts.concat(cand.slice(0, n)).forEach(function (t) { if (t >= t0 && t < t0 + 1150) c++; }); if (c > 3) ok = false; });   /* 09 r8: ventana de control 1150 ms (margen de 150 ms por el retraso de arranque de WAAPI y el muestreo: con 1000 ms exactos un sensor externo llegó a ver 4 en 1 s) */
      return ok;
    }
    function registrar(n, ahora) {
      [ahora + 55, ahora + 215].slice(0, n).forEach(function (t) { S.rayo.ts.push(t); });
      S.rayo.ts.forEach(function (t) { S.rayo.pico = Math.max(S.rayo.pico, destellosEn(t)); });
      S.rayo.total += n;
    }
    function disparar() { // devuelve true si disparó
      if (!S.tormenta || quieto() || !S.w) return false;
      var ahora = performance.now(), rn = Math.random, lampago = rn() < 0.25;   // 1 de cada 4 es un relámpago sin rayo visible (la nube se ilumina por dentro)
      if (!puedeDestellar(2, ahora)) return false;
      registrar(2, ahora);
      var X = lampago ? 15 + rn() * 70 : null, segs = null;
      if (!lampago) { segs = geometria(rn); X = Math.max(8, Math.min(92, segs[0].pts[segs[0].pts.length >> 1][0] / S.w * 100)); }
      var amp = clamp(S.rayoCfg.amp, 0.02, 0.22) * (lampago ? 0.7 : 1);
      destello.style.background = 'radial-gradient(ellipse 95% 140% at ' + X.toFixed(0) + '% 0%,rgba(214,226,255,1) 0%,rgba(206,218,250,.55) 55%,rgba(200,212,245,.3) 100%)';
      if (S.rayo.destello) S.rayo.destello.cancel();
      if (destello.animate) S.rayo.destello = destello.animate([{ opacity: 0, offset: 0, easing: 'ease-out' }, { opacity: amp, offset: 0.09, easing: 'ease-out' }, { opacity: amp * 0.3, offset: 0.24, easing: 'ease-out' }, { opacity: amp * 0.75, offset: 0.34, easing: 'ease-out' }, { opacity: 0, offset: 1 }], { duration: 640, easing: 'linear' });   /* 09 r8: el ease-out iba en el efecto entero y adelantaba los picos a ~+30 y ~+147 ms; el contador de 3/s los suponía en +55 y +215. Ahora el easing va por tramo y los picos caen en +58 y +218 ms, como los cuenta puedeDestellar */
      S.rayo.ultimo = { x: X, lampago: lampago, t: Date.now() };
      if (segs) {
        var t0 = performance.now(); cancelAnimationFrame(S.rayo.raf);
        (function paso(t) { var dt = t - t0; if (quieto() || !pintarRayo(segs, dt)) { limpiarRayo(); S.rayo.raf = 0; return; } S.rayo.raf = requestAnimationFrame(paso); })(t0);
      }
      return true;
    }
    function siguienteRayo(primero) {
      clearTimeout(S.rayo.timer); S.rayo.timer = 0;
      if (!S.tormenta || quieto()) return;
      var R = S.rayo, d;
      if (primero) d = o.rayoPrimero[0] + Math.random() * (o.rayoPrimero[1] - o.rayoPrimero[0]);
      else if (R.doble) { R.doble = false; d = 1100 + Math.random() * 400; }
      else { d = R.cfg()[0] + Math.random() * (R.cfg()[1] - R.cfg()[0]); R.doble = Math.random() < 0.3; }   // 3 de cada 10 caen dos seguidos (a 1,1 a 1,5 s)
      R.timer = setTimeout(function () { R.timer = 0; if (disparar()) siguienteRayo(false); else { R.doble = false; R.timer = setTimeout(function () { R.timer = 0; siguienteRayo(false); }, 1200); } }, d);
    }
    function detenerRayos() {
      clearTimeout(S.rayo.timer); S.rayo.timer = 0; cancelAnimationFrame(S.rayo.raf); S.rayo.raf = 0;
      if (S.rayo.destello) { S.rayo.destello.cancel(); S.rayo.destello = null; }
      limpiarRayo();
    }

    /* ---------- aplicar un estado ---------- */
    /* r10: tinte y luminancia que el motor expone por estado, para el cristal del 05 (tono del cielo) y para el contraste del 10.
       rgb = color medio del cielo (con la nube que queda) en la zona del panel (24 a 92 % del alto). luzMaxPanel/luzMinPanel = luminancia relativa más alta y más baja ESPERADAS ahí
       (cielo mezclado con luz o sombra de nube al opacidad que le deja el panel). Es una estimación analítica con tope: el contraste real lo mide el 10 sobre la pantalla en un ciclo de nubes. */
    function tinteDe(cz, nb, cond, solK, luzMax) {
      var st = cz.stops, f = function (y) { var t = y < 0.46 ? y / 0.46 : (y - 0.46) / 0.54, a = y < 0.46 ? st[0] : st[1], b = y < 0.46 ? st[1] : st[2]; return mix(a, b, clamp(t, 0, 1)); };
      var acc = [0, 0, 0], N = 12, i, mn = 9, mx = 0, ap = nb ? nb.alfaMax * o.panelK : 0;
      for (i = 0; i < N; i++) { var c = f(0.24 + 0.68 * i / (N - 1)); acc = [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]]; var l = lum(c); if (l < mn) mn = l; if (l > mx) mx = l; }
      var med = [acc[0] / N, acc[1] / N, acc[2] / N], nbMed = nb ? mix(nb.sombra, nb.luz, 0.55) : med;
      var rgbT = mix(med, nbMed, clamp(ap * (S.nbCob != null ? 0.4 + 0.6 * S.nbCob : 0.5), 0, 0.7));
      var lmx = nb ? mx * (1 - ap) + Math.max(nb.luzLum, mx) * ap : mx, lmn = nb ? mn * (1 - ap) + Math.min(nb.somLum, mn) * ap : mn;
      return { rgb: rgbT, lumMedia: lum(rgbT), luzMaxPanel: lmx, luzMinPanel: lmn, nb: nb || { luzLum: 0, somLum: 0, alfaMax: 0 } };
    }
    /* director/05 (r10): el motor MIDE el píxel más claro y más oscuro detrás del cuerpo del panel (desde la línea de estado hasta abajo) en un ciclo de nubes y se lo pasa
       al parámetro `vivo` de tinte-motor.js (ClimaTinte.zonas). El resultado se escribe en el <html> (--vid-rgb, --vid-alfa, --vid-alfa-n, --vid-alfa-cab, --vid-alfa-barra, data-tinta)
       y sale en el evento cf:vivo. Sin ClimaTinte o sin paleta del 05, solo se informa el píxel medido. */
    function medirVivo(cz, ov, cond, tormenta) {
      if (!NB || !S.h) return;
      var st = cz.stops, sky = function (f) { var t = f < 0.46 ? f / 0.46 : (f - 0.46) / 0.54, a = f < 0.46 ? st[0] : st[1], b = f < 0.46 ? st[1] : st[2]; return mix(a, b, clamp(t, 0, 1)); };
      var yE = (S.calma0 != null ? S.calma0 : banda() - 24) / S.h, r = NB.medir(sky, clamp(yE, 0.1, 0.9), 1, 12, 25);
      if (!r || !r.claro) return;
      var vivo = { claro: r.claro, oscuro: r.oscuro };
      if (tormenta && ov && ov.rayos && ov.rayos.activo) vivo.claro = mix(vivo.claro, [255, 255, 255], ov.rayos.destello);   // el destello del rayo suma al más claro
      S.vivo = vivo; var out = { vivo: vivo, yEstado: +yE.toFixed(3) };
      if (g.ClimaTinte && ov && ov.nube) {
        try {
          var z = g.ClimaTinte.zonas(ov, yE, vivo), rt = document.documentElement.style;
          rt.setProperty('--vid-rgb', z.cuerpo.rgb.join(', ')); rt.setProperty('--vid-alfa', z.cuerpo.alfa); rt.setProperty('--vid-alfa-n', z.cuerpo.alfa);
          rt.setProperty('--vid-alfa-cab', z.cab.alfa); rt.setProperty('--vid-alfa-barra', z.barra.alfa); document.documentElement.dataset.tinta = z.tinta; out.tinte = z;
        } catch (e) { /* sin tinte: el CSS por estado sigue mandando */ }
      }
      if (S.efectivo) S.efectivo.vivo = out;
      try { cont.dispatchEvent(new CustomEvent('cf:vivo', { detail: out })); } catch (e) { /* sin eventos */ }
    }
    function aplicar(est, caducado) {
      var m = MOMENTOS.indexOf(est.momento) >= 0 ? est.momento : 'dia';
      var condPedida = PERFIL[est.condicion] ? est.condicion : 'neutro', cond = condPedida === 'soleado' ? 'despejado' : condPedida, pf = PERFIL[cond];
      var cob = pf.c;
      if (isFinite(est.nubes) && est.nubes !== null && (cond === 'despejado' || cond === 'parcial' || cond === 'nublado' || cond === 'neutro')) cob = clamp(est.nubes / 100, 0, 1);
      else if (isFinite(est.nubes) && est.nubes !== null) cob = Math.max(pf.c, clamp(est.nubes / 100, 0, 1));
      var Iobj = 0, rg = pf.lluvia;
      if (rg[1] > 0) Iobj = isFinite(est.lluvia) && est.lluvia !== null ? clamp(0.18 + est.lluvia / 8, rg[0], rg[1]) : (rg[0] + rg[1]) / 2;
      var v = clamp((+est.viento || 0) / 35, 0, 1), dir = isFinite(est.dirViento) ? est.dirViento : 90;
      var conRealN = isFinite(est.nubes) && est.nubes !== null ? Math.round(est.nubes / 10) : '-';
      var solK = intensidadSol(est, m, condPedida, cond), tormenta = cond === 'tormenta' && !caducado && o.rayos !== false && est.rayos !== false;
      var clave = [m, cond, Math.round(cob * 10), Math.round(Iobj * 5), o.estados ? 'e' : '', Math.round(banda() / 24), Math.round(solK * 4), conRealN].join('|');

      S.viento = v; S.dir = dir; S.momento = m; S.lluviaCol = LLUVIA_C[m]; S.Iobj = Iobj;
      S.rate = 0.8 + 0.7 * v + (cond === 'tormenta' ? 0.1 : 0);   // 09 r7: a 35 km/h las nubes cruzan en 3,75 a 7,5 min; con viento bajo, 6 a 12 min
      S.nubes.forEach(function (n) { if (n.anim) n.anim.playbackRate = S.rate; });

      var ov = o.estados && (o.estados[m + '-' + (condPedida === 'soleado' ? 'soleado' : cond)] || ((cond === 'neutro' || condPedida === 'soleado') && o.estados[m + '-despejado'])) || null;
      if (ov && cond === 'neutro') ov = Object.assign({}, ov, { nubes: { n: 1, alfa: Math.min(ov.nubes.alfa, 0.08), color: ov.nubes.color }, nube: ov.nube && Object.assign({}, ov.nube, { alfa: Math.min(ov.nube.alfa, 0.15), cobertura: 12 }), estrellas: 0 });   // 09 r7: neutro = cielo de la hora, sin estrellas ni nubes marcadas
      var sf = o.estados && o.estados['dia-solfuerte'];   // r8: con sol intenso el cielo se satura y se oscurece lejos del sol (paleta del 05), en proporción a la intensidad
      if (ov && sf && solK > 0 && ov.cielo) ov = Object.assign({}, ov, { cielo: ov.cielo.map(function (c, i) { var x = mix(hex(c), hex(sf.cielo[i]), solK); return '#' + [0, 1, 2].map(function (j) { return ('0' + Math.round(x[j]).toString(16)).slice(-2); }).join(''); }), glow: ov.glow && Object.assign({}, ov.glow, { a: ov.glow.a * (1 - solK) }) });
      var cz = cieloDe(m, pf, pals[m], H, ov, !o.agua);
      ponerCielo(cz.css);

      MOMENTOS.forEach(function (x) {
        var gl = ov && ov.glow;
        astros[x].style.opacity = !o.agua ? 0 : x === m ? (gl ? 1 : ((1 - cob * 0.85) * (1 - pf.niebla * 0.5) * (Iobj > 0.5 ? 0.3 : 1))).toFixed(2) : 0;
        astros[x].style.background = 'radial-gradient(closest-side,' + rgb(hex(gl && x === m ? gl.col : pals[x].luz), gl && x === m ? gl.a : (x === 'noche' ? 0.2 : 0.5)) + ',' + rgb(hex(gl && x === m ? gl.col : pals[x].luz), 0) + ')';
      });
      var eo = m === 'noche' ? 1 - clamp(cob * 1.05, 0, 1) : m === 'amanecer' ? 0.3 * (1 - cob) : 0;
      if (Iobj > 0.5) eo *= 0.4;
      eo *= 1 - pf.niebla * 0.8;
      if (ov && ov.estrellas != null) eo = ov.estrellas;
      if (cond !== 'despejado' && cond !== 'parcial') eo = 0;   // 09 r7: estrellas solo en despejado y parcial
      estrellas.forEach(function (e) { e.style.opacity = eo.toFixed(2); });

      var nvc = ov && ov.niebla ? hex(ov.niebla.color) : NIEBLA_C[m], nva = ov && ov.niebla ? ov.niebla.alfa : pf.niebla;
      velo.style.opacity = (nva * 0.55).toFixed(2);
      velo.style.background = 'linear-gradient(180deg,' + rgb(nvc, 0) + ' 0%,' + rgb(nvc, 0.55) + ' ' + ((H - 0.12) * 100).toFixed(0) + '%,' + rgb(nvc, 0.7) + ' ' + (H * 100).toFixed(0) + '%,' + rgb(nvc, 0.25) + ' 100%)';

      // 09 r7: de noche, nublado o peor se distingue por una bruma clara arriba que baja de brillo con la intensidad (la lluvia lo dice con gotas)
      // H5 (QA): de más clara a más cerrada: nublado 40 %, llovizna 30 %, lluvia 18 % de bruma clara; tormenta, en cambio, un velo oscuro arriba (cielo cerrado), sin destellos
      var bc = cond === 'tormenta' ? '3,6,14' : '136,154,188';
      bruma.style.background = 'linear-gradient(180deg,rgba(' + bc + ',1) 0%,rgba(' + bc + ',.55) 26%,rgba(' + bc + ',0) 62%)';
      bruma.style.opacity = (m === 'noche' ? { nublado: 0.4, llovizna: 0.3, lluvia: 0.18, tormenta: 0.6 }[cond] || 0 : 0).toFixed(2);
      // agua: el viento sube cuántas rayas hay y cuánto respiran; con viento ~0 queda como espejo
      var luzAgua = mix(cz.stops[2], [255, 255, 255], m === 'noche' ? 0.25 : 0.5);
      raiz.style.setProperty('--cf-luz-agua', css(luzAgua));
      raiz.style.setProperty('--cf-brillo', (0.035 + 0.17 * v).toFixed(3));
      raiz.style.setProperty('--cf-ritmo', (1.25 - 0.5 * v).toFixed(2));
      var nr = Math.round(2 + v * (NR - 2));
      rayas.forEach(function (e, i) { e.classList.toggle('cf-on', i < nr); });

      // nubes: solo se rehacen si cambia algo que se vea
      if (clave !== S.clave) {
        S.clave = clave;
        var pal, dens, cobC = cob, conReal = isFinite(est.nubes) && est.nubes !== null && (cond === 'despejado' || cond === 'parcial' || cond === 'nublado');   // con cloud_cover real, la nube sigue al dato
        if (ov && ov.nube) {   // paleta r8 del 05: luz y sombra por estado; la cobertura sale del dato real o, si no hay, de la condición
          var nb8 = ov.nube, cobN = conReal ? cob : clamp((nb8.cobertura || 0) / 100, 0, 1), al = nb8.alfa;
          if (cond === 'despejado' && solK > 0) al = Math.min(al, 0.45 - 0.3 * solK);   // con sol fuerte casi no hay nube (como estadoSol del 05)
          pal = { col: mix(hex(nb8.luz), hex(nb8.sombra), 0.5), luz: hex(nb8.luz), som: hex(nb8.sombra) }; dens = al / 0.9; cobC = cobN;
          if (cond === 'despejado') dens *= 0.6;   // despejado: unas pocas nubes tenues, no bolas de algodón
        } else {   // sin paleta r8: criterio r7
          var col = mix(NUBE_BASE[m], NUBE_OSC[m], pf.osc), alfa = (m === 'noche' ? 0.2 : 0.62) * (0.4 + 0.6 * cob) * (cond === 'despejado' ? 0.55 : 1);
          if (pf.osc > 0.4) alfa = Math.max(alfa, m === 'noche' ? 0.5 : 0.42);
          if (ov && ov.nubes && ov.nubes.alfa > 0) { col = hex(ov.nubes.color); alfa = ov.nubes.alfa; if (ov.nubes.n != null && !conReal) cobC = (ov.nubes.n - 1) / 8; }
          pal = { col: col }; dens = alfa / 0.55;
        }
        if (NB) { S.nbPal = pal; S.nbDens = dens; S.nbCob = cobC; } else reconstruirNubes(pal, cobC, m, cond, dens);
      }
      if (NB) {   // r10: el motor de nubes recibe el estado cada vez (viento y luz cambian sin reconstruir nada; todo se funde en segundos)
        var pn = S.nbPal || {}, lzN = pn.luz || mix(pn.col || NUBE_BASE[m], CLARO[m], pf.osc > 0.5 ? 0.34 : 0.62 * (1 - pf.osc * 0.8)), smN = pn.som || mix(pn.col || NUBE_BASE[m], pf.osc > 0.5 && m !== 'noche' ? [18, 24, 36] : SOMBRA[m], pf.osc > 0.5 ? 0.85 : 0.7);
        var alN = clamp((S.nbDens || 1) * 0.9, 0.05, 1), cobN2 = S.nbCob != null ? S.nbCob : cob;
        if (solK > 0) { alN = Math.max(0.5, Math.min(alN, o.nubesSol)); cobN2 = Math.max(0.3, Math.min(cobN2, 0.36)); }   // QA10b: piso para que crucen 1-2 cirros finos   // sol intenso: pocas nubes finas, translúcidas
        var gs = solGeom(est, m), L = m === 'noche' ? { x: -0.4, y: -1 } : (cond === 'tormenta' || cond === 'lluvia') ? { x: 0.15, y: -1 } : { x: (gs.x - 50) / 50 * 0.6, y: -1 };
        NB.setEstado({ cobertura: cobN2, espesor: clamp(pf.osc * 1.2, 0, 1), alfa: alN, viento: v, dirViento: dir, luz: lzN, sombra: smN, sol: { x: gs.x / 100, y: gs.y / 100, k: solK }, luzDir: L });
        zonas();
      }

      // sol intenso (r8)
      var gsol = solGeom(est, m); S.gsol = gsol;
      pintarSol(gsol); pintarGlints(gsol, solK);
      sol.style.opacity = solK.toFixed(2); raiz.style.setProperty('--cf-sol', solK.toFixed(2));
      var luzMax = cz.luzMax; if (solK > 0) luzMax = Math.max(luzMax, lum(mix(hex(ov ? ov.cielo[0] : pals[m].cielo[0]), [255, 250, 236], 0.92 * solK)));
      S.solK = solK; S.ult = { condPedida: condPedida, cond: cond, cob: cob };

      // rayos (r8): solo con tormenta vigente (código 95/96/99, clima no caducado)
      var rp = ov && ov.rayos && ov.rayos.activo ? ov.rayos : null;   // paleta r8 del 05: amplitud del destello e intervalo; las opciones explícitas del montaje mandan
      S.rayoCfg = { amp: !fijoAmp && rp && rp.destello != null ? rp.destello : o.rayoAmp, entre: !fijoEntre && rp && rp.intervalo ? [rp.intervalo[0] * 1000, rp.intervalo[1] * 1000] : o.rayoEntre };
      var antes = S.tormenta; S.tormenta = tormenta;
      if (!tormenta) { detenerRayos(); }
      else if (!antes && !quieto()) { limpiarRayo(); siguienteRayo(true); }

      // lluvia
      if (Iobj > 0) {
        if (sinMov()) { S.I = Iobj; pintarEstatica(); }
        else arrancarLluvia();
      } else if (sinMov()) S.ctx.clearRect(0, 0, S.w, S.h);
      else if (!S.raf && S.n) arrancarLluvia();

      raiz.dataset.momento = m; raiz.dataset.condicion = cond; raiz.dataset.caducado = caducado ? '1' : '0';
      var tn = tinteDe(cz, NB && NB.tinte(), cond, solK, luzMax);
      raiz.style.setProperty('--cf-tinte-rgb', tn.rgb.map(Math.round).join(',')); raiz.style.setProperty('--cf-lum-max', tn.luzMaxPanel.toFixed(3)); raiz.style.setProperty('--cf-lum-min', tn.luzMinPanel.toFixed(3));
      S.efectivo = { momento: m, condicion: cond, cobertura: +cob.toFixed(2), lluvia: +Iobj.toFixed(2), viento: +v.toFixed(2), caducado: !!caducado,
        luzMax: +luzMax.toFixed(3), luzMin: +cz.luzMin.toFixed(3), cielo: cz.css, sol: solK, solIntenso: solK >= 0.5, rayos: tormenta,
        tinte: tn.rgb.map(Math.round), lumMedia: +tn.lumMedia.toFixed(3), luzMaxPanel: +tn.luzMaxPanel.toFixed(3), luzMinPanel: +tn.luzMinPanel.toFixed(3), solPos: S.gsol ? { x: +S.gsol.x.toFixed(1), y: +S.gsol.y.toFixed(1), elevacion: +(S.gsol.el || 0).toFixed(1) } : null,
        nubes: NB ? { motor: NB.modo, nivel: NB.metricas().nivel, luzLum: +tn.nb.luzLum.toFixed(3), somLum: +tn.nb.somLum.toFixed(3), alfaMax: +tn.nb.alfaMax.toFixed(2) } : null };
      try { cont.dispatchEvent(new CustomEvent('cf:estado', { detail: S.efectivo })); } catch (e) { /* sin eventos */ }
      aplicarMovimiento();
      if (NB && o.tinteVivo) { clearTimeout(S.tVivo); S.tVivo = setTimeout(function () { medirVivo(cz, ov, cond, tormenta); }, sinMov() ? 200 : 900); }
      if (S.primero) { S.primero = false; requestAnimationFrame(function () { requestAnimationFrame(function () { raiz.classList.remove('cf-sinfade'); }); }); }
    }

    /* ---------- API ---------- */
    function revisar() { // recalcula momento (si hay sol) y caducidad
      if (!S.pedido) return;
      var est = {}, kk; for (kk in S.pedido) est[kk] = S.pedido[kk];
      var cad = (Date.now() - (est.medidoEn || Date.now())) > o.caducaMin * 60000;
      if (S.sol && !S.pedido.momentoFijo) { var mm = momentoDe(ahoraEnZona(o.zona), S.sol[0], S.sol[1]); if (mm) est.momento = mm; }
      if (cad) { est.condicion = 'neutro'; est.lluvia = null; est.nubes = null; est.viento = Math.min(est.viento || 0, 8); }
      var prev = S.efectivo;
      var cambioSol = prev && S.ult && Math.abs(intensidadSol(est, est.momento || prev.momento, S.ult.condPedida, S.ult.cond) - prev.sol) >= 0.2;   // r8: el sol sube o baja con la hora
      if (!prev || prev.momento !== (est.momento || prev.momento) || prev.caducado !== cad || S.forzar || cambioSol) { S.forzar = false; aplicar(est, cad); }
      S.caducado = cad;
    }
    function setEstado(est) {
      est = est || {};
      var copia = {}; for (var kk in est) copia[kk] = est[kk];
      copia.medidoEn = est.medidoEn || Date.now();
      copia.momentoFijo = MOMENTOS.indexOf(est.momento) >= 0;
      if (!copia.momentoFijo) copia.momento = S.sol ? momentoDe(ahoraEnZona(o.zona), S.sol[0], S.sol[1]) : (est.esDia === false ? 'noche' : 'dia');
      S.pedido = copia; S.forzar = true; revisar(); programar();
    }
    function setSol(salida, puesta) { // 'HH:MM', 'AAAA-MM-DDTHH:MM' o minutos
      var a = typeof salida === 'number' ? salida : minutos(salida), b = typeof puesta === 'number' ? puesta : minutos(puesta);
      S.sol = (a != null && b != null) ? [a, b] : null; if (S.pedido && !S.pedido.momentoFijo) { S.forzar = true; revisar(); }
    }
    function programar() { clearInterval(S.tCaduca); S.tCaduca = setInterval(function () { if (!document.hidden) revisar(); }, 60000); }

    function onVisible() { S.oculto = document.hidden; aplicarMovimiento(); if (!S.oculto) revisar(); }
    document.addEventListener('visibilitychange', onVisible);
    var mq = g.matchMedia ? g.matchMedia('(prefers-reduced-motion: reduce)') : null;
    function onMq() { S.reducido = !!(mq && mq.matches); aplicarMovimiento(); if (S.efectivo) { S.forzar = true; revisar(); } }
    if (mq) { S.reducido = mq.matches; (mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener(onMq)); }
    S.ahorro = !!(navigator.connection && navigator.connection.saveData);
    var ro = g.ResizeObserver ? new ResizeObserver(function () { dimensionar(); }) : null; if (ro) ro.observe(cont);
    dimensionar(); modoClases();

    return {
      setEstado: setEstado, setSol: setSol,
      setLibre: function (px) { var antes = banda(); S.libre = +px > 0 ? +px : 0; if (Math.abs(banda() - antes) > 20 && S.efectivo) { S.sinFundirNubes = true; S.forzar = true; revisar(); dimensionar(); } zonas(); if (S.gsol && glintEls.length) pintarGlints(S.gsol, S.solK); if (sinMov() && S.Iobj > 0.01) pintarEstatica(); },
      /* r10: la app avisa dónde está el dato vital (próxima alta/baja): px desde el borde de arriba del contenedor. Ahí no se mueve nada (ni lluvia ni nube con contraste). Sin llamar: borde del panel + calmaPx. */
      setCalma: function (y0, y1) { S.calma0 = +y0 >= 0 ? +y0 : null; S.calma1 = +y1 >= 0 ? +y1 : null; zonas(); if (sinMov() && S.Iobj > 0.01) pintarEstatica(); },
      estado: function () { return { pedido: S.pedido, efectivo: S.efectivo, caducado: S.caducado, modo: sinMov() ? 'quieto' : (quieto() ? 'pausa' : 'vivo'), reducido: S.reducido, degradado: S.degradado }; },
      metricas: function () { return { fps: +S.fps.toFixed(1), msDibujo: +S.ms.toFixed(2), gotas: S.n, ondas: S.ondas.length, nubes: S.nubes.length, factor: +S.factor.toFixed(2), lluviaActiva: !!S.raf,
        rayos: S.rayo.total / 2, destellos: S.rayo.total, destellosMax1s: S.rayo.pico, rayoPendiente: !!S.rayo.timer, sol: S.solK, nubesMotor: NB ? NB.metricas() : null }; },
      nubes: function () { return NB; },
      /* pruebas: dispara un rayo ahora (respeta el tope de 3 destellos por segundo; devuelve false si no cabe o si no hay tormenta) */
      rayoYa: function () { return disparar(); },
      /* pruebas y capturas: deja UN rayo congelado en el instante t (ms desde que cae; 120 = recién caído, con el destello en su pico). Detiene los rayos automáticos hasta soltarRayo(). */
      congelarRayo: function (t, semilla) {
        detenerRayos(); S.rayo.ts = []; t = t == null ? 120 : t;
        var segs = geometria(prng(semilla || 4242)), X = Math.max(8, Math.min(92, segs[0].pts[segs[0].pts.length >> 1][0] / S.w * 100)), amp = clamp(S.rayoCfg.amp, 0.02, 0.22);
        destello.style.background = 'radial-gradient(ellipse 95% 140% at ' + X.toFixed(0) + '% 0%,rgba(214,226,255,1) 0%,rgba(206,218,250,.55) 55%,rgba(200,212,245,.3) 100%)';
        var f = t < 58 ? t / 58 : t < 154 ? Math.max(0.3, 1 - (t - 58) / 96 * 0.7) : t < 218 ? 0.3 + (t - 154) / 64 * 0.45 : Math.max(0, 0.75 * (1 - (t - 218) / 420));
        destello.style.opacity = (amp * f).toFixed(3); pintarRayo(segs, t);
      },
      soltarRayo: function () { destello.style.opacity = ''; limpiarRayo(); if (S.tormenta && !quieto()) siguienteRayo(true); },
      pausar: function () { S.pausado = true; aplicarMovimiento(); }, reanudar: function () { S.pausado = false; aplicarMovimiento(); },
      forzarEstatico: function (si) { o.estatico = !!si; S.degradado = false; aplicarMovimiento(); if (S.efectivo) { S.forzar = true; revisar(); } },
      raiz: raiz,
      destruir: function () {
        clearInterval(S.tCaduca); detenerLluvia(); detenerRayos(); if (S.respiro) S.respiro.cancel(); document.removeEventListener('visibilitychange', onVisible);
        if (mq) (mq.removeEventListener ? mq.removeEventListener('change', onMq) : mq.removeListener(onMq));
        if (ro) ro.disconnect(); S.nubes.forEach(function (n) { if (n.anim) n.anim.cancel(); }); if (NB) NB.destruir(); glintEls.forEach(function (x) { if (x.anim) x.anim.cancel(); });
        if (raiz.parentNode) raiz.parentNode.removeChild(raiz);
      }
    };
  }

  g.ClimaFondo = { DEF: DEF, montar: montar, momentoDe: momentoDe, minutos: minutos, ahoraEnZona: ahoraEnZona, codigoACondicion: codigoACondicion,
    desdeQuery: desdeQuery, MOMENTOS: MOMENTOS, CONDICIONES: CONDICIONES, PALETAS: PALETAS, PERFIL: PERFIL };
})(window);

/* Mareas de la Finca · lógica de pantalla, piel "Cristal sobre agua" (05 diseño, 09 prototipo; ronda 5, 14 oct 2026)
   Parte de app.js de la ronda 4: MISMOS datos, textos (contenido.md del 04), estados y curva con cursor; cambia la piel.
   Datos: window.D (data.js) + DatosVivos.cargar(D) (datos-vivos.js con la guarda >= 24 valores de la ronda 4). Todos los números salen de R.D.
   Hora de Honduras = UTC-6 fija. Sin metros, sin coordenadas, sin "oficial".
   Parámetros de PRUEBA para el QA (RETIRAR al integrar, ver INTEGRACION.md; cada bloque va entre las marcas PRUEBA y FIN PRUEBA):
   ?tinta=claro|oscuro  ?letra=100|130|150  ?sinblur=1 (head de index.html)  ?clima=momento-condicion  ?estilo=a|b  ?selector=1 (clima-prueba.js, ronda 7)   ?estado=vivo|reciente|guardado|cargando|mala  ?ahora=AAAA-MM-DDTHH:MM  ?portada=1 (head de index.html, portada del camarón)
   Rutas: #hoy | #curva | #dias */
(function () {
'use strict';

const NB = '\u00a0';
const T = {
  nombre: 'Finca Suárez', P: 'Marea alta', B: 'Marea baja',
  sube: 'La marea está subiendo', baja: 'La marea está bajando', manana: 'mañana',
  apertura: 'El agua de hoy.', curvaTit: 'Cómo va el día', diasTit: 'Próximos días',
  tabs: { hoy: 'Hoy', curva: 'Curva', dias: 'Días' }, tabsAria: { hoy: 'Ir a Hoy', curva: 'Ir a la curva del día', dias: 'Ir a los próximos días' },
  ahora: 'Ahora', mas: 'Hora siguiente', menos: 'Hora anterior', masAria: 'Mover una hora hacia adelante', menosAria: 'Mover una hora hacia atrás',
  curvaAria: 'Curva de la marea durante el día. Flechas para mover la hora.', verMas: 'Ver más días', hoyDia: 'Hoy', mananaDia: 'Mañana',
  sinMasT: 'Sin más horarios', sinMasX: f => 'Los horarios terminan el ' + f + '.', sinMasHoy: 'Los horarios terminan hoy.',
  despuesT: 'Ya no hay horarios', despuesX: f => 'Los horarios llegaron hasta el ' + f + '. Hay que actualizar los horarios.',
  antesT: 'Todavía no hay horarios para esta fecha', antesX: f => 'Los horarios empiezan el ' + f + '. Conviene revisar la fecha del teléfono.',
  sinDatosT: 'No se pudieron mostrar los horarios', sinDatosX: 'Cerrar la app y abrirla otra vez. Si sigue igual, pedir que la actualicen.',
  aviso: 'Pronóstico de mareas para la costa de San Lorenzo, Valle.', avisoCorto: 'Pronóstico para la costa de San Lorenzo.', acerca: 'Acerca de los datos',
  fuente: 'Las horas son un pronóstico, no una medición. Vienen de un modelo del mar (Open-Meteo) para la costa de San Lorenzo, Valle, en el Golfo de Fonseca, y se ajustaron para acercarlas a la hora de San Lorenzo. Pueden variar unos minutos; ese ajuste es provisional.',
  vigencia: f => 'Horarios hasta el ' + f + '. Hay que actualizarlos.',
  nueva: 'Hay una versión nueva. Cerrar la app y abrirla otra vez.',
  fresco: {
    cargando: 'Buscando horarios nuevos…', guardado: 'Sin señal. Usando los horarios guardados.', malaRespuesta: 'No se pudieron bajar horarios nuevos. Usando los guardados.',
    ahoraMismo: 'Actualizado ahora', vivo: d => 'Actualizado hace ' + d, reciente: d => 'Sin señal. Horarios de hace ' + d + '.'
  }
};
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const AVISO_DIAS = 14, DIAS_PASO = 7, DIA = 864e5, MIN = 6e4, HORA = 36e5;

/* ---------- íconos de línea (SVG a mano, sin librería) ---------- */
const P = {
  up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>', down: '<path d="M12 5v14M5.5 12.5 12 19l6.5-6.5"/>',
  izq: '<path d="M15 5l-7 7 7 7"/>', der: '<path d="M9 5l7 7-7 7"/>',
  nosenal: '<path d="M3 3l18 18M8.5 16.4a5 5 0 0 1 4.9-1.2M5 12.9a9 9 0 0 1 3.2-2M10.6 6.2A13.5 13.5 0 0 1 21 10M12 20h.01"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', cargando: '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"/>',
  vivo: '<circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/>',
  fin: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M9 15l6 0"/>',
  t_hoy: '<path d="M3 12c2.2-3.2 4.3-3.2 6.5 0s4.3 3.2 6.5 0 3.3-2.6 5-1.2"/><path d="M3 17c2.2-3.2 4.3-3.2 6.5 0s4.3 3.2 6.5 0 3.3-2.6 5-1.2" opacity=".55"/><path d="M12 3.5v2.2"/>',
  t_curva: '<path d="M3 15c2-1 3-7 6-7s3.5 9 7 9 3-5 5-6"/><path d="M3 20h18" opacity=".5"/>',
  t_dias: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
};
const ic = (n, c) => '<svg class="ic ' + (c || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + '</svg>';
const flecha = (k, c) => '<span class="flecha ' + (c || '') + '" data-k="' + k + '">' + ic(k === 'P' ? 'up' : 'down') + '</span>';

/* ---------- reloj (hora de Honduras como "ms en UTC") ---------- */
/* PRUEBA 1/3 (retirar al integrar): ?ahora=AAAA-MM-DDTHH:MM simula el reloj (hora de Honduras); sigue corriendo; no se guarda.
   Nada de esto se muestra en pantalla. Al retirarlo, dejar: const ahoraMs = () => Date.now() - 6 * HORA; */
const Q = new URLSearchParams(location.search);
let desfase = 0;
const qa = Q.get('ahora');
if (qa && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(qa)) { const t = Date.parse(qa + ':00Z'); if (!isNaN(t)) desfase = t - Math.floor((Date.now() - 6 * HORA) / MIN) * MIN; }
const ahoraMs = () => Date.now() - 6 * HORA + desfase;
/* FIN PRUEBA */

const hora12 = ms => { const d = new Date(ms), h = d.getUTCHours(); return { n: ((h + 11) % 12 + 1) + ':' + String(d.getUTCMinutes()).padStart(2, '0'), ap: h < 12 ? 'a.' + NB + 'm.' : 'p.' + NB + 'm.' }; };
const horaHtml = ms => { const o = hora12(ms); return o.n + '<small>' + NB + o.ap + '</small>'; };
const horaTxt = ms => { const o = hora12(ms); return o.n + NB + o.ap; };
const fechaTxt = ms => { const d = new Date(ms); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()]; };
const diaCorto = ms => { const d = new Date(ms); return d.getUTCDate() + NB + 'de' + NB + MESES[d.getUTCMonth()]; };
const diaIni = ms => Math.floor(ms / DIA) * DIA;
const durTxt = ms => { const min = Math.round(ms / MIN), h = Math.floor(min / 60), m = min % 60; return h ? h + NB + 'h' + (m ? ' ' + m + NB + 'min' : '') : m + NB + 'min'; };
const cuentaTxt = ms => Math.round(ms / MIN) < 1 ? 'ahora mismo' : 'en' + NB + durTxt(ms);
const mayus = x => x.charAt(0).toUpperCase() + x.slice(1);

/* ---------- datos: de R.D a un modelo listo para pintar ---------- */
const BASE = window.D;                 // tabla guardada (data.js): es lo que DatosVivos mezcla
let R = { estado: 'cargando', actualizado: null, D: (typeof DatosVivos !== 'undefined' && DatosVivos.ajustar) ? DatosVivos.ajustar(BASE) : BASE };   // primer pintado ya con el ajuste a la hora de San Lorenzo
let M = null;                          // modelo derivado de R.D (o null si los datos no sirven)
let AH = ahoraMs();

function modelo(D) {
  if (!D || !Array.isArray(D.y) || !Array.isArray(D.ev) || !D.y.length || !D.ev.length) throw new Error('sin datos');
  const s0 = Date.parse(D.start + 'T00:00:00Z'); if (isNaN(s0)) throw new Error('sin inicio');
  const y = D.y.slice(); let ult = y.find(v => v != null); if (ult == null) throw new Error('sin niveles');
  for (let i = 0; i < y.length; i++) { if (y[i] == null) y[i] = ult; else ult = y[i]; }
  const ev = D.ev.map(e => ({ t: Date.parse(e[0].slice(0, 16) + ':00Z'), k: e[1], m: e[2] })).filter(e => !isNaN(e.t)).sort((a, b) => a.t - b.t);
  if (!ev.length) throw new Error('sin eventos');
  let lo = Infinity, hi = -Infinity; for (const v of y) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const pad = (hi - lo) * 0.08 || 0.1;
  return { s0, y, ev, lo: lo - pad, hi: hi + pad, ultimoDia: diaIni(ev[ev.length - 1].t) };
}
/* nivel en un instante (interpolado entre puntos de 30 min). Solo se usa para DIBUJAR; nunca se muestra como cifra. */
function nivel(t) {
  const y = M.y, x = (t - M.s0) / (30 * MIN); let i = Math.floor(x);
  if (i < 0) return y[0]; if (i >= y.length - 1) return y[y.length - 1];
  return y[i] + (y[i + 1] - y[i]) * (x - i);
}
const frac = t => Math.min(1, Math.max(0, (nivel(t) - M.lo) / (M.hi - M.lo)));
function ponerDatos(r) { R = r; try { M = modelo(r.D); } catch (e) { M = null; } }
ponerDatos(R);
/* Ronda 9: la portada (index.html) pregunta aquí el nivel de AHORA, 0..1, el mismo que dibuja el cursor de la Curva. Es una posición dentro del rango del modelo, no una cifra. null = sin dato. */
window.__nivelAhora = () => { try { return M && !estadoFechas() ? frac(AH) : null; } catch (e) { return null; } };   // tabla vencida o fuera de rango: sin nivel, nunca uno viejo

/* ---------- frescura (renglón fijo en el mismo sitio, sin rojo ni "error") ---------- */
function frescoInfo() {
  const e = R.estado;
  if (e === 'vivo' && R.actualizado) {
    const min = Math.max(0, Math.floor((Date.now() - R.actualizado.getTime()) / MIN)), h = Math.floor(min / 60), m = min % 60;
    return { i: 'vivo', c: '', t: min < 1 ? T.fresco.ahoraMismo : T.fresco.vivo(h ? h + NB + 'h' + (m ? ' ' + m + NB + 'min' : '') : min + NB + 'min') };
  }
  if (e === 'reciente' && R.actualizado) {
    const min = Math.max(0, Math.floor((Date.now() - R.actualizado.getTime()) / MIN)), h = Math.floor(min / 60);
    return { i: 'reloj', c: '', t: T.fresco.reciente(h ? h + NB + 'h' : min + NB + 'min') };
  }
  if (e === 'cargando') return { i: 'cargando', c: 'gira', t: T.fresco.cargando };
  if (e === 'guardado' && R.error && /^HTTP|datos incompletos|JSON|Unexpected|token/i.test(R.error) && navigator.onLine !== false) return { i: 'reloj', c: '', t: T.fresco.malaRespuesta };   // hay red pero la respuesta vino rota
  return { i: 'nosenal', c: '', t: T.fresco.guardado };
}
const frescoIc = f => f.i === 'vivo' ? '<span class="punto" aria-hidden="true"></span>' : ic(f.i, f.c);   // punto que late: SOLO en estado vivo (indicación del 14)
const frescoHtml = () => { const f = frescoInfo(); return '<p class="fresco">' + frescoIc(f) + '<span>' + f.t + '</span></p>'; };

/* ---------- armazón ---------- */
/* Ronda 9: la entrada del primer uso del día ya no es la del panel (MareaCristal.entrada, tarjeta .apertura) sino la portada del camarón, que vive EN LÍNEA en index.html (FS) y vuela hasta la placa del encabezado.
   ENTRA queda en false para no tener dos entradas encimadas; la tarjeta .apertura se quita del DOM más abajo. */
const ENTRA = false;
const app = document.getElementById('app');
let acercaAbierto = false, vista = 'hoy', nVisibles = DIAS_PASO, hayNueva = false, curvaH = null, tecla = '';
/* Ronda 7: el fondo ya no es una foto. Línea de honestidad y atribución del clima (el enlace es solo un enlace: no es una petición de la app). */
T.clima = 'El fondo refleja el clima de ahora en la costa de San Lorenzo, Valle. Es aproximado y no es una alerta oficial.';
T.creditoMin = 'Datos: <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a>';
T.climaCredito = 'Datos del clima: <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a> (<a href="https://open-meteo.com/en/license" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>), adaptados para mostrar el fondo.';
const MARCA = '<svg viewBox="1 1.5 35.5 25.5" focusable="false"><use href="#fs-p" fill="#F2E9D0"/></svg>';
app.innerHTML = '<div class="fondo" id="fondo"></div>' +
  '<header class="cab vidrio" id="cab"><span class="cab__marca" aria-hidden="true">' + MARCA + '</span><h1>' + T.nombre + '</h1></header>' +
  '<div class="clima-ahora" id="climaAhora" hidden><span class="cl-temp" id="clTemp"></span><span class="cl-txt" id="clTxt"></span></div>' +
  '<div class="pila" id="pila"><p class="estado" id="estado" hidden></p><main class="panel vidrio" id="panel">' +
  '<div class="cont" id="hoja" tabindex="-1"><div class="vista" id="vista"></div></div><div class="pie" id="pie"></div></main>' +
  '<nav class="barra vidrio" id="barra" aria-label="Pantallas">' + ['hoy', 'curva', 'dias'].map(k => '<a href="#' + k + '" data-k="' + k + '" aria-label="' + T.tabsAria[k] + '">' + ic('t_' + k) + '<span>' + T.tabs[k] + '</span></a>').join('') + '</nav></div>';
const pieEl = document.getElementById('pie'), hoja = document.getElementById('hoja'), vistaEl = document.getElementById('vista'), panel = document.getElementById('panel'), pila = document.getElementById('pila'), barra = document.getElementById('barra'), estadoEl = document.getElementById('estado');

/* ---------- FONDO VIVO (ronda 7) ----------
   clima-vivo.js trae el clima (Open-Meteo, copia guardada, caduca a los 150 min) y clima-fondo.js pinta el cielo. Si algo falla, queda el degradado neutro de tokens.css: nunca en blanco.
   El motor necesita saber cuánto cielo queda libre sobre el panel (ahí se ve la lluvia): se mide con el panel. */
const fondoEl = document.getElementById('fondo');
let CV = null;
/* Ivan (19 oct): "que diga si esta nublado, soleado, lloviendo... como una app normal de clima, e incluso la temperatura". Sale de clima-vivo.js (Open-Meteo, copia que caduca a los 150 min); sin dato vigente, no se muestra nada. */
function pintarClima(d) {
  const box = document.getElementById('climaAhora'); if (!box) return;
  if (!d || !d.texto) { box.hidden = true; return; }
  document.getElementById('clTemp').textContent = d.temp == null ? '' : Math.round(d.temp) + '°';
  document.getElementById('clTxt').textContent = d.texto;
  box.setAttribute('aria-label', 'Clima ahora: ' + d.texto + (d.temp == null ? '' : ', ' + Math.round(d.temp) + ' grados'));
  box.hidden = false;
}

/* Ronda 10: la entrada del camarón (r9) manda: el cielo se queda en su primer cuadro hasta que ella termina (completa 2,4 s, corta 0,6 s, desde que abrió la página). El motor lo recibe como nubesRetardo. */
if (window.ClimaFondo && ClimaFondo.DEF) {
  const entra = window.FS ? (FS.modo === 'completa' ? 2400 : FS.modo === 'corta' ? 600 : 0) : 0;
  ClimaFondo.DEF.nubesRetardo = Math.max(0, Math.round(entra - performance.now()));
}
if (window.ClimaVivo && window.ClimaFondo) { try { CV = ClimaVivo.iniciar({ contenedor: fondoEl, paletas: window.ClimaPaletas, alClima: pintarClima }); } catch (e) { CV = null; } }
/* El motor necesita dos medidas del layout real (px desde el borde de arriba del fondo, que sobrepasa la pantalla):
   libre = hasta dónde llega el cielo limpio (donde empieza la línea de estado en Hoy, o el panel en Curva y Días): ahí viven lluvia, sol y rayo.
   setCalma(y0, y1) = el rectángulo del dato vital (línea de estado + tarjeta + barra): ahí el motor no mueve nada con contraste, y mide el píxel más claro y el más oscuro para calcular el velo. */
let ultMedida = '';
const libre = () => {
  if (!CV) return;
  const f = fondoEl.getBoundingClientRect(), hoy = vista === 'hoy' && !estadoEl.hidden;
  const y0 = (hoy ? estadoEl : panel).getBoundingClientRect().top - f.top, y1 = pila.getBoundingClientRect().bottom - f.top;
  const k = Math.round(y0) + '|' + Math.round(y1) + '|' + Math.round(f.height);
  if (k === ultMedida) return; ultMedida = k;
  CV.motor.setLibre(y0); CV.motor.setCalma(y0, y1);
};
libre(); setTimeout(libre, 1800);   // 1,8 s: la placa del encabezado y el panel ya están en su sitio
if (window.ResizeObserver) { const rl = new ResizeObserver(libre); rl.observe(panel); rl.observe(estadoEl); rl.observe(app); }
/* el motor avisa si el teléfono no sostiene los cuadros (cf:nivel; también queda data-nivel en .cf): el cristal suelta el desenfoque (app.css) */
fondoEl.addEventListener('cf:nivel', e => { app.dataset.nivel = e.detail.nivel; });
const _nv = fondoEl.querySelector('.cf'); if (_nv && _nv.dataset.nivel) app.dataset.nivel = _nv.dataset.nivel;

/* ---------- CRISTAL (ronda 10) ----------
   Ronda 10: ya no hay CristalLiquido (refracción SVG de la r6) ni copia horneada del fondo: el cristal es backdrop-filter simple, definido en app.css. cristal-liquido.* sigue en la carpeta pero no se carga. */
/* alto de la píldora: lo usan el tope del panel y la copia horneada del fondo (CSS var --barra-h) */
const mideBarra = () => pila.style.setProperty('--barra-h', barra.offsetHeight + 'px');
mideBarra(); if (window.ResizeObserver) new ResizeObserver(mideBarra).observe(barra);

function estadoFechas() {                       // fuera de rango y sin datos
  if (!M) return { t: T.sinDatosT, x: T.sinDatosX };
  if (AH < M.s0) return { t: T.antesT, x: T.antesX(diaCorto(M.s0)) };
  if (diaIni(AH) > M.ultimoDia) return { t: T.despuesT, x: T.despuesX(diaCorto(M.ultimoDia)) };
  return null;
}
const cajaFin = (t, x, h) => '<div class="finbox">' + ic('fin') + '<div><' + (h || 'h2') + '>' + t + '</' + (h || 'h2') + '><p>' + x + '</p></div></div>';

/* ---------- vistas ---------- */
function vigenciaHtml() {
  if (!M) return '';
  const quedan = Math.round((M.ultimoDia - diaIni(AH)) / DIA);
  return quedan <= AVISO_DIAS ? '<p class="vigencia">' + ic('fin') + '<span>' + T.vigencia(diaCorto(M.ultimoDia)) + '</span></p>' : '';
}
let estadoHtml = '';   // ronda 10: la línea de estado ya no va dentro de la tarjeta; flota sobre el cielo (#estado en .pila)
function vistaHoy() {
  estadoHtml = '';
  const raro = estadoFechas(); if (raro) return cajaFin(raro.t, raro.x) + frescoHtml();
  const sig = M.ev.find(e => e.t > AH);
  if (!sig) return cajaFin(T.sinMasT, T.sinMasHoy) + frescoHtml() + '<p class="aviso">' + T.aviso + '</p>';
  const otro = M.ev.find(e => e.t > AH && e.k !== sig.k), hoyI = diaIni(AH);
  const dia = e => (diaIni(e.t) > hoyI ? ' · ' + T.manana : '');
  const sube = sig.k === 'P';
  estadoHtml = flecha(sig.k, 'circ') + '<span>' + (sube ? T.sube : T.baja) + '</span>';
  /* Tarjeta (05): la próxima marea grande con su cuenta al lado, la siguiente más chica; después el pie (fecha y hora, frescura, aviso, Acerca de). Mismos textos que r9; la fecha pasó del encabezado al pie. */
  return '<div class="ev p hero" role="group" aria-label="Próxima ' + T[sig.k] + ', ' + horaTxt(sig.t) + ', ' + cuentaTxt(sig.t - AH) + '"><div class="fila"><p class="rot">' + T[sig.k] + dia(sig) + '</p><p class="cuenta">' + cuentaTxt(sig.t - AH) + '</p></div><p class="gran">' + horaHtml(sig.t) + '</p></div>' +
    (otro ? '<div class="ev s seg" role="group" aria-label="Siguiente ' + T[otro.k] + ', ' + horaTxt(otro.t) + '"><div class="fila"><p class="rot">' + T[otro.k] + dia(otro) + '</p></div><p class="med">' + horaHtml(otro.t) + '</p></div>' : '') +
    '<div class="pie-hoy"><p class="fecha" id="fecha"></p>' + frescoHtml() + '<p class="aviso">' + T.aviso + '</p>' + vigenciaHtml() +
    (hayNueva ? '<p class="nueva">' + T.nueva + '</p>' : '') + '</div>';
}
function listaDia(ini, sigT) {
  return M.ev.filter(e => e.t >= ini && e.t < ini + DIA).map(e =>
    '<li class="fila' + (e.t <= AH ? ' pasada' : '') + (e.t === sigT ? ' sig' : '') + '">' + flecha(e.k) + '<span class="f-txt"><span class="f-rot">' + T[e.k] + '</span><span class="f-hora">' + horaHtml(e.t) + '</span></span></li>').join('');
}
function vistaDias() {
  const raro = estadoFechas(), tit = '<h2 class="tit">' + T.diasTit + '</h2>';
  if (raro) return tit + cajaFin(raro.t, raro.x);
  const sig = M.ev.find(e => e.t > AH), sigT = sig && sig.t, h0 = diaIni(AH), total = Math.round((M.ultimoDia - h0) / DIA) + 1, n = Math.min(nVisibles, total);
  let html = tit;
  for (let i = 0; i < n; i++) {
    const ini = h0 + i * DIA, d = new Date(ini), rot = i === 0 ? T.hoyDia : i === 1 ? T.mananaDia : mayus(DIAS[d.getUTCDay()]);
    html += '<section class="dia"><h2>' + rot + '<span class="d-f"> ' + (i < 2 ? DIAS[d.getUTCDay()] + ' ' : '') + diaCorto(ini) + '</span></h2><ul class="lista">' + listaDia(ini, sigT) + '</ul></section>';
  }
  html += n < total ? '<button type="button" class="mas" id="mas" aria-label="' + T.verMas + ', hasta el ' + diaCorto(M.ultimoDia) + '">' + T.verMas + '</button>' : cajaFin(T.sinMasT, T.sinMasX(diaCorto(M.ultimoDia)));
  return html + vigenciaHtml() + '<p class="credito-min">' + T.creditoMin + '</p>';
}
function vistaCurva() {
  const raro = estadoFechas(), tit = '<h2 class="tit">' + T.curvaTit + '</h2>';
  if (raro) return tit + cajaFin(raro.t, raro.x);
  return tit + '<div class="lectura" id="lectura" aria-live="polite" aria-atomic="true"></div><div class="graf" id="graf"></div><div class="controles"><button type="button" id="menos" aria-label="' + T.menosAria + '">' + ic('izq') + T.menos + '</button><button type="button" id="mas1" aria-label="' + T.masAria + '">' + T.mas + ic('der') + '</button></div>';
}

/* ---------- curva del día (cursor arrastrable, botones y teclado) ---------- */
function curva(host, lectura) {
  const dI = diaIni(AH), W = host.clientWidth || 340, rp = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  /* alto: el que quepa entre el título y los botones SIN deslizar (ejes y botones siempre a la vista); no baja de 250 px (si no cabe, el panel se desliza).
     Los rótulos de la curva miden 16 a 22 px aunque la letra sea 150 %, así que el margen de arriba y abajo no crece con la letra (rq). */
  const rq = Math.min(rp, 18), ctrl = document.querySelector('.controles'), hr = hoja.getBoundingClientRect();
  const tabsH = barra.offsetHeight + 8, panelMax = app.clientHeight - 12 - (parseFloat(getComputedStyle(app).getPropertyValue('--banda')) || 140);   // 24 = margen de 12 px arriba y abajo (--margen); la píldora (+ 8 px de hueco) ya no está dentro del panel pero le quita sitio
  const room = panelMax - tabsH - pieEl.offsetHeight - (host.getBoundingClientRect().top - hr.top + hoja.scrollTop) - (ctrl ? ctrl.offsetHeight + 8 : 0) - rp * 1.25 - 8;
  const H = Math.round(Math.max(rp >= 22 ? 205 : 250, Math.min(Math.max(260, innerHeight * 0.38 + 36), room))),
    padX = 12, top = rq * 4.6, bot = rq * 4.7;   // abajo caben el rótulo de 2 líneas del valle y el eje
  const X = t => padX + (t - dI) / DIA * (W - 2 * padX), Y = t => top + (1 - frac(t)) * (H - top - bot);
  let ln = ''; for (let t = dI; t <= dI + DIA; t += 15 * MIN) ln += (ln ? 'L' : 'M') + X(t).toFixed(1) + ' ' + Y(t).toFixed(1);
  const area = ln + 'L' + X(dI + DIA).toFixed(1) + ' ' + (H - bot + 6) + 'L' + X(dI).toFixed(1) + ' ' + (H - bot + 6) + 'Z';
  const dEv = M.ev.filter(e => e.t >= dI && e.t < dI + DIA), fh = Math.max(18, Math.min(rp * 1.15, 22)), fa = Math.max(16, Math.min(rp, 18)), fw = Math.max(16, Math.min(rp, 18));   // todo texto de la curva mide 16 px o más
  let marc = '', resumen = '', hueco = '';   // hueco: rectángulos de los rótulos; las punteadas se cortan detrás de ellos
  /* rótulos: centrados en su punto, dentro de la pantalla; si dos del mismo lado (dos valles o dos cimas) se tocan, se separan */
  const Lb = dEv.map(e => { const o = hora12(e.t), w = Math.max((o.n.length + 5) * fh * 0.52, 5.6 * fw), x = X(e.t); return { e, o, w, x, y: Y(e.t), cx: Math.min(W - 4 - w / 2, Math.max(4 + w / 2, x)) }; });
  ['P', 'B'].forEach(k => { const g = Lb.filter(l => l.e.k === k); for (let i = 1; i < g.length; i++) { const d = g[i].w / 2 + g[i - 1].w / 2 + 8 - (g[i].cx - g[i - 1].cx); if (d > 0) { g[i - 1].cx -= d / 2; g[i].cx += d / 2; } } });
  Lb.forEach(l => {
    const { e, o, w, x, y, cx } = l, arriba = e.k === 'P', yh = arriba ? y - fa - 18 - fw - 4 : y + fh + 14;
    hueco += '<rect x="' + (cx - w / 2 - 4).toFixed(1) + '" y="' + (yh - fh - 2).toFixed(1) + '" width="' + (w + 8).toFixed(1) + '" height="' + (fh + fw + 10) + '" fill="#000"/>';
    marc += '<circle class="c-ev" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (rp * 0.3) + '"/><text class="c-hora" x="' + cx.toFixed(1) + '" y="' + yh.toFixed(1) + '" text-anchor="middle" style="font-size:' + fh + 'px">' + o.n + '<tspan class="ap" dx="3" style="font-size:' + fw + 'px">' + o.ap + '</tspan><tspan class="c-pal" x="' + cx.toFixed(1) + '" dy="' + (fw + 4).toFixed(1) + '" style="font-size:' + fw + 'px">' + T[e.k] + '</tspan></text>';
    resumen += ' ' + T[e.k] + ' ' + horaTxt(e.t) + ';';
  });
  let ticks = '', tkTxt = ''; [6, 12, 18].forEach(h => { const x = X(dI + h * HORA), o = hora12(dI + h * HORA); ticks += '<line class="c-tk" x1="' + x + '" x2="' + x + '" y1="' + (top - 6) + '" y2="' + (H - rq * 1.5) + '"/>'; tkTxt += '<text class="c-tick" x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" style="font-size:' + Math.max(16, Math.min(rp, 18)) + 'px">' + o.n.split(':')[0] + NB + o.ap + '</text>'; });
  const nx = X(AH), ny = Y(AH);
  host.innerHTML = '<svg class="curva" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="slider" tabindex="0" aria-label="' + T.curvaAria + resumen + '" aria-valuemin="0" aria-valuemax="1440">' +
    '<defs><mask id="m-lbl" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fff"/>' + hueco + '</mask><linearGradient id="g-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--sube);stop-opacity:.26"/><stop offset="1" style="stop-color:var(--sube);stop-opacity:0"/></linearGradient></defs>' +
    '<path class="c-area" d="' + area + '"/><g mask="url(#m-lbl)">' + ticks + '<line class="c-now-l" x1="' + nx + '" x2="' + nx + '" y1="' + (top - 6) + '" y2="' + (H - bot + 6) + '"/></g>' + tkTxt + '<path class="c-line" d="' + ln + '"/>' + marc +
    '<g class="c-cur" visibility="hidden"><line class="c-cur-l" y1="' + (top - 6) + '" y2="' + (H - bot + 6) + '"/><circle class="c-cur-p" r="' + (rp * 0.55) + '"/></g>' +
    '<circle class="c-now" cx="' + nx + '" cy="' + ny + '" r="' + (rp * 0.42) + '"/></svg><span class="mv-halo" style="left:' + nx.toFixed(1) + 'px;top:' + ny.toFixed(1) + 'px"></span>';
  const svg = host.firstChild, cur = svg.querySelector('.c-cur'), cl = cur.querySelector('.c-cur-l'), cp = cur.querySelector('.c-cur-p');
  const nl = svg.querySelector('.c-now-l'), nh = host.querySelector('.mv-halo'), nn = svg.querySelector('.c-now');
  let t = null, activo = false, vuelve = null;              // t = null: el cursor sigue a "ahora"
  const cual = () => (t == null ? AH : t);
  const vol = () => { clearTimeout(vuelve); vuelve = setTimeout(() => ir(null, 360), 4000); };
  function pos(v, visible) {                                // solo el cursor (rápido: se llama en cada cuadro del deslizamiento)
    const x = X(v); cur.setAttribute('visibility', visible ? 'visible' : 'hidden');
    cl.setAttribute('x1', x); cl.setAttribute('x2', x); cp.setAttribute('cx', x); cp.setAttribute('cy', Y(v));
  }
  function pinta() {                                        // solo el texto de la hora y el aria
    const tt = cual(), prox = M.ev.find(e => e.t > tt), subiendo = prox ? prox.k === 'P' : nivel(tt + 10 * MIN) > nivel(tt);   // misma regla que Hoy: si lo próximo es una alta, sube
    lectura.innerHTML = '<span class="l-hora">' + horaHtml(tt) + '</span><span class="l-alt">' + (t == null ? T.ahora : '') + '</span><span class="l-dir">' + flecha(subiendo ? 'P' : 'B') + (subiendo ? 'Sube' : 'Baja') + '</span>';
    svg.setAttribute('aria-valuenow', Math.round((tt - dI) / MIN)); svg.setAttribute('aria-valuetext', horaTxt(tt) + ', ' + (subiendo ? 'sube' : 'baja'));
  }
  /* botones y vuelta a "ahora": el texto cambia al instante (MareaCristal.cambio) y el cursor se desliza hasta la hora nueva */
  function ir(nt, ms, dir) {
    const desde = cual(); t = nt == null || Math.abs(nt - AH) < 3e4 ? null : Math.min(dI + DIA, Math.max(dI, nt));
    const hasta = cual(); if (t != null) vol(); else clearTimeout(vuelve);
    pinta(); if (dir) MareaCristal.cambio(lectura.firstChild, dir);
    MareaCristal.deslizar(desde, hasta, (v, fin) => pos(v, !fin || t != null), ms);
  }
  const mover = nt => { MareaCristal.cancelar(); t = Math.min(dI + DIA, Math.max(dI, nt)); if (Math.abs(t - AH) < 3e4) t = null; else vol(); pos(cual(), t != null); pinta(); };   // dedo y teclado: sigue directo, sin deslizar
  const desdePuntero = ev => { const r = svg.getBoundingClientRect(); mover(Math.round((dI + Math.min(DIA, Math.max(0, (ev.clientX - r.left - padX) / (W - 2 * padX) * DIA))) / (5 * MIN)) * 5 * MIN); };
  svg.addEventListener('pointerdown', e => { activo = true; svg.setPointerCapture(e.pointerId); desdePuntero(e); });
  svg.addEventListener('pointermove', e => { if (activo) desdePuntero(e); });
  svg.addEventListener('pointerup', () => { activo = false; });
  svg.addEventListener('keydown', e => { const d = { ArrowRight: 15 * MIN, ArrowLeft: -15 * MIN }[e.key]; if (d) { e.preventDefault(); mover((t == null ? AH : t) + d); } });
  document.getElementById('menos').onclick = () => ir(cual() - HORA, 240, -1);
  document.getElementById('mas1').onclick = () => ir(cual() + HORA, 240, 1);
  pinta(); pos(AH, false);
  return {
    ahora() {                                               // pasa un minuto: mover solo el punto "ahora"
      const x = X(AH), y = Y(AH);
      nl.setAttribute('x1', x); nl.setAttribute('x2', x); nn.setAttribute('cx', x); nn.setAttribute('cy', y); nh.style.left = x.toFixed(1) + 'px'; nh.style.top = y.toFixed(1) + 'px';
      if (t == null) { pinta(); pos(AH, false); }
    }
  };
}

/* ---------- pintar ---------- */
function marcarTabs() { barra.querySelectorAll('a').forEach(a => { if (a.dataset.k === vista) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); }); }
function pintaFecha() { const f = document.getElementById('fecha'); if (f) f.textContent = fechaTxt(AH) + ' · ' + horaTxt(AH); }
function render() {
  const sc = hoja.scrollTop;
  app.dataset.estado = R.estado; app.dataset.p = vista;
  panel.classList.toggle('alta', vista === 'dias' && !!M && !estadoFechas()); panel.classList.toggle('hoy', vista === 'hoy');
  curvaH = null;
  /* Ronda 10: la pastilla del encabezado (con la placa a la que vuela el camarón de la portada, r9) vive fuera de la vista y no se repinta: el destino del vuelo no se mueve. */
  estadoHtml = '';
  vistaEl.innerHTML = vista === 'curva' ? vistaCurva() : vista === 'dias' ? vistaDias() : vistaHoy();
  estadoEl.innerHTML = vista === 'hoy' ? estadoHtml : ''; estadoEl.hidden = !(vista === 'hoy' && estadoHtml);
  const ac = document.getElementById('acerca'); if (ac) { ac.open = acercaAbierto; ac.addEventListener('toggle', () => { acercaAbierto = ac.open; }); }
  marcarTabs(); pintaFecha();
  pieEl.innerHTML = vista === 'hoy' ? '' : frescoHtml();   // en Curva y Días la frescura queda fija al pie, siempre visible (también a letra 150 %)
  if (vista === 'curva' && M && !estadoFechas()) curvaH = curva(document.getElementById('graf'), document.getElementById('lectura'));
  const mas = document.getElementById('mas'); if (mas) mas.onclick = () => { nVisibles += DIAS_PASO; render(); const f = vistaEl.querySelectorAll('.dia')[nVisibles - DIAS_PASO]; if (f) { f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: false }); } };
  hoja.scrollTop = sc;
  libre();
}
/* cada minuto: no se reconstruye la curva ni se pierde el foco; Hoy se repinta entero (no tiene controles) */
function tick() {
  AH = ahoraMs();
  if (vista === 'curva' && curvaH) { curvaH.ahora(); pintaFecha(); actualizaFresco(); return; }
  if (vista === 'dias') { const k = (M && M.ev.find(e => e.t > AH) || {}).t + '|' + diaIni(AH); if (k !== tecla) { tecla = k; render(); } else { pintaFecha(); actualizaFresco(); } return; }
  render();
}
function actualizaFresco() { const f = frescoInfo(); app.querySelectorAll('.fresco').forEach(p => { p.innerHTML = frescoIc(f) + '<span>' + f.t + '</span>'; }); }

/* ---------- "Acerca de los datos" OCULTO (Ivan, 19 oct): importante, pero no va en la pantalla de su papa. Se abre con pulsacion larga (0,7 s) sobre la pastilla "Finca Suarez" o con la direccion terminada en #acerca. ---------- */
const acercaEl = document.createElement('div');
acercaEl.id = 'acercaSheet'; acercaEl.className = 'acerca-sheet'; acercaEl.hidden = true; acercaEl.setAttribute('role', 'dialog'); acercaEl.setAttribute('aria-modal', 'true'); acercaEl.setAttribute('aria-label', T.acerca);
acercaEl.innerHTML = '<div class="as-caja"><h2>' + T.acerca + '</h2><p class="fuente">' + T.fuente + '</p><p class="fuente">' + T.clima + '</p><p class="credito">' + T.climaCredito + '</p><button type="button" class="as-cerrar" id="asCerrar">Cerrar</button></div>';
document.body.appendChild(acercaEl);
const abrirAcerca = () => { acercaEl.hidden = false; const b = document.getElementById('asCerrar'); if (b) b.focus(); };
const cerrarAcerca = () => { acercaEl.hidden = true; };
acercaEl.addEventListener('click', e => { if (e.target === acercaEl || e.target.id === 'asCerrar') cerrarAcerca(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !acercaEl.hidden) cerrarAcerca(); });
(function () {
  const cab = document.getElementById('cab'); if (!cab) return; let t = 0;
  const ini = () => { clearTimeout(t); t = setTimeout(() => { t = 0; abrirAcerca(); }, 700); }, fin = () => { clearTimeout(t); t = 0; };
  cab.addEventListener('pointerdown', ini); ['pointerup', 'pointerleave', 'pointercancel', 'pointermove'].forEach(ev => cab.addEventListener(ev, fin));
  cab.addEventListener('contextmenu', e => e.preventDefault());
})();
function ir() { const h = location.hash.slice(1); if (h === 'acerca') { abrirAcerca(); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} return; } vista = h === 'curva' || h === 'dias' ? h : 'hoy'; if (vista !== 'dias') nVisibles = DIAS_PASO; tecla = ''; AH = ahoraMs(); render(); if (vista !== 'hoy') hoja.scrollTop = 0; }
addEventListener('hashchange', ir);
let rz = null; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (vista === 'curva') render(); }, 200); });

/* ---------- datos en vivo: guardados primero, lo vivo después (al abrir, cada 30 min, al volver a la app y al volver la señal) ---------- */
let pidiendo = false, tmTraer = 0;
async function traer() {
  if (pidiendo || typeof DatosVivos === 'undefined' || !BASE) return;
  pidiendo = true;
  try { const r = await DatosVivos.cargar(BASE); ponerDatos(r); AH = ahoraMs(); render(); } catch (e) { /* los datos guardados siguen en pantalla */ }
  pidiendo = false; clearTimeout(tmTraer); tmTraer = setTimeout(traer, 30 * MIN);   // H2: se reprograma al terminar (éxito o fallo), sin deriva
}
/* PRUEBA 2/3 (retirar al integrar): ?estado= fija un estado para enseñarlo o capturarlo; no hay red. Al retirarlo, dejar const EST = null; */
const EST = Q.get('estado');
if (EST) {
  const hace = m => new Date(Date.now() - m * MIN);
  const E = { vivo: { estado: 'vivo', actualizado: hace(12), D: BASE }, reciente: { estado: 'reciente', actualizado: hace(5 * 60), D: BASE },
    guardado: { estado: 'guardado', actualizado: null, D: BASE }, cargando: { estado: 'cargando', actualizado: null, D: BASE },
    mala: { estado: 'guardado', actualizado: null, D: BASE, error: 'HTTP 500' } }[EST];
  if (E) ponerDatos(E);
}
/* FIN PRUEBA */
ir();
if (!EST) traer();
if (!EST) addEventListener('online', traer);
let ultimoTick = Date.now();
(function ciclo() { setTimeout(() => { tick(); ultimoTick = Date.now(); ciclo(); }, 60000 - (Date.now() % 60000) + 50); })();
const alVolver = () => { tick(); if (R.estado !== 'vivo' || Date.now() - (R.actualizado ? R.actualizado.getTime() : 0) > 29 * MIN) traer(); };   // 29 = TTL_FRESCO de datos-vivos.js
document.addEventListener('visibilitychange', () => { if (!document.hidden) alVolver(); });
addEventListener('pageshow', e => { if (e.persisted) alVolver(); else tick(); });

/* ---------- entrada del primer uso del día: la decisión se tomó arriba (decideEntrada); aquí solo se arranca el movimiento.
   La tarjeta de la apertura (otra copia desenfocada) se QUITA del DOM al terminar o si no hay entrada: menos textura en la GPU. ---------- */
(function entrada() {
  const quita = () => { const a = app.querySelector('.apertura'); if (a) a.remove(); };
  if (!ENTRA || !MareaCristal.entrada(app, { forzar: true, ms: 1500, alFin: () => setTimeout(quita, 800) })) { app.classList.remove('entrando'); quita(); }
})();

/* ---------- service worker + aviso de versión nueva ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (habia && !hayNueva) { hayNueva = true; if (vista === 'hoy') render(); } });
}
})();

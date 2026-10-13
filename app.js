/* Mareas de la Finca · lógica de pantalla (09 Prototipador, ronda 3, 12 oct 2026)
   Lee D (data.js): D.start, D.y (cada 30 min), D.ev ([hora local Honduras, 'P'|'B', altura]).
   Hora de Honduras = UTC-6 fija, sin importar la zona del teléfono.
   Sin llamadas externas. Textos en T. Diseño: salida/diseno/ (05, ronda 3). */
(function () {
'use strict';

/* ---------- Textos (contenido.md 4.0 a 4.6, con la enmienda de la sección 6) ---------- */
const T = {
  nombre: 'Mareas de la Finca',
  ALTA: 'Marea alta',
  BAJA: 'Marea baja',
  subiendo: 'La marea está subiendo.',
  bajando: 'La marea está bajando.',
  hoy: 'Hoy',
  manana: 'Mañana',
  verDias: 'Ver próximos días',
  volver: 'Volver al inicio',
  proximosDias: 'Próximos días',
  verMas: 'Ver más días',
  sinMasTitulo: 'Sin más horarios',
  sinMasTexto: 'Los horarios terminan hoy.',
  despuesTitulo: 'Ya no hay horarios',
  despuesTexto: f => 'Los horarios llegaron hasta el ' + f + '. Hay que actualizar los horarios.',
  antesTitulo: 'Todavía no hay horarios para esta fecha',
  antesTexto: f => 'Los horarios empiezan el ' + f + '. Conviene revisar la fecha del teléfono.',
  sinDatosTitulo: 'No se pudieron mostrar los horarios',
  sinDatosTexto: 'Cerrar la app y abrirla otra vez. Si sigue igual, pedir que la actualicen.',
  pie: 'Hora calculada, no es oficial. Puede no coincidir con otras páginas de mareas.',
  vigencia: f => 'Horarios hasta el ' + f + '.',
  vigenciaPronto: f => 'Horarios hasta el ' + f + '. Hay que actualizarlos.'
};
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_VISIBLES = 14;      // días al abrir "Próximos días"
const AVISO_DIAS = 14;         // vigencia más fuerte cuando quedan 14 días o menos

/* ---------- Íconos de línea: flecha en círculo (alta arriba, baja abajo) y flechas de navegación ---------- */
const svg = d => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
const I = {
  alta: svg('<circle cx="12" cy="12" r="9.5"/><path d="M12 17V8M8 11.5 12 7.5l4 4"/>'),
  baja: svg('<circle cx="12" cy="12" r="9.5"/><path d="M12 7v9M8 12.5l4 4 4-4"/>'),
  der: svg('<path d="M9 5l7 7-7 7"/>'),
  izq: svg('<path d="M15 5l-7 7 7 7"/>')
};

/* ---------- Reloj (hora de Honduras) ---------- */
const hn = () => new Date(Date.now() - 6 * 36e5 );   // campos UTC = hora de Honduras

/* ---------- Datos ---------- */
let S = 0, N = 0, evs = [], datosOk = false;
try {
  if (typeof D !== 'undefined' && D && Array.isArray(D.y) && D.y.length >= 48 && Array.isArray(D.ev) && D.start) {
    S = Date.parse(D.start + 'T00:00:00Z');
    N = Math.floor(D.y.length / 48);
    evs = D.ev.map(e => ({ m: Math.round((Date.parse(e[0] + 'Z') - S) / 6e4), k: e[1], a: e[2] }))
              .filter(e => !isNaN(e.m) && (e.k === 'P' || e.k === 'B'))
              .sort((a, b) => a.m - b.m);
    datosOk = !isNaN(S) && N > 0 && evs.length > 0;
  }
} catch (e) { datosOk = false; }

/* ---------- Formatos ---------- */
const hora12 = min => {                       // min: minuto del día (0 a 1439)
  const h = Math.floor(min / 60), mm = min % 60;
  return { h: (h % 12 || 12) + ':' + String(mm).padStart(2, '0'), s: h < 12 ? 'a. m.' : 'p. m.', h24: h };
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fechaLarga = d => DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de ' + MESES[d.getUTCMonth()];
const dayDate = i => new Date(S + i * 864e5);
const minDia = e => ((e.m % 1440) + 1440) % 1440;

function cuenta(diff) {
  const t = Math.round(diff);
  if (t < 1) return { c: 'ahora mismo', v: 'ahora mismo' };
  const h = Math.floor(t / 60), mm = t % 60;
  const N_ = '\u00a0';   // espacio no separable: "10 h" y "10 min" no se parten
  const c = h && mm ? 'en ' + h + N_ + 'h ' + mm + N_ + 'min' : h ? 'en ' + h + N_ + 'h' : 'en ' + mm + N_ + 'min';
  const pl = (n, u) => n + ' ' + u + (n === 1 ? '' : 's');
  const v = h && mm ? 'en ' + pl(h, 'hora') + ' con ' + pl(mm, 'minuto') : h ? 'en ' + pl(h, 'hora') : 'en ' + pl(mm, 'minuto');
  return { c: c, v: v };
}

/* ---------- Estado de "ahora" ---------- */
function contexto() {
  const d = hn();
  const now = (d.getTime() - S) / 6e4;           // minutos desde el inicio de los datos (fraccionario)
  const ti = Math.floor(now / 1440);             // índice del día de hoy
  let estado = 'ok';
  if (!datosOk) estado = 'sin-datos';
  else if (now < 0) estado = 'antes';
  else if (now >= N * 1440) estado = 'despues';
  return { d: d, now: now, ti: ti, estado: estado };
}
const ahoraTxt = d => {
  const x = hora12(d.getUTCHours() * 60 + d.getUTCMinutes());
  return '<span class="fecha">' + fechaLarga(d) + '</span> <span class="hr"><span class="pt">· </span>' + x.h + '\u00a0' + x.s + '</span>';
};

/* ---------- Piezas ---------- */
const cabInicio = c => '<h1 class="nombre" id="nombre" tabindex="-1">' + T.nombre + '</h1><p class="ahora">' + ahoraTxt(c.d) + '</p>';
const cabDias = () => '<div class="fila-cab"><a class="volver" id="volver" href="#" aria-label="' + T.volver + '">' + I.izq + '</a><h1 class="titulo" id="titulo-dias" tabindex="-1">' + T.proximosDias + '</h1></div>';

const bloqueEstado = (titulo, texto) => '<section class="estado" role="note"><h2>' + titulo + '</h2><p>' + texto + '</p></section>';

/* Pie de dos líneas: aviso y vigencia. La vigencia pesa más solo cuando quedan 14 días o menos. */
function pie(conVigencia, c) {
  const pronto = c && c.estado === 'ok' && N - c.ti <= AVISO_DIAS, f = fechaLarga(dayDate(N - 1));
  return '<footer class="pie"><p>' + T.pie + '</p>' +
    (conVigencia ? '<p class="vigencia' + (pronto ? ' pronto' : '') + '">' + (pronto ? T.vigenciaPronto(f) : T.vigencia(f)) + '</p>' : '') + '</footer>';
}

function proxima(titulo, icono, ev, c) {
  if (!ev) {
    return '<article class="proxima"><p class="etiqueta">' + icono + titulo + '</p><p class="sin-mas">' + T.sinMasTitulo +
      '</p><p class="cuerpo">' + T.sinMasTexto + '</p></article>';
  }
  const x = hora12(minDia(ev)), di = Math.floor(ev.m / 1440), r = cuenta(ev.m - c.now);
  let cuando = '', aria;
  if (di === c.ti) aria = 'hoy';
  else if (di === c.ti + 1) { cuando = 'mañana'; aria = cuando; }
  else { const dd = dayDate(di); cuando = DIAS[dd.getUTCDay()] + ' ' + dd.getUTCDate(); aria = cuando; }
  const label = 'Próxima ' + titulo.toLowerCase() + ', ' + x.h + ' ' + x.s + ', ' + aria + ', ' + r.v;
  return '<article class="proxima" aria-label="' + label + '"><p class="etiqueta">' + icono + titulo +
    '</p><p class="hora"><b>' + x.h + '</b><span>' + x.s + '</span></p><p class="apoyo">' + (cuando ? cuando + ' · ' : '') + r.c + '</p></article>';
}

const direccion = prox => '<p class="direccion">' + (prox.k === 'P' ? T.subiendo : T.bajando) + '</p>';

/* Una fila por marea, en orden de hora; la palabra siempre en la misma columna */
function fila(e) {
  const x = hora12(minDia(e));
  return '<li class="fila-m">' + (e.k === 'P' ? I.alta : I.baja) + '<span class="palabra">' + (e.k === 'P' ? T.ALTA : T.BAJA) +
    '</span><span class="h"><span>' + x.h + '</span><small>' + x.s + '</small></span></li>';
}

function bloqueDia(i, nombre, resto) {
  const de = evs.filter(e => e.m >= i * 1440 && e.m < (i + 1) * 1440);
  return '<section class="dia"><p class="dia-nombre" tabindex="-1"><b>' + nombre + '</b> <span>' + resto + '</span></p><ol>' +
    de.map(fila).join('') + '</ol></section>';
}
const nombreDia = (i, c) => {
  const dd = dayDate(i);
  if (i === c.ti) return [T.hoy, DIAS[dd.getUTCDay()] + ' ' + dd.getUTCDate()];
  if (i === c.ti + 1) return [T.manana, DIAS[dd.getUTCDay()] + ' ' + dd.getUTCDate()];
  return [cap(DIAS[dd.getUTCDay()]) + ' ' + dd.getUTCDate(), 'de ' + MESES[dd.getUTCMonth()]];
};
function listaDias(desde, hasta, c) {
  let h = '';
  for (let i = desde; i < hasta; i++) { const n = nombreDia(i, c); h += bloqueDia(i, n[0], n[1]); }
  return h;
}

/* ---------- Vistas ---------- */
function vistaInicio(c) {
  const sig = k => evs.find(e => e.k === k && e.m > c.now);
  const p = sig('P'), b = sig('B'), prox = (p && b) ? (p.m < b.m ? p : b) : (p || b);
  const hayManana = c.ti + 1 <= N - 1;
  const proximas = '<section class="proximas" aria-label="Próximas mareas">' + proxima(T.ALTA, I.alta, p, c) + proxima(T.BAJA, I.baja, b, c) +
    (prox ? direccion(prox) : '') + '</section>';
  const boton = hayManana ? '<a class="btn-dias" id="ir-dias" href="#dias"><span>' + T.verDias + '</span>' + I.der + '</a>' : '';
  let manana = '';
  if (hayManana) { const n = nombreDia(c.ti + 1, c); manana = '<div class="manana">' + bloqueDia(c.ti + 1, n[0], n[1]) + '</div>'; }
  return { cab: cabInicio(c), r1: proximas + boton + manana, r2: pie(true, c) };
}

let visibles = DIAS_VISIBLES;
function vistaDias(c) {
  const fin = Math.min(N, c.ti + visibles);
  return {
    cab: cabDias(),
    r1: '<div id="lista">' + listaDias(c.ti, fin, c) + '</div>' +
        (fin < N ? '<button type="button" class="mas" id="mas"><span>' + T.verMas + '</span>' + I.der + '</button>' : ''),
    r2: pie(true, c)
  };
}

function vistaEstado(c) {
  let a, vig = true;
  if (c.estado === 'antes') { a = bloqueEstado(T.antesTitulo, T.antesTexto(fechaLarga(dayDate(0)))); vig = false; }
  else if (c.estado === 'despues') a = bloqueEstado(T.despuesTitulo, T.despuesTexto(fechaLarga(dayDate(N - 1))));
  else return { cab: cabInicio(c), r1: bloqueEstado(T.sinDatosTitulo, T.sinDatosTexto), r2: '' };
  return { cab: cabInicio(c), r1: a, r2: pie(vig, c) };
}

/* ---------- Pintado (solo toca lo que cambió; conserva el foco) ---------- */
const el = id => document.getElementById(id);
const ultimo = {};
function poner(id, html) {
  if (ultimo[id] === html) return;
  const a = document.activeElement, aid = a && a.id;
  el(id).innerHTML = html;
  ultimo[id] = html;
  if (aid && el(aid) && document.activeElement !== el(aid)) el(aid).focus({ preventScroll: true });
}

let vistaPrev = null, desdeInicio = false;
const rutaDias = () => location.hash === '#dias';

function pintar() {
  try {
    const c = contexto();
    let vista, v;
    if (c.estado !== 'ok') { vista = c.estado; v = vistaEstado(c); }
    else if (rutaDias() && c.ti + 1 <= N - 1) { vista = 'dias'; v = vistaDias(c); }
    else { vista = 'inicio'; v = vistaInicio(c); }
    if (vista !== 'dias') visibles = DIAS_VISIBLES;
    poner('cab', v.cab);
    poner('r1', v.r1);
    poner('r2', v.r2);
    ajustaPunto();
    if (vista !== vistaPrev) {
      if (vistaPrev !== null) {
        window.scrollTo(0, 0);
        const f = vista === 'dias' ? el('titulo-dias') : el('nombre');
        if (f) f.focus({ preventScroll: true });
      }
      if (vista === 'inicio') desdeInicio = false;
      vistaPrev = vista;
    }
  } catch (e) {
    try {
      poner('cab', cabInicio({ d: hn() }));
      poner('r1', bloqueEstado(T.sinDatosTitulo, T.sinDatosTexto));
      poner('r2', '');
    } catch (e2) { /* sin nada más que hacer */ }
  }
}

/* Si la hora baja a su propio renglón, el "·" no se queda colgado: se oculta y la hora va sola en su línea */
function ajustaPunto() {
  const f = document.querySelector('.ahora .fecha'), h = document.querySelector('.ahora .hr'), p = document.querySelector('.ahora .pt');
  if (!f || !h || !p) return;
  h.classList.remove('sola');
  const rf = f.getClientRects(), u = rf[rf.length - 1], rh = h.getClientRects()[0];
  if (u && rh && rh.top >= u.bottom - 2) h.classList.add('sola');
}
addEventListener('resize', ajustaPunto);
addEventListener('load', ajustaPunto);

/* ---------- Eventos ---------- */
document.addEventListener('click', ev => {
  const t = ev.target.closest && ev.target.closest('a,button');
  if (!t) return;
  if (t.id === 'ir-dias') { desdeInicio = true; return; }        // el ancla pone #dias y dispara hashchange
  if (t.id === 'volver') {
    ev.preventDefault();
    if (desdeInicio) history.back();                              // vuelve sin apilar historia
    else { history.replaceState(null, '', location.pathname + location.search); pintar(); }
  }
  if (t.id === 'mas') {
    ev.preventDefault();
    const antes = document.querySelectorAll('section.dia').length;
    visibles = N;                                                 // el resto de los días con datos
    pintar();
    const nuevo = document.querySelectorAll('section.dia')[antes];
    if (nuevo) nuevo.querySelector('.dia-nombre').focus({ preventScroll: true });
  }
});
addEventListener('hashchange', pintar);
addEventListener('pageshow', pintar);
addEventListener('focus', pintar);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pintar(); });

/* Un repintado al inicio de cada minuto (cuenta regresiva, "ya pasó", cambio de día a medianoche) */
function tic() {
  pintar();
  setTimeout(tic, 60000 - (Date.now() % 60000) + 150);
}
tic();

/* ---------- Service worker ---------- */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
})();

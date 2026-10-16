/* Clima en vivo para el fondo (Open-Meteo Forecast, sin clave). 09 Prototipador, ronda 7, 15 oct 2026. Sin dependencias fuera de clima-fondo.js.
   Mismo patrón que datos-vivos.js (sin tocar su lógica): tope de 8 s que cubre cabeceras Y cuerpo, copia guardada en localStorage,
   refresco cada 30 min con un temporizador que se reprograma al terminar (éxito o fallo), y nunca lanza: el fondo nunca queda en blanco.
   Solo coordenadas del pueblo de San Lorenzo (BRIEF). Ninguna de la finca.
   Orden de caída: clima de ahora -> última copia (mientras no caduque, 150 min contados desde que se midió, no desde que se abrió la app)
   -> cielo neutro de la hora (salida y puesta guardadas; si nunca hubo, una hora de arranque aproximada).
   Uso: ClimaVivo.iniciar({ contenedor, paletas, alEstado }) -> { traer, info, forzar, soltar, motor }. */
(function (root) {
  'use strict';
  var LAT = 13.42, LON = -87.45;   // pueblo de San Lorenzo (BRIEF), no la finca
  var URL = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
    '&current=weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m,is_day&daily=sunrise,sunset&timezone=America%2FTegucigalpa&forecast_days=1';
  var CLAVE = 'mareas-clima-v1', CLAVE_SOL = 'mareas-clima-sol-v1';
  var MIN = 6e4, TTL_FRESCO = 29 * MIN, REFRESCO = 30 * MIN, TOPE = 8000, SOL_VALE = 30 * 864e5;
  var SOL_ARRANQUE = ['05:45', '17:45'];   // solo hasta la primera respuesta del primer uso; es una hora aproximada, no un dato medido

  function leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function guardar(k, o) { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }
  var num = function (v) { return typeof v === 'number' && isFinite(v) ? v : null; };
  var hhmm = function (s) { var m = /T(\d{2}:\d{2})/.exec(String(s || '')); return m ? m[1] : null; };

  /* Una respuesta solo cuenta si trae un weather_code numérico. Todo lo demás se acepta si viene y se descarta si no. 200 sin datos, {} o null -> null. */
  function validar(j) {
    var c = j && j.current;
    if (!c || num(c.weather_code) === null) return null;
    var d = j.daily, sal = d && d.sunrise && hhmm(d.sunrise[0]), pue = d && d.sunset && hhmm(d.sunset[0]);
    return {
      cur: { code: c.weather_code, nubes: num(c.cloud_cover), lluvia: num(c.precipitation), viento: num(c.wind_speed_10m), dir: num(c.wind_direction_10m), esDia: c.is_day === 0 ? false : c.is_day === 1 ? true : null },
      sol: sal && pue ? { salida: sal, puesta: pue } : null
    };
  }

  /* Datos de la copia -> lo que entiende el motor. El código se traduce con ClimaFondo.codigoACondicion (ver mapa en INTEGRACION.md);
     lo que no reconoce (nieve, granizo, códigos nuevos) cae a 'neutro' = cielo de la hora, sin afirmar clima. */
  function paraMotor(copia) {
    var c = copia.cur;
    return { condicion: root.ClimaFondo.codigoACondicion(c.code), viento: c.viento == null ? 0 : c.viento, dirViento: c.dir == null ? 90 : c.dir,
      lluvia: c.lluvia, nubes: c.nubes, esDia: c.esDia !== false, medidoEn: copia.t };
  }

  async function pedir(f) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = ctl && setTimeout(function () { ctl.abort(); }, TOPE), j;
    try { var r = await f(URL, ctl ? { signal: ctl.signal } : undefined); if (!r.ok) throw new Error('HTTP ' + r.status); j = await r.json(); }   // el tope cubre cabeceras y cuerpo (patrón de datos-vivos.js)
    finally { if (to) clearTimeout(to); }
    var v = validar(j); if (!v) throw new Error('datos incompletos');
    return v;
  }

  /* cargar: nunca lanza. fuente = 'vivo' (bajó ahora o copia con menos de 29 min) | 'guardado' (falló la red: se usa la última copia) | 'ninguno' */
  async function cargar(opciones) {
    var f = (opciones && opciones.fetch) || root.fetch, ahora = Date.now(), c = leer(CLAVE), ok = c && num(c.t) !== null && c.cur && num(c.cur.code) !== null;
    if (ok && ahora - c.t >= 0 && ahora - c.t < TTL_FRESCO && !(opciones && opciones.forzar)) return { fuente: 'vivo', t: c.t, cur: c.cur, delCache: true };
    try {
      var v = await pedir(f), t = Date.now();
      guardar(CLAVE, { t: t, cur: v.cur });
      if (v.sol) guardar(CLAVE_SOL, { salida: v.sol.salida, puesta: v.sol.puesta, t: t });
      return { fuente: 'vivo', t: t, cur: v.cur };
    } catch (e) {
      if (ok) return { fuente: 'guardado', t: c.t, cur: c.cur, error: String(e && e.message || e) };
      return { fuente: 'ninguno', t: null, cur: null, error: String(e && e.message || e) };
    }
  }

  function solGuardado() {
    var s = leer(CLAVE_SOL);
    if (s && /^\d\d:\d\d$/.test(s.salida) && /^\d\d:\d\d$/.test(s.puesta) && num(s.t) !== null && Date.now() - s.t < SOL_VALE) return [s.salida, s.puesta];
    return SOL_ARRANQUE;
  }

  function iniciar(op) {
    var CF = root.ClimaFondo, motor = CF.montar(op.contenedor, { estados: op.paletas, horizonte: op.horizonte || 0.46, agua: false, estatico: !!op.estatico });
    var tm = 0, pidiendo = false, ultimo = null, forzado = null, ultIntento = 0;
    var info = { fuente: 'ninguno', medidoEn: null, error: null };

    op.contenedor.addEventListener('cf:estado', function (ev) {
      var d = ev.detail, cond = d.condicion === 'neutro' ? 'despejado' : d.condicion;   // el tinte del cristal de un cielo neutro es el del despejado de esa hora
      var r = document.documentElement; r.style.setProperty('--cielo', d.cielo); r.dataset.clima = d.solIntenso && cond === 'despejado' && d.momento === 'dia' ? 'dia-solfuerte' : d.momento + '-' + cond; r.dataset.climaFuente = d.caducado ? 'caducado' : info.fuente;   // r8: con sol intenso el cristal vira a blanco azulado frio
      if (op.alEstado) op.alEstado(d);
    });

    function aplicar(copia) {   // copia = { t, cur } o null
      var sol = solGuardado(); motor.setSol(sol[0], sol[1]);
      if (copia && copia.cur) motor.setEstado(paraMotor(copia)); else motor.setEstado({ condicion: 'neutro', esDia: true });
    }

    async function traer(forzar) {
      if (pidiendo) return; pidiendo = true; ultIntento = Date.now();
      try {
        var r = await cargar({ forzar: forzar === true }); ultimo = r; info.fuente = r.fuente; info.medidoEn = r.t; info.error = r.error || null;
        if (!forzado) aplicar(r.cur ? { t: r.t, cur: r.cur } : null);
      } catch (e) { /* cargar() no lanza; esto es solo un cinturón */ }
      pidiendo = false; clearTimeout(tm); tm = setTimeout(traer, REFRESCO);   // se reprograma al terminar, sin deriva
    }

    /* Arranque síncrono con la copia (primer pintado ya con el cielo correcto), después la red. */
    var c0 = leer(CLAVE); if (c0 && num(c0.t) !== null && c0.cur && num(c0.cur.code) !== null) { info.fuente = 'guardado'; info.medidoEn = c0.t; aplicar(c0); } else aplicar(null);
    traer();

    function alVolver() { if (!document.hidden && Date.now() - ultIntento > TTL_FRESCO) traer(); }
    document.addEventListener('visibilitychange', alVolver);
    root.addEventListener('online', function () { traer(); });
    root.addEventListener('pageshow', function (e) { if (e.persisted) alVolver(); });

    var api = {
      motor: motor, traer: traer,
      info: function () { return { fuente: info.fuente, medidoEn: info.medidoEn, error: info.error, forzado: !!forzado, motor: motor.estado() }; },
      /* SOLO PRUEBAS (clima-prueba.js): fija un estado a mano / vuelve al clima real */
      forzar: function (e) { forzado = e; motor.setEstado(e); },
      soltar: function () { forzado = null; aplicar(ultimo && ultimo.cur ? { t: ultimo.t, cur: ultimo.cur } : (leer(CLAVE) || null)); }
    };
    root.ClimaVivo.actual = api;
    return api;
  }

  root.ClimaVivo = { iniciar: iniciar, cargar: cargar, validar: validar, paraMotor: paraMotor, URL: URL, LAT: LAT, LON: LON };
})(window);

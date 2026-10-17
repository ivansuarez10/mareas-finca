/* Datos en vivo de marea (Open-Meteo Marine, sin clave). Sin dependencias.
   Entrada: window.D (datos guardados: D.start, D.y a 30 min, D.ev [[iso,'P'|'B',m]]).
   Uso:  const r = await DatosVivos.cargar(D);  r.estado, r.actualizado, r.vivoHasta, r.D (D ya mezclado)
   estado: 'vivo' (bajó datos ahora) | 'reciente' (copia en el teléfono de hace < 12 h) | 'guardado' (solo tabla del modelo)
   La celda de la consulta es la del modelo (mar abierto frente a San Lorenzo), no la finca. */
(function (root) {
  const CELDA = { lat: 13.39, lon: -87.45 };   // costa de San Lorenzo, Valle (Golfo de Fonseca); la API la ajusta a su celda de mar (13.375, -87.458)
  const URL = 'https://marine-api.open-meteo.com/v1/marine?latitude=' + CELDA.lat + '&longitude=' + CELDA.lon +
    '&hourly=sea_level_height_msl&timezone=America%2FTegucigalpa&forecast_days=16&timeformat=unixtime';
  const CLAVE = 'mareas-vivo-v1', TTL_FRESCO = 29 * 6e4, TTL_RECIENTE = 12 * 36e5;
  const MIN6 = 6 * 36e5;                                   // Honduras = UTC-6, sin horario de verano
  const iso = (ms) => new Date(ms - MIN6).toISOString().slice(0, 16);   // "2026-10-14T04:12" hora de Honduras

  function extremos(t, y) {                                // t en segundos UNIX, y m; interpola el pico con parábola
    const ev = [];
    for (let i = 1; i < y.length - 1; i++) {
      const a = y[i - 1], b = y[i], c = y[i + 1];
      if (a == null || b == null || c == null) continue;
      const alta = b > a && b >= c, baja = b < a && b <= c;
      if (!alta && !baja) continue;
      const den = a - 2 * b + c, off = den ? 0.5 * (a - c) / den : 0;       // horas, entre -0.5 y 0.5
      ev.push([iso((t[i] + off * 3600) * 1000), alta ? 'P' : 'B', Math.round((b - 0.25 * (a - c) * off) * 100) / 100]);
    }
    return ev;
  }
  function y30(t, y) {                                     // nivel cada 30 min (Catmull-Rom entre horas)
    const out = [];
    for (let i = 0; i < y.length - 1; i++) {
      const p0 = y[Math.max(0, i - 1)], p1 = y[i], p2 = y[i + 1], p3 = y[Math.min(y.length - 1, i + 2)];
      if (p1 == null || p2 == null) { out.push(null, null); continue; }
      const q0 = p0 ?? p1, q3 = p3 ?? p2;
      out.push(p1, 0.5 * ((2 * p1) + (-q0 + p2) * .5 + (2 * q0 - 5 * p1 + 4 * p2 - q3) * .25 + (-q0 + 3 * p1 - 3 * p2 + q3) * .125));
    }
    return out;
  }
  const ms16 = (a) => Date.parse(a.slice(0, 16) + ':00Z') + MIN6;            // "2026-10-14T04:12[:00]" (hora Honduras) -> UNIX ms
  function mezclar(D, j) {                                 // pega lo vivo (tramo continuo desde hoy) sobre lo guardado
    if (!j || !j.hourly || !j.hourly.time || !j.hourly.sea_level_height_msl) return null;   // 09 (ronda 6, H7): 200 sin hourly = datos incompletos
    const t = j.hourly.time, y = j.hourly.sea_level_height_msl;
    let fin = -1; for (let i = 0; i < y.length; i++) { if (y[i] == null && t[i] * 1000 > Date.now()) break; fin = i; }
    if (fin < 24) return null;
    // 09 (ronda 4): guarda propia del prototipo; el módulo original no la tiene. Exige >= 24 valores no nulos en el tramo vivo (una respuesta toda nula no cuenta como viva).
    if (y.slice(0, fin + 1).filter((v) => v != null).length < 24) return null;
    const ini = Date.parse(D.start + 'T00:00:00Z') + MIN6;                    // inicio de D en UNIX ms
    const iniVivo = t[0] * 1000, finVivo = t[fin] * 1000, M = 3 * 36e5;
    const tv = t.slice(0, fin + 1), yv = y.slice(0, fin + 1), v30 = y30(tv, yv);
    // El modelo guardado y lo vivo tienen el mismo rango pero distinto cero (≈0.3 m): se mide en el tramo común y se corrige lo guardado
    let s = 0, n = 0;
    for (let k = 0; k < v30.length; k++) { const idx = Math.round((iniVivo - ini) / 18e5) + k; if (v30[k] != null && idx >= 0 && idx < D.y.length) { s += v30[k] - D.y[idx]; n++; } }
    const delta = n ? s / n : 0, r2 = (x) => Math.round(x * 100) / 100;
    const dentro = (a) => { const ms = ms16(a); return ms >= iniVivo + M && ms <= finVivo - M; };
    const guardados = D.ev.map(([a, k, h]) => [a.slice(0, 16), k, dentro(a) ? h : r2(h + delta)]);
    const ev = guardados.filter(([a]) => !dentro(a)).concat(extremos(tv, yv).filter(([a]) => dentro(a))).sort((p, q) => (p[0] < q[0] ? -1 : 1));
    const yy = D.y.map((h) => r2(h + delta));
    for (let k = 0; k < v30.length; k++) { const idx = Math.round((iniVivo - ini) / 18e5) + k; if (v30[k] != null && idx >= 0 && idx < yy.length) yy[idx] = r2(v30[k]); }
    return { D: Object.assign({}, D, { y: yy, ev }), vivoHasta: new Date(finVivo), delta: r2(delta) };
  }
  function leer() { try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return null; } }
  function guardar(o) { try { localStorage.setItem(CLAVE, JSON.stringify(o)); } catch (e) {} }

  async function cargar(D, opciones) {
    const f = (opciones && opciones.fetch) || root.fetch, ahora = Date.now(), c = leer();
    if (c && ahora - c.t < TTL_FRESCO && c.j) { const m = mezclar(D, c.j); if (m) return { estado: 'vivo', actualizado: new Date(c.t), vivoHasta: m.vivoHasta, delta: m.delta, D: m.D }; }
    try {
      const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, to = ctl && setTimeout(() => ctl.abort(), 8000);
      let r, j; try { r = await f(URL, ctl ? { signal: ctl.signal } : undefined);   // 09 (ronda 6, H1): el timeout cubre cabeceras Y cuerpo
      if (!r.ok) throw new Error('HTTP ' + r.status);
      j = await r.json(); } finally { if (to) clearTimeout(to); }
      const m = mezclar(D, j); if (!m) throw new Error('datos incompletos');
      guardar({ t: ahora, j: { hourly: j.hourly } });
      return { estado: 'vivo', actualizado: new Date(ahora), vivoHasta: m.vivoHasta, delta: m.delta, D: m.D };
    } catch (e) {
      if (c && c.j && ahora - c.t < TTL_RECIENTE) { const m = mezclar(D, c.j); if (m) return { estado: 'reciente', actualizado: new Date(c.t), vivoHasta: m.vivoHasta, delta: m.delta, D: m.D }; }
      return { estado: 'guardado', actualizado: null, vivoHasta: null, D, error: String(e && e.message || e) };
    }
  }
  root.DatosVivos = { cargar, extremos, CELDA };
  if (typeof module !== 'undefined') module.exports = root.DatosVivos;
})(typeof window !== 'undefined' ? window : globalThis);

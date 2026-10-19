/* SOLO PRUEBAS (retirar al integrar: borrar este archivo y su <script> en index.html; ver INTEGRACION.md).
   ?clima=momento-condicion   fuerza el estado del fondo (amanecer|dia|atardecer|noche) - (despejado|parcial|nublado|llovizna|lluvia|tormenta|niebla|neutro)
                              opcionales: &viento=km/h  &lluvia=mm  &nubes=%  &dir=grados
   ?estilo=a|b                a = respaldo sin animación (nubes quietas, lluvia congelada); b = fondo vivo (por defecto)
   ?selector=1                botón "Clima" arriba a la derecha con los mismos controles, en vivo
   Nada de esto se muestra sin los parámetros. */
(function () {
  var CV = window.ClimaVivo && window.ClimaVivo.actual; if (!CV || !window.ClimaFondo) return;
  var q = new URLSearchParams(location.search), CF = window.ClimaFondo;
  if (q.get('estilo') === 'a') CV.motor.forzarEstatico(true);
  var f = CF.desdeQuery(location.search); if (f) CV.forzar(f);
  if (q.get('selector') !== '1') return;
  var M = ['automático'].concat(CF.MOMENTOS), C = ['clima real'].concat(CF.CONDICIONES), est = { m: 0, c: 0, v: 8, viejo: false, quieto: false };
  var cont = document.createElement('div');
  cont.style.cssText = 'position:fixed;top:8px;right:8px;z-index:60;font:400 14px system-ui,sans-serif;color:#fff;text-align:right';
  cont.innerHTML = '<button type="button" id="cp-b" style="min-height:44px;padding:0 14px;border-radius:22px;border:1px solid rgba(255,255,255,.5);background:rgba(10,20,30,.62);color:#fff;font:inherit">Clima</button>' +
    '<div id="cp-p" hidden style="margin-top:6px;padding:12px;border-radius:16px;background:rgba(10,20,30,.82);text-align:left;display:grid;gap:8px;min-width:220px">' +
    '<label>Momento <select id="cp-m" style="width:100%;min-height:36px">' + M.map(function (x, i) { return '<option value="' + i + '">' + x + '</option>'; }).join('') + '</select></label>' +
    '<label>Condición <select id="cp-c" style="width:100%;min-height:36px">' + C.map(function (x, i) { return '<option value="' + i + '">' + x + '</option>'; }).join('') + '</select></label>' +
    '<label>Viento <span id="cp-vv">8</span> km/h <input id="cp-v" type="range" min="0" max="35" value="8" style="width:100%"></label>' +
    '<label><input id="cp-o" type="checkbox"> clima de hace 3 h (caducado)</label>' +
    '<label><input id="cp-q" type="checkbox"> sin movimiento</label></div>';
  document.body.appendChild(cont);
  var $ = function (id) { return cont.querySelector('#' + id); };
  $('cp-b').onclick = function () { var p = $('cp-p'); p.hidden = !p.hidden; };
  function aplica() {
    est.m = +$('cp-m').value; est.c = +$('cp-c').value; est.v = +$('cp-v').value; est.viejo = $('cp-o').checked; est.quieto = $('cp-q').checked; $('cp-vv').textContent = est.v;
    CV.motor.forzarEstatico(est.quieto);
    if (est.c === 0 && est.m === 0 && !est.viejo) { CV.soltar(); return; }
    var e = { condicion: est.c ? C[est.c] : 'despejado', viento: est.v, dirViento: 90 };
    if (est.m) e.momento = M[est.m];
    if (est.viejo) e.medidoEn = Date.now() - 3 * 36e5;
    CV.forzar(e);
  }
  ['cp-m', 'cp-c', 'cp-v', 'cp-o', 'cp-q'].forEach(function (id) { $(id).addEventListener('input', aplica); $(id).addEventListener('change', aplica); });
})();

/* MareaCristal · propio del estudio (ronda 5 de Mareas de la Finca). Movimiento mínimo para una app de cristal horneado.
   Parte de MareaViva (ronda 4) y de React Bits Counter (© David Haz, MIT + Commons Clause, privado; versión simplificada).
   Tres trabajos: (1) entrada del panel en la primera apertura del día, (2) cambio de un valor (roll o fundido),
   (3) cursor de la curva que se desliza entre horas. Solo transform y opacity. Sin canvas, sin bucles de JS.
   Reducir movimiento: entrada() no hace nada, cambio() es un fundido de 120 ms, deslizar() salta. */
(function () {
  "use strict";
  var mq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduced = function () { return !!(mq && mq.matches); };
  var EVT = ["pointerdown", "keydown", "wheel", "touchstart"];

  /* entrada(raiz, {ms=1300, clase="entrando", clave, dia, forzar, alFin}) -> true si entró.
     Pone la clase en la raíz; el CSS hace el resto. La quita sola a los ms o con cualquier toque, tecla o scroll.
     Con "clave" (y "dia", texto AAAA-MM-DD; por defecto el de hoy) solo entra la 1.ª vez de cada día; si localStorage falla, no entra. */
  function entrada(raiz, opt) {
    opt = opt || {};
    var ms = opt.ms || 1300, clase = opt.clase || "entrando";
    if (reduced() || document.hidden) return false;
    if (opt.clave && !opt.forzar) {
      var d = new Date(), hoy = opt.dia || d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
      try { if (localStorage.getItem(opt.clave) === hoy) return false; localStorage.setItem(opt.clave, hoy); } catch (e) { return false; }
    }
    raiz.classList.add(clase);
    var t, quita = function () {
      clearTimeout(t); raiz.classList.remove(clase);
      EVT.forEach(function (n) { removeEventListener(n, quita, true); });
      if (opt.alFin) opt.alFin();
    };
    EVT.forEach(function (n) { addEventListener(n, quita, { capture: true, passive: true }); });
    t = setTimeout(quita, ms);
    return true;
  }

  /* cambio(el, dir): llamarlo DESPUES de cambiar el texto. dir > 0 el valor entra desde abajo, dir < 0 desde arriba (200 ms);
     sin dir (0 o vacío) es un fundido de 180 ms, para textos que solo se refrescan (la cuenta atrás). El elemento no puede ser inline puro. */
  function cambio(el, dir) {
    if (!el || !el.animate) return null;
    if (reduced()) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, fill: "backwards" });
    if (!dir) return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: "ease-out", fill: "backwards" });
    var y = (dir < 0 ? -1 : 1) * 55;
    return el.animate([{ opacity: 0, transform: "translateY(" + y + "%)" }, { opacity: 1, transform: "none" }],
      { duration: 200, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
  }

  /* deslizar(desde, hasta, cuadro(v, fin), ms=240): un solo rAF mientras dura (ease-out quint); otra llamada o cancelar() lo corta. */
  var raf = 0;
  function deslizar(desde, hasta, cuadro, ms) {
    cancelAnimationFrame(raf);
    ms = ms == null ? 240 : ms;
    if (reduced() || ms <= 0 || desde === hasta) { cuadro(hasta, true); return; }
    var t0 = performance.now();
    (function paso(ahora) {
      var p = Math.min(1, (ahora - t0) / ms), e = 1 - Math.pow(1 - p, 5);
      cuadro(desde + (hasta - desde) * e, p >= 1);
      if (p < 1) raf = requestAnimationFrame(paso);
    })(t0);
  }
  function cancelar() { cancelAnimationFrame(raf); }

  window.MareaCristal = { entrada: entrada, cambio: cambio, deslizar: deslizar, cancelar: cancelar, reducido: reduced };
})();

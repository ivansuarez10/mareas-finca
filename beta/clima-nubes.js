/* ClimaNubes · nubes vivas del fondo del clima (propio del estudio, 08 Motion, ronda 10, 17 oct 2026).
   Un solo lienzo de baja resolución (se estira con CSS: la nube es suave, no pierde nada) con TRES capas de nube que derivan con el viento y
   CAMBIAN DE FORMA despacio (no es un bucle ni una textura que se traslada). Tres motores con la misma API, elegidos con medición:
     'webgl'  ruido fractal (fBm 3D, 5 octavas) en un fragment shader, a ~0,4 de la resolución. Es el que se usa si el teléfono lo soporta.
     'canvas' dos mapas de ruido pre-calculados (tileables, 128x128) que se mezclan; se evalúa por píxel en JS a ~0,18 y 20 cuadros/s. Respaldo.
     'svg'    feTurbulence animado (baseFrequency). SOLO se deja para comparar: repinta por CPU cada cuadro. No se usa en producción.
   Cascada de respaldo (modo 'auto'): webgl completo -> webgl más ligero (0,7x resolución, 30 cuadros/s, 2 capas) -> canvas 2D -> quieto.
   Reglas del 14: la nube más rápida cruza el ancho en >= 90 s (el viento modula con tope); nada brusco; zona calma bajo el dato de marea
   (menos opacidad y SIN octavas finas, así el cristal no necesita desenfocar); pausa con la pestaña oculta; Reducir movimiento = un cuadro fijo.
   Sin dependencias. Sin código de Shadertoy ni de terceros: el ruido es un hash propio (Hoskins-style es de dominio público) y todo lo demás es propio. */
(function (g) {
  'use strict';

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function mixn(a, b, t) { return a + (b - a) * t; }
  function prng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- parámetros por capa (criterio propio; unidades: anchos de pantalla) ---------- */
  var CAPAS = [
    { nombre: 'cirros', freq: 1.5, sx: 0.55, sy: 2.4, vel: 0.40, morph: 0.0045, blando: 0.20 },   // lejana: hebras largas y finas, la más lenta
    { nombre: 'media',  freq: 2.2, sx: 1.0,  sy: 1.0, vel: 0.68, morph: 0.0080, blando: 0.16 },   // masa media
    { nombre: 'cerca',  freq: 1.15, sx: 1.0, sy: 1.15, vel: 1.00, morph: 0.0120, blando: 0.18 }   // grande y baja: la más rápida (parallax) y la que da volumen
  ];
  var VEL_MAX = 1 / 90;      // 14: la nube más rápida tarda >= 90 s en cruzar el ancho (4,3 px/s a 390 px) con viento a tope
  var VEL_MIN = 0.6;         // fracción de VEL_MAX con viento ~0: velocidad mínima de vida (el viento real hoy es de 1,4 km/h y se vería quieto)

  /* ---------- shader ---------- */
  var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform vec2 uRes;uniform vec3 uO0,uO1,uO2,uCov,uAlp,uLuz,uSom,uSol;uniform vec2 uL;uniform vec4 uZ;uniform float uCalmaK,uEsp,uN;',
    'float h(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}',
    'float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);',
    ' return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),',
    '            mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}',
    'const mat2 R=mat2(.8,.6,-.6,.8);',
    'float fbm(vec3 p,float det){float a=.5,s=0.,n=0.;for(int i=0;i<5;i++){float w=i<3?1.:det;n+=a*w*vn(p);s+=a*w;p=vec3(R*p.xy*2.03,p.z*1.9+7.1);a*=.5;}return n/s;}',
    'float fb3(vec3 p){float a=.5,s=0.,n=0.;for(int i=0;i<3;i++){n+=a*vn(p);s+=a;p=vec3(R*p.xy*2.03,p.z*1.9+7.1);a*=.5;}return n/s;}',
    // una capa: devuelve rgb premultiplicado + a
    'vec4 capa(vec2 b,vec3 o,float freq,vec2 st,float cov,float al,float soft,float det,float mk,float pz){',
    ' vec3 q=vec3(b*freq*st,0.)+o;float n=fbm(q,det);float thr=mix(.70,.37,cov)+uEsp*.06*cov;',
    ' float d=smoothstep(thr,thr+soft+pz*.05,n);',                      // bajo el cristal el borde es más suave, pero la forma se lee
    ' float nl=fb3(q+vec3(uL*.16,0.));',
    ' float lit=clamp(.58+(n-nl)*9.*(1.+.7*uEsp),0.,1.);',
    ' float nb=fb3(q+vec3(0.,.11,0.));',                                 // 10b: base de la nube (más oscura, sobre todo en tormenta)
    ' lit-=clamp((n-nb)*(6.+9.*uEsp),0.,1.)*(.18+.65*uEsp);',
    ' lit-=(n-.52)*(1.1+3.4*uEsp);',                                     // 10b: lo más denso es más oscuro (masas apiladas con luz en las crestas)
    ' float fino=1.-smoothstep(0.,.55,d);',                              // borde fino: deja pasar la luz
    ' lit=mix(clamp(lit,0.,1.),1.,fino*.5*(1.-uEsp*.5))*(1.-uEsp*.12*d);',
    ' vec3 c=mix(uSom,uLuz,lit);',
    ' float a=d*al*mk;',
    ' return vec4(c*a,a);}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/uRes;uv.y=1.-uv.y;float asp=uRes.y/uRes.x;vec2 b=vec2(uv.x,uv.y*asp);',
    ' float y=uv.y;',
    ' float enBanda=1.-smoothstep(uZ.x-.03,uZ.x+.11,y);',          // 1 en la banda de cielo, 0 bajo el panel
    ' float panel=mix(uZ.w*(1.-.1*uEsp),1.,enBanda);',
    ' float calma=smoothstep(uZ.y-.03,uZ.y+.03,y)*(1.-smoothstep(uZ.z-.03,uZ.z+.03,y));',   // zona A: el dato vital
    ' float mk=panel*mix(1.,uCalmaK*(1.-.18*uEsp),calma);',
    ' float det=mix(.6,1.,enBanda)*(1.-.4*calma);',               // bajo el panel solo las octavas gruesas: nube difusa de bajo contraste
    ' vec4 acc=vec4(0.);',
    ' vec4 l0=capa(b,uO0,' + CAPAS[0].freq.toFixed(2) + ',vec2(' + CAPAS[0].sx.toFixed(2) + ',' + CAPAS[0].sy.toFixed(2) + '),uCov.x,uAlp.x,' + CAPAS[0].blando.toFixed(2) + ',det,mk*(.7+.3*enBanda),1.-enBanda);acc=l0+acc*(1.-l0.a);',
    ' vec4 l1=capa(b,uO1,' + CAPAS[1].freq.toFixed(2) + ',vec2(' + CAPAS[1].sx.toFixed(2) + ',' + CAPAS[1].sy.toFixed(2) + '),uCov.y,uAlp.y,' + CAPAS[1].blando.toFixed(2) + ',det,mk,1.-enBanda);acc=l1+acc*(1.-l1.a);',
    ' if(uAlp.z>.001){vec4 l2=capa(b,uO2,' + CAPAS[2].freq.toFixed(2) + ',vec2(' + CAPAS[2].sx.toFixed(2) + ',' + CAPAS[2].sy.toFixed(2) + '),uCov.z,uAlp.z,' + CAPAS[2].blando.toFixed(2) + ',det,mk,1.-enBanda);acc=l2+acc*(1.-l2.a);}',
    // sol detrás de la nube: borde plateado cálido y menos nube justo en el disco
    ' if(uSol.z>0.){vec2 ds=(uv-uSol.xy)*vec2(1.,asp);float sp=exp(-dot(ds,ds)*7.)*uSol.z;acc.rgb+=vec3(1.,.93,.80)*sp*.30*acc.a*(1.-acc.a*.5);acc*=1.-sp*.45;}',
    ' float r=(h(vec3(gl_FragCoord.xy,uN))-.5)/255.;',               // dither: evita bandas en degradados suaves
    ' gl_FragColor=vec4(max(acc.rgb+r*acc.a,0.),acc.a);}'
  ].join('\n');

  /* ---------- estado por defecto ---------- */
  function nuevoEstado() {
    return { cob: 0.2, esp: 0, alfa: 0.8, viento: 0.1, dx: -1, dy: 0, luz: [255, 255, 255], som: [120, 135, 160], solX: 0.7, solY: -0.03, solK: 0, lx: 0.3, ly: -1, panelK: 0.8, calmaK: 0.78,
             zb: 0.24, z0: 0.34, z1: 0.52 };
  }
  var ESC = ['cob', 'esp', 'alfa', 'viento', 'dx', 'dy', 'solX', 'solY', 'solK', 'lx', 'ly', 'panelK', 'calmaK', 'zb', 'z0', 'z1'];

  function cubrir(e) { // cobertura y opacidad de cada capa según el estado (criterio propio)
    var c = e.cob, esp = e.esp;
    var cov0 = 0.28 + 0.5 * c, al0 = e.alfa * (0.55 - 0.35 * esp) * (0.35 + 0.65 * (1 - c * 0.6));
    var cov1 = clamp(c * 1.05 + 0.02, 0, 1), al1 = e.alfa * 0.9;
    var cov2 = clamp((c - 0.15) * 1.25 + 0.1 * esp, 0, 1), al2 = e.alfa * clamp((c - 0.28) * 2.2, 0, 1) * (0.7 + 0.3 * esp);
    return { cov: [cov0, cov1, cov2], alp: [al0, al1, al2] };
  }

  /* ---------- motor WebGL ---------- */
  function motorWebGL(cv, op) {
    var gl = null;
    try { gl = cv.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: !op.permitirSoftware }); } catch (e) { gl = null; }
    if (!gl) return null;
    var pf = gl.getShaderPrecisionFormat && gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    if (pf && pf.precision === 0 && !op.permitirSoftware) return null;       // sin highp en el fragment: el hash se rompe, mejor el respaldo
    function sh(tipo, src) { var s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { throw new Error(gl.getShaderInfoLog(s)); } return s; }
    var pr;
    try { pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link'); }
    catch (e) { return null; }
    gl.useProgram(pr);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var U = {}; ['uRes', 'uO0', 'uO1', 'uO2', 'uCov', 'uAlp', 'uLuz', 'uSom', 'uSol', 'uL', 'uZ', 'uCalmaK', 'uEsp', 'uN'].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    gl.disable(gl.BLEND);
    var n = 0;
    return {
      nombre: 'webgl',
      tamano: function (w, h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); },
      dibujar: function (E, O, w, h) {
        var C = cubrir(E), L = Math.hypot(E.lx, E.ly) || 1;
        gl.uniform2f(U.uRes, w, h);
        gl.uniform3f(U.uO0, O[0][0], O[0][1], O[0][2]); gl.uniform3f(U.uO1, O[1][0], O[1][1], O[1][2]); gl.uniform3f(U.uO2, O[2][0], O[2][1], O[2][2]);
        gl.uniform3f(U.uCov, C.cov[0], C.cov[1], C.cov[2]); gl.uniform3f(U.uAlp, C.alp[0], C.alp[1], C.alp[2] * (E.capas3 === false ? 0 : 1));
        gl.uniform3f(U.uLuz, E.luz[0] / 255, E.luz[1] / 255, E.luz[2] / 255); gl.uniform3f(U.uSom, E.som[0] / 255, E.som[1] / 255, E.som[2] / 255);
        gl.uniform3f(U.uSol, E.solX, E.solY, E.solK); gl.uniform2f(U.uL, E.lx / L, E.ly / L);
        gl.uniform4f(U.uZ, E.zb, E.z0, E.z1, E.panelK); gl.uniform1f(U.uCalmaK, E.calmaK); gl.uniform1f(U.uEsp, E.esp); gl.uniform1f(U.uN, (n++ % 97) / 97);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      pixeles: function (w, h) { var b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); return { d: b, premult: true, abajoArriba: true }; },
      destruir: function () { var x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); }
    };
  }

  /* ---------- motor canvas 2D con ruido pre-calculado ---------- */
  var MAPAS = null;
  function mapas() {
    if (MAPAS) return MAPAS;
    var N = 128, out = [];
    [11, 29].forEach(function (seed) {
      var m = new Float32Array(N * N), r = prng(seed), amp = 0.5, tot = 0;
      for (var o = 0; o < 5; o++) {
        var C = 4 << o, gr = new Float32Array(C * C), i, x, y;
        for (i = 0; i < gr.length; i++) gr[i] = r();
        for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
          var fx = x / N * C, fy = y / N * C, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
          var a = gr[(iy % C) * C + (ix % C)], b = gr[(iy % C) * C + ((ix + 1) % C)], c = gr[((iy + 1) % C) * C + (ix % C)], d = gr[((iy + 1) % C) * C + ((ix + 1) % C)];
          m[y * N + x] += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
        }
        tot += amp; amp *= 0.5;
      }
      for (var k = 0; k < m.length; k++) m[k] /= tot;
      out.push(m);
    });
    MAPAS = { N: N, A: out[0], B: out[1] };
    return MAPAS;
  }
  function motorCanvas(cv, op) {
    var ctx = cv.getContext('2d'); if (!ctx) return null;
    var M = mapas(), N = M.N, A = M.A, B = M.B, img = null, acc = null;
    function muestra(m, u, v) { // bilinear con envoltura; u, v en unidades de mapa (0..N)
      u = u - Math.floor(u / N) * N; v = v - Math.floor(v / N) * N;
      var x0 = u | 0, y0 = v | 0, x1 = (x0 + 1) % N, y1 = (y0 + 1) % N, fx = u - x0, fy = v - y0;
      var a = m[y0 * N + x0], b = m[y0 * N + x1], c = m[y1 * N + x0], d = m[y1 * N + x1];
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    return {
      nombre: 'canvas',
      tamano: function (w, h) { cv.width = w; cv.height = h; img = ctx.createImageData(w, h); },
      dibujar: function (E, O, w, h, t) {
        var C = cubrir(E), d = img.data, asp = h / w, L = Math.hypot(E.lx, E.ly) || 1, lx = E.lx / L, ly = E.ly / L, mezcla = 0.5 + 0.5 * Math.sin(t / 61), mezcla2 = 0.5 + 0.5 * Math.sin(t / 43 + 1.7);
        var luz = E.luz, som = E.som, p = 0, ax, ay, k, px, py;
        for (py = 0; py < h; py++) {
          var uy = py / h, enBanda = 1 - sm(E.zb - 0.03, E.zb + 0.11, uy), panel = mixn(E.panelK, 1, enBanda), calma = sm(E.z0 - 0.03, E.z0 + 0.03, uy) * (1 - sm(E.z1 - 0.03, E.z1 + 0.03, uy)), mk = panel * mixn(1, E.calmaK, calma), by = uy * asp;
          for (px = 0; px < w; px++) {
            var bx = px / w, accR = 0, accG = 0, accB = 0, accA = 0;
            for (k = 0; k < 3; k++) {
              var Cp = CAPAS[k], al = C.alp[k]; if (al < 0.002) continue;
              var o = O[k], qx = bx * Cp.freq * Cp.sx + o[0], qy = by * Cp.freq * Cp.sy + o[1], z = o[2];
              var n1 = muestra(A, qx * N / 4 + z * 9, qy * N / 4), n2 = muestra(B, qx * N / 4 * 1.37 - z * 14 + 31, qy * N / 4 * 1.37 + 17);
              var n = mixn(n1, n2, (k === 1 ? mezcla : mezcla2) * 0.7 + 0.15);
              var thr = mixn(0.70, 0.37, C.cov[k]) - 0.04 + E.esp * 0.06 * C.cov[k], dd = sm(thr, thr + Cp.blando + (1 - enBanda) * 0.05, n);
              if (dd <= 0.002) continue;
              var nl = muestra(A, (qx + lx * 0.16) * N / 4 + z * 9, (qy + ly * 0.16) * N / 4);
              var lit = clamp(0.58 + (n1 - nl) * 9 * (1 + 0.7 * E.esp) - (n - 0.52) * (1.1 + 2.6 * E.esp), 0, 1), fino = 1 - sm(0, 0.55, dd); lit = mixn(lit, 1, fino * 0.55) * (1 - E.esp * 0.3 * dd);
              var a = dd * al * (k === 0 ? mk * (0.7 + 0.3 * enBanda) : mk);
              var r = som[0] + (luz[0] - som[0]) * lit, gg = som[1] + (luz[1] - som[1]) * lit, b = som[2] + (luz[2] - som[2]) * lit;
              accR = r * a + accR * (1 - a); accG = gg * a + accG * (1 - a); accB = b * a + accB * (1 - a); accA = a + accA * (1 - a);
            }
            if (E.solK > 0) { var dx = bx - E.solX, dy = (uy - E.solY) * asp, sp = Math.exp(-(dx * dx + dy * dy) * 7) * E.solK; accR += 255 * sp * 0.3 * accA; accG += 237 * sp * 0.3 * accA; accB += 204 * sp * 0.3 * accA; accR *= 1 - sp * 0.45; accG *= 1 - sp * 0.45; accB *= 1 - sp * 0.45; accA *= 1 - sp * 0.45; }
            d[p] = accA > 0.002 ? accR / accA : 0; d[p + 1] = accA > 0.002 ? accG / accA : 0; d[p + 2] = accA > 0.002 ? accB / accA : 0; d[p + 3] = accA * 255; p += 4;
          }
        }
        ctx.putImageData(img, 0, 0);
      },
      pixeles: function () { return { d: img.data, premult: false, abajoArriba: false }; },
      destruir: function () { img = null; }
    };
  }
  function sm(a, b, x) { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); }

  /* ---------- motor SVG (feTurbulence animado; SOLO para medir) ---------- */
  function motorSVG(cont, cv, op) {
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.style.position = 'absolute';
    var defs = document.createElementNS(NS, 'defs'); svg.appendChild(defs);
    var wrap = document.createElement('div'); wrap.className = 'cn-svg'; wrap.style.cssText = 'position:absolute;inset:0;overflow:hidden';
    var capas = [], W = 120, H = 260;
    for (var k = 0; k < 3; k++) {
      var id = 'cnf' + k + '-' + Math.floor(Math.random() * 1e6), f = document.createElementNS(NS, 'filter'); f.setAttribute('id', id); f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', '100%'); f.setAttribute('height', '100%'); f.setAttribute('color-interpolation-filters', 'sRGB');
      f.innerHTML = '<feTurbulence type="fractalNoise" baseFrequency="' + (0.013 + 0.006 * k) + ' ' + (0.02 + 0.01 * k) + '" numOctaves="4" seed="' + (3 + k * 5) + '" result="t"><animate attributeName="baseFrequency" dur="' + (83 + 17 * k) + 's" values="' + (0.013 + 0.006 * k) + ' ' + (0.02 + 0.01 * k) + ';' + (0.016 + 0.006 * k) + ' ' + (0.024 + 0.01 * k) + ';' + (0.013 + 0.006 * k) + ' ' + (0.02 + 0.01 * k) + '" repeatCount="indefinite"/></feTurbulence>' +
        '<feColorMatrix in="t" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  5 0 0 0 -2.4" result="a"/>' +
        '<feFlood flood-color="#7e8fa8" result="s"/><feComposite in="s" in2="a" operator="in" result="sh"/><feOffset in="sh" dx="0" dy="3" result="sh2"/>' +
        '<feFlood flood-color="#ffffff" result="l"/><feComposite in="l" in2="a" operator="in" result="li"/><feMerge><feMergeNode in="sh2"/><feMergeNode in="li"/></feMerge>';
      defs.appendChild(f);
      var d = document.createElement('div'); d.style.cssText = 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;transform-origin:0 0;filter:url(#' + id + ');will-change:transform';
      wrap.appendChild(d); capas.push(d);
    }
    cv.style.display = 'none'; cont.appendChild(svg); cont.appendChild(wrap);
    return {
      nombre: 'svg',
      tamano: function (w, h, cssW, cssH) { var s = cssW / W; capas.forEach(function (d, k) { d.style.opacity = [0.5, 0.8, 0.9][k]; d.style.transform = 'scale(' + s.toFixed(3) + ',' + (cssH / H).toFixed(3) + ') translate3d(' + (-0.2 * W).toFixed(1) + 'px,0,0)'; }); },
      dibujar: function (E, O, w, h, t, cssW, cssH) { var s = cssW / W, sy = cssH / H; capas.forEach(function (d, k) { d.style.transform = 'scale(' + s.toFixed(3) + ',' + sy.toFixed(3) + ') translate3d(' + (-(O[k][0] % 1) * W * 0.5 - 0.1 * W).toFixed(2) + 'px,0,0)'; }); },
      destruir: function () { if (svg.parentNode) svg.parentNode.removeChild(svg); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); cv.style.display = ''; },
      sinLienzo: true
    };
  }

  /* ---------- controlador ---------- */
  function soportaWebGL() { try { var c = document.createElement('canvas'), x = c.getContext('webgl', { failIfMajorPerformanceCaveat: true }); if (x && x.getExtension('WEBGL_lose_context')) x.getExtension('WEBGL_lose_context').loseContext(); return !!x; } catch (e) { return false; } }

  function crear(cont, opciones) {
    var op = { modo: 'auto', escalaGL: 0.5, escalaCV: 0.18, fpsCV: 20, auto: true, tau: 2.6, velocidad: 1, escalaTiempo: 1, permitirSoftware: false, semilla: 0 };
    if (opciones) for (var k in opciones) op[k] = opciones[k];
    var cv = document.createElement('canvas'); cv.className = 'cn-lienzo'; cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    cont.appendChild(cv);
    var motor = null, modo = null, nivel = 0, E = nuevoEstado(), T = nuevoEstado(), luzT = null, somT = null;
    var O = [[3.1 + op.semilla, 1.7, 0.4], [9.4 + op.semilla, 5.2, 2.9], [17.8 + op.semilla, 2.4, 6.1]];   // posiciones iniciales (otra semilla = otro cielo)
    var S = { w: 0, h: 0, cssW: 0, cssH: 0, raf: 0, last: 0, t: 0, quieto: false, pausado: false, oculto: document.hidden, reducido: false, cuadros: 0, t0: 0, fps: 0, lentos: 0, ms: 0, nCuadros: 0, pintados: 0, ult: 0 };
    var mq = g.matchMedia ? g.matchMedia('(prefers-reduced-motion: reduce)') : null; S.reducido = !!(mq && mq.matches); S.retenido = op.retardo > 0;

    function lienzoNuevo() { var n = document.createElement('canvas'); n.className = 'cn-lienzo'; n.setAttribute('aria-hidden', 'true'); n.style.cssText = cv.style.cssText; if (cv.parentNode) cv.parentNode.replaceChild(n, cv); else cont.appendChild(n); cv = n; cv.addEventListener('webglcontextlost', perdido, false); }
    function perdido(ev) { ev.preventDefault(); if (modo === 'webgl') { elegir('canvas'); arrancar(); } }
    function elegir(m) {
      if (motor) { motor.destruir(); motor = null; }
      lienzoNuevo();
      if (m === 'webgl') motor = motorWebGL(cv, op);
      if (m === 'svg') motor = motorSVG(cont, cv, op);
      if (!motor && (m === 'canvas' || m === 'webgl')) { var cv2 = cv; motor = motorCanvas(cv2, op); m = motor ? 'canvas' : null; }
      if (!motor && m === 'svg') return false;
      modo = motor ? motor.nombre : 'ninguno'; if (op.onNivel) op.onNivel(nivel, modo);
      redimensionar(true);
      return !!motor;
    }
    function escala() { return (modo === 'webgl' ? op.escalaGL : op.escalaCV) * (nivel === 1 && modo === 'webgl' ? 0.7 : 1); }
    function redimensionar(forzar) {
      var cw = cont.clientWidth, ch = cont.clientHeight; if (!cw || !ch || !motor) return;
      var s = escala(), w = Math.max(24, Math.round(cw * s)), h = Math.max(48, Math.round(ch * s));
      if (!forzar && w === S.w && h === S.h && cw === S.cssW) return;
      S.w = w; S.h = h; S.cssW = cw; S.cssH = ch; motor.tamano(w, h, cw, ch);
      pintar(0);
    }

    function velocidades() { // anchos de pantalla por segundo, por capa, con el viento (0..1) modulando y el tope del 14
      var v = op.velocidad * (VEL_MIN + (1 - VEL_MIN) * clamp(E.viento, 0, 1)) * VEL_MAX;
      return CAPAS.map(function (c) { return v * c.vel; });
    }
    function avanzar(dt) {
      var vs = velocidades(), asp = S.h / S.w;
      for (var i = 0; i < 3; i++) {
        var q = CAPAS[i]; O[i][0] += E.dx * vs[i] * q.freq * q.sx * dt; O[i][1] += E.dy * vs[i] * q.freq * q.sy * dt / Math.max(asp, 0.2) * 0.25; O[i][2] += q.morph * dt * (0.6 + 0.8 * clamp(E.viento, 0, 1)) * (1 + 0.5 * E.esp);
      }
    }
    function suavizar(dt) {
      var a = 1 - Math.exp(-dt / op.tau), i;
      ESC.forEach(function (n) { E[n] += (T[n] - E[n]) * a; });
      for (i = 0; i < 3; i++) { E.luz[i] += (T.luz[i] - E.luz[i]) * a; E.som[i] += (T.som[i] - E.som[i]) * a; }
      E.capas3 = T.capas3;
    }
    function pintar(t) { if (motor) motor.dibujar(E, O, S.w, S.h, t, S.cssW, S.cssH); S.pintados++; }

    function bucle(ts) {
      S.raf = requestAnimationFrame(bucle);
      var minDt = modo === 'canvas' ? 1000 / op.fpsCV : nivel >= 1 ? 1000 / 30 : 1000 / 60;
      if (S.last && ts - S.last < minDt - 2.5) return;
      var dt = S.last ? Math.min((ts - S.last) / 1000, 0.1) : 0.016; S.last = ts;
      var c0 = performance.now();
      var dts = dt * op.escalaTiempo; S.t += dts; suavizar(dts); avanzar(dts); pintar(S.t);
      S.ms += ((performance.now() - c0) - S.ms) * 0.1;
      // guardia de cuadros (cada 3 s): baja un nivel si no sostiene el objetivo; nunca sube (evita el vaivén)
      S.cuadros++; if (!S.t0) S.t0 = ts;
      if (ts - S.t0 >= 3000) {
        S.fps = S.cuadros / ((ts - S.t0) / 1000); S.cuadros = 0; S.t0 = ts;
        var obj = modo === 'canvas' ? op.fpsCV : nivel >= 1 ? 30 : 55;
        S.lentos = S.fps < obj * 0.78 ? S.lentos + 1 : 0;
        if (op.auto && S.lentos >= 2) { S.lentos = 0; bajarNivel(); }
      }
    }
    function bajarNivel() {
      if (modo === 'webgl' && nivel === 0) { nivel = 1; redimensionar(true); }
      else if (modo === 'webgl') { elegir('canvas'); nivel = 1; redimensionar(true); }
      else { nivel = 2; quietoYa(true); }
      S.bajo = (S.bajo || 0) + 1; if (op.onNivel) op.onNivel(nivel, modo);
    }
    function arrancar() { if (S.retenido || S.raf || S.quieto || S.pausado || S.oculto || S.reducido || !motor || modo === 'ninguno') return; S.last = 0; S.t0 = 0; S.cuadros = 0; S.raf = requestAnimationFrame(bucle); }
    function parar() { if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; }
    function quietoYa(si) { S.quieto = !!si; if (si) { parar(); pintar(S.t); } else arrancar(); }

    function aplicarVisibilidad() { S.oculto = document.hidden; if (S.oculto) parar(); else arrancar(); }
    function onMq() { S.reducido = !!(mq && mq.matches); if (S.reducido) { parar(); pintar(S.t); } else arrancar(); }
    document.addEventListener('visibilitychange', aplicarVisibilidad);
    if (mq) { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); }
    var ro = g.ResizeObserver ? new ResizeObserver(function () { redimensionar(false); }) : null; if (ro) ro.observe(cont);

    var ok = elegir(op.modo === 'auto' ? (soportaWebGL() ? 'webgl' : 'canvas') : op.modo);
    if (!ok && op.modo !== 'canvas') ok = elegir('canvas');
    var api = {
      get modo() { return modo; },
      /* e: { cobertura 0-1, espesor 0-1, alfa 0-1, viento 0-1, dirViento grados, luz [r,g,b], sombra [r,g,b], sol {x,y,k} fracciones de pantalla, luzDir {x,y} } */
      setEstado: function (e, instantaneo) {
        if (e.cobertura != null) T.cob = clamp(e.cobertura, 0, 1);
        if (e.espesor != null) T.esp = clamp(e.espesor, 0, 1);
        if (e.alfa != null) T.alfa = clamp(e.alfa, 0, 1);
        if (e.viento != null) T.viento = clamp(e.viento, 0, 1);
        if (e.dirViento != null && isFinite(e.dirViento)) { var r = e.dirViento * Math.PI / 180; T.dx = -Math.sin(r); T.dy = -Math.cos(r) * 0.35; if (Math.abs(T.dx) < 0.25) T.dx = T.dx < 0 ? -0.25 : 0.25; var n = Math.hypot(T.dx, T.dy); T.dx /= n; T.dy /= n; }
        if (e.luz) T.luz = e.luz.slice(); if (e.sombra) T.som = e.sombra.slice();
        if (e.sol) { T.solX = e.sol.x; T.solY = e.sol.y; T.solK = clamp(e.sol.k, 0, 1); }
        if (e.luzDir) { T.lx = e.luzDir.x; T.ly = e.luzDir.y; }
        if (e.capas3 != null) T.capas3 = e.capas3;
        if (instantaneo || !S.primero) { ESC.forEach(function (n) { E[n] = T[n]; }); E.luz = T.luz.slice(); E.som = T.som.slice(); E.capas3 = T.capas3; S.primero = true; }
        if (S.quieto || S.reducido || !S.raf) pintar(S.t);
        arrancar();
      },
      /* zonas en px desde arriba: banda = fin de la banda de cielo; calma0/calma1 = tramo del dato vital (zona A); panelK = opacidad bajo el panel; calmaK = opacidad en la zona A */
      setZonas: function (z) {
        var H = S.cssH || cont.clientHeight || 844;
        if (z.banda != null) T.zb = clamp(z.banda / H, 0.05, 0.9);
        if (z.calma0 != null) T.z0 = clamp(z.calma0 / H, 0, 1); if (z.calma1 != null) T.z1 = clamp(z.calma1 / H, 0, 1);
        if (z.panelK != null) T.panelK = clamp(z.panelK, 0, 1); if (z.calmaK != null) T.calmaK = clamp(z.calmaK, 0, 1);
        E.zb = T.zb; E.z0 = T.z0; E.z1 = T.z1; E.panelK = T.panelK; E.calmaK = T.calmaK;
        if (S.quieto || S.reducido || !S.raf) pintar(S.t);
      },
      pausar: function () { S.pausado = true; parar(); }, reanudar: function () { S.pausado = false; arrancar(); },
      quieto: function (si) { quietoYa(si); },
      fijarTiempo: function (seg) { parar(); S.quieto = true; var base = [[3.1, 1.7, 0.4], [9.4, 5.2, 2.9], [17.8, 2.4, 6.1]]; for (var i = 0; i < 3; i++) O[i] = base[i].slice(); S.t = 0; ESC.forEach(function (n) { E[n] = T[n]; }); E.luz = T.luz.slice(); E.som = T.som.slice(); S.w && avanzar(seg); S.t = seg; pintar(seg); },
      cambiarModo: function (m) { nivel = 0; S.lentos = 0; parar(); elegir(m); if (!S.quieto) arrancar(); else pintar(S.t); },
      metricas: function () { return { modo: modo, nivel: nivel, fps: +S.fps.toFixed(1), msCuadro: +S.ms.toFixed(2), w: S.w, h: S.h, pintados: S.pintados, bajadas: S.bajo || 0, activo: !!S.raf, quieto: S.quieto || S.reducido }; },
      /* Mide el píxel MÁS CLARO y el MÁS OSCURO que queda detrás de una franja de pantalla (fy0..fy1, fracción del alto) a lo largo de un ciclo de nubes:
         dibuja `pasos` cuadros separados `salto` s (por defecto 12 x 25 s = 5 min de cielo), mezcla cada píxel con el cielo (cielo(fy) -> [r,g,b]) y devuelve los colores extremos.
         Es medición real de lo que dibuja el motor (no un modelo); el rayo, el sol y la lluvia no entran (la zona calma no los tiene). No hay motor 'svg' aquí. */
      medir: function (cielo, fy0, fy1, pasos, salto) {
        if (!motor || !motor.pixeles || !S.w) return null;
        pasos = pasos || 12; salto = salto || 25;
        var O0 = O.map(function (x) { return x.slice(); }), E0 = {}; ESC.forEach(function (n) { E0[n] = E[n]; }); var l0 = E.luz.slice(), s0 = E.som.slice();
        ESC.forEach(function (n) { E[n] = T[n]; }); E.luz = T.luz.slice(); E.som = T.som.slice();
        var lum = function (c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };   // luminancia aprox. (sRGB gamma) solo para ordenar
        var mx = null, mn = null, lmx = -1, lmn = 1e9, y0 = Math.floor(fy0 * S.h), y1 = Math.ceil(fy1 * S.h), px, py;
        for (var k = 0; k < pasos; k++) {
          avanzar(salto); motor.dibujar(E, O, S.w, S.h, S.t + k * salto, S.cssW, S.cssH);
          var P = motor.pixeles(S.w, S.h), d = P.d;
          for (py = y0; py < y1; py += 2) {
            var fr = P.abajoArriba ? S.h - 1 - py : py, sky = cielo((py + 0.5) / S.h);
            for (px = 0; px < S.w; px += 2) {
              var i = (fr * S.w + px) * 4, a = d[i + 3] / 255, c0 = d[i] * (P.premult ? 1 : a), c1 = d[i + 1] * (P.premult ? 1 : a), c2 = d[i + 2] * (P.premult ? 1 : a);
              var c = [c0 + sky[0] * (1 - a), c1 + sky[1] * (1 - a), c2 + sky[2] * (1 - a)], l = lum(c);
              if (l > lmx) { lmx = l; mx = c; } if (l < lmn) { lmn = l; mn = c; }
            }
          }
        }
        O = O0; ESC.forEach(function (n) { E[n] = E0[n]; }); E.luz = l0; E.som = s0; pintar(S.t);
        return { claro: mx && mx.map(Math.round), oscuro: mn && mn.map(Math.round) };
      },
      /* 10b: contraste de nube (desviación típica de la luminancia, 0-255) en dos franjas (fracciones del alto) mezclando con el cielo; para comprobar que bajo el cristal
         queda ~75-85 % del contraste de la banda de cielo. Devuelve {a, b, razon}. */
      contraste: function (cielo, a0, a1, b0, b1) {
        if (!motor || !motor.pixeles || !S.w) return null; var P = motor.pixeles(S.w, S.h), d = P.d, w = S.w, h = S.h;
        function franja(f0, f1) { var vt = 0, nf = 0, y; for (y = Math.floor(f0 * h); y < Math.ceil(f1 * h); y++) { var s1 = 0, s2 = 0, n = 0, fr = P.abajoArriba ? h - 1 - y : y, sky = cielo((y + 0.5) / h); for (var x = 0; x < w; x++) { var i = (fr * w + x) * 4, al = d[i + 3] / 255, m = P.premult ? 1 : al, c0 = d[i] * m + sky[0] * (1 - al), c1 = d[i + 1] * m + sky[1] * (1 - al), c2 = d[i + 2] * m + sky[2] * (1 - al), l = 0.2126 * c0 + 0.7152 * c1 + 0.0722 * c2; s1 += l; s2 += l * l; n++; } var m1 = s1 / n; vt += Math.max(0, s2 / n - m1 * m1); nf++; } return Math.sqrt(vt / Math.max(1, nf)); }   // contraste dentro de cada fila (quita el degradado del cielo)
        var A = franja(a0, a1), B = franja(b0, b1); return { a: +A.toFixed(2), b: +B.toFixed(2), razon: A > 0 ? +(B / A).toFixed(2) : null };
      },
      /* tinte de las nubes para el 05 y el 10: luminancia relativa de la luz y la sombra y el mayor alfa que alcanzan (estimación analítica; el contraste real se mide en pantalla) */
      tinte: function () { var f = function (c) { var v = c.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }; var C = cubrir(T); return { luzLum: f(T.luz), somLum: f(T.som), alfaMax: Math.max(C.alp[0], C.alp[1], C.alp[2]), luz: T.luz.slice(), sombra: T.som.slice() }; },
      destruir: function () { parar(); document.removeEventListener('visibilitychange', aplicarVisibilidad); if (ro) ro.disconnect(); if (motor) motor.destruir(); if (cv.parentNode) cv.parentNode.removeChild(cv); },
      get canvas() { return cv; }
    };
    if (!ok) api.sinMotor = true;
    if (op.retardo > 0) setTimeout(function () { S.retenido = false; arrancar(); }, op.retardo);
    T.luz = [255, 255, 255]; T.som = [120, 135, 160]; E.luz = T.luz.slice(); E.som = T.som.slice();
    return api;
  }

  g.ClimaNubes = { crear: crear, soportaWebGL: soportaWebGL, VEL_MAX: VEL_MAX };
})(typeof window !== 'undefined' ? window : this);

/* Tinte del cristal por estado y por zona (05 Diseñador, ronda 10). Función pura para el motor del 08 (y para generar la tabla).
   Entrada: una paleta de clima-paletas.js (cielo[3], nube{cobertura,luz,sombra,alfa}, rayos{activo,destello}).
   calcular(p, opt) -> { tinta:'claro'|'oscuro', alfa, rgb:[r,g,b], cr2, cr, peor:[r,g,b] }
     'claro' = texto blanco (tx #FFF, tx2 #E6EEF4); 'oscuro' = texto #0A2830 / #1B363E.
     opt.t, opt.b = franja vertical (fracción 0..1 de la altura de pantalla) que el velo cubre: el cielo ahí es lo que hay detrás. Por defecto .25-1 (panel que sube hasta el 25 % con letra 150 %).
     opt.tinta = fuerza la tinta (para que cab/cuerpo/barra del mismo estado compartan polaridad). opt.vivo = {claro:[r,g,b], oscuro:[r,g,b]} píxel más claro/oscuro medido en vivo (opcional; manda sobre el modelo).
   Regla: el cristal compone (1-alfa)*fondo + alfa*velo en sRGB. PEOR píxel = el que más estorba a esa tinta:
     texto blanco -> el fondo más CLARO posible en la franja (cielo, luz de nube, destello de rayo);
     texto oscuro -> el fondo más OSCURO posible (cielo, sombra de nube). Se resuelve el alfa mínimo para tx2 >= OBJ (4,8 = AA 4,5 + colchón). Suelo .14 (r10b).
   Tres zonas por estado: cab (pastilla, franja 0-.12), cuerpo (línea de estado + cristal; t = donde empieza la línea de estado), barra (.88-1). Cada una con su alfa. */
(function(g){
  var hex=function(h){return [1,3,5].map(function(i){return parseInt(h.slice(i,i+2),16)})};
  var lin=function(c){c/=255;return c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)};
  var L=function(c){return .2126*lin(c[0])+.7152*lin(c[1])+.0722*lin(c[2])};
  var CR=function(a,b){var x=L(a),y=L(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  var mix=function(a,b,t){return a.map(function(v,i){return v*(1-t)+b[i]*t})};
  var BLANCO=[255,255,255], NEGRO=[5,11,20], OBJ=4.8, SUELO=.14, COLCHON=.03;
  var TOPE={oscuro:.28,claro:.38};  // r10b (19 oct): tope del velo UNIFORME del cuerpo; lo que falta para el contraste lo pone el refuerzo local (loc) bajo las líneas de texto
  var MARGEN_VIVO=.06;  // r10b: con medida viva del 08 solo queda holgura de antialias; el modelo (sin medida) conserva el MARGEN
  var MARGEN=.15;  // medido en r10: el cuadro real queda hasta ~10-15 % más claro/oscuro que el modelo (nubes que se apilan, saturación del cristal, antialias)
  var TX={claro:{tx:[255,255,255],tx2:[230,238,244]}, oscuro:{tx:[10,40,48],tx2:[27,54,62]}};
  function colorEn(c,f){return f<=.46?mix(c[0],c[1],f/.46):mix(c[1],c[2],(f-.46)/.54)}
  function tramo(p,t,b){var c=p.cielo.map(hex), r=[colorEn(c,t),colorEn(c,b)]; if(t<.46&&b>.46) r.push(c[1]); return r}
  function masClaro(p,t,b){var B=tramo(p,t,b).reduce(function(m,c){return L(c)>L(m)?c:m});
    if(p.nube.cobertura>0){var luz=hex(p.nube.luz); if(L(luz)>L(B)||p.nube.cobertura>=40) B=mix(B,luz,Math.min(.9,p.nube.alfa))}
    if(p.rayos&&p.rayos.activo) B=mix(B,BLANCO,p.rayos.destello); return mix(B,BLANCO,MARGEN)}
  function masOscuro(p,t,b){var B=tramo(p,t,b).reduce(function(m,c){return L(c)<L(m)?c:m});
    if(p.nube.cobertura>=40) B=mix(B,hex(p.nube.sombra),Math.min(.9,p.nube.alfa*.8)); return mix(B,NEGRO,MARGEN)}
  function resolver(B,velo,tinta){var t=TX[tinta].tx2,lo=0,hi=.95;
    if(CR(t,mix(B,velo,hi))<OBJ) return null;
    for(var i=0;i<30;i++){var m=(lo+hi)/2; if(CR(t,mix(B,velo,m))>=OBJ)hi=m; else lo=m} return hi}
  function calcular(p,o){o=o||{}; var t=o.t==null?.25:o.t, b=o.b==null?1:o.b, v=o.vivo||{};
    var Bc=v.claro?mix(v.claro,BLANCO,MARGEN_VIVO):masClaro(p,t,b), Bo=v.oscuro?mix(v.oscuro,NEGRO,MARGEN_VIVO):masOscuro(p,t,b), mid=colorEn(p.cielo.map(hex),(t+b)/2);
    var vOsc=mix(mid,NEGRO,.7), vCla=mix(mid,BLANCO,.62);
    var f=function(a){return a==null?null:Math.max(SUELO,Math.ceil(a*100+COLCHON*100)/100)};
    var ac=f(resolver(Bc,vOsc,'claro')), ao=f(resolver(Bo,vCla,'oscuro')), tinta=o.tinta||((ao!=null&&(ac==null||ao<=ac+.05))?'oscuro':'claro');
    var alfa=tinta==='oscuro'?ao:ac, velo=tinta==='oscuro'?vCla:vOsc, B=tinta==='oscuro'?Bo:Bc;
    if(alfa==null) alfa=.95; var bg=mix(B,velo,alfa);
    // r10b: velo uniforme con tope (o.tope=true) + refuerzo local: 1-(1-uni)(1-loc) = total, así el peor píxel bajo el texto queda igual de legible.
    var tot=alfa, uni=alfa, loc=0; if(o.tope&&alfa>TOPE[tinta]){uni=TOPE[tinta]; loc=Math.min(.9,Math.ceil((1-(1-tot)/(1-uni))*100)/100)}
    return {tinta:tinta,alfa:+uni.toFixed(2),total:+tot.toFixed(2),loc:+loc.toFixed(2),rgb:velo.map(Math.round),peor:B.map(Math.round),cr2:+CR(TX[tinta].tx2,bg).toFixed(2),cr:+CR(TX[tinta].tx,bg).toFixed(2),alfaClaroUnico:ac,alfaOscuroUnico:ao};
  }
  // las tres zonas con la misma tinta (la del peor caso del cuerpo). yEstado = fracción de altura donde empieza la franja de la línea de estado.
  var zonas=function(p,yEstado,vivo){var base=calcular(p,{t:.25,b:1,vivo:vivo}), tinta=base.tinta, y=yEstado==null?.40:yEstado;
    return {tinta:tinta,cab:calcular(p,{t:0,b:.12,tinta:tinta,vivo:vivo}),cuerpo:calcular(p,{t:y,b:1,tinta:tinta,vivo:vivo,tope:true}),barra:calcular(p,{t:.88,b:1,tinta:tinta,vivo:vivo}),seguro:base}};
  // r10b: el motor (clima-fondo.js) solo copia alfa/rgb; el refuerzo local y el total salen aquí a las variables del <html> (--vid-loc, --vid-total) para app.css
  var zonas0=zonas; zonas=function(p,y,vivo){var z=zonas0(p,y,vivo);
    try{if(typeof document!=='undefined'&&document.documentElement){var st=document.documentElement.style; st.setProperty('--vid-loc',z.cuerpo.loc); st.setProperty('--vid-total',z.cuerpo.total)}}catch(e){}
    return z};
  g.ClimaTinte={calcular:calcular,zonas:zonas,CR:CR,hex:hex,mix:mix,L:L};
  if(typeof module!=='undefined')module.exports=g.ClimaTinte;
})(typeof window!=='undefined'?window:globalThis);

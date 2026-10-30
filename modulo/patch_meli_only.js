// Modo "sólo Mercado Libre" para el /evento (Ohpic, Prifamon, Superclick): sellers sin tienda propia ni Meta/Google.
// Se aplica DESPUÉS de build_evento.js + patch_meli.js:
//   node modulo/patch_meli_only.js <ruta a evento/index.html>
// - el Overview pasa a ser la pestaña Mercado Libre (la pestaña MeLi aparte se oculta);
// - Tienda y Paid Media se ocultan si no hay filas (Email/Social/Sprint ya se ocultan solos);
// - objetivos del evento desde objetivos_consultoria (fecha='cyber-monday-2026'): facturación,
//   inversión Product Ads / Display y límites de ACOS / TACOS. Si objetivos_ml tiene fila, gana esa.
const fs=require('fs');
const f=process.argv[2]; if(!f){console.error('falta la ruta');process.exit(1);}
let s=fs.readFileSync(f,'utf8');
const crlf=s.includes('\r\n'); if(crlf)s=s.replace(/\r\n/g,'\n');
if(!s.includes('/* ============ MERCADO LIBRE (pieza reutilizable'))throw new Error('falta patch_meli.js');
if(s.includes('/* sólo MeLi */'))throw new Error('ya aplicado');
function rep(re,to,what){const n=(s.match(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))||[]).length;
  if(n!==1)throw new Error(what+': '+n+' coincidencias'); s=s.replace(re,to);}

// 1. objetivos de consultoría cuando objetivos_ml no tiene fila del evento
rep(/(\n(\s*)DATA\.mlx=await mlP;)/,(m,a,sp)=>a+`
${sp}/* sólo MeLi */ if(!DATA.mlx.obj){
${sp}  const oc=await sbQ('objetivos_consultoria','select=cliente,facturacion,inversion_product_ads,inversion_display,acos_limite,tacos_limite&fecha=eq.'+ML_OBJ_KEY);
${sp}  const o=oc.find(x=>(x.cliente||'').toLowerCase()===CLIENTE_KEY.toLowerCase());
${sp}  const fo=(o&&+o.facturacion)||OBJ.fact;
${sp}  if(fo||o)DATA.mlx.obj={fact:fo,uni:0,pa:o?+o.inversion_product_ads||0:0,di:o?+o.inversion_display||0:0,
${sp}    acos:(o&&+o.acos_limite)||OBJ.acosLim,tacos:o?+o.tacos_limite||0:0,consul:true};
${sp}}`,'DATA.mlx');
rep(/\$\{all&&X\.obj&&\(X\.obj\.fact\|\|X\.obj\.uni\)\?`\$\{secH\('Objetivos Mercado Libre · avance','objetivos_ml'\)\}/,
  "${all&&X.obj&&(X.obj.fact||X.obj.uni)?`${secH('Objetivos del evento · avance',X.obj.consul?['Ritmo ideal '+nf(RITMO*100,0)+'%',X.obj.acos?'ACOS ≤ '+pc(X.obj.acos):'',X.obj.tacos?'TACOS ≤ '+pc(X.obj.tacos):''].filter(Boolean).join(' · '):'objetivos_ml')}",'pill objetivos');
rep(/(\$\{objRow\('Unidades MeLi',h\.units,X\.obj\.uni,v=>nf\(v\)\)\})/,
  "$1${objRow('Inversión Product Ads',h.paInv,X.obj.pa,M,true,'var(--ke-blue)')}${objRow('Inversión Display',h.diInv,X.obj.di,M,true,'var(--ke-green)')}",'objRow inversión');

// 2. qué pestañas hay: sin tienda ni pauta propia se ocultan; MeLi se muestra siempre (es el canal)
rep(/(\n(\s*)HAS\.consulInsights = [^\n]*\n)/,(m,a,sp)=>a+
`${sp}HAS.tienda = DATA.store.length>0 || DATA.tn.length>0 || DATA._hasFact;   // sólo MeLi: sin tienda propia, sin pestaña Tienda
${sp}HAS.paid = DATA.meta.length>0 || DATA.google.length>0;
${sp}HAS.meli = true;
`,'HAS');
rep(/if\(t\[0\]==='meli'\)return HAS\.meli;/,
  "if(t[0]==='meli')return false;   // sólo MeLi: el Overview es la pestaña Mercado Libre\n    if(t[0]==='tienda')return HAS.tienda;\n    if(t[0]==='paid')return HAS.paid;",'visibleTabs');
rep(/overview:ovTab,/,'overview:coTab,','render');
// 3. "Último dato cargado" mira sólo la tienda: sumar órdenes y Mercado Ads
rep(/const ds=DATA\.store\.map\(x=>x\.date\)\.filter\(Boolean\);/,
  "const X=DATA.mlx||{ord:[],ma:[]};   // sólo MeLi: la fecha sale de órdenes y Mercado Ads\n  const ds=DATA.store.map(x=>x.date).concat(X.ord.map(o=>String(o.order_date_created||'').slice(0,10)),X.ma.map(r=>r.fecha)).filter(Boolean);",'maxDataTs');

if(crlf)s=s.replace(/\n/g,'\r\n');
const scripts=[...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach((x,i)=>{try{new Function(x);}catch(e){throw new Error('script '+i+' no compila: '+e.message);}});
fs.writeFileSync(f,s);
console.log('ok',f);

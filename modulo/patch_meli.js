// Aplica la pestaña Mercado Libre (meli_tab.js + meli_tab.css) a un build de /evento.
// Uso: node patch_meli.js <ruta a evento/index.html>
const fs=require('fs'),path=require('path');
const f=process.argv[2]; if(!f){console.error('falta la ruta');process.exit(1);}
let s=fs.readFileSync(f,'utf8');
const crlf=s.includes('\r\n'); if(crlf)s=s.replace(/\r\n/g,'\n');
if(s.includes('/* ============ MERCADO LIBRE (pieza reutilizable')){console.error('ya aplicado');process.exit(1);}
const js=fs.readFileSync(path.join(__dirname,'meli_tab.js'),'utf8').trim();
const css=fs.readFileSync(path.join(__dirname,'meli_tab.css'),'utf8').trim();
function rep(re,to,what){const n=(s.match(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))||[]).length;
  if(n!==1)throw new Error(what+': '+n+' coincidencias'); s=s.replace(re,to);}

// 1. CSS
rep(/<\/style>/,()=>css+'\n</style>','</style>');   // funciones: el código trae "$'" y un string lo tomaría como patrón
// 2. la carga de MeLi arranca en paralelo con el resto; ml_orders y mercado_ads salen de ahí (paginados con desempate)
rep(/(\n\s*)(const \[rev,)/,'$1const mlP=meliLoad(pFrom,E_cur);$1$2','Promise.all');
rep(/sb\(T\('mercado_ads'\),[^\n]*\),/,"mlP.then(x=>x.ma),",'mercado_ads');
rep(/sb\(T\('ml_orders'\),[^\n]*\),/,"mlP.then(x=>x.ord),",'ml_orders');
rep(/(\n\s*)(DATA\._win=[^\n]*\n)/,'$1$2$1DATA.mlx=await mlP;\n','DATA._win');
rep(/(HAS\.meli = [^;\n]*);/,'$1 || DATA.mlx.disp.length>0;','HAS.meli');
// 3. la pestaña vieja se reemplaza entera
rep(/\/\* ---- MERCADO LIBRE ---- \*\/\nfunction coTab\(D\)\{[\s\S]*?\n\}\n/,'','coTab viejo');
// 4. pieza nueva antes del render del email/social (en el bloque de pestañas)
rep(/(\n\/\* ============ EVENTOS UI ============ \*\/)/,(m,a)=>'\n'+js+'\n'+a,'EVENTOS UI');
// 5. gráfico diario de MeLi
rep(/function drawCharts\(D\)\{/,"function drawCharts(D){const mEl=document.getElementById('meliDaily'); if(mEl) drawMeliDaily(mEl);",'drawCharts');
// 6. Overview: bloque MeLi aparte
rep(/(\n\s*)(\$\{secH\('Tendencia del evento)/,'$1${meliOverview(D)}$1$2','Overview');

if(crlf)s=s.replace(/\n/g,'\r\n');
fs.writeFileSync(f,s);
console.log('ok',f);

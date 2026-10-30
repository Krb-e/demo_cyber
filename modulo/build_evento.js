const fs=require('fs');
const path=require('path');
const SRC=process.argv[2];          // template base (demo_cyber/index.html)
const MOD=process.argv[3];          // event_module.js
const OUT=process.argv[4];          // output index.html
const PREFIX=process.argv[5];
const CLIENTE_KEY=process.argv[6];
const GA4_PAID_ONLY=process.argv[7]==='true';  // opcional: sellers sin Tiendanube ni planilla de ventas (fact = GA4 atribuida a pauta)

let s=fs.readFileSync(SRC,'utf8');

// --- extraer logos por alt ---
function logo(alt){const re=new RegExp('src="(data:image\\/[^"]+)"\\s+alt="'+alt+'"');const m=s.match(re);return m?m[1]:'';}
const L={
  meta:logo('Meta'),
  google:logo('Google Ads'),
  mercadoAds:logo('Mercado Ads'),
  mercadoLibre:logo('Mercado Libre'),
  tiendanube:logo('Tiendanube')
};
for(const k in L){if(!L[k])throw new Error('logo no encontrado: '+k);}

// --- shell (todo antes del <script>) ---
const idx=s.indexOf('<script>');
if(idx<0)throw new Error('no <script>');
let shell=s.slice(0,idx);
const endTag='</script>';
const lastClose=s.lastIndexOf(endTag);
const tail=s.slice(lastClose+endTag.length);

// --- ediciones al shell (quitar textos "demo") ---
shell=shell.replace(
  /<div>Krab-e · Marca Demo · Cyber Monday 2026 · <b>Tablero de demostración<\/b> · datos ficticios<\/div>/,
  '<div class="footmain">Krab-e · En vivo</div>'
);
// badge: agregar span de texto (fallback para eventos sin imagen Cyber)
shell=shell.replace(
  /(<div class="cyberbadge"><img src="data:[^"]+" alt="Cyber Monday">)(<\/div>)/,
  '$1<span class="badgetxt" style="display:none;font-family:\'Bitroad\',sans-serif;font-size:26px;color:var(--ke-orange);letter-spacing:.02em"></span>$2'
);

// --- módulo ---
let mod=fs.readFileSync(MOD,'utf8');
mod=mod.replace('__PREFIX__',PREFIX).replace('__CLIENTE_KEY__',CLIENTE_KEY).replace('__GA4_PAID_ONLY__',String(GA4_PAID_ONLY));
const Ljs='const L='+JSON.stringify(L)+';\n';

const outHtml=shell+'<script>\n'+Ljs+mod+'\n</script>'+tail;
fs.mkdirSync(path.dirname(OUT),{recursive:true});
fs.writeFileSync(OUT,outHtml);
console.log('OK '+OUT+' bytes='+outHtml.length);

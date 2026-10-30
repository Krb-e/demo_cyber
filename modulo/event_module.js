/* =====================================================================
   MÓDULO DE EVENTO · Krab-e (Cyber / Hot Sale) · config-driven
   Único edit por cliente: PREFIX + CLIENTE_KEY (+ GA4_PAID_ONLY), que pone el build. Todo lo demás sale de
   Supabase (tabla `eventos` para config/objetivos + tablas {prefix}_*).
   Los logos (Meta/Google/Mercado) se inyectan en build como const L.
   ===================================================================== */
const PREFIX='__PREFIX__';            // prefijo de tablas en Supabase
const CLIENTE_KEY='__CLIENTE_KEY__';  // key en eventos.cliente / objetivos.cliente
const SUPABASE_URL="https://yixbnmwdzexjygmtszii.supabase.co";
const SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpeGJubXdkemV4anlnbXRzemlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NzE5NjMsImV4cCI6MjA5NzU0Nzk2M30.W6ID6GDrY3kvDwNzjfPCcnkIsmFbcFm_YwhuraGAEo4";
const HDR={apikey:SUPABASE_ANON_KEY,Authorization:'Bearer '+SUPABASE_ANON_KEY};
const T=n=>PREFIX+'_'+n;
const TN_STATUS=['paid','partially_refunded']; // estados de Tiendanube que cuentan como facturación (igual que el dashboard común)
// Sin Tiendanube (p. ej. Famusic): facturación, órdenes y conversión salen de GA4 y SÓLO de paid media, con el mismo
// criterio que el dashboard común. Paid = el MEDIO es cpc|ppc|paid|paid_social|display (google / cpc, ig · fb · an · th / paid…).
// Es atribución de GA4 a pauta, no el total de la tienda: no coincide con el L10 a propósito.
const GA4_PAID_ONLY=__GA4_PAID_ONLY__;   // build: true sólo para sellers sin Tiendanube ni planilla de ventas
// Sellers sin Tiendanube con planilla de ventas (p. ej. El Burgués): la facturación y las órdenes salen de {prefix}_facturacion
// (venta_real, pedidos), con el mismo criterio que el dashboard común (suma de venta_real / pedidos; conversión =
// pedidos / sesiones GA4 de todo el sitio). Es diaria: sin desglose por hora. Los días sin cargar quedan en "—".
const FX=(h,s)=>h.factNone?'—':s;
const PAID_RE=/\/\s*(cpc|ppc|paid|paid_social|display)\s*$/i;
const esPaid=x=>PAID_RE.test((x.source_medium||'').trim());
const isPaidSrc=h=>h.factSrc==='GA4 paid';
const factLbl=h=>isPaidSrc(h)?'Facturación (GA4 · paid)':'Facturación';
const ordLbl=h=>isPaidSrc(h)?'Órdenes (GA4 · paid)':'Órdenes';
const factPill=(h,def)=>isPaidSrc(h)?'Atribuida a pauta (GA4)':def;

/* ============ FORMATO ============ */
const nf=(n,d=0)=>Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:d,maximumFractionDigits:d});
function moneyC(v){v=+v||0;const a=Math.abs(v);if(a>=1e6)return '$ '+(v/1e6).toFixed(1).replace('.',',')+'M';if(a>=1e3)return '$ '+(v/1e3).toFixed(1).replace('.',',')+'k';return '$ '+nf(Math.round(v));}
const M=v=>moneyC(v), K=v=>moneyC(v);
const pc=(n,d=1)=>nf(n,d)+'%';
const dlt=(v,inv=false)=>{if(v==null||!isFinite(v))return '<span class="delta">—</span>';const ar=v>0?'▲':'▼';return `<span class="delta ${(inv?v<0:v>0)?'up':'dn'}">${ar} ${nf(Math.abs(v),1)}%</span>`;};
function dpct(cur,prev,inv){if(prev==null||prev===0||!isFinite(prev))return '<span class="delta">—</span> vs período ant.';return dlt((cur-prev)/prev*100,inv)+' vs período ant.';}

/* ============ FECHAS ============ */
function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function parseISO(s){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function dayDiff(a,b){return Math.round((new Date(b.getFullYear(),b.getMonth(),b.getDate())-new Date(a.getFullYear(),a.getMonth(),a.getDate()))/86400000);}
const DOW=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

/* ============ FETCH SUPABASE ============ */
async function sb(table,cols,dateCol,from,to){
  let out=[],off=0,tie=true;const pg=1000;
  for(;;){
    let url=SUPABASE_URL+'/rest/v1/'+table+'?select='+encodeURIComponent(cols)+'&limit='+pg+'&offset='+off;
    if(dateCol&&from) url+='&'+dateCol+'=gte.'+from+'&'+dateCol+'=lte.'+to;
    // desempate por id: con >1000 filas y fechas repetidas, offset sin orden único duplica/saltea filas entre páginas
    if(dateCol) url+='&order='+dateCol+'.asc'+(tie?',id.asc':'');
    let r; try{ r=await fetch(url,{headers:HDR}); }catch(e){console.warn('[KE] '+table+' fetch error',e);return out;}
    if(r.status===400&&tie&&dateCol&&off===0){tie=false;continue;}   // tabla sin columna id: se pide sin desempate
    if(!r.ok){console.warn('[KE] '+table+' '+r.status+' — fuente ignorada');return out;}
    const rows=await r.json(); out=out.concat(rows);
    if(rows.length<pg) break; off+=pg;
  }
  return out;
}
const S=(a,f)=>a.reduce((s,x)=>s+(parseFloat(f(x))||0),0);
// CTR de Meta por fila: si la columna ctr viene vacía (ETL sin CTR), se calcula con clicks/impresiones
const ctrOf=x=>{const c=parseFloat(x.ctr);if(isFinite(c))return c;const i=+x.impressions||0;return i?(+x.clicks||0)/i*100:0;};

/* ============ ESTADO + CONFIG ============ */
let CFG=null;                 // fila de eventos
let DATA={};                  // crudo por tabla
let DAYS=[];                  // [{k:'YYYY-MM-DD', dow, dm, avail}]
let CTX={};                   // {all:{head,deltas}, 'YYYY-MM-DD':{...}}
let OBJ={}, RITMO=0, LASTTS='';
const state={tab:'overview',day:'all',postsN:5,postsFilter:'all',itemsSort:'v'};
const HAS={tienda:true,paid:true,google:true,meli:false,social:false,sprint:false,email:false};

/* ============ CARGA ============ */
async function boot(){
  try{
    const evs=await sb('eventos','*',null);
    CFG=evs.find(e=>(e.cliente||'').toLowerCase()===CLIENTE_KEY.toLowerCase())||evs[0];
  }catch(e){}
  if(!CFG){document.getElementById('content').innerHTML='<div class="empty"><div class="ei">⚠️</div><h4>No hay evento configurado</h4><p>No se encontró una fila en <b>eventos</b> para este cliente.</p></div>';return;}
  OBJ={fact:+CFG.obj_facturacion||0,ord:+CFG.obj_ordenes||0,invMeta:+CFG.obj_inv_meta||0,invGoogle:+CFG.obj_inv_google||0,acosLim:+CFG.acos_limite||0};
  applyBranding();
  await loadData();
}

function applyBranding(){
  const nombreCliente=titleCase(CLIENTE_KEY);
  document.title=nombreCliente+' · '+CFG.nombre+' · Krab-e';
  const ns=document.querySelector('.navsub'); if(ns)ns.textContent=nombreCliente;
  const ft=document.querySelector('.foot .footmain'); if(ft)ft.innerHTML='Krab-e · '+nombreCliente+' · '+CFG.nombre+' · <b>En vivo</b>';
  const bimg=document.querySelector('.cyberbadge img'); const btxt=document.querySelector('.cyberbadge .badgetxt');
  // si hay texto de badge configurado y no corresponde a "cyber", usamos texto
  if(CFG.badge_texto && !/cyber/i.test(CFG.badge_texto)){ if(bimg)bimg.style.display='none'; if(btxt){btxt.textContent=CFG.badge_texto;btxt.style.display='inline-flex';} }
}
function titleCase(s){return s.replace(/\w\S*/g,t=>t.charAt(0).toUpperCase()+t.slice(1));}

async function loadData(){
  const today=new Date();
  const fi=parseISO(CFG.fecha_inicio), ff=parseISO(CFG.fecha_fin);
  const endData=addDays(today,0)<ff?today:ff;                // último día con datos posibles
  const S_cur=iso(fi), E_cur=iso(endData);
  const len=dayDiff(fi,endData)+1;
  const pFrom=iso(addDays(fi,-len)), pTo=iso(addDays(fi,-1)); // período anterior comparable
  const tTo=E_cur+'T23:59:59';
  try{
    const [rev,ga4,tn,meta,google,ma,mlo,igPosts,igacc,ins,igSt,gev,gitems,em,fc]=await Promise.all([
      sb(T('revenue'),'date,source_medium,purchase_revenue,transactions,sessions,total_users,add_to_carts','date',pFrom,E_cur),
      sb(T('ga4_sessions'),'date,source_medium,total_users,sessions,transactions,total_revenue','date',pFrom,E_cur),
      sb(T('tiendanube_orders'),'date,order_payment_status,order_total_paid,order_total_products','date',pFrom,E_cur),
      sb(T('meta_ads'),'*',   // * : no todos los sellers tienen clicks/ctr; una columna faltante da 400 y se pierde Meta entero
      'date',pFrom,E_cur),
      sb(T('google_ads'),'*',   // * : no todos los sellers tienen ctr/search_impression_share; una columna faltante da 400 y se pierde Google entero
      'date',pFrom,E_cur),
      sb(T('mercado_ads'),'fecha,campaign_name,cost,impressions,clicks,total_amount,units_quantity,campaign_acos_target','fecha',pFrom,E_cur),
      sb(T('ml_orders'),'order_date_created,order_status,order_payment_status,order_total_amount,order_total_quantity','order_date_created',pFrom,tTo),
      sb(T('ig_posts_media'),'date_published,media_type,media_product_type,permalink,thumbnail_url,caption,reach,total_interactions,saved,shares,likes,comments,follows_from_post,views','date_published',S_cur,tTo),
      sb(T('ig_account_daily'),'fecha,account_reach,account_views,account_total_interactions,account_shares,account_saves,account_comments','fecha',pFrom,E_cur),
      sb(T('insights'),'semana,area,estatus,accionable,impacto_esperado,resumen,resultado,responsable',null),
      sb(T('ig_stories'),'date_published,media_type,media_product_type,permalink,caption,reach,views,total_interactions,shares,follows','date_published',S_cur,tTo),
      // GA4 detallado (no todos los sellers lo tienen: si la tabla falta da 404 y el funnel cae a revenue/add_to_carts)
      sb(T('ga4_events'),'date,event_name,sessions','date',pFrom,E_cur),
      sb(T('ga4_items'),'date,item_name,items_viewed,items_added_to_cart,items_purchased,item_revenue','date',S_cur,E_cur),
      // email marketing (campañas): si la tabla falta o no hay envíos en el evento, la pestaña Email se oculta.
      // * : campaign_subject (asunto) no lo tienen todos los sellers
      sb(T('email_marketing'),'*','date',pFrom,E_cur),
      // facturación diaria propia (sellers sin Tiendanube con planilla de ventas): si la tabla falta da 404 y se ignora
      sb(T('facturacion'),'date,venta_real,pedidos','date',pFrom,E_cur)
    ]);
    // historias (tabla aparte) como posteos tipo STORY: entran al filtro "Historias" de Social
    const ig=igPosts.concat(igSt.map(s=>({...s,media_product_type:'STORY',saved:0,likes:0,comments:0,follows_from_post:s.follows})));
    // store = revenue (purchase_revenue + add_to_carts) por fecha; si una fecha
    // no tiene revenue cargado (ETL parcial del día en curso), se usa GA4 total_revenue.
    const revByDate={}; rev.forEach(r=>{revByDate[r.date]=(revByDate[r.date]||0)+(parseFloat(r.purchase_revenue)||0);});
    const goodRev=new Set(Object.keys(revByDate).filter(d=>revByDate[d]>0));
    const mapGa4=g=>({date:g.date,source_medium:g.source_medium,purchase_revenue:g.total_revenue,transactions:g.transactions,sessions:g.sessions,total_users:g.total_users,add_to_carts:null});
    const store=rev.filter(r=>goodRev.has(r.date)).concat(ga4.filter(g=>!goodRev.has(g.date)).map(mapGa4));
    const tnPaid=tn.filter(o=>TN_STATUS.includes((o.order_payment_status||'').toLowerCase()));
    const FN_EV=['session_start','view_item','add_to_cart','begin_checkout','purchase'];
    DATA={store,tn:tnPaid,meta,google,ma,mlo:mlo.filter(o=>o.order_payment_status==='approved'),ig,igacc,ins:ins.filter(r=>r.semana),   // insights sin semana: no entran al Sprint Review
      gev:gev.filter(e=>FN_EV.includes(e.event_name)),gitems,em};
    DATA._win={S_cur,E_cur,pFrom,pTo,fi,ff,endData,today};
    // facturación real de la tienda (Tiendanube) si hay datos en la ventana del evento; si no, atribución GA4/revenue
    // filas con venta cargada (la planilla trae el mes entero con venta_real vacía en los días por venir)
    DATA.fc = fc.filter(r=>r.venta_real!=null&&r.venta_real!=='');
    DATA._hasFact = DATA.fc.length>0;
    DATA._lastFact = DATA.fc.map(r=>r.date).sort().slice(-1)[0]||'';
    DATA._hasTN = tnPaid.some(o=>{const d=(o.date||'').slice(0,10);return d>=S_cur&&d<=E_cur;});

    // disponibilidad de secciones
    HAS.google = google.length>0;   // sin filas de Google en la ventana: se oculta todo lo de Google (no se muestra en 0)
    HAS.meli = DATA.mlo.length>0 || ma.length>0;
    HAS.social = ig.length>0 || igacc.length>0;
    HAS.sprint = DATA.ins.length>0;
    HAS.email = inWin(em,'date',S_cur,E_cur).length>0;   // sólo si hubo envíos durante el evento
    HAS.emailInsights = DATA.ins.some(i=>/mail/i.test(i.area||''));
    HAS.paidInsights = DATA.ins.some(i=>/paid/i.test(i.area||''));
    HAS.consulInsights = DATA.ins.some(i=>/consul/i.test(i.area||''));

    buildDays(); buildCtx(); buildRitmo();
    LASTTS = maxDataTs();
    renderNav(); render();
  }catch(e){console.error(e);document.getElementById('content').innerHTML='<div class="empty"><div class="ei">⚠️</div><h4>Error cargando datos</h4><p>'+e.message+'</p></div>';}
}

function between(d,a,b){return d>=a&&d<=b;}
function inWin(rows,col,a,b){return rows.filter(r=>{const d=(r[col]||'').slice(0,10);return d>=a&&d<=b;});}

function buildDays(){
  const {fi,ff,today}=DATA._win; DAYS=[];
  const total=dayDiff(fi,ff)+1;
  for(let i=0;i<total;i++){const d=addDays(fi,i);const dk=iso(d);
    const diff=dayDiff(today,d);
    const avail=diff<0?'full':diff===0?'today':'future';
    DAYS.push({k:dk,dow:DOW[d.getDay()],dm:String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'),avail});
  }
}

/* ===== head de un set de filas (una fecha o todo el período) ===== */
function headFor(a,b){
  const st=inWin(DATA.store,'date',a,b), mt=inWin(DATA.meta,'date',a,b), gg=inWin(DATA.google,'date',a,b);
  const ma=inWin(DATA.ma,'fecha',a,b), mlo=inWin(DATA.mlo,'order_date_created',a,b), ig=inWin(DATA.ig,'date_published',a,b), iga=inWin(DATA.igacc,'fecha',a,b);
  // tienda: facturación real Tiendanube si hay; si no, atribución GA4/revenue
  const tn=inWin(DATA.tn,'date',a,b);
  const useTN=DATA._hasTN;
  const factTN=S(tn,x=>x.order_total_paid), ordTN=tn.length;
  const paidOnly=GA4_PAID_ONLY&&!useTN, stF=paidOnly?st.filter(esPaid):st;   // fact/órdenes/conversión: sólo paid (sesiones y fuentes: todo el sitio)
  const factStore=S(stF,x=>x.purchase_revenue), ordStore=S(stF,x=>x.transactions);
  const fc=inWin(DATA.fc||[],'date',a,b), useFact=!useTN&&DATA._hasFact, factNone=useFact&&!fc.length;
  const fact=useTN?factTN:useFact?S(fc,x=>x.venta_real):factStore, ord=useTN?ordTN:useFact?S(fc,x=>x.pedidos):ordStore,
        factSrc=useTN?'Tiendanube':useFact?'Ventas':(paidOnly?'GA4 paid':'GA4');
  const ses=S(st,x=>x.sessions), usr=S(st,x=>x.total_users), atc=S(st,x=>x.add_to_carts), sesF=S(stF,x=>x.sessions);
  // meta
  const invMeta=S(mt,x=>x.amount_spent), factMeta=S(mt,x=>x.purchases_conv_value), compMeta=S(mt,x=>x.website_purchases),
        imprMeta=S(mt,x=>x.impressions), lpvMeta=S(mt,x=>x.landing_page_views), v3=S(mt,x=>x.video_view_3s),
        ctrMw=imprMeta?S(mt,x=>ctrOf(x)*(parseFloat(x.impressions)||0))/imprMeta:0,
        freqMw=S(mt,x=>x.reach)?S(mt,x=>(parseFloat(x.frequency)||0)*(parseFloat(x.reach)||0))/S(mt,x=>x.reach):0;
  // google
  const invGoogle=S(gg,x=>x.cost), imprG=S(gg,x=>x.impressions);
  let gCl=S(gg,x=>x.clicks); if(!gCl)gCl=gg.reduce((s,x)=>{const c=+x.cost||0,a=+x.avg_cpc||0;return s+(a?c/a:0);},0);
  const ctrGw=imprG?gCl/imprG*100:0;  // google ctr col viene como fracción; lo derivamos de clics/impresiones
  // IS ponderado sólo sobre filas que lo traen; Detrics lo manda como fracción (0–1) → se pasa a %
  const isV=x=>{const v=parseFloat(x.search_impression_share);return v<=1?v*100:v;}, ggIS=gg.filter(x=>isFinite(parseFloat(x.search_impression_share))), imprIS=S(ggIS,x=>x.impressions);
  const isGw=imprIS?S(ggIS,x=>isV(x)*(parseFloat(x.impressions)||0))/imprIS:0;
  // facturación atribuida por canal (desde store, por source_medium)
  const gcpc=st.filter(x=>/google\s*\/\s*cpc/i.test(x.source_medium||''));
  const factGoogle=S(gcpc,x=>x.purchase_revenue), ordGoogle=S(gcpc,x=>x.transactions);
  // mercado libre
  const meliFact=S(mlo,x=>x.order_total_amount), meliOrd=mlo.length,
        meliInvAds=S(ma,x=>x.cost), meliFactAds=S(ma,x=>x.total_amount), meliImpr=S(ma,x=>x.impressions), meliClk=S(ma,x=>x.clicks);
  // social
  const alc=S(ig,x=>x.reach)||S(iga,x=>x.account_reach), inter=S(ig,x=>x.total_interactions)||S(iga,x=>x.account_total_interactions),
        saved=S(ig,x=>x.saved), shares=S(ig,x=>x.shares), follows=S(ig,x=>x.follows_from_post), nposts=ig.length;
  // funnel GA4: sesiones que dispararon cada evento de ecommerce
  const ge=inWin(DATA.gev||[],'date',a,b), evS=n=>S(ge.filter(x=>x.event_name===n),x=>x.sessions);
  const fnSes=evS('session_start'), fnView=evS('view_item'), fnAtc=evS('add_to_cart'), fnChk=evS('begin_checkout'), fnBuy=evS('purchase');
  // productos GA4: GA4 reporta por variante 'NOMBRE (COLOR, TALLE)'; se agrupa por producto
  const itBy={}; inWin(DATA.gitems||[],'date',a,b).forEach(x=>{const k=(x.item_name||'').trim().replace(/\s*\([^()]*\)$/,'')||'(sin nombre)';const o=itBy[k]||(itBy[k]={n:k,v:0,c:0,p:0,r:0});
    o.v+=+x.items_viewed||0;o.c+=+x.items_added_to_cart||0;o.p+=+x.items_purchased||0;o.r+=+x.item_revenue||0;});
  const items=Object.values(itBy).filter(o=>o.v||o.p);
  // email: tasas recalculadas desde los conteos (open/CTR sobre entregados, CTOR sobre aperturas, rebote sobre enviados)
  const em=inWin(DATA.em||[],'date',a,b), mSent=S(em,x=>x.sent), mDel=S(em,x=>x.delivered), mOpen=S(em,x=>x.opened), mClk=S(em,x=>x.clicked);
  const mailFact=S(em,x=>x.conversions_amount), mailOrd=S(em,x=>x.conversions), mailEnv=em.length;
  return {
    fact,ord,factSrc,factNone,ticket:ord?fact/ord:0,ses,usr,atc,cvr:sesF?ord/sesF*100:0,
    invMeta,factMeta,cpaMeta:compMeta?invMeta/compMeta:0,acosMeta:factMeta?invMeta/factMeta*100:0,
    cpmMeta:imprMeta?invMeta/imprMeta*1000:0,ctrM:ctrMw,freqM:freqMw,compMeta,imprMeta,lpvMeta,
    hookM:imprMeta?v3/imprMeta*100:0,v3Ok:mt.some(x=>x.video_view_3s!=null),cvM:lpvMeta?invMeta/lpvMeta:0,crM:lpvMeta?compMeta/lpvMeta*100:0,
    invGoogle,factGoogle,ordGoogle,cpaGoogle:ordGoogle?invGoogle/ordGoogle:0,acosGoogle:factGoogle?invGoogle/factGoogle*100:0,
    cpcGoogle:gCl?invGoogle/gCl:0,imprG,ctrG:ctrGw,isG:isGw,
    inv:invMeta+invGoogle,acos:fact?(invMeta+invGoogle)/fact*100:0,
    meliFact,meliOrd,meliInvAds,meliFactAds,meliRoas:meliInvAds?meliFactAds/meliInvAds:0,meliAcos:meliFactAds?meliInvAds/meliFactAds*100:0,meliImpr,meliClk,
    alc,inter,er:alc?inter/alc*100:0,saved,shares,follows,nposts,
    fnSes,fnView,fnAtc,fnChk,fnBuy,_items:items,
    mailFact,mailOrd,mailEnv,mailSent:mSent,mailDel:mDel,mailOr:mDel?mOpen/mDel*100:0,mailCtr:mDel?mClk/mDel*100:0,mailCtor:mOpen?mClk/mOpen*100:0,
    mailBounce:mSent?S(em,x=>x.bounced)/mSent*100:0,mailUnsub:mDel?S(em,x=>x.unsubscribed)/mDel*100:0,_rowsEm:em,
    _rowsMeta:mt,_rowsGoogle:gg,_rowsMa:ma,_rowsIg:ig,_store:st
  };
}

function buildCtx(){
  const {S_cur,E_cur,pFrom,pTo}=DATA._win;
  const all=headFor(S_cur,E_cur), prev=headFor(pFrom,pTo);
  CTX={all:{head:all,prev:prev,label:'Acumulado del evento'}};
  DAYS.forEach(d=>{ if(d.avail!=='future'){ CTX[d.k]={head:headFor(d.k,d.k),label:d.dow+' '+d.dm}; } });
}
function buildRitmo(){
  const {fi,ff,today}=DATA._win;
  const total=dayDiff(fi,ff)+1;
  const fullDone=Math.min(Math.max(dayDiff(fi,today),0),total);           // días completos antes de hoy
  const todayFrac=(today>=fi&&today<=ff)?(today.getHours()+today.getMinutes()/60)/24:0;
  RITMO=Math.min((fullDone+todayFrac)/total,1);
}
function maxDataTs(){
  const ds=DATA.store.map(x=>x.date).filter(Boolean);
  const mx=ds.sort().slice(-1)[0]||'';
  return mx;
}

/* ============ NAV / DAY FILTER ============ */
const TABS_ALL=[['overview','Overview','tienda:true'],['tienda','Tienda'],['paid','Paid Media'],['email','Email Mkt'],['meli','Mercado Libre'],['social','Social'],['sprint','Sprint Review']];
const TITLES={overview:['Resumen general','OVER<span>VIEW</span>'],tienda:['Comportamiento de tienda','TIEN<span>DA</span>'],paid:['Pauta','PAID <span>MEDIA</span>'],email:['Email marketing','EMAIL <span>MKT</span>'],meli:['Mercado Libre','MERCADO <span>LIBRE</span>'],social:['Redes sociales','SOCIAL <span>MEDIA</span>'],sprint:['Sprint review','SPRINT <span>REVIEW</span>']};
function visibleTabs(){
  return TABS_ALL.filter(t=>{
    if(t[0]==='meli')return HAS.meli;
    if(t[0]==='email')return HAS.email;
    if(t[0]==='social')return HAS.social;
    if(t[0]==='sprint')return HAS.sprint;
    return true;
  });
}
function renderNav(){
  document.getElementById('tabbar').innerHTML=visibleTabs().map(t=>`<button class="tab" data-tab="${t[0]}">${t[1]}</button>`).join('');
  const core=DAYS.map(d=>{const fut=d.avail==='future'?' future':'';const td=d.avail==='today'?' today':'';return `<button class="daypill${fut}${td}" data-day="${d.k}">${d.dow} ${d.dm}</button>`;}).join('');
  document.getElementById('dayfilter').innerHTML=
    `<span class="df-lbl">Día</span>`+
    `<button class="daypill" data-day="all">Todo el evento</button>`+
    `<div class="df-div"></div>`+
    `<div class="df-grp">${core}</div>`;
}

/* ============ DAY STATE ============ */
function dayState(){
  if(state.day==='all') return {...CTX.all.head, deltas:deltasAll(), avail:true, dayLabel:'Todo el evento', k:'all'};
  const d=DAYS.find(x=>x.k===state.day);
  if(!d) return {...CTX.all.head, deltas:deltasAll(), avail:true, dayLabel:'Todo el evento', k:'all'};
  if(d.avail==='future') return {avail:false, future:true, dayLabel:`${d.dow} ${d.dm}`, dm:d.dm, dow:d.dow};
  const c=CTX[state.day]; return {...c.head, deltas:{}, avail:true, today:d.avail==='today', dayLabel:`${d.dow} ${d.dm}`, k:state.day};
}
function deltasAll(){const a=CTX.all.head,p=CTX.all.prev;const r=(c,pv)=>(pv?((c-pv)/pv*100):null);
  return {fact:r(a.fact,p.fact),ord:r(a.ord,p.ord),ticket:r(a.ticket,p.ticket),cvr:r(a.cvr,p.cvr),ses:r(a.ses,p.ses),usr:r(a.usr,p.usr)};}

/* ============ RENDER HEAD ============ */
function head(){
  const D=dayState();
  document.getElementById('eyebrow').textContent=TITLES[state.tab][0]+' · '+D.dayLabel;
  document.getElementById('ptitle').innerHTML=TITLES[state.tab][1];
  const nombreCliente=titleCase(CLIENTE_KEY);
  const periodo=state.day==='all'?`${fmtD(DATA._win.S_cur)} – ${fmtD(DATA._win.E_cur)}`:D.dayLabel;
  document.getElementById('pctx').innerHTML=`<b>${nombreCliente}</b> · ${CFG.nombre} · ${D.future?('día aún no transcurrido · comienza el '+D.dm):periodo} · vs. período anterior equivalente`;
  document.getElementById('upd').innerHTML=`<i></i>Último dato cargado: <b>${fmtD(LASTTS)}</b>${DATA._hasFact?` · ventas hasta <b>${fmtD(DATA._lastFact)}</b>`:''} &nbsp;·&nbsp; datos reales desde Supabase`;
}
function fmtD(s){if(!s)return '—';const d=parseISO(s.slice(0,10));return d.getDate()+'/'+(d.getMonth()+1);}

/* ============ RENDER ============ */
function render(){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===state.tab));
  document.querySelectorAll('.daypill').forEach(b=>b.classList.toggle('on',b.dataset.day===state.day));
  if(!visibleTabs().some(t=>t[0]===state.tab))state.tab='overview';
  head();
  const D=dayState();
  const el=document.getElementById('content');
  if(D.future){el.innerHTML=emptyTab(D);return;}
  el.innerHTML=({overview:ovTab,tienda:tiTab,paid:paTab,email:emTab,meli:coTab,social:soTab,sprint:spTab})[state.tab](D);
  drawCharts(D);
}
function emptyTab(D){return `<div class="empty"><div class="ei">🕓</div><h4>${D.dow} ${D.dm} — este día todavía no transcurrió</h4>
  <p>Los datos de este día van a aparecer cuando arranque el <b style="color:var(--ke-orange)">${D.dm}</b>. Mientras tanto podés ver el acumulado en <b style="color:var(--ke-orange)">Todo el evento</b> o los días ya corridos.</p></div>`;}

function kc(l,v,s,or){return `<div class="kc"><div class="kl">${l}</div><div class="kv ${or?'or':''}">${v}</div><div class="ks">${s||''}</div></div>`;}
function secH(t,pill,logo){return `<div class="sec"><div class="l"></div><span class="t">${t}</span>${pill?`<span class="pill">${pill}</span>`:''}${logo?`<img class="srclogo${logo.cls||''}" src="${logo.src}" alt="${logo.alt}"${logo.st?` style="${logo.st}"`:''}>`:''}</div>`;}

/* ---- objetivo row ---- */
function objRow(n,cur,obj,fmt,budget,col){
  if(!obj)return '';
  const av=cur/obj*100, ideal=RITMO*100, ok=!budget&&av>=ideal;
  return `<div class="objc"><div class="oh"><span class="on">${n}</span><span class="op ${ok?'ok':''}"${col?` style="color:${col}"`:''}>${nf(av,0)}%</span></div>
  <div class="track"><div class="fill" style="width:${Math.min(100,av)}%${col?`;background:${col}`:''}"></div><div class="ideal" style="left:${Math.min(100,ideal)}%"></div></div>
  <div class="od"><span><b>${fmt(cur)}</b> de ${fmt(obj)}</span><span>ritmo ideal ${nf(ideal,0)}%</span></div></div>`;
}

/* ---- OVERVIEW ---- */
function ovTab(D){
  const h=D,d=D.deltas||{};
  const roas=h.inv?h.fact/h.inv:0;
  const objAll=state.day==='all';
  return `
  <div class="bigstat"><div><div class="bl">ACOS general del evento</div><div class="bv">${FX(h,pc(h.acos))}</div></div>
    <div class="bd">Inversión total <b style="color:var(--ke-text)">${M(h.inv)}</b> · ${isPaidSrc(h)?'facturación atribuida a pauta (GA4)':'facturación'} <b style="color:var(--ke-text)">${FX(h,M(h.fact))}</b> · ROAS ${FX(h,nf(roas,1)+'x')}${OBJ.acosLim?` · límite objetivo ${pc(OBJ.acosLim)}`:''}.</div></div>
  ${isPaidSrc(h)?`<div class="note"><div class="ni">i</div><p>${titleCase(CLIENTE_KEY)} no tiene Tiendanube: la <strong>facturación</strong>, las <strong>órdenes</strong> y la <strong>conversión</strong> son las que <strong>GA4 atribuye a pauta</strong> (google / cpc + ig · fb · an · th / paid), con el mismo criterio que el dashboard común. No es el total de la tienda ni coincide con el L10. GA4 carga por día: no hay desglose por hora.</p></div>`:''}
  ${h.factSrc==='Ventas'?`<div class="note"><div class="ni">i</div><p>La <strong>facturación</strong> y las <strong>órdenes</strong> salen de la <strong>planilla de ventas diaria</strong> de ${titleCase(CLIENTE_KEY)}, la misma que usa el dashboard común. Es un dato por día: no hay desglose por hora y se carga con uno o dos días de demora. Los días todavía sin cargar se muestran en “—”.</p></div>`:''}
  ${objAll?`${secH('Objetivos del evento · avance','Ritmo ideal '+nf(RITMO*100,0)+'%')}
  <div class="obj">
    ${objRow(factLbl(h),h.fact,OBJ.fact,M)}
    ${objRow(ordLbl(h),h.ord,OBJ.ord,v=>nf(v))}
    ${objRow('Inversión Meta',h.invMeta,OBJ.invMeta,M,true,'var(--ke-blue)')}
    ${HAS.google?objRow('Inversión Google',h.invGoogle,OBJ.invGoogle,M,true,'var(--ke-green)'):''}
  </div>`:''}
  ${secH('Tienda · resumen',(h.factSrc==='Tiendanube'||h.factSrc==='Ventas')?'Facturación real':factPill(h,'Facturación GA4'),h.factSrc==='Tiendanube'?{src:L.tiendanube,alt:'Tiendanube'}:null)}
  <div class="kgrid kg4">
    ${kc(factLbl(h),FX(h,M(h.fact)),objAll?dpct(h.fact,CTX.all.prev.fact):(h.factSrc==='Ventas'?'planilla de ventas':h.factSrc),1)}
    ${kc('Ticket promedio',FX(h,M(h.ticket)),objAll?dpct(h.ticket,CTX.all.prev.ticket):'nominal')}
    ${kc(isPaidSrc(h)?'Tasa de conversión (paid)':'Tasa de conversión',FX(h,pc(h.cvr,2)),objAll?dpct(h.cvr,CTX.all.prev.cvr):(isPaidSrc(h)?'órdenes / sesiones paid':'órdenes / sesiones'))}
    ${kc(ordLbl(h),FX(h,nf(h.ord)),objAll?dpct(h.ord,CTX.all.prev.ord):'transacciones')}
  </div>
  ${secH('Tendencia del evento · facturación por día',isPaidSrc(h)?'Por día · atribuida a pauta (GA4)':'Por día')}
  <div class="chart"><div class="ch"><span class="ct">${isPaidSrc(h)?'Facturación atribuida a pauta (GA4) por día':'Facturación por día'}</span>
    <div class="legend"><span><i style="background:#ff700a"></i>Facturación</span><span><i style="background:rgba(230,230,230,.14);border:1px solid rgba(230,230,230,.3)"></i>Objetivo diario</span></div></div>
    <div id="daily"></div></div>
  ${secH('Distribución de sesiones por fuente',nf(h.ses)+' sesiones · GA4')}
  ${srcBars(h)}`;
}

/* ---- TIENDA ---- */
function tiTab(D){
  const h=D;
  const useEv=h.fnSes>0;
  const steps=useEv?[['Sesiones',h.fnSes],['Vieron un producto',h.fnView],['Agregaron al carrito',h.fnAtc],['Iniciaron el checkout',h.fnChk],['Compraron',h.fnBuy]]
                   :[['Sesiones',h.ses],['Agregaron al carrito',h.atc],['Compraron',h.ord]];
  const base=(useEv?h.fnSes:h.ses)||1;
  const funnelHtml=steps.map((f,i)=>{const w=f[1]/base*100;const drop=i&&steps[i-1][1]?(100-f[1]/steps[i-1][1]*100):0;
    return `<div class="fstep"><div class="fn">${f[0]}<small>${pc(f[1]/base*100,i?1:0)} de las sesiones</small></div>
    <div class="fbar"><i style="width:${Math.max(w,3)}%"></i></div>
    <div class="fr"><b>${nf(f[1])}</b>${i?`<span class="drop">▼ ${nf(drop,0)}% vs paso anterior</span>`:'<span>base del funnel</span>'}</div></div>`;}).join('');
  const objAll=state.day==='all';
  const atcOk=useEv||h.atc>0;
  const its=(h._items||[]).slice().sort((x,y)=>state.itemsSort==='p'?(y.p-x.p)||(y.r-x.r):(y.v-x.v)).slice(0,10);
  const itRows=its.map((o,i)=>`<tr class="${i===0?'top':''}"><td class="rk">${i+1}</td><td class="nm">${esc(o.n)}</td>
    <td class="n">${nf(o.v)}</td><td class="n">${nf(o.c)}</td><td class="n">${nf(o.p)}</td><td class="n hi">${o.r?M(o.r):'—'}</td></tr>`).join('');
  return `
  <div class="bigstat"><div><div class="bl">ACOS general del evento</div><div class="bv">${FX(h,pc(h.acos))}</div></div>
    <div class="bd">Inversión total <b style="color:var(--ke-text)">${M(h.inv)}</b> · ${isPaidSrc(h)?'facturación atribuida a pauta (GA4)':'facturación'} <b style="color:var(--ke-text)">${FX(h,M(h.fact))}</b> · ROAS ${FX(h,nf(h.inv?h.fact/h.inv:0,1)+'x')}.</div></div>
  ${secH('Comportamiento de la tienda · KPIs',(h.factSrc==='Tiendanube'||h.factSrc==='Ventas')?'Facturación real':factPill(h,'Facturación GA4 / revenue'),h.factSrc==='Tiendanube'?{src:L.tiendanube,alt:'Tiendanube'}:null)}
  <div class="kgrid kg4">
    ${kc(factLbl(h),FX(h,M(h.fact)),objAll?dpct(h.fact,CTX.all.prev.fact):'',1)}
    ${kc(ordLbl(h),FX(h,nf(h.ord)),objAll?dpct(h.ord,CTX.all.prev.ord):'')}
    ${kc('Sesiones',nf(h.ses),'Usuarios '+nf(h.usr))}
    ${kc(isPaidSrc(h)?'Conversión (paid)':'Conversión',FX(h,pc(h.cvr,2)),objAll?dpct(h.cvr,CTX.all.prev.cvr):'')}
  </div>
  ${atcOk?`${secH('Funnel de la tienda · de la sesión a la compra',useEv?'GA4 · sesiones con cada evento':'GA4 / revenue')}
  <div class="blk" style="padding:20px 22px"><div class="funnel">${funnelHtml}</div></div>`:''}
  ${its.length?`${secH('Productos más vistos','GA4 · ítems')}
  <div class="postsel"><span>Ordenar por</span>${[['v','Vistas'],['p','Compras']].map(x=>`<button class="pbtn ${state.itemsSort===x[0]?'on':''}" data-isort="${x[0]}">${x[1]}</button>`).join('')}</div>
  <div class="blk"><div class="blkh"><span class="blkt">Top 10 productos por ${state.itemsSort==='p'?'compras':'vistas'}</span><span class="blkt">GA4</span></div>
    <div class="scroll"><table class="t"><thead><tr><th>#</th><th>Producto</th><th class="n">Vistas</th><th class="n">Al carrito</th><th class="n">Compras</th><th class="n">Facturación</th></tr></thead>
    <tbody>${itRows}</tbody></table></div></div>`:''}
  ${secH('Distribución de sesiones por fuente',nf(h.ses)+' sesiones · GA4')}
  ${srcBars(h)}`;
}

/* ---- PAID ---- */
function paTab(D){
  const h=D;
  const objAll=state.day==='all';
  const mt=[['Monto invertido',M(h.invMeta)],['Costo por compra',M(h.cpaMeta)],['Facturación (atrib.)',M(h.factMeta)],['ACOS Meta',pc(h.acosMeta)],['CPM',M(h.cpmMeta)]];
  const mt2=[['CTR',pc(h.ctrM,2)],['Hook rate',h.v3Ok?pc(h.hookM):'—'],['Frecuencia',nf(h.freqM,1)],['Costo/visita',M(h.cvM)],['CR (conv.)',pc(h.crM,2)]];
  const gg=[['Monto invertido',M(h.invGoogle)],['Costo por compra',h.ordGoogle?M(h.cpaGoogle):'—'],['Facturación (atrib.)',h.factGoogle?M(h.factGoogle):'—'],['ACOS Google',h.factGoogle?pc(h.acosGoogle):'—'],['CPC',M(h.cpcGoogle)]];
  const gg2=[['Impresiones',nf(h.imprG)],['CTR',pc(h.ctrG,2)],['Impression share',h.isG?pc(h.isG,0):'—']];
  // ADS: por campaña (agrupadas)
  const camps={};
  (h._rowsMeta||[]).forEach(r=>{const k=r.campaign_name||'(sin nombre)';const c=camps[k]||(camps[k]={n:k,impr:0,sp:0,val:0,comp:0,ctrw:0});
    c.impr+=+r.impressions||0;c.sp+=+r.amount_spent||0;c.val+=+r.purchases_conv_value||0;c.comp+=+r.website_purchases||0;c.ctrw+=ctrOf(r)*(+r.impressions||0);});
  const adArr=Object.values(camps).map(c=>({...c,ctr:c.impr?c.ctrw/c.impr:0,acos:c.val?c.sp/c.val*100:0})).sort((a,b)=>b.val-a.val).slice(0,6);
  const adHtml=adArr.map((a,i)=>`<div class="ad ${i===0?'top':''}"><div class="adh"><div class="adn">${i+1}</div>
    <div class="adt"><b>${a.n}</b><span>Meta Ads · campaña</span></div>${i===0?'<span class="chip c-acc">Top por valor de compras</span>':''}</div>
    <div class="admetrics">
      <div class="adm"><div class="ml">Impresiones</div><div class="mv">${nf(a.impr)}</div></div>
      <div class="adm"><div class="ml">CTR</div><div class="mv">${pc(a.ctr,2)}</div></div>
      <div class="adm"><div class="ml">Compras</div><div class="mv">${nf(a.comp)}</div></div>
      <div class="adm"><div class="ml">Valor compras</div><div class="mv hi">${M(a.val)}</div></div>
      <div class="adm"><div class="ml">ACOS</div><div class="mv">${a.val?pc(a.acos):'—'}</div></div>
    </div></div>`).join('');
  return `
  <div class="bigstat"><div><div class="bl">ACOS general · Paid</div><div class="bv">${pc(h.fact?(h.invMeta+h.invGoogle)/h.fact*100:0)}</div></div>
    <div class="bd">${HAS.google?'Meta + Google':'Meta'}. Inversión <b style="color:var(--ke-text)">${M(h.invMeta+h.invGoogle)}</b> · facturación atribuida <b style="color:var(--ke-text)">${M(h.factMeta+h.factGoogle)}</b> · ROAS ${nf((h.invMeta+h.invGoogle)?(h.factMeta+h.factGoogle)/(h.invMeta+h.invGoogle):0,1)}x.</div></div>
  ${objAll&&(OBJ.invMeta||(HAS.google&&OBJ.invGoogle))?`${secH('Avance de inversión','Presupuesto consumido vs. objetivo')}
  <div class="obj">${objRow('Inversión Meta',h.invMeta,OBJ.invMeta,M,true,'var(--ke-blue)')}${HAS.google?objRow('Inversión Google',h.invGoogle,OBJ.invGoogle,M,true,'var(--ke-green)'):''}</div>`:''}
  ${secH('Inversión · Meta Ads','',{src:L.meta,alt:'Meta',st:'height:15px'})}
  <div class="kgrid kg5">${mt.map(x=>kc(x[0],x[1],'')).join('')}</div>
  <div class="kgrid kg5">${mt2.map(x=>kc(x[0],x[1],'')).join('')}</div>
  ${HAS.google?`${secH('Inversión · Google Ads','',{src:L.google,alt:'Google Ads',st:'height:18px'})}
  <div class="kgrid kg5">${gg.map(x=>kc(x[0],x[1],'')).join('')}</div>
  <div class="kgrid kg3">${gg2.map(x=>kc(x[0],x[1],'')).join('')}</div>`:''}
  ${adArr.length?`${secH('Mejores campañas · Meta Ads','Ranking por valor de compras')}
  <div class="ads">${adHtml}</div>`:''}
  ${HAS.paidInsights?areaSprint('paid','Paid Media'):''}`;
}

/* ---- MERCADO LIBRE ---- */
function coTab(D){
  const h=D;
  const maRows=(h._rowsMa||[]);
  const camps={};
  maRows.forEach(r=>{const k=r.campaign_name||'(campaña)';const c=camps[k]||(camps[k]={n:k,cost:0,amt:0,impr:0,clk:0,u:0});
    c.cost+=+r.cost||0;c.amt+=+r.total_amount||0;c.impr+=+r.impressions||0;c.clk+=+r.clicks||0;c.u+=+r.units_quantity||0;});
  const campArr=Object.values(camps).map(c=>({...c,acos:c.amt?c.cost/c.amt*100:0,roas:c.cost?c.amt/c.cost:0})).sort((a,b)=>b.amt-a.amt);
  const campRows=campArr.map((c,i)=>`<tr class="${i===0?'top':''}"><td class="rk">${i+1}</td><td class="nm">${c.n}</td>
    <td class="n">${nf(c.impr)}</td><td class="n">${nf(c.clk)}</td><td class="n">${nf(c.u)}</td><td class="n">${c.amt?pc(c.acos):'—'}</td><td class="n hi">${M(c.amt)}</td></tr>`).join('');
  return `
  <div class="bigstat"><div><div class="bl">Facturación Mercado Libre</div><div class="bv">${M(h.meliFact)}</div></div>
    <div class="bd">${nf(h.meliOrd)} órdenes aprobadas · publicidad ${M(h.meliInvAds)} · ACOS Ads ${h.meliFactAds?pc(h.meliAcos):'—'} · ROAS Ads ${nf(h.meliRoas,1)}x.</div></div>
  ${secH('Mercado Ads · performance','',{cls:' ml',src:L.mercadoAds,alt:'Mercado Ads'})}
  <div class="kgrid kg4">
    ${kc('Facturación ML',M(h.meliFact),nf(h.meliOrd)+' órdenes',1)}
    ${kc('Inversión Ads',M(h.meliInvAds),nf(h.meliClk)+' clicks')}
    ${kc('Fact. atribuida Ads',M(h.meliFactAds),'ROAS '+nf(h.meliRoas,1)+'x')}
    ${kc('ACOS Ads',h.meliFactAds?pc(h.meliAcos):'—','Publicidad / atribuido')}
  </div>
  ${campArr.length?`${secH('Campañas de Mercado Ads','Por facturación atribuida',{cls:' ml',src:L.mercadoLibre,alt:'Mercado Libre'})}
  <div class="blk"><div class="blkh"><span class="blkt">Campañas por facturación atribuida</span><span class="blkt">Mercado Ads</span></div>
    <div class="scroll"><table class="t"><thead><tr><th>#</th><th>Campaña</th><th class="n">Impr.</th><th class="n">Clicks</th><th class="n">Unidades</th><th class="n">ACOS</th><th class="n">Fact. atrib.</th></tr></thead>
    <tbody>${campRows}</tbody></table></div></div>`:''}
  ${HAS.consulInsights?areaSprint('consul','Consultoría'):''}`;
}

/* ---- EMAIL ---- */
function emTab(D){
  const h=D;
  const mpct=h.fact?h.mailFact/h.fact*100:0;
  const camps=(h._rowsEm||[]).slice().sort((a,b)=>(+b.conversions_amount||0)-(+a.conversions_amount||0));
  const rows=camps.map((c,i)=>{const del=+c.delivered||0;const subj=String(c.campaign_subject||'').replace(/^asunto:\s*/i,'');
    return `<tr class="${i===0?'top':''}"><td class="rk">${i+1}</td><td class="nm">${esc(c.campaign_name||'(campaña)')}${subj?`<div style="opacity:.6;font-size:11px;margin-top:2px">${esc(subj)}</div>`:''}</td>
    <td class="n">${fmtD(c.date)}</td><td class="n">${nf(c.sent)}</td><td class="n">${del?pc((+c.opened||0)/del*100):'—'}</td><td class="n">${del?pc((+c.clicked||0)/del*100):'—'}</td><td class="n">${nf(c.conversions)}</td><td class="n hi">${M(c.conversions_amount)}</td></tr>`;}).join('');
  return `
  ${secH('Email marketing · Perfit',nf(h.mailEnv)+(h.mailEnv===1?' campaña':' campañas'))}
  <div class="kgrid kg4">
    ${kc('Fact. atribuida',M(h.mailFact),h.fact?pc(mpct)+' de la tienda':'Atribuida por Perfit',1)}
    ${kc('Open rate',pc(h.mailOr),'CTR '+pc(h.mailCtr))}
    ${kc('Campañas enviadas',nf(h.mailEnv),state.day==='all'?'En el evento':'En el día')}
    ${kc('Envíos',nf(h.mailSent),nf(h.mailDel)+' entregados')}
  </div>
  <div class="kgrid kg4">
    ${kc('CTOR',pc(h.mailCtor),'Clicks sobre aperturas')}
    ${kc('Órdenes por email',nf(h.mailOrd),'Atribuidas')}
    ${kc('Desuscriptos',pc(h.mailUnsub,2),'Sobre entregados')}
    ${kc('Rebote',pc(h.mailBounce,2),'Sobre enviados')}
  </div>
  ${camps.length?`${secH('Campañas del evento','Por facturación atribuida')}
  <div class="blk"><div class="blkh"><span class="blkt">Envíos por performance</span><span class="blkt">Perfit</span></div>
    <div class="scroll"><table class="t"><thead><tr><th>#</th><th>Campaña</th><th class="n">Fecha</th><th class="n">Envíos</th><th class="n">Open rate</th><th class="n">CTR</th><th class="n">Órdenes</th><th class="n">Fact. atrib.</th></tr></thead>
    <tbody>${rows}</tbody></table></div></div>`:''}
  ${HAS.emailInsights?areaSprint('email','Email'):''}`;
}

/* ---- SOCIAL ---- */
function soTab(D){
  const h=D;
  const posts=(h._rowsIg||[]).slice().sort((a,b)=>(+b.total_interactions||0)-(+a.total_interactions||0));
  const typeOf=p=>{const t=(p.media_product_type||p.media_type||'').toUpperCase();if(/REEL/.test(t))return 'Reel';if(/STORY/.test(t))return 'Historia';if(/CAROUSEL/.test(t))return 'Carrusel';if(/VIDEO/.test(t))return 'Video';return 'Posteo';};
  const filtered=posts.filter(p=>{const ty=typeOf(p);if(state.postsFilter==='all')return true;if(state.postsFilter==='stories')return ty==='Historia';return ty!=='Historia';});
  const cards=filtered.slice(0,state.postsN).map((p,i)=>{const ty=typeOf(p);const er=p.reach?(+p.total_interactions||0)/(+p.reach||1)*100:0;
    return `<div class="ad ${i===0?'top':''}"><div class="adh"><div class="adn">${i+1}</div>
      <div class="adt"><b>${(p.caption||'Publicación').slice(0,60).replace(/\n/g,' ')||'Publicación'}</b><span>${ty}</span></div>${i===0?'<span class="chip c-acc">Top por interacciones</span>':''}</div>
      <div class="admetrics">
        <div class="adm"><div class="ml">Alcance</div><div class="mv">${nf(p.reach)}</div></div>
        <div class="adm"><div class="ml">Interacciones</div><div class="mv hi">${nf(p.total_interactions)}</div></div>
        <div class="adm"><div class="ml">ER</div><div class="mv">${pc(er)}</div></div>
        <div class="adm"><div class="ml">Guardados</div><div class="mv">${nf(p.saved)}</div></div>
        <div class="adm"><div class="ml">Compartidos</div><div class="mv">${nf(p.shares)}</div></div>
      </div></div>`;}).join('');
  return `
  ${secH('Social Media · comunicación orgánica','Instagram')}
  <div class="kgrid kg4">
    ${kc('Alcance',nf(h.alc),'Acumulado',1)}
    ${kc('Interacciones',nf(h.inter),'ER '+pc(h.er)+' · inter./alcance')}
    ${kc('Guardados',nf(h.saved),'Intención de compra')}
    ${kc('Compartidos',nf(h.shares),'Alcance amplificado')}
  </div>
  ${secH('Contenido publicado','Posteos del período')}
  <div class="kgrid kg4">
    ${kc('Publicaciones',nf(h.nposts),'En el evento',1)}
    ${kc('Nuevos seguidores','+'+nf(h.follows),'Desde posteos')}
    ${kc('Guardados',nf(h.saved),'Total período')}
    ${kc('Compartidos',nf(h.shares),'Total período')}
  </div>
  ${posts.length?`${secH('Mejores posteos','Por interacciones')}
  <div class="postsel"><span>Top</span><button class="pbtn ${state.postsN===5?'on':''}" data-posts="5">5</button><button class="pbtn ${state.postsN===10?'on':''}" data-posts="10">10</button><span style="margin-left:16px">Tipo</span>${[['all','Todos'],['feed','Feed'],['stories','Historias']].map(x=>`<button class="pbtn ${state.postsFilter===x[0]?'on':''}" data-filter="${x[0]}">${x[1]}</button>`).join('')}</div>
  <div class="ads">${cards||'<div class="empty"><p>Sin posteos para este filtro.</p></div>'}</div>`:''}`;
}

/* ---- SPRINT REVIEW (insights de Notion, por semana y área) ---- */
function spTab(D){
  const ins=(DATA.ins||[]).slice().sort((a,b)=>String(b.semana).localeCompare(String(a.semana)));
  // agrupar por semana
  const bySem={};ins.forEach(r=>{(bySem[r.semana||'—']=bySem[r.semana||'—']||[]).push(r);});
  const sems=Object.keys(bySem).sort((a,b)=>String(b).localeCompare(String(a))).slice(0,6);
  const body=sems.map(sem=>{
    const items=bySem[sem].filter(r=>txt(r.estatus)||txt(r.accionable)||txt(r.resumen));
    if(!items.length)return '';
    const cards=items.map(it=>`<div class="ac-item"><span class="area">${it.area||'—'}</span>
      ${txt(it.estatus)?`<div class="ln"><b>Estatus.</b> ${clean(it.estatus)}</div>`:''}
      ${txt(it.accionable)?`<div class="ln"><b>Accionable.</b> ${clean(it.accionable)}</div>`:''}
      ${txt(it.impacto_esperado)?`<div class="ln"><b>Impacto esperado.</b> ${clean(it.impacto_esperado)}</div>`:''}
      ${txt(it.resultado)?`<div class="ln"><b>Resultado.</b> ${clean(it.resultado)}</div>`:''}
      ${(!txt(it.estatus)&&txt(it.resumen))?`<div class="ln">${clean(it.resumen)}</div>`:''}</div>`).join('');
    return `<div class="corte"><div class="corteh"><span class="hh">${fmtSem(sem)}</span><span class="cortet">Semana del ${fmtSem(sem)}</span><span class="chip c-acc" style="margin-left:auto">${items.length} registro${items.length>1?'s':''}</span></div>${cards}</div>`;
  }).join('');
  const intro=`<div class="note"><div class="ni">i</div><p>El <strong>sprint review</strong> resume el estatus, los accionables y el impacto esperado por <strong>área</strong> (Paid Media, Consultoría, Email) a lo largo de las últimas semanas. Se alimenta del tablero de Notion del equipo.</p></div>`;
  return intro+(body||'<div class="empty"><p>Sin registros de sprint review.</p></div>');
}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function txt(s){return s&&String(s).trim().length>0;}
function clean(s){return String(s).trim().replace(/\n{2,}/g,'<br>').replace(/\n/g,' ');}
function fmtSem(s){if(!s)return '—';const d=parseISO(String(s).slice(0,10));if(isNaN(d))return s;return d.getDate()+'/'+(d.getMonth()+1);}

/* ---- area sprint (dentro de paid/meli) ---- */
function areaSprint(key,areaMatch){
  const re=key==='consul'?/consul/i:key==='email'?/mail/i:/paid/i;
  const items=(DATA.ins||[]).filter(r=>re.test(r.area||'')&&(txt(r.estatus)||txt(r.resumen))).sort((a,b)=>String(b.semana).localeCompare(String(a.semana))).slice(0,2);
  if(!items.length)return '';
  return secH('Sprint review del área · últimas semanas','Accionables')+
  `<div class="acc">${items.map(it=>`<div class="accc"><div class="at">● Semana ${fmtSem(it.semana)}</div>
    ${txt(it.estatus)?`<div class="arow"><div class="al">Estatus</div><div class="av">${clean(it.estatus)}</div></div>`:(txt(it.resumen)?`<div class="arow"><div class="al">Resumen</div><div class="av">${clean(it.resumen)}</div></div>`:'')}
    ${txt(it.accionable)?`<div class="arow"><div class="al">Accionable</div><div class="av">${clean(it.accionable)}</div></div>`:''}
    ${txt(it.impacto_esperado)?`<div class="arow"><div class="al">Impacto esperado</div><div class="av">${clean(it.impacto_esperado)}</div></div>`:''}</div>`).join('')}</div>`;
}

/* ---- SRC bars ---- */
function srcBars(h){
  const store=h._store||[];
  const by={};store.forEach(x=>{const k=(x.source_medium||'(n/d)').trim();by[k]=(by[k]||0)+(+x.total_users||0);});
  let arr=Object.entries(by).map(([k,v])=>({k,v})).sort((a,b)=>b.v-a.v);
  const total=arr.reduce((s,x)=>s+x.v,0)||1;
  const top=arr.slice(0,8);
  return `<div class="blk" style="padding:20px 22px"><div class="bars">${top.map((s,i)=>{const col=i===0?'var(--ke-orange)':`rgba(230,230,230,${0.5-i*0.045})`;const p=s.v/total*100;
    return `<div class="brow"><div class="bl"><i style="background:${col}"></i>${s.k}</div>
    <div class="bt"><i style="width:${p}%;background:${col}"></i></div>
    <div class="bv">${pc(p)}<small>${nf(s.v)} usuarios</small></div></div>`;}).join('')}</div></div>`;
}

/* ============ CHARTS ============ */
function drawCharts(D){const dEl=document.getElementById('daily'); if(dEl) drawDaily(dEl);}
function drawDaily(box){
  const days=DAYS.map(d=>d.k);
  const total=days.length||1;
  const objDay=OBJ.fact?OBJ.fact/total:0;
  const real=days.map(dk=>{const c=CTX[dk];return c?c.head.fact:0;});
  const today=iso(DATA._win.today);
  const sel=state.day==='all'?-1:days.indexOf(state.day);
  const W=980,H=250,pad={l:52,r:12,t:14,b:40},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b;
  const max=Math.max(objDay,...real)*1.15||1,bw=iw/total,bar=bw*0.4,y=v=>pad.t+ih-(v/max)*ih;
  let g='';
  for(let i=0;i<=3;i++){const gy=pad.t+ih-(i/3)*ih,val=max*i/3;
    g+=`<line x1="${pad.l}" y1="${gy}" x2="${W-pad.r}" y2="${gy}" stroke="rgba(230,230,230,.07)"/>`;
    g+=`<text x="${pad.l-8}" y="${gy+3}" text-anchor="end" font-size="9" fill="rgba(230,230,230,.38)" font-family="General Sans">${val>=1e6?('$'+(val/1e6).toFixed(1)+'M'):(val>=1e3?('$'+Math.round(val/1e3)+'k'):0)}</text>`;}
  DAYS.forEach((dd,i)=>{const cx=pad.l+bw*i+bw/2;const fut=dd.avail==='future';
    if(sel===i)g+=`<rect x="${cx-bw/2+3}" y="${pad.t}" width="${bw-6}" height="${ih}" rx="4" fill="rgba(255,112,10,.06)"/>`;
    if(objDay)g+=`<rect x="${cx-bar-3}" y="${y(objDay)}" width="${bar}" height="${pad.t+ih-y(objDay)}" rx="2" fill="rgba(230,230,230,.05)" stroke="rgba(230,230,230,.22)" stroke-width="1"/>`;
    const rv=real[i]||0;
    if(rv>0){const partial=dd.k===today;g+=`<rect x="${cx+3}" y="${y(rv)}" width="${bar}" height="${pad.t+ih-y(rv)}" rx="2" fill="#ff700a" opacity="${partial?.78:1}"/>`;
      if(partial)g+=`<rect x="${cx+3}" y="${y(rv)}" width="${bar}" height="3" fill="rgba(255,255,255,.4)"/>`;}
    const hot=(sel===i)||(sel===-1&&dd.avail==='today');
    g+=`<text x="${cx}" y="${H-20}" text-anchor="middle" font-size="10" fill="${hot?'var(--ke-text)':(fut?'rgba(230,230,230,.3)':'rgba(230,230,230,.5)')}" font-weight="${hot?'700':'400'}" font-family="General Sans">${dd.dow}</text>`;
    g+=`<text x="${cx}" y="${H-8}" text-anchor="middle" font-size="9" fill="rgba(230,230,230,.35)" font-family="General Sans">${dd.dm}</text>`;});
  box.innerHTML=`<svg class="svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Facturación por día">${g}</svg>`;
}

/* ============ EVENTOS UI ============ */
document.addEventListener('click',e=>{
  const tb=e.target.closest('.tab'); if(tb){state.tab=tb.dataset.tab;render();window.scrollTo({top:0,behavior:'smooth'});return;}
  const dp=e.target.closest('.daypill'); if(dp){state.day=dp.dataset.day;render();return;}
  const pb=e.target.closest('.pbtn'); if(pb){if(pb.dataset.posts)state.postsN=+pb.dataset.posts;else if(pb.dataset.filter)state.postsFilter=pb.dataset.filter;else if(pb.dataset.isort)state.itemsSort=pb.dataset.isort;render();return;}
});

/* live label */
(function(){const el=document.getElementById('liveTs');if(!el)return;let s=55*60;setInterval(()=>{s=s<=0?3600:s-1;const m=Math.ceil(s/60);el.textContent='en vivo · '+m+' min';},1000);})();

boot();


/* ============ MERCADO LIBRE (pieza reutilizable: demo_cyber/modulo/meli_tab.js) ============
   Fuentes: {prefix}_ml_orders, _mercado_ads (Product Ads), _mercado_ads_display, _ml_items, _ml_cuenta y objetivos_ml.
   Usa del módulo: SUPABASE_URL, HDR, T, CLIENTE_KEY, DATA, DAYS, CTX, state, HAS, S, inWin, iso, fmtD,
   kc, secH, objRow, dpct, M, nf, pc, L.mercadoLibre / L.mercadoAds y areaSprint.
   Facturación = órdenes con pago aprobado (order_total_amount, bruta). No se suma a la de la tienda:
   el Overview la muestra aparte y rotulada.
   Visitas y conversión quedan afuera a propósito: {prefix}_ml_visitas_snapshot no es un acumulado
   (baja de un día a otro) y la resta entre snapshots da conversiones de 30% a más de 100%. */
const ML_OK_PAY='approved';
const ML_OBJ_KEY='cyber-monday-2026';   // objetivos_ml.fecha del evento (mismo criterio que objetivos)

/* paginación con desempate por una clave única: ordenar sólo por fecha con >1000 filas pisa páginas */
async function sbML(table,cols,dateCol,from,to,tie,extra){
  let out=[],off=0;const pg=1000;
  for(;;){
    let url=SUPABASE_URL+'/rest/v1/'+table+'?select='+encodeURIComponent(cols)+'&limit='+pg+'&offset='+off;
    if(dateCol&&from) url+='&'+dateCol+'=gte.'+from+'&'+dateCol+'=lte.'+to;
    if(extra) url+='&'+extra;
    url+='&order='+[dateCol?dateCol+'.asc':'',tie?tie+'.asc':''].filter(Boolean).join(',');
    let r; try{ r=await fetch(url,{headers:HDR}); }catch(e){console.warn('[KE] '+table+' fetch error',e);return out;}
    if(!r.ok){console.warn('[KE] '+table+' '+r.status+' — fuente ignorada');return out;}
    const rows=await r.json(); out=out.concat(rows);
    if(rows.length<pg) break; off+=pg;
  }
  return out;
}
async function sbQ(table,qs){
  try{const r=await fetch(SUPABASE_URL+'/rest/v1/'+table+'?'+qs,{headers:HDR}); if(!r.ok){console.warn('[KE] '+table+' '+r.status);return [];} return await r.json();}
  catch(e){console.warn('[KE] '+table+' fetch error',e);return [];}
}

/* todo lo de Mercado Libre en una tanda; devuelve {ord,ma,disp,top,cuenta,obj} */
async function meliLoad(pFrom,E_cur){
  const tTo=E_cur+'T23:59:59';
  const ITC='item_id,item_title,item_permalink,item_thumbnail,item_status,item_price,item_available_quantity,item_sold_quantity,fecha';
  const last=await sbQ(T('ml_items'),'select=fecha&order=fecha.desc&limit=1');
  const snap=last[0]&&last[0].fecha;
  const itQ=o=>snap?sbQ(T('ml_items'),'select='+ITC+'&fecha=eq.'+snap+'&item_status=eq.active&order='+o+'.desc.nullslast,item_id.asc&limit=10'):Promise.resolve([]);
  const [ord,ma,disp,top,cuenta,obj]=await Promise.all([
    sbML(T('ml_orders'),'order_id,order_date_created,order_status,order_payment_status,order_total_amount,order_total_sale_fee,order_shipping_cost,order_coupon_amount,order_total_quantity','order_date_created',pFrom,tTo,'order_id'),
    sbML(T('mercado_ads'),'fecha,campaign_id,campaign_name,cost,impressions,clicks,total_amount,units_quantity,campaign_acos_target','fecha',pFrom,E_cur,'campaign_id'),
    // Display trae una fila por línea y por día aunque no haya corrido: se piden sólo las que tienen algo
    sbML(T('mercado_ads_display'),'fecha,line_item_id,campaign_name,cost,impressions,clicks,touch_point_direct_amount,touch_point_units_quantity','fecha',pFrom,E_cur,'line_item_id','or=(cost.gt.0,touch_point_direct_amount.gt.0,impressions.gt.0)'),
    itQ('item_sold_quantity'),
    sbQ(T('ml_cuenta'),'select=reputation_level,power_seller_status,fecha&order=fecha.desc&limit=1'),
    sbQ('objetivos_ml','select=cliente,fecha,facturacion,unidades&fecha=eq.'+ML_OBJ_KEY)
  ]);
  const o=obj.find(x=>(x.cliente||'').toLowerCase()===CLIENTE_KEY.toLowerCase());
  return {ord,ma,disp,top,snap,cuenta:cuenta[0]||null,obj:o?{fact:+o.facturacion||0,uni:+o.unidades||0}:null};
}

function meliHead(a,b){
  const X=DATA.mlx||{ord:[],ma:[],disp:[]};
  const ord=inWin(X.ord,'order_date_created',a,b);
  const ok=ord.filter(o=>o.order_payment_status===ML_OK_PAY), canc=ord.filter(o=>o.order_status==='cancelled');
  const gross=S(ok,o=>o.order_total_amount), fee=S(ok,o=>o.order_total_sale_fee), ship=S(ok,o=>o.order_shipping_cost), coup=S(ok,o=>o.order_coupon_amount);
  const n=ok.length, units=S(ok,o=>o.order_total_quantity);
  const pa=inWin(X.ma,'fecha',a,b), di=inWin(X.disp,'fecha',a,b);
  const paInv=S(pa,r=>r.cost), paFact=S(pa,r=>r.total_amount), paClk=S(pa,r=>r.clicks), paImpr=S(pa,r=>r.impressions);
  // Display atribuye por touch point directo (asistencia), no por venta directa: se muestra separado de Product Ads
  const diInv=S(di,r=>r.cost), diFact=S(di,r=>r.touch_point_direct_amount), diImpr=S(di,r=>r.impressions);
  const inv=paInv+diInv, fact=paFact+diFact;
  return {gross,fee,ship,coup,net:gross-fee-ship-coup,n,units,ticket:n?gross/n:0,feePct:gross?fee/gross*100:0,
    canc:canc.length,cancPct:(n+canc.length)?canc.length/(n+canc.length)*100:0,
    paInv,paFact,paClk,paImpr,paAcos:paFact?paInv/paFact*100:0,diInv,diFact,diImpr,diAcos:diFact?diInv/diFact*100:0,
    inv,fact,acos:fact?inv/fact*100:0,roas:inv?fact/inv:0,tacos:gross?inv/gross*100:0,cpc:paClk?paInv/paClk:0,ctr:paImpr?paClk/paImpr*100:0,
    _pa:pa,_di:di};
}
function meliRange(D){const W=DATA._win;return state.day==='all'?[W.S_cur,W.E_cur]:[D.k,D.k];}
function meliPrev(){const W=DATA._win;return state.day==='all'?meliHead(W.pFrom,W.pTo):null;}
const mlEsc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---- Overview: Mercado Libre aparte, sin mezclarlo con la facturación de la tienda ---- */
function meliOverview(D){
  if(!HAS.meli)return '';
  const h=meliHead(...meliRange(D)), p=meliPrev();
  return `${secH('Mercado Libre · canal aparte','No suma a la facturación de la tienda',{cls:' ml',src:L.mercadoLibre,alt:'Mercado Libre'})}
  <div class="kgrid kg4">
    ${kc('Facturación MeLi',M(h.gross),p?dpct(h.gross,p.gross):nf(h.n)+' órdenes',1)}
    ${kc('Órdenes MeLi',nf(h.n),p?dpct(h.n,p.n):'pago aprobado')}
    ${kc('Inversión Mercado Ads',M(h.inv),'Product Ads + Display')}
    ${kc('ACOS Mercado Ads',h.fact?pc(h.acos):'—',h.inv?'ROAS '+nf(h.roas,1)+'x':'sin pauta')}
  </div>
  <div class="mlsum">Tienda <b>${M(D.fact)}</b> + Mercado Libre <b>${M(h.gross)}</b> = <b class="or">${M(D.fact+h.gross)}</b> · cada canal se mide por separado; los objetivos y el ACOS general de arriba son sólo de la tienda.</div>`;
}

/* ---- PESTAÑA MERCADO LIBRE ---- */
function coTab(D){
  const X=DATA.mlx||{}, h=meliHead(...meliRange(D)), p=meliPrev(), all=state.day==='all';
  const dl=(c,pv,inv)=>p?dpct(c,pv,inv):'';
  // campañas: Product Ads por campaña + Display por campaña
  const camps={};
  h._pa.forEach(r=>{const k='pa|'+(r.campaign_name||r.campaign_id||'(campaña)');const c=camps[k]||(camps[k]={n:r.campaign_name||'(campaña)',t:'Product Ads',cost:0,amt:0,impr:0,clk:0});
    c.cost+=+r.cost||0;c.amt+=+r.total_amount||0;c.impr+=+r.impressions||0;c.clk+=+r.clicks||0;});
  h._di.forEach(r=>{const k='di|'+(r.campaign_name||'(campaña)');const c=camps[k]||(camps[k]={n:r.campaign_name||'(campaña)',t:'Display',cost:0,amt:0,impr:0,clk:0});
    c.cost+=+r.cost||0;c.amt+=+r.touch_point_direct_amount||0;c.impr+=+r.impressions||0;c.clk+=+r.clicks||0;});
  const campArr=Object.values(camps).filter(c=>c.cost||c.amt).sort((a,b)=>(b.amt-a.amt)||(b.cost-a.cost)).slice(0,12);
  const campRows=campArr.map((c,i)=>`<tr class="${i===0?'top':''}"><td class="rk">${i+1}</td><td class="nm">${mlEsc(c.n)}</td><td><span class="mltag ${c.t==='Display'?'d':''}">${c.t}</span></td>
    <td class="n">${M(c.cost)}</td><td class="n">${nf(c.clk)}</td><td class="n">${c.amt?pc(c.cost/c.amt*100):'—'}</td><td class="n hi">${c.amt?M(c.amt):'—'}</td></tr>`).join('');
  // publicaciones: snapshot del catálogo (no depende del día elegido). Sin visitas: item_visits tampoco es confiable
  const its=X.top||[];
  const itRows=its.map((o,i)=>{const t=mlEsc(o.item_title||o.item_id);
    const th=o.item_thumbnail?`<img class="mlthumb" src="${mlEsc(String(o.item_thumbnail).replace(/^http:/,'https:'))}" alt="" loading="lazy">`:'<span class="mlthumb"></span>';
    return `<tr class="${i===0?'top':''}"><td class="rk">${i+1}</td><td class="nm"><div class="mlitem">${th}${o.item_permalink?`<a href="${mlEsc(o.item_permalink)}" target="_blank" rel="noopener">${t}</a>`:t}</div></td>
    <td class="n">${M(o.item_price)}</td><td class="n">${nf(o.item_available_quantity)}</td><td class="n hi">${nf(o.item_sold_quantity)}</td></tr>`;}).join('');
  const c=X.cuenta, rl=c?String(c.reputation_level||'').split('_')[1]:'';
  const repTxt={red:'roja',orange:'naranja',yellow:'amarilla',light:'verde claro',green:'verde'}[rl]||'';
  const lider=c&&c.power_seller_status?' · MercadoLíder '+c.power_seller_status.charAt(0).toUpperCase()+c.power_seller_status.slice(1):'';
  return `
  <div class="bigstat"><div><div class="bl">Facturación Mercado Libre</div><div class="bv">${M(h.gross)}</div></div>
    <div class="bd">${nf(h.n)} órdenes con pago aprobado · ticket <b style="color:var(--ke-text)">${M(h.ticket)}</b> · ${nf(h.units)} unidades · Mercado Ads <b style="color:var(--ke-text)">${M(h.inv)}</b> · ACOS Ads ${h.fact?pc(h.acos):'—'} · TACOS ${h.gross?pc(h.tacos):'—'}${repTxt?` · reputación ${repTxt}${lider}`:''}.</div></div>
  ${all&&X.obj&&(X.obj.fact||X.obj.uni)?`${secH('Objetivos Mercado Libre · avance','objetivos_ml')}
  <div class="obj">${objRow('Facturación MeLi',h.gross,X.obj.fact,M)}${objRow('Unidades MeLi',h.units,X.obj.uni,v=>nf(v))}</div>`:''}
  ${secH('Ventas · Mercado Libre','Pago aprobado',{cls:' ml',src:L.mercadoLibre,alt:'Mercado Libre'})}
  <div class="kgrid kg4">
    ${kc('Facturación bruta',M(h.gross),dl(h.gross,p&&p.gross),1)}
    ${kc('Órdenes',nf(h.n),dl(h.n,p&&p.n))}
    ${kc('Ticket promedio',M(h.ticket),dl(h.ticket,p&&p.ticket))}
    ${kc('Unidades',nf(h.units),dl(h.units,p&&p.units))}
  </div>
  <div class="kgrid kg4">
    ${kc('Comisiones ML',M(h.fee),pc(h.feePct)+' de la bruta')}
    ${kc('Envíos a cargo',M(h.ship),h.coup?'cupones '+M(h.coup):'sin cupones')}
    ${kc('Facturación neta',M(h.net),'bruta − comisión − envío − cupones')}
    ${kc('Canceladas',nf(h.canc),pc(h.cancPct)+' de las órdenes')}
  </div>
  ${secH('Mercado Libre · facturación por día','Por día')}
  <div class="chart"><div class="ch"><span class="ct">Facturación MeLi e inversión en Mercado Ads</span>
    <div class="legend"><span><i style="background:#ff700a"></i>Facturación MeLi</span><span><i style="background:#3b82f6"></i>Inversión Mercado Ads</span></div></div>
    <div id="meliDaily"></div></div>
  ${h.inv||h.fact?`${secH('Mercado Ads · performance','Product Ads + Display',{cls:' ml',src:L.mercadoAds,alt:'Mercado Ads'})}
  <div class="kgrid kg4">
    ${kc('Inversión total',M(h.inv),dl(h.inv,p&&p.inv),1)}
    ${kc('Fact. atribuida',M(h.fact),dl(h.fact,p&&p.fact))}
    ${kc('ACOS',h.fact?pc(h.acos):'—',p?dpct(h.acos,p.acos,true):'inversión / atribuido')}
    ${kc('ROAS',h.inv?nf(h.roas,1)+'x':'—','atribuido / inversión')}
  </div>
  <div class="kgrid kg4">
    ${kc('Product Ads',M(h.paInv),'ACOS '+(h.paFact?pc(h.paAcos):'—')+' · '+M(h.paFact)+' atrib.')}
    ${kc('Display',M(h.diInv),h.diInv||h.diFact?'ACOS '+(h.diFact?pc(h.diAcos):'—')+' · touch point directo':'sin pauta Display')}
    ${kc('TACOS',h.gross?pc(h.tacos):'—','Mercado Ads / facturación MeLi')}
    ${kc('CPC Product Ads',h.paClk?M(h.cpc):'—','CTR '+pc(h.ctr,2)+' · '+nf(h.paClk)+' clicks')}
  </div>`:''}
  ${campArr.length?`${secH('Campañas de Mercado Ads','Por facturación atribuida')}
  <div class="blk"><div class="blkh"><span class="blkt">Campañas por facturación atribuida</span><span class="blkt">Mercado Ads</span></div>
    <div class="scroll"><table class="t"><thead><tr><th>#</th><th>Campaña</th><th>Tipo</th><th class="n">Inversión</th><th class="n">Clicks</th><th class="n">ACOS</th><th class="n">Fact. atrib.</th></tr></thead>
    <tbody>${campRows}</tbody></table></div></div>`:''}
  ${its.length?`${secH('Publicaciones destacadas','Catálogo activo · snapshot '+fmtD(X.snap))}
  <div class="blk"><div class="blkh"><span class="blkt">Top 10 publicaciones por unidades vendidas</span><span class="blkt">Histórico de la publicación · no cambia con el día</span></div>
    <div class="scroll"><table class="t"><thead><tr><th>#</th><th>Publicación</th><th class="n">Precio</th><th class="n">Stock</th><th class="n">Vendidas</th></tr></thead>
    <tbody>${itRows}</tbody></table></div></div>`:''}
  ${HAS.consulInsights?areaSprint('consul','Consultoría'):''}`;
}

function drawMeliDaily(box){
  const days=DAYS.map(d=>d.k), total=days.length||1, today=iso(DATA._win.today);
  const vals=DAYS.map(d=>d.avail==='future'?{f:0,i:0}:(x=>({f:x.gross,i:x.inv}))(meliHead(d.k,d.k)));
  const sel=state.day==='all'?-1:days.indexOf(state.day);
  const W=980,H=250,pad={l:52,r:12,t:14,b:40},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b;
  const max=Math.max(...vals.map(v=>Math.max(v.f,v.i)))*1.15||1,bw=iw/total,bar=bw*0.32,y=v=>pad.t+ih-(v/max)*ih;
  let g='';
  for(let i=0;i<=3;i++){const gy=pad.t+ih-(i/3)*ih,val=max*i/3;
    g+=`<line x1="${pad.l}" y1="${gy}" x2="${W-pad.r}" y2="${gy}" stroke="rgba(230,230,230,.07)"/>`;
    g+=`<text x="${pad.l-8}" y="${gy+3}" text-anchor="end" font-size="9" fill="rgba(230,230,230,.38)" font-family="General Sans">${val>=1e6?('$'+(val/1e6).toFixed(1)+'M'):(val>=1e3?('$'+Math.round(val/1e3)+'k'):0)}</text>`;}
  DAYS.forEach((dd,i)=>{const cx=pad.l+bw*i+bw/2, fut=dd.avail==='future', v=vals[i], partial=dd.k===today;
    if(sel===i)g+=`<rect x="${cx-bw/2+3}" y="${pad.t}" width="${bw-6}" height="${ih}" rx="4" fill="rgba(255,112,10,.06)"/>`;
    if(v.f>0)g+=`<rect x="${cx-bar-2}" y="${y(v.f)}" width="${bar}" height="${pad.t+ih-y(v.f)}" rx="2" fill="#ff700a" opacity="${partial?.78:1}"><title>${dd.dow} ${dd.dm} · facturación ${M(v.f)}</title></rect>`;
    if(v.i>0)g+=`<rect x="${cx+2}" y="${y(v.i)}" width="${bar}" height="${pad.t+ih-y(v.i)}" rx="2" fill="#3b82f6" opacity="${partial?.78:1}"><title>${dd.dow} ${dd.dm} · Mercado Ads ${M(v.i)}</title></rect>`;
    const hot=(sel===i)||(sel===-1&&dd.avail==='today');
    g+=`<text x="${cx}" y="${H-20}" text-anchor="middle" font-size="10" fill="${hot?'var(--ke-text)':(fut?'rgba(230,230,230,.3)':'rgba(230,230,230,.5)')}" font-weight="${hot?'700':'400'}" font-family="General Sans">${dd.dow}</text>`;
    g+=`<text x="${cx}" y="${H-8}" text-anchor="middle" font-size="9" fill="rgba(230,230,230,.35)" font-family="General Sans">${dd.dm}</text>`;});
  box.innerHTML=`<svg class="svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Facturación Mercado Libre por día">${g}</svg>`;
}
/* ============ /MERCADO LIBRE ============ */

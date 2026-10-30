# Módulo de evento (Cyber / Hot Sale) — Krab-e

Tablero de evento reutilizable para los sellers de la agencia. Se sirve en `{cliente}.krab-e.space/evento`, coexiste con el dashboard común (que queda intacto en la raíz) y se prende/apaga desde la tabla `eventos` de Supabase.

## Archivos
- `event_module.js` — la SPA del evento (config-driven). Las constantes por cliente las pone el build: `PREFIX` (prefijo de tablas Supabase), `CLIENTE_KEY` (match con `eventos.cliente`; también es el nombre visible) y `GA4_PAID_ONLY` (opcional).
- `build_evento.js` — ensambla `event_module.js` + los logos base64 del `index.html` del demo en un `evento/index.html` autocontenido.
- `meli_tab.js` + `meli_tab.css` + `patch_meli.js` — pestaña **Mercado Libre** completa (pieza aparte). Se aplica sobre un `evento/index.html` ya armado: `node modulo/patch_meli.js <salida>/evento/index.html`. Reemplaza la pestaña MeLi básica del módulo y suma el bloque MeLi aparte en el Overview. Probada sobre el build del molde (Ohpic) y sobre los builds vivos de Regina, Colombraro y Mi Pañal.

## Cómo generar el /evento de un cliente
```bash
# desde la raíz de este repo (demo_cyber), que tiene el index.html del molde:
node modulo/build_evento.js index.html modulo/event_module.js <salida>/evento/index.html <PREFIX> "<CLIENTE_KEY>" [true|false]
node modulo/patch_meli.js <salida>/evento/index.html   # si el seller tiene Mercado Libre
node modulo/patch_meli_only.js <salida>/evento/index.html   # además, si el seller es SÓLO Mercado Libre (sin tienda ni Meta/Google)
# el último arg es GA4_PAID_ONLY (default false): true sólo para sellers sin Tiendanube ni planilla de ventas (p. ej. Famusic)
# ej Wanama:  node modulo/build_evento.js index.html modulo/event_module.js ../wanamakids/evento/index.html wanamakids "wanama kids"
```
Luego: copiar ese `evento/index.html` al repo del cliente, sumar el banner al `index.html` raíz del cliente, y `git push` (deploy por Vercel).

## Config: tabla `eventos` (Supabase ref yixbnmwdzexjygmtszii)
Una fila por cliente. Columnas: `cliente, nombre, badge_texto, fecha_inicio, fecha_fin, cortes[], dias_core, obj_facturacion, obj_ordenes, obj_inv_meta, obj_inv_google, acos_limite, activo`. RLS: solo lectura anon. El banner del dashboard común aparece solo si `activo=true` (reversible).

## Fuentes de datos por tab
- **Overview / Tienda**: facturación real de `{prefix}_tiendanube_orders` (order_total_paid, status paid + partially_refunded); si no hay, `{prefix}_facturacion` (planilla diaria venta_real/pedidos, días sin cargar en "—"); si no, GA4/`{prefix}_revenue` (con `GA4_PAID_ONLY`, sólo lo atribuido a pauta). Sesiones/fuentes de GA4; funnel y productos de `{prefix}_ga4_events` / `_ga4_items` si existen.
- **Paid Media**: `{prefix}_meta_ads` + `{prefix}_google_ads` (ambas con `select=*`; atribución Google/cpc desde el store por source_medium). Si no hay filas de Google en la ventana, todo lo de Google se oculta y el ACOS/avance queda sólo con Meta.
- **Mercado Libre** (con `patch_meli.js`): `{prefix}_ml_orders` (pago aprobado: bruta, órdenes, ticket, unidades, comisión, envío, cupones, neta; canceladas aparte), `{prefix}_mercado_ads` (Product Ads) + `{prefix}_mercado_ads_display` (Display, atribución por touch point directo; se piden sólo filas con costo, impresiones o venta), `{prefix}_ml_items` (top 10 por unidades vendidas del último snapshot; no depende del día) y `{prefix}_ml_cuenta` (reputación). Objetivos de `objetivos_ml` con `fecha='cyber-monday-2026'` si hay. Paginación con desempate por clave natural (order_id / campaign_id / line_item_id), así anda en tablas sin `id`. El Overview muestra MeLi **aparte** ("canal aparte, no suma a la facturación de la tienda") con la suma tienda + MeLi rotulada.
  - Sin visitas ni conversión a propósito: `{prefix}_ml_visitas_snapshot` no es un acumulado (baja entre días y la resta da conversiones de 30% a más de 100%) e `item_visits` tampoco cierra (publicaciones top con 0 visitas). Además anon no puede leer `_ml_visitas_snapshot`.
  - Sellers sólo MeLi (Ohpic, Prifamon, Superclick): después de `patch_meli.js` va `patch_meli_only.js`. El Overview pasa a ser la pestaña Mercado Libre (la pestaña MeLi aparte se oculta); Tienda y Paid Media se ocultan si no tienen filas; los objetivos salen de `objetivos_consultoria` con `fecha='cyber-monday-2026'` (facturación, inversión Product Ads / Display, pill con ACOS y TACOS límite) cuando `objetivos_ml` no tiene fila; "Último dato cargado" suma órdenes ML y Mercado Ads. La fila de `eventos` lleva `obj_facturacion` y `acos_limite` de consultoría y nada en Meta/Google.
- **Email Mkt**: `{prefix}_email_marketing` (Perfit); la pestaña aparece si el seller tiene email; sin envíos en el período muestra un aviso con el último envío.
- **Social**: `{prefix}_ig_posts_media` + `{prefix}_ig_stories` (como Historias) / `_ig_account_daily`.
- **Sprint Review**: `{prefix}_insights` (Notion), por semana y área; las filas sin `semana` no entran.
- Cualquier tabla que falte da 404 y se ignora; el tablero esconde toda sección sin datos.

## Gotchas
- La paginación ordena por fecha + `id` (sin desempate, >1000 filas con fechas repetidas duplican/saltean). Si la tabla no tiene `id` (p. ej. `regina_ml_orders`), reintenta sin desempate.
- Pedir una columna que no existe da 400 y se pierde la fuente entera en silencio: por eso Meta y Google van con `select=*`.
- `{prefix}_revenue` puede cargar el día en curso con una fila parcial en $0 que tapa el dato real de GA4: el módulo mergea revenue solo donde sum>0, si no GA4.
- Confirmar la cuenta de Meta del cliente antes de confiar en la inversión (algunos tienen 2 cuentas, una idle que da $0).
- Confirmar `fecha_fin` del evento con el cliente/analista (define días del filtro y ritmo ideal).

Piloto de referencia: Wanama Kids → https://wanamakids.krab-e.space/evento

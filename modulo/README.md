# Módulo de evento (Cyber / Hot Sale) — Krab-e

Tablero de evento reutilizable para los sellers de la agencia. Se sirve en `{cliente}.krab-e.space/evento`, coexiste con el dashboard común (que queda intacto en la raíz) y se prende/apaga desde la tabla `eventos` de Supabase.

## Archivos
- `event_module.js` — la SPA del evento (config-driven). Las constantes por cliente las pone el build: `PREFIX` (prefijo de tablas Supabase), `CLIENTE_KEY` (match con `eventos.cliente`; también es el nombre visible) y `GA4_PAID_ONLY` (opcional).
- `build_evento.js` — ensambla `event_module.js` + los logos base64 del `index.html` del demo en un `evento/index.html` autocontenido.

## Cómo generar el /evento de un cliente
```bash
# desde la raíz de este repo (demo_cyber), que tiene el index.html del molde:
node modulo/build_evento.js index.html modulo/event_module.js <salida>/evento/index.html <PREFIX> "<CLIENTE_KEY>" [true|false]
# el último arg es GA4_PAID_ONLY (default false): true sólo para sellers sin Tiendanube ni planilla de ventas (p. ej. Famusic)
# ej Wanama:  node modulo/build_evento.js index.html modulo/event_module.js ../wanamakids/evento/index.html wanamakids "wanama kids"
```
Luego: copiar ese `evento/index.html` al repo del cliente, sumar el banner al `index.html` raíz del cliente, y `git push` (deploy por Vercel).

## Config: tabla `eventos` (Supabase ref yixbnmwdzexjygmtszii)
Una fila por cliente. Columnas: `cliente, nombre, badge_texto, fecha_inicio, fecha_fin, cortes[], dias_core, obj_facturacion, obj_ordenes, obj_inv_meta, obj_inv_google, acos_limite, activo`. RLS: solo lectura anon. El banner del dashboard común aparece solo si `activo=true` (reversible).

## Fuentes de datos por tab
- **Overview / Tienda**: facturación real de `{prefix}_tiendanube_orders` (order_total_paid, status paid + partially_refunded); si no hay, `{prefix}_facturacion` (planilla diaria venta_real/pedidos, días sin cargar en "—"); si no, GA4/`{prefix}_revenue` (con `GA4_PAID_ONLY`, sólo lo atribuido a pauta). Sesiones/fuentes de GA4; funnel y productos de `{prefix}_ga4_events` / `_ga4_items` si existen.
- **Paid Media**: `{prefix}_meta_ads` + `{prefix}_google_ads` (ambas con `select=*`; atribución Google/cpc desde el store por source_medium). Si no hay filas de Google en la ventana, todo lo de Google se oculta y el ACOS/avance queda sólo con Meta.
- **Mercado Libre**: `{prefix}_ml_orders` (aprobadas) + `{prefix}_mercado_ads`.
- **Email Mkt**: `{prefix}_email_marketing` (Perfit); la pestaña aparece sólo si hubo envíos en la ventana del evento.
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

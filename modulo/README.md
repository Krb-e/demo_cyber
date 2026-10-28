# Módulo de evento (Cyber / Hot Sale) — Krab-e

Tablero de evento reutilizable para los sellers de la agencia. Se sirve en `{cliente}.krab-e.space/evento`, coexiste con el dashboard común (que queda intacto en la raíz) y se prende/apaga desde la tabla `eventos` de Supabase.

## Archivos
- `event_module.js` — la SPA del evento (config-driven). Único edit por cliente: las constantes `PREFIX` (prefijo de tablas Supabase) y `CLIENTE_KEY` (match con `eventos.cliente`).
- `build_evento.js` — ensambla `event_module.js` + los logos base64 del `index.html` del demo en un `evento/index.html` autocontenido.

## Cómo generar el /evento de un cliente
```bash
# desde la raíz de este repo (demo_cyber), que tiene el index.html del molde:
node modulo/build_evento.js index.html modulo/event_module.js <salida>/evento/index.html <PREFIX> "<CLIENTE_KEY>"
# ej Wanama:  node modulo/build_evento.js index.html modulo/event_module.js ../wanamakids/evento/index.html wanamakids "wanama kids"
```
Luego: copiar ese `evento/index.html` al repo del cliente, sumar el banner al `index.html` raíz del cliente, y `git push` (deploy por Vercel).

## Config: tabla `eventos` (Supabase ref yixbnmwdzexjygmtszii)
Una fila por cliente. Columnas: `cliente, nombre, badge_texto, fecha_inicio, fecha_fin, cortes[], dias_core, obj_facturacion, obj_ordenes, obj_inv_meta, obj_inv_google, acos_limite, activo`. RLS: solo lectura anon. El banner del dashboard común aparece solo si `activo=true` (reversible).

## Fuentes de datos por tab
- **Overview / Tienda**: facturación real de `{prefix}_tiendanube_orders` (order_total_paid, status paid) con fallback por fecha a GA4/`{prefix}_revenue` donde no haya Tiendanube; sesiones/fuentes de GA4.
- **Paid Media**: `{prefix}_meta_ads` + `{prefix}_google_ads` (atribución Google/cpc desde el store por source_medium).
- **Mercado Libre**: `{prefix}_ml_orders` (aprobadas) + `{prefix}_mercado_ads`.
- **Social**: `{prefix}_ig_posts_media` / `_ig_account_daily`.
- **Sprint Review**: `{prefix}_insights` (Notion), por semana y área.
- Email oculto si la tabla está vacía. El tablero esconde cualquier sección sin datos.

## Gotchas
- `{prefix}_revenue` puede cargar el día en curso con una fila parcial en $0 que tapa el dato real de GA4: el módulo mergea revenue solo donde sum>0, si no GA4.
- Confirmar la cuenta de Meta del cliente antes de confiar en la inversión (algunos tienen 2 cuentas, una idle que da $0).
- Confirmar `fecha_fin` del evento con el cliente/analista (define días del filtro y ritmo ideal).

Piloto de referencia: Wanama Kids → https://wanamakids.krab-e.space/evento

# chrome-live — referência de verbos

Material carregado on-demand pela `SKILL.md`. Todos os verbos correm via
`scripts/cdp-guard.sh <verbo> [args]` (nunca `node cdp.mjs` directo). O primeiro
argumento da maioria é o `<target>` — um **prefixo do targetId** (mín. 8 chars) obtido de
`list`. Evitar selectores por índice de DOM entre chamadas (o DOM pode mudar).

## Read-only (seguros — sem gate)

| Verbo | Assinatura | Uso |
|-------|------------|-----|
| `list` | `list` | Lista tabs abertas com targetId + título + URL. Sempre o primeiro passo. |
| `shot` | `shot <target> [ficheiro]` | Screenshot PNG do viewport (resolução nativa: `px imagem = px CSS × DPR`). |
| `snap` | `snap <target>` | Accessibility tree (DOM semântico) — ideal para a11y e estrutura. |
| `html` | `html <target> [selector]` | HTML completo ou do elemento que casa o selector CSS. |
| `net`  | `net <target>` | Resource timing dos pedidos da página (entries de performance). |

## Active (gateados — executam JS / mudam estado)

Exigem, conforme o modo: `WIRE_CHROME_LIVE_ACTIVE=1` (prod) e/ou `WIRE_AUDIT_APPLY=1`
(contexto de audit). Antes de cada um, descrever ao utilizador o que vai correr e obter "sim".

| Verbo | Assinatura | Notas |
|-------|------------|-------|
| `nav` | `nav <target> <url>` | Navega e espera o load (timeout 30s). |
| `click` | `click <target> <selector>` | Clica via selector CSS. |
| `clickxy` | `clickxy <target> <x> <y>` | Clica em coordenadas CSS-pixel. |
| `type` | `type <target> <texto>` | Escreve no elemento focado. Funciona em iframes cross-origin (`eval` não). |
| `eval` | `eval <target> <expr>` | Executa JS no contexto da página. **Não** entra em iframes cross-origin. |
| `evalraw` | `evalraw <target> <método> [json]` | Comando CDP cru (ex.: `Network.*`, `Emulation.setDeviceMetricsOverride`). Poder máximo. |
| `open` | `open [url]` | Abre nova tab. |
| `loadall` | `loadall <target> <selector> [ms]` | Clica repetidamente um "carregar mais" até esgotar (1500ms default). |

## control

| Verbo | Assinatura | Uso |
|-------|------------|-----|
| `stop` | `stop [target]` | Termina o daemon de uma tab (ou todos). Auto-expiram aos 20 min idle. |

## Receitas para audits (read-only, aditivas)

**ux-audit — verificação ao vivo:**
- `snap <t>` → confirmar landmarks, headings hierárquicos, `alt`/labels reais no DOM
  renderizado (não no JSX).
- `shot <t>` → evidência visual de estado vazio, overflow, contraste percebido.
- `html <t> "main"` → inspeccionar markup efectivo (após hidratação) de uma região.
- Responsividade real exige emular viewport → `evalraw` `Emulation.setDeviceMetricsOverride`
  (verbo **active**, gateado). Sem autorização, ficar pelo `shot` no viewport actual.

**security-scan — sinais de runtime (complementam o scan estático):**
- `eval <t> "document.cookie"` (active, gateado) → cookies visíveis a JS. Um cookie de
  sessão aqui = falta `HttpOnly` (finding). Os `HttpOnly` **não** aparecem — ausência é o sinal.
- `eval <t> "document.querySelectorAll('[onclick],[onerror]').length"` → handlers inline
  (smell de CSP fraca / XSS sink).
- `html <t> "meta[http-equiv='Content-Security-Policy']"` (read-only) → CSP via meta-tag
  (a CSP via header não aparece no DOM; para essa, capturar `Network.responseReceived`
  com `evalraw`).
- `eval <t> "[...document.querySelectorAll('input[type=password]')].map(i=>i.autocomplete)"`
  → password fields sem `autocomplete=off`/`new-password`.

Marcar sempre no relatório que o sinal veio de **verificação ao vivo** (e de que URL/tab),
para o leitor distinguir de findings estáticos.

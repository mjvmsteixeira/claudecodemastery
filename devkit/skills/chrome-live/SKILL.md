---
name: chrome-live
description: Inspecciona e interage com a sessão Chrome local já aberta (tabs, login e estado reais) via Chrome DevTools Protocol — sem extensão, sem Puppeteer. Read-only por defeito (list/shot/snap/html/net); verbos activos que executam JS ou mudam a página (eval/click/type/nav) só com aprovação explícita do utilizador e gateados por PRUMO_OPERATING_MODE. Dispara em "inspecciona a página aberta no Chrome", "tira screenshot do que está no browser", "vê o DOM/accessibility tree desta tab", "verifica esta página ao vivo", "chrome live", "debug da página no Chrome". Capacidade consumida por ux-audit e security-scan para verificação ao vivo. Requer Node 22+ e remote-debugging activo no Chrome.
---

# chrome-live

Conduz o **Chrome que já tens aberto e autenticado** — não lança um browser isolado.
Liga-se via Chrome DevTools Protocol (WebSocket) à sessão real: as tuas tabs, os teus
logins, o estado actual da página. Útil para inspeccionar/depurar uma página viva e para
**enriquecer auditorias** (`ux-audit`, `security-scan`) com o DOM renderizado real em vez
de inferência estática a partir do código.

O motor é o `cdp.mjs` vendorado (chrome-cdp-skill, MIT © pasky — ver `scripts/NOTICE`).
Toda a execução passa pelo wrapper `scripts/cdp-guard.sh`, que aplica o gating do
ecossistema prumo. **Nunca chamar `node cdp.mjs` directamente.**

## Trigger

- `"inspecciona a página aberta no Chrome"`, `"verifica esta página ao vivo"`
- `"tira screenshot do que está no browser"`, `"vê o accessibility tree / DOM desta tab"`
- `"chrome live"`, `"debug da página no Chrome"`, `"o que está aberto no browser?"`

## Quando usar isto vs. o MCP Claude-in-Chrome

Se o MCP `claude-in-chrome` estiver disponível e o uso for **interactivo no desktop**,
preferir o MCP (mais rico). Usar `chrome-live` quando: corre em **headless/CI**, contra
um **Chrome remoto** (`CDP_HOST`), sem extensão instalada, ou quando se quer um primitivo
**auditável e sem dependências** consumido pelas skills de audit.

## Pré-requisitos (preflight)

1. **Node 22+** (`node -v`) — o `cdp.mjs` usa o WebSocket built-in. O `cdp-guard.sh`
   recusa (`exit 69`) com Node < 22.
2. **Remote debugging activo.** Lançar o Chrome com a porta de debug **e um perfil próprio**:
   `open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/chrome-cdp"`.
   Na 1ª utilização de cada tab o Chrome mostra um modal "Allow debugging" — aprovar 1×/tab.
   > ⚠ **Chrome 136+** (Maio 2025) **ignora `--remote-debugging-port` no perfil default**
   > (mitigação contra roubo de sessão). O `--user-data-dir` separado é **obrigatório** — ou
   > seja, um **perfil limpo, não a tua sessão logada**. Para conduzir a sessão autenticada
   > real em Chrome moderno, usar o MCP `claude-in-chrome` (API de extensão, não afectada).
   > O toggle em `chrome://inspect` **não** activa o porto local (serve para targets remotos/USB).
3. Suporta Chrome/Chromium/Brave/Edge/Vivaldi em macOS/Linux/Windows. Para localização
   não-standard do `DevToolsActivePort`, definir `CDP_PORT_FILE`; para um Chrome remoto, `CDP_HOST`.

Se o preflight falhar, **parar e explicar** — não há fallback. Não inventar tabs.

## Verbos e classificação de segurança

Invocar sempre via `${CLAUDE_PLUGIN_ROOT}/skills/chrome-live/scripts/cdp-guard.sh <verbo> [args]`.

| Classe | Verbos | Gate |
|--------|--------|------|
| **read-only** | `list` `shot` `snap` `html` `net` | nenhum (só preflight) — seguros para audit |
| **active** | `eval` `evalraw` `click` `clickxy` `type` `nav` `open` `loadall` | **gateados** (ver abaixo) — executam JS / mudam estado da página autenticada |
| control | `stop` | benigno (termina daemon) |

Detalhe de cada verbo, selectores e dicas em `references/verbs.md` (carregar on-demand).

### Gating dos verbos activos

`eval`/`evalraw` executam JavaScript arbitrário no contexto de uma página onde estás
autenticado — equivale a agir como o utilizador logado. Por isso o `cdp-guard.sh`:

- **Contexto de audit** (`~/.prumo/audit-active` ou `PRUMO_AUDIT_ACTIVE=1`): verbos activos
  são **bloqueados** a menos que `PRUMO_AUDIT_APPLY=1`. Auditar é read-only.
- **Modo `prod`** (default): verbos activos exigem `export PRUMO_CHROME_LIVE_ACTIVE=1`
  (consentimento explícito por sessão, audit-tracked) ou passar a `dev` (`/prumo-mode dev`).
- **Modo `dev`**: permitidos com aviso. **`lab`**: bypass total.

Antes de propor um verbo activo, **dizer ao utilizador o que vai executar e onde**
(que tab, que JS/acção) e obter o "sim". Ler `references/verbs.md` para o protocolo.

## Workflow típico

1. **Preflight** + `cdp-guard.sh list` → escolher o `targetId` (prefixo de ≥8 chars).
2. Read-only primeiro: `shot` (screenshot), `snap` (accessibility tree), `html [selector]`,
   `net` (timing de recursos).
3. Só se necessário e autorizado: verbos activos (`nav`, `click`, `type`, `eval`).
4. `stop` para terminar daemons quando acabar (auto-expiram aos 20 min de inactividade).

## Correcções / acções que mudam estado

Esta skill **não corrige ficheiros**. Quando uma acção muda o estado do browser/página
(verbos activos), aplica-se a disciplina de
`${CLAUDE_PLUGIN_ROOT}/shared/safe-apply.md` (Gate 1 modo, Gate 3 confirmação humana):
descrever a acção, obter "sim" explícito, e em `prod` exigir `PRUMO_CHROME_LIVE_ACTIVE=1`.

## Como o ux-audit e o security-scan consomem esta skill

Ambos detectam o `cdp.mjs` vendorado e, **se uma tab relevante estiver aberta**, usam
verbos **read-only** para enriquecer o relatório com sinais de runtime (contraste real,
ordem de foco, headers/cookies ao vivo). Sem Chrome/tab, degradam para a análise estática
habitual — a verificação ao vivo é sempre aditiva, nunca um pré-requisito.

## Fronteira

- Liga-se a `127.0.0.1` por defeito; `CDP_HOST` permite um Chrome remoto (uso avançado).
- Não persiste logs próprios além do `prumo_log` (audit-trail das invocações).
- Screenshots podem conter PII — em contexto SecOps, tratar como evidência (não partilhar).
- É a única peça não-bash do devkit: depende de Node 22+. Assumir isso explicitamente.

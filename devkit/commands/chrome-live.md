---
name: chrome-live
description: Inspecciona/interage com a sessão Chrome local aberta via CDP (sem extensão). Read-only por defeito; verbos activos gateados por modo. Delega na skill chrome-live.
allowed-tools: Bash, Read
---

# /chrome-live

Wrapper fino sobre a skill `chrome-live`. Conduz o Chrome já aberto e autenticado via
Chrome DevTools Protocol. **Não duplica metodologia** — a lógica vive na
`skills/chrome-live/SKILL.md` e em `references/verbs.md`.

Uso: `/chrome-live <verbo> [args...]` — sem argumentos, faz preflight + `list`.

## 1. Localizar o wrapper de gating

```bash
GUARD="${CLAUDE_PLUGIN_ROOT}/skills/chrome-live/scripts/cdp-guard.sh"
[ -x "$GUARD" ] || GUARD="$(find ~/.claude/plugins/cache -path '*/wire-devkit/*/skills/chrome-live/scripts/cdp-guard.sh' -print -quit 2>/dev/null)"
if [ -z "$GUARD" ] || [ ! -f "$GUARD" ]; then
  echo "chrome-live não encontrado — reinstala o wire-devkit."; exit 1
fi
chmod +x "$GUARD" 2>/dev/null || true
```

## 2. Preflight (Node 22+ e remote-debugging)

O `cdp-guard.sh` já recusa Node < 22. Se o utilizador ainda não activou o
remote-debugging, lembrá-lo: abrir `chrome://inspect/#remote-debugging` e ligar o toggle
(modal "Allow debugging" uma vez por tab).

## 3. Executar o verbo pedido

```bash
ARGS="${ARGUMENTS:-list}"
# shellcheck disable=SC2086
bash "$GUARD" $ARGS
```

- Sem argumentos → `list` (lista as tabs; escolher o targetId, prefixo ≥8 chars).
- Read-only (`shot snap html net`) correm directos.
- Verbos activos (`eval evalraw click clickxy type nav open loadall`) são **gateados**:
  em `prod` exigem `export WIRE_CHROME_LIVE_ACTIVE=1`; em contexto de audit exigem
  `WIRE_AUDIT_APPLY=1`. Antes de propor um, descrever ao utilizador o que executa e onde,
  e obter "sim" (ver `shared/safe-apply.md`).

## 4. Reportar

Mostrar o output ao utilizador. Para screenshots, indicar o caminho do PNG. Para `snap`,
resumir a árvore relevante em vez de despejar tudo.

## Notas

- Motor: `cdp.mjs` vendorado (chrome-cdp-skill, MIT © pasky — ver `scripts/NOTICE`).
- Daemons por-tab auto-expiram aos 20 min idle; `/chrome-live stop` termina-os já.
- Para um Chrome remoto: `CDP_HOST=<ip>`. Para `DevToolsActivePort` não-standard: `CDP_PORT_FILE=<path>`.

---
name: wire-smoke
description: Corre smoke tests read-only sobre os plugins Wire instalados. Sem argumento corre os 3; com argumento (base|secops|devkit|all) limita. Cada plugin shippa um smoke.sh próprio (lib loads, hooks executáveis, ferramentas opcionais detectadas). Não substitui /wire-doctor; é mais leve e foca-se em "isto está instalado correctamente?".
allowed-tools: Bash, Read
---

# /wire-smoke [`base|secops|devkit|all`]

Executa o `smoke.sh` de cada plugin instalado. Read-only. Sai com código 0 se tudo passou, 1 se houve falhas críticas, 2 se só warnings (degradação aceitável).

## Diferença vs `/wire-doctor`

- **`/wire-doctor`** — meta-doctor que **orquestra** outras skills (mempalace-doctor, claude-deep-audit, /vault-audit, /wire-vault-doctor). Mais pesado, abrangente, **read-only**. Foca em "o setup está saudável e operacional?".
- **`/wire-smoke`** — corre o `smoke.sh` de cada plugin. Mais rápido, foca em "o plugin foi instalado correctamente? as libs carregam, os hooks têm permissões, ferramentas opcionais estão presentes?".

Usar `/wire-smoke` logo após `/plugin install`. Usar `/wire-doctor` para uma sessão de manutenção.

## Passo 1 — Interpretar argumento

```bash
TARGETS=()
case "${ARGUMENTS:-all}" in
  base)       TARGETS=("wire-base") ;;
  secops)     TARGETS=("wire-secops") ;;
  devkit)     TARGETS=("wire-devkit") ;;
  all|"")     TARGETS=("wire-base" "wire-secops" "wire-devkit") ;;
  *)
    echo "Uso: /wire-smoke [base|secops|devkit|all]" >&2
    exit 1
    ;;
esac
```

## Passo 2 — Localizar cada `smoke.sh` na cache

Para cada target, encontrar a versão mais recente instalada:

```bash
TOTAL_EXIT=0

for plugin in "${TARGETS[@]}"; do
  manifest=$(find ~/.claude/plugins/cache -path "*/${plugin}/*/.claude-plugin/plugin.json" 2>/dev/null \
             | sort -V | tail -1)
  if [ -z "$manifest" ]; then
    echo "✗ $plugin · não instalado (skip)"
    continue
  fi

  plugin_root="$(dirname "$(dirname "$manifest")")"
  smoke="$plugin_root/smoke.sh"

  if [ ! -f "$smoke" ]; then
    echo "! $plugin · smoke.sh ausente em $plugin_root (versão antiga sem suporte?)"
    TOTAL_EXIT=$((TOTAL_EXIT < 2 ? 2 : TOTAL_EXIT))
    continue
  fi

  bash "$smoke"
  rc=$?
  # Critério: 1 (fail) > 2 (warn) > 0 (ok); guardar o pior
  if [ $rc -eq 1 ]; then TOTAL_EXIT=1
  elif [ $rc -eq 2 ] && [ $TOTAL_EXIT -ne 1 ]; then TOTAL_EXIT=2
  fi
  echo
done
```

## Passo 3 — Resumo

```bash
case $TOTAL_EXIT in
  0) echo "=== /wire-smoke · OK ===" ;;
  1) echo "=== /wire-smoke · FAILED · há erros críticos em pelo menos um plugin ===" ;;
  2) echo "=== /wire-smoke · DEGRADED · só warnings; ferramentas opcionais em falta ===" ;;
esac
exit $TOTAL_EXIT
```

## Exit codes

| Code | Significado | Acção |
|------|-------------|-------|
| `0` | Tudo passou | Nada a fazer — instalação saudável |
| `1` | Falhas críticas | Reinstalar plugin afectado; correr `/wire-doctor` para detalhe |
| `2` | Só warnings | Ferramentas opcionais (ollama, ngrok, ~/vault/) em falta — degradação aceitável |

## Integração

- Sugerido pelo `/wire-onboard` logo após detectar plugins instalados.
- Corrível em CI (`./base/smoke.sh && ./secops/smoke.sh && ./devkit/smoke.sh`) embora não esteja no workflow GitHub Actions actual.
- Não substitui validação estática — para isso, `scripts/validate.sh` (estático, sem runtime).
- Não substitui `/wire-doctor` — para análise profunda multi-componente.

## Notas

- O `smoke.sh` de cada plugin é shippado **dentro** do plugin. Faz sentido — o teste sabe a estrutura do plugin a que pertence.
- Read-only por design — não toca em ficheiros, não pede tokens, não faz network requests por defeito (`devkit/smoke.sh` testa apenas presença de binários locais).
- Para um sanity check completo de fora (sem ter de instalar nada), `scripts/validate.sh` ataca a árvore source directamente.

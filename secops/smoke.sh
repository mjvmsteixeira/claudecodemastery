#!/usr/bin/env bash
# prumo-secops · smoke.sh — sanity check read-only do plugin.
# Sai 0 se OK · 1 se críticas · 2 se warns (degradação aceitável).
set -u

PASSED=0
FAILED=0
WARNED=0

ok()   { echo "  ✓ $*"; PASSED=$((PASSED+1)); }
fail() { echo "  ✗ $*"; FAILED=$((FAILED+1)); }
warn() { echo "  ! $*"; WARNED=$((WARNED+1)); }

echo "── prumo-secops smoke ──"

# 1. plugin.json válido — cache (post-install) com fallback source tree (dev/CI)
manifest=$(find ~/.claude/plugins/cache -path "*/prumo-secops/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null)
if [ -z "$manifest" ]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  [ -f "$script_dir/.claude-plugin/plugin.json" ] && manifest="$script_dir/.claude-plugin/plugin.json"
fi
if [ -n "$manifest" ] && jq empty "$manifest" 2>/dev/null; then
  ok "plugin.json válido em $(dirname "$(dirname "$manifest")")"
else
  fail "plugin.json não encontrado / inválido"
  echo "  passed=$PASSED  failed=$FAILED  warned=$WARNED"; exit 1
fi
plugin_root="$(dirname "$(dirname "$manifest")")"

# 2. _lib.sh source sem erros e prumo_fail_or_warn disponível (real ou stub)
if [ -f "$plugin_root/hooks/_lib.sh" ]; then
  if (set +u; source "$plugin_root/hooks/_lib.sh" 2>/dev/null && declare -F prumo_fail_or_warn >/dev/null); then
    ok "_lib.sh expõe prumo_fail_or_warn (real ou stub)"
  else
    fail "_lib.sh não expõe prumo_fail_or_warn"
  fi
else
  fail "hooks/_lib.sh ausente"
fi

# 3. prumo-base detectado (recommends)?
if find ~/.claude/plugins/cache -path "*/prumo-base/*/.claude-plugin/plugin.json" -print -quit 2>/dev/null | grep -q .; then
  ok "prumo-base detectado (hooks usam lib real)"
else
  warn "prumo-base ausente — hooks com stubs fallback (prod-fail-closed)"
fi

# 4. Hooks têm bit de execução
hooks_x=0
hooks_total=0
for h in "$plugin_root"/hooks/*.sh; do
  [ ! -f "$h" ] && continue
  hooks_total=$((hooks_total+1))
  [ -x "$h" ] && hooks_x=$((hooks_x+1))
done
if [ "$hooks_x" -eq "$hooks_total" ] && [ "$hooks_total" -gt 0 ]; then
  ok "$hooks_total hooks com bit de execução"
else
  fail "$hooks_x/$hooks_total hooks com bit de execução"
fi

# 5. vault-ttl simulado — comando benigno (ls) com VAULT_TOKEN ausente deve PASSAR (allowlist)
if [ -x "$plugin_root/hooks/pre-tool-vault-ttl.sh" ]; then
  # Stub input similar ao formato esperado (linha bash)
  set +e
  echo "ls -la" | "$plugin_root/hooks/pre-tool-vault-ttl.sh" >/dev/null 2>&1
  rc=$?
  set -e 2>/dev/null || true
  if [ $rc -eq 0 ]; then
    ok "pre-tool-vault-ttl.sh allowlist OK (ls passou sem VAULT_TOKEN)"
  else
    warn "pre-tool-vault-ttl.sh bloqueou um comando benigno (rc=$rc) — verifica allowlist"
  fi
fi

# 6. CLAUDE.md presente (runtime context)
if [ -f "$plugin_root/CLAUDE.md" ]; then
  ok "CLAUDE.md (runtime context) presente"
else
  warn "CLAUDE.md ausente — perdes contexto runtime no agente"
fi

# 7. Ollama disponível? (necessário para second-opinion)
if command -v ollama >/dev/null 2>&1; then
  if ollama list 2>/dev/null | grep -q qwen3-coder; then
    ok "ollama + qwen3-coder disponíveis (second-opinion operacional)"
  else
    warn "ollama presente mas sem qwen3-coder — second-opinion fail-closed em ops destrutivas"
  fi
else
  warn "ollama não instalado — second-opinion fail-closed em ops destrutivas"
fi

# 8. Comando novo do plano 2026-05-19 (secops-bootstrap)
cmd_file="$plugin_root/commands/prumo-secops-bootstrap.md"
if [ -f "$cmd_file" ]; then
  if head -n 10 "$cmd_file" | grep -qE '^allowed-tools:.*Bash'; then
    ok "commands/prumo-secops-bootstrap.md presente com allowed-tools: Bash"
  else
    fail "commands/prumo-secops-bootstrap.md sem 'allowed-tools: Bash' no frontmatter"
  fi
else
  fail "commands/prumo-secops-bootstrap.md ausente"
fi

# 9. Hook pre-tool-vault-ttl.sh tem os 3 patterns de allowlist do plano 2026-05-19
hook="$plugin_root/hooks/pre-tool-vault-ttl.sh"
if [ -f "$hook" ]; then
  missing=0
  for pat in prumo-vault-bootstrap prumo-secops-bootstrap prumo-vault-kv-migrate; do
    grep -q "'${pat}'" "$hook" || { fail "hook não tem pattern allowlist: $pat"; missing=$((missing+1)); }
  done
  [ "$missing" -eq 0 ] && ok "hook pre-tool-vault-ttl.sh contém os 3 patterns de bootstrap/migrate"
fi

# 10. hooks.json JSON válido + zero timeout_ms
hooks_json="$plugin_root/hooks/hooks.json"
if [ -f "$hooks_json" ]; then
  if jq empty "$hooks_json" 2>/dev/null; then
    if grep -q "timeout_ms" "$hooks_json"; then
      fail "hooks.json contém 'timeout_ms' (schema correcto é 'timeout' em segundos)"
    else
      ok "hooks.json JSON válido, sem timeout_ms (v0.4.0)"
    fi
  else
    fail "hooks.json JSON inválido"
  fi
fi

# 11. vault-policies.hcl existe + tem 7 policies
hcl_file="$plugin_root/vault-policies.hcl"
if [ -f "$hcl_file" ]; then
  if grep -qE '^# wire-[a-z-]+ —' "$hcl_file"; then
    n_policies=$(grep -cE '^# wire-[a-z-]+ —' "$hcl_file")
    [ "$n_policies" -eq 7 ] && ok "vault-policies.hcl tem 7 policies" || warn "vault-policies.hcl tem $n_policies policies (esperado 7 em v0.4.0)"
  else
    fail "vault-policies.hcl sem headers '# wire-X —'"
  fi
fi

# 12. Negative test allowlist
if [ -x "$plugin_root/hooks/pre-tool-vault-ttl.sh" ]; then
  set +e
  unset VAULT_TOKEN
  # Fixa o modo: este teste afirma fail-closed, e o vault-ttl bloqueia via
  # prumo_fail_or_warn — logo é warn-only em dev/lab por desenho. Sem pinar o
  # modo, o teste falhava em qualquer máquina com /prumo-mode dev, medindo o
  # ambiente em vez do hook.
  echo "vault read secret/foo" | PRUMO_OPERATING_MODE=prod "$plugin_root/hooks/pre-tool-vault-ttl.sh" >/dev/null 2>&1
  neg_rc=$?
  set -e 2>/dev/null || true
  if [ $neg_rc -ne 0 ]; then
    ok "allowlist negative test: vault-ttl bloqueia 'vault read' sem VAULT_TOKEN (rc=$neg_rc)"
  else
    fail "allowlist negative test FALHOU"
  fi
fi

# 12b. Hooks parseiam o JSON do Claude Code (stdin), não só texto cru.
# Regressão: em v0.4.0 inicial os hooks liam o input cru e a allowlist (ancorada a ^)
# nunca batia no JSON → bloqueava todos os diagnósticos (diagnose-deadlock).
if [ -x "$plugin_root/hooks/pre-tool-vault-ttl.sh" ]; then
  set +e
  unset VAULT_TOKEN
  json_diag='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls -la /tmp"}}'
  printf '%s' "$json_diag" | "$plugin_root/hooks/pre-tool-vault-ttl.sh" >/dev/null 2>&1
  json_rc=$?
  set -e 2>/dev/null || true
  if [ $json_rc -eq 0 ]; then
    ok "JSON parsing: vault-ttl allowlista comando diagnóstico em JSON do Claude Code (rc=0)"
  else
    fail "JSON parsing FALHOU: vault-ttl bloqueia 'ls' diagnóstico quando recebe JSON (rc=$json_rc) — diagnose-deadlock"
  fi
fi

# 13. Cada ficheiro references/ CITADO por um SKILL.md existe de facto.
#
# Antes este check só via se a pasta existia e tinha >=1 ficheiro — uma skill com
# 1 de 4 referências passava como ✓. Foi assim que 4 ficheiros em falta ficaram
# invisíveis em skills marcadas como cobertas. O que interessa não é a pasta estar
# populada; é não haver citação sem destino.
#
# O regex inclui maiúsculas de propósito: um `[a-z]` omitiu o anexoII-template.md
# numa enumeração anterior e a contagem saiu errada.
for skill_md in "$plugin_root"/skills/*/SKILL.md; do
  [ -f "$skill_md" ] || continue
  skill_dir="$(dirname "$skill_md")"
  skill="$(basename "$skill_dir")"
  cited=0; missing=0; missing_list=""
  while IFS= read -r ref; do
    [ -n "$ref" ] || continue
    cited=$((cited+1))
    if [ ! -f "$skill_dir/$ref" ]; then
      missing=$((missing+1))
      missing_list="$missing_list $ref"
    fi
  done <<< "$(grep -ohE 'references/[A-Za-z0-9._-]+\.md' "$skill_md" 2>/dev/null | sort -u)"

  if [ "$cited" -eq 0 ]; then
    ok "skills/$skill não cita references/"
  elif [ "$missing" -eq 0 ]; then
    ok "skills/$skill/references/ — $cited/$cited citados existem"
  else
    warn "skills/$skill/references/ — $missing de $cited citados em falta:$missing_list"
  fi
done

# 14. Cobertura: TODOS os commands presentes por nome (apanha rename/remoção)
for cmd in prumo-cliente-dossier prumo-compliance-snapshot prumo-incident-spread \
           prumo-ollama-doctor prumo-release-gate prumo-saas-health \
           prumo-secops-bootstrap prumo-stack-doctor prumo-tenant-audit \
           prumo-vault-doctor; do
  if [ -f "$plugin_root/commands/${cmd}.md" ]; then
    ok "command /${cmd}"
  else
    fail "command /${cmd} ausente"
  fi
done

echo
echo "  passed=$PASSED  failed=$FAILED  warned=$WARNED"

[ $FAILED -gt 0 ] && exit 1
[ $WARNED -gt 0 ] && exit 2
exit 0

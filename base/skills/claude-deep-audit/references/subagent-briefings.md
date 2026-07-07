# Subagent Briefings — claude-deep-audit

Briefings completos para os 10 subagentes lançados em paralelo na Fase 2 do workflow. Cada briefing é auto-contido — o subagente não vê a conversa principal, recebe tudo no prompt.

Formato comum de output: `SEVERITY | CATEGORY | LOCATION | FINDING | FIX`

---

## Subagente 1: CLAUDE.md health (CRÍTICO — feature-chave)

**Briefing:**
> Audita CLAUDE.md no nível global (~/.claude/CLAUDE.md), projecto (./CLAUDE.md ou ./.claude/CLAUDE.md) e em subpastas. Verifica saúde de cada um e identifica pastas que beneficiariam de CLAUDE.md próprio mas não têm.

**Verificações em cada CLAUDE.md existente:**
- Tamanho (>500 linhas → candidato a `/claude-md-optimizer`)
- Referências a skills/rules/commands inexistentes (broken refs)
- Duplicação entre global/project (mesma instrução em ambos os níveis → conflitos)
- Idioma consistente
- Tabelas de skills/rules desactualizadas vs filesystem
- Secções obsoletas (TODOs antigos, "pending" não-cumpridos)
- Faltam secções esperadas: Commands, Conventions, Golden Rules, Reference Documents

**Detecção de subpastas que merecem CLAUDE.md (HEURÍSTICAS):**

```bash
# Pasta com sub-projecto próprio (manifest distinto)
find . -mindepth 2 -maxdepth 4 \( -name package.json -o -name pyproject.toml -o -name Cargo.toml -o -name go.mod -o -name pom.xml -o -name composer.json \) -not -path "*/node_modules/*"

# Pasta com README grande
find . -mindepth 2 -maxdepth 4 -name "README*" -size +5k -not -path "*/node_modules/*"

# Pasta com muitos ficheiros próprios
find . -mindepth 1 -maxdepth 3 -type d -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sh -c 'count=$(find "$1" -maxdepth 1 -type f | wc -l); [ $count -gt 30 ] && echo "$count $1"' _ {} \;
```

**Para cada candidato (sem CLAUDE.md):**
1. Ler README (se houver), 2-3 ficheiros principais, manifest
2. Inferir:
   - Stack/linguagem
   - Comandos comuns (npm/python/make...)
   - Convenções específicas
   - Gotchas/quirks visíveis no código ou comentários
3. Gerar draft de CLAUDE.md de ~30-60 linhas
4. Devolver no relatório:
   ```
   PROPOSE | claude-md-subfolder | <pasta> | sem CLAUDE.md, ~N ficheiros, stack X | DRAFT:
   ---
   # CLAUDE.md (subpasta) — <nome>
   <draft proposto>
   ---
   ```

**Exemplo de draft (subpasta de sub-projecto Python genérico):**
```markdown
# CLAUDE.md — services/<nome-do-servico>

FastAPI + SQLAlchemy service. <uma linha sobre o propósito>.

## Commands
poetry run uvicorn src.main:app --reload
poetry run pytest

## Architecture
- src/main.py — entry point
- src/<modulo-principal>.py — lógica central
- src/db.py — schema partilhado (cuidado com migrations)
- src/config.py — carrega configuração / secrets

## Gotchas
- Secrets nunca hardcoded — sempre via loader de config
- DB schema partilhado — coordenar antes de migrar

## Rules
- Nunca commitar .env
- Tests integram com serviços locais
```

**Output:**
```
SEVERITY | claude-md | LOCATION | FINDING | FIX
HIGH     | claude-md | ./CLAUDE.md L42 | refs skill inexistente "/foo" | remover ou criar skill
HIGH     | claude-md | ./CLAUDE.md | 800 linhas — candidato a optimizer | correr /claude-md-optimizer
PROPOSE  | claude-md | services/<nome>/ | sub-projecto Python sem CLAUDE.md | DRAFT abaixo
PROPOSE  | claude-md | <pasta>/ | 45 ficheiros, convenções próprias | DRAFT abaixo
```

---

## Subagente 2: Settings 3-escopos

**Briefing:**
> Audita settings.json em 3 níveis (user `~/.claude/settings.json`, project `./.claude/settings.json`, local `./.claude/settings.local.json`). Detecta conflitos, valores duplicados, permissões over-broad ou redundantes, hooks malformados.

**Verificações:**
- Conflitos: chave definida em N níveis com valores diferentes — qual ganha (precedence: local > project > user) e se isso é intencional
- Permissões `allow:` over-broad (`Bash(*)` em vez de patterns específicos)
- Permissões duplicadas entre níveis
- Hooks com comandos inexistentes (`PreToolUse`, `PostToolUse`, `Stop`)
- `disallowedTools` que não correspondem a tools reais
- Variáveis env que dependem de paths hardcoded de máquina (ex: `/Users/<user>/`, `/home/<user>/`) — afecta portabilidade
- MCP em settings vs em `.mcp.json` (preferir `.mcp.json` para project)
- `model:` definido em local que devia ser global (ou vice-versa)
- Settings drift: campos antigos (ex: `mcpToolSearch` removido), sintaxes obsoletas

---

## Subagente 3: Skills inventory & quality

**Briefing:**
> Inventaria skills em `~/.claude/skills/` (global) e `./.claude/skills/` (local). Avalia qualidade, scope correcto, descriptions para triggering.

**Verificações:**
- Duplicados entre global/local (ficheiro com mesmo nome em ambos)
- Skills globais que referenciam paths/serviços específicos do projecto → devem ser locais
- Skills locais genéricas (vault, deploy, audit) → candidatas a globais
- Frontmatter obrigatório: `name`, `description` presentes e bem formados
- Description ajuda triggering? (verbos de acção, palavras-chave do domínio, exemplos)
- Skills com `disable-model-invocation: true` + sem `$ARGUMENTS` + conteúdo declarativo → candidata a converter em rule
- Skills sem `user_invocable: true` que devem ser invocáveis via `/comando`
- Skills com sub-documentos (`references/`, `scripts/`) — verificar se são referenciados no SKILL.md
- Skills enormes (>500 linhas no SKILL.md sem progressive disclosure) — candidatas a refactor

---

## Subagente 4: Commands inventory & quality

**Briefing:**
> Inventaria commands em `~/.claude/commands/` e `./.claude/commands/`. Avalia naming, conflitos, broken refs.
>
> **IMPORTANTE — unificação commands+skills (Claude Code v2.1.3+):**
> Desde a v2.1.3, a lista de skills/comandos apresentada ao Claude UNIFICA commands E skills. Um command em `commands/foo.md` aparece na mesma lista que skills em `skills/foo/SKILL.md`, mesmo sem haver duplicação no filesystem. NÃO concluir "duplicado" só porque o nome aparece na lista de skills do system reminder. Para detectar duplicação REAL, verificar com `ls`/`find` se o mesmo nome existe simultaneamente em DOIS sítios distintos do filesystem (ex: `commands/foo.md` E `skills/foo/SKILL.md`, ou `~/.claude/commands/foo.md` E `~/.claude/plugins/.../commands/foo.md`).

**Verificações:**
- Duplicados REAIS (mesmo nome em 2+ paths do filesystem — usar `find` em commands/ E skills/ E plugins/)
- Naming consistente (kebab-case, prefixos por área)
- Commands enormes (>300 linhas) — pode ser melhor como skill com sub-docs
- Refs a paths ou ferramentas inexistentes no sistema
- Commands com `$ARGUMENTS` mas sem documentação de uso
- Commands declarativos sem `$ARGUMENTS` → candidatos a rules

**Como detectar duplicação REAL (não confundir com unificação UI v2.1.3+):**
```bash
for cmd in ~/.claude/commands/*.md ./.claude/commands/*.md; do
  name=$(basename "$cmd" .md)
  matches=$(find ~/.claude/skills ./.claude/skills ~/.claude/plugins/cache -type d -name "$name" 2>/dev/null)
  [ -n "$matches" ] && echo "DUPLICATE: $cmd ↔ $matches"
done
```
Se `find` não devolver match, o command NÃO é duplicado, é único — apenas aparece na lista unificada de skills.

---

## Subagente 5: Agents inventory

**Briefing:**
> Inventaria agents em `~/.claude/agents/` e `./.claude/agents/`. Verifica utilidade e configuração.

**Verificações:**
- Frontmatter: `name`, `description`, `tools`, `model` (se relevante)
- Agents com tools over-broad (todas as tools) — devia ser scoped
- Agents nunca chamados (cross-ref com transcripts recentes se acessíveis)
- Description ajuda dispatching automático?
- Conflitos entre agents (mesmas responsabilidades, nomes confusos)

---

## Subagente 6: Hooks audit

**Briefing:**
> Audita hooks em settings.json (user/project/local). Detecta hooks broken, redundantes, ou que falham silenciosamente.

**Verificações:**
- Hooks com comandos cujo binário não existe (`which <cmd>`)
- Hooks com paths hardcoded inválidos
- `PreToolUse` que sempre falha (output não-JSON quando deveria, exit codes não-zero erróneos)
- Hooks redundantes (formatar 3x o mesmo ficheiro)
- Hooks demasiado lentos (>2s impacto perceptível)
- Hooks que escrevem para stdout/stderr sem captura → poluem output

---

## Subagente 7: MCP servers audit

**Briefing:**
> Audita servidores MCP em `.mcp.json`, `~/.claude/mcp.json`, e settings. Verifica funcionalidade, segurança, organização.

**Verificações:**
- Hardcoded credentials em `args:` ou `env:` → CRITICAL
- `.mcp.json` git-tracked com creds em vez de `${VAR}` → CRITICAL
- `.mcp.json` não em `.gitignore` mas tem creds → HIGH
- OS-incompatível (`cmd /c`, `powershell`) em macOS/Linux
- Comando do server não disponível (`which`, `npx --yes false <pkg>`)
- MCP duplicado: configurado em user E project com config diferente
- MCP nunca usado (sem ferramentas chamadas em transcripts) — candidato a remover
- MCP sem documentação de propósito no projecto

---

## Subagente 8: Memory health

**Briefing:**
> Audita memória em `~/.claude/projects/<proj>/memory/MEMORY.md` + ficheiros de memória. Verifica schema, duplicates, stale entries.

**Verificações:**
- MEMORY.md > 200 linhas (truncado em load — entries depois disso ignoradas)
- Entries duplicadas (mesmo ficheiro referenciado 2x)
- Ficheiros de memória órfãos (existem mas não em MEMORY.md)
- Refs em MEMORY.md para ficheiros inexistentes
- Frontmatter obrigatório: `name`, `description`, `type` (user/feedback/project/reference)
- Type inválido ou inconsistente
- Memórias project sem `**Why:**` / `**How to apply:**` (estrutura sugerida)
- Memórias com data relativa ("Thursday", "ontem") em vez de absoluta
- Memórias claramente stale (referem feature/projeto que já não existe)
- Memórias contraditórias entre si

---

## Subagente 9: Plugins audit

**Briefing:**
> Audita plugins em `~/.claude/plugins/`. Identifica instalados-mas-não-usados, marketplaces stale, conflitos.

**Verificações:**
- Plugins instalados sem skills/commands carregados nesta sessão (cross-ref com lista activa)
- Marketplaces antigos não-actualizados (>6 meses sem pull)
- Plugins que duplicam skills locais
- Plugins com erros de carregamento
- Plugins desactivados mas ainda referenciados em workflows/skills/CLAUDE.md

---

## Subagente 10: Cross-references & broken links

**Briefing:**
> Verifica todas as referências cruzadas entre artefactos Claude. Detecta links partidos, paths obsoletos, dependências ausentes.

**Verificações:**
- CLAUDE.md → skills/rules/commands inexistentes
- Skills referenciam outras skills inexistentes
- Rules referenciam ficheiros (`@rules/X.md`) inexistentes
- Memory entries referenciam ficheiros/secrets/serviços que já não existem
- Commands chamam scripts (helpers locais, etc.) — verificar existência
- Templates referenciam paths de origem (`~/.claude/templates/...`) — verificar existência

# Rollback Template — Capistrano Multi-Tenant Wire

**Skill:** `prumo-release-safety` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `prumo-release-safety`. Workflow de rollback Capistrano com
> ênfase na reversibilidade de migrations multi-tenant. Marca `[CONFIRMAR]` campos Wire-specific.

O rollback é uma **operação destrutiva** sob o regime Wire: passa por second-opinion (Ollama
qwen3-coder) e exige aprovação N2 (cross-tenant) ou N3 (se envolve migration irreversível ou
acção em Vault/pipeline). O comando `cap production deploy:rollback` nunca é executado sem este
template validado.

## Pré-condições

### 1. Reversibilidade das migrations

A maior armadilha em rollback Rails é a migration **irreversível**. Antes de qualquer rollback:

```markdown
## Análise de reversibilidade

Migrations entre v[CURRENT] e v[TARGET_ROLLBACK]:

| Migration | Reversível? | Tipo | Risco |
|-----------|-------------|------|-------|
| 20260518_add_index_x | SIM | add_index | Baixo |
| 20260518_add_column_y | SIM | add_column (nullable) | Baixo |
| 20260519_remove_column_z | NÃO | remove_column | ALTO — dados perdidos |
| 20260519_change_type_w | PARCIAL | change_column | MÉDIO — coerção de tipo |
```

**Regra:** se há migration irreversível (`remove_column`, `drop_table`, type narrowing com perda),
o rollback de código **não** reverte o schema. Opções:
- **a)** Rollback só do código (schema mantém-se forward-compatible) — possível se o código antigo
  tolera o novo schema.
- **b)** Forward-fix em vez de rollback (deploy hotfix v[CURRENT+1]).
- **c)** Restore de backup (último recurso — perda de dados desde o backup).

Decisão documentada com aprovação N3 (CTO) se opção (c).

### 2. Estado actual capturado

```markdown
## Snapshot pré-rollback

- Revision actual: [SHA / cap release timestamp]
- Revision alvo: [SHA / cap release timestamp]
- Tenants afectados: [LISTA ou "todos"]
- Backup mais recente: [TIMESTAMP] (validado restorable?)
- Migrations a reverter: [LISTA]
- Background jobs em queue: [N] (drenar antes? [SIM/NÃO])
```

### 3. Janela de manutenção

- Rollback durante incidente (S1/S2): sem janela — executar imediatamente, é contenção.
- Rollback planeado (problema não-crítico): janela de baixo tráfego, munícipios avisados se ≥48h.

## Workflow de execução

```markdown
## Execução

### Passo 1 — Aprovação
- [ ] Second-opinion Ollama validou (não-flagrante destrutivo sem razão)
- [ ] PRUMO_APPROVE=N2 (cross-tenant) ou N3 (irreversível) presente
- [ ] Release manager confirma decisão

### Passo 2 — Preparação
- [ ] Drenar background jobs se necessário (evitar jobs com schema novo a correr pós-rollback)
- [ ] Notificar #secops-deploys
- [ ] Capturar logs do estado actual (timeline)

### Passo 3 — Rollback de código
cap production deploy:rollback
- [ ] Capistrano symlinka 'current' para release anterior
- [ ] Puma restart (zero-downtime via phased restart se possível)
- [ ] Confirmar: ls -la /var/www/wire[PRODUCT]/current → release esperada

### Passo 4 — Rollback de schema (SE reversível e necessário)
RAILS_ENV=production bundle exec rails db:rollback STEP=[N]
- [ ] Apenas se análise §1 confirmou reversibilidade
- [ ] Validar schema_migrations table reflecte estado esperado

### Passo 5 — Validação pós-rollback
- [ ] Smoke test funcional (login, CRUD básico por produto)
- [ ] RLS sentinel queries (queries-evidencia.md §6) devolvem baseline
- [ ] Zabbix triggers do produto voltam a OK
- [ ] Error rate 5xx normaliza
- [ ] Sample de 5 tenants representativos verificado

### Passo 6 — Confirmação
- [ ] 30 min de observação estável
- [ ] Customer issues resolvidos / não recorrentes
- [ ] Timeline actualizada (se IR-driven)
```

## Validação por tenant

Após rollback, validar **amostra representativa** (não todos, mas tier-balanced):

```sql
-- Por tenant sentinel, confirmar dados íntegros
BEGIN;
SET LOCAL app.current_tenant = '[NIPC_SENTINEL]';
SELECT count(*) FROM wire[product]_main_table;  -- compara com baseline pré-deploy
ROLLBACK;
```

**Expected:** counts batem com snapshot pré-deploy (rollback não deve ter perdido dados,
excepto se schema rollback removeu coluna — caso documentado).

## Comunicação ao cliente

### Rollback durante incidente

Comunicação via skill `prumo-ir-multitenant` (`distribuicao-classificacao.md`).

### Rollback planeado (problema detectado em canary)

```
Assunto: Reversão de actualização — wire[PRODUCT]

Exmos. Senhores,

A Wire reverteu uma actualização recente do serviço wire[PRODUCT] após detectar
[DESCRICAO_NEUTRA] durante o processo de implantação controlada (canary).

O serviço está totalmente operacional na versão estável anterior. Nenhum dado foi
perdido [OU: indicar excepção se schema rollback removeu dados].

Não é necessária qualquer acção do vosso lado. A actualização será re-implantada após
correcção e nova validação.

Com os melhores cumprimentos,
[NOME] · Release Manager · Wire
```

## Casos especiais

### Rollback de migration irreversível

Se `remove_column` já correu:
1. **Não** tentar `db:rollback` (vai falhar ou usar `up` reverse vazio).
2. Avaliar: o código antigo funciona sem a coluna removida?
   - SIM → rollback só de código (opção a).
   - NÃO → forward-fix (opção b) ou restore (opção c, N3 approval).

### Rollback parcial (alguns tenants já em nova versão, outros não)

Em canary faseado, se Fase 2 falha, apenas os tenants da Fase 1+2 estão na nova versão:
- Rollback APENAS dos servidores/tenants afectados.
- Tenants ainda na versão antiga: sem acção.
- Documentar matriz tenant × versão pós-rollback.

### Rollback com Vault key rotation envolvida

Se o deploy rodou tenant keys, o rollback **não** desfaz a rotation (keys antigas mantêm-se
para decrypt). Confirmar que código antigo aceita key version nova. `[CONFIRMAR — política de
backward-compat de transit key versions]`

## Anti-patterns

- **Rollback sem analisar reversibilidade** — pode corromper schema.
- **Rollback de código sem rollback de schema quando incompatíveis** — 500 errors em massa.
- **Esquecer drain de jobs** — jobs com payload de schema novo falham em código antigo.
- **Rollback global quando só alguns tenants afectados** — desnecessariamente disruptivo.
- **`cap deploy:rollback` repetido** — cada rollback recua mais um release; não é idempotente.

---

## Fontes

- **Capistrano 3** — `deploy:rollback` task documentation.
- **Rails Active Record Migrations** — reversibility (`reversible`, `up`/`down`).
- **Google SRE Book** — Emergency Response, rollback strategies.
- WIRE.PRC.IRT.005 (rollback como contenção), CLAUDE.md secops (second-opinion gate).

## Como usar este template em sessão Claude Code

A skill `prumo-release-safety` invoca este template quando um canary falha um gate com degradação, ou quando se prepara contenção de incidente via rollback. Esperar como output: análise de reversibilidade das migrations + workflow checklist + comando exacto + validação pós. O rollback é destrutivo: passa por second-opinion Ollama + aprovação N2/N3; a sessão prepara mas o operador executa.

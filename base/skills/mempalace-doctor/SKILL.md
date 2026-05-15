---
name: mempalace-doctor
description: Diagnóstico de saúde do tool MemPalace (vector DB local com drawers/HNSW/Knowledge Graph/tunnels em ~/.mempalace/). Audit read-only — integridade SQLite, bloat HNSW (link_lists.bin), KG/Graph stats, idade de backups, jobs de manutenção launchd/systemd. Auto-fix apenas com confirmação explícita por mensagem. Dispara em "mempalace doctor", "diagnóstico mempalace", "saúde mempalace", "audit mempalace", "mempalace integrity", "repair mempalace". NÃO confundir com auditoria de configuração Claude Code (CLAUDE.md, settings, hooks) — para isso usar a skill irmã `claude-deep-audit`.
---

# mempalace-doctor

Auditoria operacional do MemPalace. Read-only por defeito; auto-fix apenas com confirmação explícita do utilizador.

## Trigger

- `/mempalace:doctor`
- `"diagnóstico mempalace"`, `"saúde mempalace"`, `"audit mempalace"`, `"mempalace doctor"`

## Variáveis

Os paths são resolvidos a partir de `$HOME` para portabilidade entre máquinas. O directório
do palace pode ser sobreposto por `MEMPALACE_HOME` se o utilizador o tiver configurado.

```
MEMPALACE_HOME=${MEMPALACE_HOME:-$HOME/.mempalace}
PALACE_DIR=$MEMPALACE_HOME/palace
PALACE_BACKUP=$MEMPALACE_HOME/palace.backup
PALACE_CONFIG=$MEMPALACE_HOME/mempalace.yaml
HEALTH_SCRIPT=$MEMPALACE_HOME/health-check.sh
```

Os jobs de manutenção (launchd no macOS, systemd no Linux) são detectados por padrão,
não por nome fixo:

```
# macOS:  launchctl list | grep -i mempalace
# Linux:  systemctl --user list-units '*mempalace*'
```

Se `PALACE_CONFIG` não existir, o palace não está inicializado — reportar e parar
(não tentar `init` automaticamente).

## Thresholds

```
LINK_LISTS_WARN=500M     # link_lists.bin tamanho — bloat HNSW
LINK_LISTS_CRIT=2G
PALACE_SIZE_WARN=5G      # tamanho total
PALACE_SIZE_CRIT=20G
BACKUP_AGE_WARN=14d
BACKUP_AGE_CRIT=60d
DIARY_GAP_WARN=14d       # último diary_write
KG_TRIPLES_MIN=100       # raso se < 100
KG_EXPIRED_RATIO_WARN=30 # % de triples expirados
WING_IMBALANCE_RATIO=100 # alerta se wing maior > 100× wing menor
DRAWER_DIVERGENCE=100    # |sqlite - hnsw| > 100
```

## Fluxo obrigatório

```
1. Status básico → 2. Integridade → 3. KG/Graph → 4. Mining/Hooks
→ 5. Backups/Versão → 6. Relatório → 7. Acções (com confirmação)
```

Detalhe operacional de cada etapa em `references/etapas.md` (thresholds aplicados, comandos exactos, exemplo de relatório).

## Regra de ouro

Nunca executar `repair --yes`, `kg_invalidate`, `VACUUM`, `init` ou apagar backups sem confirmação explícita do utilizador. O modo doctor é diagnóstico primeiro, acção só com aprovação por mensagem.

## Integração com wiremaze-base

Se `lib/wmz-common.sh` estiver disponível, esta skill pode:

- Respeitar `WMZ_OPERATING_MODE`: em `dev` permite auto-fix de WARN-level após confirmação simples; em `prod` exige confirmação explícita por cada acção, mesmo benignas.
- Emitir eventos para `~/.wmz/log/mempalace-doctor.log` via `wmz_log` (timestamp + acção + path).
- Backup pré-acção em `~/.wmz/backups/` em vez de `$PALACE_BACKUP`, se o utilizador preferir consolidar backups Wiremaze num único local (ver `wmz_backup`).

A skill funciona standalone se `wmz-common.sh` não existir — todas as integrações são opt-in.

## Ver também

- `claude-deep-audit` (skill irmã, mesma plugin-base) — auditoria de **configuração Claude Code** (CLAUDE.md, settings, hooks, MCPs). Domínio distinto: este doctor olha para `~/.mempalace/`; o claude-deep-audit olha para `~/.claude/` e `./`.
- `/wiremaze-vault-doctor` (em wiremaze-secops) — diagnóstico do **servidor Vault** (HA, seal, audit device, AppRoles), não confundir com os comandos `/vault-*` desta plugin-base (que são integração de segredos por-projecto).

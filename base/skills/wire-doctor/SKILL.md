---
name: wire-doctor
description: Meta-doctor do ecossistema Wire — orquestra mempalace-doctor, claude-deep-audit, /vault-audit e /wire-vault-doctor (se wire-secops instalado) numa corrida paralela, consolida num relatório único de saúde do setup local. Read-only. Dispara em "doutor wire", "saúde do setup", "saúde do ecossistema wire", "diagnóstico geral", "audit do setup". NÃO confundir com /full-audit (que vive no wire-devkit e audita um PROJECTO — código, infra, UX, performance).
---

# wire-doctor

Skill-trigger que delega para `/wire-doctor`. Meta-doctor que audita o **setup local do Claude Code + ferramentas auxiliares** (Vault, MemPalace, configuração) — *não* audita projectos.

## Trigger

- `"doutor wire"`, `"wire doctor"`, `"saúde do setup"`, `"saúde do ecossistema wire"`
- `"diagnóstico geral"`, `"audit do setup"`, `"estado dos plugins"`

## Acção

Invocar `/wire-doctor`. O command:

1. Detecta quais plugins Wire estão instalados (base/secops/devkit) e quais tools auxiliares existem (MemPalace).
2. Lança em paralelo os doctors aplicáveis: `mempalace-doctor` (skill), `claude-deep-audit` (skill), `/vault-audit` (command), `/wire-vault-doctor` (command, se secops instalado).
3. Consolida num relatório único com status verde/amarelo/vermelho por componente e plano de acção priorizado.
4. Recorda gaps de instalação se algum plugin recomendado estiver em falta.

Read-only — nenhum doctor desta cadeia altera estado. Para auditar um **projecto** (código/infra/UX/perf), usar `/full-audit` (wire-devkit).

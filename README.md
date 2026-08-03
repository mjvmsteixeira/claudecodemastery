# prumo · marketplace

Marketplace privado de plugins para Claude Code. Quatro plugins escritos em Markdown + Bash — sem compilador, sem runtime, sem dependências a instalar.

```
/plugin marketplace add mjvmsteixeira/claudecodemastery
/plugin install prumo-base@prumo
/prumo-onboard
```

O `/prumo-onboard` detecta o que falta, emite as linhas de install dos restantes e sugere os smoke tests. É idempotente — corre as vezes que quiseres.

## Os quatro plugins

| Plugin | Versão | Para quê |
|---|---|---|
| **prumo-base** | 0.10.0 | Fundação: gestão de segredos com Vault, diagnóstico do setup, governança da memória do agente. **Instalar primeiro.** |
| **prumo-secops** | 0.8.2 | SecOps para um SaaS multi-tenant — isolamento entre clientes, release gates, resposta a incidentes, conformidade. |
| **prumo-devkit** | 0.5.2 | Auditoria de código e infra: segurança, dependências, performance, UX. Read-only por defeito. |
| **prumo-design** | 0.6.1 | Orquestrador de design sobre a stack nativa do Claude. Standalone. |

**A ordem importa só numa direcção:** o `prumo-base` fornece as libs partilhadas que o `secops` assume e que o `/ngrok-expose` do `devkit` consome. Entre si, `secops` e `devkit` são independentes. O `design` não depende de nenhum.

## Por onde começar, consoante o que queres

**Gerir segredos de um projecto** → `/vault-list`, `/vault-set`, `/vault-integrate`. Migram API keys de `.env` para o Vault e substituem placeholders. O `/vault-audit` diz o que ficou por preencher.

**Saber se o teu setup está são** → `/prumo-doctor`. Orquestra os doctors todos em paralelo — memória, configuração Claude Code, Vault local e de produção — e consolida num relatório único. Read-only.

**Auditar um projecto** → `/full-audit` corre segurança, infra, qualidade, performance e UX em paralelo, com scoring unificado. Cada um também corre isolado.

**Auditar isolamento multi-tenant ou aprovar um release** → `/prumo-tenant-audit <cliente>` e `/prumo-release-gate <release>`. Ambos aplicam os controlos definidos em `secops/ctrl-w-inventario.md` e **param** se não o conseguirem ler, em vez de inventar critérios.

**Perceber onde vive cada tipo de memória** → a skill `memory-doctor` audita as três camadas (conversas, estrutura de código, documentação), arbitra colisões entre elas e propõe uma regra única de encaminhamento.

## Modo operacional

Tudo no ecossistema respeita `PRUMO_OPERATING_MODE` — `prod` (default, fail-closed), `dev` (avisa e deixa passar) ou `lab` (bypass explícito, exige o marker `~/.prumo/lab-mode`). Gere-se com `/prumo-mode`.

Em `prod` e `dev`, operações destrutivas exigem `PRUMO_APPROVE=N1|N2|N3` no ambiente do Claude Code. Em `lab` passam todas, com registo `via=lab-bypass`. **Isto é defense-in-depth e audit-logging, não uma barreira de autorização inquebrável** — ver o disclaimer no fim.

## Estrutura

```
.claude-plugin/marketplace.json   ← source of truth: nomes e directorias
base/     16 commands · 11 skills · 3 hooks · lib/{prumo-common,vault-env}.sh
secops/   10 commands ·  6 skills · 6 agents · 8 hooks · 23 references
devkit/    8 commands ·  9 skills · 1 agent  · 1 hook
design/    1 command  ·  1 skill
scripts/  validate.sh · package.sh
```

O `marketplace.json` é a fonte única da lista de plugins — nenhum comando a escreve à mão, e o `validate.sh` rebenta se alguém voltar a fazê-lo.

## Desenvolvimento

```bash
./scripts/validate.sh              # checks estáticos — correr antes de qualquer tag
./scripts/package.sh               # empacota os quatro em /tmp/*.plugin
./scripts/package.sh base          # só um
```

Tags seguem `prumo-<plugin>-v<versão>`, uma por plugin e por release. A invariante é verificável: `git show <tag>:<plugin>/.claude-plugin/plugin.json` tem de mostrar essa versão.

Guidance de desenvolvimento em `CLAUDE.md`. Trabalho em aberto em `BACKLOG.md`. Histórico agregado em `CHANGELOG.md`, com detalhe por plugin em cada `<plugin>/CHANGELOG.md`.

## Stack assumido pelo `prumo-secops`

Um padrão arquitectural genérico, não ferramentas concretas: broker de segredos, SIEM central, firewall de perímetro, monitorização activa, base de dados multi-tenant e servidores aplicacionais. Os exemplos no `secops/CLAUDE.md` descrevem o ambiente onde o plugin nasceu e **podem ser adaptados ao teu tooling** — é alteração documental; as skills e hooks são agnósticos ao nível conceptual.

## Disclaimer

Software fornecido "tal como está", sem garantias de qualquer tipo. A utilização é da inteira responsabilidade do utilizador.

- Os plugins **classificam e sinalizam** operações — não substituem os controlos de segurança do teu ambiente.
- Valida o comportamento dos hooks no **teu** contexto antes de confiar neles em produção. Testa em `dev` ou `lab` primeiro.
- Nenhum conteúdo constitui aconselhamento jurídico ou de conformidade. Referências a NIS2, RGPD e afins são ilustrativas do domínio; o cumprimento é do operador.
- Operações destrutivas, com credenciais ou sobre dados de produção ficam sempre sob julgamento e autorização humana.

---

© 2026 mjvmst · mjvmst@gmail.com · Repositório privado

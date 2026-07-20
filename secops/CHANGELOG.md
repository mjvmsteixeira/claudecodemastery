# Changelog — prumo-secops

Formato: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versionamento: [SemVer](https://semver.org/spec/v2.0.0.html).

## v0.6.4 — 2026-07-20

**Colisão de nomes resolvida — e dois dos quatro casos não eram o que pareciam.** Todas as 24 citações `references/` do plugin resolvem agora para ficheiros existentes, e não há dois ficheiros com o mesmo basename.

- **`tenant-isolation` → `template-cliente.md` era um nome errado, não um ficheiro em falta.** O relatório Art. 28 já existia como `template-relatorio.md`, e a própria skill citava-o correctamente 90 linhas mais abaixo. A linha de pré-requisitos usava um nome que, por acaso, é o de uma peça **diferente** no `prumo-ir-multitenant` (comunicação de incidente ao município). Corrigida a citação; nenhum ficheiro novo.
- **`cliente-dossier` → `distribuicao-classificacao.md` é cross-reference legítima.** Passa a apontar para `../prumo-ir-multitenant/references/`. A política TLP vive numa skill só — duplicá-la criaria duas versões a divergir, e ter duas políticas de distribuição em vigor é pior do que não ter nenhuma.
- **`painel-template.md` → renomeado para `painel-isolamento.md`** e escrito. É o painel transversal dos 16 controlos, distinto do `painel-template.md` do `prumo-saas-monitoring`, que é o de saúde da plataforma. Impõe "não avaliado" como categoria própria (nunca conforme), não-conformidade crítica a reprovar o painel inteiro sem média ponderada, e registo da cobertura da própria auditoria — `16/16` sobre 5 municípios amostrados de 170 não afirma o mesmo que sobre o parque completo.
- **`queries-evidencia.md` escrito.** Ao contrário dos mappings do compliance, **este era escrevível**: a matriz CTRL-W-T-001..016 está definida no `SKILL.md` desta skill. Queries por controlo, cada uma com campo obrigatório de **limitação** — o mais omitido e o que evita relatórios de conformidade falsos de boa-fé. Duas limitações materiais assinaladas: `relforcerowsecurity` sem o qual o dono da tabela contorna a RLS (activa e a não proteger nada), e o audit log de cross-tenant que só prova ausência de acesso *registado*, não de acesso.
- **Check 13 do `smoke.sh` passa a aceitar cross-references** `../<skill>/references/x.md`, que de outro modo contaria como ficheiro em falta.
- Avisos do smoke relativos a referências: **0**.

## v0.6.3 — 2026-07-20

**3 referências do `prumo-release-safety` escritas — e o check que as contava estava a mentir.**

- `canary-plan-template.md` — critérios de composição do painel (volume, produtos, versão de Rails, configuração, dataset, criticidade, fuso), degraus 5/25/50/100 com os tempos do `SKILL.md`, métricas contra baseline do produto e critérios de aborto imediato. Duas regras que evitam a maioria dos erros: nunca pôr no primeiro degrau um município em época crítica, e manter o painel estável entre releases — rodá-lo destrói a comparabilidade e deixa de se saber se a métrica mudou por causa do release ou do painel. **A lista concreta de tenants continua por preencher**: é escolha deliberada sobre que caminhos de código se quer exercitar, não se deduz.
- `rollback-template.md` — classificação A–D por reversibilidade da migration, com a distinção que estrutura tudo: **classe D não tem rollback, tem recuperação de desastre**. Um `drop` tratado como reversível é o erro que este template existe para prevenir. Impõe preservar-antes-de-reverter (um rollback destrói a evidência de um incidente que ainda ninguém percebeu ser incidente), tentar a feature flag antes do rollback de código, e estimar o tempo da migration sobre o **maior** dataset do parque e não sobre pré-prod.
- `changelog-template.md` — muda de eixo em vez de resumir o changelog interno: o que não tem efeito observável para o cliente não entra. Regras de breaking change (anunciar antes, nomear o que deixa de funcionar, dar alternativa, datar a remoção, contactar directamente quem está afectado) e a separação face à comunicação de incidente, que segue o `template-cliente.md` do IR.

**Bug — o check 13 do `smoke.sh` só verificava se a pasta `references/` existia e tinha ≥1 ficheiro.** Uma skill com 1 de 4 referências passava como `✓`. Foi assim que **4 ficheiros em falta ficaram invisíveis** em skills marcadas como cobertas: `prumo-cliente-dossier` (1 de 3) e `prumo-tenant-isolation` (3 de 4). O check passa a validar que **cada ficheiro citado por um `SKILL.md` existe de facto**, e nomeia os que faltam. O regex inclui maiúsculas — um `[a-z]` tinha omitido o `anexoII-template.md` numa enumeração anterior.

**Colisão de nomes a assinalar.** Três dos quatro em falta partilham nome com ficheiros de outras skills (`template-cliente.md`, `painel-template.md`, `distribuicao-classificacao.md`) mas são peças diferentes — o `template-cliente.md` do tenant-isolation é um relatório Art. 28, não a comunicação de incidente do IR. Um agente que resolva o nome pela skill errada produz a peça errada com aspecto correcto. Fica por decidir se são cross-references a corrigir para `../<skill>/references/` ou ficheiros distintos a escrever.

## v0.6.2 — 2026-07-20

**5 referências do `prumo-saas-monitoring` escritas (472 linhas).** Restam 3, todas do `prumo-release-safety`.

- `wazuh-rules.md` — gamas de ID (nativas 0–99999 vs locais ≥100000), tradução `level` → P1–P4 com a ressalva de que **level 12+ não é automaticamente P1** (o critério é blast radius) e o inverso importa mais: um level 5 em vários municípios é P1. Estrutura de catálogo com campo obrigatório de falsos positivos conhecidos, e os comandos que cruzam regras definidas com regras que dispararam — de onde saem directamente os alertas silenciosos e ruidosos da auditoria.
- `wazuh-fortigate-pairs.md` — catálogo de 9 pares com a semântica dos quatro resultados possíveis. Fixa a assimetria que dá valor à correlação: **Fortigate sem Wazuh é bom sinal** (perímetro conteve), **Wazuh sem Fortigate é mau sinal** (algo entrou sem ser visto). Inclui pares com "nenhuma correspondência esperada" — sem eles, toda a ausência é tratada como suspeita e a triagem afoga-se.
- `zabbix-canonical-templates.md` — mapping host-tipo → template obrigatório, com items mínimos por template. `p95` comparado com baseline do produto e não com limiar fixo (com produtos entre 95 ms e 310 ms, um absoluto ou nunca dispara ou dispara sempre). Trigger sem acção de notificação classificado como crítico: dá cobertura aparente, pior do que ausência assumida.
- `runbook-correlacao.md` — 8 passos, do evento âncora à escalada. Abre com verificação de deriva de NTP, porque uma correlação sobre relógios dessincronizados não é imprecisa, é aleatória. Exige duas hipóteses com contra-evidência explícita.
- `painel-template.md` — origem de cada campo e regras de degradação. `n/d` nunca é substituído por valor plausível, e `COVERAGE` sem dados fica `n/d` e não `0%` — zero é medição, `n/d` é ausência dela.
- **IDs custom e inventário ficam por preencher**, pelo mesmo critério das versões anteriores: são facto do ambiente, e `rule_id` inventados produzem queries que devolvem vazio e passam por "sem alertas".
- Avisos do smoke: 2 → 1.

## v0.6.1 — 2026-07-20

**5 referências do `prumo-compliance-provider` escritas (515 linhas), e um achado maior a montante.**

- **Correcção à contagem de v0.6.0: são 18 referências em falta, não 17.** O regex usado para as enumerar (`references/[a-z0-9._-]+\.md`) não incluía maiúsculas e omitiu o `anexoII-template.md`. O compliance tinha **5** referências por escrever, não 4.
- **Templates escritos na íntegra**: `anexoII-template.md` (Anexo II do Art. 28(3) — categorias, medidas técnicas, sub-subcontratantes, violação, devolução, auditoria, com nota de que só as secções de dados e titulares variam legitimamente entre municípios), `dpia-template.md` (contributo técnico da Wire para a DPIA do município, com a distinção responsável/subcontratante explícita e uma coluna "Responsável" por medida, para não dar ao município falsa cobertura), `caiq-pre-filled.md` (formato, regras de redacção e processo do banco canónico).
- **Os dois mappings ficam com a coluna de cobertura vazia, deliberadamente.** `mapping-nis2.md` enumera as 10 medidas do Art. 21(2) e as fases do Art. 23; `mapping-iso27001.md` fixa a estrutura do Anexo A:2022 (4 temas, 93 controlos) e o processo de Declaração de Aplicabilidade. A correspondência com controlos Wire **não foi escrita** — ver ponto seguinte.
- **`caiq-pre-filled.md` não contém respostas pré-preenchidas**, apesar do nome. O CAIQ v4 tem ~261 perguntas; fabricá-las seria emitir declarações falsas a clientes sob um rótulo ("pré-preenchido") que garante que ninguém as verifica antes de enviar. O ficheiro define formato, regras e processo; as respostas entram à medida que forem validadas.
- **Achado — os `CTRL-W-*` são citados em todo o plugin e nunca definidos.** `CTRL-W-T-001..016` e `CTRL-W-R-001..018` aparecem como intervalos em comandos (`/prumo-tenant-audit`, `/prumo-release-gate`), agents e skills, mas nenhum artefacto do repositório diz o que cada controlo verifica — a definição vive no `WIRE.MTZ.SEC.006`, externo. É o mesmo defeito que as referências ausentes, e afecta comandos além de skills: `"aplica CTRL-W-T-001..016"` corre no vazio. Registado no `SKILL.md` do compliance como dependência por resolver; **tratar o inventário como artefacto do plugin fica por decidir**.
- Secção de referências do `SKILL.md` actualizada — as anotações `(a criar)` já não descreviam o estado.
- Avisos do smoke: 3 → 2.

## v0.6.0 — 2026-07-20

**As skills mandavam decidir com base em ficheiros que não existiam.** Descoberto ao investigar os 4 avisos `references/ ausente` do smoke, que estavam catalogados como dívida da Fase 3. Não eram cosméticos: 17 ficheiros citados em 4 skills, **zero existentes** — e as skills não os *mencionam*, delegam-lhes decisões.

O caso extremo estava no `prumo-ir-multitenant`: *"Classifica severidade (S1–S4) usando os critérios em `references/severity-matrix.md`"* e *"Template em `references/template-cliente.md`"* para a notificação ao município ao abrigo do RGPD Art. 33 §2. Sem os ficheiros, o agente inventa a classificação e redige a notificação de raiz — sob pressão de incidente, e com prazos regulatórios a correr. O modo de falha é silencioso: a peça sai com aspecto institucional e sem lastro nenhum.

- **5 referências do IR escritas** (560 linhas): `severity-matrix.md` (portas S1–S4, regra do sinal ausente Wazuh↔Fortigate, multiplicador multi-tenant, desescalada com visto), `timeline-template.md` (UTC, append-only, facto separado de hipótese, T0 = conhecimento, cadeia de custódia), `distribuicao-classificacao.md` (TLP v2.0 por destinatário, regra de degradação), `template-cliente.md` (inicial/actualização/encerramento, com secção de correcção explícita), `cncs-template.md` (três fases T+24h/T+72h/T+30d, e a distinção entre a notificação da Wire como fornecedor e a de cada município como entidade essencial — paralelas, não alternativas).
- **Marcadas como rascunho operacional.** Cada ficheiro traz cabeçalho de validação. Estruturam-se sobre o que o `SKILL.md` já compromete, mas limiares internos e o formulário do CNCS **não foram verificados contra fonte oficial** — está dito no cabeçalho de cada um. Um template com aspecto oficial e conteúdo não verificado seria pior do que a ausência.
- **Regra de paragem nas 4 skills, graduada pelo risco.** `prumo-ir-multitenant` e `prumo-compliance-provider` **param e assinalam** se uma referência faltar — inventar uma matriz de severidade ou um mapping de controlos produz uma afirmação sem lastro que ninguém detecta a tempo. `prumo-saas-monitoring` e `prumo-release-safety` degradam com aviso explícito, com a excepção da lista de tenants representativos do canary, que não se deduz e tem de ser pedida.
- No IR acresce que referências marcadas como rascunho não validado **não saem para destinatário externo** (município, CNCS, CNPD) sem visto do Coordenador SecOps.
- Avisos do smoke: 4 → 3. Os 3 restantes (`compliance-provider`, `saas-monitoring`, `release-safety`) mantêm-se como dívida assumida, agora com falha ruidosa em vez de silenciosa.

## v0.5.3 — 2026-07-20

**`/prumo-secops-bootstrap`: o split do HCL partia-se quando corrido como slash command.** O Passo 5 usava `match($0, …)`/`substr($0, …)` em awk para separar as 7 policies do `vault-policies.hcl`.

- **Bug — variáveis posicionais nuas são substituídas pelo harness.** Num slash command, `$0` é substituído pelos argumentos da invocação *antes* de o bloco correr: `match($0, /wire-[a-z-]+/)` chegava ao awk como `match(--plan, …)`, que é aritmética sobre uma variável indefinida, não a linha. O split produzia 0 ficheiros e o command abortava com "Split do HCL produziu 0 ficheiros, esperados 7". `${1:---plan}` (com chavetas) sobrevive à substituição; `$0` não — daí o defeito passar despercebido no Passo 1.
- **Corrigido** com um loop `while IFS= read -r line` em bash puro, sem variáveis de campo do awk e portanto sem colisão possível com placeholders do harness. Verificado contra o `vault-policies.hcl` real: 7 ficheiros, todos com os `path` blocks intactos.
- Só este ficheiro usava o padrão em todo o marketplace.

## v0.5.2 — 2026-07-17

**Portabilidade Linux: `pii-redact` deixa de fazer fail-open sem `shasum`.** Descoberto ao investigar uma falha de CI (que era outra: ver abaixo). O hook usava `shasum` (script perl) no caminho de bloqueio, **antes** do `exit`. Com `set -e`, num Linux sem perl (`shasum` ausente → 127), o hook saía 127 em vez de 2 — a PII detectada **não era bloqueada** (fail-OPEN). O CI (ubuntu-latest tem perl) nunca deu por isso. Fallback para `sha256sum` (coreutils) e, em último caso, um marcador; o bloqueio nunca aborta por falta da ferramenta de hash. Verificado em container sem `shasum`: 18/18 casos de PII bloqueiam.

Nota: o `telemetry-test` do eval-harness (que fez o CI ficar vermelho) foi corrigido à parte — usava `\t` em `grep`, que o GNU grep não interpreta como tab (o BSD grep do macOS interpretava). Não é conteúdo de plugin, não altera versão.

## v0.5.1 — 2026-07-16

**Os gates deixam de treinar evasão.** Origem: o `pii-redact` bloqueava o trailer `Co-Authored-By:` que o system prompt do Claude Code exige em **todos** os commits, e a única saída era ofuscar o email em shell — passando pelo gate sem deixar rasto na telemetria. Um gate que treina evasão destrói o audit trail que existe para produzir.

- **`pre-tool-pii-redact.sh` — allowlist estrutural.** Trailers git (`Co-Authored-By`, `Signed-off-by`, `Reviewed-by`, `Acked-by`, `Tested-by`, `Reported-by`) e remotes SSH scp-style (`git@host:`) deixam de ser lidos como email de titular. Substituição por token e não por linha (o trailer tanto vem em heredoc como em `-m` inline). Risco residual aceite e documentado: um email formatado como trailer bem-formado passa; PII *fora* do trailer continua classificada (`pii-16`).
- **`pre-tool-pii-redact.sh` — respeita `PRUMO_OPERATING_MODE`.** Bloqueava com `exit 2` cru, pelo que `/prumo-mode dev` não tinha efeito nenhum sobre ele — era o único classificador do plugin fora da convenção do repo sem excepção documentada. Passa a bloquear via `prumo_fail_or_warn`.
- **`pre-tool-pii-redact.sh` — bypass audit-tracked a sério.** O caminho `PRUMO_PII_DISABLE=1` saía com `exit 0` sem registar nada: a telemetria dizia `allow`, indistinguível de input limpo, contra o que o `CLAUDE.md` afirmava em dois sítios. Passa a registar decisão `bypass`, como o `second-opinion` já fazia.
- **`pre-tool-pii-redact.sh` — falso positivo na regex de telefone.** Faltava âncora à esquerda: a regex podia começar a meio de uma corrida de dígitos e bastava-lhe o `\b` final, pelo que qualquer inteiro de 10+ dígitos cujos últimos 9 comecem em 2/3/9 disparava `telefone-PT` (ids, epochs em ms, contagens de bytes).
- **`pre-tool-approval-gate.sh` — remediação seguível.** A mensagem mandava `PRUMO_APPROVE=Nx <comando>`, impossível de cumprir: um hook PreToolUse corre no processo do Claude Code, antes do comando e noutro ambiente, por isso o prefixo inline aplica-se ao filho e nunca ao hook. Sem outra saída documentada o gate era intransponível dentro da sessão. Passa a apontar para `settings.json` → `env`, com aviso explícito de que autoriza o nível inteiro na sessão e não o comando.
- **`CLAUDE.md`:** corrigida a afirmação de audit-tracking; documentado que as variáveis de gate não aceitam prefixo inline; acrescentado o alcance real do `pii-redact` (dispara depois de o modelo já ter emitido o texto e não gate `Read`/`Grep` — impede persistência/transmissão, não a entrada em contexto).

Sem alterações de comportamento em produção para input com PII genuína: `prod` continua fail-closed.

## v0.5.0 — 2026-07-07

**Guardrail semântico + fix de segurança CRÍTICO** (adicionado à linha 0.5.0 em 2026-07-07):

- **SECURITY (CRÍTICO) — `pre-tool-vault-ttl.sh`:** corrigido bypass total da exigência de `VAULT_TOKEN`. `HAS_CHAIN` não detectava `&` simples nem newline como separadores de statement — `echo hi & vault write …` e `echo hi\nvault write …` passavam pelo allowlist `^echo` sem token enquanto o bash real executava a segunda instrução. Agora ambos são bloqueados (fail-closed).
- **SECURITY (alto) — `pre-tool-approval-gate.sh`:** mesma classe de fronteira alargada com `(`/backtick; `rm`/`truncate` embrulhados em `$()`/backtick voltam a disparar N1/N2/N3 e o `approvals.log`.
- **Guardrail semântico (Fase 02) — `pre-tool-second-opinion.sh`:** classificação via Ollama local na zona-cinzenta (ofuscação que a regex não apanha), comando como dado não-confiável (anti-injeção), veredicto JSON, conservador (em dúvida bloqueia), bypass audit-tracked. Fronteira `eval`/`bash -c` alargada; guard `jq` fail-closed.
- **Telemetria (Fase 03):** hooks instrumentados via `prumo_telemetry_init`; `_lib.sh` com stubs no-op quando o base falta.
- **Templates:** criados `cncs-template.md` + `template-cliente.md` (IR), `template-relatorio.md` (isolamento) e `painel-template.md` (monitoring), antes referenciados mas inexistentes.
- Consistência: prefixos de log uniformizados para `[prumo-secops/<hook>]`; default de `PRUMO_LOG_DIR` centralizado no `_lib.sh`.

**BREAKING — rebranding wire → prumo** (2026-07-06). O plugin passa a chamar-se `prumo-secops` no marketplace `prumo`.

- Renomeados: comandos `/wire-*` → `/prumo-*`, skills e agents `wire-*` → `prumo-*`, env vars `WIRE_*` → `PRUMO_*`
- Intocado (domínio de produção): produtos wirepaper/wireforms/wiredesk, hostnames `wire-*`, AppRoles e policies Vault (`wire-monitor`, …), entradas Keychain (`-a wire-secops`), regras Wazuh e templates Zabbix
- `hooks/_lib.sh` passa a descobrir `prumo-base`/`lib/prumo-common.sh` no cache (requer prumo-base ≥ 0.5.0)
- Upgrade: `/plugin uninstall wire-secops@jump2new` seguido de `/plugin install prumo-secops@prumo`

## [0.4.0] - 2026-05-19 ("Honest")

### ⚠ Upgrade · OBRIGATÓRIO uninstall + reinstall

v0.4.0 corrige **três hooks que estavam funcionalmente partidos em v0.3.x** (timeouts ignorados, approval-gate broken stdin, pii-redact no-op). **Cache antiga lado-a-lado da nova provoca comportamento inconsistente.** Faz sempre:

```
/plugin uninstall wire-secops@jump2new
/plugin install wire-secops@jump2new
```

Recarrega a sessão Claude Code para os hooks novos entrarem em vigor.

### ⚠ Behavior change · hooks deixam de ser bypassed

Em v0.3.x, alguns workflows podiam estar a depender de operações destrutivas passarem silenciosamente (hooks broken). Em v0.4.0:

- `pre-tool-approval-gate.sh` bloqueia ops destrutivas até **`WIRE_APPROVE=N1/N2/N3`** ser exportada
- `pre-tool-pii-redact.sh` bloqueia tool calls com PII detectado (NIF, IBAN PT, CC PT, email, telefone PT 9 dígitos)
- `/wire-vault-doctor` exige `VAULT_ADDR` explícita (sem fallback silencioso para localhost)
- Hooks usam `${WIRE_LOG_DIR:-$HOME/.wire/log}` em vez de `/var/log/` root-owned

Se tinhas workflows que dependiam de bypass, agora precisam de autorização explícita. Vê secção "Variáveis de ambiente do plugin" em `CLAUDE.md`.

### Adicionado

- **20 templates `references/*.md`** em todas as 6 skills (progressive disclosure funcional):
  - `wire-ir-multitenant/references/`: severity-matrix, timeline-template, distribuicao-classificacao
  - `wire-compliance-provider/references/`: mapping-nis2, mapping-iso27001, anexoII-template, dpia-template, caiq-pre-filled
  - `wire-saas-monitoring/references/`: wazuh-rules, wazuh-fortigate-pairs, zabbix-canonical-templates, runbook-correlacao
  - `wire-tenant-isolation/references/`: template-cliente, queries-evidencia, painel-template
  - `wire-release-safety/references/`: canary-plan-template, rollback-template, changelog-template
  - `wire-cliente-dossier/references/`: dossier-template, sla-calculation
- **Convenção `WIRE_*` env vars** documentada em `CLAUDE.md` ("Variáveis de ambiente do plugin")
- **`/wire-vault-doctor`** fail-fast quando `VAULT_ADDR` não exportada (mensagem pedagógica com prod e dev endpoints)
- **`smoke.sh`** cobertura expandida: hooks.json schema, vault-policies.hcl policies count, negative allowlist test, references count per skill
- **Skills · bloco "Pré-requisitos"** em 4 skills explicita Vault AppRole + env vars + cross-links a `references/*.md`

### Corrigido

- **Hook input parsing (crítico)**: o Claude Code entrega aos hooks de tipo `command` um **JSON via stdin** (`{"tool_name":"Bash","tool_input":{"command":"..."}}`), não o comando cru. Os hooks liam `${1:-$(cat)}` e faziam grep sobre o JSON inteiro — a allowlist do `vault-ttl` (patterns ancorados a `^`) nunca batia, bloqueando **todos** os comandos diagnósticos em runtime (diagnose-deadlock). Adicionado parser partilhado `hook_tool_payload` em `_lib.sh`; os 4 hooks PreToolUse extraem `.tool_input.command` (Bash) / `.tool_input.{file_path,content,old_string,new_string}` (Write/Edit). `post-tool-cef-wazuh.sh` parseia o evento JSON em vez de env vars `CLAUDE_TOOL_*` (que não existem). Retro-compatível com texto cru (CLI/testes)
- **Hook timeout schema**: `timeout_ms` → `timeout` em segundos em todas as 7 entradas de `hooks.json` (Claude Code schema)
- **`pre-tool-approval-gate.sh`** reescrito — env var `WIRE_APPROVE=N1/N2/N3` (substitui `read` interactivo broken). Aceita combinações de flags (`-rfv`, `-fr`), trailing args (`cap production deploy --branch X`), SQL comments (`DROP/**/TABLE`), `git push -f`, payloads multi-line, `--force-with-lease`
- **`pre-tool-pii-redact.sh`** reescrito — fail-closed-on-detected-PII com regex calibradas (NIF, IBAN PT 25 chars, CC PT, email, **telefone PT 9 dígitos** — corrigido de 8). Skip binary content portable (BSD grep compatible)
- **`pre-tool-second-opinion.sh`** — `OLLAMA_HOST` e `OLLAMA_MODEL` env vars (consistente com doctor), JSON construído via `jq --arg` (sem injection), verdict regex aceita preamble LLM-comum
- **`pre-tool-vault-ttl.sh`** — `rm` allowlist tightened, exclui `$HOME/<x>` excepto `$HOME/.wire/`
- **`post-tool-cef-wazuh.sh`** — log path `${WIRE_LOG_DIR:-$HOME/.wire/log}/cef.log` (em vez de `/var/log/` root-owned); `shasum -a 256` em vez de `sha256sum` (macOS-compat); namespace `WIRE_WAZUH_HOST`; graceful fallback se LOG_DIR unwritable
- **`post-tool-vault-revoke.sh`** — source de `VAULT_*` env via `find ... | sort -V` (em vez de glob lexicográfico); Linux-only `shred` guarded
- **`/wire-vault-doctor`** — temp files via `mktemp` (não `/tmp/*.json` fixos); `wire-secops-login` dead refs substituídos por instruções concretas de AppRole login (Keychain → `vault write auth/approle/login`)
- **`/wire-ollama-doctor`** — `wire-secops-login` ref substituída; default `OLLAMA_MODEL=qwen3-coder:30b`
- **`/wire-stack-doctor`** — env vars críticas (`WIRE_WAZUH_HOST`, `FORTIGATE_HOST`, `ZABBIX_URL`) com fail-fast `: "${X:?msg}"`; GitHub URL agora parseado de `marketplace.json` em vez de hardcoded
- **`/wire-secops-bootstrap`** — TLS fail-fast (HTTPS sem CA cert é hard-fail, não silent fallback)
- **`vault-policies.hcl`** — comment "Seis AppRoles" → "Sete AppRoles (6 + Cowork external)"; justificações inline para `sys/audit-hash/*` (wire-ir) e `sys/policies/acl/*` (wire-tenant)
- **`CLAUDE.md`** — commands section actualizada para 10 commands (inclui `/wire-secops-bootstrap`); AppRoles table marca Cowork como external; backends list expandida com `secret/data/db/schemas/*` e `sys/policies/acl/*`
- **`README.md`** — nova tabela "Commands (resumo)" com 10 entries; links `/wire-vault-bootstrap` annotados como `(wire-base)`
- **Skills curl inline** — 4 skills (`wire-saas-monitoring`, `wire-ir-multitenant`, `wire-tenant-isolation`, `wire-cliente-dossier`) com bloco "Pré-requisitos" + exemplo curl directo com auth Vault (sem wrappers fantasma)
- **Agents** — `wire-monitor-01` perde `WebFetch` (read-only enforcement explícito); `wire-tenant-01` ganha capability "metadata fetch para dossiers"; hardcoded paths substituídos por env vars (`WIRE_FORENSICS_DIR`, `WIRE_EPHEMERAL_KEY_DIR`, `WIRE_RAILS_DEPLOY_BASE`)
- **Cosign clarification** — `wire-deploy-01.md` explicita que cosign aplica-se a containers (Vault HA, Wazuh); apps Rails Capistrano usam checksum equivalente (CTRL-W-R-008b a definir na Wire SaaS)
- **Typo**: "deligar" → "desligar" em `wire-release-safety/SKILL.md`

### Removido

- `WebFetch` tool grant de `wire-monitor-01` (não usado; remoção de scope desnecessário)

### Fonte

- Plano: `docs/superpowers/plans/2026-05-19-wire-secops-v0.4/`
- Spec: `docs/superpowers/specs/2026-05-19-wire-secops-v0.4-honest-design.md`
- Audit base: 2 subagents paralelos sobre `secops/` (9 Critical + 12 Important findings); code reviewer encontrou +5 bugs de bypass durante implementação, todos resolvidos

---

## v0.3.0 — 2026-05-19

### ⚠ Upgrade · OBRIGATÓRIO desinstalar a versão antiga antes de instalar v0.3.0

O hook `pre-tool-vault-ttl.sh` ganhou patterns novos na allowlist. Se a cache do v0.2.x ficar lado-a-lado da v0.3.0, o hook antigo pode bloquear comandos que a v0.3.0 já allowlistou — comportamento inconsistente.

```
/plugin uninstall wire-secops@jump2new
/plugin install wire-secops@jump2new
```

Recarrega a sessão Claude Code para o hook novo entrar em vigor. `/plugin list` deve mostrar `wire-secops · 0.3.0 · user` (uma entrada apenas).

### Adicionado

- **`/wire-secops-bootstrap`** — provisiona conteúdo Wire-specific no Vault assumindo infra base já provisionada. Inclui: 7 policies wire-* via split do `vault-policies.hcl` shipado, 7 AppRoles com TTLs hardcoded (espelham comentários do HCL), `transit/keys/forensics`, `ssh/config/ca`, `ssh/roles/wire-srv-role` + `ssh/roles/wire-ir-role`. Popula macOS Keychain + `~/vault/approle-credentials.json` (chmod 600) por cada AppRole. Idempotente, `--plan` (default) / `--apply`. Marca rotações de secret-id como `⟳` no plano para confirmação explícita.

### Alterado

- `hooks/pre-tool-vault-ttl.sh`: adicionados 3 patterns à `ALLOWLIST_PATTERNS` (`wire-vault-bootstrap`, `wire-secops-bootstrap`, `wire-vault-kv-migrate`) para resolver o chicken-and-egg de bootstrap (precisa de root pre-AppRole). Defesa em profundidade: cada comando valida policy='root' internamente; allowlist sozinha não autoriza nada destrutivo.

- `smoke.sh`: asserts do novo command + presença dos 3 patterns no hook.

### Adicionado (validate.sh)

- Nova secção 7c em `scripts/validate.sh` que verifica a presença dos 3 patterns na allowlist do hook.

### Fonte

Plano: `docs/superpowers/plans/2026-05-19-wire-vault-bootstraps/`.
Resolve findings #3 e parte de #4 do `/wire-vault-doctor`.

## [0.2.0] — 2026-05-15

### Added

- **`smoke.sh`** — sanity check read-only chamado pelo `/wire-smoke` do `wire-base`. Testa: plugin.json válido, `_lib.sh` expõe `wire_fail_or_warn` (real ou stub), wire-base detectado na cache, hooks executáveis, allowlist do `pre-tool-vault-ttl.sh` passa um `ls` sem token, `CLAUDE.md` presente, ollama/qwen3-coder disponíveis. Funciona em cache (post-install) e source tree (dev/CI).

## [0.1.0] — 2026-05-15

Versão inicial do plugin no marketplace `jump2new`.

### Added

- **6 agents** `wire-*-01`: `wire-monitor-01` (Wazuh+Fortigate+Zabbix), `wire-ir-saas-01` (IR multi-tenant), `wire-tenant-01` (isolamento), `wire-srv-saas-01` (servidores Rails nativos), `wire-deploy-01` (release gate Capistrano), `wire-compliance-01` (NIS2 + RGPD).
- **6 skills** `wire-*`: `wire-tenant-isolation`, `wire-saas-monitoring` (correlação Wazuh↔Fortigate↔Zabbix), `wire-ir-multitenant`, `wire-release-safety`, `wire-compliance-provider`, `wire-cliente-dossier`.
- **9 commands** `/wire-*`:
  - Operação: `/wire-saas-health`, `/wire-tenant-audit`, `/wire-incident-spread`, `/wire-release-gate`, `/wire-cliente-dossier`, `/wire-compliance-snapshot`.
  - Diagnóstico: `/wire-stack-doctor`, `/wire-vault-doctor`, `/wire-ollama-doctor`.
- **Hook chain**:
  - SessionStart: `check-recommends.sh` — avisa se `wire-base` em falta.
  - PreToolUse Bash: `vault-ttl` (allowlist + TTL ≥ 60s), `pii-redact` (NIF/email/IBAN/CC/IP), `approval-gate` (N1/N2/N3), `second-opinion` (Ollama qwen3-coder local).
  - PreToolUse Write|Edit: `pii-redact`.
  - PostToolUse: `cef-wazuh` (emissão CEF → Wazuh SIEM).
  - Stop: `vault-revoke` (revoga token AppRole).
- **`vault-policies.hcl`** — policies HCL para AppRoles `wire-{monitor,ir,tenant,srv,deploy,compliance,cowork-reporting}` e SSH roles `wire-{srv,ir}-role`.
- **`hooks/_lib.sh`** — shim que carrega `wire-common.sh` do `wire-base` (via find no plugin cache) ou define stubs de fallback prod-fail-closed.

### Depends on

- **`wire-base@jump2new`** (recomendado). Os hooks usam `wire_log`/`wire_mode`/`wire_fail_or_warn` da `wire-common.sh` para respeitarem `WIRE_OPERATING_MODE` (prod=block, dev=warn, lab=silent). Sem o base, os hooks correm com stubs de fallback (prod-fail-closed).

### Notes

- O hook `pre-tool-vault-ttl.sh` mantém o padrão "fail-open para diagnóstico, fail-closed para ops privilegiadas" — allowlist explícita para doctors, health checks e ops sobre ficheiros locais.
- Versão inicial após reset do histórico git ("clean slate") do repositório do marketplace.

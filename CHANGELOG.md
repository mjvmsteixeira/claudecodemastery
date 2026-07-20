# Changelog — marketplace prumo

Histórico agregado do marketplace. Cada plugin mantém o seu `CHANGELOG.md` próprio com detalhe completo (`base/`, `secops/`, `devkit/`, `design/`); este ficheiro regista os marcos ao nível do ecossistema — releases coordenadas, plugins novos, mudanças de branding e de infra do repo.

Estado actual: **prumo-base 0.7.1 · prumo-secops 0.6.4 · prumo-devkit 0.5.1 · prumo-design 0.6.0** (tags: prumo-base `v0.6.0` · prumo-design `prumo-design-v0.6.1`)

## 2026-07-20 · `prumo-secops 0.6.4` · a colisão de nomes, e o que ela escondia

**Dois dos quatro casos não eram ficheiros em falta.** O `template-cliente.md` do `prumo-tenant-isolation` era um **nome errado** para um ficheiro que já existia (`template-relatorio.md`), citado correctamente 90 linhas abaixo na mesma skill — e o nome errado calhava ser o de uma peça diferente noutra skill. O `distribuicao-classificacao.md` do `cliente-dossier` era uma **cross-reference legítima** à política TLP que vive no IR, e que não deve ser duplicada: duas políticas de distribuição em vigor é pior do que nenhuma.

Os outros dois foram escritos, com nomes desambiguados. O `queries-evidencia.md` mostrou-se escrevível ao contrário dos mappings do compliance, porque aqui **os controlos estão definidos** — a matriz CTRL-W-T-001..016 vive na própria skill. Cada query leva um campo obrigatório de limitação, que é o que separa evidência de conformidade aparente: o audit log de acessos cross-tenant, por exemplo, só prova ausência de acesso *registado*.

Todas as 24 citações `references/` do plugin resolvem, e não há dois ficheiros com o mesmo basename.

## 2026-07-20 · `prumo-secops 0.6.3` · fecha o release-safety, e o check que contava mal

**As 3 referências do `prumo-release-safety` escritas — e, ao enumerar todas as skills para confirmar, o check que as media revelou-se cego.** O check 13 do `smoke.sh` só via se a pasta `references/` existia e tinha pelo menos um ficheiro: uma skill com 1 de 4 referências passava como coberta. Havia **4 ficheiros em falta invisíveis** em duas skills que os avisos davam como resolvidas. Passa a validar que cada ficheiro citado por um `SKILL.md` existe de facto, e a nomear os que faltam.

Do conteúdo, o mais consequente é a classificação A–D do `rollback-template.md`: **classe D não tem rollback, tem recuperação de desastre**. Um `drop` de coluna tratado como reversível é o erro que o template existe para prevenir, e a altura de o descobrir não é durante a execução.

Fica assinalada uma colisão de nomes por decidir — três dos quatro ficheiros em falta partilham nome com peças de outras skills mas são coisas diferentes, e um agente que resolva pela skill errada produz a peça errada com aspecto correcto.

## 2026-07-20 · `prumo-secops 0.6.2` · referências do saas-monitoring

**Escritas as 5 do `prumo-saas-monitoring` (472 linhas); restam 3, todas do `release-safety`.** O catálogo de pares Wazuh ↔ Fortigate fixa a assimetria que dá sentido à correlação — Fortigate sem Wazuh é bom sinal, Wazuh sem Fortigate é mau — e inclui pares com "nenhuma correspondência esperada", sem os quais toda a ausência passa a suspeita e a triagem afoga-se em falsos sinais. O runbook abre com verificação de deriva de NTP: uma correlação sobre relógios dessincronizados não é imprecisa, é aleatória.

Mantido o critério das versões anteriores — os `rule_id` custom e o inventário de hosts ficam por preencher, por serem facto do ambiente. IDs inventados produziriam queries que devolvem vazio e passam por "sem alertas", que é o pior modo de falha possível numa camada de monitorização.

## 2026-07-20 · `prumo-secops 0.6.1` · referências do compliance, e os controlos que ninguém define

**Escritas as 5 referências do `prumo-compliance-provider` (515 linhas) — e corrigida a contagem de ontem: são 18 ficheiros em falta, não 17.** O regex que os enumerou não incluía maiúsculas e omitiu o `anexoII-template.md`.

Os três templates saíram completos (Anexo II do Art. 28(3), DPIA, e o formato do banco CAIQ). Os dois mappings **saíram com a coluna de cobertura vazia, de propósito**: a correspondência entre cláusulas de framework e controlos Wire não se pode escrever sem saber que controlos existem. E aí está o achado maior — os `CTRL-W-T-001..016` e `CTRL-W-R-001..018` são citados como intervalos em comandos, agents e skills de todo o plugin, mas **nenhum artefacto do repositório define o que cada um verifica**. Um comando que instrui *"aplica CTRL-W-T-001..016"* corre exactamente no vazio que as referências ausentes vinham corrigir, e desta vez o problema não é só das skills.

Pelo mesmo critério, o `caiq-pre-filled.md` não traz respostas pré-preenchidas apesar do nome: fabricar 261 respostas de conformidade sob um rótulo que garante que ninguém as verifica seria o pior resultado possível.

## 2026-07-20 · `prumo-secops 0.6.0` · skills que decidiam com base em ficheiros inexistentes

**Quatro avisos do smoke catalogados como dívida da Fase 3 escondiam um defeito de fundo.** Investigados, revelaram 17 ficheiros `references/` citados em 4 skills, nenhum existente — e as skills não os mencionam, **delegam-lhes decisões**. O `prumo-ir-multitenant` mandava classificar severidade S1–S4 por uma matriz inexistente e redigir a notificação ao município (RGPD Art. 33 §2) a partir de um template inexistente. Sem os ficheiros, o agente improvisa, sob pressão de incidente e com prazos regulatórios a correr; a peça sai com aspecto institucional e sem lastro, e ninguém dá pela diferença.

Escritas as 5 referências do IR (560 linhas), marcadas como rascunho operacional com cabeçalho de validação — os limiares e o formulário do CNCS não foram verificados contra fonte oficial, e isso está dito em cada ficheiro em vez de silenciado. Acrescentada às 4 skills uma regra de falha ruidosa, graduada pelo risco: IR e compliance **param**; monitoring e release-safety degradam com aviso. A dívida das outras três mantém-se, mas deixou de falhar em silêncio.

## 2026-07-20 · `prumo-base 0.7.1` · `prumo-secops 0.5.3` · dois bugs apanhados a correr o próprio onboard

**O `/prumo-onboard` recém-revisto foi corrido contra o setup real e encontrou dois defeitos que nenhum teste apanhava.** O novo Passo 2b levou ao `/prumo-secops-bootstrap --plan`, e a cadeia partiu-se em dois sítios diferentes.

O primeiro é o mais grave: `vault_ready()` na `lib/vault-env.sh` usava `jq '.sealed // "true"'`, e em jq o operador `//` trata `false` como ausente — um Vault destrancado devolvia `"true"` e a função falhava **sempre**, em qualquer estado. Doze consumidores em três plugins abortavam com "Vault inacessível ou sealed": todos os `/vault-*`, ambos os bootstraps, o `kv-migrate` e o `/ngrok-expose`. O sintoma era visível há muito e ninguém o ligou à causa — o hook SessionStart emitia *"Vault is sealed and auto-unseal failed"* em todos os arranques com o Vault a funcionar. É a mesma armadilha do `.sealed // …` corrigida no `~/vault/vault-read.sh` na mesma sessão: o padrão `.<bool> // <alt>` é que é o defeito, não o sítio.

O segundo é específico de slash commands: o `/prumo-secops-bootstrap` separava as 7 policies do HCL com `match($0, …)` em awk, mas o harness substitui variáveis posicionais **nuas** pelos argumentos da invocação antes de o bloco correr — o awk recebia `match(--plan, …)` e o split produzia zero ficheiros. `${1:-…}` com chavetas sobrevive, `$0` não. Reescrito em bash puro, sem variáveis de campo.

## 2026-07-20 · `prumo-base 0.7.0` · `/prumo-style` v2 com perfis

**Absorção selectiva do `ayghri/i-have-adhd` (MIT) em vez de instalar um terceiro plugin de estilo.** Das 10 regras dessa skill, 7 já estavam cobertas pelo bloco `prumo-style` v1 ou pelo `CLAUDE.md` global — instalá-la acrescentaria uma camada com duplicados e duas contradições directas ("terminar com acção seguinte" / "tornar visível o trabalho feito" contra "sem labels de resumo/fecho"). As contradições resolveram-se por âmbito, não por escolha: são regras de *execução multi-passo*, não de Q&A. Daí o perfil `focus`, opt-in, separado do `normal` default. O bloco base subiu de 6 para 9 regras e um bug de acumulação de linhas em branco do v1 foi corrigido. Detalhe em `base/CHANGELOG.md`.

O `/prumo-onboard` levou uma revisão de fundo na mesma passagem: um inventário dos 35 commands do marketplace contra o que o wizard mencionava mostrou que **19 estavam fora**, dos quais 5 eram passos de provisionamento de que o resto depende. Dois eram defeitos a sério — o wizard sugeria `/vault-list` como smoke test sem nunca provisionar o Vault (falha garantida em máquina limpa, com mensagem enganadora), e reimplementava à mão o `/prumo-mode`, ignorando a precedência `env` > ficheiro > default e o marker do modo `lab`. Entraram `/prumo-vault-bootstrap` e `/prumo-secops-bootstrap` (novo Passo 2b, antes dos smokes), `/prumo-mode` por delegação, `/prumo-upgrade` no Passo 1 e `/prumo-ollama-doctor` no Passo 3. Os outros 14 são operacionais ou por-projecto e ficam de fora por desenho — listá-los transformaria o wizard no índice que o `/prumo-context-pack` já é.

Na mesma passagem apanharam-se três defeitos adjacentes, todos da família "o wizard não conhece o próprio ecossistema": o `/prumo-onboard` nunca perguntava pelo estilo de output (agora Passo 4b, que detecta e pergunta mas nunca aplica — escreve num ficheiro do utilizador) e detectava só 3 dos 4 plugins do `marketplace.json`, ignorando o `prumo-design` no loop, nos gaps, nos smokes e nos contadores. O terceiro é do eval-harness: o `second-opinion-livetest.sh` usava a porta fixa 11533, e um stub órfão de uma corrida anterior fazia o teste falar com o servidor errado — como o hook é fail-closed, 6 das 7 asserções continuavam verdes e só a de `allow` caía, produzindo um vermelho cuja mensagem apontava para o sítio errado. Passou a porta efémera atribuída pelo kernel, com reap do processo e trap em `INT`/`TERM`.

## 2026-07-17 · CI verde · portabilidade Linux (telemetry-test + pii-redact)

**O CI estava vermelho há várias runs — falha pré-existente, não introduzida pelos releases de hoje.** Causa: `scripts/eval/telemetry-test.sh` usava `\t` em `grep`, que o GNU grep do runner Linux não interpreta como tab (o BSD grep do macOS interpretava — passava local, rebentava no CI). Corrigido para tab literal via `$'\t'`. Ao reproduzir num container ubuntu apanhou-se um bug adjacente e mais grave: o `pii-redact` (`prumo-secops`) fazia **fail-open** num Linux sem `shasum` — o hook saía 127 antes do `exit 2` e a PII não era bloqueada; agora tem fallback `sha256sum`. `prumo-secops` → 0.5.2. Pipeline completo (validate + package) verificado num container espelho do `ubuntu-latest`: 0 erros. Detalhe em `secops/CHANGELOG.md`.

## 2026-07-17 · `prumo-base 0.6.1` · memory-doctor: Gate 0 + verbos mortos

**O upgrade-check passa a ser a primeira acção imposta da `memory-doctor`, e dois bugs de verbo morto que regrediam o CLAUDE.md.** A skill nem sempre verificava necessidade de upgrade antes de auditar: o mandato existia em prosa e numa regra de ouro a 190 linhas, sem gate, e o inventário nunca ia buscar o *latest* ao PyPI (o caso "N versões atrás" era indetectável). Agora há um **Gate 0** read-only — instalado vs latest para `mempalace`/`graphifyy` (semver-aware), delegação a `/prumo-upgrade` para plugins+MCP, e ausência→propor-instalar. Em paralelo, os verbos `graphify query`/`affected` (inexistentes na v0.9.18) foram corrigidos para `explain`/`path` em 4 sítios — incluindo o bloco de routing escrito no CLAUDE.md, que no `--apply` regredia um ficheiro já corrigido à mão — e o árbitro ganhou verificação de resolução de rota (correr o verbo contra a CLI antes de o escrever). Detalhe em `base/CHANGELOG.md`.

## 2026-07-16 · `prumo-secops 0.5.1` · os gates deixam de treinar evasão

**Descoberto a partir de um commit normal.** O `pii-redact` bloqueava o trailer `Co-Authored-By:` que o
system prompt do Claude Code exige em todos os commits; a única saída era ofuscar o email em shell —
que passa o gate sem deixar rasto. Um gate com falsos positivos garantidos e sem válvula utilizável
ensina o agente a contornar, e destrói o audit trail que existe para produzir. A investigação
encontrou mais quatro defeitos da mesma família: o hook ignorava `PRUMO_OPERATING_MODE` (`exit 2` cru
em vez de `prumo_fail_or_warn` — a máquina estava em `dev` e não fazia diferença nenhuma), o bypass
registava `allow` em vez de `bypass`, a regex de telefone dava falso positivo em qualquer inteiro de
10+ dígitos, e a remediação que os hooks imprimiam (`PRUMO_X=1 <comando>`) era impossível de seguir —
um prefixo inline nunca chega a um hook PreToolUse. Este último também afectava o `approval-gate`,
que ficava intransponível dentro da sessão. `validate.sh` ganhou dois checks de convenção (bloqueio
via `prumo_fail_or_warn`; remediação sem prefixo inline) e o eval-harness ganhou o campo `needs_base`,
sem o qual semântica de modo era intestável. Corpus 135 → 147 casos. Detalhe em `secops/CHANGELOG.md`.

## 2026-07-15 · `prumo-design 0.6.0` · tag `prumo-design-v0.6.1` · redesign do antigo prumo-craft

**`prumo-craft` → `prumo-design`.** O 4º plugin deixa de reimplementar regras de design (skill
`html-plan`, removida) e passa a orquestrar a stack nativa do Claude: a skill `product-design`
conduz `frontend-design` (estética), `Artifact` (mockups visíveis) e `design-sync`/`DesignSync`
(design system num Claude Design project), em dois modos (mockup / system). Sem paletas nem
grids próprios. Detalhe em `design/CHANGELOG.md`. A tag é `prumo-design-v0.6.1` (a `v0.6.0`
já estava tomada pelo release do prumo-base); a versão do plugin é `0.6.0`.

## 2026-07-15 · `v0.6.0` · prumo-base 0.6.0

**Skill `memory-doctor` + hook `memory-scope`.** Nova skill foundacional em prumo-base que governa o setup de memória em 3 camadas de âmbito disjunto — episódica (MemPalace), estrutural (Graphify), humana (docs) — via 3 agentes + um árbitro read-only das 7 colisões C1–C7. Fase 0 avalia install/upgrade e instala primeiro; Fase 4 `--apply` escreve **uma** regra de encaminhamento no CLAUDE.md e instala o hook PreToolUse `memory-scope` (matcher Bash). Absorve a antiga `mempalace-doctor`. O hook foi endurecido por 5 rondas de revisão adversarial (normalização aspas/backslash/`${IFS}`, guards de substituição de comando e processo, fronteira denylist de identificador, allowlist só de comandos data-only — programáveis fora pelo invariante "programável ⇒ fora", typosquat `graphify` vs `graphifyy` em 11 gestores). eval-harness 96 → 135 casos, todos mutation-proof; `validate.sh` 0/0 · `smoke.sh` 35/0. Detalhe em `base/CHANGELOG.md`.

## 2026-07-12 · `v0.5.1` · prumo-devkit 0.5.1

**security-scan v2.** Eleva a skill `security-scan` do devkit de checklist-grep para motor com análise AST (Semgrep primário + fallback grep), verificação adversarial de findings (Passo 3c), secrets via `gitleaks`/`trufflehog --only-verified` + entropia, deteção de tooling (Passo 0, soft-deps), 4 references novas auto-load por stack (CI/CD supply-chain, container, OWASP API/LLM Top 10), mapeamento CWE e um eval-harness determinístico próprio (fixtures→`expected.jsonl`) ligado ao `validate.sh` com skip honesto. Disciplina read-only/safe-apply intacta. Detalhe em `devkit/CHANGELOG.md`.

## 2026-07-07 · release coordenado `v0.5.0`

Versão unificada dos 4 plugins em **0.5.0** com uma tag única de marketplace `v0.5.0`. Fecha o ciclo de features AI (Fases 01-04) e uma ronda de remediação de segurança sobre os hooks.

- **Features AI (branch `eval-harness`):** eval-harness de regressão dos hooks (corpus rotulado + runner + matriz de confusão + selftest), guardrail semântico via Ollama local no `second-opinion` (zona-cinzenta, anti-injeção, veredicto JSON), telemetria dos guardrails (`/prumo-telemetry` + doctor), e loop de feedback nos audits do devkit (reconciliador determinístico com fingerprint semântico + accept/auto-promoção).
- **Remediação de segurança (full-audit):** corrigida uma família de bypass nos classificadores dos hooks — a classe de fronteira de palavra não cobria `(`, backtick, newline e `&`. Fixes: **CRÍTICO** `vault-ttl` (newline/`&` contornavam a exigência de `VAULT_TOKEN`), **alto** `audit-guard` (`$()`/subshell/backtick + `curl|bash`) e `approval-gate` (N1/N2/N3), `second-opinion`, sanitização no `audit-accept`, integridade de source no `cdp-guard`, e um falso-verde no próprio `validate.sh`. +10 casos de regressão no corpus (70/70 verde).
- **Documentação/consistência:** 4 templates de skill em falta criados; prefixos de log uniformizados; cobertura dos `smoke.sh` alinhada; descrições do marketplace com `chrome-live`.

## 2026-07-06

- **Rebranding total: `jump2new` + `wire-*` → `prumo`.** Marketplace renomeado para `prumo`; plugins passam a `prumo-base` 0.5.0, `prumo-secops` 0.5.0, `prumo-devkit` 0.4.0, `prumo-craft` 0.2.0. Comandos `/wire-*` → `/prumo-*`, env `WIRE_*` → `PRUMO_*`, estado `~/.wire/` → `~/.prumo/` (migração automática), lib `wire-common.sh` → `prumo-common.sh`. O domínio Wire de produção (produtos, hostnames, AppRoles, Wazuh/Zabbix) fica intacto. Owner passa a mjvmst. Upgrade exige uninstall dos plugins `wire-*@jump2new` e install dos `prumo-*@prumo`.
- Correcções da deep analysis de 2026-07-06 absorvidas: descrição do marketplace com os 4 plugins, READMEs alinhados com manifests, formato de changelog unificado, `CLAUDE.md` de dev guidance criado dentro do repo, tags git por plugin.

## 2026-05-26

- **wire-base v0.4.0** — `/wire-style`: bloco de output conciso ("talk-normal") injectável/removível em CLAUDE.md, idempotente e versionado.
- **wire-devkit v0.3.0** — skill `chrome-live`: sessão Chrome real via CDP, gateada; documentada a limitação Chrome 136+ e a proveniência do `cdp.mjs`.
- Validação: shellcheck estendido a `skills/**/scripts/*.sh`; supressão de falsos-positivos em hooks/lib.

## 2026-05-19

- **Novo plugin: wire-craft v0.1.0** — tooling generativo (`html-plan`, HTML anti-AI-slop em 2 fases). Standalone, zero deps externas. O marketplace passa a ter 4 plugins.
- **wire-secops v0.4.0 "Honest"** — cadeia de hooks tornada funcional (approval-gate via `WIRE_APPROVE`, pii-redact fail-closed, hooks a parsear JSON do stdin em vez de texto cru) + 20 templates `references/` nas skills. Upgrade a partir de v0.2.x/v0.3.0 exige `uninstall` antes de `install`.
- **wire-base v0.3.0 / wire-secops v0.3.0** — bootstraps Vault: `/wire-vault-bootstrap` + `/wire-vault-kv-migrate` (base) e `/wire-secops-bootstrap` (secops: policies + AppRoles + Keychain numa corrida).

## 2026-05-15

- **wire-devkit v0.2.2 + wire-base v0.2.1** — audits read-only por defeito; hook PreToolUse `audit-guard` no base dá defense-in-depth ao devkit.
- **v0.2.0 (base)** — `/wire-upgrade`, `/wire-vault-policy`, `/wire-smoke`; packaging unificado em `scripts/package.sh`; CI GitHub Actions (`validate.sh` + package dry-run).
- Comandos de setup/diagnóstico no base: `/wire-onboard`, `/wire-doctor`, `/wire-mode`, `/wire-context-pack`; skill `vault-toolkit`; `CHANGELOG.md` por plugin.
- Hooks do secops passam a consumir `wire-common.sh` do wire-base (com fallback fail-closed); `recommends` + hooks SessionStart `check-recommends` em secops/devkit.
- **Rebranding: `wiremaze` → `wire`** em todo o repo; licença dos plugins fixada em "Proprietary - Uso interno jump2new".
- Initial commit do marketplace **jump2new** (wire-base, wire-secops, wire-devkit a v0.1.0).

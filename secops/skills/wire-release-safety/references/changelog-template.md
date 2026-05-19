# Changelog Template — Release Notes Wire

**Skill:** `wire-release-safety` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-release-safety`. Formato de release notes para deploys
> Capistrano, com categorização e referência a CVEs. Baseado em Keep a Changelog + SemVer.
> Marca `[CONFIRMAR]` campos Wire-specific.

A Wire mantém changelog **por produto wire***, versionado, com duas vistas:
- **Interna (completa):** todas as alterações, incluindo segurança detalhada.
- **Cliente (sanitizada):** sem detalhe de vulnerabilidades (apenas "correcção de segurança"),
  sem internals que exponham vector de ataque.

## SemVer no contexto Wire

```
v MAJOR . MINOR . PATCH
  │       │       └─ bugfix, security patch sem breaking
  │       └───────── feature compatível
  └───────────────── breaking change (schema, API, contrato cliente)
```

Breaking change em produto multi-tenant exige comunicação prévia a munícipios (≥ 48h se afecta UI
ou integrações).

## Categorias

| Categoria | Prefixo | Descrição | Vista cliente |
|-----------|---------|-----------|----------------|
| **Security** | `[SEC]` | Correcção de vulnerabilidade | Sanitizado |
| **Breaking** | `[BREAKING]` | Alteração incompatível | Detalhado + aviso prévio |
| **Feature** | `[FEAT]` | Nova funcionalidade | Detalhado |
| **Fix** | `[FIX]` | Correcção de bug | Resumido |
| **Performance** | `[PERF]` | Melhoria de desempenho | Resumido |
| **Dependency** | `[DEP]` | Actualização de dependência | Apenas se relevante |
| **Internal** | `[INTERNAL]` | Refactor, infra (não-visível) | Omitido |

## Template — vista interna

```markdown
# wire[PRODUCT] — Changelog

## [v4.2.2] — 2026-05-19

Deploy: cap production deploy (Capistrano)
Pool: A
Rails: 6.1
Release manager: [NOME]
Canary: 5-fase concluído 2026-05-19T14:00Z
Migrations: 0 (hotfix, código apenas)

### Security
- [SEC] Restaurado check de tenant scope no endpoint de export de formulários.
  Regressão introduzida em v4.2.1 permitia IDOR cross-tenant. Severidade interna: S2.
  Ref incidente: wire-ir-2026-0519-002. CVE: N/A (bug interno, não dependency).
  CWE-639 (Authorization Bypass Through User-Controlled Key).

### Fix
- [FIX] Corrigido teste de regressão para garantir tenant isolation no export.

### Dependency
- [DEP] rack-attack 6.7.1 → 6.7.2 (sem CVE associado, manutenção).

### Internal
- [INTERNAL] Adicionado teste de integração multi-tenant ao CI gate.

---

## [v4.2.1] — 2026-05-18  [REVERTIDA — ver v4.2.2]

### Feature
- [FEAT] Novo endpoint de export bulk de formulários preenchidos.
  ⚠ Esta versão introduziu regressão de segurança — revertida em v4.2.2.
```

## Template — vista cliente (sanitizada)

```markdown
# wire[PRODUCT] — Notas de Versão

## Versão 4.2.2 — 19 de Maio de 2026

### Segurança
- Aplicada correcção de segurança relacionada com controlo de acesso. Recomendamos que não
  é necessária qualquer acção do vosso lado. Sem impacto nos vossos dados.

### Correcções
- Melhorias de estabilidade no módulo de exportação de formulários.

Em conformidade com o nosso compromisso de transparência (RGPD Art. 28, DL 20/2025), os
municípios cujos dados possam ter sido afectados foram contactados directamente.
```

## Referência a CVEs

Quando a release corrige CVE em dependência:

```markdown
### Security
- [SEC] Actualização de [GEM/PACKAGE] [VERSAO_ANTIGA] → [VERSAO_NOVA].
  Corrige CVE-YYYY-NNNNN (CVSS [SCORE], [VECTOR]).
  Exploitability no contexto Wire: [exploitable / não-exploitable + justificação].
  Detecção prévia: [Wazuh rule_id se aplicável].
```

Exemplo:
```markdown
### Security
- [SEC] Actualização de nokogiri 1.16.0 → 1.16.5.
  Corrige CVE-2024-XXXXX (CVSS 7.5, AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N).
  Exploitability Wire: não-exploitable em runtime (input XML sempre de fonte confiável interna),
  mas patch aplicado por princípio de defesa em profundidade.
```

## Cabeçalho de deploy obrigatório

Cada entrada de changelog que corresponda a deploy production inclui metadata Capistrano:

```markdown
Deploy: cap production deploy
Pool: [A/B]
Rails: [VERSION]
Migrations: [N] ([reversíveis: SIM/NÃO])
Canary: [referência ao plano canary]
Revision: [SHA git]
Timestamp: [UTC]
SBOM: secret/data/cicd/sbom/wire[product]/v[version].json
```

## Versionamento do changelog

- Ficheiro: `CHANGELOG.md` na raiz de cada repositório de produto wire*.
- Versionado em git, parte do PR (changelog é gate de merge `[CONFIRMAR — enforcement]`).
- Tag git por release: `v4.2.2`.
- Vista cliente gerada por filtro automático (omite `[INTERNAL]`, sanitiza `[SEC]`).

## Regras de redacção

### Vista interna
- Detalhe técnico completo, incluindo CWE/CVE, vector, severidade.
- Referência a incidentes (`wire-ir-*`) onde aplicável.
- Honestidade sobre regressões (marcar versões revertidas).

### Vista cliente
- **Nunca** expor vector de ataque exploitable.
- **Nunca** referir CVE de forma que permita identificar superfície de ataque ainda não-patcheada
  noutros produtos.
- Tom factual, tranquilizador mas não evasivo.
- Sempre indicar se houve impacto em dados (RGPD transparency).

## Anti-patterns

- **Changelog cliente que expõe CVE detalhado** — pode orientar atacante para outros produtos.
- **Omitir reversões** — quebra confiança e dificulta debug futuro.
- **`[SEC]` sem CWE/CVE na vista interna** — perde rastreabilidade.
- **Breaking change sem aviso prévio** — viola contrato com munícipios.
- **Changelog escrito após deploy** — deve ser parte do PR, pré-deploy.

---

## Fontes

- **Keep a Changelog v1.1.0** (`https://keepachangelog.com`).
- **Semantic Versioning 2.0.0** (`https://semver.org`).
- **CWE** — Common Weakness Enumeration (MITRE).
- **CVE / NVD** — National Vulnerability Database scoring (CVSS v3.1).
- **RGPD Art. 28** (transparency to controller) + **DL 20/2025**.

## Como usar este template em sessão Claude Code

A skill `wire-release-safety` invoca este template ao preparar uma release (gerar entrada de changelog do diff) ou ao publicar notas de versão pós-canary 100%. Esperar como output: entrada de changelog em ambas as vistas (interna completa + cliente sanitizada) com categorização automática do diff e referências CVE/incidente. O release manager revê a vista cliente antes de publicação; a sessão sinaliza `[SEC]` que exigem sanitização cuidadosa.

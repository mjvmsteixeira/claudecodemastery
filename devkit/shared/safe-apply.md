# shared/safe-apply.md — gates universais antes de aplicar correcções

Referenciado por todas as skills de audit (`full-audit`, `security-scan`, `code-quality`,
`infra-audit`, `performance-audit`, `ux-audit`) **antes de aplicar qualquer correcção**.

A premissa é simples: **um relatório nunca é destrutivo, uma correcção pode ser**.
Antes de mudar qualquer ficheiro, a skill tem de passar por estes três gates por esta
ordem. Se qualquer gate falhar, degradar para report-only e dizer ao utilizador o que
tem de mudar para destrancar o `apply`.

---

## Gate 1 — Modo operacional prumo

```bash
# Lê PRUMO_OPERATING_MODE; senão ~/.prumo/mode; senão default prod
mode="${PRUMO_OPERATING_MODE:-$(cat "$HOME/.prumo/mode" 2>/dev/null | tr -d '[:space:]')}"
mode="${mode:-prod}"
```

| Modo | Comportamento de `apply` |
|------|--------------------------|
| `prod` | Permitir apenas correcções **explicitamente seguras** da skill. Pedir confirmação humana individual em qualquer acção destrutiva. |
| `dev` | **Degradar para report-only.** Em dev assume-se que código "morto" pode ser activado on-demand; a skill não tem competência para distinguir. Avisar: "modo dev — correcções não aplicadas; recomendações no relatório". |
| `lab` | Permitir tudo (bypass total). Marker `~/.prumo/lab-mode` exigido pelo `prumo_mode`. |

Se a skill não consegue ler o modo (devkit standalone sem prumo-base), **assumir `prod`**.

---

## Gate 2 — Detecção de sample / empty-shell

Mesmo em `prod`, alguns projectos são intencionalmente "vazios" (sample apps, empty
shells, templates de partida) onde código não-usado é a feature, não o bug. Detectar
através de **qualquer** dos sinais canónicos abaixo:

### Marcadores no projecto (ficheiros na raiz)

- `.dev-shell` — ficheiro vazio sentinel
- `SAMPLE.md` — readme de projecto sample
- `.empty-shell` — sentinel alternativo
- `.audit-profile` com conteúdo `dev-shell`/`sample`/`empty-shell`/`template`

### Sinal no CLAUDE.md do projecto auditado

Se existir `CLAUDE.md` na raiz, procurar (case-insensitive) qualquer destas frases ou
marcadores:

- `<!-- prumo-audit: dev-shell -->` (HTML comment, marker explícito)
- `<!-- prumo-audit: sample -->`
- `empty shell`, `empty-shell`
- `sample app`, `sample project`, `template project`, `starter template`
- `dev only`, `dev-only`

### Variável de ambiente

- `PRUMO_AUDIT_PROFILE=dev-shell` (ou `sample`, `empty-shell`, `template`)

Se **qualquer** sinal acima estiver presente: **degradar `apply` para report-only** e
avisar o utilizador com a frase: "Projecto detectado como `<sinal>` — correcções não
aplicadas. Para forçar, definir `PRUMO_AUDIT_FORCE_APPLY=1` (não recomendado)."

`PRUMO_AUDIT_FORCE_APPLY=1` salta este gate mas **não** salta o Gate 3.

---

## Gate 3 — Acções destrutivas pedem confirmação humana individual

Mesmo dentro de `apply` autorizado pelos Gates 1 e 2, as seguintes acções **nunca** são
auto-classificáveis como "low-risk" — exigem prompt explícito ao utilizador, finding por
finding, com diff antes/depois:

- Apagar / mover ficheiros (`rm`, `git rm`, `mv` para fora de `/tmp`)
- Editar / Write em:
  - `.gitignore`, `.gitattributes`, `.dockerignore`
  - `.env*` e qualquer ficheiro com `secret`/`credential` no nome
  - `config/initializers/`, `config/environments/`
  - `spec/`, `test/`, `tests/`, `__tests__/`
  - Filtros de logging / parameter sanitization (ex.: `filter_parameter_logging.rb`,
    `backtrace_silencers.rb`)
  - Hooks / scripts CI/CD (`.github/`, `.gitlab/`, `Jenkinsfile`, etc.)
- Drop / alter / truncate de tabelas em qualquer DB
- Update / downgrade de versões major de dependências

Format do prompt:

```
[finding-id] <descrição curta>
ficheiro: <path>:<linha>
acção: <verbo destrutivo>
diff:
  - <linha removida>
  + <linha adicionada>

Aplicar? [s/N/skip-all]
```

Resposta default em ambiguidade: **N** (skip).

`s` aplica esta correcção. `skip-all` salta todos os destrutivos restantes do batch.

---

## Marcador de contexto de audit (para hard-guardrail)

Se o `prumo-base/hooks/pre-tool-audit-guard.sh` estiver instalado, ele bloqueia
operações destrutivas em qualquer Bash/Edit/Write durante contexto de audit a menos
que `PRUMO_AUDIT_APPLY=1` esteja definida. As skills devem:

```bash
# No início da Fase 4 (apply approved):
touch "$HOME/.prumo/audit-active"
export PRUMO_AUDIT_APPLY=1   # só se Gate 1, 2 e 3 passarem para a acção em causa

# No fim (sucesso ou erro):
rm -f "$HOME/.prumo/audit-active"
unset PRUMO_AUDIT_APPLY
```

Sem o hook instalado, a skill aplica a sua própria disciplina (este documento).
Com o hook instalado, ganha defense-in-depth: mesmo se a skill falhar, o hook bloqueia.

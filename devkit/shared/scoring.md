# Scoring — rubrica unificada

Todos os audits do `prumo-devkit` emitem um score X.X/10 por dimensão e um total.
Este ficheiro é a fonte de verdade — as `SKILL.md` referenciam-no, não redefinem scoring.

## Cálculo por dimensão

Cada dimensão começa em 10.0 e sofre deduções por finding:

| Severidade | Dedução por finding |
|------------|---------------------|
| CRITICAL   | −3.0 |
| HIGH       | −1.5 |
| MEDIUM     | −0.5 |
| LOW        | −0.1 |

Score da dimensão = `max(0.0, 10.0 − soma das deduções)`, arredondado a 1 casa decimal.

## Total

Total = média aritmética dos scores das dimensões **avaliadas**, arredondada a 1 casa decimal.
Dimensões não aplicáveis ao projecto (ex: `ux` num projecto sem UI) são **omitidas** — não
contam como 0.

## Apresentação

```
=== SCORE ===
<Dimensão 1>: X.X/10
<Dimensão 2>: X.X/10
TOTAL: X.X/10
```

## Severidades — definição canónica

- **CRITICAL** — risco imediato de segurança ou perda de dados; explorável agora.
- **HIGH** — falha funcional ou vulnerabilidade explorável com pré-condições.
- **MEDIUM** — degradação de segurança/qualidade; não explorável directamente.
- **LOW** — tech debt, boas práticas, optimizações.

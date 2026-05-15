# Dead code e inconsistências

Referência carregada pela skill `code-quality` quando o scope inclui `dead-code`.

## O que procurar

- Imports não usados.
- Funções/componentes definidos mas nunca chamados.
- Rotas/endpoints registados mas com handlers vazios/stub.
- Rotas duplicadas (mesmo HTTP method + path).
- Ficheiros que não são importados por nenhum outro.
- Comentários TODO/FIXME/HACK que indicam trabalho incompleto.

## Comandos de apoio

```bash
# TODO/FIXME/HACK
grep -rnE 'TODO|FIXME|HACK|XXX' --include='*.py' --include='*.js' --include='*.ts' --include='*.tsx' --include='*.jsx' --include='*.go' --include='*.rs' --include='*.java' --include='*.rb' --include='*.php' --include='*.cs' . \
  | grep -v -E 'node_modules|vendor|__pycache__'

# Ficheiros potencialmente órfãos (heurística — nome do ficheiro não aparece noutro import)
# Para cada ficheiro de código, grep o basename sem extensão no resto do projecto.

# Imports não usados:
#   Python  → ruff check --select F401 .   (ou pyflakes)
#   JS/TS   → npx eslint . --rule 'no-unused-vars: error'
#   Go      → go build ./...   (imports não usados são erro de compilação, apanhados pelo compilador)
```

Reportar cada finding com `ficheiro:linha`.

# Arquitectura, padrões e integração cross-feature

Referência carregada pela skill `code-quality` quando o scope inclui `architecture`.
Nota: a análise de N+1 queries e performance de DB foi movida para a skill `performance-audit`.

## Padrões e arquitectura

- Layered architecture respeitada? (api → service → model)
- Error handling consistente? (custom exceptions vs raw HTTP errors)
- Service layer: business logic nos endpoints vs nos services?
- Database patterns: transacções, connection handling.
- Type safety: `any` types (TS), missing type hints (Python).

## Cross-feature integration

- Para cada feature, verificar se o pipeline end-to-end funciona.
- Identificar features que bypassam a service layer.
- Verificar que delete/cleanup cascateia correctamente.
- Verificar que operações assíncronas (Celery tasks, background jobs) têm retry e error handling.

## Verificações de stack específicas

```bash
# TypeScript / ESLint (se aplicável)
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/ --format compact 2>&1 | tail -20

# Python — syntax check dos ficheiros modificados
python3 -c "import ast,sys; [ast.parse(open(f).read()) for f in sys.argv[1:]]" <ficheiros>

# Python 3.12+ — datetime.utcnow está deprecated
grep -rn 'datetime\.utcnow' --include='*.py' . | grep -v __pycache__
# fix: substituir por datetime.now(timezone.utc)
```

Reportar cada finding com `ficheiro:linha`.

# Integração MemPalace (opcional)

Referência carregada pela skill `full-audit` **apenas** quando existe `.mempalace/`
na raiz do projecto auditado. Se não existir, o `full-audit` ignora esta integração
por completo — é estritamente opt-in.

## Antes dos audits — recolher contexto

Correr `mempalace_search "bug vulnerability security fix"` (MCP tool
`mcp__plugin_mempalace_mempalace__mempalace_search`) para recuperar contexto de issues
anteriores e evitar reportar/regressar problemas já resolvidos.

## Depois dos audits — registar

1. Fixes significativos → `mcp__plugin_mempalace_mempalace__mempalace_diary_write`
   (entradas de diário).
2. Decisões / padrões emergentes → `mcp__plugin_mempalace_mempalace__mempalace_kg_add`
   (knowledge graph).

## Se o MCP do MemPalace não estiver ligado

Não bloquear o audit. Registar no relatório que a integração MemPalace foi saltada
por o MCP não estar disponível, e prosseguir.

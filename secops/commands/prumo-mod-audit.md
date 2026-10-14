---
name: prumo-mod-audit
description: Audita os mods (plugins de function hooks) instalados e em desenvolvimento — gating hooks sem .catch, chamadas a ficheiros, processos e rede, e telemetria. Read-only.
---

Corre e mostra a tabela:

    bash "${CLAUDE_PLUGIN_ROOT}/lib/mod-audit.sh"

Depois, para cada linha, explica em uma frase:

- **gating_sem_catch > 0**: um guard que lança exceção deixa passar o que devia travar (fail-open).
- **chamadas_sensiveis**: `$.fs.*` lê e escreve ficheiros, `$.process.*` corre comandos, `$.http.*`/`$.network.*` falam com a rede e `$.mcp.*` chama servidores MCP. Num cliente, cada uma tem de ter justificação.
- **telemetria**: um mod que ouve `telemetry.*` vê os eventos que o Claude Code envia.

Recomendação para instalações de cliente: usar os mods de terceiros como referência de desenho e instalar só mods auditados, de preferência por managed settings (ver `guard/docs/instalacao-gerida.md` no repo prumo).

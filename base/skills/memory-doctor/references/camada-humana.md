# Camada humana — docs / Obsidian

## Contrato de âmbito

| Corpus | Responde a | **Nunca faz** |
|---|---|---|
| docs, runbooks, legal | o que preciso de ler e citar | não é índice de código nem de conversas |

## Porque existe

É a camada que o humano **lê e cita**. Não é um índice a consultar por embedding (isso é o MemPalace) nem um grafo a atravessar (isso é o Graphify). É prosa curada, com autoridade — a fonte que se cita num relatório ou numa decisão.

## Detecção

Sem gestor de pacotes — a skill **detecta e recomenda, não instala**.

```bash
find "$HOME" -maxdepth 3 -type d -name '.obsidian' -print 2>/dev/null   # vault Obsidian
# fallback: docs/ no projecto, runbooks/, ADRs
find . -maxdepth 2 -type d \( -name docs -o -name runbooks -o -name adr \) 2>/dev/null
```

## Auditoria da camada

- Vault/`docs/` existe? Senão → **INFO: camada humana ausente** (com o trade-off, ver abaixo).
- **Sobreposição de corpus:** os mesmos docs estão minerados no MemPalace *e* extraídos pelo Graphify? → **WARN**. Os docs pertencem aqui; o MemPalace fica com **conversas** (`--mode convos`), o Graphify com **código** (`--code-only`).
- Docs sem ADRs / decisões registadas, mas o MemPalace cheio de conversas sobre decisões → **INFO: oportunidade de promover episódico → humano** (uma decisão madura merece prosa curada, não só o registo da conversa).

## Se a camada estiver ausente

Reportar o trade-off: *"sem camada humana, não há fonte curada e citável — as decisões vivem só no registo episódico (conversas), que é bom para 'porquê' mas mau para 'o que é oficial'. Sem custo de instalação: basta um `docs/` com ADRs."*

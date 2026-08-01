# Camada humana — docs / Obsidian

## Âmbito da auditoria (`--scope`)

| `--scope project` (default) | `--scope machine` |
|---|---|
| `docs/`, `design-review/`, `.obsidian/` **deste** repo. Existem? têm conteúdo? estão em git? há quanto tempo foram tocados? | + inventário de vaults Obsidian da máquina |

**Não varrer o `$HOME` à procura de vaults em `--scope project`.** Numa corrida real isso trouxe um vault de 469 notas de *outro* projecto, em pausa — verdadeiro, irrelevante para quem estava a trabalhar aqui, e a ocupar o lugar do achado que interessava.

### O achado que esta camada existe para dar

**Uma regra de encaminhamento que aponta para um ficheiro inexistente é pior que regra nenhuma.** Verificar sempre que os alvos citados pelo `CLAUDE.md` existem **neste** repo — tipicamente `design-review/00-registo.md` e `docs/`.

O modo de falha é silencioso e caro: a pergunta *"qual foi a decisão X?"* devolve vazio, e o vazio é indistinguível de "a decisão não existe". Se a regra ainda der precedência a esse ficheiro sobre o MemPalace, um ficheiro inexistente ganha por regra a quem tem o contexto real.

Verificar também que `docs/` está **em git**: uma camada declarada como "o registo de facto" mas não versionada não é citável nem auditável, e desaparece com a máquina. Um `.gitignore` em whitelist-mode exclui `docs/` sem o dizer — confirmar com `git ls-files docs/`, não por inspecção visual.

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

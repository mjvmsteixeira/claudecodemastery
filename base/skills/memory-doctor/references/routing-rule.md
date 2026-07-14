# Regra de encaminhamento

O artefacto que resolve a colisão C1. Hoje **não existe em lado nenhum**: cada instalador escreve o seu próprio "consulta-me primeiro", e o agente fica sem árbitro.

**Escreve-se uma vez, à mão (por nós), nunca pelos instaladores das ferramentas.**

## Bloco canónico

Delimitado por marcadores e versionado — reescrever é idempotente:

```markdown
<!-- PRUMO_MEMORY_ROUTING_START v1 -->
## Memória — regra de encaminhamento

As camadas de memória têm âmbitos disjuntos. Encaminha a pergunta pela camada certa:

- **Decisões, histórico, rationale** ("porque é que fizemos X?", "o que decidimos sobre Y?")
  → **MemPalace** (memória episódica: conversas).
- **Estrutura, dependências, impacto de alteração** ("o que chama esta função?", "o que parte se eu mexer aqui?")
  → **`graphify query` / `graphify affected`** (memória estrutural: AST do código).
- **Conteúdo de um ficheiro específico** → **lê o ficheiro**. Não perguntes ao índice o que podes ler directamente.
- **O que é oficial e citável** (runbooks, ADRs, legal) → **docs/**.

Nunca registes "o que funcionou" na camada estrutural (`graphify reflect`/`save-result`) —
o episódico pertence ao MemPalace. Dois registos independentes produzem memória contraditória.
<!-- PRUMO_MEMORY_ROUTING_END -->
```

## Escrita idempotente

Nunca fazer append cego. Se os marcadores existirem, **substituir** o bloco entre eles; senão, acrescentar no fim.

```bash
CLAUDE_MD="./CLAUDE.md"
START='<!-- PRUMO_MEMORY_ROUTING_START'
END='<!-- PRUMO_MEMORY_ROUTING_END -->'

if grep -qF "$START" "$CLAUDE_MD" 2>/dev/null; then
  # bloco existe → substituir (remover o antigo, inserir o novo no mesmo sítio)
  sed -i.bak "/$START/,/$END/d" "$CLAUDE_MD"
fi
# acrescentar o bloco novo (mostrar o diff e confirmar antes — Gate 3)
```

Guardar sempre `.bak` antes de escrever (ou usar `prumo_backup` se o `prumo-common.sh` existir).

## Precedência

Esta regra **substitui** os mandatos que os instaladores escrevem. Antes de a aplicar:

1. `graphify claude uninstall` — remove a secção do graphify **e o PreToolUse hook** que ele instalou.
2. Verificar que o MemPalace não escreveu um mandato concorrente; se escreveu, o nosso bloco é o único que fica.

**Uma só regra, escrita por nós.** É esse o ponto.

## Versionamento

O marcador leva versão (`v1`). Se o bloco canónico mudar, subir a versão — o `--apply` reconhece o bloco antigo pelos marcadores e substitui-o, sem duplicar.

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

Nunca fazer append cego. Se **ambos** os marcadores existirem, remover o bloco antigo e anexar o novo; senão, anexar. O bloco fica sempre **no fim** do ficheiro — é o preço da idempotência simples, e é aceitável (a regra não depende da posição).

**Armadilha que destrói dados — ler antes de copiar.** Um `sed` com range (`/START/,/END/d`) em que o `END` **não existe** apaga **da linha do START até ao fim do ficheiro**, levando com ele secções do utilizador que nada têm a ver com o bloco. Um `CLAUDE.md` com o `START` mas sem o `END` (merge conflict, edição manual, truncamento) é exactamente o caso em que isto acontece — silenciosamente. Por isso: **exigir os dois marcadores, e abortar se só um estiver presente.**

```bash
CLAUDE_MD="./CLAUDE.md"
START='<!-- PRUMO_MEMORY_ROUTING_START'
END='<!-- PRUMO_MEMORY_ROUTING_END -->'
BLOCK_FILE="$1"          # ficheiro com o bloco canónico a escrever

# Backup INCONDICIONAL antes de qualquer escrita — inclui o primeiro install.
# (ou prumo_backup, se o prumo-common.sh estiver disponível)
[ -f "$CLAUDE_MD" ] && cp "$CLAUDE_MD" "${CLAUDE_MD}.bak"

# Range por NÚMERO DE LINHA, nunca por padrão.
# Um range por padrão (/START/,/END/) que não encontra o END depois do START corre
# até EOF e apaga o resto do ficheiro. Isso acontece tanto com o END ausente como
# com o END ANTES do START (órfão de merge/edição) — nesse caso ambos os marcadores
# "existem", uma guarda por presença passa, e o sed come tudo à mesma.
s_line=$(grep -nF "$START" "$CLAUDE_MD" 2>/dev/null | head -1 | cut -d: -f1)
e_line=$(grep -nF "$END"   "$CLAUDE_MD" 2>/dev/null | head -1 | cut -d: -f1)

if [ -n "$s_line" ] && [ -n "$e_line" ]; then
  if [ "$e_line" -lt "$s_line" ]; then
    echo "ERRO: marcadores de routing fora de ordem em $CLAUDE_MD (END na linha $e_line, START na $s_line)." >&2
    echo "Corrupção provável. Corrigir à mão — nada foi escrito." >&2
    exit 1
  fi
  sed -i.bak "${s_line},${e_line}d" "$CLAUDE_MD"   # range fechado: não pode correr até EOF
elif [ -n "${s_line}${e_line}" ]; then
  echo "ERRO: marcador de routing desemparelhado em $CLAUDE_MD (START=${s_line:-ausente} END=${e_line:-ausente})." >&2
  echo "Corrupção ou edição manual. Corrigir à mão — nada foi escrito." >&2
  exit 1
fi

# Anexar o bloco novo (mostrar o diff e confirmar ANTES — Gate 3)
printf '\n' >> "$CLAUDE_MD"
cat "$BLOCK_FILE" >> "$CLAUDE_MD"
```

`sed -i.bak` é a forma **BSD/macOS** (o `sed -i` sem sufixo, GNU-style, falha no macOS).

Correr duas vezes não duplica o bloco. Acumula uma linha em branco por corrida — cosmético, não corrompe.

## Precedência

Esta regra **substitui** os mandatos que os instaladores escrevem. Antes de a aplicar:

1. `graphify claude uninstall` — remove a secção do graphify **e o PreToolUse hook** que ele instalou.
2. Verificar que o MemPalace não escreveu um mandato concorrente; se escreveu, o nosso bloco é o único que fica.

**Uma só regra, escrita por nós.** É esse o ponto.

## Versionamento

O marcador leva versão (`v1`). Se o bloco canónico mudar, subir a versão — o `--apply` reconhece o bloco antigo pelos marcadores e substitui-o, sem duplicar.

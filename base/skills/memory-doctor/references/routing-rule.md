# Regra de encaminhamento

O artefacto que resolve a colisão C1. Hoje **não existe em lado nenhum**: cada instalador escreve o seu próprio "consulta-me primeiro", e o agente fica sem árbitro.

**Escreve-se uma vez, à mão (por nós), nunca pelos instaladores das ferramentas.**

## Bloco canónico

Delimitado por marcadores e versionado — reescrever é idempotente:

```markdown
<!-- PRUMO_MEMORY_ROUTING_START v3 -->
## Memória — regra de encaminhamento

As camadas de memória têm âmbitos disjuntos. Encaminha a pergunta pela camada certa:

- **Decisões, histórico, rationale** ("porque é que fizemos X?", "o que decidimos sobre Y?")
  → **MemPalace** (memória episódica: conversas).
- **Impacto de uma alteração** ("o que parte se eu mexer aqui?")
  → **`graphify affected "X"`** — travessia inversa: os nós impactados por X.
- **Estrutura e dependências** ("o que chama esta função?", "como é que A liga a B?")
  → **`graphify explain "X"`** (nó + vizinhos) · **`graphify path "A" "B"`** (caminho mais curto)
  · **`graphify query "<pergunta>"`** (travessia BFS a partir de uma pergunta).
- **Conteúdo de um ficheiro específico** → **lê o ficheiro**. Não perguntes ao índice o que podes ler directamente.
- **O que é oficial e citável** (runbooks, ADRs, legal) → **docs/**.

Antes de confiar na camada estrutural, confirma a frescura: `built_at_commit` no `graph.json`
tem de bater com o HEAD. Um grafo desactualizado responde com confiança a partir de estado
velho — é pior que grafo nenhum. Custo de actualizar: `graphify update <path>`, segundos.

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

O marcador leva versão (`v2`). Se o bloco canónico mudar, subir a versão — o `--apply` reconhece o bloco antigo pelos marcadores e substitui-o, sem duplicar.

**Histórico:**

- `v3` (2026-08-01) — **repôs `query` e `affected`, e corrigiu a afirmação que os removeu.** O `v2` declarava que esses verbos "não existem no Graphify actual (v0.9.18)". Verificado contra a **v0.9.32 instalada: existem ambos** (`query "<question>"` — BFS a partir de uma pergunta; `affected "X"` — travessia inversa dos nós impactados). O erro não era cosmético: o `affected` é a resposta directa a *"o que parte se eu mexer aqui?"*, a pergunta principal desta secção, e o `v2` encaminhava-a para `explain`/`path`, que respondem a outra coisa. Um `--apply` do `v2` sobre um `CLAUDE.md` correcto **regredia-o**. Acrescentada a verificação de frescura, que faltava.
- `v2` (2026-07-17) — trocou os verbos de consulta com base numa leitura de versão que não foi confirmada contra o binário. Ver a lição abaixo.

**Lição, que vale mais que a correcção.** Um bloco escrito no `CLAUDE.md` do utilizador não pode conter afirmações sobre *que versão tem que verbo*. Uma afirmação dessas nasce verdadeira ou falsa, envelhece em silêncio, e o agente segue-a com confiança porque está escrita numa regra permanente. A defesa não é acertar na versão — é **derivar os verbos do binário no momento de escrever**, e nunca fixar por versão. É o que a secção seguinte passa a fazer.

## Verificação de resolução — obrigatória antes de escrever

Este bloco é escrito no CLAUDE.md do utilizador; os verbos que contém têm de **resolver para operações reais** da ferramenta.

**Porque é que a versão anterior desta verificação falhou.** O `v2` já tinha um check aqui — mas com a lista de verbos *fixa no próprio check* (`for verb in explain path`). Verificava que os verbos que ele próprio recomendava existiam, e nunca perguntou se eram os certos. Um check que confirma a sua própria conclusão passa sempre. **A lista tem de sair do bloco, e a verdade tem de sair do binário.**

```bash
# Deriva a lista de verbos DO BLOCO e confronta-a com a lista real DO BINÁRIO.
# Nenhuma das duas é escrita à mão aqui — é essa a diferença face ao v2.
BLOCK_FILE="${1:?bloco canónico a escrever}"

command -v graphify >/dev/null 2>&1 || {
  echo "graphify não instalado — o bloco não deve citar verbos estruturais." >&2; exit 1; }

# 1. verbos reais, do help do binário instalado
REAL=$(graphify --help 2>&1 | grep -oE '^[[:space:]]{2,4}[a-z][a-z-]+' | tr -d ' ' | sort -u)

# 2. verbos citados pelo bloco (graphify <verbo>), sem os repetir aqui
CITED=$(grep -oE 'graphify [a-z][a-z-]+' "$BLOCK_FILE" | awk '{print $2}' | sort -u)

# 3. confronto — falha alto e nomeia
#
# `while IFS= read -r`, nunca `for v in $CITED`: em zsh uma variável não citada
# NÃO sofre word-splitting, logo o `for` itera UMA vez com a lista inteira, e o
# `grep -qx` com um padrão multilinha casa se QUALQUER linha casar — o check
# passa sempre. Verificado: com esse `for`, um verbo inventado passava a verde.
# `-F` porque os verbos são literais, não regex.
MISSING=""
while IFS= read -r v; do
  [ -n "$v" ] || continue
  printf '%s\n' "$REAL" | grep -qxF "$v" || MISSING="$MISSING $v"
done <<EOF
$CITED
EOF

if [ -n "$MISSING" ]; then
  echo "ALARME: o bloco cita verbos que não existem em $(graphify --version 2>/dev/null):$MISSING" >&2
  echo "NÃO escrever. Verbos disponíveis:" >&2
  echo "$REAL" | tr '\n' ' ' >&2; echo >&2
  exit 1
fi
```

**O que este check apanha, e o que não apanha.** Verificado nos dois sentidos: um verbo inventado no bloco falha com `rc=1` e é nomeado; o bloco actual passa. Mas **o bloco `v2` também passa** — todos os verbos que ele citava existiam. O defeito do `v2` não era citar um verbo falso, era **omitir verbos reais** e afirmar em prosa que não existiam. Nenhum check automático de resolução apanha uma omissão, porque não há nada para resolver.

Contra esse sentido só há uma defesa, e é editorial:

**Regra derivada, aplicável a qualquer bloco que este skill escreva:** não fixar em prosa que verbo existe em que versão. Se a informação é verificável contra o binário, verificar; se não é verificável, não a afirmar. Uma regra permanente errada é seguida com confiança — é o modo de falha mais caro desta stack, e não se resolve acertando na versão de hoje.

Ao rever o bloco, a pergunta certa não é *"os verbos que cito existem?"* (o check responde) mas **"a lista real do binário tem algum verbo que responda melhor a estas perguntas do que o que eu escolhi?"**. Foi essa a pergunta que ninguém fez no `v2`, e é por isso que `graphify affected` — o verbo cujo propósito literal é *"nodes impacted by X"* — esteve nove meses fora de uma regra cuja pergunta principal é *"o que parte se eu mexer aqui?"*.

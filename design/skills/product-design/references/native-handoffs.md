# Native handoffs

O contrato de cada invocação nativa: o que passar, o que exigir de volta. A secção
design-sync/DesignSync (system mode) está no fim, adicionada na Fase 3.

## → frontend-design (skill nativa) — direção estética

**Quando:** passo 2 de ambos os pipelines.

**Como invocar:** via Skill tool, `frontend-design`.

**O que passar:**
- O subject concreto (produto, o que é), a audiência, e o job único da página/produto.
- Todo o real content disponível (nada de lorem ipsum). Se faltar, primeiro pinar o subject
  (é o "ground it in the subject" da própria skill).

**O que EXIGIR de volta antes de escrever qualquer código:**
- Um token plan: paleta como 4–6 hex nomeados; 2+ typefaces (display characterful + body +
  utility se preciso); um layout concept; e o **signature** — o elemento único que a página
  vai ser lembrada por.
- A auto-crítica anti-default: a `frontend-design` verifica se o plano cai num dos 3 looks
  AI-default e revê. Não avançar para o build sem essa passagem.

**Fronteira:** o `product-design` NÃO propõe cores nem tamanhos. Recebe-os da
`frontend-design` e limita-se a verificar coerência no quality floor.

## → Artifact (tool nativa) — render de mockup visível

**Quando:** passo 4 do mockup pipeline.

**O que passar:** o HTML self-contained (CSP do Artifact bloqueia hosts externos → tudo
inline: CSS, SVG, fontes como data: ou system/Google Fonts conforme o plano permitir), um
`title` estável, uma `description` de uma frase, e um `favicon` (1–2 emoji).

**O que devolve:** o URL privado partilhável da página. Reportá-lo ao utilizador.

**Fallback (sem login claude.ai):** gravar o mesmo HTML em `${WORKSPACE:-$PWD}/<nome>.html`
e dizer que não há página partilhável. Nunca falhar o mockup mode por falta de login.

**Nota:** antes de publicar, a própria tool Artifact obriga a carregar a skill
`artifact-design` (calibra o investimento de design da página). Respeitar essa etapa.

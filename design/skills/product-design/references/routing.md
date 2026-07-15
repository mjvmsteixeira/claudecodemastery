# Routing e dependências

## Decisão de modo

Dois modos. Decidir por esta ordem:

1. **Sub-comando explícito** — `/product-design mockup ...` ou `/product-design system ...`,
   ou o utilizador diz "mockup mode" / "system mode". Respeitar.
2. **Sinais no brief** — se não houver sub-comando:
   - → **mockup mode**: "página", "landing", "deck", "slide", "poster", "pricing screen",
     "mockup de X", "desenha-me o ecrã de Y". Uma superfície, um artefacto.
   - → **system mode**: "design system", "biblioteca de componentes", "component library",
     "tokens", "brand", "linguagem visual do produto", "kit de UI". Um sistema reutilizável.
3. **Ambíguo** — se os sinais não decidirem, fazer UMA pergunta de confirmação antes de
   arrancar (não adivinhar): "Queres um mockup único desta surface, ou o design system do
   produto (tokens + componentes)?"

## Deteção de dependências

Correr no arranque, antes do pipeline. Reportar o que se detetou em uma linha.

### frontend-design (skill nativa) — soft em ambos os modos

A skill `frontend-design` é a fonte da direção estética. Tentar invocá-la via Skill tool.
Se não estiver disponível no ambiente (não instalada), **não falhar**: avisar
("frontend-design não disponível — uso um plano de tokens mínimo, resultado menos
distintivo") e seguir com o fallback da Task 3 (plano mínimo, claramente rotulado).

### Artifact (login claude.ai) — soft no mockup mode

O render de mockup usa a tool `Artifact`. Se a publicação falhar por falta de login
claude.ai, cair para ficheiro HTML local (`${WORKSPACE:-$PWD}/<nome>.html`) e dizê-lo
explicitamente ("sem login claude.ai — gravei HTML local, sem página partilhável").

### design-sync / DesignSync (login + design scopes) — hard no system mode

Só relevante no system mode (Fase 3). Sem autorização claude.ai/design, o system mode fica
indisponível — parar com instrução `/design-login`. Documentado na Fase 3.

## Princípio

Nunca falhar duro no mockup mode: há sempre um caminho para entregar algo (Artifact ou
ficheiro local). Falhar cedo e claro só no system mode quando a autorização claude.ai/design
falta.

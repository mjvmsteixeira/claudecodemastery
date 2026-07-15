# Quality floor

Aplicado antes de entregar, em ambos os modos. **Verificável**, não declarativo: cada item é
uma verificação concreta, não uma afirmação.

## Checklist

1. **Responsive até mobile** — o layout não parte abaixo de 768px; conteúdo largo (tabelas,
   diagramas) faz scroll no seu container, o body nunca faz scroll horizontal.
2. **`:focus-visible` real** — todo o elemento interativo (links, botões, inputs) tem estado
   de foco visível. Nunca `outline: none` sem substituto.
3. **`prefers-reduced-motion: reduce`** respeitado — animações decorativas não arrancam sob
   esta media query.
4. **Coerência com o plano da frontend-design** — cada cor e tamanho no código traça ao token
   plan devolvido pela `frontend-design`. Se um valor não está no plano, não foi inventado
   aqui: voltar ao plano. (O `product-design` verifica; não decide a paleta.)
5. **Contraste** — o par texto/fundo herdado do plano tem ratio ≥ 4.5 para body, ≥ 3 para
   display grande. Verificar os números, não assumir.
6. **Real data** — zero "lorem ipsum", zero "John Doe". Placeholders, se inevitáveis, são
   rotulados explicitamente (`<!-- PLACEHOLDER: substituir -->`).

## Screenshot + auto-crítica

Quando o ambiente o permitir, tirar screenshot do render e criticar ("uma imagem vale 1000
tokens"). Reportar compromissos ao utilizador explicitamente, nunca silenciar.

## Fallback: plano de tokens mínimo (quando frontend-design está ausente)

Se a `frontend-design` não estiver disponível, produzir um token plan mínimo próprio e
**rotulá-lo como degradado** ("plano mínimo — resultado menos distintivo do que com
frontend-design"): 4–6 papéis de cor nomeados derivados do brief, 2 typefaces, um layout
concept, um signature. Isto é um fallback de emergência, não o caminho normal — o caminho
normal delega sempre à `frontend-design`.

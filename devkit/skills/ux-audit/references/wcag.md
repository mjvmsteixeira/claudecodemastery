# Acessibilidade — WCAG 2.1 AA

Referência carregada pela skill `ux-audit` quando o scope inclui `a11y`.

**Estrutura semântica:**
- Heading hierarchy (h1→h2→h3 sem saltar, um h1 por página)
- Landmarks (`<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>`) presentes
- Skip-to-content link no layout principal
- `<button>` para acções, `<a>` para navegação (não confundir)

**Forms:**
- `<label htmlFor>` ↔ `<input id>` em todos os pares
- `aria-describedby` para help text e errors
- `aria-invalid` em campos com erro
- `required` + `aria-required` consistente
- Error messages associados com `aria-errormessage`

**Imagens e ícones:**
- `<img alt="">` em todas as imagens (descritivo ou `alt=""` se decorativo)
- Icon buttons com `aria-label` ou `aria-labelledby`
- SVG decorativo com `aria-hidden="true"`
- SVG informativo com `<title>` ou `role="img"` + `aria-label`

**Modais e overlays:**
- `role="dialog"` + `aria-modal="true"`
- Focus trap activo (foco fica dentro)
- Escape fecha (sem perder dados sem aviso)
- Focus restore para o trigger ao fechar
- Initial focus em primeiro elemento focusable

**Notificações:**
- Toasts com `role="alert"` + `aria-live="assertive"` (urgent) ou `polite` (info)
- Status updates com `aria-live="polite"` + `aria-atomic`

**Tabelas:**
- `<th scope="col">` / `scope="row"`
- `<caption>` ou `aria-labelledby`
- Tabelas complexas com `headers` em `<td>`

**Keyboard:**
- Todos os elementos interactivos focusable via Tab
- Focus indicator visível (não `outline: none` sem replacement)
- Tab order lógica (sem `tabindex` positivo)
- Custom widgets com keyboard handlers (Arrow keys em listbox, etc.)

**Contraste de cor:**
- Texto normal: ratio ≥ 4.5:1
- Texto large (≥18pt ou ≥14pt bold): ratio ≥ 3:1
- UI components e estados focus: ratio ≥ 3:1
- Avisar quando contraste falha (usar APCA ou WCAG2 calculator)

**Animação e movimento:**
- `prefers-reduced-motion` respeitado
- Animações infinitas com pause control
- Sem flashing > 3Hz

# Usabilidade — 10 heurísticas de Nielsen

Referência carregada pela skill `ux-audit` quando o scope inclui `usability`.

**1. Visibility of system status:**
- Loading states em todas as operações async
- Progress indicators em tarefas > 1 segundo
- Feedback imediato após acções (save, delete, submit)

**2. Match between system and real world:**
- Linguagem do utilizador (não jargão técnico em UI)
- Idioma consistente em toda a app (PT vs EN — não misturar)
- Datas no formato local

**3. User control and freedom:**
- Undo/cancel em acções destrutivas
- Confirmação para acções irreversíveis (não `window.confirm()`, usar modal custom)
- "Voltar" funcional no browser

**4. Consistency and standards:**
- Mesmo conceito = mesmo componente em toda a app
- Naming consistente (não "Edit"/"Modificar"/"Alterar" para a mesma acção)
- Padrões da plataforma respeitados

**5. Error prevention:**
- Validação inline (onBlur) em forms
- Confirmação antes de delete
- Disable submit enquanto inválido (com feedback do porquê)

**6. Recognition rather than recall:**
- Labels visíveis (não só placeholders)
- Histórico/recentes acessível
- Breadcrumbs em hierarquias profundas

**7. Flexibility and efficiency:**
- Keyboard shortcuts em apps power-user
- Bulk actions em listas
- Saved filters/views

**8. Aesthetic and minimalist design:**
- Information hierarchy clara
- Sem clutter (cada elemento justifica espaço)

**9. Help users recognize, diagnose, recover from errors:**
- Mensagens de erro específicas (não "Erro" genérico)
- Próximo passo sugerido
- Sem stack traces para utilizadores

**10. Help and documentation:**
- Tooltips em controls não óbvios
- Empty states informativos
- Onboarding ou tutoriais para fluxos complexos

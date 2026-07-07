# Responsividade

Referência carregada pela skill `ux-audit` quando o scope inclui `responsive`.

- **Mobile-first**: estilos base para mobile, breakpoints sobem
- Breakpoints declarados (sm/md/lg/xl ou equivalentes do framework)
- Grids responsivos (não `grid-cols-N` fixo sem breakpoints)
- Flex layouts com `flex-col → flex-row` em breakpoints
- Touch targets ≥ 44×44px em mobile
- Sidebars colapsáveis em mobile
- Modais full-screen em mobile, centrados em desktop
- Imagens responsivas (`srcset`, `sizes`, ou `object-fit`)
- Tabelas com overflow-x ou alternative card view em mobile
- Sem horizontal scroll inesperado

---
name: vault-toolkit
description: Gestão de segredos por-projeto contra um Vault local — lista, edita, audita, faz backup e integra segredos do projecto actual. Dispara em "que segredos tem este projecto", "lista segredos do Vault", "integra este projecto com o Vault", "verifica PLACEHOLDERs no .env", "audita policy do projecto", "backup encriptado dos segredos", "actualiza segredo no Vault". Skill thin que delega para os commands /vault-list, /vault-set, /vault-audit, /vault-backup, /vault-integrate. Read-only por defeito; alterações ao Vault só com command explícito ou confirmação. NÃO confundir com /prumo-vault-doctor (diagnóstico do Vault de produção do SaaS — vive no prumo-secops).
---

# vault-toolkit

Skill-trigger que delega para os 5 commands `/vault-*` do `prumo-base`. Toda a metodologia operacional está nos próprios commands — esta skill apenas seleciona o command certo conforme a intenção do utilizador.

## Trigger

- `"que segredos tem este projecto?"`, `"lista segredos"`, `"vault list"`
- `"integra este projecto com o Vault"`, `"vault integrate"`
- `"verifica PLACEHOLDERs"`, `"audita policy"`, `"vault audit"`
- `"backup encriptado dos segredos"`, `"vault backup"`
- `"actualiza segredo"`, `"adiciona segredo"`, `"vault set"`

## Roteamento

| Intenção do utilizador | Command |
|------------------------|---------|
| Listar / inspeccionar segredos do projecto e partilhados | `/vault-list` |
| Migrar `.env` para Vault, gerar policy/AppRole | `/vault-integrate` |
| Verificar saúde da integração Vault local (PLACEHOLDERs, TTL, policy coverage) | `/vault-audit` |
| Exportar backup encriptado dos segredos | `/vault-backup` |
| Adicionar ou actualizar um segredo | `/vault-set` |
| Diagnosticar o servidor Vault de **produção** (não-local) | `/prumo-vault-doctor` (vive em `prumo-secops`) |

## Acção

1. Identificar a intenção do utilizador e mapear ao command apropriado pela tabela acima.
2. Invocar o command directamente (sem reproduzir a lógica aqui).
3. Se a intenção é ambígua, pedir clarificação antes de tocar no Vault — operações que escrevem (set, integrate) não devem ser presumidas.

## Pré-requisito

Vault local acessível em `https://127.0.0.1:8200` (ou `VAULT_ADDR` definido). O hook `SessionStart` do `prumo-base` tenta o auto-unseal — se falhou, ver mensagem do hook e correr `vault status` ou `/vault-audit`.

---
name: wire-vault-policy
description: Gera template HCL de policy Vault para um novo AppRole/projecto. Dispara em "cria policy vault para X", "preciso de uma nova approle", "template de policy", "nova policy vault para o projecto Y". Não aplica — escreve ficheiro para revisão.
---

# wire-vault-policy

Skill-trigger que delega para `/wire-vault-policy <nome>`. Gera um template HCL parametrizado para uma policy Vault nova, escrito em `$VAULT_HOME/policies/<nome>-policy.hcl` para o utilizador rever antes de aplicar.

## Trigger

- `"cria uma policy vault para X"`, `"nova approle Y"`
- `"preciso de uma policy para o projecto Z"`
- `"template de policy vault"`, `"policy hcl"`
- `"adiciona uma role nova no vault"`

## Acção

Inferir os parâmetros da intenção do utilizador e invocar `/wire-vault-policy` com as flags certas:

| Intenção | Invocação |
|----------|-----------|
| "Policy de leitura para o projecto X" | `/wire-vault-policy <x>-ro --kv-read projects/<x> --kv-read ai --kv-read tokens` |
| "AppRole nova para monitor de Wazuh" | `/wire-vault-policy wire-monitor --kv-read observability --ssh-role wire-srv-role` |
| "Role para deploy" | `/wire-vault-policy <projecto>-deploy --kv-read cicd` |
| "Cifra/decifra de evidência IR" | `/wire-vault-policy <projecto>-ir --transit-key forensics --kv-full ir/<projecto>` |

Se o utilizador não der detalhes suficientes (que paths? que capacidades?), perguntar **uma** pergunta concreta antes de invocar — não inventar paths sem cobertura clara.

## Fronteira

- O command **não aplica** a policy — só escreve o ficheiro HCL. Aplicar fica para o utilizador via `vault policy write`.
- Não substitui revisão: HCL gerado deve ser lido antes de ser aplicado. Policies mal escritas podem desbloquear paths críticos.
- Não toca em policies existentes — recusa se o ficheiro de destino já existir.
- Para policies do `wire-secops` (7 AppRoles consolidadas em `secops/vault-policies.hcl`), prefere acrescentar lá em vez de criar um ficheiro novo isolado — questão de single-source.

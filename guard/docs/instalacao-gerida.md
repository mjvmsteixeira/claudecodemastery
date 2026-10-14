# Instalação gerida do prumo-guard

Como instalar o marketplace `prumo` e o mod `prumo-guard` em máquinas de clientes por managed settings. Nada neste documento se instala na máquina de desenvolvimento.

Chaves e comportamentos confirmados na documentação oficial do Claude Code em 2026-10-14 (fontes no fim de cada secção). O que não se confirmou está marcado "por confirmar".

## 1. Porquê gerido

Um mod instalado por managed settings corre no tier `prepend`, à frente de tudo o que uma pessoa instala. Os tipos da API dizem-no na documentação de `next.to` (`claude-code.d.ts`):

> A managed hook's: prepend may name append, builtin or core, append core; it never skips a tier with more authority, so no user hook skips the org's.

Os tiers, do mais exterior para o mais interior, são `prepend`, `user`, `append`, `builtin` e `core`; `prepend` e `append` são "the managed plugins an administrator lists". Um guard instalado só no tier `user` pode ser saltado por outro mod do utilizador. No tier `prepend` não pode.

Condição para um mod contar como da organização (https://code.claude.com/docs/en/plugins/mods/admin, 2026-10-14):

- `enabledPlugins` gerido põe o plugin a `true`;
- as managed settings nomeiam o marketplace como um **diretório na máquina**, com caminho absoluto (`source: "directory"`);
- o marketplace lista o plugin por **caminho relativo**, para o Claude Code o carregar no local.

Um plugin que o Claude Code copia para a cache (origem GitHub, git, URL ou npm) conta como do utilizador, mesmo com `enabledPlugins` gerido: o `prependPlugins` ignora-o e o `allowManagedModsOnly` recusa-o. Consequência para o prumo: um marketplace `github` serve os plugins bash (`prumo-base`, `prumo-secops`), mas o `prumo-guard` só corre no tier `prepend` se o marketplace for copiado por MDM para um diretório fixo (por exemplo `/opt/prumo/claude-plugins`), gravável apenas por administradores.

## 2. Ficheiro e chaves

Localização do ficheiro de managed settings (https://code.claude.com/docs/en/managed-settings, 2026-10-14):

- macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
- Linux e WSL: `/etc/claude-code/managed-settings.json`
- Alternativas confirmadas: diretório `managed-settings.d/` ao lado do ficheiro, perfil MDM (domínio `com.anthropic.claudecode` no macOS) e managed settings do servidor na consola claude.ai.

Chaves confirmadas (https://code.claude.com/docs/en/plugins/org e https://code.claude.com/docs/en/plugins/mods/admin, 2026-10-14):

| Chave | Efeito confirmado |
| :- | :- |
| `extraKnownMarketplaces` | Regista o marketplace em cada máquina; a chave é o `name` do `marketplace.json`; leva `source` (`github`, `git`, `url`, `directory`, `file`) |
| `enabledPlugins` | `"plugin@marketplace": true` instala e ativa; `false` bloqueia em todos os âmbitos. O utilizador não consegue desativar um plugin forçado a `true` |
| `prependPlugins` | Lista de ids que correm à frente dos mods do utilizador; ao defini-la, nomear também `sec-default@builtin` para manter o guard integrado |
| `strictKnownMarketplaces` | Lista de permissão de origens de marketplace; impede o utilizador de adicionar outras. `[]` bloqueia tudo |
| `blockedMarketplaces` | Lista de bloqueio de origens, avaliada antes da de permissão |
| `disableSideloadFlags` | Recusa `--plugin-dir`, `--plugin-url`, `--agents` e `--mcp-config` no arranque |
| `pluginConfigs["cc-plugin-sec-default@builtin"].options.allowManagedModsOnly` | Só correm os mods da organização e os integrados |

Exemplo para um cliente, com o marketplace `prumo` copiado para `/opt/prumo/claude-plugins` (diretório com `.claude-plugin/marketplace.json` e os plugins por caminho relativo):

```json
{
  "extraKnownMarketplaces": {
    "prumo": {
      "source": { "source": "directory", "path": "/opt/prumo/claude-plugins" }
    }
  },
  "enabledPlugins": {
    "prumo-base@prumo": true,
    "prumo-secops@prumo": true,
    "prumo-guard@prumo": true
  },
  "prependPlugins": ["prumo-guard@prumo", "sec-default@builtin"],
  "strictKnownMarketplaces": [
    { "source": "directory", "path": "/opt/prumo/claude-plugins" },
    { "source": "skills-dir" }
  ],
  "disableSideloadFlags": true
}
```

Notas:

- O plugin `prumo-guard` tem de estar listado no `marketplace.json` do diretório copiado, com `source` relativo (`./guard`).
- Se o diretório for substituído por um marketplace `github` (`{ "source": "github", "repo": "<org>/<repo>" }`), os plugins bash instalam-se, mas o `prumo-guard` passa a contar como mod do utilizador (secção 1).
- Para recusar também os mods que o utilizador traga, acrescentar `pluginConfigs` com `allowManagedModsOnly: true` (exemplo na fonte). Efeitos colaterais no resto do ecossistema: por confirmar em máquina de teste antes de ir para cliente.
- Os caminhos concretos do `/opt/prumo/...` são escolha do cliente; o documento oficial pede que o diretório e os pais sejam graváveis só por administradores.

Por confirmar: valor mínimo do CLI para o tier `prepend` com `prependPlugins` em cada versão. A documentação indica mods ativos por omissão a partir da v2.1.286 e o alias `strictKnownMarketplaces`/`allowedMarketplaces` a partir da v2.1.232. Fixar a versão do CLI no cliente e testar.

## 3. Configuração da instalação

Ficheiros em `~/.prumo/` do utilizador final, protegidos contra escrita pelo agente pelo `pre-tool-self-guard.sh` (no Bash, best effort: indirecções em vários passos escapam-lhe). Quem os escreve é a pessoa ou a gestão de dispositivos, não o agente.

`~/.prumo/org.json` (identidade da organização; lido por `prumo_org`, cada chave sobreponível por `PRUMO_ORG_<CHAVE>`). Valores fictícios:

```json
{
  "prefix": "acme",
  "domain": "acme.example"
}
```

`~/.prumo/guard.json` (secções e defaults do mod, em `guard/hooks/config.ts`; chaves em falta usam o default):

```json
{
  "redact": { "enabled": true, "prompt": true, "readPii": false, "internalIps": false },
  "brake": { "usdBudget": 20, "tokenBudget": 0, "repeatLimit": 4 },
  "workspace": { "extraRoots": ["/srv/acme/projetos"] },
  "friday": { "enabled": false },
  "agents": { "hidden": [] },
  "mempalace": { "staleDays": 90 },
  "cef": { "enabled": true }
}
```

`~/.prumo/redact.json`: padrões de redação da organização, somados aos de base (NIF, IBAN, tokens, etc.). Formato exato do ficheiro: por confirmar na implementação do Task de redação (`guard/hooks`), que ainda não existe nesta ramificação; não se inventa aqui.

`~/.prumo/secret-exec.json`: allowlist de `argv[0]` para `run_with_secret`; o default é `psql`, `mysql`, `curl`, `gh`, `git`, `docker`, `kubectl`, `redis-cli`, `mongosh`, e shells e interpretadores são sempre recusados (spec, D9). Formato exato do ficheiro: por confirmar, pelo mesmo motivo.

## 4. Verificação

1. `/status` numa sessão: a linha `Setting sources` tem de nomear a fonte gerida (`Enterprise managed settings`); se não aparecer, a fonte não carregou (https://code.claude.com/docs/en/plugins/org, 2026-10-14).
2. `claude plugin list`: `prumo-guard@prumo` com `Status: enabled`.
3. `claude --debug` e procurar `hooks module prumo-guard@prumo loaded` com `tier prepend`. Com `tier user`, o mod não conta como da organização (secção 1).
4. `/prumo-mod-audit` (prumo-secops): tabela com os gating hooks sem `.catch`, as chamadas sensíveis a `$` e a telemetria de cada mod instalado.
5. `/prumo-guard`: estado do mod (modo, aprovações pendentes, redação).

## 5. Limitações

- A API de mods está em acesso antecipado. O `prumo-guard` foi escrito contra os tipos da versão 2.1.299 e testado com o CLI 2.1.300; fixar no cliente uma versão do CLI compatível e repetir `claude plugin validate` e `claude plugin test` ao atualizar.
- O `prumo-guard` só corre no tier `prepend` com marketplace em diretório local copiado por MDM (secção 1). Managed settings enviadas pela consola claude.ai podem levar as chaves, mas não colocam o diretório na máquina.
- `--safe-mode` desliga todos os mods instalados, também os da organização; e se o worker dos mods falhar três vezes numa sessão, os mods não integrados são descarregados até `/reload-plugins` (fonte: página de administração de mods, 2026-10-14).
- Os hooks bash do `prumo-base` e do `prumo-secops` continuam a ser o fallback: cobrem a mesma superfície quando o mod não carrega. O marker `~/.prumo/run/cef-mod.<session_id>` evita o registo CEF duplicado quando o mod está ativo.

## Fontes (consultadas em 2026-10-14)

- https://code.claude.com/docs/en/managed-settings (caminhos do ficheiro e mecanismos de entrega)
- https://code.claude.com/docs/en/plugins/org (`extraKnownMarketplaces`, `enabledPlugins`, `strictKnownMarketplaces`, `blockedMarketplaces`, `disableSideloadFlags`)
- https://code.claude.com/docs/en/plugins/mods/admin (`prependPlugins`, condições para um mod contar como da organização, `allowManagedModsOnly`)
- `claude-code.d.ts` da skill plugin-authoring 2.1.299 (tiers e `next.to`)

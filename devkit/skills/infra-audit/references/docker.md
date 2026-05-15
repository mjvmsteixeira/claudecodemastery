# Docker — Compose e Dockerfile

Referência carregada pela skill `infra-audit` quando o scope inclui `docker`.

## Docker Compose

Para cada `docker-compose*.yml`:

**Estrutura:**
- Serviços duplicados (YAML merge silencioso)
- `depends_on` correcto para topologia
- Volumes nomeados com dados stale
- Conflitos de portas
- Override files em produção (devia ser `compose.override.yml` só em dev)

**Segurança:**
- `privileged: true` justificado?
- `cap_add: [SYS_ADMIN, NET_ADMIN, ...]` necessário?
- `network_mode: host` evitável?
- Bind mounts de paths sensíveis (`/`, `/var/run/docker.sock`, `/etc`)
- Variáveis sensíveis em `environment:` (devia ser `env_file:` ou secrets)

**Operacional:**
- Resource limits (`mem_limit`, `cpus`) em todos os serviços de prod
- Health checks (`healthcheck:`) configurados
- Restart policy (`restart: unless-stopped` ou `always`)
- Log rotation (`logging.driver: json-file` com `max-size`/`max-file`)

**Redes:**
- Segmentação (mínimo: frontend público + backend interno + data isolado)
- DB acessível só ao backend
- Networks declaradas explicitamente (não `default`)

## Dockerfile

- `USER` não-root definido
- `.dockerignore` existe e cobre `.env`, `.git`, `node_modules`, `__pycache__`
- Imagens base pinadas a tag específica (não `:latest`, idealmente digest `@sha256:...`)
- Multi-stage build se há tooling de build (gcc, npm, maven)
- `HEALTHCHECK` definido
- Sem secrets hardcoded
- `RUN apt-get update` sempre seguido por `apt-get install` na mesma layer
- `--no-install-recommends` em apt
- Cleanup de cache (`rm -rf /var/lib/apt/lists/*`)

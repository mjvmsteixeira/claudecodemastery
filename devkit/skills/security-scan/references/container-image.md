# Container / Dockerfile

Carregar quando existir `Dockerfile*` ou `docker-compose*.yml`. Ferramenta: `hadolint`
se `command -v`; imagem construída → `trivy image <ref>`; senão análise do modelo.

- **Sem `USER` não-root** (CWE-250): container corre como root. Exigir `USER <nonroot>`
  antes do `CMD`/`ENTRYPOINT`.
- **Secrets em layers** (CWE-522): `ENV`/`ARG` com password/token, `COPY .env`,
  `RUN curl -H "Authorization: ..."` — ficam no histórico da imagem. Usar `--secret` mounts.
- **Base-image sem digest** (CWE-1357): `FROM node:20` em vez de `FROM node:20@sha256:...`.
- **`:latest`** (CWE-1104): não-reprodutível; pinnar tag + digest.
- **Base-image desatualizada / EOL** (CWE-1104): distro/runtime fora de suporte.
- **`ADD` de URL remota** (CWE-494): preferir `COPY`; `ADD http://...` sem verificação.
- **`apt-get`/`apk` sem pin de versão e sem `--no-install-recommends`.**
- **Compose:** `privileged: true`, `network_mode: host`, montar `/var/run/docker.sock`,
  capabilities amplas (`cap_add: [ALL]`) — CWE-250.

Cada finding: `engine:"hadolint"|"trivy"|"grep"`, `cwe` conforme acima.

# CI/CD Supply-Chain

Carregar quando existir `.github/workflows/*.yml` ou `.gitlab-ci.yml`. Ferramenta:
`actionlint` (GitHub) se `command -v`; senão análise do modelo dos YAML.

## GitHub Actions

- **Actions não-pinned por SHA** (CWE-1357): `uses: owner/action@v3` ou `@main` permite
  que a tag seja movida. Exigir `uses: owner/action@<sha40>`. `grep -nE 'uses:.*@(v?[0-9]+|main|master)$'`.
- **`pull_request_target` com checkout de código não-confiável** (CWE-94): combina secrets
  do repo base com código do fork — RCE. Sinalizar qualquer `pull_request_target` que faça
  `actions/checkout` de `head.ref`/`head.sha`.
- **Permissões do `GITHUB_TOKEN`** (CWE-250): sem `permissions:` no topo, o token é
  read-write amplo. Exigir `permissions:` mínimo por job.
- **Secrets em logs** (CWE-532): `echo ${{ secrets.X }}`, `run:` que imprime env.
- **`script injection` via `${{ github.event.* }}`** (CWE-94): input do atacante
  (título de PR, branch) interpolado direto num `run:` — usar env intermédia.
- **Self-hosted runners em repos públicos** (CWE-284): forks executam código arbitrário.

## GitLab CI

- Jobs sem `rules:`/`only:` que corram em qualquer branch com secrets protegidos.
- `CI_JOB_TOKEN` com scope amplo; imagens não-pinned (`image: node` sem tag/digest).
- Variáveis não-masked/protegidas expostas em MRs de forks.

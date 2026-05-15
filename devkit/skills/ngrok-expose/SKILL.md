---
name: ngrok-expose
description: Expõe uma aplicação local via túnel ngrok HTTPS público. O authtoken vem do Vault através do plugin wire-base. Dispara em "expõe esta app", "ngrok", "túnel público", "põe isto online", "expõe localhost", "partilha esta app". Requer o wire-base instalado.
---

# ngrok-expose

Skill-trigger que delega para o command `/ngrok-expose` — expõe uma app local via
túnel ngrok HTTPS, com o authtoken obtido do Vault via `wire-base`.

## Trigger

- `"expõe esta app"`, `"ngrok"`, `"túnel público"`, `"põe isto online"`,
  `"expõe localhost"`, `"partilha esta app"`

## Acção

Seguir as instruções do command `/ngrok-expose`: localizar o `lib/vault-env.sh` do
`wire-base`, obter o authtoken do Vault, detectar a porta da app (dev vs prod),
iniciar o túnel e reportar o URL.

Se o `wire-base` não estiver instalado, informar o utilizador que é pré-requisito
(`/plugin install wire-base@jump2new`) e parar — não há fallback inseguro.

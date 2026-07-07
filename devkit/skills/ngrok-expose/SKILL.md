---
name: ngrok-expose
description: Expõe uma aplicação local via túnel ngrok HTTPS público. O authtoken vem do Vault através do plugin prumo-base. Dispara em "expõe esta app", "ngrok", "túnel público", "põe isto online", "expõe localhost", "partilha esta app". Requer o prumo-base instalado.
---

# ngrok-expose

Skill-trigger que delega para o command `/ngrok-expose` — expõe uma app local via
túnel ngrok HTTPS, com o authtoken obtido do Vault via `prumo-base`.

## Trigger

- `"expõe esta app"`, `"ngrok"`, `"túnel público"`, `"põe isto online"`,
  `"expõe localhost"`, `"partilha esta app"`

## Acção

Seguir as instruções do command `/ngrok-expose`: localizar o `lib/vault-env.sh` do
`prumo-base`, obter o authtoken do Vault, detectar a porta da app (dev vs prod),
iniciar o túnel e reportar o URL.

Se o `prumo-base` não estiver instalado, informar o utilizador que é pré-requisito
(`/plugin install prumo-base@prumo`) e parar — não há fallback inseguro.

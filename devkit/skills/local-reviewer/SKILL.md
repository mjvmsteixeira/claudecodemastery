---
name: local-reviewer
description: Segunda opinião independente de code review usando um modelo Qwen3-Coder local via Ollama — sem enviar código para a cloud. Indicado para análise de segurança, validação de arquitectura, ou quando a privacidade dos dados é uma preocupação. Dispara em "segunda opinião", "revê isto com o modelo local", "independent review", "code review local", "review sem cloud", "valida isto com o Qwen". Read-only — não modifica ficheiros.
---

# local-reviewer

Skill-trigger que delega para o agente `local-reviewer` — uma segunda opinião de code
review via Ollama qwen3-coder local, read-only, sem cloud.

## Trigger

- `"segunda opinião"`, `"revê isto com o modelo local"`, `"independent review"`,
  `"code review local"`, `"valida isto com o Qwen"`

## Acção

Invocar o agente `local-reviewer` (via Agent tool) sobre os ficheiros relevantes —
recentemente alterados, mencionados pelo utilizador, ou identificados por `git diff`.

Toda a metodologia (pre-flight do Ollama, query ao modelo, checklist de review,
formato de output, verdict APPROVE/NEEDS CHANGES/REJECT) está definida no próprio
agente — esta skill não a duplica.

Se o Ollama local não estiver acessível, o agente degrada para análise própria e
nota a ausência no relatório.

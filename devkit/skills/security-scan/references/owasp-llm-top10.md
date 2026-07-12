# OWASP LLM Top 10 (2025)

Carregar quando o projeto integra um LLM (SDK `anthropic`/`openai`/`langchain`,
construção de prompts, agentes com tools, RAG). Dogfooding — o próprio ecossistema é IA.

- **LLM01 — Prompt Injection (CWE-77):** input do utilizador (ou conteúdo obtido — email,
  página) concatenado no prompt de sistema sem delimitação/validação; instruções do
  atacante sobrepõem-se às do sistema. Sinalizar prompts construídos por f-string/concat
  com dados não-confiáveis.
- **LLM02 — Sensitive Information Disclosure (CWE-200):** secrets/PII no prompt de sistema,
  respostas do modelo logadas com dados sensíveis, contexto de um tenant a vazar para outro.
- **LLM05 — Improper Output Handling (CWE-79/CWE-94):** output do LLM usado sem sanitizar —
  render como HTML (XSS), `eval()`/`exec` do código gerado, SQL do modelo executado direto.
- **LLM06 — Excessive Agency (CWE-250):** agente com tools de escrita/exec sem confirmação
  humana em ações destrutivas; permissões amplas concedidas ao agente.
- **LLM07 — System Prompt Leakage (CWE-200):** segredos/regras de negócio embebidos no
  system prompt que o modelo pode revelar.
- **LLM08 — Vector/Embedding Weaknesses (CWE-284):** RAG sem controlo de acesso ao índice —
  documentos de um tenant recuperáveis por outro.
- **LLM10 — Unbounded Consumption (CWE-770):** sem limites de tokens/custo/rate por
  utilizador; loops de agente sem teto.

Chave `chrome-live` NÃO aplica aqui — é análise estática de como o LLM é integrado.

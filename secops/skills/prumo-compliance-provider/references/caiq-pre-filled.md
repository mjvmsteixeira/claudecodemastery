# CAIQ — respostas canónicas para entrega rápida

> **Estado: processo e estrutura definidos — o banco de respostas está por construir.**
>
> O CAIQ v4 tem cerca de 261 perguntas em 17 domínios. **Este ficheiro não contém respostas
> pré-preenchidas**, e a omissão é deliberada: uma resposta inventada a uma pergunta de
> conformidade é uma declaração falsa a um cliente, e o rótulo "pré-preenchido" faz com que
> ninguém a verifique antes de enviar. Confirmar a contagem e a estrutura de domínios contra a
> versão do CCM/CAIQ em vigor no site da CSA.
>
> O que este ficheiro fixa é o **formato das respostas, as regras de redacção e o processo** que
> transforma respostas validadas num banco reutilizável. As respostas entram à medida que forem
> validadas — nunca antes.

## Para que serve

O CAIQ (*Consensus Assessments Initiative Questionnaire*) é o questionário da Cloud Security Alliance, alinhado com o CCM (*Cloud Controls Matrix*). Para a Wire tem dois usos:

- **Self-assessment publicado** no CSA STAR Registry (Level 1), que evita responder ao mesmo questionário 170 vezes.
- **Base de resposta** a questionários de concurso, que na prática costumam ser subconjuntos das mesmas perguntas com outra redacção.

O ganho real não é preencher o CAIQ uma vez. É ter um **banco de respostas canónicas validadas** que se reutiliza — e que garante que dois municípios não recebem respostas diferentes à mesma pergunta.

## Formato de cada entrada

```
ID:            <domínio>-<n>   (ex: IVS-03)
Pergunta:      <texto do CAIQ>
Resposta:      Yes | No | NA
Justificação:  <2 a 4 frases. O que está implementado e como.>
Controlo Wire: <CTRL-W-*>
Evidência:     <artefacto verificável e onde está>
Validado por:  <nome> · <data>
Revalidar até: <data>
Confidencial:  <sim/não — se a justificação não pode sair para cliente>
```

Uma entrada sem `Validado por` **não é canónica** e não pode ser usada em resposta a cliente. É rascunho.

## Regras de redacção

1. **`Yes` significa implementado e demonstrável hoje.** Não "planeado", não "parcial". Um `Yes` que não sobreviva a um pedido de evidência é pior do que um `No` honesto — destrói a credibilidade das outras 260 respostas.
2. **`No` com plano vale mais do que `Yes` com asterisco.** Compradores públicos estão habituados a lacunas com prazo; não estão a descobrir que uma resposta era falsa.
3. **`NA` exige justificação.** "Não aplicável porque a Wire não opera datacentro próprio" é justificação; `NA` sozinho lê-se como evasão.
4. **Justificação descreve o mecanismo, não a intenção.** "Os segredos são intermediados por um broker com TTL de 15 minutos e sem chaves estáticas em disco" diz alguma coisa; "a Wire leva a segurança a sério" não.
5. **Uma pergunta, uma resposta canónica.** Se dois municípios recebem respostas diferentes à mesma pergunta, uma delas está errada.
6. **Sem detalhe explorável.** Descrever o controlo sem entregar o mapa da sua contornagem. É o mesmo critério do TLP no IR.

## Os 17 domínios do CCM v4

Estrutura para organizar o banco. As perguntas concretas vêm da versão em vigor.

| Sigla | Domínio |
|---|---|
| A&A | Audit & Assurance |
| AIS | Application & Interface Security |
| BCR | Business Continuity Mgmt & Operational Resilience |
| CCC | Change Control & Configuration Management |
| CEK | Cryptography, Encryption & Key Management |
| DCS | Datacenter Security |
| DSP | Data Security & Privacy Lifecycle Management |
| GRC | Governance, Risk & Compliance |
| HRS | Human Resources Security |
| IAM | Identity & Access Management |
| IPY | Interoperability & Portability |
| IVS | Infrastructure & Virtualization Security |
| LOG | Logging & Monitoring |
| SEF | Security Incident Mgmt, E-Discovery & Cloud Forensics |
| STA | Supply Chain Mgmt, Transparency & Accountability |
| TVM | Threat & Vulnerability Management |
| UEM | Universal Endpoint Management |

### Domínios onde a arquitectura da Wire concentra o risco

Sem antecipar respostas, é onde vale a pena começar o banco — são os mais perguntados a um SaaS multi-tenant e aqueles onde a Wire tem evidência mais específica:

- **IVS** — segregação entre tenants. O controlo crítico nº 1 da plataforma; ancora na família `CTRL-W-T-*`.
- **IAM** e **CEK** — Vault como broker, TTLs curtos, SSH CA sem chaves estáticas.
- **LOG** — Wazuh como SIEM mestre, com a correlação Wazuh ↔ Fortigate.
- **SEF** — resposta a incidentes; remete para o `prumo-ir-multitenant`, sem duplicar.
- **STA** — cadeia de fornecimento, nas duas direcções. Cruza com o Anexo II.
- **DSP** — ciclo de vida dos dados; cruza com o Anexo II e a DPIA.
- **CCC** — gestão de alterações; família `CTRL-W-R-*` e o `/prumo-release-gate`.
- **DCS** — provavelmente muito `NA`, por a Wire não operar datacentro próprio. **`NA` com justificação e com indicação de quem opera** — a responsabilidade transfere-se para o fornecedor de infraestrutura, e o cliente tem direito a saber para quem.

## Processo

1. **Responder por domínio**, não por ordem numérica. Perguntas do mesmo domínio partilham evidência e quem as responde.
2. **Validação obrigatória** antes de entrar no banco: técnico responsável pelo controlo, mais DPO ou jurídico quando a resposta tenha implicação contratual.
3. **Revalidar a cada 12 meses** ou a cada alteração material de arquitectura. Uma resposta validada há três anos é uma afirmação sobre um sistema que já não existe.
4. **Registar divergências.** Se um cliente reformular uma pergunta e a resposta canónica não servir sem adaptação, isso é sinal de que a canónica precisa de revisão — não de que se deve responder à parte.
5. **Publicar no STAR** só o que estiver validado e não confidencial.

## Limite

O `SKILL.md` fixa: **resposta a questionário de cliente exige revisão humana antes de envio.** Um banco canónico acelera a primeira versão; não substitui a revisão. O modo de falha típico não é a resposta errada — é a resposta certa a uma pergunta que o cliente reformulou de forma subtilmente diferente.

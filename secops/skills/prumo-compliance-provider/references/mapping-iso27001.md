# Mapping controlos Wire ↔ ISO/IEC 27001:2022 Anexo A

> **Estado: esqueleto de framework — a coluna de cobertura está deliberadamente por preencher.**
>
> A estrutura do Anexo A (4 temas, 93 controlos) é verificável contra a norma. **A correspondência
> com os controlos `CTRL-W-*` exige o inventário desses controlos**, indisponível a esta skill —
> ver `mapping-nis2.md`, secção "Dependência em falta".
>
> Preencher com correspondências plausíveis produziria uma Declaração de Aplicabilidade sem lastro,
> entregue a auditor externo. Confirmar a numeração contra a norma antes de uso formal; **este
> ficheiro não substitui o acesso ao texto da ISO/IEC 27001:2022**, que é sujeito a direitos de autor.

## Porquê importa à Wire

A ISO 27001 é, na prática, o referencial pedido em concurso público. A diferença face ao NIS2 é de natureza: o NIS2 é obrigação legal, a ISO é **certificação voluntária que se torna requisito comercial**. O trabalho de mapping serve dois fins distintos que convém não confundir:

- **Declaração de Aplicabilidade (SoA)** — peça formal da certificação. Cada um dos 93 controlos tem de ter decisão: aplicável (e implementado como), ou não aplicável (e porquê). Uma exclusão sem justificação escrita é constatação de auditoria.
- **Resposta a concurso** — subconjunto, orientado ao que o caderno de encargos pergunta.

## Estrutura do Anexo A:2022

A revisão de 2022 reorganizou os 114 controlos de 2013 em **93, agrupados em 4 temas**. Quem tiver mapping da versão de 2013 precisa de o converter — a norma publica tabela de correspondência.

| Tema | Controlos | Âmbito |
|---|---|---|
| **A.5 Organizacionais** | 37 | Políticas, papéis, gestão de activos, fornecedores, continuidade, conformidade |
| **A.6 Pessoas** | 8 | Triagem, termos de emprego, sensibilização, processo disciplinar, teletrabalho |
| **A.7 Físicos** | 14 | Perímetros, entradas, equipamento, secretária limpa, manutenção |
| **A.8 Tecnológicos** | 34 | Acessos, criptografia, desenvolvimento seguro, rede, registo, monitorização |

Cinco atributos por controlo, usados para filtrar: tipo (preventivo/detectivo/correctivo), propriedades de segurança (C/I/D), conceitos de cibersegurança, capacidades operacionais, domínios de segurança.

## Tabela de mapping

Uma linha por controlo do Anexo A. Estrutura a preencher:

| Controlo A.x.y | Título | Aplicável | Controlos Wire | Implementação | Evidência | Lacuna / plano |
|---|---|---|---|---|---|---|
| A.5.1 | Políticas de segurança da informação | | | | | |
| A.5.2 | Papéis e responsabilidades | | | | | |
| … | | | | | | |
| A.8.34 | Protecção de sistemas durante auditoria | | | | | |

**Não reproduzir aqui os títulos completos dos 93 controlos** — o texto da norma é protegido. A tabela de trabalho constrói-se a partir do exemplar licenciado da organização; este ficheiro fixa o formato e o processo, não o conteúdo da norma.

## Controlos de atenção redobrada para um SaaS multi-tenant

Sem antecipar cobertura, há controlos onde a arquitectura da Wire torna a evidência menos óbvia e onde o auditor tipicamente insiste:

- **Segregação em redes partilhadas** — o isolamento multi-tenant é o controlo crítico nº 1 da plataforma. É aqui que a família `CTRL-W-T-*` deve ancorar, e onde o `/prumo-tenant-audit` produz evidência.
- **Relações com fornecedores e cadeia TIC** — dupla direcção, como no NIS2: o que os municípios exigem à Wire, e o que a Wire exige aos seus sub-subcontratantes.
- **Desenvolvimento seguro, separação de ambientes, gestão de alterações** — a família `CTRL-W-R-*` e o `/prumo-release-gate` são a evidência natural.
- **Registo, monitorização e protecção dos registos** — Wazuh como SIEM mestre; a correlação Wazuh ↔ Fortigate exigida pelo `prumo-saas-monitoring` é evidência de monitorização efectiva, não apenas de recolha.
- **Gestão de informação de autenticação e acesso privilegiado** — Vault como broker, TTLs curtos, SSH CA sem chaves estáticas. Bem posicionado, mas a evidência tem de mostrar o *funcionamento*, não só a configuração.
- **Cifra** — política de uso, não só existência de algoritmos.

Isto é orientação para onde procurar, **não uma afirmação de que a Wire está conforme**.

## ISO 27017 e 27018

Não são certificáveis autonomamente — estendem a 27001 com orientação para cloud. Entram na SoA como controlos adicionais:

- **27017** — perspectiva de fornecedor de serviço cloud: repartição de responsabilidades com o cliente, remoção de activos à cessação, ambiente virtual, administração de operações.
- **27018** — protecção de PII em cloud, na qualidade de subcontratante. Alinha-se com o RGPD Art. 28 e com o Anexo II do contrato — ver `anexoII-template.md`.

Para a Wire, que é simultaneamente fornecedor cloud e subcontratante de dados de munícipes, as duas são materiais e reforçam a mesma evidência.

## Processo

1. **Âmbito do SGSI** antes de qualquer controlo. Que produtos `wire*`, que infraestrutura, que localizações. Um âmbito mal definido inutiliza o mapping todo.
2. **Decisão por controlo** — aplicável ou não, com justificação escrita para as exclusões.
3. **Evidência por controlo aplicável** — o que existe, onde, quem mantém. Evidência é um artefacto verificável, não uma afirmação.
4. **Lacunas com plano** — acção, responsável, prazo. O princípio *"não inventa cobertura"* aplica-se aqui com particular força: numa auditoria de certificação, cobertura declarada e não demonstrável é pior do que lacuna assumida com plano.
5. **Revisão** a cada alteração material de arquitectura ou de âmbito.

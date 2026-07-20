# Pares Wazuh ↔ Fortigate para correlação

> **Estado: catálogo base, expansível.** Os pares abaixo derivam da tabela do `SKILL.md` e do que a
> topologia (Fortigate no perímetro, Wazuh como SIEM mestre) permite inferir. **As assinaturas IPS
> e WAF concretas dependem do perfil activo no Fortigate** e devem ser confirmadas contra a
> configuração real antes de servirem de baseline.

## O que este ficheiro resolve

Sem baseline, "não encontrei correspondência no Fortigate" é ambíguo: pode significar que o perímetro não viu o tráfego — o que é grave — ou que ninguém sabe qual seria a correspondência esperada — o que é ignorância. **A distinção é o valor todo da correlação.**

Um par documentado transforma a ausência num facto. Um par não documentado transforma-a em nada.

## Semântica do resultado

Para cada evento Wazuh na janela ±15 min, com a mesma origem:

| Resultado | Leitura | Acção |
|---|---|---|
| **Par encontrado** | Perímetro viu e agiu. Cadeia coerente. | Triagem normal pelo nível |
| **Par esperado e ausente** | Tráfego não passou pelo perímetro, ou passou sem ser visto | **Sobe a P2 no mínimo.** Lateral movement, evasão IDS ou supply chain |
| **Sem par esperado** (evento interno por natureza) | Normal | Triagem normal; não é sinal |
| **Fortigate sem Wazuh** | Perímetro bloqueou antes de chegar | Tipicamente ruído já contido |

A assimetria é deliberada. **Fortigate sem Wazuh é bom sinal** — o perímetro fez o trabalho. **Wazuh sem Fortigate é mau sinal** — algo chegou ao interior sem ser visto a entrar.

Esta é a regra que a matriz de severidade do IR formaliza como *regra do sinal ausente*: alerta Wazuh sem par Fortigate sobe automaticamente a S2, mesmo que o impacto sugira S3.

## Catálogo

| # | Evento Wazuh | Correspondência esperada no Fortigate | Janela | Se ausente |
|---|---|---|---|---|
| P1 | Brute force em painel admin | Hits IPS na mesma origem, categoria brute-force | ±15 min | Origem interna ou VPN — investigar evasão IDS |
| P2 | Padrão SQLi nos logs Rails | Bloqueio WAF na assinatura correspondente | ±5 min | Regra WAF a rever, ou pedido não passou pelo WAF |
| P3 | Pico de 5xx num produto | Aumento de sessões — distinguir legítimas de anómalas | ±15 min | Causa interna (deploy, DB, Puma), não ataque |
| P4 | Tentativa SSH em porta pública | Hits IPS brute-force-login | ±15 min | **Grave.** SSH só deve ser acessível via bastion |
| P5 | Scan de reconhecimento | Hits IPS port-scan | ±30 min | Scan a partir do interior — assumir host comprometido |
| P6 | Exfiltração suspeita (volume anómalo de saída) | Sessões de saída com volume correspondente | ±30 min | Canal não visto pelo perímetro — **P1** |
| P7 | Acesso a Vault fora do padrão do AppRole | Sessão de origem correspondente, se externa | ±15 min | Origem interna — esperado; validar o *host* de origem |
| P8 | Alteração de ficheiro (FIM) em `/var/www/<produto>/current/` fora de janela de deploy | Nenhuma esperada | — | Sem par por natureza. Correlacionar com pipeline, não com perímetro |
| P9 | Falha de auth AppRole em série | Nenhuma esperada, se interna | — | Correlacionar com Vault audit |

Os pares **P8 e P9 têm "nenhuma esperada" de propósito**. Um catálogo que só liste pares positivos leva a tratar toda a ausência como suspeita, e a triagem afoga-se em falsos sinais. Saber que um evento **não deve** ter par é tão útil como saber que deve.

## Correlação por origem

O emparelhamento faz-se por três eixos, em conjunto:

1. **Tempo** — janela da tabela. Ajustar ao *skew* de relógio real entre fontes; se houver mais de alguns segundos de deriva, corrigir NTP antes de confiar em qualquer correlação.
2. **Origem** — IP, ou intervalo se houver NAT pelo caminho. Atenção a CDN e proxy reverso: o IP que o Rails vê pode ser o do proxy, não o do cliente. Nesse caso correlaciona-se pelo `X-Forwarded-For`, e isso tem de estar registado no lograge.
3. **Destino** — host e serviço. Uma coincidência de tempo e origem com destinos diferentes pode ser coincidência num ambiente com tráfego constante.

Os três em simultâneo. Dois em três é hipótese, não par.

## Acrescentar um par

Quando aparecer um evento sem entrada no catálogo:

1. Determinar se **deve** ter par — o tráfego atravessa o perímetro?
2. Se sim, identificar a assinatura ou tipo de log do Fortigate que corresponde.
3. Validar contra histórico: em ocorrências passadas, o par existia?
4. Acrescentar linha, incluindo a janela adequada.
5. Se a conclusão for "não deve ter par", **acrescentar na mesma**, como P8/P9.

O catálogo cresce com a triagem. Uma entrada nova por incidente é bom ritmo.

## Limite

A correlação é read-only sobre as duas fontes. Regra IPS ou WAF a criar ou ajustar é **proposta em relatório**, nunca aplicada por esta skill.

# CSA CAIQ v4 — Respostas Wire Pré-preenchidas

**Skill:** `wire-compliance-provider` · **Versão:** v0.4.0 · **Última actualização:** 2026-05-19

> Template referenciado pela skill `wire-compliance-provider`. Baseado em CSA STAR Consensus
> Assessments Initiative Questionnaire v4.0.2 (CCM v4). Marca `[CONFIRMAR]` campos Wire-specific
> ainda não finalisados — clientes em due diligence vêem estas pendências de forma transparente.

## Sobre o CAIQ v4

O **CAIQ (Consensus Assessments Initiative Questionnaire)** é mantido pela Cloud Security Alliance (CSA) e mapeia para o **CCM (Cloud Controls Matrix) v4**. Tem **261 perguntas** distribuídas por **17 domínios**. É a forma canónica de auto-avaliação para CSA STAR Level 1; com auditoria externa e penetration test torna-se Level 2; com monitorização contínua torna-se Level 3.

Para a Wire o CAIQ é frequentemente exigido por municípios em fase de due diligence pré-contratação. Esta versão pré-preenchida é o **ponto de partida** — clientes recebem versão sanitizada por canal seguro.

## Como esta versão Wire está estruturada

Cada pergunta segue formato canónico:
- **ID** do CCM (ex: `IAM-01.1`)
- **Pergunta** (versão pública CSA)
- **Resposta Wire:** YES / NO / NA / Partial
- **Implementação:** descrição factual da postura Wire.
- **Evidência:** ficheiros, dashboards, controlos referenciáveis.
- **[CONFIRMAR]** onde a postura ainda não é finalizada.

Domínios cobertos (selecção representativa — versão completa interna tem 261 perguntas):

## A&A — Audit & Assurance (5 perguntas amostra)

### A&A-01.1 — Are audit and assurance policies, procedures, and standards established, documented, approved, communicated, applied, evaluated and maintained?

**Wire response:** YES.

**Implementation:** WIRE.POL.SEC.001 estabelece política. WIRE.PRC.AUD.004 procedimento. Auditoria interna anual obrigatória; auditoria externa bienal (target 2026 — `[CONFIRMAR]`). Política revista anualmente; sign-off CTO.

**Evidence:** WIRE.POL.SEC.001 v3.2 (Jan 2026), plano auditoria interna 2026.

### A&A-02.4 — Are independent audit and assurance assessments performed at planned intervals?

**Wire response:** Partial.

**Implementation:** Auditoria interna anual realizada por equipa independente do dia-a-dia operacional. Externa ainda não concluída (target Q4 2026). Penetration test externo anual `[CONFIRMAR — contratado para 2026 Q3]`.

**Evidence:** Relatório auditoria interna 2025 arquivado em `secret/data/compliance/audit/2025-internal.pdf`.

### A&A-04.2 — Are gaps and risks identified through audit reports documented, tracked, and reported to management?

**Wire response:** YES.

**Implementation:** Findings audit registadas em ticket tracker com owner, severidade, due date. Revisão mensal SecOps; revisão trimestral comité direcção.

**Evidence:** Dashboard "Audit Findings" em ticket tracker; minutas comité direcção trimestrais.

## AIS — Application & Interface Security (8 perguntas amostra)

### AIS-01.1 — Are application security requirements documented and integrated into product development?

**Wire response:** YES.

**Implementation:** SDLC documentado em WIRE.PRC.DEV.003 `[CONFIRMAR — designação canónica]`. Inclui: threat modelling em design phase, SAST automatizado (Brakeman, RuboCop security cops) em cada PR, code review obrigatório, dependency scanning (bundler-audit), DAST em staging antes de produção.

**Evidence:** Pipeline config em `.gitlab-ci.yml` ou equivalente; output de Brakeman/bundler-audit por release em `secret/data/cicd/sast/<release>/`.

### AIS-02.1 — Are baseline requirements established to secure different applications?

**Wire response:** YES.

**Implementation:** Baseline aplicável a todos os 10 produtos wire*: TLS 1.2+ obrigatório, CSP headers, autenticação session-based com cookie HttpOnly+Secure+SameSite, rate limiting via `rack-attack`, audit log para acções privilegiadas, RLS PostgreSQL para isolamento multi-tenant.

**Evidence:** Template Rails interno em git `wire-rails-baseline` `[CONFIRMAR — repositório]`.

### AIS-03.1 — Are data classification and protection rules applied to development?

**Wire response:** YES.

**Implementation:** Política de classificação Wire: público / restrito / confidencial / segredo. Confidencial e segredo cifrados via `transit/encrypt/forensics` ou per-tenant keys. Dev em staging com dados sintéticos; nunca produção em ambiente dev.

**Evidence:** WIRE.POL.SEC.001 §4 (classification); `secret/data/db/synthetic-fixtures/*` para staging.

### AIS-05.1 — Is application security testing automated and integrated into CI/CD?

**Wire response:** YES.

**Implementation:** Brakeman (SAST Ruby), bundler-audit (CVE check Ruby gems), RuboCop com security cops, npm audit para frontend. Build falha em CVE crítico não-resolvido. DAST OWASP ZAP em staging pré-produção `[CONFIRMAR — frequência]`.

**Evidence:** CI logs últimos 90 dias; `secret/data/cicd/sast/` arquivos.

## BCR — Business Continuity & Resilience (6 perguntas amostra)

### BCR-01.1 — Are business continuity management and operational resilience policies and procedures established, documented, approved, communicated, applied, evaluated and maintained?

**Wire response:** Partial.

**Implementation:** BCP documentado em `WIRE.PLN.BCP.002` `[CONFIRMAR]`. Política aprovada; procedimento de invocação documentado. Gap: simulacro end-to-end com DR site ainda não realizado.

**Evidence:** WIRE.PLN.BCP.002 v1.4.

### BCR-02.1 — Are business continuity plans tested at planned intervals?

**Wire response:** Partial.

**Implementation:** Restore drill mensal de backups testa restore funcional num subset de tenants. DR drill completo (failover region) planeado para Q4 2026 `[CONFIRMAR]`.

**Evidence:** Restore drill log `secret/data/compliance/dr/restore-drills.json`.

### BCR-08.1 — Are backup and recovery measures incorporated into business continuity and resilience planning?

**Wire response:** YES.

**Implementation:** Backups encriptados (per-tenant transit key), retenção 90 dias daily + 1 ano monthly, off-site em AWS S3 região distinta da operação primária. RPO target 1h; RTO target 4h para produtos wire* críticos `[CONFIRMAR — alinhamento SLA]`.

**Evidence:** AWS S3 bucket policies, `vault read transit/keys/tenant-<NIPC>` rotação log.

## CCC — Change Control & Configuration (5 perguntas amostra)

### CCC-01.1 — Are policies and procedures established for managing changes to information assets?

**Wire response:** YES.

**Implementation:** Capistrano deploy gate via `/wire-release-gate`. Toda alteração production passa por: PR aprovado, CI verde, canary multi-tenant validado (1→10→50→100% via plano canary), sign-off SecOps. Emergency changes têm procedimento separado com post-hoc review obrigatório `[CONFIRMAR — formalização]`.

**Evidence:** Audit trail Capistrano em logs central; aprovações em `~/.wire/log/approvals.log`.

### CCC-03.4 — Are unauthorized changes prevented and tracked?

**Wire response:** YES.

**Implementation:** Acesso Capistrano via SSH CA cert ≤15min issued após aprovação `wire-deploy-01`. Tentativas de deploy sem cert válido falham fail-closed. Wazuh rule_id 100150-100199 detecta alterações em servidores fora da janela Capistrano.

**Evidence:** Wazuh dashboard "Unauthorized File Changes"; Vault audit log `auth/ssh/sign/wire-srv-role`.

## CEK — Cryptography, Encryption & Key Management (10 perguntas amostra)

### CEK-01.1 — Are cryptography, encryption, and key management policies and procedures established?

**Wire response:** YES.

**Implementation:** WIRE.POL.SEC.001 §6 estabelece. Vault HA Raft (3 nós) é broker. Chaves transit nunca saem do Vault (cryptographic operations dentro do Vault). TLS 1.2+ ubíquo; TLS 1.3 preferido. Cipher suites restringidas (sem RC4, sem 3DES, sem MD5).

**Evidence:** WIRE.POL.SEC.001 §6; `vault list transit/keys`; Mozilla SSL config "Intermediate" aplicada.

### CEK-03.2 — Are cryptographic keys protected during their entire lifecycle?

**Wire response:** YES.

**Implementation:** Lifecycle completo no Vault: generation (HSM-backed entropy via `vault write -f transit/keys/<key>`), distribution (n/a — keys nunca distribuídas), storage (Vault storage encrypted at rest), rotation (90 dias para transit keys), archival (versões antigas mantidas para decrypt histórico), destruction (`vault write transit/keys/<key>/config archive_version=0` purga). Chaves SSH CA assinam certs efémeros ≤15min — chave CA nunca distribuída.

**Evidence:** `vault read transit/keys/<key>` mostra `min_decryption_version`, `latest_version`, `creation_time`.

### CEK-05.4 — Are encryption keys segregated by data classification?

**Wire response:** YES.

**Implementation:** Per-tenant key em `transit/keys/tenant-<NIPC>` para dados PII de munícipes. Per-product key para artefactos cifrados de release. Forensics key isolada (`transit/keys/forensics`). IR case keys efémeras por incidente.

**Evidence:** `vault list transit/keys` mostra namespace clear; HCL policy força tenant-specific access.

### CEK-09.1 — Are appropriate encryption mechanisms applied to data in transit?

**Wire response:** YES.

**Implementation:** TLS 1.2+ em todos os endpoints (Fortigate-frontend e service-to-service). HSTS preload (`max-age=31536000; includeSubDomains; preload`). Internal service-to-service também TLS — sem cleartext entre containers/VMs.

**Evidence:** SSL Labs A+ rating para endpoints externos; nginx/Apache config versionada.

### CEK-10.1 — Are appropriate encryption mechanisms applied to data at rest?

**Wire response:** YES.

**Implementation:** PostgreSQL TDE em todos os clusters. Per-tenant transit encryption para dados confidenciais especiais (denunciantes, RH). Backups S3 com SSE-KMS usando key Wire (não AWS-managed). Filesystem-level encryption em VMs onde aplicável `[CONFIRMAR — coverage VM-by-VM]`.

**Evidence:** `pg_settings.data_encryption`, S3 bucket encryption config, FS LUKS where present.

## DCS — Datacenter Security (3 perguntas amostra)

### DCS-01.1 — Are physical security perimeters established to safeguard personnel, data, and information systems?

**Wire response:** NA (delegado ao IaaS provider).

**Implementation:** A infraestrutura física é AWS eu-west-1. Segurança física é responsabilidade AWS sob ISO 27001, SOC 2, PCI DSS — certificados disponíveis no AWS Artifact. Wire não tem datacenter próprio.

**Evidence:** AWS ISO 27001 cert (arquivado), AWS SOC 2 Type II report (NDA-restricted).

### DCS-15.1 — Are physical access logs maintained?

**Wire response:** NA (delegado ao IaaS provider). Wire offices têm controlo de acesso por badge electrónico `[CONFIRMAR — implementação Lisboa/sede]`.

## DSP — Data Security & Privacy Lifecycle (8 perguntas amostra)

### DSP-01.1 — Are policies and procedures established for the secure handling and disposal of data?

**Wire response:** YES.

**Implementation:** Política WIRE.POL.SEC.001 §5. Disposal automatizada por purge policy per-tenant (período definido contratualmente, default 90 dias após cessação contrato). Vault transit key destruction garante criptograficamente que dados antigos ficam inacessíveis (crypto-shredding).

**Evidence:** Purge audit log; key destruction events em Vault audit → Wazuh.

### DSP-04.1 — Is sensitive data identified, classified, and handled according to its classification?

**Wire response:** YES.

**Implementation:** Classificação em 4 níveis (público / restrito / confidencial / segredo). DLP rules em Fortigate para detectar exfiltração de classificado fora do perímetro. PII em PostgreSQL com tag de classificação ao nível do schema.

**Evidence:** Schema metadata; Fortigate DLP policies.

### DSP-10.1 — Is personal data limited to the scope of the disclosed purpose?

**Wire response:** YES (controlo organizacional + técnico).

**Implementation:** DPIA por produto define finalidade. Code review verifica que novos campos têm fundamentação em DPIA. Inventário de tratamentos actualizado por DPO Wire.

**Evidence:** DPIA repository; registo de tratamentos Art. 30.

### DSP-13.1 — Is personal data deleted as required by purpose or laws and regulations?

**Wire response:** YES.

**Implementation:** Retenção definida por município (responsável). Wire executa purge programaticamente após período. Crypto-shredding (key destruction) como backup técnico.

**Evidence:** Purge log; key archive/destruction history.

## GRC — Governance, Risk Management & Compliance (6 perguntas amostra)

### GRC-01.1 — Are information governance program policies, procedures, and standards established?

**Wire response:** YES.

**Implementation:** SGSI documentado, sign-off direcção, revisão anual. CISO designado. DPO designado. RACI claro em WIRE.MTZ.SEC.006.

**Evidence:** WIRE.SGSI.001, WIRE.MTZ.SEC.006, organigrama.

### GRC-04.1 — Is a risk management framework established and maintained?

**Wire response:** YES.

**Implementation:** Risk register actualizado trimestralmente. Risk owners identificados. Top risks reviewed by comité direcção.

**Evidence:** `secret/data/compliance/risk-register.json`; minutas comité.

### GRC-05.1 — Are roles and responsibilities for information security defined?

**Wire response:** YES.

**Implementation:** RACI completo em WIRE.MTZ.SEC.006. SecOps team de 4-6 pessoas `[CONFIRMAR composição actual]`. CISO + DPO + CTO triângulo de governance.

**Evidence:** WIRE.MTZ.SEC.006.

## HRS — Human Resources (5 perguntas amostra)

### HRS-01.1 — Are background verification policies applied prior to employment?

**Wire response:** YES.

**Implementation:** Background check pré-contratação para todos os cargos com acesso a produção. Verificação de antecedentes criminais (registo criminal) e referências profissionais.

**Evidence:** Checklist HR; consent forms assinados.

### HRS-02.1 — Are employment agreements established with information security and confidentiality terms?

**Wire response:** YES.

**Implementation:** NDA + cláusulas de confidencialidade + obrigações pós-contratuais (12 meses) em todos os contratos.

**Evidence:** Template contrato laboral revisto por jurídico.

### HRS-08.1 — Is security awareness training provided to personnel?

**Wire response:** YES.

**Implementation:** Onboarding inclui formação obrigatória de segurança (8h). Refresh anual obrigatório. Phishing tests trimestrais com follow-up training para quem falha. Tópicos específicos para SecOps team adicionalmente.

**Evidence:** LMS completion >95% staff `[CONFIRMAR — números 2025]`; phishing test results.

## IAM — Identity & Access Management (12 perguntas amostra)

### IAM-01.1 — Is there documented identity provisioning and deprovisioning?

**Wire response:** YES.

**Implementation:** AppRole-based identity para todos os agents operacionais Wire (wire-monitor, wire-ir, wire-tenant, wire-srv, wire-deploy, wire-compliance, wire-cowork-reporting). Token TTL ≤30min força re-authentication periódica. Deprovisioning: secret-id rotation invalida tokens activos imediatamente. Audit trail: Vault audit device captura todas as `auth/approle/login` events em SIEM (Wazuh).

**Evidence:**
- `vault-policies.hcl` (HCL policies versionadas em git).
- Wazuh dashboard "Vault Auth Events" (rule_id 100200-100299).
- `~/.wire/log/approvals.log` (operator-initiated approvals).

**[CONFIRMAR]** — formal periodic access review process ainda não documentado; proposta: trimestral via `/wire-tenant-audit --access-review`.

### IAM-03.1 — Is multi-factor authentication used for privileged access?

**Wire response:** YES.

**Implementation:** MFA obrigatório para staff Wire via SSO (TOTP + WebAuthn preferido). Acesso a produção via SSH CA cert ≤15min issued via Vault — segundo factor é o cert efémero. Vault auth tokens têm TTL curto como controlo complementar.

**Evidence:** SSO config (IdP); Vault SSH role config.

### IAM-04.1 — Is access reviewed periodically?

**Wire response:** Partial.

**Implementation:** Acesso técnico (AppRoles, SSH) auditado via Vault audit logs. Revisão formal periódica ainda não institucionalizada — proposta trimestral via `/wire-tenant-audit --access-review` `[CONFIRMAR]`.

**Evidence:** Vault audit logs; gap identificado em DPIA secção 4.

### IAM-08.1 — Are credentials and authentication mechanisms protected?

**Wire response:** YES.

**Implementation:** Zero secrets em ficheiros. Zero `.env` em git. AppRole + response wrapping em runtime. SSH chaves nunca estáticas — sempre via SSH CA com cert TTL ≤15min. Vault root token armazenado em 1Password do CISO `[CONFIRMAR — actualização periódica]`.

**Evidence:** `.gitignore` audit; `gitleaks` em pre-commit hook.

### IAM-09.1 — Is segregation of duties applied to sensitive functions?

**Wire response:** YES.

**Implementation:** N1/N2/N3 approval gates em ops privilegiadas. N1 = operador autoriza-se. N2 = SecOps Lead aprova ops cross-tenant. N3 = CTO aprova ops destrutivas pipeline/Vault. AppRoles distintos por subagent — wire-deploy-01 não tem acesso a wire-ir; wire-monitor não tem acesso a wire-srv.

**Evidence:** RACI; `vault-policies.hcl` mostra policy isolation; `~/.wire/log/approvals.log`.

## IPY — Interoperability & Portability (3 perguntas amostra)

### IPY-01.1 — Are documented policies established for interoperability and portability?

**Wire response:** Partial.

**Implementation:** Export de dados por tenant disponível via API ou CSV/JSON. Formato documentado em WIRE.PRC.PORT.007 `[CONFIRMAR — existência]`. Migração outgoing prevista em cláusulas contratuais.

**Evidence:** API docs; exemplo export.

### IPY-02.1 — Are secure interoperability standards used?

**Wire response:** YES.

**Implementation:** APIs REST com OAuth 2.0 / JWT. SAML / OIDC para SSO integrations. SCIM para identity sync onde aplicável.

**Evidence:** API contracts; SAML metadata.

## IVS — Infrastructure & Virtualization Security (5 perguntas amostra)

### IVS-01.1 — Are security policies and procedures established for infrastructure?

**Wire response:** YES.

**Implementation:** Servidores nativos (VMs Linux) com Puma+systemd. Capistrano deploy. Hardening baseline aplicado via Ansible (CIS-aligned `[CONFIRMAR — nível]`). Patching mensal coordenado.

**Evidence:** Ansible playbooks em git; Zabbix monitor de hosts.

### IVS-03.1 — Is network segregation implemented?

**Wire response:** YES.

**Implementation:** Fortigate perímetro + VLAN segregation entre frontend/backend/data tiers. Wire DB em segment isolado sem acesso directo internet. Cross-segment traffic via Fortigate com regras explícitas.

**Evidence:** Fortigate config; network diagram.

### IVS-04.1 — Are network security controls effective and reviewed?

**Wire response:** YES.

**Implementation:** Fortigate IPS active. WAF rules para 10 produtos wire*. Review trimestral de policies (cleanup de regras stale). Pen-test anual externo `[CONFIRMAR 2026]`.

**Evidence:** Fortigate policy log; pen-test reports.

## LOG — Logging & Monitoring (8 perguntas amostra)

### LOG-01.1 — Are policies established for logging?

**Wire response:** YES.

**Implementation:** Política em WIRE.POL.SEC.001 §7. Lograge nos Rails apps. Wazuh agent em todos os hosts. Vault audit device → Wazuh. Fortigate syslog → Wazuh. Logs retidos 90 dias hot + 1 ano cold `[CONFIRMAR]`.

**Evidence:** Wazuh cluster config; retention policy.

### LOG-04.1 — Are security event logs reviewed?

**Wire response:** YES.

**Implementation:** Wazuh dashboards reviewed continuamente por wire-monitor-01 (24x7 automated). Wire-saas-health command para review humana on-demand. Alertas críticos paginam SecOps de plantão.

**Evidence:** Wazuh rules canónicas em `wire-saas-monitoring/references/wazuh-rules.md`.

### LOG-05.1 — Are audit logs protected from unauthorized access?

**Wire response:** YES.

**Implementation:** Wazuh manager isolado em segment próprio. Acesso à UI Wazuh via SSO+MFA. Audit log read-only mesmo para admins (write-once). Wazuh logs também enviados para S3 immutable bucket (compliance archive).

**Evidence:** Wazuh access logs; S3 bucket object-lock config.

### LOG-08.1 — Is time synchronization implemented?

**Wire response:** YES.

**Implementation:** NTP/Chrony em todos os hosts apontando para servidores stratum-2 confiáveis. Drift monitorizado por Zabbix; alerta se > 100ms.

**Evidence:** `/wire-stack-doctor` valida; Zabbix items `system.clock.drift`.

## SEF — Security Incident, Ethics & Forensics (6 perguntas amostra)

### SEF-01.1 — Are incident management policies established?

**Wire response:** YES.

**Implementation:** WIRE.PRC.IRT.005 documentado. Skill `wire-ir-multitenant` operacionaliza. Severity matrix em `severity-matrix.md`. Bridge CSIRT activada para S1/S2.

**Evidence:** WIRE.PRC.IRT.005; histórico de incidentes em `secret/data/ir/`.

### SEF-04.1 — Is forensic evidence preserved during incidents?

**Wire response:** YES.

**Implementation:** Evidência hashada SHA-256, guardada em `${WIRE_FORENSICS_DIR}/wire-<id>/`, cifrada via `transit/encrypt/forensics`. Cadeia de custódia documentada na timeline.md.

**Evidence:** Forensics dir layout; transit key audit.

### SEF-06.1 — Are external authorities notified per regulations?

**Wire response:** YES.

**Implementation:** CNCS notificado ≤24h para S1 (DL 20/2025 Art. 23). CNPD via municípios para violações de PII (RGPD Art. 33).

**Evidence:** Notification log; templates em `mapping-nis2.md` e `anexoII-template.md`.

## STA — Supply Chain Management, Transparency & Accountability (5 perguntas amostra)

### STA-01.1 — Are policies established for supply chain management?

**Wire response:** Partial.

**Implementation:** Inventário de fornecedores críticos mantido. NDAs + DPAs com sub-subcontratantes. Reaudit anual de fornecedores críticos `[CONFIRMAR — programa]`.

**Evidence:** Vendor inventory; DPA repository.

### STA-04.1 — Is SBOM (Software Bill of Materials) maintained?

**Wire response:** YES.

**Implementation:** SBOM gerado por release (CycloneDX format) via `bundler` + `npm`. Stored em `secret/data/cicd/sbom/<product>/<version>.json`. Cross-referenced com NVD para CVE tracking.

**Evidence:** SBOM files; dependency tracker.

### STA-09.1 — Are third-party security incidents managed?

**Wire response:** YES.

**Implementation:** Subscrição a security advisories de fornecedores críticos (AWS, Microsoft, Ruby on Rails security list, RubySec). Pipeline reage a CVEs em deps automaticamente. Notificação proactiva de cliente Wire se CVE afecta produto wire* deles.

**Evidence:** Subscription list; CVE response log.

## TVM — Threat & Vulnerability Management (6 perguntas amostra)

### TVM-01.1 — Are vulnerability management policies established?

**Wire response:** YES.

**Implementation:** Política WIRE.POL.SEC.001 §8. Scan automático em CI (bundler-audit, npm audit). SLA de remediação: crítico ≤7 dias, alto ≤30 dias, médio ≤90 dias.

**Evidence:** Política; CI logs; remediation tracker.

### TVM-04.1 — Are anti-malware mechanisms used?

**Wire response:** YES.

**Implementation:** ClamAV em endpoints onde aplicável; AWS GuardDuty para EC2/S3. Wazuh detection rules para indicadores de malware.

**Evidence:** Wazuh rules; GuardDuty findings.

### TVM-07.1 — Are penetration tests performed?

**Wire response:** Partial.

**Implementation:** Pen-test anual externo `[CONFIRMAR — contratado 2026 Q3]`. Internal red team exercises trimestral `[CONFIRMAR — formalização]`.

**Evidence:** Pen-test reports (NDA-restricted, sumário executivo partilhável).

## UEM — Universal Endpoint Management (3 perguntas amostra)

### UEM-01.1 — Are endpoint management policies established?

**Wire response:** YES.

**Implementation:** MDM para laptops staff Wire (encryption obrigatória, screen lock, OS patching automático, anti-malware) `[CONFIRMAR — solução MDM]`.

**Evidence:** MDM compliance report.

### UEM-12.1 — Are endpoint logs collected?

**Wire response:** Partial.

**Implementation:** Server endpoints (VMs Wire) totalmente cobertas por Wazuh. Workstation endpoints (laptops staff) parcialmente — apenas eventos críticos forwarded `[CONFIRMAR — coverage 2026]`.

**Evidence:** Wazuh agent inventory.

---

## Notas sobre `[CONFIRMAR]`

Os marcadores `[CONFIRMAR]` indicam posturas onde a decisão técnica/organizacional ainda não foi finalizada. Em due diligence, esta transparência é vista positivamente — alternativa (esconder) cria risco de descoberta posterior. Recomendação: revisão trimestral dos `[CONFIRMAR]` em comité direcção até zerar.

Top `[CONFIRMAR]` em aberto para resolução prioritária (final 2026):
1. Periodic access review formalizado (IAM-04).
2. DR drill multi-region completo (BCR-02).
3. Pen-test externo anual contratado (TVM-07).
4. MDM workstation endpoint coverage (UEM-12).
5. Reaudit anual de fornecedores críticos (STA-01).

---

## Fontes

- **CSA CAIQ v4.0.2** — Consensus Assessments Initiative Questionnaire.
- **CSA CCM v4** — Cloud Controls Matrix.
- **CSA STAR Program** — Levels 1, 2, 3 documentation.
- **ISO/IEC 27001:2022** + **27017:2015** + **27018:2019** (cross-referenced).
- WIRE.POL.SEC.001, WIRE.PRC.IRT.005, WIRE.PRC.AUD.004, WIRE.MTZ.SEC.006.

## Como usar este template em sessão Claude Code

A skill `wire-compliance-provider` invoca este template quando um município solicita CAIQ em due diligence ou quando se prepara submissão STAR Level 1/2. Esperar como output: versão sanitizada (sem `[CONFIRMAR]` em claro para clientes externos — substituir por "Em desenvolvimento — calendarização disponível mediante NDA") + assinatura digital DPO+CISO. A sessão também ajuda a identificar quais `[CONFIRMAR]` foram resolvidos desde a última versão.

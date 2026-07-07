# systemd — hardening de units

Referência carregada pela skill `infra-audit` quando o scope inclui `systemd`.

Para cada `*.service`:

**Hardening flags recomendadas:**
- `NoNewPrivileges=yes`
- `ProtectSystem=strict` ou `full`
- `ProtectHome=yes`
- `PrivateTmp=yes`
- `PrivateDevices=yes`
- `ProtectKernelTunables=yes`
- `ProtectKernelModules=yes`
- `ProtectControlGroups=yes`
- `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`
- `RestrictNamespaces=yes`
- `LockPersonality=yes`
- `MemoryDenyWriteExecute=yes`
- `SystemCallFilter=@system-service`
- `User=` e `Group=` (não root)
- `CapabilityBoundingSet=` minimizado

Ferramenta: `systemd-analyze security <unit>`.

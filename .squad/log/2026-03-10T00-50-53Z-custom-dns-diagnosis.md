# Session Log: Custom DNS Diagnosis (2026-03-10T00:50:53Z)

**Agent:** Marathe (DevOps/CI-CD)  
**Outcome:** Root cause identified; remediation planned.

## Summary

Diagnosed ERR_CONNECTION_RESET on prod with custom domain. Root cause: missing TLS certificate binding and SNI hostname configuration in Azure App Service ingress.

**Decision:** Add managed certificate resource + customDomains array to Bicep IaC template.

## Files Changed

- `.squad/orchestration-log/2026-03-10T00-50-53Z-marathe.md` — spawn manifest logged

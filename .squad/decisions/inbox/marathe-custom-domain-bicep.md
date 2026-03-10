## Custom Domain & Managed Certificate in Bicep

**Author:** Marathe (DevOps / CI-CD)
**Date:** 2026-03-10
**Status:** IMPLEMENTED

**Decision:** Custom domain binding and managed TLS certificates are now declared in `infra/main.bicep` via a `customDomainName` parameter. Each environment provides its own domain in the `.bicepparam` file.

**Rationale:**
- Manual custom domain configuration was being blown away on every redeployment because it wasn't in the Bicep template.
- Declaring it in IaC ensures custom domains and certs survive redeployments and are version-controlled.

**Implementation Details:**
- New parameter: `customDomainName` (string, required)
- New resource: `Microsoft.App/managedEnvironments/managedCertificates@2024-03-01` (child of managed environment, CNAME validation)
- Container App ingress gets `customDomains` array with `bindingType: 'SniEnabled'`
- Container App depends on the certificate resource for correct deployment ordering
- Prod: `gridwar.kirbytoso.xyz`, UAT: `gridtest.kirbytoso.xyz`

**Impact:**
- All deploy workflows will now provision/maintain the custom domain and cert automatically
- No more manual Azure portal configuration after deployments
- DNS records (CNAME + TXT verification) must already exist at the registrar before deployment

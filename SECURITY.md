# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer or use [GitHub's private vulnerability reporting](https://github.com/dkirby-ms/primal-grid/security/advisories/new)
3. Include a description of the vulnerability and steps to reproduce

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | ✅        |

## Security Measures

- ESLint with `eslint-plugin-security` runs in CI
- Dependencies are monitored via `npm audit`
- Server-authoritative architecture — clients cannot modify game state directly

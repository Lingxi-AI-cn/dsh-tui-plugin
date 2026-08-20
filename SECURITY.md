# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for this repository. Include affected versions, reproduction steps, impact, and any proposed mitigation.

## Trust model

This plugin executes in the DeepSeek Harness Host process with the user's OS permissions. Public source, package signatures, provenance, and Registry descriptor signatures establish origin and integrity; they do not prove that code is safe for every environment.

OAuth credentials remain in provider-owned credential storage. The TUI does not write transient authorization progress into Session logs. Exported Session archives remain sensitive and should be stored only in operator-controlled locations.

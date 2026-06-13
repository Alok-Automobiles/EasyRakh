# Security Policy

## Supported Versions

Only the latest production version of EasyRakh is actively maintained and receives security fixes.

| Version | Supported |
|---|---|
| Latest (production) | ✅ |
| Older / self-hosted builds | ❌ |

---

## Scope

### In Scope

- EasyRakh web application (easyrakh.com)
- REST API endpoints
- Authentication and session handling
- Inventory, invoicing, and ledger data handling
- GST and business data exposure

### Out of Scope

- Third-party infrastructure (MongoDB Atlas, Vercel, Redis providers)
- Vulnerabilities in dependencies that have no exploitable impact on EasyRakh
- Social engineering attacks
- Physical access attacks
- Denial of service (DoS/DDoS)

---

## Reporting a Vulnerability

If you discover a security vulnerability in EasyRakh, **please do not open a public GitHub issue.**

Report it privately by emailing:

**cenationrishi31@gmail.com**

### What to include in your report

- A clear description of the vulnerability
- Steps to reproduce the issue
- The potential impact (what data or functionality is affected)
- Any proof of concept or screenshots if applicable
- Your name or handle if you would like to be credited

---

## What Happens After You Report

- You will receive an acknowledgement within **72 hours**.
- We will investigate and keep you updated on our findings.
- We aim to resolve confirmed vulnerabilities within **14 days** depending on severity.
- We will notify you when the fix has been deployed.

---

## Disclosure Policy

We follow **responsible disclosure**. We ask that you:

- Give us reasonable time to fix the issue before any public disclosure.
- Do not access, modify, or delete data that does not belong to you during testing.
- Do not disrupt the service for other users.

We commit to not taking legal action against researchers who follow this policy in good faith.

---

## Credits

We genuinely appreciate security researchers who help keep EasyRakh and its users safe. If you
report a valid vulnerability and would like to be credited, we will acknowledge you publicly
once the fix is live.

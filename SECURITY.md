# Security Policy

The SpendSense team takes the security of our application and user data seriously. We appreciate the efforts of security researchers and community members who identify potential vulnerabilities responsibly.

---

## Supported Versions

Only the latest commit on the `main` branch of this repository receives security updates and bug fixes:

| Version | Supported | Status |
| :--- | :---: | :--- |
| `main` (latest commit) | :white_check_mark: | Actively supported and maintained |
| Prior tags or untracked releases | :x: | Unsupported |

---

## Reporting a Security Vulnerability

If you discover a security vulnerability or sensitive flaw in the SpendSense Frontend:

1. **Do not create a public GitHub issue, discussion, or pull request.** Public disclosure exposes active users and deployments to risk before a fix can be verified and deployed.
2. **Use GitHub Private Vulnerability Reporting:**
   - If available, navigate to the **[Security Advisories](https://github.com/ThunderSkull7/spendsense-frontend/security/advisories)** tab of this repository.
   - Click **"Report a vulnerability"** to open a private advisory draft visible only to project maintainers.
3. **Alternative Private Contact:**
   - If the private vulnerability reporting mechanism is not available or inaccessible, reach out directly to the repository maintainer ([@ThunderSkull7](https://github.com/ThunderSkull7)) via private communication channels available through their GitHub profile.

---

## What to Include in Your Report

To help us assess and resolve the issue quickly, please provide as much detail as possible:

- **Vulnerability Description:** A concise summary of the issue and its technical categorization (e.g., Cross-Site Scripting [XSS], open redirect, cross-site request forgery [CSRF] handling, sensitive data exposure in browser storage).
- **Impact Assessment:** What capability does this vulnerability provide to an attacker, and what user data or sessions are affected?
- **Reproduction Steps:** Step-by-step instructions or a minimal, sanitized proof-of-concept (PoC) demonstrating how to trigger the issue.
- **Affected Files & Pages:** The specific HTML pages, JavaScript modules, or Cloudflare Worker functions involved.
- **Environment Details:** Browser name and version, operating system, and any necessary viewport or cookie configuration.
- **Suggested Remediation (Optional):** Any recommended code fix, sanitization improvement, or CSP adjustment.

> [!WARNING]
> Please ensure your report **does not contain live personal financial data, actual user passwords, production session cookies, or real API secrets**. Use synthetic test fixtures for proof-of-concept demonstrations.

---

## Responsible Disclosure & Coordination

When reporting a vulnerability, we ask that you adhere to responsible disclosure principles:

- **Confidentiality:** Keep all details regarding the vulnerability confidential until a coordinated security advisory or fix has been published.
- **Non-Destructive Testing:** Avoid accessing, altering, or destroying data belonging to other users. Do not perform denial-of-service (DoS) attacks or degrade system availability.
- **Good-Faith Coordination:** Provide the maintainer a reasonable window to investigate the report, reproduce the behavior, and publish a remediation before disclosing details publicly.

Thank you for helping keep SpendSense and its users secure!

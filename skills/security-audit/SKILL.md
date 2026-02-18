---
name: security-audit
description: "Use when evaluating repositories, NPM packages, or extensions before installation. This skill provides a systematic way to detect malicious behavior, data exfiltration, or credential leakage."
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:31
-->

# Security Audit

## Workflow

1. **Setup**: Clone the repository or download the package into a temporary directory (e.g., `/tmp/audit-target`).
2. **Static Analysis**: Execute the automated auditor:
   ```bash
   python3 ~/.pi/skills/security-audit/scripts/auditor.py /tmp/audit-target
   ```
3. **Deep Dive**:
   - Check `network_endpoints`: Are there any non-official domains? (Look for `webhook.site`, `requestcatcher`, or unknown IPs).
   - Check `env_vars`: Does it access `GH_TOKEN`, `AWS_SECRET`, or `SSH_AUTH_SOCK`? Why?
   - Check `dangerous_calls`: Investigate `eval` or `exec` usage. Is it executing user input or remote code?
   - Check `suspicious_blobs`: Inspect large base64 strings for hidden payloads (shellcode/binaries).
4. **Dependency Audit**:
   - For Node: `npm audit` or check `package.json` for "typosquatted" packages.
   - For Python: `pip-audit` or check `requirements.txt`.
5. **Verdict**: Provide a clear "Safe", "Risk", or "Malicious" rating with evidence.

## Red Flags

- **Egress**: Communicating with analytics or tracking endpoints in a "utility" tool.
- **Obfuscation**: Use of `String.fromCharCode`, XOR logic, or massive hex/base64 blobs.
- **Persistence**: Code that tries to write to `~/.bashrc`, `~/.zshrc`, or create `systemd` units.
- **Telemetry**: "Anonymous usage tracking" that sends IP, directory structure, or OS details.
- **Post-install**: `scripts.postinstall` in `package.json` that runs `curl | sh`.

## Verdict Synthesis

- **GREEN**: Open source, official endpoints, no dangerous execution.
- **YELLOW**: Telemetry present, or uses `eval` for legitimate but risky reasons.
- **RED**: Communicates with suspicious domains, exfiltrates env vars, or contains obfuscated payloads.


---
*Crystallized by Cortex on 2026-02-17*


---
name: Publishing dependency scan
description: Dependency range scanning can disagree with the installed Python environment.
---

The publishing dependency audit can report vulnerable transitive versions even
when installed Python package metadata shows patched versions. Explicit minimum
version requirements did not clear all findings; exact patched version pins did.

**Why:** A blocked publish persisted after a fresh audit and security floor
requirements. Exact pins to already-installed patched releases cleared the audit
without disabling the security gate.

**How to apply:** Compare findings with installed metadata, declare exact patched
transitive versions when the mismatch recurs, and verify with a fresh dependency
audit. Do not assume an installation alone updates the publishing scanner's
dependency resolution.

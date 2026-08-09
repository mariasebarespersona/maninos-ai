---
name: Capital portal uses email-pattern allow-list
description: The /capital portal restricts access via substring email matching, not roles or DB flags. Distinct from Homes auth.
type: project
originSessionId: f961d8b1-cc89-4a9d-977b-b2ecc108ecdc
---
Capital portal access is gated client-side in `web/src/app/capital/layout.tsx` (~line 75-81) by an email allow-list:

```
CAPITAL_ALLOWED_PATTERNS = ['lupita', 'sebastian', 'mariasebares', 'cazabrothers', 'e2e-test', 'sgonzalez']
isCapitalAuthorized(email) → true if any pattern is a substring of email
```

Unauthorized users redirect to `/capital/login`.

**Why:** Capital handles investor/RTO finance — only specific people on the team manage it. Implementation chose substring email matching over a DB role/flag for simplicity.

**How to apply:** When adding new Capital pages, the layout-level gate covers them automatically. To add a new authorized user, add their email substring to the array (do NOT change to role-based without checking with the user — see no-change-config feedback). Don't confuse this with Homes auth, which uses the role field on `users` table.

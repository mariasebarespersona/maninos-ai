---
name: Stripe is NOT actually integrated — only a payment-method label
description: STRIPE_SECRET_KEY env var exists but no Stripe SDK calls anywhere. "stripe" appears only as a dropdown option for payment_method.
type: project
originSessionId: f961d8b1-cc89-4a9d-977b-b2ecc108ecdc
---
Despite the presence of `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_IDENTITY_WEBHOOK_SECRET` in env, Stripe has **no active integration**:

- No Stripe SDK imports in any backend route.
- "stripe" appears only as one of the values in payment_method dropdowns: `stripe | zelle | transfer | cash | check`.
- Capital KYC is **manual document upload** to Supabase Storage `kyc-documents` bucket — NOT Stripe Identity.
- Investor onboarding does NOT use Stripe Connect.
- Clientes portal: NO online payments. Contado is manual bank transfer + customer-reports-transfer; RTO is offline collections tracked in `rto_payments`.

**Why:** Likely held over from earlier scaffolding or planned but never wired. ~80% of payments use Zelle in practice.

**How to apply:** If a request involves "Stripe" — verify whether the user wants to (a) add Stripe integration for real, or (b) just adjust the dropdown label / payment recording. Don't assume there's a working Stripe flow to extend.

---
name: Bank accounts → QuickBooks chart mapping (Homes)
description: Authoritative mapping of the 6 Homes bank_accounts rows to QuickBooks chart-of-accounts codes from migration 028; drives the accounting unification work.
type: project
originSessionId: 500c4db6-94d1-49f4-83ea-28c98170916c
---
The 6 rows in `bank_accounts` (Homes) map to QuickBooks chart codes seeded in migration 028 as follows:

| Bank UI name | QB code | QB name |
|---|---|---|
| Cuenta Dallas | 10101 | BOA DFW #### |
| Cuenta Houston | 10102 | HOUSTON #### |
| Cuenta Conroe | 10103 | BANK OF AMERICA |
| Cuenta Dallas Cash | 10107 | CASH DFW |
| Cuenta Houston Cash | 10108 | CASH HOUSTON |
| Cuenta Conroe Cash | 10106 | Cash on hand |

Accounts to remove from the chart (not used by Homes): the two `Wells Fargo` rows, codes `10104` and `10105`.

**Why:** Client confirmed during the 2026-05-20 accounting-unification design session that these 6 banks are the only ones Homes uses, and that the Wells Fargo accounts seeded by migration 028 are not active. The mapping is needed to populate `bank_accounts.accounting_account_id` (currently NULL across the board) so the QB-style double-entry ledger can route bank-side postings to the correct chart account.

**How to apply:** When implementing the ledger unification (`post_to_ledger` writer, balance-derivation work), use this mapping to (a) set `bank_accounts.accounting_account_id` for each of the 6 banks, (b) drop the two Wells Fargo chart rows, and (c) keep the QB chart from migration 028 as the single source of truth (delete the legacy `ING-/GAS-/ACT-/PAS-` codes from migration 026 at the wipe step).

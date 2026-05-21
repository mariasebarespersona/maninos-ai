"""
Smoke tests for api/services/ledger.post_to_ledger.

Uses a tiny in-memory fake of the Supabase client so we can verify the
writer's logic without touching the real database. Validates:

  - Double-entry pair is always produced (two rows with linked_transaction_id).
  - bank_account_id is set on the bank leg and NOT set on the non-bank leg.
  - The correct QB chart codes are picked per event type.
  - Missing/unmapped bank raises ValueError loudly.
  - is_income totals net to zero across the pair.
  - bank_transfer posts against two different banks.
"""
import sys
import os
import uuid
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from api.services.ledger import post_to_ledger, reset_caches, get_bank_balance, get_all_bank_balances


# ---------------------------------------------------------------------------
# Tiny in-memory fake of supabase-py's client surface
# ---------------------------------------------------------------------------

class _FakeQuery:
    def __init__(self, table: "_FakeTable", op: str, payload: Any = None):
        self.table = table
        self.op = op
        self.payload = payload
        self._filters: list[tuple[str, str, Any]] = []
        self._limit: int | None = None
        self._select: str | None = None
        self._update_payload: dict | None = None

    def select(self, *_cols, **_kw):
        return self
    def eq(self, col, val):
        self._filters.append((col, "eq", val))
        return self
    def like(self, col, val):
        self._filters.append((col, "like", val))
        return self
    def lte(self, col, val):
        self._filters.append((col, "lte", val))
        return self
    def in_(self, col, vals):
        self._filters.append((col, "in_", list(vals)))
        return self
    @property
    def not_(self):
        outer = self
        class _Not:
            def is_(self, col, val):
                outer._filters.append((col, "not_is", val))
                return outer
        return _Not()
    def limit(self, n):
        self._limit = n
        return self
    def update(self, payload):
        self.op = "update"
        self._update_payload = payload
        return self
    def delete(self):
        self.op = "delete"
        return self
    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self
    def execute(self):
        return self.table._execute(self)


class _Result:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, db, name):
        self.db = db
        self.name = name

    def select(self, *cols, **kw):
        return _FakeQuery(self, "select").select(*cols, **kw)
    def insert(self, payload):
        return _FakeQuery(self, "insert", payload)
    def update(self, payload):
        q = _FakeQuery(self, "update")
        q._update_payload = payload
        return q
    def delete(self):
        return _FakeQuery(self, "delete")

    def _match(self, row, filters):
        for col, opr, val in filters:
            if opr == "eq":
                if row.get(col) != val:
                    return False
            elif opr == "like":
                v = row.get(col, "")
                if not isinstance(v, str):
                    return False
                pattern = val.replace("%", "")
                if pattern not in v:
                    return False
            elif opr == "lte":
                v = row.get(col)
                if v is None or v > val:
                    return False
            elif opr == "in_":
                if row.get(col) not in val:
                    return False
            elif opr == "not_is":
                v = row.get(col)
                if val == "null":
                    if v is None:
                        return False
                else:
                    if v == val:
                        return False
        return True

    def _execute(self, q: _FakeQuery):
        rows = self.db.tables.setdefault(self.name, [])
        if q.op == "insert":
            payload = q.payload if isinstance(q.payload, list) else [q.payload]
            inserted = []
            for r in payload:
                r = dict(r)
                r.setdefault("id", str(uuid.uuid4()))
                rows.append(r)
                inserted.append(r)
            return _Result(inserted)
        if q.op == "select":
            matched = [r for r in rows if self._match(r, q._filters)]
            if q._limit is not None:
                matched = matched[: q._limit]
            return _Result(matched)
        if q.op == "update":
            matched = [r for r in rows if self._match(r, q._filters)]
            for r in matched:
                r.update(q._update_payload or {})
            return _Result(matched)
        if q.op == "delete":
            keep, dropped = [], []
            for r in rows:
                (dropped if self._match(r, q._filters) else keep).append(r)
            self.db.tables[self.name] = keep
            return _Result(dropped)
        return _Result([])


class FakeDB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}

    def table(self, name):
        return _FakeTable(self, name)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db():
    reset_caches()
    d = FakeDB()
    # Seed minimal chart of accounts (the codes the registry references)
    # Match the live DB shape: code == name (QB chart imported via app UI).
    chart_codes = [
        "Inventory",
        "Accounts receivable (A/R)",
        "Accounts Payable (A/P)",
        "House Sales",
        "House Sales - COGS",
        "Bank fees & service charges",
        "Commissions & fees",
        "Other Contractors",
        "Supplies & materials",
        "Other Operating Expenses",
        "BOA DFW 0623",
        "HOUSTON 0636",
    ]
    for code in chart_codes:
        d.tables.setdefault("accounting_accounts", []).append({
            "id": f"chart-{code}",
            "code": code,
            "name": code,
        })

    # Two banks, both linked to their QB chart accounts
    d.tables.setdefault("bank_accounts", []).extend([
        {"id": "bank-dallas",  "name": "Cuenta Dallas",  "accounting_account_id": "chart-BOA DFW 0623"},
        {"id": "bank-houston", "name": "Cuenta Houston", "accounting_account_id": "chart-HOUSTON 0636"},
        {"id": "bank-unlinked","name": "Bank No Link",   "accounting_account_id": None},
    ])
    return d


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def _pair(db) -> list[dict]:
    return db.tables.get("accounting_transactions", [])


def test_property_purchase_paid(db):
    debit_id, credit_id = post_to_ledger(
        event_type="property_purchase_paid",
        amount=25000,
        bank_account_id="bank-dallas",
        date="2026-05-20",
        counterparty_name="John Seller",
        description_data={"address": "123 Test St"},
        db=db,
    )
    rows = _pair(db)
    assert len(rows) == 2
    debit = next(r for r in rows if r["id"] == debit_id)
    credit = next(r for r in rows if r["id"] == credit_id)

    # Debit is Inventory; credit is the bank
    assert debit["account_id"] == "chart-Inventory"
    assert credit["account_id"] == "chart-BOA DFW 0623"
    assert debit.get("bank_account_id") is None
    assert credit["bank_account_id"] == "bank-dallas"

    # Pair is linked both ways
    assert debit["linked_transaction_id"] == credit_id
    assert credit["linked_transaction_id"] == debit_id

    # Amounts identical; signs opposite
    assert debit["amount"] == 25000 == credit["amount"]
    assert debit["is_income"] is True   # inventory rises (non-bank inverse of bank outflow)
    assert credit["is_income"] is False  # bank cash leaves

    # transaction_type consistent
    assert debit["transaction_type"] == credit["transaction_type"] == "purchase_house"
    # Description uses template
    assert "Compra propiedad: 123 Test St" in debit["description"]
    assert "John Seller" in debit["description"]


def test_sale_contado_received_routes_to_house_sales(db):
    debit_id, credit_id = post_to_ledger(
        event_type="sale_contado_received",
        amount=48000,
        bank_account_id="bank-dallas",
        date="2026-05-20",
        counterparty_name="Maria Buyer",
        description_data={"address": "456 Buyer Ln"},
        db=db,
    )
    rows = _pair(db)
    debit = next(r for r in rows if r["id"] == debit_id)
    credit = next(r for r in rows if r["id"] == credit_id)
    assert debit["account_id"] == "chart-BOA DFW 0623"   # bank receives
    assert credit["account_id"] == "chart-House Sales"  # House Sales income
    assert debit["bank_account_id"] == "bank-dallas"
    assert credit.get("bank_account_id") is None
    assert debit["is_income"] is True
    assert credit["is_income"] is False
    assert debit["transaction_type"] == "sale_cash"


def test_invoice_issued_ar_no_bank(db):
    debit_id, credit_id = post_to_ledger(
        event_type="invoice_issued_ar",
        amount=48000,
        date="2026-05-20",
        counterparty_name="Maria Buyer",
        description_data={"invoice_number": "INV-001"},
        db=db,
    )
    rows = _pair(db)
    debit = next(r for r in rows if r["id"] == debit_id)
    credit = next(r for r in rows if r["id"] == credit_id)
    assert debit["account_id"] == "chart-Accounts receivable (A/R)"   # AR
    assert credit["account_id"] == "chart-House Sales"  # House Sales
    # No bank on either side
    assert debit.get("bank_account_id") is None
    assert credit.get("bank_account_id") is None
    assert debit["transaction_type"] == credit["transaction_type"] == "invoice_ar"
    assert "INV-001" in debit["description"]
    # is_income signs must be opposite for the pair to display as +/- in the UI.
    assert debit["is_income"] is True
    assert credit["is_income"] is False


def test_invoice_paid_in_clears_ar(db):
    debit_id, credit_id = post_to_ledger(
        event_type="invoice_paid_in",
        amount=48000,
        bank_account_id="bank-houston",
        date="2026-05-21",
        counterparty_name="Maria Buyer",
        description_data={"invoice_number": "INV-001"},
        db=db,
    )
    rows = _pair(db)
    debit = next(r for r in rows if r["id"] == debit_id)
    credit = next(r for r in rows if r["id"] == credit_id)
    assert debit["account_id"] == "chart-HOUSTON 0636"   # Houston bank
    assert credit["account_id"] == "chart-Accounts receivable (A/R)"  # AR cleared
    assert debit["bank_account_id"] == "bank-houston"


def test_cogs_internal_no_bank(db):
    debit_id, credit_id = post_to_ledger(
        event_type="sale_contado_cogs",
        amount=32000,
        date="2026-05-20",
        description_data={"address": "456 Buyer Ln"},
        db=db,
    )
    rows = _pair(db)
    debit = next(r for r in rows if r["id"] == debit_id)
    credit = next(r for r in rows if r["id"] == credit_id)
    assert debit["account_id"] == "chart-House Sales - COGS"   # COGS recognized
    assert credit["account_id"] == "chart-Inventory"  # Inventory written off
    assert debit["transaction_type"] == "cogs"
    # Opposite is_income signs so the pair shows + and - in the UI.
    assert debit["is_income"] is True
    assert credit["is_income"] is False
    # No bank fields on either side
    for r in (debit, credit):
        assert r.get("bank_account_id") is None


def test_bank_transfer_uses_two_banks(db):
    debit_id, credit_id = post_to_ledger(
        event_type="bank_transfer",
        amount=5000,
        bank_account_id_from="bank-dallas",
        bank_account_id_to="bank-houston",
        date="2026-05-20",
        description_data={"concept": "Cobertura nómina"},
        db=db,
    )
    rows = _pair(db)
    debit = next(r for r in rows if r["id"] == debit_id)
    credit = next(r for r in rows if r["id"] == credit_id)
    assert debit["account_id"] == "chart-HOUSTON 0636"   # Houston receives
    assert credit["account_id"] == "chart-BOA DFW 0623"  # Dallas pays
    assert debit["bank_account_id"] == "bank-houston"
    assert credit["bank_account_id"] == "bank-dallas"
    assert debit["transaction_type"] == "bank_transfer"
    assert debit["is_income"] is True
    assert credit["is_income"] is False


def test_unmapped_bank_raises(db):
    with pytest.raises(ValueError, match="accounting_account_id"):
        post_to_ledger(
            event_type="property_purchase_paid",
            amount=1000,
            bank_account_id="bank-unlinked",
            date="2026-05-20",
            counterparty_name="X",
            description_data={"address": "X"},
            db=db,
        )
    # Nothing should have been inserted
    assert _pair(db) == []


def test_unknown_bank_id_raises(db):
    with pytest.raises(ValueError, match="does not exist"):
        post_to_ledger(
            event_type="property_purchase_paid",
            amount=1000,
            bank_account_id="bank-ghost",
            date="2026-05-20",
            counterparty_name="X",
            description_data={"address": "X"},
            db=db,
        )


def test_missing_chart_code_raises(db):
    # Drop "Inventory" from the seeded chart
    db.tables["accounting_accounts"] = [a for a in db.tables["accounting_accounts"] if a["code"] != "Inventory"]
    reset_caches()
    with pytest.raises(ValueError, match="Inventory"):
        post_to_ledger(
            event_type="property_purchase_paid",
            amount=1000,
            bank_account_id="bank-dallas",
            date="2026-05-20",
            counterparty_name="X",
            description_data={"address": "X"},
            db=db,
        )


def test_amount_must_be_positive(db):
    for bad in (0, -1, None):
        with pytest.raises(ValueError):
            post_to_ledger(
                event_type="sale_contado_received",
                amount=bad,
                bank_account_id="bank-dallas",
                date="2026-05-20",
                counterparty_name="X",
                description_data={"address": "X"},
                db=db,
            )


def test_unknown_event_type_raises(db):
    with pytest.raises(ValueError, match="Unknown event_type"):
        post_to_ledger(
            event_type="not_a_real_event",
            amount=100,
            bank_account_id="bank-dallas",
            date="2026-05-20",
            db=db,
        )


def test_bank_balance_is_derived_from_ledger(db):
    """post a sale + a purchase against the same bank and check the
    derived balance reflects both — and that the second bank shows zero."""
    post_to_ledger(
        event_type="sale_contado_received",
        amount=50000, bank_account_id="bank-dallas",
        date="2026-05-20", counterparty_name="Buyer",
        description_data={"address": "X"}, db=db,
    )
    post_to_ledger(
        event_type="property_purchase_paid",
        amount=20000, bank_account_id="bank-dallas",
        date="2026-05-20", counterparty_name="Seller",
        description_data={"address": "X"}, db=db,
    )
    # Dallas: +50k (sale) − 20k (purchase) = +30k
    assert get_bank_balance("bank-dallas", db=db) == 30000
    # Houston: untouched
    assert get_bank_balance("bank-houston", db=db) == 0


def test_get_all_bank_balances(db):
    post_to_ledger(
        event_type="sale_contado_received",
        amount=10000, bank_account_id="bank-houston",
        date="2026-05-20", counterparty_name="X",
        description_data={"address": "X"}, db=db,
    )
    all_bals = get_all_bank_balances(db=db)
    # All-balances dict keys are bank_account_id; filter Nones (non-bank legs)
    assert all_bals.get("bank-houston") == 10000


def test_voided_rows_excluded_from_balance(db):
    post_to_ledger(
        event_type="sale_contado_received",
        amount=10000, bank_account_id="bank-dallas",
        date="2026-05-20", counterparty_name="X",
        description_data={"address": "X"}, db=db,
    )
    # void the bank-leg row
    rows = db.tables["accounting_transactions"]
    for r in rows:
        if r.get("bank_account_id") == "bank-dallas":
            r["status"] = "voided"
    assert get_bank_balance("bank-dallas", db=db) == 0


def test_manual_expense_requires_caller_code(db):
    with pytest.raises(ValueError, match="expense_account_code"):
        post_to_ledger(
            event_type="manual_expense_paid",
            amount=100,
            bank_account_id="bank-dallas",
            date="2026-05-20",
            description_data={"concept": "Misc"},
            db=db,
        )

    # Now with the code — should succeed and use it as the debit account
    debit_id, credit_id = post_to_ledger(
        event_type="manual_expense_paid",
        amount=100,
        bank_account_id="bank-dallas",
        date="2026-05-20",
        description_data={"concept": "Misc"},
        expense_account_code="Supplies & materials",
        db=db,
    )
    rows = _pair(db)
    debit = next(r for r in rows if r["id"] == debit_id)
    assert debit["account_id"] == "chart-Supplies & materials"

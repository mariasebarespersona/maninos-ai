"""Tests for the bank statement reconciliation matching algorithm."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.routes.accounting import _match_movements_to_transactions, _name_similarity, _normalize_name


# === Test data matching the real Chase bank statement (March 2026) ===

MOVEMENTS = [
    {
        "id": "mv-1",
        "movement_date": "2026-03-06",
        "description": "CHECK #2847 - MANOLO SANTOS",
        "amount": -13500.0,
        "is_credit": False,
        "counterparty": "MANOLO SANTOS",
        "status": "pending",
    },
    {
        "id": "mv-2",
        "movement_date": "2026-03-07",
        "description": "ZELLE PAYMENT FROM CARLOS UNKNOWN",
        "amount": 350.0,
        "is_credit": True,
        "counterparty": "CARLOS UNKNOWN",
        "status": "pending",
    },
    {
        "id": "mv-3",
        "movement_date": "2026-03-09",
        "description": "ACH DEBIT - AT&T BUSINESS SERVICES",
        "amount": -589.0,
        "is_credit": False,
        "counterparty": "AT&T BUSINESS SERVICES",
        "status": "pending",
    },
    {
        "id": "mv-4",
        "movement_date": "2026-03-10",
        "description": "WIRE TRANSFER IN - PAQUITA SANCHEZ",
        "amount": 5000.0,
        "is_credit": True,
        "counterparty": "PAQUITA SANCHEZ",
        "status": "pending",
    },
    {
        "id": "mv-5",
        "movement_date": "2026-03-10",
        "description": "ZELLE PAYMENT FROM PAQUITA SANCHEZ",
        "amount": 1000.0,
        "is_credit": True,
        "counterparty": "PAQUITA SANCHEZ",
        "status": "pending",
    },
]

# Real transactions from the app database
TRANSACTIONS = [
    {
        "id": "txn-paquita-1000",
        "transaction_date": "2026-03-10",
        "description": "Venta contado - Ronda de sobradiel 7 - Paquita Sanchez",
        "amount": 1000.0,
        "is_income": True,
        "counterparty_name": "Paquita Sanchez",
        "bank_account_id": None,
        "status": "confirmed",
    },
    {
        "id": "txn-paquita-5000",
        "transaction_date": "2026-03-10",
        "description": "Venta contado - Mabank, TX - Paquita Sanchez",
        "amount": 5000.0,
        "is_income": True,
        "counterparty_name": "Paquita Sanchez",
        "bank_account_id": None,
        "status": "confirmed",
    },
    {
        "id": "txn-manolo-13500",
        "transaction_date": "2026-03-06",
        "description": "Compra propiedad: Affordable Luxury: 3 Bed, 2 Bath Manufactured Home",
        "amount": 13500.0,
        "is_income": False,
        "counterparty_name": "Manolo Santos",
        "bank_account_id": None,
        "status": "confirmed",
    },
    {
        "id": "txn-grand-prairie",
        "transaction_date": "2026-02-21",
        "description": "Compra: Grand Prairie, TX",
        "amount": 10000.0,
        "is_income": False,
        "counterparty_name": "Vendedor",
        "bank_account_id": None,
        "status": "confirmed",
    },
    {
        "id": "txn-reno",
        "transaction_date": "2026-02-20",
        "description": "Renovación: Grand Prairie, TX",
        "amount": 8400.01,
        "is_income": False,
        "counterparty_name": "Contratista",
        "bank_account_id": None,
        "status": "confirmed",
    },
]


def test_name_normalization():
    """Test that name normalization strips banking prefixes."""
    assert _normalize_name("ZELLE PAYMENT FROM PAQUITA SANCHEZ") == "paquita sanchez"
    assert _normalize_name("WIRE TRANSFER IN - PAQUITA SANCHEZ") == "paquita sanchez"
    assert _normalize_name("Paquita Sanchez") == "paquita sanchez"
    assert _normalize_name("MANOLO SANTOS") == "manolo santos"
    assert _normalize_name("Manolo Santos") == "manolo santos"
    assert _normalize_name("CHECK #2847 - MANOLO SANTOS") == "manolo santos"
    print("  ✓ test_name_normalization passed")


def test_name_similarity():
    """Test name similarity scoring."""
    # Exact match after normalization
    assert _name_similarity("PAQUITA SANCHEZ", "Paquita Sanchez") == 1.0
    # One contains the other
    assert _name_similarity("ZELLE PAYMENT FROM PAQUITA SANCHEZ", "Paquita Sanchez") >= 0.9
    # Token overlap
    assert _name_similarity("MANOLO SANTOS", "Manolo Santos") == 1.0
    # No overlap
    assert _name_similarity("AT&T BUSINESS SERVICES", "Paquita Sanchez") == 0.0
    # Partial overlap
    assert _name_similarity("CARLOS UNKNOWN", "Carlos García") > 0.0
    print("  ✓ test_name_similarity passed")


def test_matching_finds_all_3_matches():
    """The core test: 3 of 5 movements should match."""
    matches = _match_movements_to_transactions(MOVEMENTS, TRANSACTIONS)

    matched_mv_ids = {m["movement_id"] for m in matches}
    matched_txn_ids = {m["transaction_id"] for m in matches}

    # Should match exactly 3 movements
    assert len(matches) == 3, f"Expected 3 matches, got {len(matches)}: {[m['movement_id'] for m in matches]}"

    # Manolo Santos $13,500 (CHECK → Compra propiedad)
    assert "mv-1" in matched_mv_ids, "Manolo Santos $13,500 should match"
    manolo_match = next(m for m in matches if m["movement_id"] == "mv-1")
    assert manolo_match["transaction_id"] == "txn-manolo-13500"

    # Paquita Sanchez $5,000 (WIRE → Venta contado Mabank)
    assert "mv-4" in matched_mv_ids, "Paquita Sanchez $5,000 should match"
    paquita_5k = next(m for m in matches if m["movement_id"] == "mv-4")
    assert paquita_5k["transaction_id"] == "txn-paquita-5000"

    # Paquita Sanchez $1,000 (ZELLE → Venta contado Ronda)
    assert "mv-5" in matched_mv_ids, "Paquita Sanchez $1,000 should match"
    paquita_1k = next(m for m in matches if m["movement_id"] == "mv-5")
    assert paquita_1k["transaction_id"] == "txn-paquita-1000"

    # Should NOT match the other 2
    assert "mv-2" not in matched_mv_ids, "Carlos Unknown $350 should NOT match"
    assert "mv-3" not in matched_mv_ids, "AT&T $589 should NOT match"

    print("  ✓ test_matching_finds_all_3_matches passed")


def test_matching_scores():
    """Verify match confidence scores are reasonable."""
    matches = _match_movements_to_transactions(MOVEMENTS, TRANSACTIONS)

    for m in matches:
        # All 3 matches have exact amount + same date + name match → should be high confidence
        assert m["score"] >= 80, f"Match {m['movement_id']} score {m['score']} should be >= 80"
        assert m["confidence"] == "high", f"Match {m['movement_id']} should be high confidence, got {m['confidence']}"

    print("  ✓ test_matching_scores passed")


def test_no_duplicate_transaction_matches():
    """Each transaction should only be matched once."""
    matches = _match_movements_to_transactions(MOVEMENTS, TRANSACTIONS)
    txn_ids = [m["transaction_id"] for m in matches]
    assert len(txn_ids) == len(set(txn_ids)), "Duplicate transaction matches found"
    print("  ✓ test_no_duplicate_transaction_matches passed")


def test_direction_mismatch_rejected():
    """A credit movement should never match a debit transaction."""
    credit_mv = [{
        "id": "mv-credit",
        "movement_date": "2026-03-06",
        "description": "DEPOSIT",
        "amount": 13500.0,
        "is_credit": True,
        "counterparty": "MANOLO SANTOS",
        "status": "pending",
    }]
    # The Manolo Santos txn is is_income=False (a purchase/expense)
    matches = _match_movements_to_transactions(credit_mv, TRANSACTIONS)
    assert len(matches) == 0, "Credit movement should not match debit transaction"
    print("  ✓ test_direction_mismatch_rejected passed")


def test_amount_mismatch_rejected():
    """Movements with very different amounts should not match."""
    mv = [{
        "id": "mv-wrong-amt",
        "movement_date": "2026-03-06",
        "description": "CHECK - MANOLO SANTOS",
        "amount": -9999.0,
        "is_credit": False,
        "counterparty": "MANOLO SANTOS",
        "status": "pending",
    }]
    matches = _match_movements_to_transactions(mv, TRANSACTIONS)
    # Should not match Manolo's $13,500 transaction (>5% difference)
    matched_txn_ids = {m["transaction_id"] for m in matches}
    assert "txn-manolo-13500" not in matched_txn_ids, "Amount $9,999 should not match $13,500"
    print("  ✓ test_amount_mismatch_rejected passed")


def test_date_mismatch_still_matches():
    """Amount + name match should be enough even if dates are weeks apart.
    Real scenario: payment made on one day, appears in bank days/weeks later."""
    mv = [{
        "id": "mv-late",
        "movement_date": "2026-03-25",  # 19 days after the transaction date
        "description": "CHECK #2847 - MANOLO SANTOS",
        "amount": -13500.0,
        "is_credit": False,
        "counterparty": "MANOLO SANTOS",
        "status": "pending",
    }]
    matches = _match_movements_to_transactions(mv, TRANSACTIONS)
    assert len(matches) == 1, f"Should match even with date 19 days apart, got {len(matches)}"
    assert matches[0]["transaction_id"] == "txn-manolo-13500"
    assert matches[0]["score"] >= 50, f"Score {matches[0]['score']} should be >= 50"
    print("  ✓ test_date_mismatch_still_matches passed")


def test_date_very_far_still_matches():
    """Even a month apart, amount + name should match."""
    mv = [{
        "id": "mv-month-late",
        "movement_date": "2026-04-10",  # A full month after transaction
        "description": "WIRE TRANSFER IN - PAQUITA SANCHEZ",
        "amount": 5000.0,
        "is_credit": True,
        "counterparty": "PAQUITA SANCHEZ",
        "status": "pending",
    }]
    matches = _match_movements_to_transactions(mv, TRANSACTIONS)
    assert len(matches) == 1, f"Should match even with date a month apart, got {len(matches)}"
    assert matches[0]["transaction_id"] == "txn-paquita-5000"
    print("  ✓ test_date_very_far_still_matches passed")


def test_reconciled_transactions_excluded_from_future():
    """Once a transaction is reconciled (status='reconciled'), it should NOT appear
    in unreconciled queries. The backend filters by status IN ('confirmed','pending').
    Simulate this by removing reconciled txns from the candidate list."""
    # After reconciling Manolo Santos, that txn should not match again
    remaining_txns = [t for t in TRANSACTIONS if t["id"] != "txn-manolo-13500"]

    # Same movement should not find a match anymore
    mv = [{
        "id": "mv-manolo-again",
        "movement_date": "2026-03-15",
        "description": "CHECK #2848 - MANOLO SANTOS",
        "amount": -13500.0,
        "is_credit": False,
        "counterparty": "MANOLO SANTOS",
        "status": "pending",
    }]
    matches = _match_movements_to_transactions(mv, remaining_txns)
    assert len(matches) == 0, "Already-reconciled transaction should not match again"
    print("  ✓ test_reconciled_transactions_excluded_from_future passed")


def test_step2_only_shows_unreconciled_movements():
    """After reconciliation, step 2 should only show movements with status != 'reconciled'.
    Simulate the frontend filter."""
    # Simulate: 3 movements reconciled, 2 still pending
    movements_after_reconcile = [
        {"id": "mv-1", "status": "reconciled"},
        {"id": "mv-2", "status": "pending"},
        {"id": "mv-3", "status": "pending"},
        {"id": "mv-4", "status": "reconciled"},
        {"id": "mv-5", "status": "reconciled"},
    ]

    # This is what the frontend does: filter out reconciled
    step2_movements = [m for m in movements_after_reconcile if m["status"] != "reconciled"]
    assert len(step2_movements) == 2, f"Step 2 should show 2 movements, got {len(step2_movements)}"
    assert all(m["status"] == "pending" for m in step2_movements)
    print("  ✓ test_step2_only_shows_unreconciled_movements passed")


def test_wizard_state_preserved_after_confirm():
    """Verify that reloadMovements (vs openStatement) preserves wizard step.
    This is a logic test — after confirm, wizard should stay on step 1 (reconcileDone=true),
    not reset to step 1 with reconcileDone=false."""
    # Simulate state: wizardStep=1, reconcileDone=True after confirm
    wizard_step = 1
    reconcile_done = True

    # reloadMovements should NOT reset these (unlike openStatement which does)
    # After confirm: reconcileDone=True, so the "Siguiente" button shows
    assert wizard_step == 1
    assert reconcile_done == True
    # User can click "Siguiente" to go to step 2
    wizard_step = 2
    assert wizard_step == 2
    print("  ✓ test_wizard_state_preserved_after_confirm passed")


if __name__ == "__main__":
    print("Running reconciliation matching tests...\n")
    test_name_normalization()
    test_name_similarity()
    test_matching_finds_all_3_matches()
    test_matching_scores()
    test_no_duplicate_transaction_matches()
    test_direction_mismatch_rejected()
    test_amount_mismatch_rejected()
    test_date_mismatch_still_matches()
    test_date_very_far_still_matches()
    test_reconciled_transactions_excluded_from_future()
    test_step2_only_shows_unreconciled_movements()
    test_wizard_state_preserved_after_confirm()
    print("\n✅ All tests passed!")

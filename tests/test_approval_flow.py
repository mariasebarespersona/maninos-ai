"""
Tests for the payment approval flow (pending -> approved -> completed).

Covers:
1. Approve endpoint changes status from pending to approved
2. Approve endpoint sets approved_by and approved_at
3. Cannot approve a non-pending order (returns 400)
4. Complete endpoint works on approved orders
5. Complete endpoint creates an accounting transaction
6. Cannot complete an already-completed order
7. Cancel endpoint works on pending orders
"""

import asyncio
import pytest
from unittest.mock import patch, MagicMock
from fastapi import HTTPException


def _run(coro):
    """Run an async coroutine synchronously."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _make_mock_sb():
    """Create a fresh MagicMock for sb with sensible defaults."""
    return MagicMock()


def _chain(mock_sb, select_data=None, update_data=None, insert_data=None):
    """
    Configure mock_sb chained calls.
    select/update/insert all share table(), so we configure them in sequence.
    """
    tbl = mock_sb.table.return_value

    # .select(...).eq(...).execute()
    sel_result = MagicMock()
    sel_result.data = select_data
    tbl.select.return_value.eq.return_value.execute.return_value = sel_result
    # Also support .select(...).eq(...).eq(...).execute()
    tbl.select.return_value.eq.return_value.eq.return_value.execute.return_value = sel_result

    # .update(...).eq(...).execute()
    upd_result = MagicMock()
    upd_result.data = update_data
    tbl.update.return_value.eq.return_value.execute.return_value = upd_result

    # .insert(...).execute()
    ins_result = MagicMock()
    ins_result.data = insert_data
    tbl.insert.return_value.execute.return_value = ins_result

    # .select(...).like(...).execute()  (for _generate_transaction_number)
    like_result = MagicMock()
    like_result.data = []
    tbl.select.return_value.like.return_value.execute.return_value = like_result

    return mock_sb


# ============================================================================
# Approve
# ============================================================================

class TestApprovePaymentOrder:

    def test_approve_changes_status_to_approved(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-1", "status": "pending", "amount": 5000}
        approved_order = {**order, "status": "approved", "approved_by": "admin-1"}
        _chain(mock_sb, select_data=[order], update_data=[approved_order])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import approve_payment_order
            result = _run(approve_payment_order("ord-1", approved_by="admin-1"))

        assert result["ok"] is True
        assert result["data"]["status"] == "approved"

    def test_approve_sets_approved_by(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-1", "status": "pending", "amount": 5000}
        approved = {**order, "status": "approved", "approved_by": "seb-1", "approved_at": "2026-03-19T00:00:00"}
        _chain(mock_sb, select_data=[order], update_data=[approved])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import approve_payment_order
            result = _run(approve_payment_order("ord-1", approved_by="seb-1"))

        # Verify the update call included approved_by
        update_call = mock_sb.table.return_value.update.call_args
        update_payload = update_call[0][0]
        assert update_payload["approved_by"] == "seb-1"
        assert "approved_at" in update_payload

    def test_cannot_approve_non_pending_order(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-2", "status": "completed", "amount": 3000}
        _chain(mock_sb, select_data=[order])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import approve_payment_order
            with pytest.raises(HTTPException) as exc_info:
                _run(approve_payment_order("ord-2", approved_by="admin-1"))
            assert exc_info.value.status_code == 400

    def test_cannot_approve_approved_order(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-3", "status": "approved", "amount": 2000}
        _chain(mock_sb, select_data=[order])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import approve_payment_order
            with pytest.raises(HTTPException) as exc_info:
                _run(approve_payment_order("ord-3"))
            assert exc_info.value.status_code == 400


# ============================================================================
# Complete
# ============================================================================

class TestCompletePaymentOrder:

    def _make_complete_req(self):
        from api.routes.payment_orders import PaymentOrderComplete
        return PaymentOrderComplete(
            reference="REF-12345",
            payment_date="2026-03-19",
            completed_by="treasury-1",
        )

    def test_complete_works_on_approved_order(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-1", "status": "approved", "amount": 5000,
                 "payee_name": "Seller", "method": "transferencia",
                 "property_id": "prop-1", "property_address": "123 Main St"}
        completed = {**order, "status": "completed", "reference": "REF-12345"}
        _chain(mock_sb, select_data=[order], update_data=[completed],
               insert_data=[{"id": "txn-1"}])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import complete_payment_order
            result = _run(complete_payment_order("ord-1", self._make_complete_req()))

        assert result["ok"] is True
        assert result["data"]["status"] == "completed"

    def test_complete_creates_accounting_transaction(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-1", "status": "approved", "amount": 8000,
                 "payee_name": "John Doe", "method": "transferencia",
                 "property_id": "prop-2", "property_address": "456 Oak Ave"}
        completed = {**order, "status": "completed"}
        _chain(mock_sb, select_data=[order], update_data=[completed],
               insert_data=[{"id": "acct-txn-1"}])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import complete_payment_order
            _run(complete_payment_order("ord-1", self._make_complete_req()))

        # Verify insert was called for accounting_transactions
        insert_calls = mock_sb.table.return_value.insert.call_args_list
        assert len(insert_calls) >= 1
        txn_data = insert_calls[0][0][0]
        assert txn_data["amount"] == 8000
        assert txn_data["status"] == "confirmed"

    def test_cannot_complete_already_completed_order(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-2", "status": "completed", "amount": 3000,
                 "payee_name": "Jane", "method": "check"}
        _chain(mock_sb, select_data=[order])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import complete_payment_order
            with pytest.raises(HTTPException) as exc_info:
                _run(complete_payment_order("ord-2", self._make_complete_req()))
            assert exc_info.value.status_code == 400

    def test_complete_works_on_pending_order_too(self):
        """The endpoint allows completing from pending (skipping approve)."""
        mock_sb = _make_mock_sb()
        order = {"id": "ord-3", "status": "pending", "amount": 4000,
                 "payee_name": "Bob", "method": "zelle",
                 "property_id": "prop-3", "property_address": "789 Pine"}
        completed = {**order, "status": "completed"}
        _chain(mock_sb, select_data=[order], update_data=[completed],
               insert_data=[{"id": "txn-2"}])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import complete_payment_order
            result = _run(complete_payment_order("ord-3", self._make_complete_req()))

        assert result["ok"] is True


# ============================================================================
# Cancel
# ============================================================================

class TestCancelPaymentOrder:

    def test_cancel_works_on_pending(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-1", "status": "pending"}
        cancelled = {**order, "status": "cancelled"}
        _chain(mock_sb, select_data=[order], update_data=[cancelled])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import cancel_payment_order
            result = _run(cancel_payment_order("ord-1", cancelled_by="admin-1"))

        assert result["ok"] is True
        assert result["message"] == "Orden cancelada"

    def test_cannot_cancel_completed_order(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-2", "status": "completed"}
        _chain(mock_sb, select_data=[order])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import cancel_payment_order
            with pytest.raises(HTTPException) as exc_info:
                _run(cancel_payment_order("ord-2", cancelled_by="admin-1"))
            assert exc_info.value.status_code == 400

    def test_cannot_cancel_approved_order(self):
        mock_sb = _make_mock_sb()
        order = {"id": "ord-3", "status": "approved"}
        _chain(mock_sb, select_data=[order])

        with patch("api.routes.payment_orders.sb", mock_sb):
            from api.routes.payment_orders import cancel_payment_order
            with pytest.raises(HTTPException) as exc_info:
                _run(cancel_payment_order("ord-3"))
            assert exc_info.value.status_code == 400

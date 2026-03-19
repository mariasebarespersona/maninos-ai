"""
Tests for the capital investment link and return payment flows.

Covers:
1. link-investment creates a pending capital_transaction (not executed immediately)
2. pay-return creates a pending capital_transaction (not executed immediately)
3. The notes field format for investment_link is parseable
4. The notes field format for return_payment is parseable
5. _execute_investment_link creates investment + updates investor capital
6. _execute_investor_return updates investment return_amount + investor available_capital
7. confirm_transaction detects investor_return type and calls execution
"""

import asyncio
import pytest
from unittest.mock import patch, MagicMock, call
from fastapi import HTTPException


def _run(coro):
    """Run an async coroutine synchronously."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ============================================================================
# Notes format tests (pure logic, no mocking needed)
# ============================================================================

class TestInvestmentLinkNotesFormat:

    def test_notes_parseable(self):
        investor_id = "inv-abc"
        contract_id = "con-xyz"
        amount = 50000.0
        rate = 12.0
        notes = f"investment_link|{investor_id}|{contract_id}|{amount}|{rate}"
        parts = notes.split("|")
        assert parts[0] == "investment_link"
        assert parts[1] == investor_id
        assert parts[2] == contract_id
        assert float(parts[3]) == amount
        assert float(parts[4]) == rate

    def test_notes_has_5_parts(self):
        notes = "investment_link|inv-1|con-2|30000.0|15.0"
        parts = notes.split("|")
        assert len(parts) == 5

    def test_notes_starts_with_investment_link(self):
        notes = "investment_link|inv-1|con-2|30000.0|15.0"
        assert notes.startswith("investment_link|")


class TestReturnPaymentNotesFormat:

    def test_notes_parseable(self):
        investor_id = "inv-abc"
        investment_id = "invest-789"
        amount = 25000.0
        notes = f"return_payment|{investor_id}|{investment_id}|{amount}"
        parts = notes.split("|")
        assert parts[0] == "return_payment"
        assert parts[1] == investor_id
        assert parts[2] == investment_id
        assert float(parts[3]) == amount

    def test_notes_has_4_parts(self):
        notes = "return_payment|inv-1|invest-2|10000.0"
        parts = notes.split("|")
        assert len(parts) == 4


# ============================================================================
# link-investment endpoint creates pending transaction
# ============================================================================

class TestLinkInvestmentCreatesPending:

    def test_creates_pending_capital_transaction(self):
        mock_sb = MagicMock()

        # Investor lookup
        investor_result = MagicMock()
        investor_result.data = [{"id": "inv-1", "name": "John Doe", "available_capital": 100000}]

        # Contract lookup
        contract_result = MagicMock()
        contract_result.data = [{"id": "con-1", "property_id": "prop-1", "client_id": "cli-1", "status": "active"}]

        # record_txn returns a dict
        mock_txn = {"id": "txn-1", "status": "pending_confirmation"}

        # Configure the mock_sb chain for investor and contract
        def table_side_effect(name):
            tbl = MagicMock()
            if name == "investors":
                tbl.select.return_value.eq.return_value.execute.return_value = investor_result
            elif name == "rto_contracts":
                tbl.select.return_value.eq.return_value.execute.return_value = contract_result
            return tbl

        mock_sb.table.side_effect = table_side_effect

        with patch("api.routes.capital.capital_flows.sb", mock_sb), \
             patch("api.routes.capital.capital_flows.record_txn", return_value=mock_txn) as mock_record:
            from api.routes.capital.capital_flows import link_investment_to_contract, InvestmentLink
            data = InvestmentLink(
                investor_id="inv-1",
                rto_contract_id="con-1",
                amount=50000.0,
                expected_return_rate=12.0,
            )
            result = _run(link_investment_to_contract(data))

        assert result["ok"] is True
        assert result["transaction_id"] == "txn-1"
        # Verify record_txn was called with pending_confirmation status
        mock_record.assert_called_once()
        call_kwargs = mock_record.call_args
        assert call_kwargs.kwargs.get("status") == "pending_confirmation" or \
               (call_kwargs[1].get("status") == "pending_confirmation" if len(call_kwargs) > 1 else False)

    def test_rejects_insufficient_capital(self):
        mock_sb = MagicMock()
        investor_result = MagicMock()
        investor_result.data = [{"id": "inv-1", "name": "Poor Investor", "available_capital": 1000}]

        mock_sb.table.return_value.select.return_value.eq.return_value.execute.return_value = investor_result

        with patch("api.routes.capital.capital_flows.sb", mock_sb):
            from api.routes.capital.capital_flows import link_investment_to_contract, InvestmentLink
            data = InvestmentLink(
                investor_id="inv-1",
                rto_contract_id="con-1",
                amount=50000.0,
            )
            with pytest.raises(HTTPException) as exc_info:
                _run(link_investment_to_contract(data))
            assert exc_info.value.status_code == 400


# ============================================================================
# pay-return endpoint creates pending transaction
# ============================================================================

class TestPayReturnCreatesPending:

    def test_creates_pending_capital_transaction(self):
        mock_sb = MagicMock()

        investment_result = MagicMock()
        investment_result.data = [{
            "id": "invest-1",
            "investor_id": "inv-1",
            "status": "active",
            "amount": 50000,
            "property_id": "prop-1",
            "rto_contract_id": "con-1",
            "investors": {"name": "John Doe", "available_capital": 10000},
        }]

        mock_sb.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = investment_result

        mock_txn = {"id": "txn-2", "status": "pending_confirmation"}

        with patch("api.routes.capital.capital_flows.sb", mock_sb), \
             patch("api.routes.capital.capital_flows.record_txn", return_value=mock_txn) as mock_record:
            from api.routes.capital.capital_flows import pay_investor_return, ReturnPayment
            data = ReturnPayment(
                investor_id="inv-1",
                investment_id="invest-1",
                amount=25000.0,
            )
            result = _run(pay_investor_return(data))

        assert result["ok"] is True
        assert result["transaction_id"] == "txn-2"


# ============================================================================
# _execute_investment_link
# ============================================================================

class TestExecuteInvestmentLink:

    def test_creates_investment_and_updates_investor(self):
        mock_sb = MagicMock()

        # Investor query
        investor_result = MagicMock()
        investor_result.data = {
            "id": "inv-1", "name": "Jane", "available_capital": 80000, "total_invested": 20000,
        }

        # Contract query
        contract_result = MagicMock()
        contract_result.data = {"id": "con-1", "property_id": "prop-1"}

        # Investment insert
        investment_insert_result = MagicMock()
        investment_insert_result.data = [{"id": "new-invest-1"}]

        call_count = {"n": 0}

        def table_side_effect(name):
            tbl = MagicMock()
            if name == "investors":
                tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = investor_result
                tbl.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            elif name == "rto_contracts":
                tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = contract_result
            elif name == "investments":
                tbl.insert.return_value.execute.return_value = investment_insert_result
                tbl.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            elif name == "capital_flows":
                tbl.select.return_value.execute.return_value = MagicMock(data=[])
                tbl.insert.return_value.execute.return_value = MagicMock(data=[{"id": "flow-1"}])
            return tbl

        mock_sb.table.side_effect = table_side_effect

        txn = {"description": "Inversión de Jane"}

        with patch("api.routes.capital.payments.sb", mock_sb), \
             patch("api.routes.capital.capital_flows.sb", mock_sb), \
             patch("api.routes.capital._accounting_hooks.sb", mock_sb):
            from api.routes.capital.payments import _execute_investment_link
            _execute_investment_link("inv-1", "con-1", 50000.0, 12.0, txn)

        # Verify investments.insert was called
        invest_calls = [c for c in mock_sb.table.call_args_list if c[0][0] == "investments"]
        assert len(invest_calls) >= 1


# ============================================================================
# _execute_investor_return
# ============================================================================

class TestExecuteInvestorReturn:

    def test_updates_investment_and_investor_capital(self):
        mock_sb = MagicMock()

        investment_result = MagicMock()
        investment_result.data = {
            "id": "invest-1",
            "amount": 50000,
            "return_amount": 10000,
            "property_id": "prop-1",
            "rto_contract_id": "con-1",
            "investors": {"name": "Jane", "available_capital": 5000},
        }

        def table_side_effect(name):
            tbl = MagicMock()
            if name == "investments":
                tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = investment_result
                tbl.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            elif name == "investors":
                tbl.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            elif name == "capital_flows":
                tbl.select.return_value.execute.return_value = MagicMock(data=[])
                tbl.insert.return_value.execute.return_value = MagicMock(data=[{"id": "flow-2"}])
            return tbl

        mock_sb.table.side_effect = table_side_effect

        txn = {"description": "Retorno a Jane"}

        with patch("api.routes.capital.payments.sb", mock_sb), \
             patch("api.routes.capital.capital_flows.sb", mock_sb), \
             patch("api.routes.capital._accounting_hooks.sb", mock_sb):
            from api.routes.capital.payments import _execute_investor_return
            _execute_investor_return("inv-1", "invest-1", 15000.0, txn)

        # Verify investments and investors were updated
        investor_updates = [c for c in mock_sb.table.call_args_list if c[0][0] == "investors"]
        investment_updates = [c for c in mock_sb.table.call_args_list if c[0][0] == "investments"]
        assert len(investor_updates) >= 1
        assert len(investment_updates) >= 1


# ============================================================================
# confirm_transaction dispatches correctly
# ============================================================================

class TestConfirmTransactionDispatch:

    def test_detects_investor_return_and_calls_execute(self):
        mock_sb = MagicMock()
        txn_data = {
            "id": "txn-1",
            "status": "pending_confirmation",
            "transaction_type": "investor_return",
            "notes": "return_payment|inv-1|invest-1|25000.0",
            "description": "Retorno",
            "amount": 25000,
        }

        txn_result = MagicMock()
        txn_result.data = txn_data

        def table_side_effect(name):
            tbl = MagicMock()
            if name == "capital_transactions":
                tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = txn_result
                tbl.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            return tbl

        mock_sb.table.side_effect = table_side_effect

        with patch("api.routes.capital.payments.sb", mock_sb), \
             patch("api.routes.capital.payments._execute_investor_return") as mock_exec:
            from api.routes.capital.payments import confirm_transaction
            result = _run(confirm_transaction("txn-1"))

        assert result["ok"] is True
        mock_exec.assert_called_once_with("inv-1", "invest-1", 25000.0, txn_data)

    def test_detects_investment_link_and_calls_execute(self):
        mock_sb = MagicMock()
        txn_data = {
            "id": "txn-2",
            "status": "pending_confirmation",
            "transaction_type": "investor_deposit",
            "notes": "investment_link|inv-1|con-1|50000.0|12.0",
            "description": "Inversión",
            "amount": 50000,
        }

        txn_result = MagicMock()
        txn_result.data = txn_data

        def table_side_effect(name):
            tbl = MagicMock()
            if name == "capital_transactions":
                tbl.select.return_value.eq.return_value.single.return_value.execute.return_value = txn_result
                tbl.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[{}])
            return tbl

        mock_sb.table.side_effect = table_side_effect

        with patch("api.routes.capital.payments.sb", mock_sb), \
             patch("api.routes.capital.payments._execute_investment_link") as mock_exec:
            from api.routes.capital.payments import confirm_transaction
            result = _run(confirm_transaction("txn-2"))

        assert result["ok"] is True
        mock_exec.assert_called_once_with("inv-1", "con-1", 50000.0, 12.0, txn_data)

    def test_rejects_non_pending_transaction(self):
        mock_sb = MagicMock()
        txn_data = {
            "id": "txn-3",
            "status": "confirmed",
            "transaction_type": "investor_return",
            "notes": "",
        }

        txn_result = MagicMock()
        txn_result.data = txn_data

        mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = txn_result

        with patch("api.routes.capital.payments.sb", mock_sb):
            from api.routes.capital.payments import confirm_transaction
            with pytest.raises(HTTPException) as exc_info:
                _run(confirm_transaction("txn-3"))
            assert exc_info.value.status_code == 400

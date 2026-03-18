"""
Test script for Investor Email functions.

Tests verify:
1. Welcome email HTML contains correct note details
2. Follow-up email HTML contains investment summary
3. Completion email HTML contains final payment details
4. Email functions handle missing email gracefully
5. process_investor_followup_emails queries all investors and sends emails
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["SUPABASE_URL"] = "https://dummy.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoic2VydmljZV9yb2xlIiw"
    "iaWF0IjoxNjE2MTU5MjIyLCJleHAiOjE5MzE3MzUyMjJ9.dummykey"
)

from unittest.mock import MagicMock, patch

# Mock supabase and email tool
_mock_sb = MagicMock()
sys.modules["tools.supabase_client"] = type(sys)("tools.supabase_client")
sys.modules["tools.supabase_client"].sb = _mock_sb

_mock_email = MagicMock()
_mock_email.send_email = MagicMock(return_value={"id": "test-email-id"})
sys.modules["tools.email_tool"] = _mock_email

from api.services.email_service import (
    send_investor_welcome_email,
    send_investor_followup_email,
    send_investor_completion_email,
    _investor_welcome_html,
    _investor_followup_html,
    _investor_completion_html,
    process_investor_followup_emails,
    send_client_post_purchase_email,
    _client_post_purchase_html,
)


# ── TEST: Welcome email HTML content ──
def test_welcome_email_html():
    note_data = {
        "id": "note-123",
        "loan_amount": 50000,
        "annual_rate": 12,
        "term_months": 12,
        "total_interest": 6000,
        "total_due": 56000,
        "start_date": "2026-03-01",
        "maturity_date": "2027-03-01",
    }
    html = _investor_welcome_html("Juan Inversiones", note_data)

    assert "Juan Inversiones" in html
    assert "$50,000.00" in html
    assert "12" in html  # 12 or 12.0
    assert "12 meses" in html
    assert "$6,000.00" in html
    assert "$56,000.00" in html
    assert "2026-03-01" in html
    assert "2027-03-01" in html
    assert "Bienvenido a Maninos Capital" in html
    assert "Calendario de Pagos" in html
    assert "Maninos Capital LLC" in html  # subscriber
    # No portal links
    assert "/capital/" not in html
    print("PASS test_welcome_email_html")


# ── TEST: Welcome email sends correctly ──
def test_welcome_email_send():
    _mock_email.send_email.reset_mock()
    note_data = {"id": "n1", "loan_amount": 25000, "annual_rate": 10, "term_months": 6,
                 "total_interest": 1250, "total_due": 26250, "start_date": "2026-01-01", "maturity_date": "2026-07-01"}

    result = send_investor_welcome_email("test@example.com", "Test Investor", note_data)

    assert result["ok"] is True
    assert result["type"] == "investor_welcome"
    _mock_email.send_email.assert_called_once()
    call_args = _mock_email.send_email.call_args
    assert call_args[1]["to"] == ["test@example.com"]
    assert "$25,000" in call_args[1]["subject"]
    print("PASS test_welcome_email_send")


# ── TEST: Welcome email with no email ──
def test_welcome_email_no_email():
    result = send_investor_welcome_email("", "No Email Investor", {"loan_amount": 1000})
    assert result["ok"] is False
    assert "No investor email" in result["error"]
    print("PASS test_welcome_email_no_email")


# ── TEST: Follow-up email HTML content ──
def test_followup_email_html():
    summary = {
        "total_invested": 100000,
        "total_returned": 30000,
        "outstanding": 76000,
        "active_notes": 2,
        "notes": [
            {"loan_amount": 50000, "annual_rate": 12, "maturity_date": "2027-03-01", "paid_amount": 15000, "status": "active"},
            {"loan_amount": 50000, "annual_rate": 10, "maturity_date": "2026-09-01", "paid_amount": 15000, "status": "active"},
        ],
    }
    html = _investor_followup_html("Maria Capital", summary)

    assert "Maria Capital" in html
    assert "$100,000.00" in html
    assert "$30,000.00" in html
    assert "$76,000.00" in html
    assert "2 activas" in html
    assert "Activa" in html
    assert "Reporte Mensual de Inversion" in html
    # No portal links
    assert "/capital/" not in html
    print("PASS test_followup_email_html")


# ── TEST: Follow-up email send ──
def test_followup_email_send():
    _mock_email.send_email.reset_mock()
    summary = {"total_invested": 50000, "total_returned": 10000, "outstanding": 42000,
               "active_notes": 1, "notes": []}

    result = send_investor_followup_email("inv@test.com", "Investor X", summary)
    assert result["ok"] is True
    assert result["type"] == "investor_followup"
    _mock_email.send_email.assert_called_once()
    print("PASS test_followup_email_send")


# ── TEST: Completion email HTML content ──
def test_completion_email_html():
    note_data = {
        "loan_amount": 50000,
        "annual_rate": 12,
        "total_interest": 6000,
        "total_due": 56000,
        "paid_amount": 56000,
        "start_date": "2025-03-01",
        "maturity_date": "2026-03-01",
    }
    html = _investor_completion_html("Carlos Fondos", note_data)

    assert "Carlos Fondos" in html
    assert "$50,000.00" in html
    assert "$6,000.00" in html
    assert "$56,000.00" in html
    assert "Nota Promisoria Completada" in html
    assert "pagada en su totalidad" in html
    assert "2025-03-01" in html
    # No portal links
    assert "/capital/" not in html
    print("PASS test_completion_email_html")


# ── TEST: Completion email send ──
def test_completion_email_send():
    _mock_email.send_email.reset_mock()
    note_data = {"loan_amount": 30000, "total_due": 33600, "paid_amount": 33600,
                 "annual_rate": 12, "total_interest": 3600, "start_date": "2025-01-01", "maturity_date": "2026-01-01"}

    result = send_investor_completion_email("inv@test.com", "Done Investor", note_data)
    assert result["ok"] is True
    assert result["type"] == "investor_completion"
    _mock_email.send_email.assert_called_once()
    call_args = _mock_email.send_email.call_args
    assert "Completada" in call_args[1]["subject"]
    print("PASS test_completion_email_send")


# ── TEST: process_investor_followup_emails ──
def test_process_followup_emails():
    _mock_email.send_email.reset_mock()

    def make_chainable(data):
        mock = MagicMock()
        mock.execute.return_value = MagicMock(data=data)
        mock.select.return_value = mock
        mock.eq.return_value = mock
        mock.order.return_value = mock
        return mock

    investors_data = [
        {"id": "inv1", "name": "Investor A", "email": "a@test.com", "total_invested": 50000},
        {"id": "inv2", "name": "Investor B", "email": "b@test.com", "total_invested": 30000},
        {"id": "inv3", "name": "No Email", "email": None, "total_invested": 20000},
    ]

    notes_data = [
        {"id": "n1", "loan_amount": 50000, "annual_rate": 12, "term_months": 12,
         "total_due": 56000, "total_interest": 6000, "paid_amount": 10000,
         "status": "active", "start_date": "2026-01-01", "maturity_date": "2027-01-01"},
    ]

    call_count = {"n": 0}

    def mock_table(name):
        if name == "investors":
            return make_chainable(investors_data)
        elif name == "promissory_notes":
            return make_chainable(notes_data)
        return make_chainable([])

    _mock_sb.table.side_effect = mock_table

    result = process_investor_followup_emails()
    assert result["ok"] is True
    assert result["sent"] == 2  # inv1 and inv2 (inv3 has no email)
    assert _mock_email.send_email.call_count == 2
    print("PASS test_process_followup_emails")


# ── TEST: Client post-purchase email HTML ──
def test_client_post_purchase_html():
    options_data = {
        "financial_summary": {"purchase_price": 45000, "total_paid": 52000},
        "options": [
            {"key": "repurchase", "title": "Opcion 1: Recompra", "description": "Recompra con descuento.",
             "details": ["5% descuento lealtad"], "estimated_discount": 2250},
            {"key": "upgrade", "title": "Opcion 2: Upgrade", "description": "Trade-in program.",
             "details": ["20% credito"], "credit_amount": 10400},
        ],
        "loyalty_programs": {
            "title": "Programas de Lealtad",
            "programs": [
                {"key": "referral_bonus", "title": "Bono Referido", "description": "Bonos por referir", "min_bonus": 500, "max_bonus": 1000},
            ],
        },
    }
    html = _client_post_purchase_html("Maria Test", "456 Oak Ave, Dallas", options_data)

    assert "Maria Test" in html
    assert "456 Oak Ave, Dallas" in html
    assert "$45,000.00" in html
    assert "$52,000.00" in html
    assert "Recompra" in html
    assert "Upgrade" in html
    assert "$2,250.00" in html
    assert "$10,400.00" in html
    assert "Bono Referido" in html
    assert "$500" in html
    assert "Opciones Post-Compra" in html
    print("PASS test_client_post_purchase_html")


def test_client_post_purchase_send():
    _mock_email.send_email.reset_mock()
    options_data = {
        "financial_summary": {"purchase_price": 30000, "total_paid": 38000},
        "options": [], "loyalty_programs": {"title": "Lealtad", "programs": []},
    }
    result = send_client_post_purchase_email("client@test.com", "Test Client", "123 Main St", options_data)
    assert result["ok"] is True
    assert result["type"] == "client_post_purchase"
    _mock_email.send_email.assert_called_once()
    call_args = _mock_email.send_email.call_args
    assert "123 Main St" in call_args[1]["subject"]
    print("PASS test_client_post_purchase_send")


def test_client_post_purchase_no_email():
    result = send_client_post_purchase_email("", "No Email", "addr", {})
    assert result["ok"] is False
    print("PASS test_client_post_purchase_no_email")


# ── Run all tests ──
if __name__ == "__main__":
    test_welcome_email_html()
    test_welcome_email_send()
    test_welcome_email_no_email()
    test_followup_email_html()
    test_followup_email_send()
    test_completion_email_html()
    test_completion_email_send()
    test_process_followup_emails()
    test_client_post_purchase_html()
    test_client_post_purchase_send()
    test_client_post_purchase_no_email()
    print("\n✅ All email tests passed!")

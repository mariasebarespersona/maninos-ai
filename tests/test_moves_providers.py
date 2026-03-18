"""
Test script for Moves Providers, WhatsApp, and Payment Request features.

Tests verify:
1. Mover providers list returns correct data
2. WhatsApp URL generation with message
3. Payment request creates payment_order and updates move
4. Payment request fails for already-paid moves
5. Payment request fails for moves with no cost
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

import asyncio
from unittest.mock import MagicMock

_mock_sb = MagicMock()
sys.modules["tools.supabase_client"] = type(sys)("tools.supabase_client")
sys.modules["tools.supabase_client"].sb = _mock_sb

import api.routes.moves as moves_mod
from api.routes.moves import MOVERS


def make_chainable(data):
    mock = MagicMock()
    mock.execute.return_value = MagicMock(data=data)
    mock.select.return_value = mock
    mock.eq.return_value = mock
    mock.insert.return_value = mock
    mock.update.return_value = mock
    return mock


# ── TEST: List providers ──
def test_list_providers():
    result = asyncio.run(moves_mod.list_mover_providers())
    assert result["ok"] is True
    assert len(result["providers"]) == 2

    trujillo = next(p for p in result["providers"] if p["id"] == "trujillo")
    assert trujillo["name"] == "Angel Trujillo"
    assert trujillo["company"] == "Trujillo's Mobile Homes"
    assert trujillo["phone"] == "(936) 718-3321"
    assert trujillo["phone_raw"] == "19367183321"

    koko = next(p for p in result["providers"] if p["id"] == "koko")
    assert koko["name"] == "Josue Koko"
    assert koko["phone"] == "(832) 358-6264"
    print("PASS test_list_providers")


# ── TEST: WhatsApp URL generation ──
def test_whatsapp_url():
    result = asyncio.run(moves_mod.get_whatsapp_url(
        provider_id="trujillo",
        property_address="123 Main St",
        origin="Conroe",
        destination="Houston",
    ))
    assert result["ok"] is True
    assert "wa.me/19367183321" in result["url"]
    assert "text=" in result["url"]
    assert result["provider"]["name"] == "Angel Trujillo"
    assert "123 Main St" in result["message"]
    assert "Conroe" in result["message"]
    assert "Houston" in result["message"]
    print("PASS test_whatsapp_url")


# ── TEST: WhatsApp URL with custom message ──
def test_whatsapp_url_custom_message():
    result = asyncio.run(moves_mod.get_whatsapp_url(
        provider_id="koko",
        message="Hola Josue, necesitamos mover una casa manana",
    ))
    assert result["ok"] is True
    assert "wa.me/18323586264" in result["url"]
    assert "manana" in result["message"]
    print("PASS test_whatsapp_url_custom_message")


# ── TEST: WhatsApp invalid provider ──
def test_whatsapp_url_invalid_provider():
    from fastapi import HTTPException
    try:
        asyncio.run(moves_mod.get_whatsapp_url(provider_id="nonexistent"))
        assert False, "Should have raised"
    except HTTPException as e:
        assert e.status_code == 404
    print("PASS test_whatsapp_url_invalid_provider")


# ── TEST: Request payment creates order ──
def test_request_payment():
    move_data = [{
        "id": "move-1",
        "property_id": "prop-1",
        "moving_company": "Trujillo's Mobile Homes",
        "driver_name": "Angel Trujillo",
        "driver_phone": "(936) 718-3321",
        "origin_city": "Conroe",
        "destination_city": "Houston",
        "quoted_cost": "1500",
        "final_cost": None,
        "payment_status": None,
        "move_type": "purchase",
        "properties": {"id": "prop-1", "address": "123 Main St", "city": "Houston"},
    }]

    order_data = [{"id": "order-1", "amount": 1500, "status": "pending"}]

    def mock_table(name):
        if name == "moves":
            m = make_chainable(move_data)
            m.update.return_value = make_chainable(move_data)
            return m
        elif name == "payment_orders":
            return make_chainable(order_data)
        return make_chainable([])

    _mock_sb.table.side_effect = mock_table

    result = asyncio.run(moves_mod.request_move_payment("move-1"))
    assert result["ok"] is True
    assert result["payment_order"]["id"] == "order-1"
    assert "$1,500" in result["message"]
    assert "Trujillo" in result["message"]
    print("PASS test_request_payment")


# ── TEST: Request payment fails for paid move ──
def test_request_payment_already_paid():
    from fastapi import HTTPException

    move_data = [{
        "id": "move-2",
        "payment_status": "paid",
        "quoted_cost": "1000",
        "properties": {},
    }]

    _mock_sb.table.side_effect = lambda name: make_chainable(move_data)

    try:
        asyncio.run(moves_mod.request_move_payment("move-2"))
        assert False, "Should have raised"
    except HTTPException as e:
        assert e.status_code == 400
        assert "ya fue pagada" in e.detail
    print("PASS test_request_payment_already_paid")


# ── TEST: Request payment fails for zero cost ──
def test_request_payment_no_cost():
    from fastapi import HTTPException

    move_data = [{
        "id": "move-3",
        "payment_status": None,
        "quoted_cost": "0",
        "final_cost": None,
        "properties": {},
    }]

    _mock_sb.table.side_effect = lambda name: make_chainable(move_data)

    try:
        asyncio.run(moves_mod.request_move_payment("move-3"))
        assert False, "Should have raised"
    except HTTPException as e:
        assert e.status_code == 400
        assert "no tiene costo" in e.detail
    print("PASS test_request_payment_no_cost")


# ── TEST: MOVERS constant data integrity ──
def test_movers_data():
    assert len(MOVERS) == 2
    for m in MOVERS:
        assert "id" in m
        assert "name" in m
        assert "phone" in m
        assert "phone_raw" in m
        assert m["phone_raw"].startswith("1")  # US country code
        assert len(m["phone_raw"]) == 11  # 1 + 10 digits
    print("PASS test_movers_data")


# ── Run all tests ──
if __name__ == "__main__":
    test_list_providers()
    test_whatsapp_url()
    test_whatsapp_url_custom_message()
    test_whatsapp_url_invalid_provider()
    test_request_payment()
    test_request_payment_already_paid()
    test_request_payment_no_cost()
    test_movers_data()
    print("\n✅ All moves provider tests passed!")

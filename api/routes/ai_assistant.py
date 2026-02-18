"""
AI Assistant API — Intelligent answers about real app data using LLM + Tool Calling.

Architecture:
1. User asks a question (text or voice)
2. LLM receives the question + a set of database query TOOLS
3. LLM decides which queries to run (function calling)
4. We execute those queries against Supabase
5. Results are fed back to the LLM
6. LLM formulates a natural, accurate answer based on REAL data

Safety: The AI MUST ONLY return data from the database. Never hallucinate.
"""

import logging
import os
import json
from datetime import datetime, timedelta
from typing import Optional, Any
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# SCHEMAS
# ============================================================================

class ChatRequest(BaseModel):
    query: str
    context: Optional[str] = None  # "homes" or "capital" or "all"


class ChatResponse(BaseModel):
    answer: str
    data: Optional[dict] = None
    sources: list = []


# ============================================================================
# DATABASE QUERY TOOLS — The LLM can call any of these
# ============================================================================

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "query_properties",
            "description": (
                "Query the properties/houses database. Returns property details including "
                "status, purchase_price, sale_price, city, address, bedrooms, bathrooms, sqft, year. "
                "Statuses: acquired, renovating, published, reserved, sold, in_transit."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by property status (acquired, renovating, published, reserved, sold, in_transit). Leave empty for all.",
                    },
                    "city": {
                        "type": "string",
                        "description": "Filter by city name. Leave empty for all.",
                    },
                    "include_details": {
                        "type": "boolean",
                        "description": "If true, include full property details (address, bedrooms, etc). If false, just counts and totals.",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_sales",
            "description": (
                "Query sales records. Each sale has: sale_type ('contado' for cash or 'rto' for rent-to-own), "
                "status (pending, paid, completed, cancelled), sale_price, client_id, property_id, created_at. "
                "Use this for questions about sales count, revenue, how many sold at contado vs RTO, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "sale_type": {
                        "type": "string",
                        "enum": ["contado", "rto"],
                        "description": "Filter by sale type: 'contado' (cash) or 'rto' (rent-to-own). Leave empty for all.",
                    },
                    "status": {
                        "type": "string",
                        "description": "Filter by sale status: pending, paid, completed, cancelled. Leave empty for all.",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "Start date filter (YYYY-MM-DD). Leave empty for all time.",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "End date filter (YYYY-MM-DD). Leave empty for today.",
                    },
                    "include_details": {
                        "type": "boolean",
                        "description": "If true, include client names and property addresses. If false, just totals.",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_clients",
            "description": (
                "Query client records. Each client has: name, email, phone, status (lead, active, completed), "
                "kyc_verified, kyc_status, monthly_income, monthly_expenses. "
                "Use this for questions about how many clients, client details, who has been verified, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by client status: lead, active, completed. Leave empty for all.",
                    },
                    "name_search": {
                        "type": "string",
                        "description": "Search for a client by name (partial match). Leave empty for all.",
                    },
                    "kyc_verified": {
                        "type": "boolean",
                        "description": "Filter by KYC verification status. Leave empty for all.",
                    },
                    "include_details": {
                        "type": "boolean",
                        "description": "If true, include names, emails, phones. If false, just counts.",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_rto_contracts",
            "description": (
                "Query RTO (Rent-to-Own) contracts. Each contract has: status (draft, pending_activation, active, "
                "completed, defaulted), monthly_rent, purchase_price, down_payment, annual_rate, term_months, "
                "start_date, end_date, client_id, property_id. "
                "Use for questions about active contracts, monthly rent totals, portfolio value, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by contract status: draft, pending_activation, active, completed, defaulted. Leave empty for all.",
                    },
                    "include_details": {
                        "type": "boolean",
                        "description": "If true, include client names and property addresses.",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_rto_payments",
            "description": (
                "Query RTO payment records. Each payment has: status (scheduled, pending, paid, late, overdue, partial, waived), "
                "amount (expected), paid_amount, due_date, paid_date, payment_number, payment_method, late_fee. "
                "Related to a contract which links to a client and property. "
                "Use for questions about payments collected, overdue payments, payment history, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by payment status: scheduled, pending, paid, late, overdue, partial, waived. Leave empty for all.",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "Filter payments with due_date >= this date (YYYY-MM-DD).",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "Filter payments with due_date <= this date (YYYY-MM-DD).",
                    },
                    "include_client_info": {
                        "type": "boolean",
                        "description": "If true, include client names and property addresses via contract join.",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_rto_applications",
            "description": (
                "Query RTO applications/solicitudes. Each application has: status (submitted, under_review, approved, rejected), "
                "desired_term_months, desired_down_payment, monthly_income, created_at, client_id, property_id. "
                "Use for questions about how many applications, approved/rejected counts, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by status: submitted, under_review, approved, rejected. Leave empty for all.",
                    },
                    "include_details": {
                        "type": "boolean",
                        "description": "If true, include client names and property addresses.",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_investors",
            "description": (
                "Query investor records. Each investor has: name, email, phone, status (active, inactive), "
                "total_invested, available_capital, expected_return, actual_return. "
                "Use for questions about investors, total investment, capital available, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by investor status: active, inactive. Leave empty for all.",
                    },
                    "include_details": {
                        "type": "boolean",
                        "description": "If true, include individual investor details.",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_promissory_notes",
            "description": (
                "Query promissory notes (pagarés). Each note has: investor_id, principal_amount, interest_rate, "
                "maturity_date, status (active, matured, paid, cancelled), total_paid, remaining_balance. "
                "Use for questions about promissory notes, maturity dates, amounts owed to investors, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by note status: active, matured, paid, cancelled. Leave empty for all.",
                    },
                    "include_details": {
                        "type": "boolean",
                        "description": "If true, include investor names and full note details.",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_renovations",
            "description": (
                "Query renovation/repair records. Each renovation has: property_id, status (pending, in_progress, completed, cancelled), "
                "total_cost, notes. Related to a property. "
                "Use for questions about active renovations, renovation costs, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by renovation status: pending, in_progress, completed, cancelled. Leave empty for all.",
                    },
                    "include_details": {
                        "type": "boolean",
                        "description": "If true, include property addresses and costs.",
                        "default": True,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_market_listings",
            "description": (
                "Query scraped market listings (from Facebook Marketplace etc). Each listing has: "
                "source, address, city, listing_price, price_type (full_price, down_payment), "
                "estimated_full_price, is_qualified, status, bedrooms, bathrooms, sqft. "
                "Use for questions about available market listings, qualified properties, scraping results."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "is_qualified": {
                        "type": "boolean",
                        "description": "Filter by qualification status. Leave empty for all.",
                    },
                    "source": {
                        "type": "string",
                        "description": "Filter by source (facebook_marketplace, etc). Leave empty for all.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return. Default 30.",
                        "default": 30,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_commissions",
            "description": (
                "Query sales commissions. Each commission has: sale_id, agent_name, role (found_by, sold_by), "
                "commission_amount, status (pending, paid), paid_date. "
                "Use for questions about commissions earned, pending commissions, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by commission status: pending, paid. Leave empty for all.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_title_transfers",
            "description": (
                "Query title transfer records. Each transfer tracks ownership change of a property. "
                "Has: property_id, status (pending, in_progress, completed), transfer_type, from_entity, to_entity. "
                "Use for questions about title transfer status, pending transfers, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Filter by transfer status: pending, in_progress, completed. Leave empty for all.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_team_members",
            "description": (
                "Query team/employee records. Each user has: name, role, email, is_active. "
                "Use for questions about the team, who works here, roles, etc."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_accounting",
            "description": (
                "Query accounting/financial data from capital_transactions and capital_accounts tables. "
                "Transactions have: type (income, expense, transfer), amount, description, category, date, account_id. "
                "Accounts have: name, code, account_type (asset, liability, equity, income, expense), balance. "
                "Bank accounts have: name, balance, account_type (checking, savings, cash). "
                "Use for questions about finances, income, expenses, bank balances, accounting."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "what": {
                        "type": "string",
                        "enum": ["transactions", "accounts", "bank_accounts", "summary"],
                        "description": "What accounting data to query. 'summary' returns all high-level totals.",
                    },
                    "date_from": {
                        "type": "string",
                        "description": "Start date filter for transactions (YYYY-MM-DD).",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "End date filter for transactions (YYYY-MM-DD).",
                    },
                },
                "required": ["what"],
            },
        },
    },
]


# ============================================================================
# TOOL EXECUTION — Run the database queries
# ============================================================================

def _execute_tool(name: str, args: dict) -> dict:
    """Execute a database query tool and return the results."""
    try:
        if name == "query_properties":
            return _exec_query_properties(args)
        elif name == "query_sales":
            return _exec_query_sales(args)
        elif name == "query_clients":
            return _exec_query_clients(args)
        elif name == "query_rto_contracts":
            return _exec_query_rto_contracts(args)
        elif name == "query_rto_payments":
            return _exec_query_rto_payments(args)
        elif name == "query_rto_applications":
            return _exec_query_rto_applications(args)
        elif name == "query_investors":
            return _exec_query_investors(args)
        elif name == "query_promissory_notes":
            return _exec_query_promissory_notes(args)
        elif name == "query_renovations":
            return _exec_query_renovations(args)
        elif name == "query_market_listings":
            return _exec_query_market_listings(args)
        elif name == "query_commissions":
            return _exec_query_commissions(args)
        elif name == "query_title_transfers":
            return _exec_query_title_transfers(args)
        elif name == "query_team_members":
            return _exec_query_team(args)
        elif name == "query_accounting":
            return _exec_query_accounting(args)
        else:
            return {"error": f"Unknown tool: {name}"}
    except Exception as e:
        logger.error(f"[AI Tool] Error executing {name}: {e}")
        return {"error": str(e)}


def _exec_query_properties(args: dict) -> dict:
    query = sb.table("properties").select(
            "id, status, sale_price, purchase_price, city, state, address, "
        "year, square_feet, bedrooms, bathrooms, photos"
    )
    if args.get("status"):
        query = query.eq("status", args["status"])
    if args.get("city"):
        query = query.ilike("city", f"%{args['city']}%")
    result = query.execute()
    data = result.data or []

    # Always include summary stats
            status_counts = {}
            cities = {}
            total_purchase = 0
            total_sale = 0
    for p in data:
                s = p.get("status", "unknown")
                status_counts[s] = status_counts.get(s, 0) + 1
        c = p.get("city") or "unknown"
                cities[c] = cities.get(c, 0) + 1
                total_purchase += float(p.get("purchase_price") or 0)
                total_sale += float(p.get("sale_price") or 0)

    result_dict = {
        "total": len(data),
        "by_status": status_counts,
        "by_city": cities,
        "total_purchase_value": total_purchase,
        "total_sale_value": total_sale,
    }

    if args.get("include_details"):
        result_dict["properties"] = [
            {
                "address": p.get("address"),
                "city": p.get("city"),
                "status": p.get("status"),
                "purchase_price": p.get("purchase_price"),
                "sale_price": p.get("sale_price"),
                "bedrooms": p.get("bedrooms"),
                "bathrooms": p.get("bathrooms"),
                "year": p.get("year"),
            }
            for p in data[:30]
        ]

    return result_dict


def _exec_query_sales(args: dict) -> dict:
    select_fields = "id, status, sale_type, sale_price, payment_method, created_at, client_id, property_id"
    if args.get("include_details"):
        select_fields += ", clients(name, email), properties(address, city)"
    query = sb.table("sales").select(select_fields)

    if args.get("sale_type"):
        query = query.eq("sale_type", args["sale_type"])
    if args.get("status"):
        query = query.eq("status", args["status"])
    if args.get("date_from"):
        query = query.gte("created_at", args["date_from"])
    if args.get("date_to"):
        query = query.lte("created_at", args["date_to"])

    result = query.order("created_at", desc=True).execute()
    data = result.data or []

    type_counts = {}
    status_counts = {}
            total_revenue = 0
    for s in data:
                st = s.get("sale_type", "unknown")
        type_counts[st] = type_counts.get(st, 0) + 1
                ss = s.get("status", "unknown")
        status_counts[ss] = status_counts.get(ss, 0) + 1
                total_revenue += float(s.get("sale_price") or 0)

    result_dict = {
        "total": len(data),
        "by_type": type_counts,
        "by_status": status_counts,
        "total_revenue": total_revenue,
    }

    if args.get("include_details"):
        result_dict["sales"] = [
            {
                "client_name": s.get("clients", {}).get("name") if s.get("clients") else None,
                "property_address": s.get("properties", {}).get("address") if s.get("properties") else None,
                "property_city": s.get("properties", {}).get("city") if s.get("properties") else None,
                "sale_type": s.get("sale_type"),
                "status": s.get("status"),
                "sale_price": s.get("sale_price"),
                "created_at": s.get("created_at"),
            }
            for s in data[:30]
        ]

    return result_dict


def _exec_query_clients(args: dict) -> dict:
    select_fields = "id, name, email, phone, status, kyc_verified, kyc_status, monthly_income, monthly_expenses"
    query = sb.table("clients").select(select_fields)

    if args.get("status"):
        query = query.eq("status", args["status"])
    if args.get("name_search"):
        query = query.ilike("name", f"%{args['name_search']}%")
    if args.get("kyc_verified") is not None:
        query = query.eq("kyc_verified", args["kyc_verified"])

    result = query.execute()
    data = result.data or []

    status_counts = {}
    kyc_counts = {"verified": 0, "not_verified": 0}
    for c in data:
        cs = c.get("status", "unknown")
        status_counts[cs] = status_counts.get(cs, 0) + 1
        if c.get("kyc_verified"):
            kyc_counts["verified"] += 1
        else:
            kyc_counts["not_verified"] += 1

    result_dict = {
        "total": len(data),
        "by_status": status_counts,
        "kyc_summary": kyc_counts,
    }

    if args.get("include_details") or args.get("name_search"):
        result_dict["clients"] = [
            {
                "name": c.get("name"),
                "email": c.get("email"),
                "phone": c.get("phone"),
                "status": c.get("status"),
                "kyc_verified": c.get("kyc_verified"),
                "monthly_income": c.get("monthly_income"),
            }
            for c in data[:30]
        ]

    return result_dict


def _exec_query_rto_contracts(args: dict) -> dict:
    select_fields = (
        "id, status, monthly_rent, purchase_price, down_payment, annual_rate, "
        "term_months, start_date, end_date, client_id, property_id"
    )
    if args.get("include_details"):
        select_fields += ", clients(name), properties(address, city)"
    query = sb.table("rto_contracts").select(select_fields)

    if args.get("status"):
        query = query.eq("status", args["status"])

    result = query.execute()
    data = result.data or []

    status_counts = {}
    total_monthly = 0
    total_portfolio = 0
    total_down = 0
    for c in data:
        cs = c.get("status", "unknown")
        status_counts[cs] = status_counts.get(cs, 0) + 1
        if c.get("status") == "active":
            total_monthly += float(c.get("monthly_rent") or 0)
            total_portfolio += float(c.get("purchase_price") or 0)
        total_down += float(c.get("down_payment") or 0)

    result_dict = {
        "total": len(data),
        "by_status": status_counts,
        "active_monthly_rent_total": total_monthly,
        "active_portfolio_value": total_portfolio,
        "total_down_payments": total_down,
    }

    if args.get("include_details"):
        result_dict["contracts"] = [
            {
                "client_name": c.get("clients", {}).get("name") if c.get("clients") else None,
                "property_address": c.get("properties", {}).get("address") if c.get("properties") else None,
                "status": c.get("status"),
                "monthly_rent": c.get("monthly_rent"),
                "purchase_price": c.get("purchase_price"),
                "down_payment": c.get("down_payment"),
                "term_months": c.get("term_months"),
                "start_date": c.get("start_date"),
                "end_date": c.get("end_date"),
            }
            for c in data[:20]
        ]

    return result_dict


def _exec_query_rto_payments(args: dict) -> dict:
    select_fields = "id, status, amount, paid_amount, due_date, paid_date, payment_number, payment_method, late_fee, contract_id"
    if args.get("include_client_info"):
        select_fields = (
            "id, status, amount, paid_amount, due_date, paid_date, payment_number, payment_method, late_fee, "
            "rto_contracts(id, client_id, property_id, clients(name), properties(address))"
        )
    query = sb.table("rto_payments").select(select_fields)

    if args.get("status"):
        query = query.eq("status", args["status"])
    if args.get("date_from"):
        query = query.gte("due_date", args["date_from"])
    if args.get("date_to"):
        query = query.lte("due_date", args["date_to"])

    result = query.order("due_date", desc=True).limit(200).execute()
    data = result.data or []

    status_counts = {}
    total_expected = 0
    total_collected = 0
    total_late_fees = 0
    for p in data:
        ps = p.get("status", "unknown")
        status_counts[ps] = status_counts.get(ps, 0) + 1
        total_expected += float(p.get("amount") or 0)
        if ps == "paid":
            total_collected += float(p.get("paid_amount") or p.get("amount") or 0)
        total_late_fees += float(p.get("late_fee") or 0)

    result_dict = {
        "total": len(data),
        "by_status": status_counts,
        "total_expected": total_expected,
        "total_collected": total_collected,
        "total_late_fees": total_late_fees,
    }

    if args.get("include_client_info"):
        result_dict["payments"] = [
            {
                "client_name": (p.get("rto_contracts") or {}).get("clients", {}).get("name") if p.get("rto_contracts") else None,
                "property": (p.get("rto_contracts") or {}).get("properties", {}).get("address") if p.get("rto_contracts") else None,
                "status": p.get("status"),
                "amount": p.get("amount"),
                "paid_amount": p.get("paid_amount"),
                "due_date": p.get("due_date"),
                "paid_date": p.get("paid_date"),
                "payment_number": p.get("payment_number"),
            }
            for p in data[:30]
        ]

    return result_dict


def _exec_query_rto_applications(args: dict) -> dict:
    select_fields = "id, status, desired_term_months, desired_down_payment, monthly_income, created_at"
    if args.get("include_details"):
        select_fields += ", clients(name, email), properties(address, city, sale_price)"
    query = sb.table("rto_applications").select(select_fields)

    if args.get("status"):
        query = query.eq("status", args["status"])

    result = query.order("created_at", desc=True).execute()
    data = result.data or []

    status_counts = {}
    for a in data:
                s = a.get("status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1

    result_dict = {
        "total": len(data),
        "by_status": status_counts,
    }

    if args.get("include_details"):
        result_dict["applications"] = [
            {
                "client_name": a.get("clients", {}).get("name") if a.get("clients") else None,
                "property_address": a.get("properties", {}).get("address") if a.get("properties") else None,
                "status": a.get("status"),
                "desired_down_payment": a.get("desired_down_payment"),
                "desired_term_months": a.get("desired_term_months"),
                "created_at": a.get("created_at"),
            }
            for a in data[:20]
        ]

    return result_dict


def _exec_query_investors(args: dict) -> dict:
    query = sb.table("investors").select(
        "id, name, email, phone, status, total_invested, available_capital, expected_return, actual_return"
    )
    if args.get("status"):
        query = query.eq("status", args["status"])

    result = query.execute()
    data = result.data or []

    status_counts = {}
    total_invested = 0
    total_available = 0
    for inv in data:
        s = inv.get("status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1
        total_invested += float(inv.get("total_invested") or 0)
        total_available += float(inv.get("available_capital") or 0)

    result_dict = {
        "total": len(data),
        "by_status": status_counts,
        "total_invested": total_invested,
        "total_available_capital": total_available,
    }

    if args.get("include_details"):
        result_dict["investors"] = [
            {
                "name": inv.get("name"),
                "status": inv.get("status"),
                "total_invested": inv.get("total_invested"),
                "available_capital": inv.get("available_capital"),
                "expected_return": inv.get("expected_return"),
                "actual_return": inv.get("actual_return"),
            }
            for inv in data[:20]
        ]

    return result_dict


def _exec_query_promissory_notes(args: dict) -> dict:
    select_fields = "id, investor_id, principal_amount, interest_rate, maturity_date, status, total_paid, remaining_balance"
    if args.get("include_details"):
        select_fields += ", investors(name)"
    query = sb.table("promissory_notes").select(select_fields)

    if args.get("status"):
        query = query.eq("status", args["status"])

    result = query.execute()
    data = result.data or []

    status_counts = {}
    total_principal = 0
    total_remaining = 0
    for n in data:
        s = n.get("status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1
        total_principal += float(n.get("principal_amount") or 0)
        total_remaining += float(n.get("remaining_balance") or 0)

    result_dict = {
        "total": len(data),
        "by_status": status_counts,
        "total_principal": total_principal,
        "total_remaining_balance": total_remaining,
    }

    if args.get("include_details"):
        result_dict["notes"] = [
            {
                "investor_name": n.get("investors", {}).get("name") if n.get("investors") else None,
                "principal_amount": n.get("principal_amount"),
                "interest_rate": n.get("interest_rate"),
                "maturity_date": n.get("maturity_date"),
                "status": n.get("status"),
                "total_paid": n.get("total_paid"),
                "remaining_balance": n.get("remaining_balance"),
            }
            for n in data[:20]
        ]

    return result_dict


def _exec_query_renovations(args: dict) -> dict:
    select_fields = "id, property_id, status, total_cost, notes"
    if args.get("include_details", True):
        select_fields += ", properties(address, city)"
    query = sb.table("renovations").select(select_fields)

    if args.get("status"):
        query = query.eq("status", args["status"])

    result = query.execute()
    data = result.data or []

    status_counts = {}
    total_cost = 0
    for r in data:
        s = r.get("status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1
        total_cost += float(r.get("total_cost") or 0)

    result_dict = {
        "total": len(data),
        "by_status": status_counts,
        "total_cost": total_cost,
    }

    if args.get("include_details", True):
        result_dict["renovations"] = [
            {
                "property_address": r.get("properties", {}).get("address") if r.get("properties") else None,
                "city": r.get("properties", {}).get("city") if r.get("properties") else None,
                "status": r.get("status"),
                "total_cost": r.get("total_cost"),
            }
            for r in data[:20]
        ]

    return result_dict


def _exec_query_market_listings(args: dict) -> dict:
    query = sb.table("market_listings").select(
        "id, source, address, city, state, listing_price, price_type, estimated_full_price, "
        "is_qualified, status, bedrooms, bathrooms, sqft, scraped_at"
    )

    if args.get("is_qualified") is not None:
        query = query.eq("is_qualified", args["is_qualified"])
    if args.get("source"):
        query = query.eq("source", args["source"])

    limit = args.get("limit", 30)
    result = query.order("scraped_at", desc=True).limit(limit).execute()
    data = result.data or []

    qualified = sum(1 for l in data if l.get("is_qualified"))
    sources = {}
    price_types = {}
    for l in data:
        src = l.get("source", "unknown")
        sources[src] = sources.get(src, 0) + 1
        pt = l.get("price_type", "unknown")
        price_types[pt] = price_types.get(pt, 0) + 1

        return {
        "total": len(data),
        "qualified": qualified,
        "by_source": sources,
        "by_price_type": price_types,
        "listings": [
            {
                "address": l.get("address"),
                "city": l.get("city"),
                "price": l.get("listing_price"),
                "price_type": l.get("price_type"),
                "estimated_full_price": l.get("estimated_full_price"),
                "qualified": l.get("is_qualified"),
                "source": l.get("source"),
            }
            for l in data[:20]
        ],
    }


def _exec_query_commissions(args: dict) -> dict:
    try:
        query = sb.table("sales_commissions").select(
            "id, sale_id, agent_name, role, commission_amount, status, paid_date"
        )
        if args.get("status"):
            query = query.eq("status", args["status"])
        result = query.execute()
        data = result.data or []

        status_counts = {}
        total = 0
        for c in data:
            s = c.get("status", "unknown")
            status_counts[s] = status_counts.get(s, 0) + 1
            total += float(c.get("commission_amount") or 0)

        return {
            "total": len(data),
            "by_status": status_counts,
            "total_amount": total,
            "commissions": [
                {
                    "agent_name": c.get("agent_name"),
                    "role": c.get("role"),
                    "amount": c.get("commission_amount"),
                    "status": c.get("status"),
                }
                for c in data[:20]
            ],
        }
    except Exception:
        return {"total": 0, "note": "Commissions table may not exist yet."}


def _exec_query_title_transfers(args: dict) -> dict:
    query = sb.table("title_transfers").select(
        "id, property_id, status, transfer_type, from_entity, to_entity, properties(address, city)"
    )
    if args.get("status"):
        query = query.eq("status", args["status"])

    result = query.execute()
    data = result.data or []

    status_counts = {}
    for t in data:
        s = t.get("status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1

        return {
        "total": len(data),
        "by_status": status_counts,
        "transfers": [
            {
                "property_address": t.get("properties", {}).get("address") if t.get("properties") else None,
                "status": t.get("status"),
                "from_entity": t.get("from_entity"),
                "to_entity": t.get("to_entity"),
            }
            for t in data[:20]
        ],
    }


def _exec_query_team(args: dict) -> dict:
    result = sb.table("users").select("id, name, role, email, is_active").execute()
    data = result.data or []
    active = [u for u in data if u.get("is_active", True)]
    roles = {}
    for u in active:
        r = u.get("role", "unknown")
        roles[r] = roles.get(r, 0) + 1

        return {
        "total_active": len(active),
        "total_registered": len(data),
        "by_role": roles,
        "members": [{"name": u.get("name"), "role": u.get("role"), "email": u.get("email")} for u in active],
    }


def _exec_query_accounting(args: dict) -> dict:
    what = args.get("what", "summary")

    if what == "bank_accounts":
        try:
            result = sb.table("capital_bank_accounts").select("id, name, account_type, balance, bank_name").execute()
            data = result.data or []
            total = sum(float(b.get("balance") or 0) for b in data)
            return {
                "total_balance": total,
                "count": len(data),
                "accounts": [
                    {"name": b.get("name"), "type": b.get("account_type"), "balance": b.get("balance"), "bank": b.get("bank_name")}
                    for b in data
                ],
            }
        except Exception:
            return {"note": "Bank accounts table may not exist yet.", "total_balance": 0}

    if what == "accounts":
        try:
            result = sb.table("capital_accounts").select("id, name, code, account_type, balance").execute()
            data = result.data or []
            type_totals = {}
            for a in data:
                at = a.get("account_type", "unknown")
                type_totals[at] = type_totals.get(at, 0) + float(a.get("balance") or 0)
                    return {
                "total_accounts": len(data),
                "totals_by_type": type_totals,
                "accounts": [
                    {"name": a.get("name"), "code": a.get("code"), "type": a.get("account_type"), "balance": a.get("balance")}
                    for a in data[:30]
                ],
            }
        except Exception:
            return {"note": "Capital accounts table may not exist yet."}

    if what == "transactions":
        try:
            query = sb.table("capital_transactions").select(
                "id, type, amount, description, category, date, account_id"
            )
            if args.get("date_from"):
                query = query.gte("date", args["date_from"])
            if args.get("date_to"):
                query = query.lte("date", args["date_to"])
            result = query.order("date", desc=True).limit(50).execute()
            data = result.data or []

            income = sum(float(t.get("amount") or 0) for t in data if t.get("type") == "income")
            expenses = sum(float(t.get("amount") or 0) for t in data if t.get("type") == "expense")

            return {
                "total_transactions": len(data),
                "total_income": income,
                "total_expenses": expenses,
                "net": income - expenses,
                "transactions": [
                    {
                        "type": t.get("type"),
                        "amount": t.get("amount"),
                        "description": t.get("description"),
                        "category": t.get("category"),
                        "date": t.get("date"),
                    }
                    for t in data[:20]
                ],
            }
        except Exception:
            return {"note": "Capital transactions table may not exist yet."}

    # summary
    summary = {}
    for sub in ["bank_accounts", "accounts", "transactions"]:
        summary[sub] = _exec_query_accounting({"what": sub, **{k: v for k, v in args.items() if k != "what"}})
    return summary


# ============================================================================
# SYSTEM PROMPT
# ============================================================================

SYSTEM_PROMPT = """Eres el asistente de datos de Maninos AI — la plataforma de casas móviles de Maninos Capital LLC en Texas.

REGLAS ESTRICTAS:
1. SOLO responde con datos REALES del sistema. NUNCA inventes datos.
2. Si no tienes la información, llama a las herramientas/tools para obtener los datos de la base de datos.
3. Responde en español, de forma breve y directa.
4. Si te preguntan algo fuera del ámbito de Maninos, di "Esa pregunta está fuera del ámbito de Maninos AI."
5. Usa emojis moderadamente para hacer las respuestas más legibles.
6. Si muestras montos de dinero, usa formato: $1,234
7. SIEMPRE llama a las herramientas antes de responder — NUNCA respondas sin datos reales.
8. Puedes llamar MÚLTIPLES herramientas a la vez si necesitas datos cruzados.

CONTEXTO DEL NEGOCIO:
- Maninos compra casas móviles, las renueva, y las vende
- Venta "contado" = cliente paga el total de una vez
- Venta "RTO" (Rent-to-Own) = cliente paga enganche + pagos mensuales
- Portal Homes: gestión de propiedades, compras, renovaciones, ventas  
- Portal Capital: gestión de contratos RTO, pagos mensuales, inversores, contabilidad
- Regla compra: max 60% del valor de mercado
- Comisiones: $1,000 RTO, $1,500 contado. Split 50/50 entre found_by y sold_by.

CÓMO USAR LAS HERRAMIENTAS:
- Para preguntas sobre casas/propiedades → query_properties
- Para preguntas sobre ventas, contado vs RTO → query_sales (usa sale_type para filtrar)
- Para preguntas sobre clientes → query_clients
- Para preguntas sobre contratos RTO → query_rto_contracts
- Para preguntas sobre pagos mensuales RTO → query_rto_payments
- Para preguntas sobre solicitudes RTO → query_rto_applications
- Para preguntas sobre inversores → query_investors
- Para preguntas sobre pagarés/promissory notes → query_promissory_notes
- Para preguntas sobre renovaciones → query_renovations
- Para preguntas sobre listings del mercado/Facebook → query_market_listings
- Para preguntas sobre comisiones → query_commissions
- Para preguntas sobre transferencias de título → query_title_transfers
- Para preguntas sobre el equipo → query_team_members
- Para preguntas sobre finanzas/contabilidad → query_accounting

FECHA ACTUAL: {current_date}"""


# ============================================================================
# MAIN CHAT ENDPOINT
# ============================================================================

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    AI chat endpoint — LLM + Tool Calling for accurate database answers.
    
    Flow:
    1. Send user question to LLM with database tools
    2. LLM decides which queries to run
    3. Execute queries against Supabase
    4. Feed results back to LLM
    5. LLM generates accurate answer
    """
    logger.info(f"[AI Chat] Query: {request.query}")

    try:
        import openai

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return ChatResponse(
                answer="⚠️ AI no configurada. Falta OPENAI_API_KEY.",
                sources=["error"],
            )

        client = openai.OpenAI(api_key=api_key)

        system_prompt = SYSTEM_PROMPT.replace("{current_date}", datetime.now().strftime("%Y-%m-%d %H:%M"))

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": request.query},
        ]

        # Step 1: Initial call — LLM decides which tools to call
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=TOOLS_SCHEMA,
            tool_choice="auto",
            temperature=0,
        )

        response_message = response.choices[0].message
        tool_calls = response_message.tool_calls

        # If no tool calls, LLM answered directly (out of scope question, etc.)
        if not tool_calls:
            return ChatResponse(
                answer=response_message.content or "No tengo información para responder.",
                sources=["ai"],
            )

        # Step 2: Execute all tool calls
        messages.append(response_message)  # Add assistant's response with tool calls

        all_tool_data = {}
        for tool_call in tool_calls:
            fn_name = tool_call.function.name
            try:
                fn_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            logger.info(f"[AI Chat] Calling tool: {fn_name}({fn_args})")
            tool_result = _execute_tool(fn_name, fn_args)
            all_tool_data[fn_name] = tool_result

            # Add tool result to messages
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(tool_result, default=str, ensure_ascii=False),
            })

        # Step 3: Final call — LLM answers with the real data
        final_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0,
        )

        answer = final_response.choices[0].message.content or "No pude procesar la respuesta."

        # Collect which tools were called for transparency
        tools_used = [tc.function.name for tc in tool_calls]
        logger.info(f"[AI Chat] Tools used: {tools_used}")

        return ChatResponse(
            answer=answer,
            data=all_tool_data if all_tool_data else None,
            sources=["database", "ai"] if all_tool_data else ["ai"],
        )

    except Exception as e:
        logger.error(f"[AI Chat] Error: {e}", exc_info=True)
        return ChatResponse(
            answer=f"❌ Error procesando tu pregunta: {str(e)[:100]}. Intenta de nuevo.",
            sources=["error"],
        )


# ============================================================================
# VOICE ENDPOINT
# ============================================================================

@router.post("/voice")
async def voice_query(audio: UploadFile = File(...)):
    """
    Voice query endpoint — transcribes audio and answers the question.
    """
    try:
        import openai

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

        client = openai.OpenAI(api_key=api_key)

        audio_bytes = await audio.read()

        # Transcribe with Whisper
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=True) as tmp:
            tmp.write(audio_bytes)
            tmp.flush()

            with open(tmp.name, "rb") as f:
                transcript = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=f,
                    language="es",
                )

        transcribed_text = transcript.text
        logger.info(f"[AI Voice] Transcribed: {transcribed_text}")

        # Answer the question using the chat endpoint
        chat_response = await chat(ChatRequest(query=transcribed_text))

        return {
            "transcription": transcribed_text,
            "answer": chat_response.answer,
            "data": chat_response.data,
            "sources": chat_response.sources,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[AI Voice] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PROPERTY EVALUATION — 28-Point Checklist with AI Vision (Interactive)
# ============================================================================
# Synced with PropertyChecklist.tsx and MarketDashboard.tsx
# The evaluator analyzes photos, fills what it can, and ASKS for missing photos.

CHECKLIST_ITEMS = [
    # ESTRUCTURA (4)
    {"id": "marco_acero", "category": "Estructura", "label": "Marco de acero",
     "photo_hint": "Foto del faldón/parte inferior de la casa donde se vea el marco metálico"},
    {"id": "suelos_subfloor", "category": "Estructura", "label": "Suelos/subfloor",
     "photo_hint": "Fotos de los pisos en cada cuarto — busca hundimientos, manchas de agua, partes blandas"},
    {"id": "techo_techumbre", "category": "Estructura", "label": "Techo/techumbre",
     "photo_hint": "Foto del techo exterior + techos interiores buscando manchas de humedad o goteo"},
    {"id": "paredes_ventanas", "category": "Estructura", "label": "Paredes/ventanas",
     "photo_hint": "Fotos panorámicas de las paredes y de cada ventana (¿grietas, vidrios rotos?)"},

    # INSTALACIONES (5)
    {"id": "regaderas_tinas", "category": "Instalaciones", "label": "Regaderas/tinas/coladeras",
     "photo_hint": "Fotos de regaderas, tinas, y coladeras en cada baño"},
    {"id": "electricidad", "category": "Instalaciones", "label": "Electricidad",
     "photo_hint": "Foto del panel eléctrico abierto + enchufes/interruptores visibles"},
    {"id": "plomeria", "category": "Instalaciones", "label": "Plomería",
     "photo_hint": "Fotos debajo de lavabos/fregadero — tuberías, conexiones, posibles fugas"},
    {"id": "ac", "category": "Instalaciones", "label": "A/C",
     "photo_hint": "Foto de la unidad de A/C exterior e interior (¿presente, modelo, condición?)"},
    {"id": "gas", "category": "Instalaciones", "label": "Gas",
     "photo_hint": "Foto del tanque de gas, tubería de gas, calentador de agua"},

    # DOCUMENTACIÓN (5) — not evaluable by photo (except VIN)
    {"id": "titulo_limpio", "category": "Documentación", "label": "Título limpio sin adeudos",
     "photo_hint": "Documento: se verifica en trámite, no por foto"},
    {"id": "vin_revisado", "category": "Documentación", "label": "VIN revisado",
     "photo_hint": "Foto de la placa VIN/HUD de la casa (usualmente cerca de panel eléctrico o puerta)"},
    {"id": "docs_vendedor", "category": "Documentación", "label": "Docs vendedor",
     "photo_hint": "Documento: se verifica en trámite, no por foto"},
    {"id": "aplicacion_firmada", "category": "Documentación", "label": "Aplicación firmada vendedor/comprador",
     "photo_hint": "Documento: se verifica en trámite, no por foto"},
    {"id": "bill_of_sale", "category": "Documentación", "label": "Bill of Sale",
     "photo_hint": "Documento: se verifica en trámite, no por foto"},

    # FINANCIERO (4)
    {"id": "precio_costo_obra", "category": "Financiero", "label": "Precio compra + costo obra",
     "photo_hint": "Se estima basándose en las condiciones generales visibles en las fotos"},
    {"id": "reparaciones_30", "category": "Financiero", "label": "Reparaciones < 30% valor venta",
     "photo_hint": "Se calcula en base a los daños visibles en las fotos"},
    {"id": "comparativa_mercado", "category": "Financiero", "label": "Comparativa precios mercado",
     "photo_hint": "Se consulta en el sistema, no por foto"},
    {"id": "costos_extra", "category": "Financiero", "label": "Costos extra traslado/movida/alineación",
     "photo_hint": "Foto exterior completa: ¿hay acceso para grúa? ¿está nivelada?"},

    # ESPECIFICACIONES (5)
    {"id": "año", "category": "Especificaciones", "label": "Año",
     "photo_hint": "La placa VIN/HUD tiene el año. También se estima por diseño y materiales"},
    {"id": "condiciones", "category": "Especificaciones", "label": "Condiciones generales",
     "photo_hint": "Fotos generales del interior y exterior para evaluación global"},
    {"id": "numero_cuartos", "category": "Especificaciones", "label": "Número de cuartos",
     "photo_hint": "Fotos de cada cuarto/habitación para contarlos"},
    {"id": "lista_reparaciones", "category": "Especificaciones", "label": "Lista reparaciones necesarias",
     "photo_hint": "Se genera de todas las fotos — cuantas más fotos, mejor la lista"},
    {"id": "recorrido_completo", "category": "Especificaciones", "label": "Recorrido completo",
     "photo_hint": "Fotos de TODAS las áreas: exterior (4 lados), sala, cocina, baños, cuartos, faldón, techo"},

    # CIERRE (5) — not evaluable by photo
    {"id": "deposito_inicial", "category": "Cierre", "label": "Depósito inicial",
     "photo_hint": "Trámite administrativo, no por foto"},
    {"id": "deposit_agreement", "category": "Cierre", "label": "Deposit Agreement firmado",
     "photo_hint": "Trámite administrativo, no por foto"},
    {"id": "contrato_financiamiento", "category": "Cierre", "label": "Contrato firmado si financiamiento",
     "photo_hint": "Trámite administrativo, no por foto"},
    {"id": "pago_total_contado", "category": "Cierre", "label": "Pago total si contado",
     "photo_hint": "Trámite administrativo, no por foto"},
    {"id": "entrega_sobre", "category": "Cierre", "label": "Entrega sobre con aplicación y factura firmada",
     "photo_hint": "Trámite administrativo, no por foto"},
]

# Items that CAN be evaluated from photos (the others are docs/admin)
PHOTO_EVALUABLE_IDS = {
    "marco_acero", "suelos_subfloor", "techo_techumbre", "paredes_ventanas",
    "regaderas_tinas", "electricidad", "plomeria", "ac", "gas",
    "vin_revisado",
    "precio_costo_obra", "reparaciones_30", "costos_extra",
    "año", "condiciones", "numero_cuartos", "lista_reparaciones", "recorrido_completo",
}


@router.post("/evaluate-property")
async def evaluate_property(files: list[UploadFile] = File(...)):
    """
    AI property evaluation — analyzes photos against 28-point checklist.
    Uses GPT-4o Vision. Returns evaluation + which items need more photos.
    """
    logger.info(f"[AI Evaluator] Received {len(files)} files for evaluation")

    try:
        import openai
        import base64

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

        client = openai.OpenAI(api_key=api_key)

        # Read and encode images
        image_contents = []
        for file in files[:10]:  # Max 10 images
            raw = await file.read()
            if len(raw) == 0:
                continue
            b64 = base64.b64encode(raw).decode("utf-8")
            ext = (file.filename or "photo.jpeg").rsplit(".", 1)[-1].lower()
            mime = f"image/{ext}" if ext in ("jpeg", "jpg", "png", "gif", "webp") else "image/jpeg"
            image_contents.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime};base64,{b64}",
                    "detail": "high",
                },
            })

        if not image_contents:
            raise HTTPException(status_code=400, detail="No valid images received")

        # Build the checklist as text for the prompt (with IDs)
        checklist_text_lines = []
        for i, item in enumerate(CHECKLIST_ITEMS, 1):
            evaluable = "EVALUAR POR FOTO" if item["id"] in PHOTO_EVALUABLE_IDS else "DOCUMENTO/ADMIN (marcar not_evaluable)"
            checklist_text_lines.append(
                f'{i}. id="{item["id"]}" | {item["category"]} | {item["label"]} | {evaluable} | Tip: {item["photo_hint"]}'
            )
        checklist_text = "\n".join(checklist_text_lines)

        prompt = f"""Eres un evaluador experto de casas móviles (mobile homes / manufactured homes) para Maninos Capital LLC en Texas.

TAREA: Analiza las fotos proporcionadas y evalúa el ESTADO/CONDICIÓN de la casa en cada punto del checklist.

IMPORTANTE: Esta evaluación es SOLO para determinar el estado actual de la casa que van a comprar.
NO incluyas estimaciones de costo de reparación ni presupuesto de renovación. Solo evalúa la condición.

REGLAS CRÍTICAS:
1. Para cada punto, analiza si las fotos proporcionadas permiten evaluarlo.
2. Si puedes evaluar el punto con las fotos, asigna "pass", "fail", o "warning".
3. Si NO puedes evaluar un punto porque falta una foto específica, usa "needs_photo" — y en "note" explica EXACTAMENTE qué foto necesitas.
4. Para puntos de documentación/admin que no son evaluables por foto, usa "not_evaluable".
5. Sé HONESTO y CONSERVADOR — detectar problemas es mejor que pasarlos por alto.
6. En "note" describe la CONDICIÓN observada (ej: "Pisos hundidos en el baño, manchas de humedad visibles").

CHECKLIST DE {len(CHECKLIST_ITEMS)} PUNTOS:
{checklist_text}

Responde con un JSON válido con EXACTAMENTE esta estructura:

{{
  "checklist": [
    {{
      "id": "marco_acero",
      "category": "Estructura",
      "label": "Marco de acero",
      "status": "pass",
      "confidence": "high",
      "note": "Marco visible en buenas condiciones, sin oxidación"
    }},
    {{
      "id": "electricidad",
      "category": "Instalaciones",
      "label": "Electricidad",
      "status": "needs_photo",
      "confidence": "low",
      "note": "No se ve el panel eléctrico en las fotos. Necesito foto del panel eléctrico abierto."
    }},
    {{
      "id": "titulo_limpio",
      "category": "Documentación",
      "label": "Título limpio sin adeudos",
      "status": "not_evaluable",
      "confidence": "high",
      "note": "Se verifica en trámite administrativo"
    }}
  ],
  "summary": {{
    "total_items": {len(CHECKLIST_ITEMS)},
    "passed": 5,
    "failed": 2,
    "warnings": 3,
    "needs_photo": 4,
    "not_evaluable": 14
  }},
  "score": 65,
  "recommendation": "NECESITA MÁS INFO",
  "recommendation_reason": "Se evaluaron 10 de 18 puntos visuales. Faltan fotos del panel eléctrico, plomería, y A/C.",
  "property_type": "single_wide",
  "estimated_year": "2005 aprox",
  "estimated_bedrooms": 3,
  "photos_coverage": "Interior sala y cocina. Falta: exterior, baños, techo, faldón.",
  "photos_needed": [
    {{
      "checklist_id": "electricidad",
      "description": "Foto del panel eléctrico abierto",
      "priority": "high"
    }}
  ]
}}

IMPORTANTE:
- "status" SOLO puede ser: "pass", "fail", "warning", "needs_photo", o "not_evaluable"
- "confidence" SOLO puede ser: "high", "medium", o "low"
- "recommendation" SOLO puede ser: "COMPRAR", "NO COMPRAR", o "NECESITA MÁS INFO"
- "photos_needed" debe listar EXACTAMENTE qué fotos faltan para completar la evaluación
- Incluye TODOS los {len(CHECKLIST_ITEMS)} items del checklist en la respuesta
- El "score" es de 0 a 100, basado SOLO en items evaluados (excluye needs_photo y not_evaluable)
- NO incluyas "estimated_renovation" ni "repairs_needed" — solo evalúa el estado"""

        messages_content = [{"type": "text", "text": prompt}]
        messages_content.extend(image_contents)

        logger.info(f"[AI Evaluator] Sending {len(image_contents)} images to GPT-4o...")

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional mobile home inspector and property evaluator for Maninos Capital LLC in Texas. "
                        "Your job is to analyze photos of manufactured/mobile homes and evaluate their condition against a purchase checklist. "
                        "You must ALWAYS respond with a valid JSON object. Never refuse to evaluate — "
                        "if an image is unclear, mark items as needs_photo. This is a legitimate real estate inspection task."
                    ),
                },
                {"role": "user", "content": messages_content},
            ],
            max_tokens=4096,
            temperature=0.2,
        )

        result_text = response.choices[0].message.content
        logger.info(f"[AI Evaluator] Raw response length: {len(result_text) if result_text else 0}")

        if not result_text:
            refusal = getattr(response.choices[0].message, 'refusal', None)
            logger.error(f"[AI Evaluator] GPT-4o returned empty. Refusal: {refusal}, finish: {response.choices[0].finish_reason}")
            raise HTTPException(
                status_code=500,
                detail=f"La IA no pudo procesar las fotos. Intenta con fotos más claras o en otro formato (JPG). {f'Motivo: {refusal}' if refusal else ''}"
            )

        # Extract JSON from response
        import re
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', result_text, re.DOTALL)
        json_str = json_match.group(1).strip() if json_match else result_text.strip()
        
        if not json_str.startswith('{'):
            brace_idx = json_str.find('{')
            if brace_idx >= 0:
                json_str = json_str[brace_idx:]
        
        result = json.loads(json_str)

        # Validate and enrich result
        if "checklist" not in result:
            result["checklist"] = []
        if "summary" not in result:
            statuses = [item.get("status", "not_evaluable") for item in result["checklist"]]
            result["summary"] = {
                "total_items": len(CHECKLIST_ITEMS),
                "passed": statuses.count("pass"),
                "failed": statuses.count("fail"),
                "warnings": statuses.count("warning"),
                "needs_photo": statuses.count("needs_photo"),
                "not_evaluable": statuses.count("not_evaluable"),
            }
        if "photos_needed" not in result:
            result["photos_needed"] = []
            for item in result.get("checklist", []):
                if item.get("status") == "needs_photo":
                    checklist_def = next((c for c in CHECKLIST_ITEMS if c["id"] == item["id"]), None)
                    result["photos_needed"].append({
                        "checklist_id": item["id"],
                        "description": item.get("note", checklist_def["photo_hint"] if checklist_def else "Foto adicional requerida"),
                        "priority": "high" if item["id"] in {"marco_acero", "suelos_subfloor", "techo_techumbre", "electricidad", "plomeria"} else "medium",
                    })

        logger.info(
            f"[AI Evaluator] Score: {result.get('score', 'N/A')}, "
            f"Rec: {result.get('recommendation', 'N/A')}, "
            f"Needs photos: {len(result.get('photos_needed', []))}"
        )
        return result

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raw_preview = result_text[:500] if result_text else 'None'
        logger.error(f"[AI Evaluator] JSON parse error: {e}, raw: {raw_preview}")
        raise HTTPException(status_code=500, detail="La IA devolvió una respuesta inválida. Intenta de nuevo.")
    except Exception as e:
        logger.error(f"[AI Evaluator] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

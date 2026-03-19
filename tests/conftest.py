"""
Pytest conftest — Setup environment and mock Supabase for all tests.

Strategy: mock supabase.create_client at the lowest level so that
when tools.supabase_client is imported, it gets a MagicMock instead
of trying to connect. Individual test files can further customize
by patching tools.supabase_client.sb.
"""

import os
from unittest.mock import MagicMock, patch

# 1. Set dummy env vars BEFORE anything imports supabase_client
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key-dummy")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("RESEND_API_KEY", "test-resend-key")

# 2. Mock supabase.create_client so importing tools.supabase_client
#    doesn't fail and returns a usable MagicMock
_mock_client = MagicMock()

_patcher = patch("supabase.create_client", return_value=_mock_client)
_patcher.start()

# Don't stop the patcher — it stays active for the entire test session

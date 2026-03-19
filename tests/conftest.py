"""
Pytest conftest — Setup mock environment for integration tests.
Sets dummy env vars and patches Supabase before any app code imports.
"""

import os
import sys
from unittest.mock import MagicMock, patch

# Set dummy env vars BEFORE anything imports supabase_client
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key-dummy")
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
os.environ.setdefault("RESEND_API_KEY", "test-resend-key")


# Mock create_client so it doesn't try to connect
_mock_client = MagicMock()

def _mock_create_client(url, key, **kw):
    return _mock_client

patch("supabase.create_client", _mock_create_client).start()

#!/usr/bin/env python3
"""Simple script to start the backend with environment variables loaded."""

import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Verify required vars are set
required_vars = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
for var in required_vars:
    if not os.getenv(var):
        print(f"ERROR: {var} not set in .env")
        exit(1)

print("Environment variables loaded successfully!")
print(f"SUPABASE_URL: {os.getenv('SUPABASE_URL')[:30]}...")
print(f"OPENAI_API_KEY: {'SET' if os.getenv('OPENAI_API_KEY') else 'NOT SET'}")

# Start uvicorn (no reload to avoid port conflict)
import uvicorn
uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=False)


"""
Diagnostic startup wrapper for Railway deployment.
Catches import errors and prints them before uvicorn starts.
Remove this file once the app is stable in production.
"""
import os
import sys
import traceback

def main():
    port = int(os.environ.get("PORT", 8000))
    print(f"[startup] Python {sys.version}")
    print(f"[startup] Working dir: {os.getcwd()}")
    print(f"[startup] Port: {port}")
    print(f"[startup] Contents: {os.listdir('.')}")
    
    # Check critical env vars
    critical_vars = [
        "PORT", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
        "OPENAI_API_KEY", "RESEND_API_KEY",
    ]
    for var in critical_vars:
        val = os.environ.get(var, "")
        status = f"SET ({len(val)} chars)" if val else "MISSING"
        print(f"[startup] {var}: {status}")
    
    # Try importing the app
    print("\n[startup] Importing api.main...")
    try:
        from api.main import app
        print(f"[startup] ✅ Import OK — {len(app.routes)} routes registered")
    except Exception as e:
        print(f"[startup] ❌ Import FAILED: {e}")
        traceback.print_exc()
        sys.exit(1)
    
    # Start uvicorn
    print(f"\n[startup] Starting uvicorn on 0.0.0.0:{port}...")
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

if __name__ == "__main__":
    main()


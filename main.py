"""
Maninos AI — Backend entry point for Railway / Docker.
"""
import os
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting Maninos AI backend on port {port}...")
    uvicorn.run("api.main:app", host="0.0.0.0", port=port)

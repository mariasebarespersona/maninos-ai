# Maninos AI — Backend (FastAPI)
# Misma imagen oficial de Docker Hub, servida desde el espejo público de AWS:
# Docker Hub limita las descargas anónimas (429) y tumbaba los builds de Railway.
FROM public.ecr.aws/docker/library/python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# System deps (psycopg, Pillow, lxml, curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Playwright browser (Chromium only)
RUN playwright install --with-deps chromium || echo "WARN: Playwright browser install skipped"

# Copy application code
COPY . .

# Verify files are in place
RUN ls -la api/ tools/ startup.py && echo "Files OK"

EXPOSE 8000

# Use diagnostic startup wrapper
CMD ["python", "startup.py"]

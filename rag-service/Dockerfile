FROM python:3.11-slim

WORKDIR /app

# System deps:
#   build-essential        — wheels that need a C compiler (asyncpg, jieba)
#   libreoffice-writer-nogui — DOCX → PDF conversion in ingest.py
# Note: libpq-dev is no longer needed (asyncpg ships its own protocol).
# poppler-utils dropped: PyMuPDF doesn't require it.
# Use Aliyun mirror for Debian apt (more reliable from CN networks)
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' \
        /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libreoffice-writer-nogui \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create directories for ingestion output
RUN mkdir -p /app/data/knowledge-bases /app/ingestion_output

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

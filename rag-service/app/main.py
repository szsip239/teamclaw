import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import DATABASE_URL, INGESTION_OUTPUT_ROOT, RAG_SERVICE_SECRET
from app.routes import router

logger = logging.getLogger(__name__)

app = FastAPI(title="TeamClaw RAG Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")

# Serve OCR output artifacts (images, tables, etc.) as static files
os.makedirs(INGESTION_OUTPUT_ROOT, exist_ok=True)
app.mount("/artifacts", StaticFiles(directory=INGESTION_OUTPUT_ROOT), name="artifacts")


@app.on_event("startup")
async def on_startup():
    db_configured = bool(DATABASE_URL)
    secret_configured = bool(RAG_SERVICE_SECRET)
    logger.info(
        "RAG service starting — db_configured=%s, secret_configured=%s, artifacts=%s",
        db_configured,
        secret_configured,
        INGESTION_OUTPUT_ROOT,
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "rag"}

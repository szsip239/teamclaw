import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import DATABASE_URL, RAG_SERVICE_SECRET
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


@app.on_event("startup")
async def on_startup():
    db_configured = bool(DATABASE_URL)
    secret_configured = bool(RAG_SERVICE_SECRET)
    logger.info(
        "RAG service starting — db_configured=%s, secret_configured=%s",
        db_configured,
        secret_configured,
    )


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "rag"}

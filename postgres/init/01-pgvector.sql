-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create isolated schema for RAG vector tables (managed by LlamaIndex PGVectorStore)
CREATE SCHEMA IF NOT EXISTS rag;

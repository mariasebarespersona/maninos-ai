-- Migration: Create rag_chunks table with pgvector support for MANINOS AI
-- Date: 2025-12-16
-- Purpose: Enable RAG (Retrieval Augmented Generation) for document queries

-- Step 1: Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Drop existing rag_chunks table if it exists (clean slate for MANINOS)
DROP TABLE IF EXISTS rag_chunks CASCADE;

-- Step 3: Create rag_chunks table with pgvector support
CREATE TABLE rag_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,  -- 'title_status', 'property_listing', 'property_photos'
    document_name TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    text TEXT NOT NULL,
    embedding vector(1536),  -- OpenAI text-embedding-3-small produces 1536 dimensions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint to prevent duplicate chunks
    UNIQUE(property_id, document_type, document_name, chunk_index)
);

-- Step 4: Create indexes for fast retrieval
CREATE INDEX idx_rag_chunks_property_id ON rag_chunks(property_id);
CREATE INDEX idx_rag_chunks_document_type ON rag_chunks(document_type);
CREATE INDEX idx_rag_chunks_property_doc ON rag_chunks(property_id, document_type, document_name);

-- Step 5: Create vector similarity index (HNSW for fast approximate nearest neighbor search)
-- This dramatically speeds up similarity searches on embeddings
CREATE INDEX idx_rag_chunks_embedding ON rag_chunks USING hnsw (embedding vector_cosine_ops);

-- Step 6: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_rag_chunks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rag_chunks_updated_at_trigger ON rag_chunks;

CREATE TRIGGER rag_chunks_updated_at_trigger
    BEFORE UPDATE ON rag_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_rag_chunks_updated_at();

-- Step 7: Add helpful comment
COMMENT ON TABLE rag_chunks IS 'Stores text chunks and embeddings for RAG-based document queries in MANINOS AI';

-- Verification queries (run separately to test):
-- 
-- 1. Check if pgvector extension is enabled:
-- SELECT * FROM pg_extension WHERE extname = 'vector';
-- 
-- 2. Check table structure:
-- \d rag_chunks
-- 
-- 3. Check indexes:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'rag_chunks';
-- 
-- 4. Test vector similarity search (after inserting data):
-- SELECT id, document_name, chunk_index, 
--        1 - (embedding <=> '[0.1, 0.2, ...]'::vector) AS similarity
-- FROM rag_chunks
-- WHERE property_id = 'some-uuid'
-- ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
-- LIMIT 5;


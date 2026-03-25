-- Migration 074: Electronic Signatures (e-sign / DocuSign-style)
-- Self-hosted signing flow: generate PDF → send email → signer signs → doc saved

-- Track individual signature requests
CREATE TABLE IF NOT EXISTS document_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    envelope_id UUID,  -- groups multiple signatures for one transaction
    document_type TEXT NOT NULL CHECK (document_type IN ('bill_of_sale', 'title_application', 'rto_lease', 'deposit_agreement')),
    transaction_type TEXT DEFAULT 'purchase' CHECK (transaction_type IN ('purchase', 'sale')),
    related_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    related_property_id UUID REFERENCES properties(id) ON DELETE SET NULL,

    -- Signer info
    signer_role TEXT NOT NULL CHECK (signer_role IN ('seller', 'buyer', 'buyer2', 'landlord', 'tenant', 'maninos')),
    signer_name TEXT NOT NULL,
    signer_email TEXT NOT NULL,

    -- Signing token (unique link sent via email)
    token UUID UNIQUE DEFAULT gen_random_uuid(),
    token_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'signed', 'expired', 'revoked')),

    -- Signature data
    signature_data JSONB,  -- { type: 'typed'|'drawn', value: 'name' or base64 image, font?: string }
    signed_at TIMESTAMPTZ,
    signed_ip TEXT,
    signed_user_agent TEXT,

    -- Document URLs
    unsigned_pdf_url TEXT,
    signed_pdf_url TEXT,

    -- Audit trail
    audit_log JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Group multiple signatures into one "envelope" (like DocuSign)
CREATE TABLE IF NOT EXISTS signature_envelopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,  -- e.g. 'Bill of Sale - 123 Main St'
    related_sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    related_property_id UUID REFERENCES properties(id) ON DELETE SET NULL,

    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_signed', 'completed', 'voided')),
    document_type TEXT NOT NULL,
    transaction_type TEXT DEFAULT 'purchase',

    -- PDF URLs
    unsigned_pdf_url TEXT,
    signed_pdf_url TEXT,

    -- Tracking
    initiated_by TEXT,  -- staff user who sent it
    completed_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key from signatures to envelopes
ALTER TABLE document_signatures
    ADD CONSTRAINT fk_signature_envelope
    FOREIGN KEY (envelope_id) REFERENCES signature_envelopes(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_doc_sig_envelope ON document_signatures(envelope_id);
CREATE INDEX IF NOT EXISTS idx_doc_sig_token ON document_signatures(token);
CREATE INDEX IF NOT EXISTS idx_doc_sig_status ON document_signatures(status);
CREATE INDEX IF NOT EXISTS idx_doc_sig_email ON document_signatures(signer_email);
CREATE INDEX IF NOT EXISTS idx_sig_env_property ON signature_envelopes(related_property_id);
CREATE INDEX IF NOT EXISTS idx_sig_env_sale ON signature_envelopes(related_sale_id);
CREATE INDEX IF NOT EXISTS idx_sig_env_status ON signature_envelopes(status);

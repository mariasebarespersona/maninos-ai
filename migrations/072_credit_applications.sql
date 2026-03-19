-- Credit Applications for RTO Clients
-- Filled by the client after KYC verification, reviewed by Capital employees

CREATE TABLE IF NOT EXISTS credit_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rto_application_id UUID NOT NULL REFERENCES rto_applications(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'accepted')),
    submitted_at TIMESTAMPTZ,

    -- S1: Personal Info
    full_name TEXT,
    date_of_birth TEXT,
    ssn_last4 TEXT,
    marital_status TEXT,
    dependents_count INTEGER DEFAULT 0,
    dependents_ages TEXT,
    id_number TEXT,
    id_state TEXT,

    -- S2: Residence History (JSONB array)
    residence_history JSONB DEFAULT '[]'::jsonb,

    -- S3: Employment
    employer_name TEXT,
    employer_address TEXT,
    employer_phone TEXT,
    occupation TEXT,
    employment_type TEXT,
    monthly_income DECIMAL(12,2),
    time_at_job_years INTEGER,
    time_at_job_months INTEGER,
    previous_employer TEXT,
    previous_employer_duration TEXT,

    -- S4: Other Income (JSONB array)
    other_income_sources JSONB DEFAULT '[]'::jsonb,

    -- S5: Properties Owned (JSONB array)
    owns_properties BOOLEAN DEFAULT FALSE,
    properties_owned JSONB DEFAULT '[]'::jsonb,

    -- S6: Debts (JSONB array)
    debts JSONB DEFAULT '[]'::jsonb,
    monthly_rent DECIMAL(12,2) DEFAULT 0,
    monthly_utilities DECIMAL(12,2) DEFAULT 0,
    monthly_child_support_paid DECIMAL(12,2) DEFAULT 0,
    monthly_other_expenses DECIMAL(12,2) DEFAULT 0,

    -- S7: References (JSONB array, 3 required)
    personal_references JSONB DEFAULT '[]'::jsonb,

    -- S8: Legal History
    has_bankruptcy BOOLEAN DEFAULT FALSE,
    has_foreclosure BOOLEAN DEFAULT FALSE,
    has_eviction BOOLEAN DEFAULT FALSE,
    has_judgments BOOLEAN DEFAULT FALSE,
    has_federal_debt BOOLEAN DEFAULT FALSE,
    legal_details TEXT,

    -- S9: Emergency Contact
    emergency_name TEXT,
    emergency_phone TEXT,
    emergency_relationship TEXT,
    emergency_address TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_apps_rto ON credit_applications(rto_application_id);
CREATE INDEX IF NOT EXISTS idx_credit_apps_client ON credit_applications(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_apps_status ON credit_applications(status);

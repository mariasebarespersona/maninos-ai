-- Migración 121: autorizar compra (Comité de Inversión + VoBo del CEO)
--
-- Proceso de Capital, paso "Autorizar compra": el comité propone y el CEO da
-- el VoBo final; se puede aprobar, rechazar o pedir ajustes de precio, renta
-- o plazo. Regla: quien propone no aprueba solo. Salida: acta de comité.
-- KPI: tiempo de solicitud a decisión.
--
-- Flujo de una propuesta (capital_purchase_proposals.status):
--   borrador → en_comite → en_vobo → aprobada
--                 ↘ ajustes ↙ (vuelve a quien propone; corrige y reenvía)
--                 ↘ rechazada
-- Quién forma el comité / quién es el CEO / quórum: pendiente (por ahora vota
-- cualquier usuario de Capital distinto de quien propone, un voto por etapa).
--
-- Idempotente.

ALTER TABLE public.capital_purchase_proposals
    DROP CONSTRAINT IF EXISTS capital_purchase_proposals_status_check;
ALTER TABLE public.capital_purchase_proposals
    ADD CONSTRAINT capital_purchase_proposals_status_check
    CHECK (status IN ('borrador', 'en_comite', 'en_vobo', 'ajustes', 'aprobada', 'rechazada'));

ALTER TABLE public.capital_purchase_proposals
    ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ,   -- primera vez que se envió al comité
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,   -- último envío (tras ajustes)
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.capital_proposal_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposal_id UUID NOT NULL REFERENCES public.capital_purchase_proposals(id) ON DELETE CASCADE,
    etapa TEXT NOT NULL CHECK (etapa IN ('comite', 'vobo')),
    decision TEXT NOT NULL CHECK (decision IN ('aprobar', 'rechazar', 'ajustes')),
    comentario TEXT,
    ajustes JSONB,                    -- {precio, mensualidad, plazo_meses} sugeridos
    voter_email TEXT NOT NULL,
    proposal_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_proposal_votes_proposal ON public.capital_proposal_votes(proposal_id, created_at);

-- Comprobación:  SELECT p.casa, p.status, v.etapa, v.decision, v.voter_email FROM public.capital_purchase_proposals p LEFT JOIN public.capital_proposal_votes v ON v.proposal_id = p.id ORDER BY p.created_at DESC;

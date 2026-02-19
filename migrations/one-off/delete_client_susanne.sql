-- ============================================================================
-- ONE-OFF: Delete client "Susanne" (tumai2025@hotmail.com) and all related data
-- Run this in Supabase SQL Editor
-- ============================================================================

DO $$
DECLARE
    v_client_id UUID;
BEGIN
    SELECT id INTO v_client_id FROM clients WHERE email = 'tumai2025@hotmail.com';
    
    IF v_client_id IS NULL THEN
        RAISE NOTICE 'Client with email tumai2025@hotmail.com not found. Nothing to delete.';
        RETURN;
    END IF;

    RAISE NOTICE 'Deleting client % (ID: %)', 
        (SELECT name FROM clients WHERE id = v_client_id), v_client_id;

    -- 1. Delete title_transfers referencing sales of this client
    BEGIN
        DELETE FROM title_transfers WHERE sale_id IN (
            SELECT id FROM sales WHERE client_id = v_client_id
        );
        RAISE NOTICE 'Deleted title_transfers';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'title_transfers table does not exist, skipping';
    END;

    -- 2. Delete rto_commissions
    BEGIN
        DELETE FROM rto_commissions WHERE client_id = v_client_id;
        RAISE NOTICE 'Deleted rto_commissions';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'rto_commissions table does not exist, skipping';
    END;

    -- 3. Delete RTO payments
    BEGIN
        DELETE FROM rto_payments WHERE client_id = v_client_id;
        RAISE NOTICE 'Deleted rto_payments';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'rto_payments table does not exist, skipping';
    END;

    -- 4. Delete RTO contracts
    BEGIN
        DELETE FROM rto_contracts WHERE client_id = v_client_id;
        RAISE NOTICE 'Deleted rto_contracts';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'rto_contracts table does not exist, skipping';
    END;

    -- 5. Delete sales
    BEGIN
        DELETE FROM sales WHERE client_id = v_client_id;
        RAISE NOTICE 'Deleted sales';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'sales table does not exist, skipping';
    END;

    -- 6. Delete scheduled_emails
    BEGIN
        DELETE FROM scheduled_emails WHERE client_id = v_client_id;
        RAISE NOTICE 'Deleted scheduled_emails';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'scheduled_emails table does not exist, skipping';
    END;

    -- 7. Nullify capital_transactions
    BEGIN
        UPDATE capital_transactions SET client_id = NULL WHERE client_id = v_client_id;
        RAISE NOTICE 'Nullified capital_transactions';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'capital_transactions table does not exist, skipping';
    END;

    -- 8. Nullify accounting_transactions
    BEGIN
        UPDATE accounting_transactions SET client_id = NULL WHERE client_id = v_client_id;
        RAISE NOTICE 'Nullified accounting_transactions';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'accounting_transactions table does not exist, skipping';
    END;

    -- 9. Delete client_payments
    BEGIN
        DELETE FROM client_payments WHERE client_id = v_client_id;
        RAISE NOTICE 'Deleted client_payments';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'client_payments table does not exist, skipping';
    END;

    -- 10. Finally, delete the client
    DELETE FROM clients WHERE id = v_client_id;
    RAISE NOTICE 'Client Susanne deleted successfully!';
END $$;

-- Verify she's gone
SELECT id, name, email FROM clients WHERE email = 'tumai2025@hotmail.com';

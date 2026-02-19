-- ============================================================================
-- ONE-OFF: Delete client "Susanne" (tumai2025@hotmail.com) and all related data
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Find the client ID
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

    -- 2. Delete RTO contracts (references clients with NOT NULL)
    DELETE FROM rto_contracts WHERE client_id = v_client_id;
    RAISE NOTICE 'Deleted rto_contracts';

    -- 3. Delete RTO payments (references clients with NOT NULL)
    DELETE FROM rto_payments WHERE client_id = v_client_id;
    RAISE NOTICE 'Deleted rto_payments';

    -- 4. Delete sales (references clients, blocks delete_client endpoint)
    DELETE FROM sales WHERE client_id = v_client_id;
    RAISE NOTICE 'Deleted sales';

    -- 5. Delete commissions (references clients)
    DELETE FROM commissions WHERE client_id = v_client_id;
    RAISE NOTICE 'Deleted commissions';

    -- 6. Delete scheduled emails (ON DELETE CASCADE but let's be explicit)
    DELETE FROM scheduled_emails WHERE client_id = v_client_id;
    RAISE NOTICE 'Deleted scheduled_emails';

    -- 7. Nullify capital_transactions references (ON DELETE SET NULL)
    UPDATE capital_transactions SET client_id = NULL WHERE client_id = v_client_id;
    RAISE NOTICE 'Nullified capital_transactions';

    -- 8. Nullify accounting_transactions references (ON DELETE SET NULL)  
    UPDATE accounting_transactions SET client_id = NULL WHERE client_id = v_client_id;
    RAISE NOTICE 'Nullified accounting_transactions';

    -- 9. Delete client_payments if table exists
    BEGIN
        DELETE FROM client_payments WHERE client_id = v_client_id;
        RAISE NOTICE 'Deleted client_payments';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'client_payments table does not exist, skipping';
    END;

    -- 10. Delete title_transfers referencing sales of this client
    BEGIN
        DELETE FROM title_transfers WHERE sale_id IN (
            SELECT id FROM sales WHERE client_id = v_client_id
        );
        RAISE NOTICE 'Deleted title_transfers';
    EXCEPTION WHEN undefined_table THEN
        RAISE NOTICE 'title_transfers table does not exist, skipping';
    END;

    -- 11. Finally, delete the client
    DELETE FROM clients WHERE id = v_client_id;
    RAISE NOTICE 'Client deleted successfully!';
END $$;

-- Verify
SELECT id, name, email FROM clients WHERE email = 'tumai2025@hotmail.com';


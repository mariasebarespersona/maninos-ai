-- Enable RLS and create permissive policies for MANINOS AI tables
-- Execute this in Supabase SQL Editor
-- Created: 2025-01-04

-- 1. properties
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'properties' 
        AND policyname = 'Enable all access for properties'
    ) THEN
        ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
        
        CREATE POLICY "Enable all access for properties"
        ON public.properties
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- 2. property_inspections (NEW for MANINOS)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'property_inspections') THEN
        ALTER TABLE public.property_inspections ENABLE ROW LEVEL SECURITY;
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'property_inspections' 
            AND policyname = 'Enable all access for property_inspections'
        ) THEN
            CREATE POLICY "Enable all access for property_inspections"
            ON public.property_inspections
            FOR ALL
            USING (true)
            WITH CHECK (true);
        END IF;
    END IF;
END $$;

-- 3. sessions
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions') THEN
        ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'sessions' 
            AND policyname = 'Enable all access for sessions'
        ) THEN
            CREATE POLICY "Enable all access for sessions"
            ON public.sessions
            FOR ALL
            USING (true)
            WITH CHECK (true);
        END IF;
    END IF;
END $$;

-- 4. checkpoints
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'checkpoints') THEN
        ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'checkpoints' 
            AND policyname = 'Enable all access for checkpoints'
        ) THEN
            CREATE POLICY "Enable all access for checkpoints"
            ON public.checkpoints
            FOR ALL
            USING (true)
            WITH CHECK (true);
        END IF;
    END IF;
END $$;

-- 5. checkpoint_migrations
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'checkpoint_migrations') THEN
        ALTER TABLE public.checkpoint_migrations ENABLE ROW LEVEL SECURITY;
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'checkpoint_migrations' 
            AND policyname = 'Enable all access for checkpoint_migrations'
        ) THEN
            CREATE POLICY "Enable all access for checkpoint_migrations"
            ON public.checkpoint_migrations
            FOR ALL
            USING (true)
            WITH CHECK (true);
        END IF;
    END IF;
END $$;

-- 6. checkpoint_blobs
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'checkpoint_blobs') THEN
        ALTER TABLE public.checkpoint_blobs ENABLE ROW LEVEL SECURITY;
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'checkpoint_blobs' 
            AND policyname = 'Enable all access for checkpoint_blobs'
        ) THEN
            CREATE POLICY "Enable all access for checkpoint_blobs"
            ON public.checkpoint_blobs
            FOR ALL
            USING (true)
            WITH CHECK (true);
        END IF;
    END IF;
END $$;

-- 7. checkpoint_writes
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'checkpoint_writes') THEN
        ALTER TABLE public.checkpoint_writes ENABLE ROW LEVEL SECURITY;
        
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'checkpoint_writes' 
            AND policyname = 'Enable all access for checkpoint_writes'
        ) THEN
            CREATE POLICY "Enable all access for checkpoint_writes"
            ON public.checkpoint_writes
            FOR ALL
            USING (true)
            WITH CHECK (true);
        END IF;
    END IF;
END $$;

-- Verify RLS is enabled for MANINOS AI tables
SELECT 
    schemaname, 
    tablename, 
    rowsecurity,
    CASE WHEN rowsecurity THEN '✅ Enabled' ELSE '❌ Disabled' END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'properties', 
    'property_inspections',
    'sessions',
    'checkpoints', 
    'checkpoint_migrations', 
    'checkpoint_blobs', 
    'checkpoint_writes'
)
ORDER BY tablename;


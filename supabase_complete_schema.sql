-- ==========================================
-- ClearLine Inspections - Complete Database Schema
-- Consolidated for Phase 6 Production Ready
-- ==========================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert Default Project
INSERT INTO public.projects (id, name, description) 
VALUES ('00000000-0000-0000-0000-000000000000', 'Default General Project', 'System generated default project')
ON CONFLICT (id) DO NOTHING;

-- 3. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY,
  name text,
  role text CHECK (role IN ('contractor', 'consultant', 'admin', 'pending')) DEFAULT 'pending',
  company text,
  is_active boolean DEFAULT true,
  current_project_id uuid REFERENCES public.projects(id) DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Auto-create profile rows for new auth users.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, role, company)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1), 'New User'),
    'pending',
    COALESCE(NEW.raw_user_meta_data ->> 'company', '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

-- 4. RFIs TABLE
CREATE TABLE IF NOT EXISTS public.rfis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_no integer NOT NULL,
  project_id uuid REFERENCES public.projects(id) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  description text NOT NULL,
  location text NOT NULL,
  inspection_type text NOT NULL,
  filed_by uuid REFERENCES public.profiles(id) NOT NULL,
  filed_date date NOT NULL,
  original_filed_date date NOT NULL,
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'info_requested')) DEFAULT 'pending',
  assigned_to uuid REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamp with time zone,
  remarks text,
  images text[] DEFAULT ARRAY[]::text[],
  carryover_count integer DEFAULT 0,
  carryover_to date,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Restrict consultant updates to decision metadata + remarks/attachments only.
CREATE OR REPLACE FUNCTION public.enforce_consultant_rfi_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text;
BEGIN
  -- Allow service-role/background operations that do not have an auth.uid context.
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.role INTO actor_role
  FROM public.profiles p
  WHERE p.id = actor_id;

  IF actor_role IS DISTINCT FROM 'consultant' THEN
    RETURN NEW;
  END IF;

  -- Consultants may NOT alter core inspection content fields directly.
  IF NEW.serial_no IS DISTINCT FROM OLD.serial_no
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.inspection_type IS DISTINCT FROM OLD.inspection_type
    OR NEW.filed_by IS DISTINCT FROM OLD.filed_by
    OR NEW.filed_date IS DISTINCT FROM OLD.filed_date
    OR NEW.original_filed_date IS DISTINCT FROM OLD.original_filed_date
    OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
    OR NEW.carryover_count IS DISTINCT FROM OLD.carryover_count
    OR NEW.custom_fields IS DISTINCT FROM OLD.custom_fields
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Consultants can only update remarks, attachments, and decision metadata.';
  END IF;

  -- Consultant decision changes are limited to approved/rejected transitions.
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Consultants can only set status to approved or rejected.';
  END IF;

  -- reviewed_by must be the acting consultant when it is changed.
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     AND NEW.reviewed_by IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION 'reviewed_by must match the acting consultant.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_consultant_rfi_update_scope ON public.rfis;
CREATE TRIGGER trg_enforce_consultant_rfi_update_scope
BEFORE UPDATE ON public.rfis
FOR EACH ROW
EXECUTE FUNCTION public.enforce_consultant_rfi_update_scope();

-- 5. COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6B. PUSH SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  device_install_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text,
  auth text,
  subscription jsonb NOT NULL,
  device_label text,
  user_agent text,
  is_active boolean DEFAULT true,
  last_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

WITH ranked_push_subscriptions AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, device_install_id
      ORDER BY updated_at DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.push_subscriptions
)
DELETE FROM public.push_subscriptions p
USING ranked_push_subscriptions r
WHERE p.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_subscriptions_user_device_install_key'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_user_device_install_key UNIQUE (user_id, device_install_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS push_subscriptions_active_idx
  ON public.push_subscriptions (user_id, is_active);

CREATE OR REPLACE FUNCTION public.set_push_subscription_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  NEW.last_seen_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
BEFORE UPDATE ON public.push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_push_subscription_updated_at();

-- 6C. PUSH DISPATCH LOG TABLE (Rate limiting / dedupe)
CREATE TABLE IF NOT EXISTS public.push_dispatch_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  event_key text,
  status text DEFAULT 'processed' NOT NULL,
  sent_count integer DEFAULT 0 NOT NULL,
  removed_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS push_dispatch_log_sender_created_idx
  ON public.push_dispatch_log (sender_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS push_dispatch_log_recipient_created_idx
  ON public.push_dispatch_log (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS push_dispatch_log_event_key_created_idx
  ON public.push_dispatch_log (recipient_user_id, event_key, created_at DESC);

-- 7. AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Projects Policies
DROP POLICY IF EXISTS "Projects viewable by authenticated" ON public.projects;
CREATE POLICY "Projects viewable by authenticated" ON public.projects FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can insert Projects" ON public.projects;
CREATE POLICY "Authenticated can insert Projects" ON public.projects FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Profiles Policies
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- RFIs Policies
DROP POLICY IF EXISTS "RFIs viewable by authenticated" ON public.rfis;
CREATE POLICY "RFIs viewable by authenticated" ON public.rfis FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Contractors can insert RFIs" ON public.rfis;
CREATE POLICY "Contractors can insert RFIs" ON public.rfis FOR INSERT WITH CHECK (auth.uid() = filed_by);

DROP POLICY IF EXISTS "Authenticated users can update RFIs" ON public.rfis;
CREATE POLICY "Authenticated users can update RFIs" ON public.rfis FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Contractors can delete own RFIs" ON public.rfis;
CREATE POLICY "Contractors can delete own RFIs" ON public.rfis FOR DELETE USING (auth.uid() = filed_by);

-- Comments Policies
DROP POLICY IF EXISTS "Comments viewable by authenticated" ON public.comments;
CREATE POLICY "Comments viewable by authenticated" ON public.comments FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can insert comments" ON public.comments;
CREATE POLICY "Users can insert comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
CREATE POLICY "Users can update own comments" ON public.comments FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Notifications Policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Push Subscription Policies
DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions" ON public.push_subscriptions FOR SELECT USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own push subscriptions" ON public.push_subscriptions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- Audit Log Policies
DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON public.audit_log;
CREATE POLICY "Authenticated users can view audit logs" ON public.audit_log FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_log;
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 9. STORAGE POLICIES (Bucket 'rfi-images' must exist)
-- These are applied to storage.objects, but bucket creation is usually via UI or API.
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
CREATE POLICY "Authenticated users can upload images" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND bucket_id = 'rfi-images');

DROP POLICY IF EXISTS "Authenticated users can view images" ON storage.objects;
CREATE POLICY "Authenticated users can view images" ON storage.objects
  FOR SELECT USING (auth.role() = 'authenticated' AND bucket_id = 'rfi-images');

DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;
CREATE POLICY "Users can delete their own images" ON storage.objects
  FOR DELETE USING (auth.uid() = owner AND bucket_id = 'rfi-images');

-- 10. REALTIME PUBLICATION
-- Try to drop and recreate for a clean start
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE 
  public.rfis, 
  public.comments, 
  public.notifications, 
  public.audit_log;

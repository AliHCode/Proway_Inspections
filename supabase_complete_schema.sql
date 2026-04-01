-- ==========================================
-- ClearLine Inspections - Complete Database Schema
-- Consolidated & Production Ready (Smart Workflow)
-- ==========================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text,
  description text,
  timezone TEXT DEFAULT 'UTC',
  column_order jsonb DEFAULT NULL,
  column_widths jsonb DEFAULT '{}'::jsonb,
  export_template jsonb DEFAULT '{}'::jsonb,
  subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('active', 'expired', 'trial')),
  is_locked BOOLEAN DEFAULT false,
  subscription_end TIMESTAMPTZ,
  payment_remarks TEXT,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON COLUMN projects.subscription_status IS 'Current status of the project subscription (active, expired, trial)';
COMMENT ON COLUMN projects.is_locked IS 'Manual override by admin to block project access regardless of expiry';
COMMENT ON COLUMN projects.subscription_end IS 'When the current subscription or trial ends';

-- Insert Default Project
INSERT INTO public.projects (id, name, description) 
VALUES ('00000000-0000-0000-0000-000000000000', 'Default General Project', 'System generated default project')
ON CONFLICT (id) DO NOTHING;

-- 3. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY,
  name text,
  role text CHECK (role IN ('contractor', 'consultant', 'admin', 'pending', 'rejected')) DEFAULT 'pending',
  company text,
  is_active boolean DEFAULT true,
  is_archived boolean DEFAULT false,
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
  parent_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE,
  serial_no integer NOT NULL,
  project_id uuid REFERENCES public.projects(id) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  description text NOT NULL,
  location text NOT NULL,
  inspection_type text NOT NULL,
  filed_by uuid REFERENCES public.profiles(id) NOT NULL,
  filed_date date NOT NULL,
  original_filed_date date NOT NULL,
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'info_requested', 'conditional_approve', 'cancelled')) DEFAULT 'pending',
  assigned_to uuid REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamp with time zone,
  remarks text,
  images text[] DEFAULT ARRAY[]::text[],
  custom_fields jsonb DEFAULT '{}'::jsonb,
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
  -- Allow service-role/background operations with no auth context.
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.role INTO actor_role
  FROM public.profiles p
  WHERE p.id = actor_id;

  -- Only enforce for consultants; all other roles pass through.
  IF actor_role IS DISTINCT FROM 'consultant' THEN
    RETURN NEW;
  END IF;

  -- Consultants may NOT alter core inspection content fields.
  IF NEW.serial_no IS DISTINCT FROM OLD.serial_no
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.inspection_type IS DISTINCT FROM OLD.inspection_type
    OR NEW.filed_by IS DISTINCT FROM OLD.filed_by
    OR NEW.filed_date IS DISTINCT FROM OLD.filed_date
    OR NEW.original_filed_date IS DISTINCT FROM OLD.original_filed_date
    OR NEW.carryover_count IS DISTINCT FROM OLD.carryover_count
    OR NEW.custom_fields IS DISTINCT FROM OLD.custom_fields
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Consultants can only update remarks, attachments, and decision metadata.';
  END IF;

  -- Consultants may set any of these decision statuses.
  IF NEW.status IS DISTINCT FROM OLD.status
    AND NEW.status NOT IN ('approved', 'rejected', 'conditional_approve', 'cancelled', 'pending') THEN
    RAISE EXCEPTION 'Consultants can only set status to approved, rejected, conditional_approve, or cancelled.';
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

-- 4B. PROJECT_FIELDS TABLE: Admin-defined custom columns per project
CREATE TABLE IF NOT EXISTS public.project_fields (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  field_name text NOT NULL,
  field_key text NOT NULL,
  field_type text CHECK (field_type IN ('text', 'number', 'select', 'date', 'textarea')) DEFAULT 'text',
  options jsonb DEFAULT '[]'::jsonb,
  is_required boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(project_id, field_key)
);

-- 4C. PROJECT_MEMBERS TABLE: Admin assigns users to projects with roles
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text CHECK (role IN ('contractor', 'consultant', 'admin')) NOT NULL,
  can_file_rfis boolean DEFAULT true NOT NULL,
  can_discuss_rfis boolean DEFAULT true NOT NULL,
  can_upload_rfi_archive boolean DEFAULT false NOT NULL,
  can_manage_contractor_permissions boolean DEFAULT false NOT NULL,
  assigned_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(project_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.rfi_scanned_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE NOT NULL,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  original_file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/pdf',
  file_size_bytes bigint NOT NULL DEFAULT 0,
  r2_object_key text NOT NULL UNIQUE,
  uploaded_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rfi_scanned_documents_rfi_uploaded
  ON public.rfi_scanned_documents(rfi_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_rfi_scanned_documents_project_uploaded
  ON public.rfi_scanned_documents(project_id, uploaded_at DESC);

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

-- 6C. PUSH DISPATCH LOG TABLE (Rate limiting / dedupe / reliability)
CREATE TABLE IF NOT EXISTS public.push_dispatch_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  event_key text,
  status text DEFAULT 'pending' NOT NULL, -- 'pending', 'sent', 'failed'
  error_details text,
  retry_count integer DEFAULT 0 NOT NULL,
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

-- 7. AUDIT LOG TABLES
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enterprise-grade log for tracking sensitive project and user modifications.
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL, -- e.g., 'DELETE_PROJECT', 'LOCK_PROJECT', 'CHANGE_ROLE'
  target_id UUID,        -- The ID of the project, user, or RFI affected
  metadata JSONB DEFAULT '{}'::jsonb, -- Store details like old_value, new_value
  ip_address TEXT
);

-- Table for tracking images that need to be deleted from Storage
CREATE TABLE IF NOT EXISTS public.storage_deletion_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  file_path text NOT NULL,
  bucket_id text DEFAULT 'rfi-images' NOT NULL,
  deleted_at timestamp with time zone DEFAULT NOW(),
  processed boolean DEFAULT false,
  processed_at timestamp with time zone
);

COMMENT ON TABLE security_audit_log IS 'Enterprise-grade log for tracking sensitive project and user modifications.';

-- 8. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfi_scanned_documents ENABLE ROW LEVEL SECURITY;

-- STEP 3: HELPER FUNCTIONS
-- SECURITY DEFINER + search_path = bypass RLS inside the function body
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_project_member(p_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_id AND user_id = auth.uid()
  ) OR public.is_admin();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Returns true if project is accessible (not locked) OR the user is an admin.
CREATE OR REPLACE FUNCTION public.is_project_accessible(p_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF public.is_admin() THEN RETURN TRUE; END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_id AND is_locked = false 
    AND subscription_status != 'expired'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_current_user_file_project_rfis(p_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  membership_record public.project_members%ROWTYPE;
BEGIN
  IF public.is_admin() THEN RETURN TRUE; END IF;

  SELECT *
  INTO membership_record
  FROM public.project_members
  WHERE project_id = p_id AND user_id = auth.uid()
  LIMIT 1;

  IF membership_record.user_id IS NULL THEN RETURN FALSE; END IF;
  IF membership_record.role <> 'contractor' THEN RETURN FALSE; END IF;

  RETURN COALESCE(membership_record.can_file_rfis, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_current_user_participate_in_project_discussion(p_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  membership_record public.project_members%ROWTYPE;
BEGIN
  IF public.is_admin() THEN RETURN TRUE; END IF;

  SELECT *
  INTO membership_record
  FROM public.project_members
  WHERE project_id = p_id AND user_id = auth.uid()
  LIMIT 1;

  IF membership_record.user_id IS NULL THEN RETURN FALSE; END IF;
  IF membership_record.role = 'consultant' THEN RETURN TRUE; END IF;
  IF membership_record.role = 'contractor' THEN RETURN COALESCE(membership_record.can_discuss_rfis, true); END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.can_current_user_upload_rfi_scanned_documents(target_rfi_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  target_rfi public.rfis%ROWTYPE;
  membership_record public.project_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  IF public.is_admin() THEN RETURN TRUE; END IF;

  SELECT *
  INTO target_rfi
  FROM public.rfis
  WHERE id = target_rfi_id
  LIMIT 1;

  IF target_rfi.id IS NULL THEN RETURN FALSE; END IF;
  IF target_rfi.status NOT IN ('approved', 'conditional_approve') THEN RETURN FALSE; END IF;

  SELECT *
  INTO membership_record
  FROM public.project_members
  WHERE project_id = target_rfi.project_id AND user_id = auth.uid()
  LIMIT 1;

  IF membership_record.user_id IS NULL THEN RETURN FALSE; END IF;
  IF membership_record.role <> 'contractor' THEN RETURN FALSE; END IF;

  RETURN COALESCE(membership_record.can_manage_contractor_permissions, false)
    OR COALESCE(membership_record.can_upload_rfi_archive, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.can_current_user_upload_rfi_scanned_documents(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_project_contractor_permissions(
  target_project_id UUID,
  target_user_id UUID,
  next_can_file_rfis BOOLEAN,
  next_can_discuss_rfis BOOLEAN,
  next_can_upload_rfi_archive BOOLEAN
)
RETURNS public.project_members AS $$
DECLARE
  actor_membership public.project_members%ROWTYPE;
  target_membership public.project_members%ROWTYPE;
  updated_membership public.project_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT public.is_admin() THEN
    SELECT *
    INTO actor_membership
    FROM public.project_members
    WHERE project_id = target_project_id AND user_id = auth.uid()
    LIMIT 1;

    IF actor_membership.user_id IS NULL
      OR actor_membership.role <> 'contractor'
      OR COALESCE(actor_membership.can_manage_contractor_permissions, false) = false THEN
      RAISE EXCEPTION 'Only the lead contractor for this project can manage contractor permissions.';
    END IF;
  END IF;

  SELECT *
  INTO target_membership
  FROM public.project_members
  WHERE project_id = target_project_id AND user_id = target_user_id
  FOR UPDATE;

  IF target_membership.user_id IS NULL THEN
    RAISE EXCEPTION 'Contractor membership not found for this project.';
  END IF;

  IF target_membership.role <> 'contractor' THEN
    RAISE EXCEPTION 'Only contractor memberships can be updated from this screen.';
  END IF;

  IF COALESCE(target_membership.can_manage_contractor_permissions, false) = true THEN
    RAISE EXCEPTION 'Lead contractor access can only be changed by an admin.';
  END IF;

  UPDATE public.project_members
  SET
    can_file_rfis = COALESCE(next_can_file_rfis, can_file_rfis),
    can_discuss_rfis = COALESCE(next_can_discuss_rfis, can_discuss_rfis),
    can_upload_rfi_archive = COALESCE(next_can_upload_rfi_archive, can_upload_rfi_archive)
  WHERE id = target_membership.id
  RETURNING * INTO updated_membership;

  RETURN updated_membership;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.update_project_contractor_permissions(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- Profiles Policies
-- CRITICAL: Do NOT call is_admin() here — that queries profiles and causes infinite recursion.
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
CREATE POLICY "Authenticated can view profiles" ON public.profiles
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles
    FOR UPDATE USING (public.is_admin());

-- Projects Policies
DROP POLICY IF EXISTS "Projects viewable by members" ON public.projects;
CREATE POLICY "Projects viewable by members" ON public.projects
    FOR SELECT USING (public.is_project_member(id));

DROP POLICY IF EXISTS "Admins full project control" ON public.projects;
CREATE POLICY "Admins full project control" ON public.projects
    FOR ALL USING (public.is_admin());

-- Project Members Policies
DROP POLICY IF EXISTS "Members can view own memberships" ON public.project_members;
CREATE POLICY "Members can view own memberships" ON public.project_members
    FOR SELECT USING (
        user_id = auth.uid() OR public.is_project_member(project_id)
    );

DROP POLICY IF EXISTS "Admins manage memberships" ON public.project_members;
CREATE POLICY "Admins manage memberships" ON public.project_members
    FOR ALL USING (public.is_admin());

-- Also drop the more permissive legacy policies that may conflict
DROP POLICY IF EXISTS "Project members viewable by authenticated" ON public.project_members;
DROP POLICY IF EXISTS "Admins can manage project members" ON public.project_members;

-- RFIs Policies
DROP POLICY IF EXISTS "RFIs viewable by project members" ON public.rfis;
CREATE POLICY "RFIs viewable by project members" ON public.rfis
    FOR SELECT USING (
        public.is_project_member(project_id) 
        AND public.is_project_accessible(project_id)
    );

DROP POLICY IF EXISTS "Members can create RFIs" ON public.rfis;
CREATE POLICY "Members can create RFIs" ON public.rfis
    FOR INSERT WITH CHECK (
        public.can_current_user_file_project_rfis(project_id)
        AND public.is_project_accessible(project_id)
    );

DROP POLICY IF EXISTS "Consultants and Admins can update RFIs" ON public.rfis;
CREATE POLICY "Consultants and Admins can update RFIs" ON public.rfis
    FOR UPDATE USING (
        public.is_admin() OR
        (
            EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'consultant')
            AND public.is_project_member(project_id)
            AND public.is_project_accessible(project_id)
        )
    );

DROP POLICY IF EXISTS "Contractors can update own RFIs" ON public.rfis;
CREATE POLICY "Contractors can update own RFIs" ON public.rfis
    FOR UPDATE USING (
        filed_by = auth.uid()
        AND public.can_current_user_file_project_rfis(project_id)
        AND public.is_project_accessible(project_id)
    );

DROP POLICY IF EXISTS "Contractors can delete own RFIs" ON public.rfis;
CREATE POLICY "Contractors can delete own RFIs" ON public.rfis
    FOR DELETE USING (
        auth.uid() = filed_by 
        AND public.can_current_user_file_project_rfis(project_id)
        AND public.is_project_accessible(project_id)
    );

DROP POLICY IF EXISTS "Admins can delete any RFI" ON public.rfis;
CREATE POLICY "Admins can delete any RFI" ON public.rfis 
    FOR DELETE USING (public.is_admin());

-- Security Audit Log Policies
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.security_audit_log;
DROP POLICY IF EXISTS "Admins can manage audit logs" ON public.security_audit_log;
DROP POLICY IF EXISTS "Users can insert audit logs" ON public.security_audit_log;

CREATE POLICY "Admins can view audit logs" ON public.security_audit_log
    FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can manage audit logs" ON public.security_audit_log
    FOR ALL USING (public.is_admin());

CREATE POLICY "Users can insert audit logs" ON public.security_audit_log
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Storage Deletion Queue Policies
ALTER TABLE public.storage_deletion_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins can view deletion queue" ON public.storage_deletion_queue;
CREATE POLICY "Only admins can view deletion queue" ON public.storage_deletion_queue
    FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Only system can insert into deletion queue" ON public.storage_deletion_queue;
CREATE POLICY "Only system can insert into deletion queue" ON public.storage_deletion_queue
    FOR INSERT WITH CHECK (false); -- Insertions only happen via trigger (SECURITY DEFINER)

-- Comments Policies
DROP POLICY IF EXISTS "Comments viewable by authenticated" ON public.comments;
DROP POLICY IF EXISTS "Users can insert comments" ON public.comments;
DROP POLICY IF EXISTS "Users can update own comments" ON public.comments;
DROP POLICY IF EXISTS "Users can delete own comments" ON public.comments;
DROP POLICY IF EXISTS "Comments assignment-aware select" ON public.comments;
DROP POLICY IF EXISTS "Comments assignment-aware insert" ON public.comments;
DROP POLICY IF EXISTS "Comments assignment-aware update" ON public.comments;
DROP POLICY IF EXISTS "Comments assignment-aware delete" ON public.comments;

CREATE POLICY "Comments assignment-aware select"
ON public.comments
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.is_project_member(r.project_id)
      AND public.is_project_accessible(r.project_id)
  )
);

CREATE POLICY "Comments assignment-aware insert"
ON public.comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.can_current_user_participate_in_project_discussion(r.project_id)
      AND public.is_project_accessible(r.project_id)
  )
);

CREATE POLICY "Comments assignment-aware update"
ON public.comments
FOR UPDATE
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.can_current_user_participate_in_project_discussion(r.project_id)
      AND public.is_project_accessible(r.project_id)
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.can_current_user_participate_in_project_discussion(r.project_id)
      AND public.is_project_accessible(r.project_id)
  )
);

CREATE POLICY "Comments assignment-aware delete"
ON public.comments
FOR DELETE
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.can_current_user_participate_in_project_discussion(r.project_id)
      AND public.is_project_accessible(r.project_id)
  )
);

DROP POLICY IF EXISTS "Admins can delete any comment" ON public.comments;
CREATE POLICY "Admins can delete any comment" ON public.comments 
    FOR DELETE USING (public.is_admin());

-- Notifications Policies
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications 
    FOR SELECT USING (
        auth.uid() = user_id
        AND (rfi_id IS NULL OR EXISTS (
            SELECT 1 FROM public.rfis r 
            WHERE r.id = notifications.rfi_id 
            AND public.is_project_accessible(r.project_id)
        ))
    );

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can delete any notification" ON public.notifications;
CREATE POLICY "Admins can delete any notification" ON public.notifications 
    FOR DELETE USING (public.is_admin());

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

DROP POLICY IF EXISTS "Admins can delete audit logs" ON public.audit_log;
CREATE POLICY "Admins can delete audit logs" ON public.audit_log 
    FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_log;
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 8F. PROJECT_FIELDS POLICIES
DROP POLICY IF EXISTS "Project fields viewable by authenticated" ON public.project_fields;
CREATE POLICY "Project fields viewable by authenticated" ON public.project_fields
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage project fields" ON public.project_fields;
CREATE POLICY "Admins can manage project fields" ON public.project_fields
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 8G. PROJECT_MEMBERS POLICIES
DROP POLICY IF EXISTS "Project members viewable by authenticated" ON public.project_members;
CREATE POLICY "Project members viewable by authenticated" ON public.project_members
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage project members" ON public.project_members;
CREATE POLICY "Admins can manage project members" ON public.project_members
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Project members view scanned docs" ON public.rfi_scanned_documents;
CREATE POLICY "Project members view scanned docs" ON public.rfi_scanned_documents
FOR SELECT USING (
  public.is_project_member(project_id)
  AND public.is_project_accessible(project_id)
);

DROP POLICY IF EXISTS "Eligible contractors insert scanned docs" ON public.rfi_scanned_documents;
CREATE POLICY "Eligible contractors insert scanned docs" ON public.rfi_scanned_documents
FOR INSERT WITH CHECK (
  auth.uid() = uploaded_by
  AND public.is_project_member(project_id)
  AND public.is_project_accessible(project_id)
  AND EXISTS (
    SELECT 1
    FROM public.rfis
    WHERE id = rfi_id
      AND project_id = rfi_scanned_documents.project_id
  )
  AND public.can_current_user_upload_rfi_scanned_documents(rfi_id)
);

DROP POLICY IF EXISTS "Eligible contractors delete scanned docs" ON public.rfi_scanned_documents;
CREATE POLICY "Eligible contractors delete scanned docs" ON public.rfi_scanned_documents
FOR DELETE USING (
  public.is_admin()
  OR public.can_current_user_upload_rfi_scanned_documents(rfi_id)
);

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

-- 10. SEED DATA: Default project fields
INSERT INTO public.project_fields (project_id, field_name, field_key, field_type, is_required, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'Description', 'description', 'text', true, 1),
  ('00000000-0000-0000-0000-000000000000', 'Location', 'location', 'text', true, 2),
  ('00000000-0000-0000-0000-000000000000', 'Inspection Type', 'inspection_type', 'select', true, 3)
ON CONFLICT (project_id, field_key) DO NOTHING;

UPDATE public.project_fields
SET options = '["Structural","MEP","Electrical","Plumbing","Finishing","Landscaping","Civil","HVAC","Fire Safety","Other"]'::jsonb
WHERE field_key = 'inspection_type' AND project_id = '00000000-0000-0000-0000-000000000000';

-- 11. ADMIN DELETE USER FUNCTION
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  UPDATE public.rfis SET assigned_to = NULL WHERE assigned_to = target_user_id;
  UPDATE public.rfis SET reviewed_by = NULL WHERE reviewed_by = target_user_id;
  DELETE FROM public.rfis WHERE filed_by = target_user_id;
  DELETE FROM public.notifications WHERE user_id = target_user_id;
  DELETE FROM public.project_members WHERE user_id = target_user_id;
  DELETE FROM public.profiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

-- 12. REALTIME PUBLICATION
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE 
  public.rfis, 
  public.comments, 
  public.notifications, 
  public.audit_log;

-- 13. ADDITIONAL TRIGGERS FOR SHIPPING LOGIC

-- Automatically generate serial_no and rfi_no for RFIs on insert
CREATE OR REPLACE FUNCTION public.generate_rfi_serial_no()
RETURNS trigger AS $$
DECLARE
  p_code text;
  max_val integer;
  parent_code text;
BEGIN
  -- 1. Handle serial_no
  IF NEW.serial_no IS NULL OR NEW.serial_no = 0 THEN
    SELECT COALESCE(MAX(serial_no), 0) + 1 INTO NEW.serial_no
    FROM public.rfis
    WHERE project_id = NEW.project_id AND filed_date = NEW.filed_date;
  END IF;

  -- 2. Handle rfi_no in custom_fields
  IF NEW.custom_fields IS NULL THEN NEW.custom_fields := '{}'::jsonb; END IF;

  IF NEW.custom_fields ->> 'rfi_no' IS NULL THEN
    SELECT code INTO p_code FROM public.projects WHERE id = NEW.project_id;
    p_code := COALESCE(p_code, 'RR007');

    IF NEW.parent_id IS NULL THEN
       -- Base RFI: Prefix-001
       SELECT COALESCE(MAX((custom_fields->>'rfi_no_num')::integer), 0) + 1 INTO max_val
       FROM public.rfis
       WHERE project_id = NEW.project_id AND parent_id IS NULL;
       
       NEW.custom_fields := jsonb_set(
         NEW.custom_fields, 
         '{rfi_no}', 
         to_jsonb(p_code || '-' || LPAD(max_val::text, 3, '0'))
       );
       -- Store the numeric part for easier MAX() next time
       NEW.custom_fields := jsonb_set(NEW.custom_fields, '{rfi_no_num}', to_jsonb(max_val));
    ELSE
       -- Revision: ParentPrefix-R1
       SELECT custom_fields->>'rfi_no' INTO parent_code FROM public.rfis WHERE id = NEW.parent_id;
       IF parent_code LIKE '%-R%' THEN
         NEW.custom_fields := jsonb_set(
           NEW.custom_fields, 
           '{rfi_no}', 
           to_jsonb(split_part(parent_code, '-R', 1) || '-R' || (split_part(parent_code, '-R', 2)::integer + 1))
         );
       ELSE
         NEW.custom_fields := jsonb_set(NEW.custom_fields, '{rfi_no}', to_jsonb(parent_code || '-R1'));
       END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_generate_rfi_serial_no ON public.rfis;
CREATE TRIGGER trg_generate_rfi_serial_no
BEFORE INSERT ON public.rfis
FOR EACH ROW
EXECUTE FUNCTION public.generate_rfi_serial_no();

-- Track images for deletion when an RFI is removed
CREATE OR REPLACE FUNCTION public.enqueue_rfi_images_for_deletion()
RETURNS trigger AS $$
DECLARE
  img_url text;
  img_path text;
BEGIN
  IF OLD.images IS NOT NULL AND array_length(OLD.images, 1) > 0 THEN
    FOREACH img_url IN ARRAY OLD.images LOOP
      -- Extract path from public URL: https://.../storage/v1/object/public/rfi-images/PROJECTID/FILENAME
      -- We want 'PROJECTID/FILENAME'
      img_path := split_part(img_url, '/rfi-images/', 2);
      IF img_path IS NOT NULL AND img_path != '' THEN
        INSERT INTO public.storage_deletion_queue (file_path, bucket_id)
        VALUES (img_path, 'rfi-images');
      END IF;
    END LOOP;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enqueue_rfi_images_for_deletion ON public.rfis;
CREATE TRIGGER trg_enqueue_rfi_images_for_deletion
AFTER DELETE ON public.rfis
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_rfi_images_for_deletion();

-- 14. REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload schema';

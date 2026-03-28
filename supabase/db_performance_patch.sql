-- =====================================================================
-- PERFORMANCE & SECURITY PATCH — ClearLine Inspections
-- 1. Add updated_at to rfis for incremental sync capability
-- 2. Add REPLICA IDENTITY FULL for accurate Realtime DELETE events
-- 3. Add missing indexes on hot query columns
-- 4. Fix audit_log: block fake entries (enforce user_id = auth.uid())
-- 5. Revoke admin_delete_user from all authenticated users
-- 6. Fix rfi_start_number being ignored by serial generator
-- =====================================================================

-- ─── 1. Add updated_at to rfis ───────────────────────────────────────
ALTER TABLE public.rfis
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows
UPDATE public.rfis SET updated_at = created_at WHERE updated_at IS NULL;

-- Auto-maintain updated_at on every row change
CREATE OR REPLACE FUNCTION public.set_rfis_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rfis_updated_at ON public.rfis;
CREATE TRIGGER trg_rfis_updated_at
BEFORE UPDATE ON public.rfis
FOR EACH ROW EXECUTE FUNCTION public.set_rfis_updated_at();


-- ─── 2. REPLICA IDENTITY FULL ────────────────────────────────────────
-- Needed so DELETE events via Realtime include the full old row
-- (especially project_id for server-side channel filters)
ALTER TABLE public.rfis REPLICA IDENTITY FULL;


-- ─── 3. Indexes on hot columns ───────────────────────────────────────
-- rfis queries always filter by project_id — this is by far the most important
CREATE INDEX IF NOT EXISTS idx_rfis_project_id
    ON public.rfis (project_id);

-- Status filtering (pending/approved lists)
CREATE INDEX IF NOT EXISTS idx_rfis_project_status
    ON public.rfis (project_id, status);

-- User-specific queries (filed_by, assigned_to, reviewed_by)
CREATE INDEX IF NOT EXISTS idx_rfis_filed_by
    ON public.rfis (filed_by);

CREATE INDEX IF NOT EXISTS idx_rfis_assigned_to
    ON public.rfis (assigned_to);

-- Incremental sync: fetch only rows changed since last sync
CREATE INDEX IF NOT EXISTS idx_rfis_updated_at
    ON public.rfis (project_id, updated_at DESC);

-- Date ordering for carryover queries
CREATE INDEX IF NOT EXISTS idx_rfis_filed_date
    ON public.rfis (project_id, filed_date);

-- Notifications: user inbox queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON public.notifications (user_id, created_at DESC);

-- Audit log: RFI history lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_rfi_id
    ON public.audit_log (rfi_id, created_at DESC);

-- Comments: loading discussion threads
CREATE INDEX IF NOT EXISTS idx_comments_rfi_id
    ON public.comments (rfi_id, created_at ASC);


-- ─── 4. Audit log: block fake entries ────────────────────────────────
-- Any authenticated user could previously insert audit entries
-- impersonating other users. Now user_id must be the caller's own id.
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_log;
CREATE POLICY "Users can only log their own actions" ON public.audit_log
    FOR INSERT WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = auth.uid()
    );


-- ─── 5. Revoke admin_delete_user from all authenticated users ─────────
-- The function has an internal admin-check, but there's no reason
-- a contractor should even be able to call it.
REVOKE EXECUTE ON FUNCTION public.admin_delete_user(uuid) FROM authenticated;
-- Grant only to the service_role (called from server-side / edge functions)
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO service_role;


-- ─── 6. Fix rfi_start_number being ignored by serial generator ────────
-- Schema drift safety: add the column if it doesn't exist yet
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS rfi_start_number integer DEFAULT 1;

CREATE OR REPLACE FUNCTION public.generate_rfi_serial_no()
RETURNS trigger AS $$
DECLARE
  p_code         text;
  p_start_number integer;
  max_val        integer;
  parent_code    text;
BEGIN
  -- 1. Handle serial_no (per-day counter)
  IF NEW.serial_no IS NULL OR NEW.serial_no = 0 THEN
    SELECT COALESCE(MAX(serial_no), 0) + 1 INTO NEW.serial_no
    FROM public.rfis
    WHERE project_id = NEW.project_id AND filed_date = NEW.filed_date;
  END IF;

  -- 2. Handle rfi_no in custom_fields
  IF NEW.custom_fields IS NULL THEN NEW.custom_fields := '{}'::jsonb; END IF;

  IF NEW.custom_fields ->> 'rfi_no' IS NULL THEN
    -- Fetch project code and the admin-configured starting number
    SELECT code, COALESCE(rfi_start_number, 1)
    INTO p_code, p_start_number
    FROM public.projects WHERE id = NEW.project_id;

    p_code         := COALESCE(p_code, 'RFI');
    p_start_number := COALESCE(p_start_number, 1);

    IF NEW.parent_id IS NULL THEN
      -- Base RFI: start counting from rfi_start_number, never below it
      SELECT COALESCE(MAX((custom_fields->>'rfi_no_num')::integer), p_start_number - 1) + 1
      INTO max_val
      FROM public.rfis
      WHERE project_id = NEW.project_id AND parent_id IS NULL;

      max_val := GREATEST(max_val, p_start_number);

      NEW.custom_fields := jsonb_set(
        NEW.custom_fields, '{rfi_no}',
        to_jsonb(p_code || '-' || LPAD(max_val::text, 3, '0'))
      );
      NEW.custom_fields := jsonb_set(NEW.custom_fields, '{rfi_no_num}', to_jsonb(max_val));
    ELSE
      -- Revision: ParentCode-R1, ParentCode-R2, ...
      SELECT custom_fields->>'rfi_no' INTO parent_code FROM public.rfis WHERE id = NEW.parent_id;
      IF parent_code LIKE '%-R%' THEN
        NEW.custom_fields := jsonb_set(
          NEW.custom_fields, '{rfi_no}',
          to_jsonb(split_part(parent_code, '-R', 1) || '-R' ||
                   (split_part(parent_code, '-R', 2)::integer + 1))
        );
      ELSE
        NEW.custom_fields := jsonb_set(NEW.custom_fields, '{rfi_no}', to_jsonb(parent_code || '-R1'));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Reload schema cache
NOTIFY pgrst, 'reload schema';

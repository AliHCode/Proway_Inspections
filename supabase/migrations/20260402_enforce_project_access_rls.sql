-- =====================================================================
-- PROJECT ACCESS ENFORCEMENT
-- Hard-block operational data access when a project is locked or expired.
-- Support/profile metadata can still load through projects/project_members,
-- but RFIs, comments, reviews, notifications, audit rows, and scanned docs
-- are now protected by backend RLS instead of frontend routing alone.
-- =====================================================================

-- Notifications need a project binding so RLS can enforce access even when
-- a notification is not attached to a specific RFI (for example bulk assign).
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_project_created
  ON public.notifications(user_id, project_id, created_at DESC);

UPDATE public.notifications n
SET project_id = r.project_id
FROM public.rfis r
WHERE n.project_id IS NULL
  AND n.rfi_id = r.id;

CREATE OR REPLACE FUNCTION public.notifications_apply_project_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.project_id IS NULL AND NEW.rfi_id IS NOT NULL THEN
    SELECT project_id
    INTO NEW.project_id
    FROM public.rfis
    WHERE id = NEW.rfi_id;
  END IF;

  IF NEW.rfi_id IS NOT NULL THEN
    PERFORM 1
    FROM public.rfis
    WHERE id = NEW.rfi_id
      AND project_id = NEW.project_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Notification project_id must match the RFI project.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_apply_project_id ON public.notifications;
CREATE TRIGGER trg_notifications_apply_project_id
BEFORE INSERT OR UPDATE ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.notifications_apply_project_id();

CREATE OR REPLACE FUNCTION public.is_project_member(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.project_members pm
        WHERE pm.project_id = p_id
          AND pm.user_id = auth.uid()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_project_accessible(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  project_record public.projects%ROWTYPE;
BEGIN
  IF p_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT *
  INTO project_record
  FROM public.projects
  WHERE id = p_id
  LIMIT 1;

  IF project_record.id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(project_record.is_locked, false) THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(project_record.subscription_status, 'trial') = 'expired' THEN
    RETURN FALSE;
  END IF;

  IF project_record.subscription_end IS NOT NULL
     AND project_record.subscription_end < now() THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_access_project_data(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_project_member(p_id) AND public.is_project_accessible(p_id);
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_file_project_rfis(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  membership_record public.project_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  IF NOT public.is_project_accessible(p_id) THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO membership_record
  FROM public.project_members
  WHERE project_id = p_id
    AND user_id = auth.uid()
  LIMIT 1;

  IF membership_record.user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF membership_record.role <> 'contractor' THEN
    RETURN FALSE;
  END IF;

  RETURN COALESCE(membership_record.can_file_rfis, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_review_project_rfis(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  membership_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  IF NOT public.is_project_accessible(p_id) THEN
    RETURN FALSE;
  END IF;

  SELECT pm.role
  INTO membership_role
  FROM public.project_members pm
  WHERE pm.project_id = p_id
    AND pm.user_id = auth.uid()
  LIMIT 1;

  RETURN membership_role = 'consultant';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_participate_in_project_discussion(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  membership_record public.project_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  IF NOT public.is_project_accessible(p_id) THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO membership_record
  FROM public.project_members
  WHERE project_id = p_id
    AND user_id = auth.uid()
  LIMIT 1;

  IF membership_record.user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF membership_record.role = 'consultant' THEN
    RETURN TRUE;
  END IF;

  IF membership_record.role = 'contractor' THEN
    RETURN COALESCE(membership_record.can_discuss_rfis, true);
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_upload_rfi_scanned_documents(target_rfi_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  target_rfi public.rfis%ROWTYPE;
  membership_record public.project_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT *
  INTO target_rfi
  FROM public.rfis
  WHERE id = target_rfi_id
  LIMIT 1;

  IF target_rfi.id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT public.is_project_accessible(target_rfi.project_id) THEN
    RETURN FALSE;
  END IF;

  IF target_rfi.status NOT IN ('approved', 'conditional_approve') THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO membership_record
  FROM public.project_members
  WHERE project_id = target_rfi.project_id
    AND user_id = auth.uid()
  LIMIT 1;

  IF membership_record.user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF membership_record.role <> 'contractor' THEN
    RETURN FALSE;
  END IF;

  RETURN COALESCE(membership_record.can_manage_contractor_permissions, false)
    OR COALESCE(membership_record.can_upload_rfi_archive, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_manage_rfi(
  target_rfi_id uuid,
  target_project_id uuid,
  target_filed_by uuid,
  target_assigned_to uuid,
  target_reviewed_by uuid,
  target_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  membership_record public.project_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  IF NOT public.is_project_accessible(target_project_id) THEN
    RETURN FALSE;
  END IF;

  SELECT *
  INTO membership_record
  FROM public.project_members
  WHERE project_id = target_project_id
    AND user_id = auth.uid()
  LIMIT 1;

  IF membership_record.user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF membership_record.role = 'consultant' THEN
    RETURN TRUE;
  END IF;

  IF membership_record.role = 'contractor' THEN
    RETURN target_filed_by = auth.uid()
      AND COALESCE(membership_record.can_file_rfis, true);
  END IF;

  RETURN FALSE;
END;
$$;

ALTER TABLE IF EXISTS public.rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rfi_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rfi_scanned_documents ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname, schemaname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'rfis',
        'comments',
        'rfi_reviews',
        'notifications',
        'audit_log',
        'rfi_scanned_documents'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  END LOOP;
END;
$$;

-- RFIs
CREATE POLICY "Accessible project members can view RFIs"
ON public.rfis
FOR SELECT
USING (
  public.can_current_user_access_project_data(project_id)
);

CREATE POLICY "Accessible users can create RFIs"
ON public.rfis
FOR INSERT
WITH CHECK (
  public.can_current_user_file_project_rfis(project_id)
);

CREATE POLICY "Accessible users can update permitted RFIs"
ON public.rfis
FOR UPDATE
USING (
  public.can_current_user_manage_rfi(
    id,
    project_id,
    filed_by,
    assigned_to,
    reviewed_by,
    status
  )
)
WITH CHECK (
  public.can_current_user_manage_rfi(
    id,
    project_id,
    filed_by,
    assigned_to,
    reviewed_by,
    status
  )
);

CREATE POLICY "Accessible users can delete permitted RFIs"
ON public.rfis
FOR DELETE
USING (
  public.is_admin()
  OR (
    public.is_project_accessible(project_id)
    AND filed_by = auth.uid()
    AND public.can_current_user_file_project_rfis(project_id)
  )
);

-- Comments
CREATE POLICY "Accessible users can view comments"
ON public.comments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.can_current_user_access_project_data(r.project_id)
  )
);

CREATE POLICY "Accessible users can insert comments"
ON public.comments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.can_current_user_participate_in_project_discussion(r.project_id)
  )
);

CREATE POLICY "Accessible users can update own comments"
ON public.comments
FOR UPDATE
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.can_current_user_participate_in_project_discussion(r.project_id)
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.can_current_user_participate_in_project_discussion(r.project_id)
  )
);

CREATE POLICY "Accessible users can delete own comments"
ON public.comments
FOR DELETE
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = comments.rfi_id
      AND public.can_current_user_participate_in_project_discussion(r.project_id)
  )
);

-- Internal consultant reviews
CREATE POLICY "Accessible users can view rfi reviews"
ON public.rfi_reviews
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = rfi_reviews.rfi_id
      AND public.can_current_user_access_project_data(r.project_id)
  )
);

CREATE POLICY "Accessible consultants can insert rfi reviews"
ON public.rfi_reviews
FOR INSERT
WITH CHECK (
  auth.uid() = reviewer_id
  AND EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = rfi_reviews.rfi_id
      AND public.can_current_user_review_project_rfis(r.project_id)
  )
);

-- Notifications
CREATE POLICY "Users can view accessible notifications"
ON public.notifications
FOR SELECT
USING (
  auth.uid() = user_id
  AND (
    project_id IS NULL
    OR public.can_current_user_access_project_data(project_id)
  )
);

CREATE POLICY "Users can update accessible notifications"
ON public.notifications
FOR UPDATE
USING (
  auth.uid() = user_id
  AND (
    project_id IS NULL
    OR public.can_current_user_access_project_data(project_id)
  )
)
WITH CHECK (
  auth.uid() = user_id
  AND (
    project_id IS NULL
    OR public.can_current_user_access_project_data(project_id)
  )
);

CREATE POLICY "Users can delete accessible notifications"
ON public.notifications
FOR DELETE
USING (
  auth.uid() = user_id
  AND (
    project_id IS NULL
    OR public.can_current_user_access_project_data(project_id)
  )
);

CREATE POLICY "Accessible members can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    (
      public.is_admin()
      AND (
        project_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.projects p
          WHERE p.id = notifications.project_id
        )
      )
    )
    OR (
      project_id IS NOT NULL
      AND public.can_current_user_access_project_data(project_id)
      AND EXISTS (
        SELECT 1
        FROM public.project_members pm_target
        WHERE pm_target.project_id = notifications.project_id
          AND pm_target.user_id = notifications.user_id
      )
    )
  )
  AND (
    rfi_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.rfis r
      WHERE r.id = notifications.rfi_id
        AND r.project_id = notifications.project_id
    )
  )
);

-- Audit log
CREATE POLICY "Users can insert accessible audit logs"
ON public.audit_log
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
  AND (
    rfi_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.rfis r
      WHERE r.id = audit_log.rfi_id
        AND public.can_current_user_access_project_data(r.project_id)
    )
  )
);

CREATE POLICY "Users can view accessible audit logs"
ON public.audit_log
FOR SELECT
USING (
  public.is_admin()
  OR (
    user_id = auth.uid()
    AND (
      rfi_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.rfis r
        WHERE r.id = audit_log.rfi_id
          AND public.can_current_user_access_project_data(r.project_id)
      )
    )
  )
  OR EXISTS (
    SELECT 1
    FROM public.rfis r
    WHERE r.id = audit_log.rfi_id
      AND public.can_current_user_access_project_data(r.project_id)
      AND (
        r.filed_by = auth.uid()
        OR r.assigned_to = auth.uid()
        OR r.reviewed_by = auth.uid()
      )
  )
);

-- Scanned documents
CREATE POLICY "Accessible members can view scanned docs"
ON public.rfi_scanned_documents
FOR SELECT
USING (
  public.can_current_user_access_project_data(project_id)
);

CREATE POLICY "Accessible contractors can insert scanned docs"
ON public.rfi_scanned_documents
FOR INSERT
WITH CHECK (
  auth.uid() = uploaded_by
  AND public.can_current_user_access_project_data(project_id)
  AND EXISTS (
    SELECT 1
    FROM public.rfis
    WHERE id = rfi_scanned_documents.rfi_id
      AND project_id = rfi_scanned_documents.project_id
  )
  AND public.can_current_user_upload_rfi_scanned_documents(rfi_id)
);

CREATE POLICY "Accessible users can delete scanned docs"
ON public.rfi_scanned_documents
FOR DELETE
USING (
  public.is_admin()
  OR public.can_current_user_upload_rfi_scanned_documents(rfi_id)
);

NOTIFY pgrst, 'reload schema';

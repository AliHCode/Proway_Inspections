ALTER TABLE public.project_members
ADD COLUMN IF NOT EXISTS can_file_rfis boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_discuss_rfis boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS can_manage_contractor_permissions boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_current_user_file_project_rfis(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  membership_record public.project_members%ROWTYPE;
BEGIN
  IF public.is_admin() THEN
    RETURN TRUE;
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

CREATE OR REPLACE FUNCTION public.can_current_user_participate_in_project_discussion(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  membership_record public.project_members%ROWTYPE;
BEGIN
  IF public.is_admin() THEN
    RETURN TRUE;
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

CREATE OR REPLACE FUNCTION public.update_project_contractor_permissions(
  target_project_id uuid,
  target_user_id uuid,
  next_can_file_rfis boolean,
  next_can_discuss_rfis boolean
)
RETURNS public.project_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    WHERE project_id = target_project_id
      AND user_id = auth.uid()
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
  WHERE project_id = target_project_id
    AND user_id = target_user_id
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
    can_discuss_rfis = COALESCE(next_can_discuss_rfis, can_discuss_rfis)
  WHERE id = target_membership.id
  RETURNING * INTO updated_membership;

  RETURN updated_membership;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_project_contractor_permissions(uuid, uuid, boolean, boolean) TO authenticated;

DROP POLICY IF EXISTS "Members can create RFIs" ON public.rfis;
CREATE POLICY "Members can create RFIs" ON public.rfis
    FOR INSERT WITH CHECK (
        public.can_current_user_file_project_rfis(project_id)
        AND public.is_project_accessible(project_id)
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
        filed_by = auth.uid()
        AND public.can_current_user_file_project_rfis(project_id)
        AND public.is_project_accessible(project_id)
    );

DROP POLICY IF EXISTS "Comments assignment-aware select" ON public.comments;
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

DROP POLICY IF EXISTS "Comments assignment-aware insert" ON public.comments;
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

DROP POLICY IF EXISTS "Comments assignment-aware update" ON public.comments;
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

DROP POLICY IF EXISTS "Comments assignment-aware delete" ON public.comments;
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

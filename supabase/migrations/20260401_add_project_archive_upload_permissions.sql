ALTER TABLE public.project_members
ADD COLUMN IF NOT EXISTS can_upload_rfi_archive boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_current_user_upload_rfi_scanned_documents(target_rfi_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.update_project_contractor_permissions(
  target_project_id uuid,
  target_user_id uuid,
  next_can_file_rfis boolean,
  next_can_discuss_rfis boolean,
  next_can_upload_rfi_archive boolean
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
    can_discuss_rfis = COALESCE(next_can_discuss_rfis, can_discuss_rfis),
    can_upload_rfi_archive = COALESCE(next_can_upload_rfi_archive, can_upload_rfi_archive)
  WHERE id = target_membership.id
  RETURNING * INTO updated_membership;

  RETURN updated_membership;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_project_contractor_permissions(uuid, uuid, boolean, boolean, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

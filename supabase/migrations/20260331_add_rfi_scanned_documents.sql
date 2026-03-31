CREATE TABLE IF NOT EXISTS public.rfi_scanned_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  rfi_id uuid NOT NULL REFERENCES public.rfis(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
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

ALTER TABLE public.rfi_scanned_documents ENABLE ROW LEVEL SECURITY;

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

  RETURN target_rfi.filed_by = auth.uid()
    OR COALESCE(membership_record.can_manage_contractor_permissions, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_current_user_upload_rfi_scanned_documents(uuid) TO authenticated;

DROP POLICY IF EXISTS "Project members view scanned docs" ON public.rfi_scanned_documents;
CREATE POLICY "Project members view scanned docs" ON public.rfi_scanned_documents
  FOR SELECT
  USING (
    public.is_project_member(project_id)
    AND public.is_project_accessible(project_id)
  );

DROP POLICY IF EXISTS "Eligible contractors insert scanned docs" ON public.rfi_scanned_documents;
CREATE POLICY "Eligible contractors insert scanned docs" ON public.rfi_scanned_documents
  FOR INSERT
  WITH CHECK (
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
  FOR DELETE
  USING (
    public.is_admin()
    OR public.can_current_user_upload_rfi_scanned_documents(rfi_id)
  );

NOTIFY pgrst, 'reload schema';

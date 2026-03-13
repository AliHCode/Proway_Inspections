-- Restrict consultant update scope on RFIs to remarks/images/decision metadata.
-- Run this migration on existing environments.

CREATE OR REPLACE FUNCTION public.enforce_consultant_rfi_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text;
BEGIN
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.role INTO actor_role
  FROM public.profiles p
  WHERE p.id = actor_id;

  IF actor_role IS DISTINCT FROM 'consultant' THEN
    RETURN NEW;
  END IF;

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

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Consultants can only set status to approved or rejected.';
  END IF;

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

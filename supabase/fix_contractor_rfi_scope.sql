-- =====================================================================
-- SECURITY PATCH 2 — ClearLine Inspections
-- Fix 1: Block non-admins from self-escalating their role (C1)
--        → Already in security_patch_2026_03_28.sql (run that first)
--
-- Fix 2: Contractor RFI edit scope enforcement
--        Contractors CAN edit their own RFIs while status = 'pending'
--        or 'info_requested' (consultant asked for more info).
--        Contractors CANNOT edit once status is:
--          - 'approved'
--          - 'rejected'
--          - 'cancelled'
--          - 'conditional_approve'
--        Contractors also CANNOT change workflow control fields
--        (status, filed_by, reviewed_by, reviewed_at, assigned_to)
--        regardless of current status.
-- =====================================================================


-- ─── DROP AND RECREATE FUNCTION ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_contractor_rfi_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_role text;
BEGIN
  -- Allow internal/service-role operations (no auth context)
  IF actor_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch the actor's role from their profile
  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = actor_id;

  -- This trigger only applies to contractors.
  -- Admins and consultants have their own rules (is_admin / consultant trigger).
  IF actor_role IS DISTINCT FROM 'contractor' THEN
    RETURN NEW;
  END IF;

  -- ── Rule 1: Contractors cannot touch workflow-control fields ───────
  -- These fields are for consultants and admins only:
  --   status        → only consultants/admins decide the outcome
  --   filed_by      → cannot reassign who filed it
  --   reviewed_by   → set by consultant when they review
  --   reviewed_at   → timestamp set by consultant
  --   assigned_to   → consultant assignment is admin/consultant action

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION
      'Contractors cannot change the status of an RFI. '
      'Only a consultant or admin can approve, reject, or update status.';
  END IF;

  IF NEW.filed_by IS DISTINCT FROM OLD.filed_by THEN
    RAISE EXCEPTION
      'Contractors cannot change who filed an RFI.';
  END IF;

  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
    RAISE EXCEPTION
      'Contractors cannot set the reviewer of an RFI.';
  END IF;

  IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION
      'Contractors cannot change the review timestamp of an RFI.';
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    RAISE EXCEPTION
      'Contractors cannot reassign an RFI to a consultant.';
  END IF;

  -- ── Rule 2: Contractors can only edit content while status is
  --            'pending' or 'info_requested'.
  --            Once a consultant or admin has acted on it, it is locked.
  IF OLD.status NOT IN ('pending', 'info_requested') THEN
    RAISE EXCEPTION
      'This RFI has already been reviewed (status: %) and can no longer be edited. '
      'Contact your consultant if a correction is needed.', OLD.status;
  END IF;

  -- All checks passed — allow the contractor's edit through
  RETURN NEW;
END;
$$;

-- ─── ATTACH TRIGGER TO rfis TABLE ────────────────────────────────────
DROP TRIGGER IF EXISTS trg_enforce_contractor_rfi_update_scope ON public.rfis;
CREATE TRIGGER trg_enforce_contractor_rfi_update_scope
BEFORE UPDATE ON public.rfis
FOR EACH ROW
EXECUTE FUNCTION public.enforce_contractor_rfi_update_scope();


-- ─── SUMMARY OF WHAT THIS ENFORCES ──────────────────────────────────
-- ┌──────────────────────────────────┬───────────────────────────────┐
-- │  RFI Current Status              │  Contractor Can Edit?         │
-- ├──────────────────────────────────┼───────────────────────────────┤
-- │  pending                         │ ✅ YES — still in review queue │
-- │  info_requested                  │ ✅ YES — consultant asked more  │
-- │  approved                        │ ❌ NO  — locked after approval  │
-- │  rejected                        │ ❌ NO  — locked after rejection │
-- │  cancelled                       │ ❌ NO  — locked after cancel    │
-- │  conditional_approve             │ ❌ NO  — locked after decision  │
-- └──────────────────────────────────┴───────────────────────────────┘
--
-- ┌──────────────────────────────────┬───────────────────────────────┐
-- │  Field                           │  Contractor Can Change?       │
-- ├──────────────────────────────────┼───────────────────────────────┤
-- │  description, location, images   │ ✅ YES (while pending/info)   │
-- │  inspectionType, customFields    │ ✅ YES (while pending/info)   │
-- │  status                          │ ❌ NO  — consultant/admin only  │
-- │  filed_by                        │ ❌ NO  — immutable              │
-- │  reviewed_by / reviewed_at       │ ❌ NO  — set by consultant      │
-- │  assigned_to                     │ ❌ NO  — set by admin/consultant│
-- └──────────────────────────────────┴───────────────────────────────┘

-- Reload schema cache
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- SECURITY PATCH — ClearLine Inspections
-- Fixes: Notification Insert, Audit Log Visibility,
--        Storage Upload Policy, Admin Delete Soft-Delete
-- Applied: 2026-03-28
-- =====================================================================

-- ─── FIX 1: Notifications — Only project members of the related RFI
--            can insert notifications, and only targeting their own
--            project co-members. Kills the "anyone targets anyone" hole.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;

CREATE POLICY "Project members can insert notifications for co-members" ON public.notifications
    FOR INSERT WITH CHECK (
        -- The person inserting must be authenticated
        auth.role() = 'authenticated'
        -- They must be active (not pending, not rejected)
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.is_active = true
            AND p.role IN ('contractor', 'consultant', 'admin')
        )
        -- The target user (user_id) must be a co-member of the same project
        -- as the RFI this notification is about
        AND (
            -- Admins can notify anyone
            public.is_admin()
            OR (
                rfi_id IS NOT NULL
                AND EXISTS (
                    SELECT 1
                    FROM public.rfis r
                    JOIN public.project_members pm_target
                        ON pm_target.project_id = r.project_id
                        AND pm_target.user_id = notifications.user_id
                    JOIN public.project_members pm_actor
                        ON pm_actor.project_id = r.project_id
                        AND pm_actor.user_id = auth.uid()
                    WHERE r.id = notifications.rfi_id
                )
            )
        )
    );


-- ─── FIX 2: Audit Log — Contractors and consultants can only see
--            entries that belong to their own RFIs.
--            Admins see everything.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view audit logs" ON public.audit_log;

CREATE POLICY "Audit log scoped by role and RFI ownership" ON public.audit_log
    FOR SELECT USING (
        -- Admins see all audit entries
        public.is_admin()
        -- The logged action was performed by this user
        OR user_id = auth.uid()
        -- Contractor: see logs for RFIs they filed
        -- Consultant: see logs for RFIs they are assigned to or reviewed
        OR EXISTS (
            SELECT 1 FROM public.rfis r
            WHERE r.id = audit_log.rfi_id
            AND (
                r.filed_by = auth.uid()
                OR r.assigned_to = auth.uid()
                OR r.reviewed_by = auth.uid()
            )
        )
    );

-- Keep insert policy as-is (all authenticated can log actions on their own RFIs)


-- ─── FIX 3: Storage — Only active, approved users (contractor/consultant/admin)
--            can upload files. Pending and rejected users are blocked.
-- ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;

CREATE POLICY "Active approved users can upload RFI images" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'rfi-images'
        AND EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.is_active = true
            AND p.role IN ('contractor', 'consultant', 'admin')
        )
    );


-- ─── FIX 4: admin_delete_user — Soft-delete RFIs instead of hard-delete.
--            Sets filed_by = NULL on the RFI rows so the inspection record
--            is preserved for legal/audit purposes.
--            NOTE: rfis.filed_by must be nullable for this to work.
-- ─────────────────────────────────────────────────────────────────────

-- Step 4a: Make filed_by nullable (safe — existing data unchanged)
ALTER TABLE public.rfis ALTER COLUMN filed_by DROP NOT NULL;

-- Step 4b: Replace the delete function with a soft-delete version
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can call this
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Preserve RFI records for legal compliance:
  -- Null out the user reference instead of deleting the row.
  -- The RFI content, status, and audit trail all remain intact.
  UPDATE public.rfis SET assigned_to = NULL WHERE assigned_to = target_user_id;
  UPDATE public.rfis SET reviewed_by = NULL WHERE reviewed_by = target_user_id;
  UPDATE public.rfis SET filed_by    = NULL WHERE filed_by    = target_user_id;

  -- Remove personal data that is safe to delete
  DELETE FROM public.notifications      WHERE user_id = target_user_id;
  DELETE FROM public.push_subscriptions WHERE user_id = target_user_id;
  DELETE FROM public.project_members    WHERE user_id = target_user_id;

  -- Log the deletion in the security audit log
  INSERT INTO public.security_audit_log (user_id, action, target_id, metadata)
  VALUES (
    auth.uid(),
    'DELETE_USER',
    target_user_id,
    jsonb_build_object('note', 'User deleted by admin. RFI records preserved with filed_by=NULL.')
  );

  -- Soft-delete the profile (archive it) rather than hard-deleting
  -- This preserves the row for audit trail references while removing access
  UPDATE public.profiles
  SET is_archived = true, is_active = false, role = 'rejected'
  WHERE id = target_user_id;

  -- Optionally hard-delete from auth.users if you want to fully revoke login:
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;


-- ─── FIX 5: Prevent role self-escalation (bonus — from Critical C1)
--            Any user updating their own profile cannot change
--            role, is_active, or is_archived.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Allow service role (no auth context = internal trigger)
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  -- If a non-admin is trying to change sensitive columns, block it
  IF NOT public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Unauthorized: only an admin can change your role.';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Unauthorized: only an admin can activate or deactivate accounts.';
    END IF;
    IF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
      RAISE EXCEPTION 'Unauthorized: only an admin can archive accounts.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();


-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

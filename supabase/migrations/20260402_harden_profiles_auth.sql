-- =====================================================================
-- Profiles RLS + auth hardening
-- - Locks down public.profiles in Supabase
-- - Lets users read their own profile and teammate profiles only
-- - Prevents non-admin users from changing sensitive profile fields
-- - Keeps self-service profile creation limited to pending/self rows
-- =====================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.role = 'admin'
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_view_profile(target_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF auth.uid() = target_user_id THEN
    RETURN TRUE;
  END IF;

  IF public.current_user_is_admin() THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.project_members my_membership
    JOIN public.project_members target_membership
      ON target_membership.project_id = my_membership.project_id
    WHERE my_membership.user_id = auth.uid()
      AND target_membership.user_id = target_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_profile_write_guards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF public.current_user_is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'You can only create your own profile row.';
    END IF;

    NEW.role := 'pending';
    NEW.current_project_id := NULL;
    NEW.current_session_id := NULL;
    NEW.is_active := COALESCE(NEW.is_active, true);
    NEW.is_archived := COALESCE(NEW.is_archived, false);
    RETURN NEW;
  END IF;

  IF OLD.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only update your own profile.';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Profile identity cannot be changed.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Role can only be changed by an administrator.';
  END IF;

  IF COALESCE(NEW.is_active, true) IS DISTINCT FROM COALESCE(OLD.is_active, true) THEN
    RAISE EXCEPTION 'Activation state can only be changed by an administrator.';
  END IF;

  IF COALESCE(NEW.is_archived, false) IS DISTINCT FROM COALESCE(OLD.is_archived, false) THEN
    RAISE EXCEPTION 'Archive state can only be changed by an administrator.';
  END IF;

  IF NEW.current_project_id IS DISTINCT FROM OLD.current_project_id THEN
    IF NEW.current_project_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.project_members pm
      WHERE pm.project_id = NEW.current_project_id
        AND pm.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'You can only switch to a project you are assigned to.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_enforce_profile_write_guards ON public.profiles;
CREATE TRIGGER trg_enforce_profile_write_guards
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_profile_write_guards();

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', policy_record.policyname);
  END LOOP;
END;
$$;

CREATE POLICY "Admins can manage all profiles"
ON public.profiles
FOR ALL
USING (public.current_user_is_admin())
WITH CHECK (public.current_user_is_admin());

CREATE POLICY "Users can view visible profiles"
ON public.profiles
FOR SELECT
USING (public.can_current_user_view_profile(id));

CREATE POLICY "Users can create own profile row"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

NOTIFY pgrst, 'reload schema';

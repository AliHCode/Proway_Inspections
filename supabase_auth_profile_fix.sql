-- Ensure profiles.role allows pending users.
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('contractor', 'consultant', 'admin', 'pending'));

ALTER TABLE public.profiles
ALTER COLUMN role SET DEFAULT 'pending';

-- Backfill missing profile rows for existing auth users.
INSERT INTO public.profiles (id, name, role, company)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data ->> 'name', split_part(au.email, '@', 1), 'New User') AS name,
  'pending' AS role,
  COALESCE(au.raw_user_meta_data ->> 'company', '') AS company
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- Auto-create profile rows when new auth users are created.
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

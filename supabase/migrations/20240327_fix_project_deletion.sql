-- Migration: Fix project deletion foreign key constraints
-- This ensures that deleting a project also cleans up its members, RFIs, and unlinks it from profiles.

-- 1. Profiles (SET NULL)
-- We don't want to delete the user just because a project is deleted.
-- We only want to clear their "active project" selection.
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_current_project_id_fkey,
ADD CONSTRAINT profiles_current_project_id_fkey 
  FOREIGN KEY (current_project_id) 
  REFERENCES public.projects(id) 
  ON DELETE SET NULL;

-- 2. Project Members (CASCADE)
-- If a project is deleted, the membership records for that project are no longer needed.
ALTER TABLE public.project_members
DROP CONSTRAINT IF EXISTS project_members_project_id_fkey,
ADD CONSTRAINT project_members_project_id_fkey 
  FOREIGN KEY (project_id) 
  REFERENCES public.projects(id) 
  ON DELETE CASCADE;

-- 3. RFIs (CASCADE)
-- If a project is deleted, all its RFIs should be deleted too.
ALTER TABLE public.rfis
DROP CONSTRAINT IF EXISTS rfis_project_id_fkey,
ADD CONSTRAINT rfis_project_id_fkey 
  FOREIGN KEY (project_id) 
  REFERENCES public.projects(id) 
  ON DELETE CASCADE;

-- 4. Notifications (CASCADE)
-- Notifications are linked to RFIs. If an RFI is deleted, the notification should be too.
-- Note: The constraint name might vary, but standard and likely is notifications_rfi_id_fkey
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_rfi_id_fkey,
ADD CONSTRAINT notifications_rfi_id_fkey 
  FOREIGN KEY (rfi_id) 
  REFERENCES public.rfis(id) 
  ON DELETE CASCADE;

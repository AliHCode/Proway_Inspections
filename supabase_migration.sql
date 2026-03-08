-- 1. Create Projects Table (if not exists)
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Insert Default Project
INSERT INTO public.projects (id, name, description) 
VALUES ('00000000-0000-0000-0000-000000000000', 'Default General Project', 'System generated default project')
ON CONFLICT (id) DO NOTHING;

-- 2. Alter Profiles Table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS current_project_id uuid REFERENCES public.projects(id) DEFAULT '00000000-0000-0000-0000-000000000000';

-- 3. Alter RFIs Table
ALTER TABLE public.rfis 
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) DEFAULT '00000000-0000-0000-0000-000000000000',
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS carryover_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS carryover_to date;

-- 4. Projects RLS Policies
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Projects viewable by authenticated" ON public.projects;
CREATE POLICY "Projects viewable by authenticated" ON public.projects FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated can insert Projects" ON public.projects;
CREATE POLICY "Authenticated can insert Projects" ON public.projects FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 5. Reload the Schema Cache so the API immediately sees the new columns
NOTIFY pgrst, 'reload schema';

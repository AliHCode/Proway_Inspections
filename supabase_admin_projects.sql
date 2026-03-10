-- ==========================================
-- Admin Project Management Migration
-- Custom RFI fields + Project Members
-- ==========================================

-- 1. PROJECT_FIELDS: Admin-defined custom columns per project
CREATE TABLE IF NOT EXISTS public.project_fields (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  field_name text NOT NULL,
  field_key text NOT NULL,
  field_type text CHECK (field_type IN ('text', 'number', 'select', 'date', 'textarea')) DEFAULT 'text',
  options jsonb DEFAULT '[]'::jsonb,
  is_required boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(project_id, field_key)
);

-- 2. PROJECT_MEMBERS: Admin assigns users to projects with roles
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role text CHECK (role IN ('contractor', 'consultant', 'admin')) NOT NULL,
  assigned_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(project_id, user_id)
);

-- 3. Add custom_fields JSONB column to rfis table (stores values for custom fields)
ALTER TABLE public.rfis
ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb;

-- 4. Add description column to projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS description text;

-- 5. RLS Policies

-- project_fields
ALTER TABLE public.project_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project fields viewable by authenticated" ON public.project_fields;
CREATE POLICY "Project fields viewable by authenticated" ON public.project_fields
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage project fields" ON public.project_fields;
CREATE POLICY "Admins can manage project fields" ON public.project_fields
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- project_members
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project members viewable by authenticated" ON public.project_members;
CREATE POLICY "Project members viewable by authenticated" ON public.project_members
FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admins can manage project members" ON public.project_members;
CREATE POLICY "Admins can manage project members" ON public.project_members
FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 6. Seed default fields for the Default General Project
INSERT INTO public.project_fields (project_id, field_name, field_key, field_type, is_required, sort_order)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'Description', 'description', 'text', true, 1),
  ('00000000-0000-0000-0000-000000000000', 'Location', 'location', 'text', true, 2),
  ('00000000-0000-0000-0000-000000000000', 'Inspection Type', 'inspection_type', 'select', true, 3)
ON CONFLICT (project_id, field_key) DO NOTHING;

-- Add pre-defined options for inspection_type
UPDATE public.project_fields
SET options = '["Structural","MEP","Electrical","Plumbing","Finishing","Landscaping","Civil","HVAC","Fire Safety","Other"]'::jsonb
WHERE field_key = 'inspection_type' AND project_id = '00000000-0000-0000-0000-000000000000';

-- 7. Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- ==========================================
-- ClearLine Inspections - Complete Database Schema
-- Consolidated for Phase 6 Production Ready
-- ==========================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PROJECTS TABLE
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

-- 3. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users NOT NULL PRIMARY KEY,
  name text,
  role text CHECK (role IN ('contractor', 'consultant', 'admin')),
  company text,
  is_active boolean DEFAULT true,
  current_project_id uuid REFERENCES public.projects(id) DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. RFIs TABLE
CREATE TABLE IF NOT EXISTS public.rfis (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  serial_no integer NOT NULL,
  project_id uuid REFERENCES public.projects(id) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  description text NOT NULL,
  location text NOT NULL,
  inspection_type text NOT NULL,
  filed_by uuid REFERENCES public.profiles(id) NOT NULL,
  filed_date date NOT NULL,
  original_filed_date date NOT NULL,
  status text CHECK (status IN ('pending', 'approved', 'rejected', 'info_requested')) DEFAULT 'pending',
  assigned_to uuid REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamp with time zone,
  remarks text,
  images text[] DEFAULT ARRAY[]::text[],
  carryover_count integer DEFAULT 0,
  carryover_to date,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. COMMENTS TABLE
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  details jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Projects Policies
CREATE POLICY "Projects viewable by authenticated" ON public.projects FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated can insert Projects" ON public.projects FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Profiles Policies
CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- RFIs Policies
CREATE POLICY "RFIs viewable by authenticated" ON public.rfis FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Contractors can insert RFIs" ON public.rfis FOR INSERT WITH CHECK (auth.uid() = filed_by);
CREATE POLICY "Authenticated users can update RFIs" ON public.rfis FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Contractors can delete own pending RFIs" ON public.rfis FOR DELETE USING (auth.uid() = filed_by AND status = 'pending');

-- Comments Policies
CREATE POLICY "Comments viewable by authenticated" ON public.comments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Notifications Policies
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Audit Log Policies
CREATE POLICY "Authenticated users can view audit logs" ON public.audit_log FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_log FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 9. STORAGE POLICIES (Bucket 'rfi-images' must exist)
-- These are applied to storage.objects, but bucket creation is usually via UI or API.
CREATE POLICY "Authenticated users can upload images" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND bucket_id = 'rfi-images');
CREATE POLICY "Authenticated users can view images" ON storage.objects
  FOR SELECT USING (auth.role() = 'authenticated' AND bucket_id = 'rfi-images');
CREATE POLICY "Users can delete their own images" ON storage.objects
  FOR DELETE USING (auth.uid() = owner AND bucket_id = 'rfi-images');

-- 10. REALTIME PUBLICATION
-- Try to drop and recreate for a clean start
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE 
  public.rfis, 
  public.comments, 
  public.notifications, 
  public.audit_log;

-- Phase 5 DB Migration Script
-- Run this in your Supabase SQL Editor

-- 1. Create Comments Table
CREATE TABLE public.comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Notifications Table
CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  rfi_id uuid REFERENCES public.rfis(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Update RFIs Table (Add Assignment Column)
ALTER TABLE public.rfis ADD COLUMN assigned_to uuid REFERENCES public.profiles(id);

-- 4. Enable RLS and Realtime
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Comments Policies
CREATE POLICY "Comments viewable by authenticated" ON public.comments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can insert comments" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Notifications Policies
CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Add to realtime publication
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notifications;

-- IMPORTANT MANUAL STEP:
-- In your Supabase Dashboard -> Table Editor -> rfis -> edit the 'status' column.
-- If there is a CHECK constraint (e.g., status IN ('pending', 'approved', 'rejected')), 
-- update it to include 'info_requested'.

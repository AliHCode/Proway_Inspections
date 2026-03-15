-- Adds the missing 'code' column to the 'projects' table for admin RFI prefixes
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS code text;

-- Refresh the schema cache so Supabase API picks up the new column immediately
NOTIFY pgrst, 'reload schema';

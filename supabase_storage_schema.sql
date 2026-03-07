-- 6. Storage Schema Updates for Photo Attachments

-- Add an array of image URLs to the RFIs table
ALTER TABLE public.rfis ADD COLUMN IF NOT EXISTS images text[] DEFAULT ARRAY[]::text[];

-- NOTE: You will also need to create a storage bucket named "rfi-images" in your Supabase Dashboard.
-- We can create the policies for it here, but the bucket itself usually needs to be created via 
-- the UI or the Supabase Storage API directly.

-- Assuming the bucket "rfi-images" is created, here are the secure policies for it over the `storage.objects` table:

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload images" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND bucket_id = 'rfi-images');

-- Allow authenticated users to view files
CREATE POLICY "Authenticated users can view images" ON storage.objects
  FOR SELECT USING (auth.role() = 'authenticated' AND bucket_id = 'rfi-images');

-- Allow users to delete their own files 
CREATE POLICY "Users can delete their own images" ON storage.objects
  FOR DELETE USING (auth.uid() = owner AND bucket_id = 'rfi-images');

-- Migration: Add rfi_start_number to projects and update numbering logic

-- 1. Add the missing column to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS rfi_start_number integer DEFAULT 1;

-- 2. Update the trigger function to respect the start number
CREATE OR REPLACE FUNCTION public.generate_rfi_serial_no()
RETURNS TRIGGER AS $$
DECLARE
  p_code text;
  p_start_num integer;
  max_val integer;
  parent_code text;
BEGIN
  -- 0. Get project details
  SELECT code, COALESCE(rfi_start_number, 1) INTO p_code, p_start_num 
  FROM public.projects WHERE id = NEW.project_id;
  
  p_code := COALESCE(p_code, 'RFI');

  -- 1. Handle daily serial_no (the simple 1, 2, 3... that resets daily)
  IF NEW.serial_no IS NULL OR NEW.serial_no = 0 THEN
    SELECT COALESCE(MAX(serial_no), 0) + 1 INTO NEW.serial_no
    FROM public.rfis
    WHERE project_id = NEW.project_id AND filed_date = NEW.filed_date;
  END IF;

  -- 2. Handle rfi_no in custom_fields (the project-wide sequential code like PROJ-001)
  IF NEW.custom_fields IS NULL THEN NEW.custom_fields := '{}'::jsonb; END IF;

  IF NEW.custom_fields->>'rfi_no' IS NULL THEN
    IF NEW.parent_id IS NULL THEN
       -- Base RFI: Find MAX sequence number for the CURRENT prefix in this project
       -- If no RFIs exist, start from p_start_num
       SELECT COALESCE(
         MAX(
           GREATEST(
             -- Priority 1: use stored rfi_no_num if prefix matches current
             CASE 
               WHEN (custom_fields->>'rfi_no') LIKE (p_code || '-%') 
               THEN COALESCE((custom_fields->>'rfi_no_num')::integer, 0)
               ELSE 0 
             END,
             -- Priority 2: parse from rfi_no string (take last digits after dash)
             COALESCE(
               (regexp_match(custom_fields->>'rfi_no', '-([0-9]+)$'))[1]::integer,
               0
             )
           )
         ),
         (p_start_num - 1) -- FALLBACK to start number minus 1, so the first one becomes p_start_num
       ) + 1 INTO max_val
       FROM public.rfis
       WHERE 
         project_id = NEW.project_id 
         AND parent_id IS NULL
         AND (custom_fields->>'rfi_no') LIKE (p_code || '-%');

       NEW.custom_fields := jsonb_set(
         NEW.custom_fields, 
         '{rfi_no}', 
         to_jsonb(p_code || '-' || LPAD(max_val::text, 3, '0'))
       );
       NEW.custom_fields := jsonb_set(NEW.custom_fields, '{rfi_no_num}', to_jsonb(max_val));
    ELSE
       -- Revision logic remains same: Parent-R1
       SELECT custom_fields->>'rfi_no' INTO parent_code FROM public.rfis WHERE id = NEW.parent_id;
       IF parent_code LIKE '%-R%' THEN
         NEW.custom_fields := jsonb_set(
           NEW.custom_fields, 
           '{rfi_no}', 
           to_jsonb(split_part(parent_code, '-R', 1) || '-R' || (split_part(parent_code, '-R', 2)::integer + 1))
         );
       ELSE
         NEW.custom_fields := jsonb_set(NEW.custom_fields, '{rfi_no}', to_jsonb(parent_code || '-R1'));
       END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix: RFI number counter robustness and multi-dash prefix support
-- This migration ensures RFI numbering is sequential relative to the CURRENT project code.
-- It extracts the numeric part from the END of the rfi_no string, supporting prefixes with dashes.

CREATE OR REPLACE FUNCTION public.generate_rfi_serial_no()
RETURNS TRIGGER AS $$
DECLARE
  p_code text;
  max_val integer;
  parent_code text;
BEGIN
  -- 1. Handle daily serial_no
  IF NEW.serial_no IS NULL OR NEW.serial_no = 0 THEN
    SELECT COALESCE(MAX(serial_no), 0) + 1 INTO NEW.serial_no
    FROM public.rfis
    WHERE project_id = NEW.project_id AND filed_date = NEW.filed_date;
  END IF;

  -- 2. Handle rfi_no in custom_fields
  IF NEW.custom_fields IS NULL THEN NEW.custom_fields := '{}'::jsonb; END IF;

  IF NEW.custom_fields->>'rfi_no' IS NULL THEN
    SELECT code INTO p_code FROM public.projects WHERE id = NEW.project_id;
    p_code := COALESCE(p_code, 'RR007');

    IF NEW.parent_id IS NULL THEN
       -- Base RFI: Find MAX sequence number for the CURRENT prefix in this project
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
         0
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

-- Refresh rfi_no_num for all base RFIs using the more robust last-part extraction
UPDATE public.rfis
SET custom_fields = jsonb_set(
  custom_fields,
  '{rfi_no_num}',
  to_jsonb(
    COALESCE(
      (regexp_match(custom_fields->>'rfi_no', '-([0-9]+)$'))[1]::integer,
      0
    )
  )
)
WHERE 
  parent_id IS NULL
  AND custom_fields->>'rfi_no' IS NOT NULL;

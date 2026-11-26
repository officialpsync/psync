-- ==============================================================================
-- Migration: Member Onboarding System (Field Specification v1.0)
-- Tables: member_onboarding_forms, member_onboarding_activities
-- Column Extensions: members
-- ==============================================================================

-- 1. Create member_onboarding_forms table
CREATE TABLE IF NOT EXISTS public.member_onboarding_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_trainer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  version VARCHAR(10) NOT NULL DEFAULT '1.0',
  custom_config JSONB NOT NULL DEFAULT '{
    "include_personal": true,
    "include_health": true,
    "include_goals": true,
    "include_diet": true,
    "excluded_fields": []
  }'::jsonb,
  
  status VARCHAR(30) NOT NULL DEFAULT 'sent' CHECK (
    status IN ('draft', 'sent', 'viewed', 'in_progress', 'submitted', 'synced', 'archived')
  ),
  
  viewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  synced_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  prefilled_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  draft_data JSONB DEFAULT '{}'::jsonb,
  submitted_data JSONB DEFAULT '{}'::jsonb,
  
  access_token UUID NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_member ON public.member_onboarding_forms(member_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON public.member_onboarding_forms(org_id, status);
CREATE INDEX IF NOT EXISTS idx_onboarding_token ON public.member_onboarding_forms(access_token);

-- 2. Create member_onboarding_activities audit table
CREATE TABLE IF NOT EXISTS public.member_onboarding_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES public.member_onboarding_forms(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  event_type VARCHAR(50) NOT NULL,
  actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('trainer', 'member', 'system')),
  actor_id UUID,
  actor_name VARCHAR(150),
  
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_act_form ON public.member_onboarding_activities(form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_act_member ON public.member_onboarding_activities(member_id, created_at DESC);

-- 3. Extend members table for full v1.0 field specifications
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS marital_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pincode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS emergency_contact JSONB,
  ADD COLUMN IF NOT EXISTS current_medications TEXT,
  ADD COLUMN IF NOT EXISTS injuries_or_pain TEXT[],
  ADD COLUMN IF NOT EXISTS doctor_exercise_restriction BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS family_medical_history TEXT[],
  ADD COLUMN IF NOT EXISTS medical_report_urls TEXT[],
  ADD COLUMN IF NOT EXISTS blood_group VARCHAR(10),
  ADD COLUMN IF NOT EXISTS smoking_alcohol TEXT[],
  ADD COLUMN IF NOT EXISTS menstrual_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS menstrual_cycle_length VARCHAR(50),
  ADD COLUMN IF NOT EXISTS target_timeline VARCHAR(50),
  ADD COLUMN IF NOT EXISTS training_experience VARCHAR(50),
  ADD COLUMN IF NOT EXISTS preferred_workout_time VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sleep_per_night VARCHAR(50),
  ADD COLUMN IF NOT EXISTS daily_water_intake VARCHAR(50),
  ADD COLUMN IF NOT EXISTS current_supplements TEXT[],
  ADD COLUMN IF NOT EXISTS snacks_and_other_meals TEXT,
  ADD COLUMN IF NOT EXISTS foods_enjoyed TEXT[],
  ADD COLUMN IF NOT EXISTS preferred_cuisines TEXT[],
  ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(30) DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS onboarding_last_submitted_at TIMESTAMPTZ;

-- 4. Enable RLS and setup permissive service policies
ALTER TABLE public.member_onboarding_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_onboarding_activities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'member_onboarding_forms' AND policyname = 'service_role_all_onboarding_forms'
  ) THEN
    CREATE POLICY "service_role_all_onboarding_forms" ON public.member_onboarding_forms
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'member_onboarding_activities' AND policyname = 'service_role_all_onboarding_activities'
  ) THEN
    CREATE POLICY "service_role_all_onboarding_activities" ON public.member_onboarding_activities
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

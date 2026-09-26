-- Add only fields absent from the verified production schema.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES public.admin_users(id);
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.reviews ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS last_checkin_date DATE;
ALTER TABLE public.point_transactions ADD COLUMN IF NOT EXISTS action_code TEXT;
ALTER TABLE public.point_transactions ADD COLUMN IF NOT EXISTS related_review_id TEXT;
-- The deployed spend/check-in functions referenced this missing column.
ALTER TABLE public.point_transactions ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.point_transactions ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

CREATE INDEX IF NOT EXISTS reviews_user_id_idx ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS point_transactions_user_timestamp_idx ON public.point_transactions(user_id, timestamp DESC);
-- Duplicate normalized admin emails require manual reconciliation, never silent merging.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_normalized_idx ON public.admin_users(lower(email));

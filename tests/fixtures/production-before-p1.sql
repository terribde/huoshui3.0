-- Reconstructed from the user's 2026-09-24 structural report, not production data.
ALTER TABLE public.reviews ALTER COLUMN status SET DEFAULT 'approved';
ALTER TABLE public.point_transactions ALTER COLUMN id DROP DEFAULT;
CREATE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles(id,points,created_at) VALUES(NEW.id,100,now()) ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.point_transactions(id,user_id,action_code,amount,balance_after,timestamp)
  VALUES(gen_random_uuid()::text,NEW.id,'new_user_welcome',100,100,now()) ON CONFLICT(id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE FUNCTION public.handle_daily_checkin() RETURNS TABLE(points INTEGER,already_checked_in BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid TEXT:=auth.uid()::text; today DATE:=(now() AT TIME ZONE 'Asia/Shanghai')::date;
  last_date DATE; reward INTEGER; new_balance INTEGER;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'must be logged in'; END IF;
  SELECT last_checkin_date INTO last_date FROM public.user_profiles WHERE id=uid;
  IF last_date=today THEN
    SELECT up.points INTO new_balance FROM public.user_profiles up WHERE up.id=uid;
    RETURN QUERY SELECT new_balance,true; RETURN;
  END IF;
  SELECT points_delta INTO reward FROM public.point_rules WHERE action_code='daily_checkin' AND is_active;
  reward:=coalesce(reward,5);
  UPDATE public.user_profiles up SET points=up.points+reward,last_checkin_date=today
    WHERE up.id=uid RETURNING up.points INTO new_balance;
  INSERT INTO public.point_transactions(id,user_id,action,action_code,amount,balance_after)
    VALUES(gen_random_uuid()::text,uid,'每日签到奖励','daily_checkin',reward,new_balance);
  RETURN QUERY SELECT new_balance,false;
END $$;
CREATE FUNCTION public.spend_points(p_action_code TEXT,p_note TEXT DEFAULT NULL) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid TEXT:=auth.uid()::text; cost INTEGER; desc_label TEXT; cur_points INTEGER; new_balance INTEGER;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'must be logged in'; END IF;
  SELECT points_delta,label INTO cost,desc_label FROM public.point_rules WHERE action_code=p_action_code AND is_active;
  IF cost IS NULL OR cost>=0 THEN RAISE EXCEPTION 'invalid spending action'; END IF;
  SELECT up.points INTO cur_points FROM public.user_profiles up WHERE up.id=uid FOR UPDATE;
  IF cur_points IS NULL OR cur_points+cost<0 THEN RAISE EXCEPTION 'insufficient points'; END IF;
  UPDATE public.user_profiles up SET points=up.points+cost WHERE up.id=uid RETURNING up.points INTO new_balance;
  INSERT INTO public.point_transactions(id,user_id,action,action_code,amount,balance_after)
    VALUES(gen_random_uuid()::text,uid,coalesce(p_note,desc_label),p_action_code,cost,new_balance);
  RETURN new_balance;
END $$;
CREATE FUNCTION public.is_active_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.admin_users a JOIN auth.users u ON a.email=u.email WHERE u.id=auth.uid() AND a.is_active)
$$;

DO $$ DECLARE tbl TEXT; BEGIN
  FOREACH tbl IN ARRAY ARRAY['teachers','reviews','user_profiles','point_transactions','admin_users',
                            'courses','colleges','terms','course_offerings','point_rules'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('GRANT ALL ON public.%I TO anon,authenticated',tbl);
  END LOOP;
END $$;
CREATE POLICY profiles_select_own ON public.user_profiles FOR SELECT TO authenticated USING(id=auth.uid()::text);
CREATE POLICY point_tx_select_own ON public.point_transactions FOR SELECT TO authenticated USING(user_id=auth.uid()::text);
CREATE POLICY reviews_select ON public.reviews FOR SELECT USING(status='approved' OR user_id=auth.uid()::text OR public.is_active_admin());
CREATE POLICY reviews_update_admin ON public.reviews FOR UPDATE TO authenticated USING(public.is_active_admin()) WITH CHECK(public.is_active_admin());
CREATE POLICY reviews_insert_own ON public.reviews FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid()::text AND status='pending');
CREATE POLICY reviews_update_own ON public.reviews FOR UPDATE TO authenticated
  USING(user_id=auth.uid()::text AND status IN('pending','rejected')) WITH CHECK(user_id=auth.uid()::text AND status='pending');
CREATE POLICY reviews_delete_own ON public.reviews FOR DELETE TO authenticated
  USING((user_id=auth.uid()::text AND status='pending') OR public.is_active_admin());
CREATE POLICY admin_select_self ON public.admin_users FOR SELECT TO authenticated
  USING(email=(SELECT u.email FROM auth.users u WHERE u.id=auth.uid()));
REVOKE ALL ON FUNCTION public.handle_daily_checkin(),public.spend_points(TEXT,TEXT) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.handle_daily_checkin(),public.spend_points(TEXT,TEXT) TO authenticated;

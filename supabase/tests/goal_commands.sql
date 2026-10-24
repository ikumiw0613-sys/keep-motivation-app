-- テスト用の書き込みは最後にROLLBACKする。既存の目標・記録は変更しない。
BEGIN;
DO $$
DECLARE
  v_user uuid;
  v_request uuid := gen_random_uuid();
  v_goal bigint;
  v_reply jsonb;
  v_blocked boolean;
BEGIN
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Create an account before running this test'; END IF;
  IF has_function_privilege('anon', 'public.create_goal_with_avatar(uuid,text,date,integer,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.update_goal_with_avatar(bigint,text,date,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous execution is allowed';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  SET LOCAL ROLE authenticated;
  v_reply := public.create_goal_with_avatar(v_request, 'Save integration test', current_date + 30, 3, 'Bird', 150);
  v_goal := (v_reply ->> 'id')::bigint;
  IF NOT EXISTS (SELECT 1 FROM public.avatars WHERE goal_id = v_goal AND name = 'Bird' AND hue = 150) THEN
    RAISE EXCEPTION 'Avatar was not created';
  END IF;
  IF (v_reply ->> 'started_at')::date <> (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date THEN
    RAISE EXCEPTION 'Start date is not the server day';
  END IF;
  v_reply := public.create_goal_with_avatar(v_request, 'Save integration test', current_date + 30, 3, 'Bird', 150);
  IF (v_reply ->> 'id')::bigint <> v_goal
     OR (SELECT count(*) FROM public.goals WHERE user_id = v_user AND request_id = v_request) <> 1 THEN
    RAISE EXCEPTION 'A retry created another goal';
  END IF;
  PERFORM public.update_goal_with_avatar(v_goal, 'Edited test', current_date + 60, 'Edited bird', 205);
  IF NOT EXISTS (SELECT 1 FROM public.goals g JOIN public.avatars a ON a.goal_id = g.id
                 WHERE g.id = v_goal AND g.goal = 'Edited test' AND g.cycle_days = 3
                   AND a.name = 'Edited bird' AND a.hue = 205) THEN
    RAISE EXCEPTION 'Edit was incomplete';
  END IF;
  -- 失敗する編集は、元の目標を変えない。
  v_blocked := false;
  BEGIN
    PERFORM public.update_goal_with_avatar(v_goal, 'Must not persist', current_date + 90, '', 150);
  EXCEPTION WHEN invalid_parameter_value THEN v_blocked := true;
  END;
  IF NOT v_blocked OR (SELECT goal FROM public.goals WHERE id = v_goal) <> 'Edited test' THEN
    RAISE EXCEPTION 'Failed edit changed the goal';
  END IF;
  -- 別アカウントからは見えず、編集もできない。
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  v_blocked := false;
  BEGIN
    PERFORM public.update_goal_with_avatar(v_goal, 'Intruder', current_date + 90, 'Intruder', 150);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked OR EXISTS (SELECT 1 FROM public.goals WHERE id = v_goal) THEN
    RAISE EXCEPTION 'Another account accessed the goal';
  END IF;
  -- 認証情報が無い場合も、関数本体で拒否する。
  PERFORM set_config('request.jwt.claim.sub', '', true);
  v_blocked := false;
  BEGIN
    PERFORM public.create_goal_with_avatar(gen_random_uuid(), 'Intruder', current_date + 1, 1, 'Bird', 150);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Unauthenticated creation succeeded'; END IF;
END;
$$;
ROLLBACK;

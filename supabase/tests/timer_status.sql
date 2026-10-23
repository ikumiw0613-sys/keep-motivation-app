-- SQL Editor または execute_sql で全体を実行する。
-- 既存の目標の所有者を認証のテストに使うが、既存の目標・記録は更新しない。
-- テスト専用の目標・タイマーを作り、最後のROLLBACKで全て取り消す。
BEGIN;

DO $$
DECLARE
  v_user uuid;
  v_goal bigint;
  v_day date := (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date;
  v_reply jsonb;
  v_row public.timer_status%ROWTYPE;
  v_blocked boolean;
BEGIN
  SELECT user_id INTO v_user FROM public.goals LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Create a goal before running this integration test';
  END IF;

  INSERT INTO public.goals (user_id, goal, deadline)
  VALUES (v_user, 'Timer integration test (rolled back)', v_day + 1)
  RETURNING id INTO v_goal;

  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  SET LOCAL ROLE authenticated;

  -- 初回は0秒・停止中で、読み込みだけでは行を作らない。
  v_reply := public.timer_status_command(v_goal);
  IF (v_reply #>> '{state,accumulated_ms}')::bigint <> 0
     OR v_reply #>> '{state,running_since}' IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.timer_status WHERE goal_id = v_goal) THEN
    RAISE EXCEPTION 'Initial read failed';
  END IF;

  -- 開始が保存され、古いバージョンの停止は拒否される。
  v_reply := public.timer_status_command(v_goal, v_day, 0, true);
  IF (v_reply #>> '{state,version}')::bigint <> 1
     OR v_reply #>> '{state,running_since}' IS NULL
     OR (v_reply ->> 'conflict')::boolean THEN
    RAISE EXCEPTION 'Start failed';
  END IF;
  v_reply := public.timer_status_command(v_goal, v_day, 0, false);
  IF NOT (v_reply ->> 'conflict')::boolean
     OR (v_reply #>> '{state,version}')::bigint <> 1 THEN
    RAISE EXCEPTION 'Stale version was accepted';
  END IF;

  -- ミリ秒の端数を含めて停止時に確定し、停止中の読み込みでは時間を加算しない。
  UPDATE public.timer_status SET running_since = clock_timestamp() - interval '1600 milliseconds'
   WHERE goal_id = v_goal AND timer_on = v_day;
  v_reply := public.timer_status_command(v_goal, v_day, 1, false);
  IF (v_reply #>> '{state,accumulated_ms}')::bigint < 1600
     OR v_reply #>> '{state,running_since}' IS NOT NULL THEN
    RAISE EXCEPTION 'Pause failed';
  END IF;
  SELECT * INTO v_row FROM public.timer_status WHERE goal_id = v_goal AND timer_on = v_day;
  v_reply := public.timer_status_command(v_goal);
  IF (v_reply #>> '{state,accumulated_ms}')::bigint <> v_row.accumulated_ms THEN
    RAISE EXCEPTION 'Paused time changed';
  END IF;

  -- 再開は累積時間を保つ。updated_atとversionはDBが設定する。
  v_reply := public.timer_status_command(v_goal, v_day, v_row.version, true);
  IF (v_reply #>> '{state,accumulated_ms}')::bigint <> v_row.accumulated_ms
     OR (v_reply #>> '{state,version}')::bigint <> v_row.version + 1
     OR (v_reply #>> '{state,updated_at}')::timestamptz < v_row.updated_at THEN
    RAISE EXCEPTION 'Resume failed';
  END IF;

  -- 昨日23:58からの計測は2分だけ加算して停止し、繰り返し読んでも増えない。
  INSERT INTO public.timer_status (goal_id, timer_on, accumulated_ms, running_since)
  VALUES (v_goal, v_day - 1, 1200,
          (v_day::timestamp AT TIME ZONE 'Asia/Tokyo') - interval '2 minutes');
  PERFORM public.timer_status_command(v_goal);
  SELECT * INTO v_row FROM public.timer_status WHERE goal_id = v_goal AND timer_on = v_day - 1;
  IF v_row.accumulated_ms <> 121200 OR v_row.running_since IS NOT NULL OR v_row.version <> 1 THEN
    RAISE EXCEPTION 'Midnight boundary failed';
  END IF;
  PERFORM public.timer_status_command(v_goal);
  IF (SELECT version FROM public.timer_status WHERE goal_id = v_goal AND timer_on = v_day - 1) <> 1 THEN
    RAISE EXCEPTION 'Expired timer counted twice';
  END IF;
  v_reply := public.timer_status_command(v_goal, v_day - 1, 1, true);
  IF NOT (v_reply ->> 'conflict')::boolean THEN
    RAISE EXCEPTION 'Old day command was accepted';
  END IF;

  -- タイマーの操作だけでは達成記録は付かない。
  IF EXISTS (SELECT 1 FROM public.records WHERE goal_id = v_goal) THEN
    RAISE EXCEPTION 'Achievement was recorded automatically';
  END IF;

  -- 他人のJWTでは行を見られず、RPCからの更新もできない。
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  IF EXISTS (SELECT 1 FROM public.timer_status WHERE goal_id = v_goal) THEN
    RAISE EXCEPTION 'RLS exposed another user timer';
  END IF;
  v_blocked := false;
  BEGIN
    PERFORM public.timer_status_command(v_goal);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'RPC exposed another user goal'; END IF;
  v_blocked := false;
  BEGIN
    INSERT INTO public.timer_status (goal_id, timer_on) VALUES (v_goal, v_day + 1);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'RLS allowed another user insert'; END IF;

  SET LOCAL ROLE anon;
  v_blocked := false;
  BEGIN
    PERFORM public.timer_status_command(v_goal);
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Anonymous RPC access was allowed'; END IF;
  v_blocked := false;
  BEGIN
    PERFORM 1 FROM public.timer_status;
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'Anonymous table access was allowed'; END IF;

  RESET ROLE;
  -- 目標削除時、タイマーの外部キーがデバッグ操作を妨げない。
  DELETE FROM public.goals WHERE id = v_goal;
  IF EXISTS (SELECT 1 FROM public.timer_status WHERE goal_id = v_goal) THEN
    RAISE EXCEPTION 'Timer cascade cleanup failed';
  END IF;
END;
$$;

ROLLBACK;

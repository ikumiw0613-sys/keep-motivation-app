-- schema.sql の後に実行する。既存データは変更しない。
-- 再送には同じ request_id を使い、応答が失われても同じ目標を返す。
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS goals_request_idx ON public.goals (user_id, request_id);

CREATE OR REPLACE FUNCTION public.create_goal_with_avatar(
  p_request_id uuid, p_goal text, p_deadline date, p_cycle_days integer,
  p_name text, p_hue integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_goal public.goals%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_goal IS NULL OR char_length(btrim(p_goal)) NOT BETWEEN 1 AND 30
     OR p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 12
     OR p_deadline IS NULL OR p_cycle_days IS NULL OR p_cycle_days NOT IN (1, 2, 3, 7)
     OR p_hue IS NULL OR p_hue NOT BETWEEN 0 AND 359 THEN
    RAISE EXCEPTION 'Invalid goal input' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.goals (user_id, request_id, goal, deadline, cycle_days, started_at)
  VALUES ((SELECT auth.uid()), p_request_id, btrim(p_goal), p_deadline, p_cycle_days,
          (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date)
  ON CONFLICT (user_id, request_id) DO NOTHING
  RETURNING * INTO v_goal;
  IF FOUND THEN
    INSERT INTO public.avatars (goal_id, name, hue) VALUES (v_goal.id, btrim(p_name), p_hue);
  ELSE
    SELECT * INTO STRICT v_goal FROM public.goals
     WHERE user_id = (SELECT auth.uid()) AND request_id = p_request_id;
  END IF;
  RETURN to_jsonb(v_goal);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_goal_with_avatar(
  p_goal_id bigint, p_goal text, p_deadline date, p_name text, p_hue integer
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF p_goal IS NULL OR char_length(btrim(p_goal)) NOT BETWEEN 1 AND 30
     OR p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 12
     OR p_deadline IS NULL OR p_hue IS NULL OR p_hue NOT BETWEEN 0 AND 359 THEN
    RAISE EXCEPTION 'Invalid goal input' USING ERRCODE = '22023';
  END IF;
  UPDATE public.goals SET goal = btrim(p_goal), deadline = p_deadline
   WHERE id = p_goal_id AND user_id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = '42501';
  END IF;
  -- 以前の途中失敗でアバターが欠けている目標も修復する。
  INSERT INTO public.avatars (goal_id, name, hue) VALUES (p_goal_id, btrim(p_name), p_hue)
  ON CONFLICT (goal_id) DO UPDATE SET name = EXCLUDED.name, hue = EXCLUDED.hue;
END;
$$;

REVOKE ALL ON FUNCTION public.create_goal_with_avatar(uuid, text, date, integer, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_goal_with_avatar(bigint, text, date, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_goal_with_avatar(uuid, text, date, integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_goal_with_avatar(bigint, text, date, text, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';

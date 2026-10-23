-- 新しいプロジェクトでは schema.sql の後に実行する。
-- 既に画面から作成した timer_status にも適用できる。
CREATE TABLE IF NOT EXISTS public.timer_status (
  goal_id        bigint NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  timer_on       date NOT NULL,
  accumulated_ms bigint NOT NULL DEFAULT 0,
  running_since  timestamptz,
  version        bigint NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, timer_on)
);

-- 停止中は running_since だけをNULLにする。
UPDATE public.timer_status
SET accumulated_ms = coalesce(accumulated_ms, 0),
    version = coalesce(version, 0),
    updated_at = coalesce(updated_at, now())
WHERE accumulated_ms IS NULL OR version IS NULL OR updated_at IS NULL;

ALTER TABLE public.timer_status
  ALTER COLUMN goal_id DROP IDENTITY IF EXISTS,
  ALTER COLUMN accumulated_ms SET DEFAULT 0,
  ALTER COLUMN accumulated_ms SET NOT NULL,
  ALTER COLUMN running_since DROP NOT NULL,
  ALTER COLUMN version SET DEFAULT 0,
  ALTER COLUMN version SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

-- デバッグ画面で目標を削除したとき、その目標のタイマーも削除される。
ALTER TABLE public.timer_status
  DROP CONSTRAINT IF EXISTS timer_status_goal_id_fkey,
  ADD CONSTRAINT timer_status_goal_id_fkey
    FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.timer_status'::regclass
                   AND conname = 'timer_status_nonnegative') THEN
    ALTER TABLE public.timer_status ADD CONSTRAINT timer_status_nonnegative
      CHECK (accumulated_ms >= 0 AND version >= 0);
  END IF;
END;
$$;

ALTER TABLE public.timer_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.timer_status FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.timer_status TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'timer_status'
                   AND policyname = 'timer_status_own') THEN
    CREATE POLICY timer_status_own ON public.timer_status
      FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.goals g
                     WHERE g.id = timer_status.goal_id AND g.user_id = (SELECT auth.uid())))
      WITH CHECK (EXISTS (SELECT 1 FROM public.goals g
                          WHERE g.id = timer_status.goal_id AND g.user_id = (SELECT auth.uid())));
  END IF;
END;
$$;

-- p_running を省略すると読み込み。指定するとバージョンを照合して開始/停止する。
-- SECURITY INVOKER のままなので、呼び出した本人のRLSがそのまま適用される。
CREATE OR REPLACE FUNCTION public.timer_status_command(
  p_goal_id bigint,
  p_timer_on date DEFAULT NULL,
  p_expected_version bigint DEFAULT NULL,
  p_running boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz;
  v_day date;
  v_row public.timer_status%ROWTYPE;
  v_exists boolean;
  v_conflict boolean := false;
BEGIN
  -- 同じ目標への操作を直列化する。親の所有者もここで確認する。
  PERFORM 1 FROM public.goals g
   WHERE g.id = p_goal_id AND g.user_id = (SELECT auth.uid())
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found' USING ERRCODE = '42501';
  END IF;

  v_now := clock_timestamp();
  v_day := (v_now AT TIME ZONE 'Asia/Tokyo')::date;

  -- 閉じたまま日をまたいだ計測も、前日の午前0時までで確定する。
  UPDATE public.timer_status t
     SET accumulated_ms = t.accumulated_ms + greatest(0,
           floor(extract(epoch FROM (
             ((t.timer_on + 1)::timestamp AT TIME ZONE 'Asia/Tokyo') - t.running_since
           )) * 1000)::bigint),
         running_since = NULL,
         version = t.version + 1,
         updated_at = v_now
   WHERE t.goal_id = p_goal_id AND t.timer_on < v_day AND t.running_since IS NOT NULL;

  SELECT * INTO v_row FROM public.timer_status
   WHERE goal_id = p_goal_id AND timer_on = v_day
   FOR UPDATE;
  v_exists := FOUND;

  IF p_running IS NOT NULL THEN
    IF p_timer_on IS DISTINCT FROM v_day OR p_expected_version IS NULL
       OR p_expected_version IS DISTINCT FROM coalesce(v_row.version, 0) THEN
      v_conflict := true;
    ELSIF NOT v_exists THEN
      IF p_running THEN
        INSERT INTO public.timer_status (goal_id, timer_on, accumulated_ms, running_since, version, updated_at)
        VALUES (p_goal_id, v_day, 0, v_now, 1, v_now)
        RETURNING * INTO v_row;
        v_exists := true;
      END IF;
    ELSE
      UPDATE public.timer_status t
         SET accumulated_ms = t.accumulated_ms + CASE
               WHEN t.running_since IS NOT NULL AND NOT p_running THEN
                 greatest(0, floor(extract(epoch FROM (v_now - t.running_since)) * 1000)::bigint)
               ELSE 0 END,
             running_since = CASE WHEN p_running THEN coalesce(t.running_since, v_now) ELSE NULL END,
             version = t.version + 1,
             updated_at = v_now
       WHERE t.goal_id = p_goal_id AND t.timer_on = v_day
       RETURNING * INTO v_row;
    END IF;
  END IF;

  IF NOT v_exists THEN
    v_row.goal_id := p_goal_id;
    v_row.timer_on := v_day;
    v_row.accumulated_ms := 0;
    v_row.running_since := NULL;
    v_row.version := 0;
    v_row.updated_at := NULL;
  END IF;

  RETURN jsonb_build_object('state', to_jsonb(v_row), 'server_now', v_now, 'conflict', v_conflict);
END;
$$;

REVOKE ALL ON FUNCTION public.timer_status_command(bigint, date, bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.timer_status_command(bigint, date, bigint, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';

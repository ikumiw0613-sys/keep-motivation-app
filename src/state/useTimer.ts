import { useCallback, useEffect, useRef, useState } from 'react'

export type TimerSnapshot = {
  accumulatedMs: number
  startedAt: number | null
  endsAt?: number
}

/**
 * 5分タイマーだけを担当する。達成の保存は持たず、
 * `seconds` を過ぎてから `finish()`（「記録する」ボタン）が押されたら `onComplete` を1回だけ呼ぶ。
 *
 * **時間になっても記録を付けても止めない。** 記録後も計測を続けられる。
 * 一時停止・再開は記録の有無にかかわらず操作できる。
 *
 * **長さは引数で受け取るだけで、動きは長さによらず同じ。** 本番は300秒、
 * デバッグ画面は5秒を渡す（useApp）。デバッグ画面で5秒回して確かめたことは、
 * 本番の5分でもそのまま起きる。
 */
export function useTimer(onComplete: () => void, seconds: number) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const recordedRef = useRef(false)
  const accumulatedMsRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const endsAtRef = useRef<number>(Infinity)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // 実行回数ではなく時刻の差で計る。バックグラウンドで更新が止まっても追いつける。
  const syncElapsed = useCallback(() => {
    const startedAt = startedAtRef.current
    const elapsedMs = accumulatedMsRef.current
      + (startedAt === null ? 0 : Math.max(0, Math.min(Date.now(), endsAtRef.current) - startedAt))
    setElapsed(Math.floor(elapsedMs / 1000))
    return elapsedMs
  }, [])

  useEffect(() => {
    if (!running) return
    const sync = () => { syncElapsed() }
    const id = setInterval(sync, 1000)
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)
    window.addEventListener('pageshow', sync)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
      window.removeEventListener('pageshow', sync)
    }
  }, [running, syncElapsed])

  /** 時間を過ぎた。ここから記録を付けられる */
  const reached = elapsed >= seconds

  /** 達成を記録する。計測はそのまま続け、重複して記録しない */
  const finish = () => {
    if (recordedRef.current) return
    const elapsedMs = syncElapsed()
    if (elapsedMs < seconds * 1000) return
    recordedRef.current = true
    onCompleteRef.current()
  }

  /** 記録後も一時停止・再開できる */
  const toggle = () => {
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now()
      setRunning(true)
    } else {
      // ミリ秒の端数も残し、再開のたびに取り組み時間が失われるのを防ぐ。
      accumulatedMsRef.current = syncElapsed()
      startedAtRef.current = null
      setRunning(false)
    }
  }

  /** 保存済みの時刻から復元する。通信処理は保存担当のhookが持つ。 */
  const restore = useCallback((snapshot: TimerSnapshot, recorded = false) => {
    accumulatedMsRef.current = snapshot.accumulatedMs
    startedAtRef.current = snapshot.startedAt
    endsAtRef.current = snapshot.endsAt ?? Infinity
    recordedRef.current = recorded
    setRunning(snapshot.startedAt !== null)
    syncElapsed()
  }, [syncElapsed])

  /** 表示だけ戻す。DBの累積時間は消さない。 */
  const reset = useCallback(() => {
    restore({ accumulatedMs: 0, startedAt: null })
  }, [restore])

  /** 達成扱いにする。計測中なら経過時間と実行状態を保つ（「もうやった」ボタン用） */
  const complete = () => {
    syncElapsed()
    recordedRef.current = true
  }

  return { elapsed, running, reached, toggle, finish, reset, complete, restore }
}

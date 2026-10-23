import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 5分タイマーだけを担当する。達成の保存は持たず、
 * `seconds` を過ぎてから `finish()`（「完了」ボタン）が押されたら `onComplete` を1回だけ呼ぶ。
 *
 * **時間になっても勝手には止めない。** 5分を過ぎても数え続け、区切りは本人が
 * 「完了」で付ける。乗っているところで切られないように、また「押した＝やった」がはっきりするように。
 *
 * **長さは引数で受け取るだけで、動きは長さによらず同じ。** 本番は300秒、
 * デバッグ画面は5秒を渡す（useApp）。デバッグ画面で5秒回して確かめたことは、
 * 本番の5分でもそのまま起きる。
 */
export function useTimer(onComplete: () => void, seconds: number) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const doneRef = useRef(false)
  const accumulatedMsRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)

  // 実行回数ではなく時刻の差で計る。バックグラウンドで更新が止まっても追いつける。
  const syncElapsed = useCallback(() => {
    const startedAt = startedAtRef.current
    const elapsedMs = accumulatedMsRef.current
      + (startedAt === null ? 0 : Math.max(0, Date.now() - startedAt))
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

  /** 時間を過ぎた。ここから「完了」を押せる */
  const reached = elapsed >= seconds

  /** 「完了」。時間を過ぎる前・つけ終わったあとは何もしない */
  const finish = () => {
    if (doneRef.current) return
    const elapsedMs = syncElapsed()
    if (elapsedMs < seconds * 1000) return
    accumulatedMsRef.current = elapsedMs
    startedAtRef.current = null
    doneRef.current = true
    setRunning(false)
    onComplete()
  }

  /** 終わったタイマーは動かさない。次に回せるのは reset（日をまたぐ等）のあと */
  const toggle = () => {
    if (doneRef.current) return
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

  /** タイマーを未達成の状態に戻す（翌日にする・最初から、など） */
  const reset = () => {
    accumulatedMsRef.current = 0
    startedAtRef.current = null
    setRunning(false)
    setElapsed(0)
    doneRef.current = false
  }

  /** タイマーを使わずに達成扱いにする（「もうやった」ボタン用） */
  const complete = () => {
    accumulatedMsRef.current = 0
    startedAtRef.current = null
    setRunning(false)
    setElapsed(0)
    doneRef.current = true
  }

  return { elapsed, running, reached, toggle, finish, reset, complete }
}

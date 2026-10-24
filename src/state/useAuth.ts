import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * ログイン状態と初回案内の完了を持つ。目標のDBは扱わない（AUTH_PLAN 4章）。
 *
 * パスワードは `auth.users.encrypted_password` にあり、照合は Supabase の中で終わる。
 * JWT は `supabase.from(...)` に自動で付く。
 * 初回案内の完了は Auth の user_metadata に保存し、別端末でのログインにも引き継ぐ。
 *
 * 新規登録も Supabase Auth に任せ、セッションができるまでは未ログインのままにする。
 */

/** 何が違うかは言わない。アドレスの存在を当てられるため（AUTH_PLAN 4章） */
const SIGN_IN_ERROR = 'メールアドレスかパスワードが違います'
const GOOGLE_SIGN_IN_ERROR = 'Googleでログインできませんでした。もう一度お試しください。'
const appUrl = () => `${window.location.origin}${window.location.pathname}`
const emailError = (code?: string) =>
  code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit'
    ? '送信回数の上限に達しました。時間をおいて、もう一度お試しください。'
    : 'メールを送信できませんでした。時間をおいて、もう一度お試しください。'

export type SignUpResult =
  | { status: 'signed-in' }
  | { status: 'confirmation-required' }
  | { status: 'error'; message: string }

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  /** セッションの確認が終わったか。これが false の間はログイン画面も出さない */
  const [ready, setReady] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [recovering, setRecovering] = useState(() => new URLSearchParams(window.location.search).get('flow') === 'recovery')
  const tutorialSave = useRef<{ userId: string; promise: Promise<boolean> } | null>(null)
  const currentUserId = useRef<string | null>(null)
  currentUserId.current = user?.id ?? null
  const tutorialCompleted = user?.user_metadata.tutorial_completed === true

  useEffect(() => {
    let alive = true

    // リロードしてもログインが続くのはここ。localStorage のセッションから戻す
    const restoreSession = async () => {
      try {
        // initialize の結果には、Google からの戻りで発生したエラーも含まれる。
        const { error: callbackError } = await supabase.auth.initialize()
        const { data, error } = await supabase.auth.getSession()
        if (!alive) return
        setUser(data.session?.user ?? null)
        if (callbackError || error) {
          setAuthError('ログインを完了できませんでした。もう一度お試しください。')
        }
      } catch {
        if (alive) setAuthError('通信できませんでした。接続を確認して、もう一度お試しください。')
      } finally {
        if (alive) setReady(true)
      }
    }
    void restoreSession()

    // ログイン・ログアウト・トークン更新をまとめて受ける
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') setRecovering(false)
      if (session) setAuthError(null)
      setReady(true)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  /**
   * メールアドレスとパスワードでログインする。
   * `signInWithPassword` は throw せず `{ data, error }` を返す。
   * 返りはエラー文言（成功なら null）。
   */
  const signIn = useCallback(async (email: string, password: string) => {
    setAuthError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return null
    if (error.code === 'email_not_confirmed') {
      return '確認メールのリンクを開いてから、ログインしてください。'
    }
    return error.message === 'Invalid login credentials'
      ? SIGN_IN_ERROR
      : `ログインできませんでした（${error.message}）`
  }, [])

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    setAuthError(null)
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } })
      if (error) {
        let message = '登録を完了できませんでした。入力内容を確認するか、ログインをお試しください。'
        if (error.code === 'signup_disabled' || error.code === 'email_provider_disabled') {
          message = '現在、新規登録を受け付けていません。時間をおいてお試しください。'
        } else if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
          message = '送信回数の上限に達しました。時間をおいて、もう一度お試しください。'
        } else if (error.code === 'weak_password') {
          message = 'このパスワードは使用できません。より長く、推測されにくいパスワードを設定してください。'
        } else if (error.code === 'email_address_invalid') {
          message = '有効なメールアドレスを入力してください。'
        }
        return { status: 'error', message }
      }
      // 確認メール待ちの user をログイン済みとして扱わない。
      // セッションがある場合は onAuthStateChange が通常の初回案内へ進める。
      return { status: data.session ? 'signed-in' : 'confirmation-required' }
    } catch {
      return { status: 'error', message: '通信できませんでした。接続を確認して、もう一度お試しください。' }
    }
  }, [])

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    setAuthError(null)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // クエリやハッシュを持ち越さず、同じアプリへ戻す。
          redirectTo: appUrl(),
        },
      })
      return error ? GOOGLE_SIGN_IN_ERROR : null
    } catch {
      return '通信できませんでした。接続を確認して、もう一度お試しください。'
    }
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) setAuthError('ログアウトできませんでした。接続を確認して、もう一度お試しください。')
    else {
      setRecovering(false)
      if (new URLSearchParams(window.location.search).get('flow') === 'recovery') {
        window.history.replaceState(null, '', window.location.pathname)
      }
    }
  }, [])

  const requestPasswordReset = useCallback(async (email: string): Promise<string | null> => {
    setAuthError(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}?flow=recovery` })
      return error ? emailError(error.code) : null
    } catch {
      return '通信できませんでした。接続を確認して、もう一度お試しください。'
    }
  }, [])

  const resendConfirmation = useCallback(async (email: string): Promise<string | null> => {
    setAuthError(null)
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl() } })
      return error ? emailError(error.code) : null
    } catch {
      return '通信できませんでした。接続を確認して、もう一度お試しください。'
    }
  }, [])

  const updatePassword = useCallback(async (password: string): Promise<string | null> => {
    if (!user) return 'リンクの有効期限が切れています。再設定メールをもう一度送信してください。'
    if (password.length < 8) return 'パスワードは8文字以上で入力してください。'
    const userId = user.id
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (currentUserId.current !== userId) return 'ログイン状態が変わりました。再設定メールのリンクからやり直してください。'
      if (error) {
        return error.code === 'same_password'
          ? '以前と異なるパスワードを入力してください。'
          : 'パスワードを変更できませんでした。より長く、推測されにくいパスワードで再試行してください。'
      }
      window.history.replaceState(null, '', window.location.pathname)
      setRecovering(false)
      return null
    } catch {
      return '通信できませんでした。接続を確認して、もう一度お試しください。'
    }
  }, [user])

  /** 初回案内の完了だけをアカウントに保存する。権限判定には使わない。 */
  const completeTutorial = useCallback((): Promise<boolean> => {
    if (!user) return Promise.resolve(false)
    if (tutorialCompleted) return Promise.resolve(true)
    if (tutorialSave.current?.userId === user.id) return tutorialSave.current.promise

    const request = { userId: user.id, promise: Promise.resolve(false) }
    const save = async () => {
      try {
        const { data, error } = await supabase.auth.updateUser({
          data: { tutorial_completed: true },
        })
        if (error) throw error
        if (!data.user || data.user.id !== user.id) return false
        if (currentUserId.current !== user.id) return false
        setUser((current) => current?.id === user.id ? data.user : current)
        return true
      } catch (error) {
        console.error('チュートリアル完了の保存に失敗:', error)
        if (currentUserId.current === user.id) {
          window.alert('チュートリアルの完了を保存できませんでした。通信状況を確認して、もう一度お試しください。')
        }
        return false
      }
    }
    request.promise = save().finally(() => {
      if (tutorialSave.current === request) tutorialSave.current = null
    })
    tutorialSave.current = request
    return request.promise
  }, [user, tutorialCompleted])

  return { user, ready, authError, signIn, signUp, signInWithGoogle, signOut, tutorialCompleted, completeTutorial,
    recovering, requestPasswordReset, resendConfirmation, updatePassword }
}

// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LoginPage from './LoginPage'
import type { SignUpResult } from '../state/useAuth'

let root: Root
let container: HTMLDivElement
const signIn = vi.fn<(email: string, password: string) => Promise<string | null>>()
const signUp = vi.fn<(email: string, password: string) => Promise<SignUpResult>>()
const googleSignIn = vi.fn<() => Promise<string | null>>()

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.resetAllMocks()
  signIn.mockResolvedValue(null)
  signUp.mockResolvedValue({ status: 'confirmation-required' })
  googleSignIn.mockResolvedValue(null)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(createElement(LoginPage, { onSignIn: signIn, onSignUp: signUp, onSignInWithGoogle: googleSignIn })))
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function switchMode() {
  await act(async () => container.querySelector<HTMLButtonElement>('.login-switch')!.click())
}

async function clickGoogle() {
  await act(async () => container.querySelector<HTMLButtonElement>('.google-sign-in')!.click())
}

async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function credentials(password = 'new-password', confirmation = password) {
  await fill('login-email', 'new@example.com')
  await fill('login-password', password)
  if (container.querySelector('#signup-password-confirmation')) await fill('signup-password-confirmation', confirmation)
}

async function submit() {
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}

it('keeps existing short passwords usable for login', async () => {
  await credentials('short')
  await submit()
  expect(signIn).toHaveBeenCalledExactlyOnceWith('new@example.com', 'short')
  expect(signUp).not.toHaveBeenCalled()
})

it.each([false, true])('starts Google login without requiring email credentials (registering = %s)', async (registering) => {
  if (registering) await switchMode()
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
  await clickGoogle()
  expect(googleSignIn).toHaveBeenCalledOnce()
  expect(signIn).not.toHaveBeenCalled()
  expect(signUp).not.toHaveBeenCalled()
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('blocks Google, email, and mode changes while Google login is pending', async () => {
  let resolve!: (message: string | null) => void
  googleSignIn.mockReturnValue(new Promise((done) => { resolve = done }))
  await credentials()
  await clickGoogle()
  await clickGoogle()
  await submit()
  await switchMode()
  expect(googleSignIn).toHaveBeenCalledOnce()
  expect(signIn).not.toHaveBeenCalled()
  expect(container.querySelector('h2')?.textContent).toBe('ログイン')
  expect(container.querySelector('.google-sign-in')?.textContent).toContain('Googleへ移動中...')
  expect(Array.from(container.querySelectorAll('input, button')).every((element) => (element as HTMLInputElement).disabled)).toBe(true)
  await act(async () => resolve('Googleでログインできませんでした'))
  expect(container.querySelector<HTMLButtonElement>('.google-sign-in')!.disabled).toBe(false)
})

it.each(['api', 'network'])('allows retrying Google login after a %s error', async (failure) => {
  if (failure === 'api') googleSignIn.mockResolvedValueOnce('Googleでログインできませんでした')
  else googleSignIn.mockRejectedValueOnce(new Error('offline'))
  await clickGoogle()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(failure === 'api' ? 'Googleでログインできませんでした' : '通信できませんでした')
  await clickGoogle()
  expect(googleSignIn).toHaveBeenCalledTimes(2)
  expect(container.querySelector('[role="alert"]')).toBeNull()
})

it('shows a failed OAuth callback on the login screen', async () => {
  await act(async () => root.render(createElement(LoginPage, {
    onSignIn: signIn, onSignUp: signUp, onSignInWithGoogle: googleSignIn,
    authError: 'ログインを完了できませんでした。もう一度お試しください。',
  })))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('ログインを完了できませんでした')
  expect(container.querySelector<HTMLButtonElement>('.google-sign-in')!.disabled).toBe(false)
})

it('switches modes while keeping the email and clearing passwords and errors', async () => {
  await credentials()
  await switchMode()
  expect(container.querySelector('h2')?.textContent).toBe('アカウントの新規作成')
  expect(container.querySelector<HTMLInputElement>('#login-email')!.value).toBe('new@example.com')
  expect(container.querySelector<HTMLInputElement>('#login-password')!.value).toBe('')
  expect(container.querySelector('#login-password')!.getAttribute('autocomplete')).toBe('new-password')
  await credentials('short')
  await submit()
  expect(container.querySelector('[role="alert"]')).not.toBeNull()
  await switchMode()
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.querySelector('#signup-password-confirmation')).toBeNull()
  expect(container.querySelector('#login-password')!.getAttribute('autocomplete')).toBe('current-password')
})

it.each([
  ['short', 'short', '8文字以上'],
  ['new-password', 'another-password', '一致しません'],
])('rejects invalid registration credentials: %s / %s', async (password, confirmation, message) => {
  await switchMode()
  await credentials(password, confirmation)
  await submit()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(message)
  expect(signUp).not.toHaveBeenCalled()
  expect(signIn).not.toHaveBeenCalled()
})

it('shows email confirmation guidance and allows login with the registered email', async () => {
  await switchMode()
  await credentials()
  await submit()
  expect(signUp).toHaveBeenCalledExactlyOnceWith('new@example.com', 'new-password')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('確認メール')
  expect(container.querySelector('h2')?.textContent).toBe('ログイン')
  expect(container.querySelector<HTMLInputElement>('#login-email')!.value).toBe('new@example.com')
  expect(container.querySelector<HTMLInputElement>('#login-password')!.value).toBe('')
  await credentials()
  await submit()
  expect(signIn).toHaveBeenCalledOnce()
})

it('does not show confirmation instructions for an immediate authenticated session', async () => {
  signUp.mockResolvedValue({ status: 'signed-in' })
  await switchMode()
  await credentials()
  await submit()
  expect(signUp).toHaveBeenCalledOnce()
  expect(container.querySelector('[role="status"]')).toBeNull()
  expect(signIn).not.toHaveBeenCalled()
})

it('blocks duplicate requests and mode changes while registration is pending', async () => {
  let resolve!: (result: SignUpResult) => void
  signUp.mockReturnValue(new Promise((done) => { resolve = done }))
  await switchMode()
  await credentials()
  await submit()
  await submit()
  await switchMode()
  expect(signUp).toHaveBeenCalledOnce()
  expect(container.querySelector('h2')?.textContent).toBe('アカウントの新規作成')
  expect(Array.from(container.querySelectorAll('input, button')).every((element) => (element as HTMLInputElement).disabled)).toBe(true)
  await act(async () => resolve({ status: 'confirmation-required' }))
  expect(container.querySelector<HTMLButtonElement>('.login-switch')!.disabled).toBe(false)
})

it.each(['api', 'network'])('recovers from %s errors and allows another registration attempt', async (failure) => {
  if (failure === 'api') signUp.mockResolvedValueOnce({ status: 'error', message: '登録エラー' })
  else signUp.mockRejectedValueOnce(new Error('offline'))
  await switchMode()
  await credentials()
  await submit()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(failure === 'api' ? '登録エラー' : '通信できませんでした')
  expect(container.querySelector<HTMLButtonElement>('.login-switch')!.disabled).toBe(false)
  await credentials()
  await submit()
  expect(signUp).toHaveBeenCalledTimes(2)
  expect(container.querySelector('[role="alert"]')).toBeNull()
  expect(container.querySelector('[role="status"]')).not.toBeNull()
})

// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SetupPage from './SetupPage'
import PasswordResetPage from './PasswordResetPage'
import App from '../app/App'
import { initialState } from '../state/logic'

vi.mock('../avatar/Avatar', () => ({ default: () => null }))
const hooks = vi.hoisted(() => ({ app: vi.fn() }))
vi.mock('../state/useApp', () => ({ useApp: hooks.app }))

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})
async function fill(id: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`#${id}`)!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function submit() {
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}

it('keeps the goal draft, blocks duplicate submissions, and allows retrying a failed save', async () => {
  let resolve!: (success: boolean) => void
  const save = vi.fn().mockReturnValueOnce(new Promise<boolean>((done) => { resolve = done })).mockResolvedValueOnce(true)
  await act(async () => root.render(createElement(SetupPage, {
    state: { ...initialState(), goal: 'Read daily', deadline: '2099-12-31', name: 'Bird' },
    onStart: save, onBack: vi.fn(),
  })))
  const button = container.querySelector<HTMLButtonElement>('.top-btn')!
  await act(async () => { button.click(); button.click() })
  expect(save).toHaveBeenCalledOnce()
  expect(button.disabled).toBe(true)
  expect(container.querySelector<HTMLFieldSetElement>('fieldset')!.disabled).toBe(true)
  expect(container.querySelector<HTMLButtonElement>('.setup-back')!.disabled).toBe(true)
  await act(async () => resolve(false))
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('保存できませんでした')
  expect(container.querySelector<HTMLInputElement>('#goal-input')!.value).toBe('Read daily')
  await act(async () => button.click())
  expect(save).toHaveBeenCalledTimes(2)
})

it('validates a replacement password and keeps the recovery form usable after an error', async () => {
  const save = vi.fn().mockResolvedValueOnce('通信できませんでした。').mockResolvedValueOnce(null)
  await act(async () => root.render(createElement(PasswordResetPage, { onSave: save, onSignOut: vi.fn() })))
  await fill('reset-password', 'new-password')
  await fill('reset-confirmation', 'different-password')
  await submit()
  expect(save).not.toHaveBeenCalled()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('一致しません')
  await fill('reset-confirmation', 'new-password')
  await submit()
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('通信できませんでした')
  await fill('reset-password', 'another-password')
  await fill('reset-confirmation', 'another-password')
  await submit()
  expect(save).toHaveBeenLastCalledWith('another-password')
})

it('shows password recovery even if goal loading failed', async () => {
  hooks.app.mockReturnValue({ ready: true, user: { id: 'user-a' }, recovering: true,
    loadError: '目標を読み込めませんでした', loaded: false, updatePassword: vi.fn(), signOut: vi.fn() })
  await act(async () => root.render(createElement(App)))
  expect(container.textContent).toContain('新しいパスワードを設定')
  expect(container.textContent).not.toContain('目標を読み込めませんでした')
})

import LoginPage from '../pages/LoginPage'
import MainPage from '../pages/MainPage'
import SetupPage from '../pages/SetupPage'
import AccountBar from './AccountBar'
import TopPage from '../pages/TopPage'
import { useApp } from '../state/useApp'
import { lazy, Suspense, useState } from 'react'

const DebugPage = import.meta.env.DEV
  ? lazy(() => import('../pages/DebugPage'))
  : null

export default function App() {
  const [tutorialUserId, setTutorialUserId] = useState<string | null>(null)
  const { user, ready, signIn, signUp, signOut, state, goals, currentGoalId, selectGoal, setDayOffset, reload, loaded, loadError, retryLoad, hasStarted, completeTutorial, screen, start, extendDeadline, markStageSeen, newGoal, cancelNewGoal, editGoal, saveGoal, cancelEdit, session, elapsed, running, reached, toggleTimer, finishTimer, recordOnly } = useApp()

  // ゲートは3段。セッションの確認 → ログイン → 目標の読み込み（AUTH_PLAN 4章）
  if (!ready) {
    return <div role="status">読み込み中...</div>
  }

  if (!user) {
    return <LoginPage onSignIn={signIn} onSignUp={signUp} />
  }

  if (loadError) {
    return (
      <div role="alert">
        <p>{loadError}</p>
        <button type="button" onClick={retryLoad}>再試行</button>
        <button type="button" onClick={signOut}>ログアウト</button>
      </div>
    )
  }

  if (!loaded) {
    return <div role="status">読み込み中...</div>
  }

  return (
    <div className={`shell${tutorialUserId === user.id ? '' : screen === 'main' ? ' dashboard-shell' : screen === 'setup' || screen === 'edit' ? ' setup-shell' : ''}`}>
      <AccountBar email={user.email ?? ''} onSignOut={() => { setTutorialUserId(null); void signOut() }}
        onShowTutorial={screen !== 'top' && tutorialUserId !== user.id ? () => setTutorialUserId(user.id) : undefined} />
      {tutorialUserId === user.id && (
        <main className="content tutorial-content">
          <button type="button" className="btn ghost" onClick={() => setTutorialUserId(null)}>元の画面に戻る</button>
          <TopPage onStart={() => setTutorialUserId(null)} />
        </main>
      )}
      <main className="content" hidden={tutorialUserId === user.id}>
        {screen === 'debug' && DebugPage ? (
          <Suspense fallback={<p role="status">読み込み中...</p>}>
            <DebugPage state={state} userId={user.id} loaded={loaded} hasStarted={hasStarted}
              session={session} elapsed={elapsed} running={running} reached={reached} onRecord={recordOnly}
              onSetDayOffset={setDayOffset} onReload={reload} onNewGoal={newGoal}
              app={{ email: user.email ?? '', onSignOut: signOut, goals, currentGoalId, onSelectGoal: selectGoal,
                onToggleTimer: toggleTimer, onFinishTimer: finishTimer, onEditGoal: editGoal, onExtend: extendDeadline, onStageSeen: markStageSeen }} />
          </Suspense>
        ) : screen === 'top' ? (
          <TopPage onStart={completeTutorial} />
        ) : screen === 'setup' ? (
          <SetupPage key="setup" state={state} onStart={start} onBack={cancelNewGoal} />
        ) : screen === 'edit' ? (
          <SetupPage key="edit" state={state} onStart={saveGoal} onBack={cancelEdit} editing />
        ) : (
          <MainPage
            state={state}
            goals={goals}
            currentGoalId={currentGoalId}
            onSelectGoal={selectGoal}
            session={session}
            elapsed={elapsed}
            running={running}
            reached={reached}
            onToggleTimer={toggleTimer}
            onFinishTimer={finishTimer}
            onNewGoal={newGoal}
            onEditGoal={editGoal}
            onExtend={extendDeadline}
            onStageSeen={markStageSeen}
          />
        )}
      </main>
    </div>
  )
}

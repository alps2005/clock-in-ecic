import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter } from 'react-router'
import { supabase } from './lib/supabase'
import { Login } from './features/auth/Login'
const Workspace = lazy(() => import('./app/Workspace').then(module => ({ default: module.Workspace })))
import { Loading } from './components/Feedback'
import './App.css'
import './teacher.css'
import './public.css'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next); setLoading(false)
      const owner = sessionStorage.getItem('ecic-pending-owner')
      if (owner !== next?.user.id) {
        sessionStorage.removeItem('ecic-pending-attendance')
        sessionStorage.removeItem('ecic-pending-owner')
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return <BrowserRouter>{loading ? <Loading fullPage description="Verificando tu sesión." /> : session ? <Suspense fallback={<Loading fullPage description="Preparando tu espacio." />}><Workspace key={session.user.id} userId={session.user.id} /></Suspense> : <Login />}</BrowserRouter>
}

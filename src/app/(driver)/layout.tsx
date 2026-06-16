'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Package, LogOut, Truck } from 'lucide-react'
import { signOut } from '@/lib/firebase/auth'

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { isAuthenticated, isDriver, loading, userDoc } = useAuth()

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated) router.replace('/login')
    else if (!isDriver) router.replace('/dashboard')
  }, [isAuthenticated, isDriver, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isDriver) return null

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-brand-gradient text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm">SaldoEntregas</div>
              <div className="text-white/70 text-xs">{userDoc?.displayName}</div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-white/80 hover:text-white text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Salir
          </button>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="animate-enter">{children}</div>
      </main>
    </div>
  )
}

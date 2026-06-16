'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Página raíz — redirige al dashboard o login según el estado de autenticación.
 */
export default function RootPage() {
  const router = useRouter()
  const { isAuthenticated, isAdmin, isDriver, loading } = useAuth()

  useEffect(() => {
    if (loading) return

    if (!isAuthenticated) {
      router.replace('/login')
    } else if (isAdmin) {
      router.replace('/dashboard')
    } else if (isDriver) {
      router.replace('/my-orders')
    } else {
      router.replace('/login')
    }
  }, [isAuthenticated, isAdmin, isDriver, loading, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Cargando...</p>
      </div>
    </div>
  )
}

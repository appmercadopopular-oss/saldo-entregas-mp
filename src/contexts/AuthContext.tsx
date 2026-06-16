'use client'

// =============================================================
// AUTH CONTEXT — Proveedor de autenticación global
// src/contexts/AuthContext.tsx
// =============================================================

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from 'firebase/auth'
import { onAuthChange, getUserDoc } from '@/lib/firebase/auth'
import { UserDoc } from '@/types'

interface AuthContextValue {
  /** Usuario de Firebase Authentication */
  firebaseUser: User | null
  /** Perfil completo del usuario en Firestore (incluye rol) */
  userDoc: UserDoc | null
  /** true mientras se resuelve el estado inicial de autenticación */
  loading: boolean
  /** true si el usuario está autenticado */
  isAuthenticated: boolean
  /** Shortcuts de rol */
  isAdmin: boolean
  isDriver: boolean
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  userDoc: null,
  loading: true,
  isAuthenticated: false,
  isAdmin: false,
  isDriver: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthChange(async (user) => {
      setFirebaseUser(user)

      if (user) {
        // Cargar el perfil de Firestore (incluye el rol)
        try {
          // Set cookie for middleware validation
          const token = await user.getIdToken()
          document.cookie = `firebase-auth-token=${token}; path=/; max-age=3600; SameSite=Lax; Secure`

          const doc = await getUserDoc(user.uid)
          setUserDoc(doc)
        } catch (error) {
          console.error('[AuthContext] Error cargando perfil:', error)
          setUserDoc(null)
        }
      } else {
        // Clear cookie on logout
        document.cookie = 'firebase-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        setUserDoc(null)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const value: AuthContextValue = {
    firebaseUser,
    userDoc,
    loading,
    isAuthenticated: !!firebaseUser,
    isAdmin: userDoc?.role === 'admin',
    isDriver: userDoc?.role === 'driver',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return ctx
}

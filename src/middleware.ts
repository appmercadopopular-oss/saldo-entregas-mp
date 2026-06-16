// =============================================================
// MIDDLEWARE — Protección de rutas por rol
// src/middleware.ts
//
// Redirige usuarios no autenticados al login.
// La validación de rol (admin/driver) se hace dentro de cada layout
// mediante el AuthContext, ya que Firebase Auth es client-side.
// =============================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rutas que requieren autenticación
const PROTECTED_ADMIN_PATHS = ['/dashboard', '/invoices', '/delivery-orders', '/users']
const PROTECTED_DRIVER_PATHS = ['/my-orders']
const PUBLIC_PATHS = ['/login', '/api']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Permitir rutas públicas y de API sin validación
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path))
  if (isPublic) return NextResponse.next()

  // Verificar si hay token de sesión en las cookies
  // Firebase Auth usa cookies httpOnly cuando se configura con Admin SDK
  // Para la implementación inicial, verificamos la cookie de sesión
  const sessionCookie = request.cookies.get('__session')?.value
  const authToken = request.cookies.get('firebase-auth-token')?.value

  const isAuthenticated = !!(sessionCookie || authToken)

  // Si no está autenticado, redirigir al login
  if (!isAuthenticated) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Aplicar middleware a todas las rutas excepto archivos estáticos
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

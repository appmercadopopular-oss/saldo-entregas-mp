// =============================================================
// API ROUTE — Edición de Usuarios (Nombre, Teléfono, Rol, Contraseña)
// src/app/api/admin/users/update/route.ts
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin-init'

export async function POST(request: NextRequest) {
  try {
    // 1. Obtener cabecera de Autorización (Bearer Token)
    const authHeader = request.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No autorizado: Token ausente' },
        { status: 401 }
      )
    }

    const token = authHeader.split('Bearer ')[1]

    // 2. Verificar el ID Token del solicitante en Firebase Auth
    let decodedToken
    try {
      decodedToken = await adminAuth.verifyIdToken(token)
    } catch (err: any) {
      console.error('[AUTH ERROR] Token verification failed:', err)
      return NextResponse.json(
        { success: false, error: 'Sesión inválida o expirada' },
        { status: 401 }
      )
    }

    const callerUid = decodedToken.uid

    // 3. Verificar que el solicitante sea Administrador en Firestore
    const callerDoc = await adminDb.doc(`users/${callerUid}`).get()
    if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Acción restringida a administradores' },
        { status: 403 }
      )
    }

    // 4. Parsear el cuerpo de la petición
    const body = await request.json()
    const { uid, displayName, phoneNumber, role, password } = body

    if (!uid) {
      return NextResponse.json(
        { success: false, error: 'Falta el identificador del usuario (uid)' },
        { status: 400 }
      )
    }

    // 5. Actualizar en Firebase Authentication (si requiere)
    const authUpdates: Record<string, any> = {}
    if (displayName) authUpdates.displayName = displayName.trim()
    if (password) {
      if (password.length < 6) {
        return NextResponse.json(
          { success: false, error: 'La contraseña debe tener al menos 6 caracteres' },
          { status: 400 }
        )
      }
      authUpdates.password = password
    }

    let authUpdated = false
    if (Object.keys(authUpdates).length > 0) {
      try {
        await adminAuth.updateUser(uid, authUpdates)
        authUpdated = true
      } catch (err: any) {
        console.error('[API ERROR] Failed to update user in Firebase Auth:', err)
        
        let customError = 'Error al actualizar credenciales en la cuenta de Firebase'
        if (err.code === 'auth/invalid-password') {
          customError = 'La contraseña provista no es válida'
        } else if (err.code === 'auth/user-not-found') {
          customError = 'El usuario no existe en la base de datos de autenticación'
        }
        
        return NextResponse.json(
          { success: false, error: `${customError} (${err.message})` },
          { status: 500 }
        )
      }
    }

    // 6. Actualizar en la base de datos Firestore
    const firestoreUpdates: Record<string, any> = {}
    if (displayName !== undefined) firestoreUpdates.displayName = displayName.trim()
    if (phoneNumber !== undefined) firestoreUpdates.phoneNumber = phoneNumber.trim() || null
    if (role !== undefined) firestoreUpdates.role = role

    try {
      await adminDb.doc(`users/${uid}`).update(firestoreUpdates)
    } catch (err: any) {
      console.error('[API ERROR] Failed to update user in Firestore:', err)
      return NextResponse.json(
        {
          success: false,
          error: 'Credenciales de autenticación actualizadas, pero falló la actualización del perfil en Firestore.'
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Usuario actualizado exitosamente.',
      authUpdated
    })

  } catch (error: any) {
    console.error('[GLOBAL UPDATE ERROR]', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

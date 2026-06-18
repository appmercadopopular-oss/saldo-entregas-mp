// =============================================================
// FIREBASE — Inicialización del Admin SDK (Server-Side)
// src/lib/firebase/admin-init.ts
// =============================================================

import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_PRIVATE_KEY

if (!getApps().length) {
  if (clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      projectId,
    })
  } else {
    try {
      initializeApp({
        projectId,
      })
      console.log('Firebase Admin SDK inicializado usando credenciales de entorno por defecto.')
    } catch (err) {
      console.warn(
        'ADVERTENCIA: No se pudo inicializar Firebase Admin SDK. ' +
        'Por favor configura FIREBASE_CLIENT_EMAIL y FIREBASE_PRIVATE_KEY en tu .env.local para cambiar contraseñas.'
      )
    }
  }
}

export const adminAuth = getAuth()
export const adminDb = getFirestore()


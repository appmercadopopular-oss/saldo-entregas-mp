// =============================================================
// FIREBASE — Helpers de Autenticación
// src/lib/firebase/auth.ts
// =============================================================

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
  UserCredential,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth'
import {
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { auth, db } from './config'
import { UserDoc, UserRole } from '@/types'

// -------------------------------------------------------------
// Autenticación básica
// -------------------------------------------------------------

/**
 * Inicia sesión con email y contraseña.
 * Retorna las credenciales de Firebase.
 */
export async function signIn(
  email: string,
  password: string
): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password)
}

/**
 * Cierra la sesión del usuario actual.
 */
export async function signOut(): Promise<void> {
  return firebaseSignOut(auth)
}

/**
 * Envía un email de recuperación de contraseña.
 */
export async function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email)
}

/**
 * Suscripción a cambios de estado de autenticación.
 * Retorna la función de unsubscribe.
 */
export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

// -------------------------------------------------------------
// Perfil de usuario en Firestore
// -------------------------------------------------------------

/**
 * Obtiene el documento de usuario desde Firestore.
 * Incluye el rol y otros metadatos.
 */
export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return snap.data() as UserDoc
}

/**
 * Crea o actualiza el documento de usuario en Firestore.
 * Usado al crear un nuevo usuario desde el panel de admin.
 */
export async function upsertUserDoc(
  uid: string,
  data: Partial<UserDoc>
): Promise<void> {
  const ref = doc(db, 'users', uid)
  await setDoc(ref, data, { merge: true })
}

/**
 * Crea un nuevo usuario admin o driver.
 * Solo el admin debe poder llamar esta función desde el frontend.
 * La creación real se hace a través de Firebase Admin SDK en un Route Handler.
 */
export async function createUserProfile(
  uid: string,
  email: string,
  displayName: string,
  role: UserRole
): Promise<void> {
  const userDoc: UserDoc = {
    uid,
    email,
    displayName,
    role,
    isActive: true,
    createdAt: Timestamp.now(),
  }
  await setDoc(doc(db, 'users', uid), userDoc)
}

/**
 * Obtiene el usuario actual autenticado (sincrónico).
 */
export function getCurrentUser(): User | null {
  return auth.currentUser
}

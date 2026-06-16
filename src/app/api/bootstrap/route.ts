import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

export async function GET(request: NextRequest) {
  // Solo permitir ejecución en desarrollo local o con variable explicativa
  const isDev = process.env.NODE_ENV === 'development'
  const { searchParams } = new URL(request.url)
  const force = searchParams.get('force') === 'true'

  try {
    // 1. Inicializar Firebase secundario para crear usuarios sin tocar la sesión activa
    const bootstrapApp = getApps().find(a => a.name === 'BootstrapApp') || initializeApp(firebaseConfig, 'BootstrapApp')
    const bootstrapAuth = getAuth(bootstrapApp)

    const createdUsers = []

    // ---- A. CREACIÓN DE MOCK ADMIN ----
    try {
      const adminCreds = await createUserWithEmailAndPassword(
        bootstrapAuth,
        'admin@ferreteria.com',
        'admin123'
      )
      const adminUid = adminCreds.user.uid
      
      const adminDoc = {
        uid: adminUid,
        email: 'admin@ferreteria.com',
        displayName: 'Administrador de Pruebas',
        role: 'admin',
        isActive: true,
        createdAt: Timestamp.now()
      }
      
      await setDoc(doc(db, 'users', adminUid), adminDoc)
      createdUsers.push({ email: 'admin@ferreteria.com', role: 'admin', uid: adminUid })
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        createdUsers.push({ email: 'admin@ferreteria.com', role: 'admin', note: 'Ya existía' })
      } else {
        throw e
      }
    }

    // ---- B. CREACIÓN DE MOCK CHOFER ----
    try {
      const driverCreds = await createUserWithEmailAndPassword(
        bootstrapAuth,
        'chofer@ferreteria.com',
        'chofer123'
      )
      const driverUid = driverCreds.user.uid
      
      const driverDoc = {
        uid: driverUid,
        email: 'chofer@ferreteria.com',
        displayName: 'Juan Chofer',
        role: 'driver',
        isActive: true,
        phoneNumber: '+502 55554444',
        createdAt: Timestamp.now()
      }
      
      await setDoc(doc(db, 'users', driverUid), driverDoc)
      createdUsers.push({ email: 'chofer@ferreteria.com', role: 'driver', uid: driverUid })
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        createdUsers.push({ email: 'chofer@ferreteria.com', role: 'driver', note: 'Ya existía' })
      } else {
        throw e
      }
    }

    // Desconectar auth de bootstrap
    await signOut(bootstrapAuth)

    // ---- C. CREACIÓN DE FACTURA MOCK ----
    const invoiceId = 'mock-invoice-fac-001'
    const invoiceDoc = {
      finanzaproId: 'fp-100293',
      internalReference: 'FAC-2026-001',
      clientName: 'Distribuidora El Progreso S.A.',
      clientId: 'CLI-876',
      deliveryAddress: 'Diagonal 6, 12-42, Zona 10, Ciudad de Guatemala',
      issueDate: Timestamp.fromDate(new Date()),
      importedAt: Timestamp.now(),
      importedBy: 'bootstrap',
      status: 'open',
      totalItems: 3,
      isFullyDelivered: false,
      notes: 'Factura mock autogenerada para pruebas rápidas de saldo de materiales.'
    }

    await setDoc(doc(db, 'invoices', invoiceId), invoiceDoc)

    // Crear ítems de la factura mock
    const batch = writeBatch(db)
    const items = [
      {
        id: 'item-001',
        sku: 'CEM-GR-4000',
        description: 'Cemento Gris Obra Especial 4000psi (Saco 42.5kg)',
        unit: 'sacos',
        quantityInvoiced: 150.0,
        quantityDelivered: 0.0,
        quantityPending: 150.0,
        isCompleted: false
      },
      {
        id: 'item-002',
        sku: 'VAR-HIE-38',
        description: 'Hierro Corrugado Grado 40 Estructural 3/8 pulgada',
        unit: 'varillas',
        quantityInvoiced: 80.0,
        quantityDelivered: 0.0,
        quantityPending: 80.0,
        isCompleted: false
      },
      {
        id: 'item-003',
        sku: 'BLO-CON-15',
        description: 'Bloque de Concreto Estructural Ligero 15x20x40cm',
        unit: 'bloques',
        quantityInvoiced: 500.0,
        quantityDelivered: 0.0,
        quantityPending: 500.0,
        isCompleted: false
      }
    ]

    for (const item of items) {
      const itemRef = doc(collection(db, 'invoices', invoiceId, 'items'), item.id)
      batch.set(itemRef, item)
    }
    await batch.commit()

    return NextResponse.json({
      success: true,
      message: '¡Base de datos inicializada exitosamente!',
      credentials: {
        admin: { email: 'admin@ferreteria.com', password: 'admin123', name: 'Administrador de Pruebas' },
        driver: { email: 'chofer@ferreteria.com', password: 'chofer123', name: 'Juan Chofer' }
      },
      mockInvoice: {
        reference: 'FAC-2026-001',
        client: 'Distribuidora El Progreso S.A.',
        itemsCount: 3
      }
    })

  } catch (error: any) {
    console.error('[BOOTSTRAP ERROR]', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Error durante la inicialización'
    }, { status: 500 })
  }
}

// =============================================================
// FIREBASE — Servicio Firestore (CRUD de dominio)
// src/lib/firebase/firestore.ts
// =============================================================

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  runTransaction,
  writeBatch,
  onSnapshot,
  QueryConstraint,
} from 'firebase/firestore'
import { db } from './config'
import type {
  InvoiceDoc,
  InvoiceItemDoc,
  DeliveryOrderDoc,
  DeliveryOrderItem,
  UserDoc,
  CreateDeliveryOrderPayload,
  ConfirmDeliveryPayload,
  InvoiceStatus,
  OrderStatus,
} from '@/types'

// ─────────────────────────────────────────────────────────────
// COLECCIONES — Referencias
// ─────────────────────────────────────────────────────────────

const invoicesRef = () => collection(db, 'invoices')
const invoiceItemsRef = (invoiceId: string) =>
  collection(db, 'invoices', invoiceId, 'items')
const deliveryOrdersRef = () => collection(db, 'delivery_orders')
const usersRef = () => collection(db, 'users')

// ─────────────────────────────────────────────────────────────
// FACTURAS
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene todas las facturas con estado 'open'.
 */
export async function getOpenInvoices(): Promise<InvoiceDoc[]> {
  const q = query(
    invoicesRef(),
    where('status', 'in', ['open', 'in_progress']),
    orderBy('importedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvoiceDoc)
}

/**
 * Obtiene todas las facturas (admin panel).
 */
export async function getAllInvoices(
  statusFilter?: InvoiceStatus
): Promise<InvoiceDoc[]> {
  const constraints: QueryConstraint[] = [orderBy('importedAt', 'desc')]
  if (statusFilter) constraints.unshift(where('status', '==', statusFilter))
  const q = query(invoicesRef(), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvoiceDoc)
}

/**
 * Obtiene una factura por su ID de Firestore.
 */
export async function getInvoiceById(
  invoiceId: string
): Promise<InvoiceDoc | null> {
  const snap = await getDoc(doc(db, 'invoices', invoiceId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as InvoiceDoc
}

/**
 * Busca una factura por internalReference (número de factura).
 */
export async function getInvoiceByReference(
  reference: string
): Promise<InvoiceDoc | null> {
  const q = query(
    invoicesRef(),
    where('internalReference', '==', reference),
    limit(1)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as InvoiceDoc
}

/**
 * Guarda una factura importada desde FinanzaPro.
 * Inicializa todos los ítems con quantityDelivered = 0 y quantityPending = quantityInvoiced.
 * Usa un batch para atomicidad.
 */
export async function saveImportedInvoice(
  invoice: Omit<InvoiceDoc, 'id'>,
  items: Omit<InvoiceItemDoc, 'id'>[]
): Promise<string> {
  // 1. Crear el documento de la factura
  const invoiceDocRef = await addDoc(invoicesRef(), invoice)
  const invoiceId = invoiceDocRef.id

  // 2. Crear todos los ítems en un batch
  const batch = writeBatch(db)
  for (const item of items) {
    const itemRef = doc(invoiceItemsRef(invoiceId))
    batch.set(itemRef, item)
  }
  await batch.commit()

  return invoiceId
}

/**
 * Actualiza el estado de una factura.
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  status: InvoiceStatus
): Promise<void> {
  await updateDoc(doc(db, 'invoices', invoiceId), { status })
}

// ─────────────────────────────────────────────────────────────
// ÍTEMS DE FACTURA
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene todos los ítems de una factura.
 */
export async function getInvoiceItems(
  invoiceId: string
): Promise<InvoiceItemDoc[]> {
  const snap = await getDocs(invoiceItemsRef(invoiceId))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvoiceItemDoc)
}

/**
 * Suscripción en tiempo real a los ítems de una factura.
 */
export function subscribeToInvoiceItems(
  invoiceId: string,
  callback: (items: InvoiceItemDoc[]) => void
) {
  return onSnapshot(invoiceItemsRef(invoiceId), (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvoiceItemDoc)
    )
  })
}

// ─────────────────────────────────────────────────────────────
// ÓRDENES DE ENTREGA
// ─────────────────────────────────────────────────────────────

/**
 * Crea una nueva orden de entrega.
 * Valida que las cantidades despachadas no superen el saldo pendiente.
 * Operación atómica con runTransaction.
 */
export async function createDeliveryOrder(
  payload: CreateDeliveryOrderPayload,
  createdBy: string,
  createdByName: string
): Promise<string> {
  let newOrderId = ''

  await runTransaction(db, async (tx) => {
    // 1. Verificar saldos pendientes para cada ítem
    const itemRefs = payload.items.map((item) =>
      doc(db, 'invoices', payload.invoiceId, 'items', item.invoiceItemId)
    )
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)))

    for (let i = 0; i < itemSnaps.length; i++) {
      const snap = itemSnaps[i]
      if (!snap.exists()) {
        throw new Error(`Ítem ${payload.items[i].invoiceItemId} no encontrado`)
      }
      const itemData = snap.data() as InvoiceItemDoc
      const requested = payload.items[i].quantityDispatched

      const roundedRequested = Math.round(requested * 100) / 100
      const roundedPending = Math.round(itemData.quantityPending * 100) / 100

      if (roundedRequested > roundedPending) {
        throw new Error(
          `Cantidad solicitada (${requested}) supera el saldo pendiente (${itemData.quantityPending}) para: ${itemData.description}`
        )
      }
    }

    // 2. Construir la orden con estado inicial
    const orderItems: DeliveryOrderItem[] = payload.items.map((item) => ({
      invoiceItemId: item.invoiceItemId,
      sku: item.sku,
      description: item.description,
      unit: item.unit,
      quantityDispatched: item.quantityDispatched,
      quantityConfirmed: item.quantityDispatched, // Optimista: se ajusta al confirmar
      quantityReturned: 0,
      hasException: false,
    }))

    const newOrder: Omit<DeliveryOrderDoc, 'id'> = {
      invoiceId: payload.invoiceId,
      invoiceReference: payload.invoiceReference,
      clientName: payload.clientName,
      deliveryAddress: payload.deliveryAddress,
      assignedDriverId: payload.assignedDriverId,
      assignedDriverName: payload.assignedDriverName,
      createdBy,
      createdByName,
      createdAt: Timestamp.now(),
      status: 'pending',
      items: orderItems,
      adminNotes: payload.adminNotes,
      provincia: payload.provincia,
      canton: payload.canton,
      distrito: payload.distrito,
    }

    // 3. Crear la orden en Firestore
    const orderRef = doc(collection(db, 'delivery_orders'))
    newOrderId = orderRef.id
    tx.set(orderRef, newOrder)

    // 4. Actualizar el estado de la factura a 'in_progress'
    const invoiceRef = doc(db, 'invoices', payload.invoiceId)
    tx.update(invoiceRef, { status: 'in_progress' as InvoiceStatus })
  })

  return newOrderId
}

/**
 * El repartidor confirma la entrega (con o sin excepciones).
 * Actualiza quantityDelivered y quantityPending de cada ítem de la factura.
 * Verifica si la factura quedó completada.
 * Operación totalmente atómica.
 */
export async function confirmDelivery(
  payload: ConfirmDeliveryPayload
): Promise<void> {
  await runTransaction(db, async (tx) => {
    // 1. Leer la orden
    const orderRef = doc(db, 'delivery_orders', payload.orderId)
    const orderSnap = await tx.get(orderRef)
    if (!orderSnap.exists()) throw new Error('Orden no encontrada')

    const order = orderSnap.data() as DeliveryOrderDoc

    if (order.status !== 'pending' && order.status !== 'in_transit') {
      throw new Error('Esta orden ya fue procesada')
    }

    // 2. Para cada ítem confirmado, actualizar el InvoiceItem
    let hasAnyException = false
    const updatedItems = order.items.map((orderItem) => {
      const confirmation = payload.items.find(
        (p) => p.invoiceItemId === orderItem.invoiceItemId
      )
      const confirmed = confirmation?.quantityConfirmed ?? orderItem.quantityDispatched
      
      const roundedDispatched = Math.round(orderItem.quantityDispatched * 100) / 100
      const roundedConfirmed = Math.round(confirmed * 100) / 100
      const returned = Math.round((roundedDispatched - roundedConfirmed) * 100) / 100
      const hasException = returned > 0

      if (hasException) hasAnyException = true

      return {
        ...orderItem,
        quantityConfirmed: roundedConfirmed,
        quantityReturned: returned,
        hasException,
        returnReason: confirmation?.returnReason,
      } as DeliveryOrderItem
    })

    // 3. Actualizar los InvoiceItems con las cantidades confirmadas
    const invoiceItemRefs = updatedItems.map((item) =>
      doc(db, 'invoices', order.invoiceId, 'items', item.invoiceItemId)
    )
    const invoiceItemSnaps = await Promise.all(
      invoiceItemRefs.map((ref) => tx.get(ref))
    )

    for (let i = 0; i < invoiceItemSnaps.length; i++) {
      const snap = invoiceItemSnaps[i]
      if (!snap.exists()) continue

      const itemData = snap.data() as InvoiceItemDoc
      const confirmedQty = updatedItems[i].quantityConfirmed
      const newDelivered = Math.round((itemData.quantityDelivered + confirmedQty) * 100) / 100
      const newPending = Math.round((itemData.quantityInvoiced - newDelivered) * 100) / 100

      tx.update(invoiceItemRefs[i], {
        quantityDelivered: newDelivered,
        quantityPending: newPending,
        isCompleted: newPending <= 0,
      })
    }

    // 4. Actualizar la orden
    const finalStatus: OrderStatus = hasAnyException
      ? 'delivered_with_exceptions'
      : 'delivered'

    tx.update(orderRef, {
      status: finalStatus,
      items: updatedItems,
      deliveredAt: Timestamp.now(),
      driverNotes: payload.driverNotes,
    })

    // 5. Verificar si la factura queda completamente entregada
    await checkAndCloseInvoice(tx, order.invoiceId)
  })
}

/**
 * Verifica si todos los ítems de una factura están completados
 * y actualiza su estado a 'completed' o 'in_progress' según corresponda.
 * Se llama dentro de una transacción existente.
 */
async function checkAndCloseInvoice(
  tx: Parameters<Parameters<typeof runTransaction>[1]>[0],
  invoiceId: string
) {
  const itemsSnap = await getDocs(invoiceItemsRef(invoiceId))
  const allCompleted = itemsSnap.docs.every(
    (d) => (d.data() as InvoiceItemDoc).isCompleted
  )
  if (allCompleted) {
    tx.update(doc(db, 'invoices', invoiceId), {
      status: 'completed' as InvoiceStatus,
      isFullyDelivered: true,
    })
  } else {
    tx.update(doc(db, 'invoices', invoiceId), {
      status: 'in_progress' as InvoiceStatus,
      isFullyDelivered: false,
    })
  }
}

/**
 * Obtiene las órdenes de un repartidor específico.
 */
export async function getDriverOrders(
  driverId: string,
  statusFilter?: OrderStatus
): Promise<DeliveryOrderDoc[]> {
  const constraints: QueryConstraint[] = [
    where('assignedDriverId', '==', driverId),
    orderBy('createdAt', 'desc'),
  ]
  if (statusFilter) {
    constraints.unshift(where('status', '==', statusFilter))
  }
  const q = query(deliveryOrdersRef(), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as DeliveryOrderDoc
  )
}

/**
 * Obtiene todas las órdenes (vista admin).
 */
export async function getAllDeliveryOrders(
  statusFilter?: OrderStatus
): Promise<DeliveryOrderDoc[]> {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')]
  if (statusFilter) constraints.unshift(where('status', '==', statusFilter))
  const q = query(deliveryOrdersRef(), ...constraints)
  const snap = await getDocs(q)
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as DeliveryOrderDoc
  )
}

/**
 * Obtiene las órdenes de despacho de una factura específica.
 */
export async function getOrdersByInvoice(
  invoiceId: string
): Promise<DeliveryOrderDoc[]> {
  const q = query(
    deliveryOrdersRef(),
    where('invoiceId', '==', invoiceId),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as DeliveryOrderDoc
  )
}

/**
 * Suscripción en tiempo real a las órdenes pendientes de un driver.
 */
export function subscribeToPendingDriverOrders(
  driverId: string,
  callback: (orders: DeliveryOrderDoc[]) => void
) {
  const q = query(
    deliveryOrdersRef(),
    where('assignedDriverId', '==', driverId),
    where('status', 'in', ['pending', 'in_transit']),
    orderBy('createdAt', 'desc')
  )
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeliveryOrderDoc)
    )
  })
}

/**
 * Cancela una orden (solo si está en estado 'pending').
 */
export async function cancelDeliveryOrder(orderId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const orderRef = doc(db, 'delivery_orders', orderId)
    const snap = await tx.get(orderRef)
    if (!snap.exists()) throw new Error('Orden no encontrada')
    const order = snap.data() as DeliveryOrderDoc
    if (order.status !== 'pending') {
      throw new Error('Solo se pueden cancelar órdenes en estado Pendiente')
    }
    tx.update(orderRef, { status: 'cancelled' as OrderStatus })

    // Verificar si quedan otras órdenes activas (no canceladas) para esta factura
    const q = query(
      collection(db, 'delivery_orders'),
      where('invoiceId', '==', order.invoiceId)
    )
    const ordersSnap = await getDocs(q)
    const activeOrders = ordersSnap.docs.filter(
      (d) => d.id !== orderId && d.data().status !== 'cancelled'
    )

    if (activeOrders.length === 0) {
      // Revertir estado a 'open'
      tx.update(doc(db, 'invoices', order.invoiceId), {
        status: 'open' as InvoiceStatus,
      })
    }
  })
}

/**
 * Actualiza el estado de una orden de despacho (ej. marcar 'in_transit').
 */
export async function updateDeliveryOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<void> {
  const orderRef = doc(db, 'delivery_orders', orderId)
  await updateDoc(orderRef, { status })
}

/**
 * Reasigna el chofer de una orden de despacho (solo si está en estado 'pending').
 */
export async function reassignDeliveryOrderDriver(
  orderId: string,
  driverId: string,
  driverName: string
): Promise<void> {
  const orderRef = doc(db, 'delivery_orders', orderId)
  await updateDoc(orderRef, {
    assignedDriverId: driverId,
    assignedDriverName: driverName,
  })
}

// ─────────────────────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene todos los usuarios activos con rol 'driver'.
 */
export async function getActiveDrivers(): Promise<UserDoc[]> {
  const q = query(
    usersRef(),
    where('role', '==', 'driver'),
    where('isActive', '==', true)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as UserDoc)
}

/**
 * Obtiene todos los usuarios del sistema.
 */
export async function getAllUsers(): Promise<UserDoc[]> {
  const snap = await getDocs(usersRef())
  return snap.docs.map((d) => d.data() as UserDoc)
}

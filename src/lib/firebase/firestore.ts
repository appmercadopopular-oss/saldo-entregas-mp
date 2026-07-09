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
import { toDate } from '@/lib/utils'
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
    where('status', 'in', ['open', 'in_progress'])
  )
  const snap = await getDocs(q)
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvoiceDoc)
  return docs.sort((a, b) => {
    const pA = a.priority ?? Number.MAX_SAFE_INTEGER
    const pB = b.priority ?? Number.MAX_SAFE_INTEGER
    if (pA !== pB) return pA - pB
    return toDate(a.importedAt).getTime() - toDate(b.importedAt).getTime()
  })
}

/**
 * Obtiene todas las facturas (admin panel).
 */
export async function getAllInvoices(
  statusFilter?: InvoiceStatus
): Promise<InvoiceDoc[]> {
  const constraints: QueryConstraint[] = []
  if (statusFilter) constraints.push(where('status', '==', statusFilter))
  const q = query(invoicesRef(), ...constraints)
  const snap = await getDocs(q)
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvoiceDoc)

  return docs.sort((a, b) => {
    if (statusFilter === 'open' || statusFilter === 'in_progress') {
      const pA = a.priority ?? Number.MAX_SAFE_INTEGER
      const pB = b.priority ?? Number.MAX_SAFE_INTEGER
      if (pA !== pB) return pA - pB
      return toDate(a.importedAt).getTime() - toDate(b.importedAt).getTime()
    }
    // Por defecto, orden inverso de importación
    return toDate(b.importedAt).getTime() - toDate(a.importedAt).getTime()
  })
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
  items: Omit<InvoiceItemDoc, 'id'>[],
  immediateDeliveries?: Array<{ sku: string; quantity: number; description: string; unit: string }>,
  adminUser?: { uid: string; displayName: string }
): Promise<string> {
  // Obtener la siguiente prioridad disponible
  let nextPriority = 1
  try {
    const q = query(invoicesRef(), orderBy('priority', 'desc'), limit(1))
    const snap = await getDocs(q)
    if (!snap.empty) {
      const data = snap.docs[0].data() as InvoiceDoc
      nextPriority = (data.priority ?? 0) + 1
    } else {
      const allQuery = query(invoicesRef(), orderBy('importedAt', 'desc'))
      const allSnap = await getDocs(allQuery)
      if (!allSnap.empty) {
        nextPriority = allSnap.size + 1
      }
    }
  } catch (error) {
    console.error('Error fetching max priority for invoice:', error)
  }

  // 1. Process items with immediate deliveries if present
  let hasImmediate = false
  const processedItems = items.map(item => {
    const immediate = immediateDeliveries?.find(i => i.sku === item.sku)
    if (immediate && immediate.quantity > 0) {
      hasImmediate = true
      const qtyDelivered = Math.round(immediate.quantity * 100) / 100
      const qtyPending = Math.max(0, Math.round((item.quantityInvoiced - qtyDelivered) * 100) / 100)
      return {
        ...item,
        quantityDelivered: qtyDelivered,
        quantityPending: qtyPending,
        isCompleted: qtyPending <= 0
      }
    }
    return item
  })

  // Check if invoice itself is fully delivered immediately
  const isFullyDelivered = processedItems.every(i => i.isCompleted)
  const finalStatus: InvoiceStatus = isFullyDelivered ? 'completed' : (hasImmediate ? 'in_progress' : 'open')

  // 2. Crear el documento de la factura
  const invoiceDocRef = await addDoc(invoicesRef(), { 
    ...invoice, 
    priority: nextPriority,
    isFullyDelivered,
    status: finalStatus
  })
  const invoiceId = invoiceDocRef.id

  // 3. Crear todos los ítems en un batch/transacción
  const batch = writeBatch(db)
  
  // Track assigned item IDs for the immediate delivery order
  const savedItemIds: Record<string, string> = {}

  for (const item of processedItems) {
    const itemRef = doc(invoiceItemsRef(invoiceId))
    batch.set(itemRef, item)
    savedItemIds[item.sku] = itemRef.id
  }

  // 4. Si hay entregas inmediatas, crear un despacho completado automáticamente
  if (hasImmediate && immediateDeliveries) {
    const orderItems: DeliveryOrderItem[] = immediateDeliveries
      .filter(d => d.quantity > 0)
      .map(d => ({
        invoiceItemId: savedItemIds[d.sku] ?? '',
        sku: d.sku,
        description: d.description,
        unit: d.unit,
        quantityDispatched: d.quantity,
        quantityConfirmed: d.quantity,
        quantityReturned: 0,
        hasException: false
      }))

    const orderRef = doc(deliveryOrdersRef())
    const newOrder: Omit<DeliveryOrderDoc, 'id'> = {
      invoiceId,
      invoiceReference: invoice.internalReference,
      clientName: invoice.clientName,
      deliveryAddress: invoice.deliveryAddress,
      assignedDriverId: 'immediate_pickup',
      assignedDriverName: 'Retirado en Tienda (Entrega Inmediata)',
      createdBy: adminUser?.uid ?? 'system',
      createdByName: adminUser?.displayName ?? 'System',
      createdAt: Timestamp.now(),
      deliveredAt: Timestamp.now(),
      status: 'delivered',
      items: orderItems,
      adminNotes: 'Entregado físicamente al cliente en la tienda al momento de la compra.',
      priority: 999
    }
    batch.set(orderRef, newOrder)
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

  // 0. Consultar despachos activos para esta factura antes de la transacción (para sumar asignados)
  const qActive = query(
    deliveryOrdersRef(),
    where('invoiceId', '==', payload.invoiceId),
    where('status', 'in', ['pending', 'in_transit'])
  )
  const snapActive = await getDocs(qActive)
  const activeOrders = snapActive.docs.map(doc => doc.data() as DeliveryOrderDoc)

  const allocatedMap = new Map<string, number>()
  for (const order of activeOrders) {
    for (const item of order.items) {
      const current = allocatedMap.get(item.invoiceItemId) || 0
      allocatedMap.set(item.invoiceItemId, current + item.quantityDispatched)
    }
  }

  // Obtener la siguiente prioridad disponible para el despacho
  let nextPriority = 1
  try {
    const q = query(deliveryOrdersRef(), orderBy('priority', 'desc'), limit(1))
    const snap = await getDocs(q)
    if (!snap.empty) {
      const data = snap.docs[0].data() as DeliveryOrderDoc
      nextPriority = (data.priority ?? 0) + 1
    } else {
      const allQuery = query(deliveryOrdersRef(), orderBy('createdAt', 'desc'))
      const allSnap = await getDocs(allQuery)
      if (!allSnap.empty) {
        nextPriority = allSnap.size + 1
      }
    }
  } catch (error) {
    console.error('Error fetching max priority for delivery order:', error)
  }

  await runTransaction(db, async (tx) => {
    // 0. Verificar si la factura existe y no está completada/cancelada
    const invoiceRef = doc(db, 'invoices', payload.invoiceId)
    const invoiceSnap = await tx.get(invoiceRef)
    if (!invoiceSnap.exists()) {
      throw new Error('Factura no encontrada')
    }
    const invoiceData = invoiceSnap.data() as InvoiceDoc
    if (invoiceData.status === 'completed' || invoiceData.isFullyDelivered) {
      throw new Error('Esta factura ya está completamente entregada y no puede generar nuevos despachos.')
    }
    if (invoiceData.status === 'cancelled') {
      throw new Error('Esta factura está cancelada y no puede generar nuevos despachos.')
    }

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
      const allocated = allocatedMap.get(payload.items[i].invoiceItemId) || 0
      const available = Math.max(0, itemData.quantityPending - allocated)
      const roundedAvailable = Math.round(available * 100) / 100

      if (roundedRequested > roundedAvailable) {
        throw new Error(
          `Cantidad solicitada (${requested}) supera el saldo disponible para despacho (${available}) para: ${itemData.description} (Asignado en otras rutas: ${allocated})`
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
      quantityConfirmed: item.quantityDispatched,
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
      priority: nextPriority,
      scheduledDate: payload.scheduledDate,
      scheduledTime: payload.scheduledTime,
    }

    // 3. Crear la orden en Firestore
    const orderRef = doc(collection(db, 'delivery_orders'))
    newOrderId = orderRef.id
    tx.set(orderRef, newOrder)

    // 4. Actualizar el estado de la factura a 'in_progress'
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
  const orderRef = doc(db, 'delivery_orders', payload.orderId)
  const orderSnap = await getDoc(orderRef)
  if (!orderSnap.exists()) throw new Error('Orden no encontrada')

  const order = orderSnap.data() as DeliveryOrderDoc

  if (order.status !== 'pending' && order.status !== 'in_transit') {
    throw new Error('Esta orden ya fue procesada')
  }

  // Obtener todas las referencias de ítems de la factura antes de iniciar la transacción
  const itemsSnap = await getDocs(invoiceItemsRef(order.invoiceId))
  const allItemDocs = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as InvoiceItemDoc)

  await runTransaction(db, async (tx) => {
    // Re-verificar estado de la orden en la transacción
    const txOrderSnap = await tx.get(orderRef)
    if (!txOrderSnap.exists()) throw new Error('Orden no encontrada')
    const txOrder = txOrderSnap.data() as DeliveryOrderDoc
    if (txOrder.status !== 'pending' && txOrder.status !== 'in_transit') {
      throw new Error('Esta orden ya fue procesada')
    }

    // Leer el estado actual de todos los ítems de la factura dentro de la transacción
    const itemRefs = allItemDocs.map((item) =>
      doc(db, 'invoices', order.invoiceId, 'items', item.id)
    )
    const txItemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)))

    const itemsMap = new Map<string, InvoiceItemDoc>()
    for (let i = 0; i < txItemSnaps.length; i++) {
      const snap = txItemSnaps[i]
      if (snap.exists()) {
        itemsMap.set(snap.id, { id: snap.id, ...snap.data() } as InvoiceItemDoc)
      }
    }

    // Para cada ítem entregado, determinar cantidades entregadas y devueltas
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

    // Actualizar los InvoiceItems en la transacción y evaluar si todos están completos (saldo pendiente <= 0)
    let allCompleted = true
    for (const itemDoc of allItemDocs) {
      const currentItem = itemsMap.get(itemDoc.id)
      if (!currentItem) continue

      const deliveryItem = updatedItems.find((u) => u.invoiceItemId === itemDoc.id)
      
      let newDelivered = currentItem.quantityDelivered
      if (deliveryItem) {
        newDelivered = Math.round((currentItem.quantityDelivered + deliveryItem.quantityConfirmed) * 100) / 100
      }
      const newPending = Math.round((currentItem.quantityInvoiced - newDelivered) * 100) / 100
      const itemCompleted = newPending <= 0

      if (!itemCompleted) {
        allCompleted = false
      }

      const ref = doc(db, 'invoices', order.invoiceId, 'items', itemDoc.id)
      tx.update(ref, {
        quantityDelivered: newDelivered,
        quantityPending: newPending,
        isCompleted: itemCompleted,
      })
    }

    // Actualizar la orden de despacho
    const finalStatus: OrderStatus = hasAnyException
      ? 'delivered_with_exceptions'
      : 'delivered'

    tx.update(orderRef, {
      status: finalStatus,
      items: updatedItems,
      deliveredAt: Timestamp.now(),
      driverNotes: payload.driverNotes,
      signatureDataUrl: payload.signatureDataUrl || null,
    })

    // Actualizar la factura
    const invoiceRef = doc(db, 'invoices', order.invoiceId)
    if (allCompleted) {
      tx.update(invoiceRef, {
        status: 'completed' as InvoiceStatus,
        isFullyDelivered: true,
      })
    } else {
      tx.update(invoiceRef, {
        status: 'in_progress' as InvoiceStatus,
        isFullyDelivered: false,
      })
    }
  })
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
  const constraints: QueryConstraint[] = []
  if (statusFilter) constraints.push(where('status', '==', statusFilter))
  const q = query(deliveryOrdersRef(), ...constraints)
  const snap = await getDocs(q)
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeliveryOrderDoc)

  return docs.sort((a, b) => {
    if (statusFilter === 'pending' || statusFilter === 'in_transit') {
      const pA = a.priority ?? Number.MAX_SAFE_INTEGER
      const pB = b.priority ?? Number.MAX_SAFE_INTEGER
      if (pA !== pB) return pA - pB
      return toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime()
    }
    // Por defecto, orden inverso de creación
    return toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime()
  })
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
    where('status', 'in', ['pending', 'in_transit'])
  )
  return onSnapshot(q, (snap) => {
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeliveryOrderDoc)
    docs.sort((a, b) => {
      const pA = a.priority ?? Number.MAX_SAFE_INTEGER
      const pB = b.priority ?? Number.MAX_SAFE_INTEGER
      if (pA !== pB) return pA - pB
      return toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime()
    })
    callback(docs)
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

/**
 * Actualiza las prioridades de facturas en lote.
 */
export async function updateInvoicesPriorities(
  updates: { id: string; priority: number }[]
): Promise<void> {
  const batch = writeBatch(db)
  updates.forEach((u) => {
    batch.update(doc(db, 'invoices', u.id), { priority: u.priority })
  })
  await batch.commit()
}

/**
 * Actualiza las prioridades de despachos en lote.
 */
export async function updateDeliveryOrdersPriorities(
  updates: { id: string; priority: number }[]
): Promise<void> {
  const batch = writeBatch(db)
  updates.forEach((u) => {
    batch.update(doc(db, 'delivery_orders', u.id), { priority: u.priority })
  })
  await batch.commit()
}

/**
 * Actualiza la fecha y hora programada de una orden de despacho.
 */
export async function updateDeliveryOrderScheduledDateTime(
  orderId: string,
  scheduledDate: string,
  scheduledTime: string
): Promise<void> {
  const orderRef = doc(db, 'delivery_orders', orderId)
  await updateDoc(orderRef, {
    scheduledDate: scheduledDate || null,
    scheduledTime: scheduledTime || null,
  })
}

/**
 * Cierra o cancela una factura con saldo pendiente, registrando un motivo.
 */
export async function closeOrCancelInvoice(
  invoiceId: string,
  status: 'completed' | 'cancelled',
  reason: string,
  userUid: string
): Promise<void> {
  await updateDoc(doc(db, 'invoices', invoiceId), {
    status,
    closeReason: reason,
    closedAt: Timestamp.now(),
    closedBy: userUid
  })
}

/**
 * Edita la nota de una factura y guarda el registro en notesHistory para auditoría.
 */
export async function updateInvoiceNotes(
  invoiceId: string,
  newNote: string,
  userUid: string,
  userName: string,
  previousNote: string
): Promise<void> {
  const invoiceRef = doc(db, 'invoices', invoiceId)
  const historyEntry = {
    note: newNote,
    previousNote,
    updatedAt: Timestamp.now(),
    updatedBy: userUid,
    updatedByName: userName
  }
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(invoiceRef)
    if (!snap.exists()) throw new Error('Factura no encontrada')
    const data = snap.data()
    const history = data.notesHistory || []
    tx.update(invoiceRef, {
      notes: newNote,
      notesHistory: [...history, historyEntry]
    })
  })
}

/**
 * Aplica una nota de crédito a una factura en Firestore, reduciendo los saldos pendientes.
 */
export async function applyCreditNoteToInvoice(
  invoiceId: string,
  creditNoteRef: string,
  creditNoteItems: Array<{ sku: string; quantity: number }>,
  userUid: string
): Promise<void> {
  const invoiceRef = doc(db, 'invoices', invoiceId)
  const itemsCollectionRef = invoiceItemsRef(invoiceId)
  
  const itemsSnap = await getDocs(itemsCollectionRef)
  const dbItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as InvoiceItemDoc)

  await runTransaction(db, async (tx) => {
    const invoiceSnap = await tx.get(invoiceRef)
    if (!invoiceSnap.exists()) throw new Error('Factura no encontrada')
    
    const invoiceData = invoiceSnap.get('creditNotes') || []
    
    const alreadyApplied = invoiceData.some((cn: any) => cn.reference === creditNoteRef)
    if (alreadyApplied) {
      throw new Error(`La nota de crédito ${creditNoteRef} ya fue aplicada a esta factura.`)
    }

    let allCompleted = true

    for (const dbItem of dbItems) {
      const cnLine = creditNoteItems.find(cn => cn.sku === dbItem.sku)
      let newPending = dbItem.quantityPending
      
      if (cnLine && cnLine.quantity > 0) {
        newPending = Math.max(0, Math.round((dbItem.quantityPending - cnLine.quantity) * 100) / 100)
      }
      
      const isCompleted = newPending <= 0
      if (!isCompleted) {
        allCompleted = false
      }

      const itemDocRef = doc(db, 'invoices', invoiceId, 'items', dbItem.id)
      tx.update(itemDocRef, {
        quantityPending: newPending,
        isCompleted
      })
    }

    const newCreditNoteLog = {
      reference: creditNoteRef,
      importedAt: Timestamp.now(),
      importedBy: userUid,
      items: creditNoteItems
    }

    tx.update(invoiceRef, {
      creditNotes: [...invoiceData, newCreditNoteLog],
      isFullyDelivered: allCompleted,
      status: allCompleted ? ('completed' as InvoiceStatus) : ('in_progress' as InvoiceStatus)
    })
  })
}


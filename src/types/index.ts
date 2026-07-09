// =============================================================
// TIPOS CENTRALES — FIRESTORE + DOMINIO DE NEGOCIO
// Plataforma de Gestión de Entregas Parciales
// =============================================================

import { Timestamp } from 'firebase/firestore'

// -------------------------------------------------------------
// USUARIOS
// Colección: `users`
// -------------------------------------------------------------

export type UserRole = 'admin' | 'driver'

export interface UserDoc {
  /** UID de Firebase Authentication */
  uid: string
  email: string
  displayName: string
  role: UserRole
  createdAt: Timestamp
  isActive: boolean
  /** Número de teléfono opcional, útil para repartidores */
  phoneNumber?: string
}

// -------------------------------------------------------------
// FACTURAS
// Colección: `invoices`
// -------------------------------------------------------------

export type InvoiceStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'

export interface InvoiceDoc {
  /** ID de documento en Firestore (auto-generado) */
  id: string
  /** ID de la factura en FinanzaPro */
  finanzaproId: string
  /** Número de referencia legible (ej. "FAC-2024-001") */
  internalReference: string
  /** Nombre del cliente */
  clientName: string
  /** ID del cliente en FinanzaPro */
  clientId: string
  /** Dirección de entrega del proyecto */
  deliveryAddress?: string
  /** Fecha de emisión de la factura */
  issueDate: Timestamp
  /** Fecha en que fue importada al sistema */
  importedAt: Timestamp
  /** UID del admin que importó la factura */
  importedBy: string
  /** Estado general de la factura */
  status: InvoiceStatus
  /** Cantidad total de líneas/ítems distintos */
  totalItems: number
  /** true cuando todos los ítems tienen saldo pendiente = 0 */
  isFullyDelivered: boolean
  /** Notas internas opcionales */
  notes?: string
  /** Orden de prioridad numérica (1 = mayor prioridad) */
  priority?: number
  /** Nombre de la empresa asociada a la factura */
  companyName?: string
  /** Motivo de cierre manual con saldo o cancelación */
  closeReason?: string
  /** Fecha de cierre manual */
  closedAt?: Timestamp
  /** UID del administrador que cerró la factura */
  closedBy?: string
  /** Historial de auditoría para cambios en las notas */
  notesHistory?: Array<{
    note: string
    previousNote: string
    updatedAt: Timestamp
    updatedBy: string
    updatedByName: string
  }>
  /** Notas de crédito aplicadas a la factura */
  creditNotes?: Array<{
    reference: string
    importedAt: Timestamp
    importedBy: string
    items: Array<{ sku: string; quantity: number }>
  }>
}

// -------------------------------------------------------------
// ÍTEMS DE FACTURA
// Subcolección: `invoices/{invoiceId}/items`
// -------------------------------------------------------------

export interface InvoiceItemDoc {
  /** ID de documento en Firestore */
  id: string
  /** SKU / código de producto */
  sku: string
  /** Descripción del producto (de FinanzaPro) */
  description: string
  /** Unidad de medida (unidad, kg, m², etc.) */
  unit: string
  /**
   * Cantidad total facturada — INMUTABLE una vez importado.
   * Fuente de verdad del pedido original.
   */
  quantityInvoiced: number
  /**
   * Suma acumulada de todas las cantidades CONFIRMADAS
   * en órdenes de entrega en estado 'delivered' o 'delivered_with_exceptions'.
   * Se actualiza mediante transacciones atómicas de Firestore.
   */
  quantityDelivered: number
  /**
   * Saldo pendiente calculado: quantityInvoiced - quantityDelivered.
   * Se recalcula en cada actualización para facilitar queries.
   */
  quantityPending: number
  /** true cuando quantityPending === 0 */
  isCompleted: boolean
  /** Precio unitario (referencial, de FinanzaPro) */
  unitPrice?: number
}

// -------------------------------------------------------------
// ÓRDENES DE ENTREGA (DESPACHOS)
// Colección: `delivery_orders`
// -------------------------------------------------------------

export type OrderStatus =
  | 'pending'                    // Creada, pendiente de entrega
  | 'in_transit'                 // El repartidor confirmó que salió
  | 'delivered'                  // Entrega completa y confirmada
  | 'delivered_with_exceptions'  // Entregada parcialmente (devoluciones)
  | 'cancelled'                  // Cancelada por el admin

export interface DeliveryOrderItem {
  /** Referencia al ID del InvoiceItemDoc */
  invoiceItemId: string
  sku: string
  description: string
  unit: string
  /**
   * Cantidad que el admin planificó enviar en este viaje.
   * No puede superar el quantityPending del ítem al momento de creación.
   */
  quantityDispatched: number
  /**
   * Cantidad que el cliente realmente recibió y firmó.
   * Igual a quantityDispatched si no hay excepciones.
   * Lo confirma el repartidor en sitio.
   */
  quantityConfirmed: number
  /**
   * Diferencia devuelta: quantityDispatched - quantityConfirmed.
   * > 0 solo si hubo rechazo parcial.
   */
  quantityReturned: number
  /** Motivo de devolución (requerido si quantityReturned > 0) */
  returnReason?: string
  /** true si quantityConfirmed < quantityDispatched */
  hasException: boolean
}

export interface DeliveryOrderDoc {
  /** ID de documento en Firestore */
  id: string
  /** Referencia a la factura padre */
  invoiceId: string
  /** Número de referencia de la factura (desnormalizado para búsquedas) */
  invoiceReference: string
  /** Nombre del cliente (desnormalizado para display rápido) */
  clientName: string
  /** Dirección de entrega */
  deliveryAddress?: string
  /** UID del repartidor asignado */
  assignedDriverId: string
  /** Nombre del repartidor (desnormalizado) */
  assignedDriverName: string
  /** UID del admin que creó la orden */
  createdBy: string
  /** Nombre del admin que creó la orden (desnormalizado) */
  createdByName: string
  /** Timestamp de creación */
  createdAt: Timestamp
  /** Timestamp de cuando el repartidor confirmó la entrega */
  deliveredAt?: Timestamp
  /** Estado actual de la orden */
  status: OrderStatus
  /** Ítems despachados en esta orden (array embebido) */
  items: DeliveryOrderItem[]
  /** Notas del admin para el repartidor */
  adminNotes?: string
  /** Notas del repartidor al confirmar */
  driverNotes?: string
  /** Número secuencial legible (ej. "OD-2024-042") */
  orderNumber?: string
  /** Campos de ubicación de entrega */
  provincia?: string
  canton?: string
  distrito?: string
  /** Orden de prioridad numérica (1 = mayor prioridad) */
  priority?: number
  /** Fecha programada de entrega (YYYY-MM-DD) */
  scheduledDate?: string
  /** Hora programada de entrega (HH:MM) */
  scheduledTime?: string
  /** Firma digital del cliente al recibir (Base64 Data URL) */
  signatureDataUrl?: string
}

// -------------------------------------------------------------
// RESPUESTA DE FINANZAPRO API
// Forma de los datos que retorna el endpoint de FinanzaPro
// (adaptar si la estructura real difiere)
// -------------------------------------------------------------

export interface FinanzaProInvoiceLine {
  /** SKU o código de producto */
  sku: string
  /** Descripción del artículo */
  description: string
  /** Unidad de medida */
  unit: string
  /** Cantidad facturada */
  quantityInvoiced: number
  /** Precio unitario */
  unitPrice: number
  /** Subtotal de la línea */
  subtotal: number
}

export interface FinanzaProInvoice {
  /** ID interno de FinanzaPro */
  id: string
  /** Número de referencia legible */
  internalReference: string
  /** Información del cliente */
  client: {
    id: string
    name: string
    taxId?: string
  }
  /** Fecha de emisión (ISO 8601) */
  issueDate: string
  /** Estado en FinanzaPro */
  status: string
  /** Líneas de la factura */
  lines: FinanzaProInvoiceLine[]
  /** Dirección de entrega si viene en la factura */
  deliveryAddress?: string
  /** Total de la factura */
  totalAmount?: number
  currency?: string
}

export interface FinanzaProApiResponse<T> {
  data: T
  success: boolean
  message?: string
}

// -------------------------------------------------------------
// DTOs — Objetos de transferencia para formularios
// -------------------------------------------------------------

/** Payload para crear una nueva orden de despacho */
export interface CreateDeliveryOrderPayload {
  invoiceId: string
  invoiceReference: string
  clientName: string
  deliveryAddress?: string
  assignedDriverId: string
  assignedDriverName: string
  adminNotes?: string
  provincia?: string
  canton?: string
  distrito?: string
  scheduledDate?: string
  scheduledTime?: string
  items: Array<{
    invoiceItemId: string
    sku: string
    description: string
    unit: string
    quantityDispatched: number
  }>
}

/** Payload para que el repartidor confirme una entrega */
export interface ConfirmDeliveryPayload {
  orderId: string
  driverNotes?: string
  signatureDataUrl?: string
  items: Array<{
    invoiceItemId: string
    quantityConfirmed: number
    returnReason?: string
  }>
}

// -------------------------------------------------------------
// UTILIDADES
// -------------------------------------------------------------

/** Calcula si una orden tiene excepciones basándose en sus ítems */
export function hasOrderExceptions(items: DeliveryOrderItem[]): boolean {
  return items.some((item) => item.hasException)
}

/** Calcula la cantidad total devuelta en una orden */
export function totalReturned(items: DeliveryOrderItem[]): number {
  return items.reduce((acc, item) => acc + item.quantityReturned, 0)
}

/** Etiquetas legibles para los estados */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  in_transit: 'En Tránsito',
  delivered: 'Entregada',
  delivered_with_exceptions: 'Entregada con Excepciones',
  cancelled: 'Cancelada',
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: 'Abierta',
  in_progress: 'En Proceso',
  completed: 'Completada',
  cancelled: 'Cancelada',
}

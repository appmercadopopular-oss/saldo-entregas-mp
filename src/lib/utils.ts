// =============================================================
// UTILIDADES GENERALES
// src/lib/utils.ts
// =============================================================

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Timestamp } from 'firebase/firestore'
import { format, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

// ─────────────────────────────────────────────────────────────
// shadcn/ui helper
// ─────────────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─────────────────────────────────────────────────────────────
// Fechas
// ─────────────────────────────────────────────────────────────

export function toDate(timestamp: any): Date {
  if (!timestamp) return new Date()
  if (timestamp instanceof Date) return timestamp
  
  // If it is a real Firestore Timestamp instance
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate()
  }
  
  // If it is a serialized JSON Timestamp { seconds, nanoseconds }
  if (typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds || 0) / 1000000))
  }
  
  // If it is a ISO string or other date string format
  if (typeof timestamp === 'string') {
    const parsed = new Date(timestamp)
    if (!isNaN(parsed.getTime())) return parsed
  }

  // If it is milliseconds number
  if (typeof timestamp === 'number') {
    return new Date(timestamp)
  }

  return new Date()
}

/**
 * Formatea una fecha para mostrar en UI.
 * Ejemplo: "15 ene. 2024"
 */
export function formatDate(timestamp: Timestamp | Date | undefined): string {
  return format(toDate(timestamp), "d MMM yyyy", { locale: es })
}

/**
 * Formatea fecha y hora.
 * Ejemplo: "15 ene. 2024 — 14:32"
 */
export function formatDateTime(timestamp: Timestamp | Date | undefined): string {
  return format(toDate(timestamp), "d MMM yyyy '—' HH:mm", { locale: es })
}

/**
 * Formatea fecha relativa.
 * Ejemplo: "hace 3 horas"
 */
export function formatRelative(timestamp: Timestamp | Date | undefined): string {
  return formatDistanceToNow(toDate(timestamp), { locale: es, addSuffix: true })
}

// ─────────────────────────────────────────────────────────────
// Números y cantidades
// ─────────────────────────────────────────────────────────────

/**
 * Formatea un número con dos decimales y separador de miles.
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Formatea como moneda (Quetzales).
 */
export function formatCurrency(value: number, currency = 'GTQ'): string {
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency,
  }).format(value)
}

/**
 * Calcula el porcentaje de progreso de entrega.
 * Retorna un número entre 0 y 100.
 */
export function deliveryProgress(
  quantityDelivered: number,
  quantityInvoiced: number
): number {
  if (quantityInvoiced === 0) return 0
  return Math.min(100, Math.round((quantityDelivered / quantityInvoiced) * 100))
}

// ─────────────────────────────────────────────────────────────
// Generadores de IDs legibles
// ─────────────────────────────────────────────────────────────

/**
 * Genera un número de orden legible basado en la fecha.
 * Ejemplo: "OD-20240115-042"
 */
export function generateOrderNumber(sequenceNum: number): string {
  const dateStr = format(new Date(), 'yyyyMMdd')
  const seq = String(sequenceNum).padStart(3, '0')
  return `OD-${dateStr}-${seq}`
}

// ─────────────────────────────────────────────────────────────
// Colores de estado (para badges)
// ─────────────────────────────────────────────────────────────

export type StatusVariant = 'default' | 'success' | 'warning' | 'destructive' | 'secondary'

export function getOrderStatusVariant(status: string): StatusVariant {
  switch (status) {
    case 'delivered':
      return 'success'
    case 'delivered_with_exceptions':
      return 'warning'
    case 'cancelled':
      return 'destructive'
    case 'in_transit':
      return 'secondary'
    default:
      return 'default'
  }
}

export function getInvoiceStatusVariant(status: string): StatusVariant {
  switch (status) {
    case 'completed':
      return 'success'
    case 'in_progress':
      return 'warning'
    case 'cancelled':
      return 'destructive'
    default:
      return 'default'
  }
}

// ─────────────────────────────────────────────────────────────
// Validaciones
// ─────────────────────────────────────────────────────────────

/**
 * Verifica que la cantidad a despachar sea válida.
 */
export function validateDispatchQuantity(
  quantity: number,
  pendingQuantity: number
): { valid: boolean; error?: string } {
  const roundedQty = Math.round(quantity * 100) / 100
  const roundedPending = Math.round(pendingQuantity * 100) / 100

  if (roundedQty <= 0) {
    return { valid: false, error: 'La cantidad debe ser mayor a 0' }
  }
  if (roundedQty > roundedPending) {
    return {
      valid: false,
      error: `No puede superar el saldo pendiente (${formatNumber(pendingQuantity)})`,
    }
  }
  return { valid: true }
}

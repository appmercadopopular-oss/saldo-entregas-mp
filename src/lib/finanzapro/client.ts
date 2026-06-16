// =============================================================
// FINANZAPRO — Cliente del API (server-side only)
// src/lib/finanzapro/client.ts
//
// ⚠️  Este módulo solo debe usarse en:
//    - Route Handlers (app/api/**/route.ts)
//    - Server Actions
//    - getServerSideProps / generateStaticParams
//
// NUNCA importar directamente en Client Components.
// La API Key se mantiene exclusivamente en el servidor.
// =============================================================

import type {
  FinanzaProInvoice,
  FinanzaProApiResponse,
  InvoiceDoc,
  InvoiceItemDoc,
} from '@/types'
import { Timestamp } from 'firebase/firestore'

// ─────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.FINANZAPRO_BASE_URL ?? 'https://api.finanzapro.com'
const API_KEY = process.env.FINANZAPRO_API_KEY ?? ''

if (!API_KEY && process.env.NODE_ENV === 'production') {
  console.error(
    '[FinanzaPro] ⚠️  FINANZAPRO_API_KEY no está configurada. Las importaciones de facturas fallarán.'
  )
}

// ─────────────────────────────────────────────────────────────
// Errores tipados
// ─────────────────────────────────────────────────────────────

export class FinanzaProError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public rawBody?: string
  ) {
    super(message)
    this.name = 'FinanzaProError'
  }
}

// ─────────────────────────────────────────────────────────────
// HTTP Base
// ─────────────────────────────────────────────────────────────

async function finanzaProFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${BASE_URL}${path}`

  console.log(`[FinanzaPro Request] Calling: ${url}`)

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options?.headers,
    },
    next: { revalidate: 60 },
  })

  const rawBody = await response.text()
  console.log('[FinanzaPro Raw Response Body]:', rawBody)

  if (!response.ok) {
    throw new FinanzaProError(
      `FinanzaPro API error ${response.status}: ${response.statusText}`,
      response.status,
      rawBody
    )
  }

  try {
    return JSON.parse(rawBody) as T
  } catch {
    throw new FinanzaProError(
      'Respuesta de FinanzaPro no es JSON válido',
      response.status,
      rawBody
    )
  }
}

// ─────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────

/**
 * Busca una factura por su ID interno de FinanzaPro.
 *
 * Endpoint: GET /invoicing-service/v2/invoices/{id}
 */
export async function fetchInvoiceById(
  id: string
): Promise<FinanzaProInvoice> {
  const response = await finanzaProFetch<any>(
    `/invoicing-service/v2/invoices/${encodeURIComponent(id)}`
  )
  
  // Soporta tanto si la respuesta viene envuelta en { success, data } como si es el objeto directo
  if (response && response.data !== undefined) {
    return response.data
  }
  return response
}

/**
 * Busca una factura por su referencia interna (número de factura visible).
 *
 * Endpoint: GET /invoicing-service/v2/invoices?internalReference={ref}
 */
export async function fetchInvoiceByReference(
  reference: string
): Promise<FinanzaProInvoice> {
  const response = await finanzaProFetch<any>(
    `/invoicing-service/v2/invoices?internalReference=${encodeURIComponent(reference)}&limit=1`
  )

  // Extrae los ítems adaptándose a múltiples estructuras posibles
  let items: any[] = []
  if (response) {
    if (response.data !== undefined) {
      items = response.data.items || response.data
    } else if (response.items !== undefined) {
      items = response.items
    } else if (Array.isArray(response)) {
      items = response
    } else {
      items = [response]
    }
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new FinanzaProError(
      `No se encontró ninguna factura con referencia: ${reference}`,
      404
    )
  }

  return items[0]
}

// ─────────────────────────────────────────────────────────────
// Transformación — FinanzaPro → Modelo interno
// ─────────────────────────────────────────────────────────────

/**
 * Convierte una factura de FinanzaPro al formato interno de Firestore.
 * Inicializa todos los saldos: quantityDelivered = 0, quantityPending = quantityInvoiced.
 *
 * @param raw         Datos crudos de FinanzaPro
 * @param importedBy  UID del admin que está importando
 */
export function transformInvoice(
  raw: any,
  importedBy: string
): {
  invoice: Omit<InvoiceDoc, 'id'>
  items: Omit<InvoiceItemDoc, 'id'>[]
} {
  const invoice: Omit<InvoiceDoc, 'id'> = {
    finanzaproId: raw.id,
    internalReference: raw.internalReference,
    clientName: raw.customerName || raw.client?.name || raw.nameOnInvoice || 'Cliente General',
    clientId: raw.customerId || raw.client?.id || 'CLI-GENERIC',
    deliveryAddress: raw.deliveryAddress || '',
    issueDate: Timestamp.fromDate(new Date(raw.invoiceDate || raw.issueDate || new Date().toISOString())),
    importedAt: Timestamp.now(),
    importedBy,
    status: 'open',
    totalItems: raw.lines ? raw.lines.length : 0,
    isFullyDelivered: false,
    notes: '',
  }

  const items: Omit<InvoiceItemDoc, 'id'>[] = (raw.lines || []).map((line: any) => ({
    sku: line.sku ?? '',
    description: line.description || 'Sin descripción',
    unit: line.unit ?? 'unidad',
    quantityInvoiced: line.quantityInvoiced,
    quantityDelivered: 0,
    quantityPending: line.quantityInvoiced,  // Saldo inicial = total facturado
    isCompleted: false,
    unitPrice: line.price || line.unitPrice || 0,
  }))

  return { invoice, items }
}

// ─────────────────────────────────────────────────────────────
// Función principal: buscar y transformar en un solo paso
// ─────────────────────────────────────────────────────────────

/**
 * Busca una factura en FinanzaPro por ID o referencia y la transforma
 * al modelo interno listo para guardar en Firestore.
 *
 * @param query      ID de FinanzaPro o número de referencia (ej. "FAC-2024-001")
 * @param importedBy UID del admin importador
 * @param mode       'id' | 'reference' — cómo buscar en FinanzaPro
 */
export async function fetchAndTransformInvoice(
  query: string,
  importedBy: string,
  mode: 'id' | 'reference' = 'reference'
): Promise<{
  raw: FinanzaProInvoice
  invoice: Omit<InvoiceDoc, 'id'>
  items: Omit<InvoiceItemDoc, 'id'>[]
}> {
  const raw =
    mode === 'id'
      ? await fetchInvoiceById(query)
      : await fetchInvoiceByReference(query)

  const { invoice, items } = transformInvoice(raw, importedBy)

  return { raw, invoice, items }
}

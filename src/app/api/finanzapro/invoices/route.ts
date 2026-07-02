// =============================================================
// ROUTE HANDLER — FinanzaPro Invoice List by Date Range
// src/app/api/finanzapro/invoices/route.ts
//
// Permite buscar facturas en un rango de fechas.
// Realiza consultas en paralelo día por día y verifica duplicados en Firestore.
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import { fetchInvoicesByDate, FinanzaProError, COMPANIES } from '@/lib/finanzapro/client'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const companyId = searchParams.get('companyId') || 'mercado_popular'
  const company = COMPANIES.find(c => c.id === companyId) || COMPANIES[0]

  // 1. Validar presencia de parámetros
  if (!startDate || !endDate) {
    return NextResponse.json(
      { error: 'Se requieren los parámetros "startDate" y "endDate"' },
      { status: 400 }
    )
  }

  // 2. Validar formato YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return NextResponse.json(
      { error: 'Las fechas deben tener el formato YYYY-MM-DD' },
      { status: 400 }
    )
  }

  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return NextResponse.json(
      { error: 'Las fechas especificadas no son válidas' },
      { status: 400 }
    )
  }

  if (start > end) {
    return NextResponse.json(
      { error: 'La fecha de inicio no puede ser posterior a la fecha de fin' },
      { status: 400 }
    )
  }

  // 3. Validar límite de 31 días
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays > 31) {
    return NextResponse.json(
      { error: 'El rango de fechas no puede ser mayor a 31 días' },
      { status: 400 }
    )
  }

  try {
    // 4. Generar lista de fechas a consultar
    const dateStrings: string[] = []
    const currentDate = new Date(start)
    while (currentDate <= end) {
      const year = currentDate.getFullYear()
      const month = String(currentDate.getMonth() + 1).padStart(2, '0')
      const day = String(currentDate.getDate()).padStart(2, '0')
      dateStrings.push(`${year}-${month}-${day}`)
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // 5. Consultar FinanzaPro en paralelo para cada día
    console.log(`[API/finanzapro/invoices] Querying ${dateStrings.length} days in parallel:`, dateStrings)
    const fetchPromises = dateStrings.map(d => fetchInvoicesByDate(d, company.apiKey))
    const resultsArray = await Promise.all(fetchPromises)

    // Aplanar los resultados
    const rawInvoices = resultsArray.flat()

    // 6. Mapear y limpiar facturas
    const mappedInvoices = rawInvoices.map((item: any) => ({
      id: item.id,
      internalReference: item.internalReference,
      clientName: item.customerName || item.client?.name || item.nameOnInvoice || 'Cliente General',
      clientId: item.customerId || item.client?.id || 'CLI-GENERIC',
      invoiceDate: item.invoiceDate,
      total: item.total || item.totalAmount || 0,
      currency: item.currency || 'CRC',
      alreadyImported: false,
      companyName: company.name
    }))

    // Deduplicar por internalReference
    const seen = new Set<string>()
    let invoices = mappedInvoices.filter(inv => {
      if (!inv.internalReference) return true
      if (seen.has(inv.internalReference)) return false
      seen.add(inv.internalReference)
      return true
    })

    // Ordenar por número de referencia
    invoices.sort((a, b) => (a.internalReference || '').localeCompare(b.internalReference || ''))

    // 7. Verificar en Firestore cuáles ya han sido importadas
    const refs = invoices.map(inv => inv.internalReference).filter(Boolean)
    const existingRefs = new Set<string>()
    const existingMap = new Map<string, string>()

    if (refs.length > 0) {
      // El operador 'in' de Firestore está limitado a 30 elementos.
      // Chunking del array en bloques de 30.
      const chunkSize = 30
      const chunks: string[][] = []
      for (let i = 0; i < refs.length; i += chunkSize) {
        chunks.push(refs.slice(i, i + chunkSize))
      }

      const queryPromises = chunks.map(async (chunk) => {
        const q = query(
          collection(db, 'invoices'),
          where('internalReference', 'in', chunk)
        )
        const snap = await getDocs(q)
        snap.docs.forEach((doc) => {
          const data = doc.data()
          if (data.internalReference) {
            existingRefs.add(data.internalReference)
            existingMap.set(data.internalReference, doc.id)
          }
        })
      })

      await Promise.all(queryPromises)

      // Actualizar bandera alreadyImported y localId
      invoices = invoices.map(inv => ({
        ...inv,
        alreadyImported: inv.internalReference ? existingRefs.has(inv.internalReference) : false,
        localId: inv.internalReference ? (existingMap.get(inv.internalReference) || null) : null
      }))
    }

    return NextResponse.json({
      success: true,
      data: invoices
    })
  } catch (error: any) {
    console.error('[API/finanzapro/invoices ERROR]', error)

    if (error instanceof FinanzaProError) {
      return NextResponse.json(
        { 
          error: error.message, 
          statusCode: error.statusCode,
          rawBody: error.rawBody 
        },
        { status: error.statusCode ?? 502 }
      )
    }

    return NextResponse.json(
      { 
        error: `Error interno al consultar FinanzaPro: ${error.message}`,
        details: error.stack || String(error)
      },
      { status: 500 }
    )
  }
}

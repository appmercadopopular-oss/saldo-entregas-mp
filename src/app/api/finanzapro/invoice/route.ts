// =============================================================
// ROUTE HANDLER — FinanzaPro Invoice Lookup
// src/app/api/finanzapro/invoice/route.ts
//
// Protege la API Key de FinanzaPro manteniéndola en el servidor.
// El frontend llama a este endpoint en lugar de FinanzaPro directamente.
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import {
  fetchAndTransformInvoice,
  fetchCreditNoteByReference,
  FinanzaProError,
  COMPANIES,
} from '@/lib/finanzapro/client'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const reference = searchParams.get('reference')
  const id = searchParams.get('id')
  const companyId = searchParams.get('companyId') || 'mercado_popular'
  const type = searchParams.get('type')

  if (!reference && !id) {
    return NextResponse.json(
      { error: 'Se requiere el parámetro "reference" o "id"' },
      { status: 400 }
    )
  }

  const importedBy = request.headers.get('x-user-uid') ?? 'system'

  try {
    if (type === 'credit-note') {
      if (!reference) {
        return NextResponse.json(
          { error: 'Se requiere el parámetro "reference" para buscar una nota de crédito' },
          { status: 400 }
        )
      }
      const company = COMPANIES.find((c) => c.id === companyId) || COMPANIES[0]
      const raw = await fetchCreditNoteByReference(reference, company.apiKey)
      return NextResponse.json({
        success: true,
        data: {
          raw,
        },
      })
    }

    const result = await fetchAndTransformInvoice(
      (reference ?? id)!,
      importedBy,
      id ? 'id' : 'reference',
      companyId
    )

    return NextResponse.json({
      success: true,
      data: {
        raw: result.raw,
        invoice: result.invoice,
        items: result.items,
      },
    })
  } catch (error: any) {
    console.error('[API/finanzapro ERROR]', error)

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

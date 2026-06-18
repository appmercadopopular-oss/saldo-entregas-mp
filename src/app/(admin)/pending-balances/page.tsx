'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getOpenInvoices, getInvoiceItems } from '@/lib/firebase/firestore'
import { InvoiceDoc, InvoiceItemDoc } from '@/types'
import { formatDate, formatNumber, deliveryProgress } from '@/lib/utils'
import {
  FileText,
  Search,
  Package,
  Truck,
  ArrowRight,
  Loader2,
  AlertCircle,
  TrendingUp,
  Inbox
} from 'lucide-react'

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="progress-bar w-full">
      <div
        className={`progress-bar-fill ${value >= 100 ? 'bg-green-500' : value > 50 ? 'bg-primary' : 'bg-amber-500'}`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

export default function PendingBalancesPage() {
  const [invoices, setInvoices] = useState<InvoiceDoc[]>([])
  const [filtered, setFiltered] = useState<InvoiceDoc[]>([])
  const [invoiceItems, setInvoiceItems] = useState<Record<string, InvoiceItemDoc[]>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const invoicesData = await getOpenInvoices()
        setInvoices(invoicesData)
        setFiltered(invoicesData)
        
        // Fetch items in parallel for all open invoices
        const itemsMap: Record<string, InvoiceItemDoc[]> = {}
        await Promise.all(
          invoicesData.map(async (inv) => {
            const itemsData = await getInvoiceItems(inv.id)
            itemsMap[inv.id] = itemsData
          })
        )
        setInvoiceItems(itemsMap)
      } catch (err) {
        console.error('Error loading pending balances:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(invoices)
      return
    }
    const s = search.toLowerCase()
    const result = invoices.filter(
      (inv) =>
        inv.internalReference.toLowerCase().includes(s) ||
        inv.clientName.toLowerCase().includes(s)
    )
    setFiltered(result)
  }, [search, invoices])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const totalPendingInvoices = filtered.length

  return (
    <div className="space-y-6">
      {/* Header and Stats */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Saldos Pendientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Dashboard enfocado en facturas activas con saldo por entregar
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por factura o cliente..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      {totalPendingInvoices === 0 ? (
        <div className="bg-card rounded-xl border border-border p-16 text-center shadow-sm">
          <Inbox className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground font-semibold">No hay facturas con saldos pendientes</p>
          <p className="text-xs text-muted-foreground/60 mt-1">¡Todas las entregas están completadas al 100%!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((inv) => {
            const items = invoiceItems[inv.id] || []
            const pendingItems = items.filter((i) => i.quantityPending > 0)
            const totalInvoiced = items.reduce((s, i) => s + i.quantityInvoiced, 0)
            const totalDelivered = items.reduce((s, i) => s + i.quantityDelivered, 0)
            const progress = deliveryProgress(totalDelivered, totalInvoiced)

            return (
              <div
                key={inv.id}
                className="bg-card rounded-xl border border-border shadow-sm flex flex-col justify-between overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Card Header */}
                <div className="p-5 border-b border-border bg-muted/20">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary" />
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="text-base font-bold text-foreground hover:underline"
                        >
                          {inv.internalReference}
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Emitida: {formatDate(inv.issueDate)}</div>
                    </div>
                    <span className="text-xs font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1 rounded-full border border-amber-200 dark:border-amber-900/50">
                      {inv.status === 'open' ? 'Abierta' : 'En Proceso'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-foreground mt-3 truncate">{inv.clientName}</p>
                </div>

                {/* Progress bar */}
                <div className="p-5 pb-3 border-b border-border">
                  <div className="flex items-center justify-between mb-2 text-xs">
                    <span className="font-semibold text-muted-foreground">Progreso de Entrega</span>
                    <span className="font-bold text-foreground">{progress}%</span>
                  </div>
                  <ProgressBar value={progress} />
                </div>

                {/* Pending Items List */}
                <div className="p-5 flex-1 min-h-[140px] max-h-[220px] overflow-y-auto scrollbar-thin">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    Ítems pendientes por entregar
                  </div>
                  {pendingItems.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground py-8">
                      Cargando ítems...
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pendingItems.map((item) => (
                        <div key={item.id} className="text-xs bg-muted/30 p-2.5 rounded-lg border border-border/50">
                          <div className="font-bold text-foreground truncate">{item.description}</div>
                          <div className="flex items-center justify-between text-muted-foreground mt-1">
                            <span>SKU: {item.sku || '—'}</span>
                            <span className="font-semibold text-amber-600">
                              Pendiente: {formatNumber(item.quantityPending)} de {formatNumber(item.quantityInvoiced)} {item.unit}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-4 bg-muted/20 border-t border-border flex items-center justify-between gap-3">
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="flex-1 py-2 text-center text-xs font-semibold text-muted-foreground hover:text-foreground border border-border bg-background rounded-lg hover:bg-muted transition-all"
                  >
                    Ver detalle
                  </Link>
                  <Link
                    href={`/invoices/${inv.id}/dispatch`}
                    className="flex-1 py-2 text-center text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    Crear Despacho
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

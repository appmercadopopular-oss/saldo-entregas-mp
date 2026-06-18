'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  getInvoiceById, getInvoiceItems, getOrdersByInvoice, subscribeToInvoiceItems
} from '@/lib/firebase/firestore'
import { InvoiceDoc, InvoiceItemDoc, DeliveryOrderDoc, INVOICE_STATUS_LABELS, ORDER_STATUS_LABELS } from '@/types'
import { formatDate, formatDateTime, formatNumber, deliveryProgress } from '@/lib/utils'
import {
  ArrowLeft, Plus, FileText, Package, Truck, CheckCircle2,
  Clock, AlertTriangle, ChevronDown, ChevronUp
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

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const [invoice, setInvoice] = useState<InvoiceDoc | null>(null)
  const [items, setItems] = useState<InvoiceItemDoc[]>([])
  const [orders, setOrders] = useState<DeliveryOrderDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [inv, ord] = await Promise.all([
        getInvoiceById(invoiceId),
        getOrdersByInvoice(invoiceId),
      ])
      setInvoice(inv)
      setOrders(ord)
      setLoading(false)
    }
    load()

    // Real-time items subscription
    const unsub = subscribeToInvoiceItems(invoiceId, setItems)
    return () => unsub()
  }, [invoiceId])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!invoice) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Factura no encontrada</p>
      <Link href="/invoices" className="text-primary text-sm hover:underline mt-2 inline-block">← Volver</Link>
    </div>
  )

  const totalInvoiced = items.reduce((s, i) => s + i.quantityInvoiced, 0)
  const totalDelivered = items.reduce((s, i) => s + i.quantityDelivered, 0)
  const totalPending = items.reduce((s, i) => s + i.quantityPending, 0)
  const overallProgress = deliveryProgress(totalDelivered, totalInvoiced)
  const completedItems = items.filter((i) => i.isCompleted).length
  const canDispatch = (invoice.status === 'open' || invoice.status === 'in_progress') && items.some((i) => i.quantityPending > 0)

  const STATUS_STYLES: Record<string, string> = {
    open: 'badge-info',
    in_progress: 'badge-warning',
    completed: 'badge-success',
    cancelled: 'badge-destructive'
  }
  const ORDER_STATUS_STYLES: Record<string, string> = {
    pending: 'badge-warning', in_transit: 'badge-info',
    delivered: 'badge-success', delivered_with_exceptions: 'bg-orange-100 text-orange-800',
    cancelled: 'badge-destructive'
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back */}
      <Link href="/invoices" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />Volver a Facturas
      </Link>

      {/* Header */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
              <FileText className="w-7 h-7 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">{invoice.internalReference}</h1>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[invoice.status]}`}>
                  {INVOICE_STATUS_LABELS[invoice.status]}
                </span>
              </div>
              <p className="text-muted-foreground mt-1">{invoice.clientName}</p>
              {invoice.deliveryAddress && (
                <p className="text-sm text-muted-foreground mt-0.5">📍 {invoice.deliveryAddress}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">Emitida: {formatDate(invoice.issueDate)}</p>
              {invoice.notes && (
                <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 max-w-xl">
                  <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Nota del Vendedor / Importación</p>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-0.5">{invoice.notes}</p>
                </div>
              )}
            </div>
          </div>
          {canDispatch && (
            <Link
              href={`/invoices/${invoiceId}/dispatch`}
              id="btn-create-dispatch"
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-md text-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Crear Despacho
            </Link>
          )}
        </div>

        {/* Progress summary */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Progreso general de entrega</span>
            <span className="text-sm font-bold text-foreground">{overallProgress}%</span>
          </div>
          <ProgressBar value={overallProgress} />
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="text-center">
              <div className="text-lg font-bold text-foreground">{formatNumber(totalInvoiced)}</div>
              <div className="text-xs text-muted-foreground">Total Facturado</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">{formatNumber(totalDelivered)}</div>
              <div className="text-xs text-muted-foreground">Entregado</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-amber-600">{formatNumber(totalPending)}</div>
              <div className="text-xs text-muted-foreground">Saldo Pendiente</div>
            </div>
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Ítems y Saldos
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {completedItems} de {items.length} ítems completados
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Producto</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Facturado</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Entregado</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Pendiente</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-40">Progreso</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => {
                const pct = deliveryProgress(item.quantityDelivered, item.quantityInvoiced)
                return (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-foreground">{item.description}</div>
                      <div className="text-xs text-muted-foreground font-mono">{item.sku || '—'} · {item.unit}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-right text-foreground">{formatNumber(item.quantityInvoiced)}</td>
                    <td className="px-4 py-4 text-sm text-right text-green-600 font-medium">{formatNumber(item.quantityDelivered)}</td>
                    <td className={`px-4 py-4 text-sm text-right font-bold ${item.quantityPending > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                      {formatNumber(item.quantityPending)}
                    </td>
                    <td className="px-4 py-4 w-40">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={pct} />
                        <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {item.isCompleted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />Completo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded-full">
                          <Clock className="w-3 h-3" />Pendiente
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delivery orders history */}
      {orders.length > 0 && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              Historial de Despachos ({orders.length})
            </h2>
          </div>
          <div className="divide-y divide-border">
            {orders.map((order) => (
              <div key={order.id}>
                <button
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <div className="text-sm font-medium text-foreground">
                        {order.assignedDriverName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(order.createdAt)}
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_STYLES[order.status]}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                    {order.status === 'delivered_with_exceptions' && (
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                    )}
                  </div>
                  {expandedOrder === order.id
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  }
                </button>
                {expandedOrder === order.id && (
                  <div className="px-6 pb-4 bg-muted/20">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm mt-2">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Producto</th>
                            <th className="text-right text-xs font-medium text-muted-foreground pb-2 pr-4">Despachado</th>
                            <th className="text-right text-xs font-medium text-muted-foreground pb-2 pr-4">Confirmado</th>
                            <th className="text-right text-xs font-medium text-muted-foreground pb-2">Devuelto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {order.items.map((item, i) => (
                            <tr key={i}>
                              <td className="py-2 pr-4 text-foreground">{item.description}</td>
                              <td className="py-2 pr-4 text-right text-muted-foreground">{formatNumber(item.quantityDispatched)}</td>
                              <td className="py-2 pr-4 text-right text-green-600 font-medium">{formatNumber(item.quantityConfirmed)}</td>
                              <td className={`py-2 text-right font-medium ${item.quantityReturned > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                                {formatNumber(item.quantityReturned)}
                                {item.returnReason && (
                                  <div className="text-xs text-muted-foreground font-normal">({item.returnReason})</div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {order.driverNotes && (
                      <div className="mt-3 text-xs text-muted-foreground bg-muted p-3 rounded-lg">
                        <span className="font-medium">Nota del repartidor:</span> {order.driverNotes}
                      </div>
                    )}
                    <Link href={`/delivery-orders/${order.id}`} className="text-xs text-primary hover:underline mt-3 inline-block">
                      Ver orden completa →
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

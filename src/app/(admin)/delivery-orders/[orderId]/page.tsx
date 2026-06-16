'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { cancelDeliveryOrder } from '@/lib/firebase/firestore'
import { DeliveryOrderDoc, ORDER_STATUS_LABELS } from '@/types'
import { formatDateTime, formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ArrowLeft, Printer, Trash2, Truck, User, Calendar, MapPin,
  FileText, Package, Clock, CheckCircle2, AlertTriangle, XCircle, Info
} from 'lucide-react'

const STATUS_BADGES: Record<string, string> = {
  pending: 'badge-warning',
  in_transit: 'badge-info',
  delivered: 'badge-success',
  delivered_with_exceptions: 'bg-orange-100 text-orange-850 dark:bg-orange-950/20 dark:text-orange-400',
  cancelled: 'badge-destructive',
}

export default function AdminOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<DeliveryOrderDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    // Suscribirse en tiempo real al estado de la orden
    const unsub = onSnapshot(doc(db, 'delivery_orders', orderId), (snap) => {
      if (snap.exists()) {
        setOrder({ id: snap.id, ...snap.data() } as DeliveryOrderDoc)
      } else {
        setOrder(null)
      }
      setLoading(false)
    }, (err) => {
      console.error(err)
      toast.error('Error al cargar la orden de despacho')
      setLoading(false)
    })

    return () => unsub()
  }, [orderId])

  async function handleCancelOrder() {
    if (!order) return
    const confirmCancel = window.confirm(
      '¿Está seguro de que desea cancelar esta orden de despacho? Esto revertirá los ítems al saldo pendiente de la factura.'
    )
    if (!confirmCancel) return

    setCancelling(true)
    try {
      await cancelDeliveryOrder(order.id)
      toast.success('Orden de despacho cancelada exitosamente')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cancelar la orden')
    } finally {
      setCancelling(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 print:hidden">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!order) return (
    <div className="text-center py-16 print:hidden">
      <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
      <p className="text-muted-foreground font-semibold">Orden no encontrada</p>
      <Link href="/delivery-orders" className="text-primary text-sm hover:underline mt-2 inline-block">
        ← Volver a Despachos
      </Link>
    </div>
  )

  const isPending = order.status === 'pending'
  const isCancelled = order.status === 'cancelled'
  const totalItemsCount = order.items.reduce((acc, i) => acc + i.quantityDispatched, 0)
  const totalReturnedCount = order.items.reduce((acc, i) => acc + i.quantityReturned, 0)
  const hasExceptions = order.status === 'delivered_with_exceptions'

  return (
    <div className="space-y-6 max-w-4xl animate-enter">
      {/* Print-only CSS style injection */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
            font-size: 12px !important;
          }
          /* Hide non-printable elements */
          aside, header, nav, button, .print\\:hidden, .no-print, [role="button"] {
            display: none !important;
          }
          /* Expand printable area */
          .page-container, main, .max-w-4xl {
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
          }
          .bg-card, .border {
            border: 1px solid #ddd !important;
            background: transparent !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .bg-brand-gradient {
            background: #f3f4f6 !important;
            color: black !important;
            border-bottom: 2px solid #000 !important;
          }
          .text-white {
            color: black !important;
          }
          .text-white\\/70 {
            color: #4b5563 !important;
          }
          /* Print Layout */
          .print-voucher-header {
            display: block !important;
            margin-bottom: 20px;
          }
          .print-signature-block {
            display: grid !important;
            grid-template-cols: 1fr 1fr !important;
            gap: 40px !important;
            margin-top: 60px !important;
            page-break-inside: avoid;
          }
        }
        @media screen {
          .print-voucher-header, .print-signature-block {
            display: none;
          }
        }
      `}</style>

      {/* Screen navigation */}
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link
          href="/delivery-orders"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Despachos
        </Link>
        <div className="flex gap-2">
          {isPending && (
            <button
              onClick={handleCancelOrder}
              disabled={cancelling}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Cancelar Despacho
            </button>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-foreground bg-card border border-border hover:bg-muted rounded-lg shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            Imprimir Vale
          </button>
        </div>
      </div>

      {/* Printable voucher header */}
      <div className="print-voucher-header">
        <div className="flex justify-between items-start border-b-2 border-black pb-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">SALDO ENTREGAS — VALE DE DESPACHO</h1>
            <p className="text-xs text-gray-500 mt-1">Control de Entregas Parciales y Saldos</p>
          </div>
          <div className="text-right">
            <div className="text-sm font-bold">Orden No: {order.orderNumber || order.id.substring(0, 8).toUpperCase()}</div>
            <div className="text-xs text-gray-600 mt-0.5">Fecha: {formatDateTime(order.createdAt)}</div>
          </div>
        </div>
      </div>

      {/* Main Order Details Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="bg-brand-gradient p-6 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Truck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="text-xs text-white/70">Orden de Despacho</div>
              <h2 className="text-xl font-bold text-white leading-tight">
                {order.invoiceReference}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${STATUS_BADGES[order.status]}`}>
              {ORDER_STATUS_LABELS[order.status]}
            </span>
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          {/* Col 1 */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <User className="w-4.5 h-4.5 text-muted-foreground flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Cliente</div>
                <div className="font-semibold text-foreground">{order.clientName}</div>
              </div>
            </div>

            {order.deliveryAddress && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4.5 h-4.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs text-muted-foreground">Dirección de Entrega</div>
                  <div className="font-semibold text-foreground">{order.deliveryAddress}</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Calendar className="w-4.5 h-4.5 text-muted-foreground flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Fecha Planificada</div>
                <div className="font-semibold text-foreground">{formatDateTime(order.createdAt)}</div>
              </div>
            </div>
          </div>

          {/* Col 2 */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-3">
              <Truck className="w-4.5 h-4.5 text-muted-foreground flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Repartidor Asignado</div>
                <div className="font-semibold text-foreground">{order.assignedDriverName}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <FileText className="w-4.5 h-4.5 text-muted-foreground flex-shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground">Planificado por</div>
                <div className="font-semibold text-foreground">{order.createdByName}</div>
              </div>
            </div>

            {order.deliveredAt && (
              <div className="flex items-center gap-3">
                <Clock className="w-4.5 h-4.5 text-muted-foreground flex-shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground">Fecha de Entrega</div>
                  <div className="font-semibold text-foreground text-green-600">
                    {formatDateTime(order.deliveredAt)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* System info bar screen-only */}
        {isCancelled && (
          <div className="bg-red-50 dark:bg-red-950/20 border-t border-red-100 dark:border-red-900/30 p-4 flex items-center gap-3 text-sm text-red-800 dark:text-red-400 print:hidden">
            <XCircle className="w-5 h-5 flex-shrink-0" />
            <span>Esta orden fue cancelada. Las cantidades planificadas no fueron contabilizadas y están disponibles en la factura de origen.</span>
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="p-5 border-b border-border bg-muted/20">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Ítems del Despacho
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left text-xs font-semibold text-muted-foreground px-6 py-3">Artículo</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Enviado</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Recibido</th>
                <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-3">Devuelto</th>
                <th className="text-left text-xs font-semibold text-muted-foreground px-6 py-3 w-48">Excepción / Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {order.items.map((item, index) => (
                <tr
                  key={index}
                  className={`hover:bg-muted/10 transition-colors ${
                    item.hasException ? 'bg-red-50/50 dark:bg-red-900/5' : ''
                  }`}
                >
                  <td className="px-6 py-4">
                    <div className="font-semibold text-foreground">{item.description}</div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {item.sku} · {item.unit}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-foreground">
                    {formatNumber(item.quantityDispatched)}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold text-green-600">
                    {formatNumber(item.quantityConfirmed)}
                  </td>
                  <td
                    className={`px-4 py-4 text-right font-semibold ${
                      item.quantityReturned > 0 ? 'text-red-650' : 'text-muted-foreground'
                    }`}
                  >
                    {formatNumber(item.quantityReturned)}
                  </td>
                  <td className="px-6 py-4">
                    {item.hasException ? (
                      <div className="space-y-1">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full uppercase">
                          <AlertTriangle className="w-2.5 h-2.5" /> Devolución
                        </span>
                        <div className="text-xs text-red-700 font-medium">
                          {item.returnReason || 'Sin motivo especificado'}
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full uppercase">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Conforme
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes block */}
      {(order.adminNotes || order.driverNotes) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {order.adminNotes && (
            <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Instrucciones del Admin
              </h4>
              <p className="text-sm text-foreground italic bg-muted/40 p-3 rounded-lg border border-border/50">
                &ldquo;{order.adminNotes}&rdquo;
              </p>
            </div>
          )}
          {order.driverNotes && (
            <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Comentarios del Repartidor
              </h4>
              <p className="text-sm text-foreground italic bg-muted/40 p-3 rounded-lg border border-border/50">
                &ldquo;{order.driverNotes}&rdquo;
              </p>
            </div>
          )}
        </div>
      )}

      {/* Printable signature fields */}
      <div className="print-signature-block">
        <div className="flex flex-col items-center">
          <div className="w-64 border-b border-black mt-16"></div>
          <div className="text-xs font-bold mt-2 text-center">Firma de Recibido del Cliente</div>
          <div className="text-[10px] text-gray-500 mt-1 text-center">
            Nombre y DPI/Identificación
          </div>
          <div className="text-[10px] text-gray-500 text-center">Fecha y Hora: ____/____/________  ____:____</div>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-64 border-b border-black mt-16"></div>
          <div className="text-xs font-bold mt-2 text-center">Firma del Repartidor</div>
          <div className="text-[10px] text-gray-500 mt-1 text-center">
            {order.assignedDriverName}
          </div>
          <div className="text-[10px] text-gray-500 text-center">Despachado desde Bodega Central</div>
        </div>
      </div>

      {/* Invoiced relation bar screen-only */}
      <div className="bg-muted/40 border border-border rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3 text-sm">
          <Info className="w-5 h-5 text-primary" />
          <div>
            <span className="font-semibold">Factura origen: </span>
            <span className="text-muted-foreground">{order.invoiceReference}</span>
          </div>
        </div>
        <Link
          href={`/invoices/${order.invoiceId}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Ver saldos acumulados de la factura →
        </Link>
      </div>
    </div>
  )
}

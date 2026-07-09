'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getOpenInvoices, getAllDeliveryOrders } from '@/lib/firebase/firestore'
import { InvoiceDoc, DeliveryOrderDoc } from '@/types'
import { formatDate, formatRelative, getOrderStatusVariant, deliveryProgress, toDate } from '@/lib/utils'
import {
  FileText, Truck, Clock, CheckCircle2, AlertTriangle,
  Plus, ArrowRight, TrendingUp, Package, Calendar
} from 'lucide-react'
import { ORDER_STATUS_LABELS, INVOICE_STATUS_LABELS } from '@/types'

function StatCard({
  icon: Icon, label, value, sub, color
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color: string
}) {
  return (
    <div className="stat-card flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-sm font-medium text-foreground mt-0.5">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </div>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  delivered_with_exceptions: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<InvoiceDoc[]>([])
  const [orders, setOrders] = useState<DeliveryOrderDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [inv, ord] = await Promise.all([
        getOpenInvoices(),
        getAllDeliveryOrders(),
      ])
      setInvoices(inv)
      setOrders(ord)
      setLoading(false)
    }
    load()
  }, [])

  const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'in_transit')
  const deliveredToday = orders.filter((o) => {
    if (!o.deliveredAt) return false
    const d = toDate(o.deliveredAt)
    const today = new Date()
    return d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
  })
  const withExceptions = orders.filter((o) => o.status === 'delivered_with_exceptions')

  const recentOrders = [...orders]
    .sort((a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime())
    .slice(0, 5)

  const scheduledOrders = orders
    .filter((o) => (o.status === 'pending' || o.status === 'in_transit') && o.scheduledDate)
    .sort((a, b) => {
      const dateA = `${a.scheduledDate}T${a.scheduledTime || '00:00'}`
      const dateB = `${b.scheduledDate}T${b.scheduledTime || '00:00'}`
      return dateA.localeCompare(dateB)
    })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="Facturas Abiertas"
          value={invoices.length}
          sub="con saldo pendiente"
          color="bg-blue-100 text-blue-600"
        />
        <StatCard
          icon={Clock}
          label="Despachos Pendientes"
          value={pendingOrders.length}
          sub="en cola o en tránsito"
          color="bg-amber-100 text-amber-600"
        />
        <StatCard
          icon={CheckCircle2}
          label="Entregados Hoy"
          value={deliveredToday.length}
          sub="órdenes completadas"
          color="bg-green-100 text-green-600"
        />
        <StatCard
          icon={AlertTriangle}
          label="Con Excepciones"
          value={withExceptions.length}
          sub="requieren revisión"
          color="bg-red-100 text-red-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Open Invoices */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border shadow-sm">
          <div className="section-header p-6 pb-0">
            <div>
              <h2 className="text-base font-bold text-foreground">Facturas con Saldo Pendiente</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{invoices.length} facturas activas</p>
            </div>
            <Link
              href="/invoices/import"
              className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Importar
            </Link>
          </div>

          {invoices.length === 0 ? (
            <div className="p-12 text-center">
              <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No hay facturas abiertas</p>
              <Link href="/invoices/import" className="text-primary text-sm hover:underline mt-2 inline-block">
                Importar primera factura →
              </Link>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {invoices.slice(0, 6).map((inv) => (
                <Link
                  key={inv.id}
                  href={`/invoices/${inv.id}`}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                >
                  <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {inv.internalReference}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{inv.clientName}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs text-muted-foreground">{formatDate(inv.issueDate)}</div>
                    <div className="text-xs text-primary font-medium mt-0.5">{inv.totalItems} ítems</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0" />
                </Link>
              ))}
              {invoices.length > 6 && (
                <Link
                  href="/invoices"
                  className="block text-center text-sm text-primary hover:underline py-2"
                >
                  Ver todas las facturas ({invoices.length}) →
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Sidebar panels */}
        <div className="space-y-6">
          {/* Scheduled Dispatches */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 pb-4 border-b border-border">
              <h2 className="text-base font-bold text-foreground">Despachos Programados</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Próximas entregas planificadas</p>
            </div>
            <div className="p-4 space-y-3">
              {scheduledOrders.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">No hay despachos programados</p>
              ) : (
                scheduledOrders.slice(0, 5).map((order) => (
                  <Link
                    key={order.id}
                    href={`/delivery-orders/${order.id}`}
                    className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="w-8 h-8 bg-amber-50 dark:bg-amber-950/20 rounded-lg flex items-center justify-center flex-shrink-0 text-amber-600">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">
                        {order.clientName}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        Factura: {order.invoiceReference} · Chofer: {order.assignedDriverName}
                      </div>
                      <div className="text-xs font-medium text-amber-600 mt-1 flex items-center gap-1">
                        📅 {order.scheduledDate} {order.scheduledTime ? `a las ${order.scheduledTime}` : ''}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
            <div className="p-4 border-t border-border">
              <Link
                href="/calendar"
                className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:underline"
              >
                Ver calendario de despachos <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Recent Orders */}
          <div className="bg-card rounded-xl border border-border shadow-sm">
            <div className="p-6 pb-4 border-b border-border">
              <h2 className="text-base font-bold text-foreground">Órdenes Recientes</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Últimas 5 actividades</p>
            </div>
            <div className="p-4 space-y-3">
              {recentOrders.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">Sin órdenes aún</p>
              ) : (
                recentOrders.map((order) => (
                  <Link
                    key={order.id}
                    href={`/delivery-orders/${order.id}`}
                    className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      order.status === 'delivered' ? 'bg-green-500' :
                      order.status === 'pending' ? 'bg-amber-500' :
                      order.status === 'in_transit' ? 'bg-blue-500' :
                      order.status === 'delivered_with_exceptions' ? 'bg-orange-500' :
                      'bg-red-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">
                        {order.invoiceReference}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{order.assignedDriverName}</div>
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        {formatRelative(order.createdAt)}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[order.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </Link>
                ))
              )}
            </div>
            <div className="p-4 border-t border-border">
              <Link
                href="/delivery-orders"
                className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:underline"
              >
                Ver todas las órdenes <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

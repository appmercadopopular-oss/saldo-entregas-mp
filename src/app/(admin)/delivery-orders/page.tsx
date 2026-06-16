'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllDeliveryOrders } from '@/lib/firebase/firestore'
import { DeliveryOrderDoc, OrderStatus, ORDER_STATUS_LABELS } from '@/types'
import { formatDateTime, formatRelative } from '@/lib/utils'
import { Truck, Search, AlertTriangle, CheckCircle2, Clock, Package } from 'lucide-react'

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'badge-warning',
  in_transit: 'badge-info',
  delivered: 'badge-success',
  delivered_with_exceptions: 'bg-orange-100 text-orange-800',
  cancelled: 'badge-destructive',
}

const STATUS_ICONS: Record<OrderStatus, React.ElementType> = {
  pending: Clock,
  in_transit: Truck,
  delivered: CheckCircle2,
  delivered_with_exceptions: AlertTriangle,
  cancelled: Package,
}

export default function DeliveryOrdersPage() {
  const [orders, setOrders] = useState<DeliveryOrderDoc[]>([])
  const [filtered, setFiltered] = useState<DeliveryOrderDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')

  useEffect(() => {
    getAllDeliveryOrders().then((data) => {
      setOrders(data)
      setFiltered(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    let result = orders
    if (statusFilter !== 'all') result = result.filter((o) => o.status === statusFilter)
    if (search.trim()) {
      const s = search.toLowerCase()
      result = result.filter(
        (o) =>
          o.invoiceReference.toLowerCase().includes(s) ||
          o.clientName.toLowerCase().includes(s) ||
          o.assignedDriverName.toLowerCase().includes(s)
      )
    }
    setFiltered(result)
  }, [search, statusFilter, orders])

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'in_transit', 'delivered', 'delivered_with_exceptions', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all' ? 'Todas' : ORDER_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por factura, cliente, repartidor..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Truck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No se encontraron órdenes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Factura</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Cliente</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Repartidor</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Estado</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Ítems</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Creada</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((order) => {
                  const Icon = STATUS_ICONS[order.status] ?? Truck
                  return (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Truck className="w-4 h-4 text-primary" />
                          </div>
                          <span className="text-sm font-semibold text-foreground">{order.invoiceReference}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-foreground">{order.clientName}</td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{order.assignedDriverName}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[order.status]}`}>
                          <Icon className="w-3 h-3" />
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-muted-foreground">{order.items.length}</td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">{formatRelative(order.createdAt)}</td>
                      <td className="px-4 py-4">
                        <Link
                          href={`/delivery-orders/${order.id}`}
                          className="text-xs text-primary font-medium hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Ver →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground text-right">{filtered.length} de {orders.length} órdenes</p>
    </div>
  )
}

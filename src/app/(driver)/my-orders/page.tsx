'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { subscribeToPendingDriverOrders } from '@/lib/firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { DeliveryOrderDoc, ORDER_STATUS_LABELS } from '@/types'
import { formatDate, formatRelative } from '@/lib/utils'
import { Truck, Clock, MapPin, Package, ChevronRight, CheckCircle2 } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  pending: 'border-l-amber-400 bg-amber-50 dark:bg-amber-900/10',
  in_transit: 'border-l-blue-400 bg-blue-50 dark:bg-blue-900/10',
}

export default function MyOrdersPage() {
  const { firebaseUser } = useAuth()
  const [orders, setOrders] = useState<DeliveryOrderDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!firebaseUser) return
    const unsub = subscribeToPendingDriverOrders(firebaseUser.uid, (data) => {
      setOrders(data)
      setLoading(false)
    })
    return () => unsub()
  }, [firebaseUser])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Mis Órdenes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {orders.length === 0
            ? 'No tienes órdenes pendientes'
            : `${orders.length} orden${orders.length !== 1 ? 'es' : ''} asignada${orders.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-foreground">¡Todo al día!</h2>
          <p className="text-muted-foreground text-sm mt-2">
            No tienes órdenes pendientes de entrega en este momento.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/my-orders/${order.id}`}
              className={`block bg-card rounded-xl border border-border border-l-4 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${STATUS_COLORS[order.status] ?? ''}`}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-foreground">{order.invoiceReference}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        order.status === 'pending'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </div>
                    <p className="text-sm text-foreground font-medium mt-1">{order.clientName}</p>

                    {order.deliveryAddress && (
                      <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{order.deliveryAddress}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Package className="w-3.5 h-3.5" />
                        {order.items.length} ítem{order.items.length !== 1 ? 's' : ''}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {formatRelative(order.createdAt)}
                      </div>
                    </div>

                    {order.adminNotes && (
                      <div className="mt-3 text-xs text-muted-foreground bg-muted/60 rounded-lg px-3 py-2">
                        💬 {order.adminNotes}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                      <Truck className="w-5 h-5 text-primary" />
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

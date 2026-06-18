'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllDeliveryOrders, getAllUsers } from '@/lib/firebase/firestore'
import { DeliveryOrderDoc, UserDoc, ORDER_STATUS_LABELS } from '@/types'
import { toDate, formatDate } from '@/lib/utils'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  User,
  Clock,
  Truck,
  ArrowRight,
  Info
} from 'lucide-react'

// Driver Color Palette
const DRIVER_COLORS = [
  {
    bg: 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-950/50',
    dot: 'bg-blue-500'
  },
  {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-950/50',
    dot: 'bg-emerald-500'
  },
  {
    bg: 'bg-purple-50 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/50 hover:bg-purple-100 dark:hover:bg-purple-950/50',
    dot: 'bg-purple-500'
  },
  {
    bg: 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-950/50',
    dot: 'bg-rose-500'
  },
  {
    bg: 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-950/50',
    dot: 'bg-amber-500'
  },
  {
    bg: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-950/50',
    dot: 'bg-indigo-500'
  },
  {
    bg: 'bg-teal-50 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300 border-teal-200 dark:border-teal-800/50 hover:bg-teal-100 dark:hover:bg-teal-950/50',
    dot: 'bg-teal-500'
  }
]

function getDriverColor(driverId: string) {
  if (!driverId) return { bg: 'bg-slate-50 text-slate-800 border-slate-200', dot: 'bg-slate-500' }
  let hash = 0
  for (let i = 0; i < driverId.length; i++) {
    hash = driverId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const idx = Math.abs(hash) % DRIVER_COLORS.length
  return DRIVER_COLORS[idx]
}

export default function CalendarPage() {
  const [orders, setOrders] = useState<DeliveryOrderDoc[]>([])
  const [drivers, setDrivers] = useState<UserDoc[]>([])
  const [selectedDriverId, setSelectedDriverId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month')

  useEffect(() => {
    async function load() {
      // Fetch only pending/in_transit orders for calendar representation
      const [allOrders, allUsers] = await Promise.all([
        getAllDeliveryOrders(),
        getAllUsers(),
      ])
      // Filter orders: only pending/in_transit ones represent pending delivery tasks
      const activeOrders = allOrders.filter(o => o.status === 'pending' || o.status === 'in_transit')
      setOrders(activeOrders)
      setDrivers(allUsers.filter(u => u.role === 'driver'))
      setLoading(false)
    }
    load()
  }, [])

  // Helper to extract scheduled date in YYYY-MM-DD format
  const getOrderDateStr = (order: DeliveryOrderDoc): string => {
    if (order.scheduledDate) return order.scheduledDate
    const date = toDate(order.createdAt)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Filter orders by driver
  const filteredOrders = orders.filter(o => {
    if (selectedDriverId === 'all') return true
    return o.assignedDriverId === selectedDriverId
  })

  // Date utilities
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  // Month navigation helpers
  const handlePrevPeriod = () => {
    setCurrentDate(prev => {
      const copy = new Date(prev)
      if (viewMode === 'month') {
        copy.setMonth(copy.getMonth() - 1)
      } else {
        copy.setDate(copy.getDate() - 7)
      }
      return copy
    })
  }

  const handleNextPeriod = () => {
    setCurrentDate(prev => {
      const copy = new Date(prev)
      if (viewMode === 'month') {
        copy.setMonth(copy.getMonth() + 1)
      } else {
        copy.setDate(copy.getDate() + 7)
      }
      return copy
    })
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // Monthly View Calculations
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  // Day of week offset (0 = Sunday, 1 = Monday, etc.)
  const startingDayOffset = firstDayOfMonth.getDay()

  // Generate matrix grid of days representing Month View
  const generateMonthDays = () => {
    const days: (Date | null)[] = []
    // Fill padding days for first week
    for (let i = 0; i < startingDayOffset; i++) {
      days.push(null)
    }
    // Fill month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d))
    }
    return days
  }

  // Weekly View Calculations
  const getWeekDays = () => {
    const week: Date[] = []
    const startOfWeek = new Date(currentDate)
    const day = startOfWeek.getDay()
    // Set to Sunday
    startOfWeek.setDate(startOfWeek.getDate() - day)
    
    for (let i = 0; i < 7; i++) {
      const copy = new Date(startOfWeek)
      copy.setDate(startOfWeek.getDate() + i)
      week.push(copy)
    }
    return week
  }

  // Match orders to a specific Date object
  const getOrdersForDate = (date: Date | null) => {
    if (!date) return []
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return filteredOrders.filter(o => getOrderDateStr(o) === dateStr)
  }

  const formatMonthYear = () => {
    const formatter = new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric' })
    return formatter.format(currentDate)
  }

  const formatWeekRange = () => {
    const weekDays = getWeekDays()
    const start = weekDays[0]
    const end = weekDays[6]
    const formatter = new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short' })
    return `${formatter.format(start)} — ${formatter.format(end)} (${year})`
  }

  const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Calendar Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border shadow-sm">
        {/* Navigation Control */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPeriod}
            className="p-2 border border-border rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-foreground text-sm min-w-[180px] text-center capitalize">
            {viewMode === 'month' ? formatMonthYear() : formatWeekRange()}
          </span>
          <button
            onClick={handleNextPeriod}
            className="p-2 border border-border rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={handleToday}
            className="px-3 py-2 border border-border text-xs font-semibold rounded-lg hover:bg-muted text-foreground transition-colors ml-2"
          >
            Hoy
          </button>
        </div>

        {/* View Mode & Driver Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-muted p-1 rounded-lg border border-border">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'month' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'week' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Semanal
            </button>
          </div>

          {/* Driver Filter */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-lg bg-background px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-primary" />
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="bg-transparent text-foreground font-semibold focus:outline-none cursor-pointer pr-4"
            >
              <option value="all">Todos los Choferes</option>
              {drivers.map((d) => (
                <option key={d.uid} value={d.uid}>
                  {d.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Driver Legend */}
      <div className="flex items-center gap-4 flex-wrap bg-card border border-border rounded-xl px-5 py-3 shadow-xs text-xs">
        <span className="font-semibold text-muted-foreground flex items-center gap-1">
          <Info className="w-3.5 h-3.5" /> Choferes asignados:
        </span>
        {drivers.map(d => {
          const color = getDriverColor(d.uid)
          return (
            <span key={d.uid} className="inline-flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${color.dot}`} />
              <span className="text-foreground font-medium">{d.displayName}</span>
            </span>
          )
        })}
      </div>

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/40">
            {weekdays.map((day) => (
              <div key={day} className="py-2.5 text-center text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {day}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-border bg-border/20">
            {generateMonthDays().map((date, idx) => {
              const isToday = date && date.toDateString() === new Date().toDateString()
              const dayOrders = getOrdersForDate(date)
              return (
                <div
                  key={idx}
                  className={`min-h-[120px] p-2 bg-background flex flex-col justify-between group transition-colors hover:bg-muted/10 ${
                    !date ? 'bg-muted/20 border-border/10' : ''
                  }`}
                >
                  {date ? (
                    <>
                      {/* Day number header */}
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-sm font-bold flex items-center justify-center w-6.5 h-6.5 rounded-full ${
                            isToday
                              ? 'bg-primary text-primary-foreground font-extrabold shadow-sm'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        {dayOrders.length > 0 && (
                          <span className="text-[10px] font-semibold text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                            {dayOrders.length} entrega{dayOrders.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Orders stack */}
                      <div className="mt-2 space-y-1 overflow-y-auto flex-1 max-h-[85px] scrollbar-thin">
                        {dayOrders.map((order) => {
                          const driverColor = getDriverColor(order.assignedDriverId)
                          return (
                            <Link
                              key={order.id}
                              href={`/delivery-orders/${order.id}`}
                              className={`block px-2 py-1 text-[11px] font-medium rounded border transition-all truncate text-left ${driverColor.bg}`}
                              title={`Cliente: ${order.clientName} | Factura: ${order.invoiceReference} | Chofer: ${order.assignedDriverName}`}
                            >
                              <div className="flex items-center gap-1.5 font-bold truncate">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${driverColor.dot}`} />
                                <span className="truncate">{order.invoiceReference}</span>
                              </div>
                              <div className="truncate opacity-80 mt-0.5">{order.clientName}</div>
                              {order.scheduledTime && (
                                <div className="text-[9px] font-semibold opacity-70 flex items-center gap-0.5 mt-0.5">
                                  <Clock className="w-2.5 h-2.5" />
                                  {order.scheduledTime}
                                </div>
                              )}
                            </Link>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 divide-x divide-border bg-muted/40 border-b border-border">
            {getWeekDays().map((date) => {
              const isToday = date.toDateString() === new Date().toDateString()
              const dayName = weekdays[date.getDay()]
              return (
                <div
                  key={date.toISOString()}
                  className={`py-3 text-center flex flex-col items-center gap-1 ${
                    isToday ? 'bg-primary/5 border-b-2 border-primary' : ''
                  }`}
                >
                  <span className="text-[11px] font-bold text-muted-foreground uppercase">{dayName}</span>
                  <span
                    className={`text-base font-bold w-7 h-7 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-primary text-primary-foreground font-extrabold shadow-sm' : 'text-foreground'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-7 divide-x divide-border min-h-[400px]">
            {getWeekDays().map((date) => {
              const dayOrders = getOrdersForDate(date)
              return (
                <div key={date.toISOString()} className="p-3 space-y-3 bg-background overflow-y-auto max-h-[500px]">
                  {dayOrders.length === 0 ? (
                    <div className="text-center text-[10px] text-muted-foreground/50 py-16">
                      Sin entregas
                    </div>
                  ) : (
                    dayOrders.map((order) => {
                      const driverColor = getDriverColor(order.assignedDriverId)
                      return (
                        <Link
                          key={order.id}
                          href={`/delivery-orders/${order.id}`}
                          className={`block p-3 text-xs rounded-xl border transition-all shadow-xs flex flex-col justify-between gap-2 text-left ${driverColor.bg}`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1.5 font-bold">
                              <span className="truncate">{order.invoiceReference}</span>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${driverColor.dot}`} />
                            </div>
                            <div className="font-semibold truncate">{order.clientName}</div>
                            <div className="text-[10px] opacity-80 flex items-center gap-1">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{order.assignedDriverName}</span>
                            </div>
                            {order.scheduledTime && (
                              <div className="text-[10px] opacity-80 flex items-center gap-1 font-bold">
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                {order.scheduledTime}
                              </div>
                            )}
                            {order.deliveryAddress && (
                              <div className="text-[10px] opacity-70 mt-1 line-clamp-2">
                                📍 {order.deliveryAddress}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold mt-1 text-primary-foreground hover:underline justify-end opacity-90">
                            Ver detalles <ArrowRight className="w-3 h-3" />
                          </div>
                        </Link>
                      )
                    })
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

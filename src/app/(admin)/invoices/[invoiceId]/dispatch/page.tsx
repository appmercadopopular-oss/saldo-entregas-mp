'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getInvoiceById, getInvoiceItems, getActiveDrivers, createDeliveryOrder } from '@/lib/firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { InvoiceDoc, InvoiceItemDoc, UserDoc } from '@/types'
import { formatNumber, validateDispatchQuantity } from '@/lib/utils'
import { toast } from 'sonner'
import { ArrowLeft, Truck, Package, User, Loader2, AlertCircle, CheckCircle2, Minus, Plus } from 'lucide-react'
import { COSTA_RICA_DATA } from '@/lib/costaRica'

type DispatchItem = {
  invoiceItem: InvoiceItemDoc
  selected: boolean
  quantity: number
  error?: string
}

export default function DispatchPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const router = useRouter()
  const { firebaseUser, userDoc } = useAuth()

  const [invoice, setInvoice] = useState<InvoiceDoc | null>(null)
  const [dispatchItems, setDispatchItems] = useState<DispatchItem[]>([])
  const [drivers, setDrivers] = useState<UserDoc[]>([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [provincia, setProvincia] = useState('')
  const [canton, setCanton] = useState('')
  const [distrito, setDistrito] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Cascading lists helper
  const selectedProvData = Object.values(COSTA_RICA_DATA).find(
    (p) => p.nombre === provincia
  )
  const cantonesList = selectedProvData
    ? Object.values(selectedProvData.cantones).map((c) => c.nombre).sort()
    : []
  const selectedCantonData = selectedProvData
    ? Object.values(selectedProvData.cantones).find((c) => c.nombre === canton)
    : undefined
  const distritosList = selectedCantonData
    ? Object.values(selectedCantonData.distritos).sort()
    : []

  const handleProvinciaChange = (val: string) => {
    setProvincia(val)
    setCanton('')
    setDistrito('')
  }

  const handleCantonChange = (val: string) => {
    setCanton(val)
    setDistrito('')
  }

  useEffect(() => {
    async function load() {
      const [inv, invItems, driverList] = await Promise.all([
        getInvoiceById(invoiceId),
        getInvoiceItems(invoiceId),
        getActiveDrivers(),
      ])
      setInvoice(inv)
      setDeliveryAddress(inv?.deliveryAddress ?? '')
      setDispatchItems(
        invItems
          .filter((i) => i.quantityPending > 0)
          .map((i) => ({ invoiceItem: i, selected: false, quantity: i.quantityPending }))
      )
      setDrivers(driverList)
      setLoading(false)
    }
    load()
  }, [invoiceId])

  function toggleItem(id: string) {
    setDispatchItems((prev) =>
      prev.map((d) => d.invoiceItem.id === id ? { ...d, selected: !d.selected, error: undefined } : d)
    )
  }

  function setQty(id: string, val: number) {
    setDispatchItems((prev) =>
      prev.map((d) => {
        if (d.invoiceItem.id !== id) return d
        const { valid, error } = validateDispatchQuantity(val, d.invoiceItem.quantityPending)
        return { ...d, quantity: val, error: valid ? undefined : error }
      })
    )
  }

  function adjustQty(id: string, delta: number) {
    const item = dispatchItems.find((d) => d.invoiceItem.id === id)
    if (!item) return
    const newVal = Math.max(0, Math.min(item.invoiceItem.quantityPending, item.quantity + delta))
    setQty(id, newVal)
  }

  const selectedItems = dispatchItems.filter((d) => d.selected)
  const hasErrors = selectedItems.some((d) => !!d.error)
  const canSubmit = selectedItems.length > 0 && !hasErrors && !!selectedDriver && !!provincia && !!canton && !!distrito

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || !invoice) return
    setSaving(true)

    const driver = drivers.find((d) => d.uid === selectedDriver)!
    try {
      const orderId = await createDeliveryOrder(
        {
          invoiceId,
          invoiceReference: invoice.internalReference,
          clientName: invoice.clientName,
          deliveryAddress,
          assignedDriverId: driver.uid,
          assignedDriverName: driver.displayName,
          adminNotes,
          provincia,
          canton,
          distrito,
          scheduledDate: scheduledDate || undefined,
          scheduledTime: scheduledTime || undefined,
          items: selectedItems.map((d) => ({
            invoiceItemId: d.invoiceItem.id,
            sku: d.invoiceItem.sku,
            description: d.invoiceItem.description,
            unit: d.invoiceItem.unit,
            quantityDispatched: d.quantity,
          })),
        },
        firebaseUser!.uid,
        userDoc!.displayName
      )
      toast.success('¡Orden de despacho creada exitosamente!')
      router.push(`/delivery-orders/${orderId}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al crear la orden')
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="max-w-4xl space-y-6">
      <Link href={`/invoices/${invoiceId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Volver al Detalle
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Crear Orden de Despacho</h1>
        <p className="text-muted-foreground mt-1">
          Factura <strong>{invoice?.internalReference}</strong> · {invoice?.clientName}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Driver selection */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            Asignar Repartidor
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Repartidor *</label>
              <select
                id="driver-select"
                value={selectedDriver}
                onChange={(e) => setSelectedDriver(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              >
                <option value="">Seleccionar repartidor...</option>
                {drivers.map((d) => (
                  <option key={d.uid} value={d.uid}>{d.displayName}</option>
                ))}
              </select>
              {drivers.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No hay repartidores activos</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Dirección de Entrega</label>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Dirección del sitio..."
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Fecha Programada (Entrega)</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Hora Programada (Entrega)</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Provincia *</label>
              <select
                value={provincia}
                onChange={(e) => handleProvinciaChange(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              >
                <option value="">Seleccionar provincia...</option>
                {Object.values(COSTA_RICA_DATA).map((p) => (
                  <option key={p.nombre} value={p.nombre}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Cantón *</label>
              <select
                value={canton}
                onChange={(e) => handleCantonChange(e.target.value)}
                required
                disabled={!provincia}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">Seleccionar cantón...</option>
                {cantonesList.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Distrito *</label>
              <select
                value={distrito}
                onChange={(e) => setDistrito(e.target.value)}
                required
                disabled={!canton}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="">Seleccionar distrito...</option>
                {distritosList.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notas para el Repartidor</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Instrucciones especiales, referencias del sitio..."
                rows={2}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all resize-none"
              />
            </div>
          </div>
        </div>

        {/* Items selection */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              Seleccionar Ítems a Despachar
            </h2>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDispatchItems((p) => p.map((d) => ({ ...d, selected: true })))}
                className="text-xs text-primary hover:underline">
                Seleccionar todos
              </button>
              <span className="text-muted-foreground/50">|</span>
              <button type="button" onClick={() => setDispatchItems((p) => p.map((d) => ({ ...d, selected: false })))}
                className="text-xs text-muted-foreground hover:text-foreground">
                Ninguno
              </button>
            </div>
          </div>

          {dispatchItems.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="text-foreground font-medium">Todos los ítems están completados</p>
              <p className="text-muted-foreground text-sm mt-1">No hay saldo pendiente en esta factura</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {dispatchItems.map((d) => (
                <div key={d.invoiceItem.id}
                  className={`px-6 py-4 flex items-center gap-4 transition-colors ${d.selected ? 'bg-accent/30' : 'hover:bg-muted/20'}`}
                >
                  <input
                    type="checkbox"
                    id={`item-${d.invoiceItem.id}`}
                    checked={d.selected}
                    onChange={() => toggleItem(d.invoiceItem.id)}
                    className="w-4 h-4 rounded accent-primary cursor-pointer flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <label htmlFor={`item-${d.invoiceItem.id}`} className="text-sm font-medium text-foreground cursor-pointer">
                      {d.invoiceItem.description}
                    </label>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {d.invoiceItem.sku || '—'} · {d.invoiceItem.unit}
                    </div>
                    <div className="text-xs text-amber-600 mt-0.5">
                      Saldo pendiente: <strong>{formatNumber(d.invoiceItem.quantityPending)}</strong>
                    </div>
                  </div>
                  {d.selected && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button type="button" onClick={() => adjustQty(d.invoiceItem.id, -1)}
                        className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        value={d.quantity}
                        onChange={(e) => setQty(d.invoiceItem.id, Number(e.target.value))}
                        min={0.01}
                        step="0.01"
                        max={d.invoiceItem.quantityPending}
                        className={`w-20 text-center py-1.5 rounded-lg border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                          d.error ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-border bg-background'
                        }`}
                      />
                      <button type="button" onClick={() => adjustQty(d.invoiceItem.id, 1)}
                        className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  {d.error && (
                    <div className="flex items-center gap-1 text-xs text-red-600 flex-shrink-0">
                      <AlertCircle className="w-3 h-3" />{d.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Summary + submit */}
        {selectedItems.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm animate-enter">
            <h3 className="text-sm font-bold text-foreground mb-3">Resumen del Despacho</h3>
            <div className="space-y-2 mb-4">
              {selectedItems.map((d) => (
                <div key={d.invoiceItem.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate mr-4">{d.invoiceItem.description}</span>
                  <span className="font-medium text-foreground whitespace-nowrap">
                    {formatNumber(d.quantity)} {d.invoiceItem.unit}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-4 border-t border-border">
              <Link href={`/invoices/${invoiceId}`}
                className="flex-1 py-2.5 text-center text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all">
                Cancelar
              </Link>
              <button
                id="btn-confirm-dispatch"
                type="submit"
                disabled={!canSubmit || saving}
                className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                {saving ? 'Creando...' : `Crear Despacho (${selectedItems.length} ítem${selectedItems.length !== 1 ? 's' : ''})`}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}

'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { confirmDelivery, updateDeliveryOrderStatus } from '@/lib/firebase/firestore'
import { DeliveryOrderDoc, DeliveryOrderItem, ORDER_STATUS_LABELS } from '@/types'
import { formatDateTime, formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Loader2,
  MapPin, Package, Truck, User, Clock, ChevronDown, ChevronUp
} from 'lucide-react'

type ItemConfirmation = {
  invoiceItemId: string
  quantityConfirmed: number
  returnReason: string
  hasException: boolean
}

export default function DriverOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const router = useRouter()
  const [order, setOrder] = useState<DeliveryOrderDoc | null>(null)
  const [confirmations, setConfirmations] = useState<ItemConfirmation[]>([])
  const [driverNotes, setDriverNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedItems, setExpandedItems] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Signature canvas states & refs
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isSigned, setIsSigned] = useState(false)
  const drawingRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  async function handleStartRoute() {
    if (!order) return
    setUpdatingStatus(true)
    try {
      await updateDeliveryOrderStatus(order.id, 'in_transit')
      setOrder((prev) => prev ? { ...prev, status: 'in_transit' } : null)
      toast.success('¡Viaje iniciado! La orden ahora está En Tránsito.')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al iniciar tránsito')
    } finally {
      setUpdatingStatus(false)
    }
  }

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, 'delivery_orders', orderId))
      if (!snap.exists()) { setLoading(false); return }
      const data = { id: snap.id, ...snap.data() } as DeliveryOrderDoc
      setOrder(data)
      setConfirmations(
        data.items.map((item) => ({
          invoiceItemId: item.invoiceItemId,
          quantityConfirmed: item.quantityDispatched,
          returnReason: '',
          hasException: false,
        }))
      )
      setLoading(false)
    }
    load()
  }, [orderId])

  // Canvas drawing event handlers
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    
    if ('touches' in e) {
      if (e.touches.length === 0) return null
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      }
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
    }
  }

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault()
    const pos = getCoordinates(e)
    if (!pos) return
    drawingRef.current = true
    lastPosRef.current = pos
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return
    if (e.cancelable) e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const pos = getCoordinates(e)
    if (!canvas || !ctx || !pos) return

    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()

    lastPosRef.current = pos
    if (!isSigned) setIsSigned(true)
  }

  const stopDrawing = () => {
    drawingRef.current = false
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setIsSigned(false)
  }

  // Canvas Sizing and Auto-Resize/Rotate handling
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resizeCanvas = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Save current content to avoid losing drawing on rotate/resize
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      const tempCtx = tempCanvas.getContext('2d')
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0)
      }

      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(tempCanvas, 0, 0)
    }

    // Delay initialization slightly to ensure offsetWidth is calculated correctly
    const timer = setTimeout(() => {
      canvas.width = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    }, 50)

    window.addEventListener('resize', resizeCanvas)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [order]) // Re-run once when order finishes loading

  function updateConfirmation(invoiceItemId: string, confirmed: number) {
    setConfirmations((prev) =>
      prev.map((c) => {
        if (c.invoiceItemId !== invoiceItemId) return c
        const orderItem = order!.items.find((i) => i.invoiceItemId === invoiceItemId)!
        const hasException = confirmed < orderItem.quantityDispatched
        return { ...c, quantityConfirmed: confirmed, hasException, returnReason: hasException ? c.returnReason : '' }
      })
    )
  }

  function updateReason(invoiceItemId: string, reason: string) {
    setConfirmations((prev) =>
      prev.map((c) => c.invoiceItemId === invoiceItemId ? { ...c, returnReason: reason } : c)
    )
  }

  const hasExceptions = confirmations.some((c) => c.hasException)
  const missingReasons = confirmations.some((c) => c.hasException && !c.returnReason.trim())
  const canSubmit = !missingReasons && isSigned

  async function handleConfirm() {
    if (!canSubmit || !order) return
    setSaving(true)
    
    let signatureDataUrl = ''
    const canvas = canvasRef.current
    if (canvas && isSigned) {
      signatureDataUrl = canvas.toDataURL('image/png')
    }

    try {
      await confirmDelivery({
        orderId: order.id,
        driverNotes,
        signatureDataUrl,
        items: confirmations,
      })
      toast.success(
        hasExceptions
          ? 'Entrega confirmada con excepciones registrada'
          : '¡Entrega confirmada exitosamente!'
      )
      router.replace('/my-orders')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al confirmar la entrega')
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!order) return (
    <div className="text-center py-12">
      <p className="text-muted-foreground">Orden no encontrada</p>
      <Link href="/my-orders" className="text-primary text-sm hover:underline mt-2 inline-block">← Volver</Link>
    </div>
  )

  if (order.status !== 'pending' && order.status !== 'in_transit') {
    return (
      <div className="space-y-5">
        <Link href="/my-orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />Mis Órdenes
        </Link>
        <div className="bg-card rounded-xl border border-border p-8 text-center shadow-sm">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground">Orden ya procesada</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Estado: <strong>{ORDER_STATUS_LABELS[order.status]}</strong>
          </p>
          {order.deliveredAt && (
            <p className="text-xs text-muted-foreground mt-1">
              {formatDateTime(order.deliveredAt)}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <Link href="/my-orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4" />Mis Órdenes
      </Link>

      {/* Order info */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="bg-brand-gradient p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white font-bold">{order.invoiceReference}</div>
              <div className="text-white/70 text-sm">{order.clientName}</div>
            </div>
          </div>
        </div>
        <div className="p-5 space-y-3">
          {order.deliveryAddress && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <span className="text-foreground">{order.deliveryAddress}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            Creada {formatDateTime(order.createdAt)}
          </div>
          {order.adminNotes && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Nota del Admin</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">{order.adminNotes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items confirmation */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <button
          onClick={() => setExpandedItems(!expandedItems)}
          className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <span className="font-bold text-foreground text-sm">
              {order.status === 'pending' ? 'Productos a Entregar' : 'Confirmar Cantidades Entregadas'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasExceptions && (
              <AlertTriangle className="w-4 h-4 text-orange-500" />
            )}
            {expandedItems ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        <div className={`overflow-hidden transition-all duration-300 ${expandedItems ? 'block' : 'hidden'}`}>
          <div className="divide-y divide-border border-t border-border">
            {order.items.map((item) => {
              const conf = confirmations.find((c) => c.invoiceItemId === item.invoiceItemId)!
              return (
                <div key={item.invoiceItemId} className={`p-5 transition-colors ${conf.hasException ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                  <div className="font-medium text-foreground text-sm">{item.description}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">{item.sku} · {item.unit}</div>

                  <div className="flex items-center gap-4 mt-3">
                    {order.status === 'pending' ? (
                      <div className="text-xs text-muted-foreground">
                        Cantidad a Entregar: <strong className="text-foreground">{formatNumber(item.quantityDispatched)}</strong>
                      </div>
                    ) : (
                      <>
                        <div className="text-xs text-muted-foreground">
                          Despachado: <strong className="text-foreground">{formatNumber(item.quantityDispatched)}</strong>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Recibido:</label>
                          <input
                            type="number"
                            value={conf.quantityConfirmed}
                            onChange={(e) => updateConfirmation(item.invoiceItemId, Number(e.target.value))}
                            min={0}
                            step="0.01"
                            max={item.quantityDispatched}
                            className={`w-24 text-center py-1.5 px-2 rounded-lg border text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all ${
                              conf.hasException
                                ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700'
                                : 'border-border bg-background text-green-700'
                            }`}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {conf.hasException && (
                    <div className="mt-3 animate-enter">
                      <label className="text-xs font-medium text-red-700 dark:text-red-400 flex items-center gap-1 mb-1.5">
                        <AlertTriangle className="w-3 h-3" />
                        Motivo de devolución *
                      </label>
                      <select
                        value={conf.returnReason}
                        onChange={(e) => updateReason(item.invoiceItemId, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-red-400/50 transition-all"
                      >
                        <option value="">Seleccionar motivo...</option>
                        <option value="Material dañado">Material dañado</option>
                        <option value="Material incorrecto">Material incorrecto</option>
                        <option value="Cliente rechazó">Cliente rechazó el material</option>
                        <option value="Cantidad excedente">Cantidad excedente en camión</option>
                        <option value="Sitio cerrado">Sitio de entrega cerrado</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {!expandedItems && (
          <div className="px-5 pb-4 text-xs text-muted-foreground">
            {order.items.length} ítem{order.items.length !== 1 ? 's' : ''} — toca para confirmar cantidades
          </div>
        )}
      </div>

      {order.status === 'pending' ? (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm text-center">
          <Truck className="w-10 h-10 text-primary mx-auto mb-3 animate-pulse" />
          <h3 className="text-base font-bold text-foreground">Tránsito Pendiente</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Esta orden aún no ha iniciado viaje. Por favor marca que has salido a ruta para poder realizar la entrega.
          </p>
          <button
            onClick={handleStartRoute}
            disabled={updatingStatus}
            className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-md"
          >
            {updatingStatus ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <Truck className="w-4.5 h-4.5" />
            )}
            {updatingStatus ? 'Iniciando...' : 'Iniciar Ruta (Marcar En Tránsito)'}
          </button>
        </div>
      ) : (
        <>
          {/* Client signature canvas */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm space-y-3">
            <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
              Firma de Conformidad del Cliente *
            </label>
            <p className="text-xs text-muted-foreground">
              El cliente debe firmar con el dedo o lápiz táctil en el recuadro para confirmar la recepción.
            </p>
            <div className="border border-dashed border-border rounded-lg overflow-hidden bg-white relative h-48 touch-none">
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-full cursor-crosshair block bg-white"
              />
              {!isSigned && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-muted-foreground/30 text-sm select-none">
                  Firme aquí
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={clearCanvas}
                className="px-3 py-1.5 border border-border rounded-lg text-xs font-semibold hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
              >
                Limpiar Firma
              </button>
            </div>
          </div>

          {/* Driver notes */}
          <div className="bg-card rounded-xl border border-border p-5 shadow-sm">
            <label className="text-sm font-medium text-foreground block mb-2">
              Notas del repartidor (opcional)
            </label>
            <textarea
              value={driverNotes}
              onChange={(e) => setDriverNotes(e.target.value)}
              placeholder="Observaciones sobre la entrega..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
            />
          </div>

          {/* Warnings */}
          {missingReasons && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">
                Debes seleccionar un <strong>motivo de devolución</strong> para todos los ítems con cantidad reducida.
              </p>
            </div>
          )}

          {!isSigned && (
            <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Se requiere la <strong>firma del cliente</strong> para poder confirmar la entrega.
              </p>
            </div>
          )}

          {/* Confirm button */}
          <button
            id="btn-confirm-delivery"
            onClick={handleConfirm}
            disabled={!canSubmit || saving}
            className={`w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-3 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed ${
              hasExceptions
                ? 'bg-orange-500 hover:bg-orange-600 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : hasExceptions ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <CheckCircle2 className="w-5 h-5" />
            )}
            {saving
              ? 'Confirmando...'
              : hasExceptions
                ? 'Confirmar con Excepciones'
                : 'Confirmar Entrega Completa'}
          </button>
        </>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { saveImportedInvoice, getInvoiceByReference, applyCreditNoteToInvoice, getInvoiceItems } from '@/lib/firebase/firestore'
import { toast } from 'sonner'
import { Search, Loader2, FileText, Package, ArrowLeft, CheckCircle2, AlertCircle, Calendar, Link2 } from 'lucide-react'
import Link from 'next/link'
import { InvoiceDoc, InvoiceItemDoc, FinanzaProInvoice } from '@/types'
import { formatDate, formatNumber, formatCurrency } from '@/lib/utils'

type PreviewData = {
  raw: FinanzaProInvoice
  invoice: Omit<InvoiceDoc, 'id'>
  items: Omit<InvoiceItemDoc, 'id'>[]
}

const COMPANIES = [
  { id: 'mercado_popular', name: 'Mercado Popular' },
  { id: 'construferre_max', name: 'Construferre Max S.A' },
  { id: 'mision_tica', name: 'Inversiones y Proyectos Misión Tica S.A' }
]

export default function ImportInvoicePage() {
  const router = useRouter()
  const { firebaseUser } = useAuth()
  const [selectedCompany, setSelectedCompany] = useState('mercado_popular')
  const [docType, setDocType] = useState<'invoice' | 'credit-note'>('invoice')
  
  // Navigation Tabs: 'direct' (search by single reference/id) or 'range' (search by date range)
  const [searchTab, setSearchTab] = useState<'direct' | 'range'>('direct')
  
  // Direct Search States
  const [query, setQuery] = useState('')
  const mode = 'reference'
  const [alreadyExists, setAlreadyExists] = useState(false)
  
  // Date Range Search States
  const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const today = new Date()
  const aWeekAgo = new Date()
  aWeekAgo.setDate(today.getDate() - 7)

  const [startDate, setStartDate] = useState(getLocalDateStr(aWeekAgo))
  const [endDate, setEndDate] = useState(getLocalDateStr(today))
  const [rangeResults, setRangeResults] = useState<any[] | null>(null)
  const [loadingRange, setLoadingRange] = useState(false)

  // Shared States
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  
  // Immediate Deliveries State
  const [immediateQuantities, setImmediateQuantities] = useState<Record<string, string>>({})
  
  // Credit Note Specific States
  const [creditNoteRaw, setCreditNoteRaw] = useState<any | null>(null)
  const [parentInvoiceQuery, setParentInvoiceQuery] = useState('')
  const [parentInvoice, setParentInvoice] = useState<InvoiceDoc | null>(null)
  const [parentInvoiceItems, setParentInvoiceItems] = useState<InvoiceItemDoc[]>([])
  const [searchingParent, setSearchingParent] = useState(false)

  const setImmediateQty = (sku: string, value: string) => {
    setImmediateQuantities(prev => ({
      ...prev,
      [sku]: value
    }))
  }

  // Handle Direct Search (by reference or ID)
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setPreview(null)
    setAlreadyExists(false)
    setCreditNoteRaw(null)
    setParentInvoice(null)

    try {
      if (docType === 'credit-note') {
        const uid = firebaseUser?.uid ?? 'system'
        const res = await fetch(
          `/api/finanzapro/invoice?reference=${encodeURIComponent(query.trim())}&companyId=${selectedCompany}&type=credit-note`,
          { headers: { 'x-user-uid': uid } }
        )
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json.error ?? 'Error al consultar la Nota de Crédito en FinanzaPro')
        }
        setCreditNoteRaw(json.data.raw)
        toast.success('Nota de crédito encontrada. Por favor vincúlala a una factura padre.')
        setSearching(false)
        return
      }

      // Check if already imported locally
      if (mode === 'reference') {
        const existing = await getInvoiceByReference(query.trim())
        if (existing) {
          setAlreadyExists(true)
          toast.warning('Esta factura ya fue importada anteriormente')
          setSearching(false)
          return
        }
      }

      const uid = firebaseUser?.uid ?? 'system'
      const res = await fetch(
        `/api/finanzapro/invoice?reference=${encodeURIComponent(query.trim())}&companyId=${selectedCompany}`,
        { headers: { 'x-user-uid': uid } }
      )
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error ?? 'Error al consultar FinanzaPro')
      }

      setPreview(json.data)
      setImmediateQuantities({})
      toast.success('Factura encontrada. Revisa los detalles antes de importar.')
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo encontrar el documento')
    } finally {
      setSearching(false)
    }
  }

  // Handle Date Range Search
  async function handleRangeSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!startDate || !endDate) return
    setLoadingRange(true)
    setRangeResults(null)
    setPreview(null)
    setCreditNoteRaw(null)
    setParentInvoice(null)

    try {
      const res = await fetch(
        `/api/finanzapro/invoices?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&companyId=${selectedCompany}`
      )
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error ?? 'Error al buscar facturas por rango de fechas')
      }

      setRangeResults(json.data)
      if (json.data.length === 0) {
        toast.info('No se encontraron facturas en el rango de fechas seleccionado')
      } else {
        toast.success(`Se encontraron ${json.data.length} facturas`)
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Error al buscar facturas')
    } finally {
      setLoadingRange(false)
    }
  }

  // Fetch full details of a specific invoice from range results to show the preview card
  async function handleSelectInvoice(invoice: any) {
    setSearching(true)
    setPreview(null)
    setAlreadyExists(false)
    setCreditNoteRaw(null)
    setParentInvoice(null)

    try {
      const uid = firebaseUser?.uid ?? 'system'
      const queryParam = invoice.id 
        ? `id=${encodeURIComponent(invoice.id)}` 
        : `reference=${encodeURIComponent(invoice.internalReference)}`

      const res = await fetch(
        `/api/finanzapro/invoice?${queryParam}&companyId=${selectedCompany}`,
        { headers: { 'x-user-uid': uid } }
      )
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error ?? 'Error al cargar los detalles de la factura')
      }

      setPreview(json.data)
      setImmediateQuantities({})
      toast.success('Detalles de factura cargados. Revisa el resumen abajo.')

      // Smooth scroll to preview panel
      setTimeout(() => {
        const previewElement = document.getElementById('preview-section')
        if (previewElement) {
          previewElement.scrollIntoView({ behavior: 'smooth' })
        }
      }, 100)
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo cargar la factura')
    } finally {
      setSearching(false)
    }
  }

  // Save the parent invoice query search in Firestore
  async function handleSearchParentInvoice(e: React.FormEvent) {
    e.preventDefault()
    if (!parentInvoiceQuery.trim()) return
    setSearchingParent(true)
    setParentInvoice(null)
    setParentInvoiceItems([])
    try {
      const inv = await getInvoiceByReference(parentInvoiceQuery.trim())
      if (!inv) {
        toast.error('Factura padre no encontrada en el sistema local.')
      } else {
        setParentInvoice(inv)
        const items = await getInvoiceItems(inv.id)
        setParentInvoiceItems(items)
        toast.success(`Factura vinculada: ${inv.internalReference} (${inv.clientName})`)
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Error al buscar la factura')
    } finally {
      setSearchingParent(false)
    }
  }

  // Save the previewed invoice to Firestore
  async function handleSave() {
    if (!preview) return
    setSaving(true)
    try {
      const immediateDeliveries = preview.items
        .map(item => {
          const qtyStr = immediateQuantities[item.sku] || '0'
          const qty = qtyStr === '' ? 0 : Number(qtyStr)
          return {
            sku: item.sku,
            description: item.description,
            unit: item.unit,
            quantity: qty
          }
        })
        .filter(item => item.quantity > 0)

      const invoiceId = await saveImportedInvoice(
        preview.invoice,
        preview.items,
        immediateDeliveries,
        firebaseUser ? { uid: firebaseUser.uid, displayName: firebaseUser.displayName || 'Administrador' } : undefined
      )
      toast.success(
        immediateDeliveries.length > 0
          ? '¡Factura importada y retiro en sitio registrado exitosamente!'
          : '¡Factura importada exitosamente!'
      )
      router.push(`/invoices/${invoiceId}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar la factura')
      setSaving(false)
    }
  }

  // Apply credit note reduction in Firestore
  async function handleSaveCreditNote() {
    if (!creditNoteRaw || !parentInvoice) return
    setSaving(true)
    try {
      const cnItems = (creditNoteRaw.lines || []).map((line: any) => ({
        sku: line.sku || '',
        quantity: Math.abs(line.quantityInvoiced || line.quantity || 0)
      }))

      const cnRef = creditNoteRaw.internalReference || creditNoteRaw.number || query.trim()
      await applyCreditNoteToInvoice(
        parentInvoice.id,
        cnRef,
        cnItems,
        firebaseUser?.uid ?? 'system'
      )
      toast.success('¡Nota de crédito aplicada al saldo pendiente con éxito!')
      router.push(`/invoices/${parentInvoice.id}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al aplicar la nota de crédito')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Back Link */}
      <Link href="/invoices" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Volver a Facturas
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar Documento</h1>
        <p className="text-muted-foreground mt-1">Busca y selecciona una factura o nota de crédito en FinanzaPro para registrarla en el sistema</p>
      </div>

      {/* Company & Document Type Selector */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="company-select" className="block text-sm font-bold text-foreground mb-2">
            Seleccionar Empresa / Proveedor
          </label>
          <select
            id="company-select"
            value={selectedCompany}
            onChange={(e) => {
              setSelectedCompany(e.target.value)
              setPreview(null)
              setAlreadyExists(false)
              setRangeResults(null)
              setCreditNoteRaw(null)
              setParentInvoice(null)
            }}
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all cursor-pointer"
          >
            {COMPANIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="doctype-select" className="block text-sm font-bold text-foreground mb-2">
            Tipo de Documento a Cargar
          </label>
          <select
            id="doctype-select"
            value={docType}
            onChange={(e) => {
              setDocType(e.target.value as 'invoice' | 'credit-note')
              setPreview(null)
              setAlreadyExists(false)
              setRangeResults(null)
              setCreditNoteRaw(null)
              setParentInvoice(null)
              setQuery('')
            }}
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all cursor-pointer"
          >
            <option value="invoice">Factura de Venta</option>
            <option value="credit-note">Nota de Crédito</option>
          </select>
        </div>
      </div>

      {/* Tabs Selector — Only visible for invoices */}
      {docType === 'invoice' && (
        <div className="flex border-b border-border">
          <button
            onClick={() => { setSearchTab('direct'); setPreview(null); setAlreadyExists(false) }}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-all ${
              searchTab === 'direct'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Búsqueda Directa
          </button>
          <button
            onClick={() => { setSearchTab('range'); setPreview(null); setAlreadyExists(false) }}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-all ${
              searchTab === 'range'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Búsqueda por Rango de Fechas
          </button>
        </div>
      )}

      {/* Direct Search Form */}
      {(searchTab === 'direct' || docType === 'credit-note') && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="invoice-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={docType === 'invoice' ? 'Ej: FAC-2024-001' : 'Ej: NC-2024-001'}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
              />
            </div>
            <button
              id="btn-search-invoice"
              type="submit"
              disabled={searching || !query.trim()}
              className="px-5 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </form>

          {alreadyExists && (
            <div className="mt-4 flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-amber-800 dark:text-amber-300">Documento ya importado</div>
                <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Este documento ya existe en el sistema. Ve a{' '}
                  <Link href="/invoices" className="underline font-semibold text-amber-800 dark:text-amber-300">Facturas</Link> para verla.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Date Range Search Form — Only visible for invoices */}
      {searchTab === 'range' && docType === 'invoice' && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
          <form onSubmit={handleRangeSearch} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="start-date" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Fecha Inicio
                </label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                />
              </div>
              <div>
                <label htmlFor="end-date" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Fecha Fin
                </label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                id="btn-search-range"
                type="submit"
                disabled={loadingRange || !startDate || !endDate}
                className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-2 text-sm shadow-sm"
              >
                {loadingRange ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar Facturas
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Date Range Search Results */}
      {searchTab === 'range' && docType === 'invoice' && rangeResults && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden animate-enter">
          <div className="p-6 border-b border-border bg-accent/20 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Facturas Disponibles ({rangeResults.length})</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Selecciona una factura disponible para ver sus detalles e importarla</p>
            </div>
          </div>
          {rangeResults.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground bg-muted/10">
              <Package className="w-12 h-12 text-muted-foreground/45 mx-auto mb-3" />
              <p className="font-semibold text-foreground">No se encontraron facturas</p>
              <p className="text-sm text-muted-foreground/80 mt-1">Intenta con otro rango de fechas que contenga transacciones.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground text-left">
                    <th className="py-3 px-6 text-xs font-semibold uppercase tracking-wider">Referencia</th>
                    <th className="py-3 px-6 text-xs font-semibold uppercase tracking-wider">Cliente</th>
                    <th className="py-3 px-6 text-xs font-semibold uppercase tracking-wider">Fecha</th>
                    <th className="py-3 px-6 text-xs font-semibold uppercase tracking-wider text-right">Total</th>
                    <th className="py-3 px-6 text-xs font-semibold uppercase tracking-wider text-center">Estado</th>
                    <th className="py-3 px-6 text-xs font-semibold uppercase tracking-wider text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rangeResults.map((inv) => (
                    <tr key={inv.id || inv.internalReference} className="hover:bg-muted/10 transition-colors">
                      <td className="py-3.5 px-6 font-semibold text-foreground font-mono text-sm">
                        {inv.internalReference || '—'}
                      </td>
                      <td className="py-3.5 px-6 max-w-[220px] truncate" title={inv.clientName}>
                        <div className="text-foreground font-medium">{inv.clientName}</div>
                        <div className="text-xs text-muted-foreground">{inv.companyName || 'Mercado Popular'}</div>
                      </td>
                      <td className="py-3.5 px-6 text-muted-foreground">
                        {formatDate(new Date(inv.invoiceDate))}
                      </td>
                      <td className="py-3.5 px-6 text-right font-bold text-foreground">
                        {formatCurrency(inv.total, inv.currency)}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        {inv.alreadyImported ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-green-500/10 text-green-600 dark:text-green-400 px-2.5 py-1 rounded-full border border-green-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Importada
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-full border border-blue-500/20">
                            Disponible
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-6 text-center">
                        {inv.alreadyImported ? (
                          <Link
                            href={`/invoices/${inv.localId}`}
                            className="inline-flex items-center justify-center px-3 py-1.5 bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-semibold rounded-lg transition-all"
                          >
                            Ver en App
                          </Link>
                        ) : (
                          <button
                            onClick={() => handleSelectInvoice(inv)}
                            disabled={searching}
                            className="inline-flex items-center justify-center px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg transition-all shadow-sm"
                          >
                            Ver Detalles
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Loading Details State */}
      {searching && (
        <div className="flex flex-col items-center justify-center py-12 bg-card rounded-xl border border-border shadow-sm">
          <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
          <p className="text-sm font-medium text-foreground">Cargando detalles del documento...</p>
          <p className="text-xs text-muted-foreground mt-1">Obteniendo líneas y productos de FinanzaPro</p>
        </div>
      )}

      {/* Invoice Preview Card */}
      {docType === 'invoice' && preview && !searching && (
        <div id="preview-section" className="bg-card rounded-xl border border-border shadow-sm overflow-hidden animate-enter">
          {/* Invoice header */}
          <div className="p-6 border-b border-border bg-accent/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">{preview.invoice.internalReference}</div>
                  <div className="text-sm text-muted-foreground">{preview.invoice.clientName}</div>
                  <div className="mt-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-secondary text-secondary-foreground">
                      {preview.invoice.companyName || 'Mercado Popular'}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Emitida: {formatDate(preview.invoice.issueDate)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-green-600 bg-green-100 dark:bg-green-900/30 px-3 py-1.5 rounded-full text-sm font-medium">
                <CheckCircle2 className="w-4 h-4" />
                Encontrada
              </div>
            </div>
          </div>

          {/* Import comments / notes */}
          <div className="p-6 border-b border-border bg-muted/10">
            <label htmlFor="import-notes" className="block text-sm font-bold text-foreground mb-2">
              Comentarios del Vendedor / Notas de Despacho (Opcional)
            </label>
            <textarea
              id="import-notes"
              value={preview.invoice.notes || ''}
              onChange={(e) => {
                const notes = e.target.value
                setPreview((prev) =>
                  prev
                    ? {
                        ...prev,
                        invoice: {
                          ...prev.invoice,
                          notes,
                        },
                      }
                    : null
                )
              }}
              placeholder="Escriba comentarios, solicitudes de fechas o indicaciones especiales..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none"
            />
          </div>

          {/* Items table */}
          <div className="p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              {preview.items.length} líneas de producto
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">SKU</th>
                    <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Descripción</th>
                    <th className="text-left text-xs font-medium text-muted-foreground pb-2 pr-4">Unidad</th>
                    <th className="text-right text-xs font-medium text-muted-foreground pb-2 pr-4">Precio</th>
                    <th className="text-right text-xs font-medium text-muted-foreground pb-2 pr-4">Facturado</th>
                    <th className="text-right text-xs font-medium text-muted-foreground pb-2">Retirado en Sitio (Inmediato)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.items.map((item, idx) => (
                    <tr key={idx} className="group hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs">{item.sku || '—'}</td>
                      <td className="py-2.5 pr-4 text-foreground font-medium">{item.description}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{item.unit}</td>
                      <td className="py-2.5 pr-4 text-right text-muted-foreground font-medium">{formatCurrency(item.unitPrice || 0, preview.raw.currency || 'CRC')}</td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-foreground">{formatNumber(item.quantityInvoiced)}</td>
                      <td className="py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          max={item.quantityInvoiced}
                          step="any"
                          value={immediateQuantities[item.sku] || ''}
                          placeholder="0"
                          onChange={(e) => {
                            const val = e.target.value
                            const num = val === '' ? 0 : Number(val)
                            if (num < 0 || num > item.quantityInvoiced) {
                              toast.warning(`La cantidad no puede superar lo facturado (${item.quantityInvoiced})`)
                              return
                            }
                            setImmediateQty(item.sku, val)
                          }}
                          className="w-24 px-2 py-1 text-right border border-border rounded bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-border flex items-center justify-between gap-4 bg-muted/20">
            <p className="text-sm text-muted-foreground">
              Al confirmar, los saldos retirados se marcarán directamente como entregados.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
              >
                Cancelar
              </button>
              <button
                id="btn-import-confirm"
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {saving ? 'Importando...' : 'Confirmar Importación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Note Preview Card */}
      {docType === 'credit-note' && creditNoteRaw && (
        <div className="space-y-6">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden animate-enter">
            {/* Header */}
            <div className="p-6 border-b border-border bg-accent/30 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-950/20 text-red-600 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-red-650" />
                </div>
                <div>
                  <div className="text-lg font-bold text-foreground">
                    Nota de Crédito: {creditNoteRaw.internalReference || creditNoteRaw.number || query.trim()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Cliente: {creditNoteRaw.customerName || creditNoteRaw.client?.name || creditNoteRaw.nameOnInvoice || 'Desconocido'}
                  </div>
                  {creditNoteRaw.invoiceDate && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Fecha: {formatDate(new Date(creditNoteRaw.invoiceDate))}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-sm font-bold text-red-600 bg-red-100 dark:bg-red-950/30 px-3 py-1.5 rounded-full">
                {formatCurrency(creditNoteRaw.total || creditNoteRaw.totalAmount || 0, creditNoteRaw.currency || 'CRC')}
              </div>
            </div>

            {/* Lines */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-primary" />
                Artículos a Acreditar (Líneas de la Nota de Crédito)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-left">
                      <th className="py-2 px-4 text-xs font-semibold text-muted-foreground">SKU</th>
                      <th className="py-2 px-4 text-xs font-semibold text-muted-foreground">Descripción</th>
                      <th className="py-2 px-4 text-xs font-semibold text-muted-foreground text-right">Cantidad Acreditada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(creditNoteRaw.lines || []).map((line: any, idx: number) => (
                      <tr key={idx} className="hover:bg-muted/10">
                        <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">{line.sku || '—'}</td>
                        <td className="py-2.5 px-4 font-medium text-foreground">{line.description}</td>
                        <td className="py-2.5 px-4 text-right font-bold text-red-650">
                          {formatNumber(Math.abs(line.quantityInvoiced || line.quantity || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Link to Parent Invoice Block */}
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Link2 className="w-5 h-5 text-primary" />
              Vincular a Factura Padre en el Sistema
            </h3>
            <p className="text-xs text-muted-foreground">
              Esta nota de crédito se debe aplicar a una factura existente en la base de datos local para rebajar sus saldos pendientes.
            </p>

            <form onSubmit={handleSearchParentInvoice} className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={parentInvoiceQuery}
                  onChange={(e) => setParentInvoiceQuery(e.target.value)}
                  placeholder="Ingrese referencia de factura padre (Ej: FAC-2026-001)"
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <button
                type="submit"
                disabled={searchingParent || !parentInvoiceQuery.trim()}
                className="px-4 py-2.5 bg-secondary text-secondary-foreground text-sm font-semibold rounded-lg hover:bg-secondary/80 flex items-center gap-2"
              >
                {searchingParent ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Buscar Factura
              </button>
            </form>

            {/* Parent Invoice Link Preview */}
            {parentInvoice && (
              <div className="mt-4 p-4 border border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-950/10 rounded-xl space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Factura Padre Seleccionada: {parentInvoice.internalReference}</h4>
                    <p className="text-xs text-muted-foreground">Cliente: {parentInvoice.clientName}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-700 rounded-full font-bold">Vinculada</span>
                </div>

                <div className="pt-2 border-t border-green-200/50">
                  <h5 className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">Simulación de Rebaja de Saldos</h5>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-green-200/50 text-muted-foreground font-semibold">
                          <th className="py-1">Artículo</th>
                          <th className="py-1 text-right">Saldo Actual</th>
                          <th className="py-1 text-right">Nota Crédito</th>
                          <th className="py-1 text-right">Nuevo Saldo Pendiente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(creditNoteRaw.lines || []).map((cnLine: any, idx: number) => {
                          const dbItem = parentInvoiceItems.find(i => i.sku === cnLine.sku)
                          const qtyAcredited = Math.abs(cnLine.quantityInvoiced || cnLine.quantity || 0)
                          const currentPending = dbItem ? dbItem.quantityPending : 0
                          const newPending = Math.max(0, Math.round((currentPending - qtyAcredited) * 100) / 100)
                          
                          return (
                            <tr key={idx} className="border-b border-green-200/30">
                              <td className="py-2">
                                <div className="font-semibold text-foreground">{cnLine.description || (dbItem ? dbItem.description : 'Desconocido')}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{cnLine.sku}</div>
                              </td>
                              <td className="py-2 text-right font-medium text-foreground">{formatNumber(currentPending)}</td>
                              <td className="py-2 text-right font-bold text-red-600">-{formatNumber(qtyAcredited)}</td>
                              <td className="py-2 text-right font-bold text-foreground">{formatNumber(newPending)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Confirm Apply */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => { setParentInvoice(null); setParentInvoiceQuery(''); }}
                    className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted border border-border rounded-lg"
                  >
                    Desvincular
                  </button>
                  <button
                    onClick={handleSaveCreditNote}
                    disabled={saving}
                    className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 flex items-center gap-1.5 shadow-sm"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Confirmar Aplicar Nota de Crédito
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

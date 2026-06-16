'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { saveImportedInvoice, getInvoiceByReference } from '@/lib/firebase/firestore'
import { toast } from 'sonner'
import { Search, Loader2, FileText, Package, ArrowLeft, CheckCircle2, AlertCircle, Calendar } from 'lucide-react'
import Link from 'next/link'
import { InvoiceDoc, InvoiceItemDoc, FinanzaProInvoice } from '@/types'
import { formatDate, formatNumber, formatCurrency } from '@/lib/utils'

type PreviewData = {
  raw: FinanzaProInvoice
  invoice: Omit<InvoiceDoc, 'id'>
  items: Omit<InvoiceItemDoc, 'id'>[]
}

export default function ImportInvoicePage() {
  const router = useRouter()
  const { firebaseUser } = useAuth()
  
  // Navigation Tabs: 'direct' (search by single reference/id) or 'range' (search by date range)
  const [searchTab, setSearchTab] = useState<'direct' | 'range'>('direct')
  
  // Direct Search States
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'reference' | 'id'>('reference')
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

  // Handle Direct Search (by reference or ID)
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setPreview(null)
    setAlreadyExists(false)

    try {
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
        `/api/finanzapro/invoice?${mode === 'id' ? 'id' : 'reference'}=${encodeURIComponent(query.trim())}`,
        { headers: { 'x-user-uid': uid } }
      )
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error ?? 'Error al consultar FinanzaPro')
      }

      setPreview(json.data)
      toast.success('Factura encontrada. Revisa los detalles antes de importar.')
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo encontrar la factura')
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

    try {
      const res = await fetch(
        `/api/finanzapro/invoices?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
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

    try {
      const uid = firebaseUser?.uid ?? 'system'
      const queryParam = invoice.id 
        ? `id=${encodeURIComponent(invoice.id)}` 
        : `reference=${encodeURIComponent(invoice.internalReference)}`

      const res = await fetch(
        `/api/finanzapro/invoice?${queryParam}`,
        { headers: { 'x-user-uid': uid } }
      )
      const json = await res.json()

      if (!res.ok) {
        throw new Error(json.error ?? 'Error al cargar los detalles de la factura')
      }

      setPreview(json.data)
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

  // Save the previewed invoice to Firestore
  async function handleSave() {
    if (!preview) return
    setSaving(true)
    try {
      const invoiceId = await saveImportedInvoice(preview.invoice, preview.items)
      toast.success('¡Factura importada exitosamente!')
      router.push(`/invoices/${invoiceId}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar la factura')
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
        <h1 className="text-2xl font-bold text-foreground">Importar Factura</h1>
        <p className="text-muted-foreground mt-1">Busca y selecciona una factura en FinanzaPro para registrarla en el sistema</p>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-border">
        <button
          onClick={() => { setSearchTab('direct'); setPreview(null); setAlreadyExists(false) }}
          className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-all ${
            searchTab === 'direct'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Búsqueda Directa (Referencia / ID)
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

      {/* Direct Search Form */}
      {searchTab === 'direct' && (
        <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
          <div className="flex gap-3 mb-4">
            {(['reference', 'id'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setPreview(null); setAlreadyExists(false) }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'reference' ? 'Por Referencia' : 'Por ID'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="invoice-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={mode === 'reference' ? 'Ej: FAC-2024-001' : 'ID interno de FinanzaPro'}
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
                <div className="text-sm font-medium text-amber-800 dark:text-amber-300">Factura ya importada</div>
                <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  Esta factura ya existe en el sistema. Ve a{' '}
                  <Link href="/invoices" className="underline font-semibold text-amber-800 dark:text-amber-300">Facturas</Link> para verla.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Date Range Search Form */}
      {searchTab === 'range' && (
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
      {searchTab === 'range' && rangeResults && (
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
                      <td className="py-3.5 px-6 text-foreground font-medium max-w-[220px] truncate" title={inv.clientName}>
                        {inv.clientName}
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
          <p className="text-sm font-medium text-foreground">Cargando detalles de la factura...</p>
          <p className="text-xs text-muted-foreground mt-1">Obteniendo líneas y productos de FinanzaPro</p>
        </div>
      )}

      {/* Preview Card */}
      {preview && !searching && (
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
                    <th className="text-right text-xs font-medium text-muted-foreground pb-2">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.items.map((item, idx) => (
                    <tr key={idx} className="group hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs">{item.sku || '—'}</td>
                      <td className="py-2.5 pr-4 text-foreground font-medium">{item.description}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{item.unit}</td>
                      <td className="py-2.5 pr-4 text-right text-muted-foreground font-medium">{formatCurrency(item.unitPrice || 0, preview.raw.currency || 'CRC')}</td>
                      <td className="py-2.5 text-right font-semibold text-foreground">{formatNumber(item.quantityInvoiced)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 border-t border-border flex items-center justify-between gap-4 bg-muted/20">
            <p className="text-sm text-muted-foreground">
              Al importar, se inicializarán todos los saldos en{' '}
              <strong className="text-foreground">0 entregado</strong>.
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
    </div>
  )
}


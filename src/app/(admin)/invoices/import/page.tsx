'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { saveImportedInvoice, getInvoiceByReference } from '@/lib/firebase/firestore'
import { toast } from 'sonner'
import { Search, Loader2, FileText, Package, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { InvoiceDoc, InvoiceItemDoc, FinanzaProInvoice } from '@/types'
import { formatDate, formatNumber } from '@/lib/utils'

type PreviewData = {
  raw: FinanzaProInvoice
  invoice: Omit<InvoiceDoc, 'id'>
  items: Omit<InvoiceItemDoc, 'id'>[]
}

export default function ImportInvoicePage() {
  const router = useRouter()
  const { firebaseUser } = useAuth()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'reference' | 'id'>('reference')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [alreadyExists, setAlreadyExists] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setPreview(null)
    setAlreadyExists(false)

    try {
      // Check if already imported
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <Link href="/invoices" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Volver a Facturas
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Importar Factura</h1>
        <p className="text-muted-foreground mt-1">Busca una factura en FinanzaPro para importarla al sistema</p>
      </div>

      {/* Search form */}
      <div className="bg-card rounded-xl border border-border p-6 shadow-sm">
        <div className="flex gap-3 mb-4">
          {(['reference', 'id'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setPreview(null) }}
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
                <Link href="/invoices" className="underline">Facturas</Link> para verla.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden animate-enter">
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
                    <th className="text-right text-xs font-medium text-muted-foreground pb-2">Cantidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.items.map((item, idx) => (
                    <tr key={idx} className="group hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs">{item.sku || '—'}</td>
                      <td className="py-2.5 pr-4 text-foreground font-medium">{item.description}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{item.unit}</td>
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

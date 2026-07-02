'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllInvoices, updateInvoicesPriorities } from '@/lib/firebase/firestore'
import { InvoiceDoc, InvoiceStatus, INVOICE_STATUS_LABELS } from '@/types'
import { formatDate, formatRelative, toDate } from '@/lib/utils'
import { Plus, Search, FileText, Filter, Package, ChevronUp, ChevronDown, ChevronsUp } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  open: 'badge-info',
  in_progress: 'badge-warning',
  completed: 'badge-success',
  cancelled: 'badge-destructive',
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceDoc[]>([])
  const [filtered, setFiltered] = useState<InvoiceDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all'>('all')

  useEffect(() => {
    getAllInvoices().then((data) => {
      setInvoices(data)
      setFiltered(data)
      setLoading(false)
    })
  }, [])

  const isPendingView = statusFilter === 'open' || statusFilter === 'in_progress'
  const canReorder = isPendingView && !search.trim()

  const handleMoveInvoice = async (invoiceId: string, direction: 'up' | 'down' | 'top') => {
    const index = filtered.findIndex((i) => i.id === invoiceId)
    if (index === -1) return

    const newFiltered = [...filtered]
    if (direction === 'up' && index > 0) {
      const temp = newFiltered[index]
      newFiltered[index] = newFiltered[index - 1]
      newFiltered[index - 1] = temp
    } else if (direction === 'down' && index < newFiltered.length - 1) {
      const temp = newFiltered[index]
      newFiltered[index] = newFiltered[index + 1]
      newFiltered[index + 1] = temp
    } else if (direction === 'top' && index > 0) {
      const [item] = newFiltered.splice(index, 1)
      newFiltered.unshift(item)
    } else {
      return
    }

    const updates = newFiltered.map((inv, idx) => ({
      id: inv.id,
      priority: idx + 1,
    }))

    setFiltered(newFiltered)
    setInvoices((prev) =>
      prev.map((inv) => {
        const update = updates.find((u) => u.id === inv.id)
        return update ? { ...inv, priority: update.priority } : inv
      })
    )

    try {
      await updateInvoicesPriorities(updates)
      toast.success('Prioridad actualizada')
    } catch (error) {
      console.error(error)
      toast.error('Error al actualizar la prioridad')
      const data = await getAllInvoices()
      setInvoices(data)
    }
  }

  useEffect(() => {
    let result = [...invoices]
    if (statusFilter !== 'all') {
      result = result.filter((i) => i.status === statusFilter)
    }
    if (search.trim()) {
      const s = search.toLowerCase()
      result = result.filter(
        (i) =>
          i.internalReference.toLowerCase().includes(s) ||
          i.clientName.toLowerCase().includes(s)
      )
    }
    // Lógica de ordenamiento
    if (statusFilter === 'open' || statusFilter === 'in_progress') {
      result.sort((a, b) => {
        const pA = a.priority ?? Number.MAX_SAFE_INTEGER
        const pB = b.priority ?? Number.MAX_SAFE_INTEGER
        if (pA !== pB) return pA - pB
        return toDate(a.importedAt).getTime() - toDate(b.importedAt).getTime()
      })
    } else {
      result.sort((a, b) => (a.internalReference || '').localeCompare(b.internalReference || ''))
    }
    setFiltered(result)
  }, [search, statusFilter, invoices])

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {(['all', 'open', 'in_progress', 'completed', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'all' ? 'Todas' : INVOICE_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por referencia o cliente..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
          <Link
            href="/invoices/import"
            id="btn-new-invoice"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Importar
          </Link>
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
            <Package className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No se encontraron facturas</p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              {search ? 'Intenta con otro término de búsqueda' : 'Importa tu primera factura'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {isPendingView && (
                    <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3 w-32">Prioridad</th>
                  )}
                  <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Referencia</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Cliente</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Fecha</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Ítems</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Estado</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Importada</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((inv, idx) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors group">
                    {isPendingView && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary">
                            #{inv.priority ?? (idx + 1)}
                          </span>
                          {canReorder && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleMoveInvoice(inv.id, 'top')}
                                title="Mover al inicio"
                                className="p-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              >
                                <ChevronsUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveInvoice(inv.id, 'up')}
                                title="Subir"
                                className="p-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                disabled={idx === 0}
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleMoveInvoice(inv.id, 'down')}
                                title="Bajar"
                                className="p-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                disabled={idx === filtered.length - 1}
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-sm font-semibold text-foreground">{inv.internalReference}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-foreground font-medium">{inv.clientName}</div>
                      <div className="text-xs text-muted-foreground">{inv.companyName || 'Mercado Popular'}</div>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{formatDate(inv.issueDate)}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{inv.totalItems}</td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status]}`}>
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">{formatRelative(inv.importedAt)}</td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-xs text-primary font-medium hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        Ver detalle →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} de {invoices.length} facturas
      </p>
    </div>
  )
}

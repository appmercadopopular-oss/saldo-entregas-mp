'use client'

import { usePathname } from 'next/navigation'
import { Bell, Search } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/invoices': 'Facturas',
  '/invoices/import': 'Importar Factura',
  '/delivery-orders': 'Órdenes de Despacho',
  '/calendar': 'Calendario de Despachos',
  '/pending-balances': 'Saldos Pendientes',
  '/users': 'Gestión de Usuarios',
}

export default function Header() {
  const pathname = usePathname()
  const { userDoc } = useAuth()

  const title = Object.entries(PAGE_TITLES).find(([key]) =>
    pathname.startsWith(key)
  )?.[1] ?? 'SaldoEntregas'

  return (
    <header className="bg-card border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-40">
      <div>
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('es-GT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground">
          <Bell className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-primary font-bold text-sm">
              {userDoc?.displayName?.charAt(0).toUpperCase() ?? 'A'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}

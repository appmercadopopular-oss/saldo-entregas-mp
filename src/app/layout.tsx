import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: {
    default: 'SaldoEntregas — Control de Despachos',
    template: '%s | SaldoEntregas',
  },
  description:
    'Plataforma para la gestión de entregas parciales de materiales. Controla facturas, saldos y confirmaciones de despacho en tiempo real.',
  keywords: ['ferretería', 'despacho', 'entregas', 'facturas', 'materiales'],
  robots: { index: false, follow: false }, // No indexar (app interna)
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
              classNames: {
                toast: 'font-sans',
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  )
}

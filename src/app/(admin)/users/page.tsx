'use client'

import { useEffect, useState } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth'
import { getAllUsers } from '@/lib/firebase/firestore'
import { upsertUserDoc } from '@/lib/firebase/auth'
import { UserDoc, UserRole } from '@/types'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Users, Search, Plus, Shield, Truck, Power,
  X, Check, AlertCircle, Loader2, Mail, User, Phone, Key, Pencil
} from 'lucide-react'

// Firebase configuration for secondary initialization
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

function formatEmailOrUsername(email: string) {
  if (email.endsWith('@saldoentregasmp.com')) {
    return email.replace('@saldoentregasmp.com', '')
  }
  if (email.endsWith('@saldoentregasmp')) {
    return email.replace('@saldoentregasmp', '')
  }
  return email
}


export default function UsersPage() {
  const [users, setUsers] = useState<UserDoc[]>([])
  const [filtered, setFiltered] = useState<UserDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Edit states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserDoc | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmailOrUser, setEditEmailOrUser] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('driver')
  const [editPhoneNumber, setEditPhoneNumber] = useState('')
  const [updating, setUpdating] = useState(false)

  // Form states
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('driver')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadUsers() {
    try {
      const data = await getAllUsers()
      // Sort: admins first, then active state, then by name
      const sorted = [...data].sort((a, b) => {
        if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
        return a.displayName.localeCompare(b.displayName)
      })
      setUsers(sorted)
      setFiltered(sorted)
    } catch (err) {
      console.error(err)
      toast.error('Error al cargar la lista de usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    let result = users
    if (roleFilter !== 'all') {
      result = result.filter((u) => u.role === roleFilter)
    }
    if (search.trim()) {
      const s = search.toLowerCase()
      result = result.filter(
        (u) =>
          u.displayName.toLowerCase().includes(s) ||
          u.email.toLowerCase().includes(s) ||
          (u.email.endsWith('@saldoentregasmp.com') && u.email.replace('@saldoentregasmp.com', '').toLowerCase().includes(s)) ||
          (u.email.endsWith('@saldoentregasmp') && u.email.replace('@saldoentregasmp', '').toLowerCase().includes(s)) ||
          (u.phoneNumber && u.phoneNumber.includes(s))
      )
    }
    setFiltered(result)
  }, [search, roleFilter, users])

  async function handleToggleStatus(user: UserDoc) {
    const nextState = !user.isActive
    const actionText = nextState ? 'activado' : 'desactivado'
    try {
      await upsertUserDoc(user.uid, { isActive: nextState })
      toast.success(`Usuario ${user.displayName} ${actionText} con éxito`)
      // Optimistic UI update
      setUsers((prev) =>
        prev.map((u) => (u.uid === user.uid ? { ...u, isActive: nextState } : u))
      )
    } catch (err) {
      console.error(err)
      toast.error(`Error al cambiar el estado del usuario`)
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || password.length < 6) return
    setSubmitting(true)

    try {
      // 1. Initialize secondary Firebase Auth to avoid signing out the current Admin
      const secondaryApp =
        getApps().find((app) => app.name === 'SecondaryApp') ||
        initializeApp(firebaseConfig, 'SecondaryApp')
      const secondaryAuth = getAuth(secondaryApp)

      // Map email to virtual email if no '@' domain is present
      const formattedEmail = email.includes('@')
        ? email.trim()
        : `${email.trim()}@saldoentregasmp.com`

      // 2. Create the user in Auth
      const creds = await createUserWithEmailAndPassword(secondaryAuth, formattedEmail, password)
      const newUid = creds.user.uid

      // 3. Log out of secondary auth immediately
      await secondarySignOut(secondaryAuth)

      // 4. Create the Firestore User Profile
      const userPayload: UserDoc = {
        uid: newUid,
        email: formattedEmail,
        displayName: name,
        role,
        isActive: true,
        createdAt: new Date() as any, // Will be parsed inside Timestamp in Firestore
        ...(phoneNumber.trim() && { phoneNumber: phoneNumber.trim() }),
      }

      await upsertUserDoc(newUid, userPayload)

      toast.success(`Usuario '${name}' creado exitosamente como ${role === 'admin' ? 'Administrador' : 'Repartidor'}`)
      
      // Reset form
      setName('')
      setEmail('')
      setPassword('')
      setRole('driver')
      setPhoneNumber('')
      setIsModalOpen(false)
      
      // Reload list
      await loadUsers()
    } catch (err: any) {
      console.error(err)
      let msg = 'Error al registrar el usuario'
      if (err.code === 'auth/email-already-in-use') {
        msg = role === 'driver'
          ? 'Este nombre de usuario ya está registrado'
          : 'Este correo electrónico ya está registrado'
      } else if (err.code === 'auth/invalid-email') {
        msg = role === 'driver'
          ? 'El nombre de usuario no es válido'
          : 'El formato del correo electrónico no es válido'
      } else if (err.code === 'auth/weak-password') {
        msg = 'La contraseña debe tener al menos 6 caracteres'
      }
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  function handleOpenEditModal(user: UserDoc) {
    setEditingUser(user)
    setEditName(user.displayName)
    setEditEmailOrUser(formatEmailOrUsername(user.email))
    setEditRole(user.role)
    setEditPhoneNumber(user.phoneNumber || '')
    setEditPassword('')
    setIsEditModalOpen(true)
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault()
    if (!editingUser) return
    if (!editName.trim()) return
    setUpdating(true)

    try {
      const { auth } = await import('@/lib/firebase/config')
      const token = await auth.currentUser?.getIdToken()
      
      if (!token) {
        toast.error('No se pudo verificar tu sesión. Por favor reingresa.')
        setUpdating(false)
        return
      }

      const response = await fetch('/api/admin/users/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          uid: editingUser.uid,
          displayName: editName.trim(),
          phoneNumber: editPhoneNumber.trim(),
          role: editRole,
          ...(editPassword.trim() && { password: editPassword })
        })
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Error al actualizar usuario')
      }

      toast.success('Usuario actualizado con éxito')
      setIsEditModalOpen(false)

      // Optimistic UI update
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === editingUser.uid
            ? {
                ...u,
                displayName: editName.trim(),
                phoneNumber: editPhoneNumber.trim() || undefined,
                role: editRole
              }
            : u
        )
      )
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error al actualizar el usuario')
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Gestión de Usuarios</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Administra los roles, acceso y datos de contacto de todo tu personal.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          id="btn-new-user"
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-md whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Nuevo Usuario
        </button>
      </div>

      {/* Toolbar filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {(['all', 'admin', 'driver'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                roleFilter === r
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {r === 'all' ? 'Todos' : r === 'admin' ? 'Administradores' : 'Repartidores'}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, correo..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      {/* Table view */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground font-medium">No se encontraron usuarios</p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              {search ? 'Intenta con otra palabra clave' : 'Registra tu primer usuario'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left text-xs font-medium text-muted-foreground px-6 py-3">Nombre</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Usuario / Correo</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Teléfono</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Rol</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Estado</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Fecha Registro</th>
                  <th className="px-6 py-3 w-28 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((user) => (
                  <tr
                    key={user.uid}
                    className={`hover:bg-muted/20 transition-colors ${
                      !user.isActive ? 'opacity-60 bg-muted/10' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            user.role === 'admin'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30'
                          }`}
                        >
                          {user.role === 'admin' ? (
                            <Shield className="w-4 h-4" />
                          ) : (
                            <Truck className="w-4 h-4" />
                          )}
                        </div>
                        <span className="text-sm font-semibold text-foreground">
                          {user.displayName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">{formatEmailOrUsername(user.email)}</td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">
                      {user.phoneNumber || '—'}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                          user.role === 'admin'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/20'
                            : 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/20'
                        }`}
                      >
                        {user.role === 'admin' ? 'Administrador' : 'Repartidor'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-900/20 px-2.5 py-1 rounded-full">
                          <Check className="w-3 h-3" /> Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-100 dark:bg-red-900/20 px-2.5 py-1 rounded-full">
                          <X className="w-3 h-3" /> Inactivo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs text-muted-foreground">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center items-center gap-2">
                        <button
                          onClick={() => handleOpenEditModal(user)}
                          className="p-2 rounded-lg border border-border text-foreground hover:bg-muted dark:border-muted/30 transition-all"
                          title="Editar usuario"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`p-2 rounded-lg border transition-all ${
                            user.isActive
                              ? 'border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/30'
                              : 'border-green-200 text-green-600 hover:bg-green-50 dark:border-green-900/30'
                          }`}
                          title={user.isActive ? 'Desactivar usuario' : 'Activar usuario'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} de {users.length} usuarios
      </p>

      {/* Register User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-enter">
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Registrar Nuevo Personal
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nombre Completo *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {role === 'driver' ? 'Nombre de Usuario *' : 'Correo Electrónico *'}
                </label>
                <div className="relative">
                  {role === 'driver' ? (
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  )}
                  <input
                    type={role === 'driver' ? 'text' : 'email'}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={role === 'driver' ? 'Ej. juan23' : 'juan@ferreteria.com'}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Contraseña de Acceso *</label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Rol Asignado</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  >
                    <option value="driver">Repartidor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Teléfono (Opcional)</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="+502 XXXXXXXX"
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 text-center text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-enter">
          <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/20">
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                Editar Personal
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              {/* Username / Email (Read Only) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {editingUser.role === 'driver' ? 'Nombre de Usuario' : 'Correo Electrónico'}
                </label>
                <div className="relative">
                  {editingUser.role === 'driver' ? (
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  ) : (
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  )}
                  <input
                    type="text"
                    disabled
                    value={editEmailOrUser}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-muted/50 text-muted-foreground text-sm cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nombre Completo *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>

              {/* Phone Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Teléfono (Opcional)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={editPhoneNumber}
                    onChange={(e) => setEditPhoneNumber(e.target.value)}
                    placeholder="+502 XXXXXXXX"
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>

              {/* Role select */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Rol Asignado</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                >
                  <option value="driver">Repartidor</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              {/* Optional Password reset */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Nueva Contraseña (dejar en blanco para no cambiar)
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="Escribe para reasignar contraseña"
                    minLength={6}
                    className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-border mt-6">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-2.5 text-center text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                  {updating ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

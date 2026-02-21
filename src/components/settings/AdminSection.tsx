'use client'

import { useState, useEffect } from 'react'

type InviteCode = {
  id: string
  code: string
  label: string | null
  created_at: string
  expires_at: string | null
  used_by: string | null
  used_at: string | null
  used_by_email: string | null
  is_active: boolean
}

type FreeAccessEmail = {
  id: string
  email: string
  label: string | null
  created_at: string
}

type UserStats = {
  id: string
  email: string
  created_at: string
  is_free_tier: boolean | null
  subscription_status: string
  video_count: number
  channel_count: number
  estimated_size_mb: number
}

export default function AdminSection() {
  const [codes, setCodes] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state
  const [label, setLabel] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<number>(7)

  // Copy state
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Free access state
  const [freeEmails, setFreeEmails] = useState<FreeAccessEmail[]>([])
  const [freeEmailInput, setFreeEmailInput] = useState('')
  const [freeEmailLabel, setFreeEmailLabel] = useState('')
  const [addingFreeEmail, setAddingFreeEmail] = useState(false)
  const [freeEmailError, setFreeEmailError] = useState<string | null>(null)
  const [freeEmailSuccess, setFreeEmailSuccess] = useState<string | null>(null)

  // Users monitoring state
  const [users, setUsers] = useState<UserStats[]>([])
  const [usersLoading, setUsersLoading] = useState(true)

  useEffect(() => {
    fetchCodes()
    fetchFreeEmails()
    fetchUsers()
  }, [])

  async function fetchCodes() {
    try {
      const res = await fetch('/api/admin/invite-codes')
      if (res.ok) {
        const data = await res.json()
        setCodes(data.codes || [])
      } else {
        setError('Failed to load invite codes')
      }
    } catch {
      setError('Failed to load invite codes')
    }
    setLoading(false)
  }

  async function createCode() {
    setCreating(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/admin/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label || undefined,
          expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setCodes([data.code, ...codes])
        setLabel('')
        setSuccess(`Code created: ${data.code.code}`)
        // Auto-copy the new code
        await navigator.clipboard.writeText(data.code.code)
        setCopiedCode(data.code.code)
        setTimeout(() => setCopiedCode(null), 2000)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to create code')
      }
    } catch {
      setError('Failed to create code')
    }
    setCreating(false)
  }

  async function deactivateCode(codeId: string) {
    try {
      const res = await fetch(`/api/admin/invite-codes?id=${codeId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setCodes(codes.map(c => c.id === codeId ? { ...c, is_active: false } : c))
      } else {
        setError('Failed to deactivate code')
      }
    } catch {
      setError('Failed to deactivate code')
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  async function fetchFreeEmails() {
    try {
      const res = await fetch('/api/admin/free-access')
      if (res.ok) {
        const data = await res.json()
        setFreeEmails(data.emails || [])
      }
    } catch {
      // Silent fail - not critical
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch {
      // Silent fail
    }
    setUsersLoading(false)
  }

  async function addFreeEmail() {
    if (!freeEmailInput.trim() || !freeEmailInput.includes('@')) {
      setFreeEmailError('Enter a valid email address')
      return
    }

    setAddingFreeEmail(true)
    setFreeEmailError(null)
    setFreeEmailSuccess(null)

    try {
      const res = await fetch('/api/admin/free-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: freeEmailInput.trim(),
          label: freeEmailLabel || undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setFreeEmails([data.email, ...freeEmails])
        setFreeEmailInput('')
        setFreeEmailLabel('')
        setFreeEmailSuccess(`Free access granted to ${data.email.email}`)
      } else {
        const data = await res.json()
        setFreeEmailError(data.error || 'Failed to add email')
      }
    } catch {
      setFreeEmailError('Failed to add email')
    }
    setAddingFreeEmail(false)
  }

  async function removeFreeEmail(id: string) {
    try {
      const res = await fetch(`/api/admin/free-access?id=${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setFreeEmails(freeEmails.filter(e => e.id !== id))
      } else {
        setFreeEmailError('Failed to remove email')
      }
    } catch {
      setFreeEmailError('Failed to remove email')
    }
  }

  function getCodeStatus(code: InviteCode): { text: string; color: string } {
    if (!code.is_active) {
      return { text: 'Deactivated', color: 'text-gray-400' }
    }
    if (code.used_by) {
      return { text: 'Used', color: 'text-blue-500' }
    }
    if (code.expires_at && new Date(code.expires_at) < new Date()) {
      return { text: 'Expired', color: 'text-orange-500' }
    }
    return { text: 'Active', color: 'text-green-500' }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  const activeCodes = codes.filter(c => c.is_active && !c.used_by && (!c.expires_at || new Date(c.expires_at) >= new Date()))
  const usedCodes = codes.filter(c => c.used_by)
  const inactiveCodes = codes.filter(c => !c.is_active || (c.expires_at && new Date(c.expires_at) < new Date() && !c.used_by))

  return (
    <div className="space-y-8">
      {/* Users Monitoring Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Users</h2>
            <p className="text-sm text-muted-foreground">
              {users.length} registered user{users.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => { setUsersLoading(true); fetchUsers() }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Refresh
          </button>
        </div>

        {usersLoading ? (
          <div className="flex justify-center py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No users yet.
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium truncate">{user.email}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    user.is_free_tier ? 'bg-green-500/10 text-green-500' :
                    user.subscription_status === 'active' ? 'bg-blue-500/10 text-blue-500' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>
                    {user.is_free_tier ? 'Free' :
                     user.subscription_status === 'active' ? 'Paid' : 'None'}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>{user.video_count.toLocaleString()} videos</span>
                  <span>{user.channel_count} channels</span>
                  <span>~{user.estimated_size_mb} MB</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Joined {new Date(user.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}

            {/* Total summary */}
            <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 mt-3">
              <div className="flex gap-4 text-xs font-medium">
                <span>Total: {users.reduce((sum, u) => sum + u.video_count, 0).toLocaleString()} videos</span>
                <span>~{users.reduce((sum, u) => sum + u.estimated_size_mb, 0).toFixed(1)} MB</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Free Access Emails Section */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Free Access</h2>
          <p className="text-sm text-muted-foreground">
            Grant free access to specific email addresses
          </p>
        </div>

        {freeEmailError && (
          <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
            {freeEmailError}
          </div>
        )}

        {freeEmailSuccess && (
          <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-500">
            {freeEmailSuccess}
          </div>
        )}

        {/* Add Email Form */}
        <div className="rounded-xl border p-4 space-y-3">
          <h3 className="font-medium">Grant Free Access</h3>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              Gmail address
            </label>
            <input
              type="email"
              value={freeEmailInput}
              onChange={(e) => setFreeEmailInput(e.target.value)}
              placeholder="user@gmail.com"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              Label (who is this?)
            </label>
            <input
              type="text"
              value={freeEmailLabel}
              onChange={(e) => setFreeEmailLabel(e.target.value)}
              placeholder="e.g., Mom, Friend"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <button
            onClick={addFreeEmail}
            disabled={addingFreeEmail || !freeEmailInput.trim()}
            className="w-full rounded-lg bg-green-500 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:opacity-50"
          >
            {addingFreeEmail ? 'Adding...' : 'Grant Access'}
          </button>
        </div>

        {/* Free Access List */}
        {freeEmails.length > 0 && (
          <div className="space-y-2">
            {freeEmails.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{entry.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {entry.label && <span>{entry.label} · </span>}
                    Added {new Date(entry.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button
                  onClick={() => removeFreeEmail(entry.id)}
                  className="text-red-500 hover:text-red-600 text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {freeEmails.length === 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No free access emails yet.
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Invite Codes Section */}
      <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Invite Codes</h2>
        <p className="text-sm text-muted-foreground">
          Create and manage invite codes for free tier access
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-green-500/10 p-3 text-sm text-green-500">
          {success}
        </div>
      )}

      {/* Create New Code */}
      <div className="rounded-xl border p-4 space-y-4">
        <h3 className="font-medium">Create New Code</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              Label (who is this for?)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Sarah from Instagram"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              Expires in (days)
            </label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={0}>Never</option>
            </select>
          </div>

          <button
            onClick={createCode}
            disabled={creating}
            className="w-full rounded-lg bg-accent py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Generate Code'}
          </button>
        </div>
      </div>

      {/* Active Codes */}
      {activeCodes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-green-500">Active Codes ({activeCodes.length})</h3>
          <div className="space-y-2">
            {activeCodes.map((code) => (
              <CodeCard
                key={code.id}
                code={code}
                status={getCodeStatus(code)}
                copiedCode={copiedCode}
                onCopy={copyCode}
                onDeactivate={deactivateCode}
              />
            ))}
          </div>
        </div>
      )}

      {/* Used Codes */}
      {usedCodes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-blue-500">Used Codes ({usedCodes.length})</h3>
          <div className="space-y-2">
            {usedCodes.map((code) => (
              <CodeCard
                key={code.id}
                code={code}
                status={getCodeStatus(code)}
                copiedCode={copiedCode}
                onCopy={copyCode}
                onDeactivate={deactivateCode}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive Codes */}
      {inactiveCodes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-gray-400">Inactive/Expired ({inactiveCodes.length})</h3>
          <div className="space-y-2">
            {inactiveCodes.map((code) => (
              <CodeCard
                key={code.id}
                code={code}
                status={getCodeStatus(code)}
                copiedCode={copiedCode}
                onCopy={copyCode}
                onDeactivate={deactivateCode}
              />
            ))}
          </div>
        </div>
      )}

      {codes.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No invite codes yet. Create your first one above.
        </div>
      )}
      </div>
    </div>
  )
}

function CodeCard({
  code,
  status,
  copiedCode,
  onCopy,
  onDeactivate,
}: {
  code: InviteCode
  status: { text: string; color: string }
  copiedCode: string | null
  onCopy: (code: string) => void
  onDeactivate: (id: string) => void
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <code className="font-mono text-sm bg-muted px-2 py-1 rounded">
            {code.code}
          </code>
          <button
            onClick={() => onCopy(code.code)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {copiedCode === code.code ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <span className={`text-xs font-medium ${status.color}`}>
          {status.text}
        </span>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="space-y-1">
          {code.label && <div>For: {code.label}</div>}
          <div>Created: {new Date(code.created_at).toLocaleDateString()}</div>
          {code.expires_at && (
            <div>Expires: {new Date(code.expires_at).toLocaleDateString()}</div>
          )}
          {code.used_by_email && (
            <div>Used by: {code.used_by_email}</div>
          )}
          {code.used_at && (
            <div>Used on: {new Date(code.used_at).toLocaleDateString()}</div>
          )}
        </div>

        {code.is_active && !code.used_by && (
          <button
            onClick={() => onDeactivate(code.id)}
            className="text-red-500 hover:text-red-600 text-xs"
          >
            Deactivate
          </button>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AccountSection from './AccountSection'
import ImportSection from './ImportSection'
import StorageSection from './StorageSection'
import BillingSection from './BillingSection'
import AppearanceSection from './AppearanceSection'
import ExtensionSection from './ExtensionSection'
import AdminSection from './AdminSection'
import BottomNav from '../BottomNav'

const ADMIN_EMAIL = 'bensmir.hbs@gmail.com'

type Section = 'account' | 'import' | 'storage' | 'extension' | 'billing' | 'appearance' | 'admin'

export default function SettingsContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<Section>('import')
  const [user, setUser] = useState<{
    email?: string
    user_metadata?: {
      full_name?: string
      avatar_url?: string
    }
  } | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const checkAuth = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      setLoading(false)
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  const isAdmin = user?.email === ADMIN_EMAIL

  const sections = [
    { id: 'account' as const, label: 'Account', icon: '👤' },
    { id: 'import' as const, label: 'Import & Sync', icon: '🔄' },
    { id: 'storage' as const, label: 'Storage', icon: '📦' },
    { id: 'extension' as const, label: 'Extension', icon: '🧩' },
    { id: 'appearance' as const, label: 'Appearance', icon: '🎨' },
    { id: 'billing' as const, label: 'Billing', icon: '💳' },
    ...(isAdmin ? [{ id: 'admin' as const, label: 'Admin', icon: '🔑' }] : []),
  ]

  return (
    <div className="min-h-screen bg-background relative pb-16">
      <div className="grain-overlay" />

      {/* Header */}
      <header className="border-b sticky top-0 z-[110] isolate bg-[#ffffff] dark:bg-[#262017]">
        <div className="flex h-14 items-center gap-5 px-6">
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {/* Section tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                activeSection === section.id
                  ? 'bg-accent text-white shadow-md'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
              }`}
            >
              <span>{section.icon}</span>
              <span>{section.label}</span>
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="rounded-2xl border p-6 isolate bg-[#ffffff] dark:bg-[#262017]">
          {activeSection === 'account' && user && <AccountSection user={user} />}
          {activeSection === 'import' && <ImportSection />}
          {activeSection === 'storage' && <StorageSection />}
          {activeSection === 'extension' && <ExtensionSection />}
          {activeSection === 'appearance' && <AppearanceSection />}
          {activeSection === 'billing' && <BillingSection />}
          {activeSection === 'admin' && isAdmin && <AdminSection />}
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav activeTab="settings" onTabChange={(tab) => {
        if (tab === 'feed') router.push('/')
        if (tab === 'groups') router.push('/groups')
      }} />
    </div>
  )
}

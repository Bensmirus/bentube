import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { data: icons, error } = await supabase
      .from('icons')
      .select('emoji, name, category, keywords')
      .order('category')
      .order('sort_order')

    if (error) {
      console.error('Icons fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch icons' }, { status: 500 })
    }

    // Group by category
    const grouped = icons.reduce((acc, icon) => {
      if (!acc[icon.category]) {
        acc[icon.category] = []
      }
      acc[icon.category].push(icon)
      return acc
    }, {} as Record<string, typeof icons>)

    return NextResponse.json({ icons: grouped })
  } catch (error) {
    console.error('Icons API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

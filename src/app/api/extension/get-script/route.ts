import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateApiKey, saveApiKeyHash } from '@/lib/auth/api-key'
import { readFile } from 'fs/promises'
import { join } from 'path'

export async function POST() {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Generate new API key
    const { plaintext, hash } = generateApiKey()

    // Save the hash
    const saved = await saveApiKeyHash(user.id, hash)
    if (!saved) {
      return NextResponse.json(
        { error: 'Failed to save API key' },
        { status: 500 }
      )
    }

    // Read the userscript template
    const scriptPath = join(process.cwd(), 'public', 'scripts', 'bentube.user.js')
    let script = await readFile(scriptPath, 'utf-8')

    // Replace the empty DEFAULT_API_KEY with the actual key
    script = script.replace(
      "const DEFAULT_API_KEY = ''; // DO NOT EDIT - Generated automatically",
      `const DEFAULT_API_KEY = '${plaintext}'; // DO NOT EDIT - Generated automatically`
    )

    // Return as downloadable file
    return new NextResponse(script, {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Content-Disposition': 'attachment; filename="bentube.user.js"',
      },
    })
  } catch (error) {
    console.error('[Extension/GetScript] Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate script' },
      { status: 500 }
    )
  }
}

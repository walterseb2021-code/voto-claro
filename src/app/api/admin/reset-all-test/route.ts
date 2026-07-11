import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'

export const runtime = 'nodejs'

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase admin configuration')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.VERCEL_ENV === 'production') {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    }

    const gate = await requireAdmin(request)
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }

    const configuredSecret = process.env.ADMIN_SECRET_KEY
    if (!configuredSecret || configuredSecret.trim().length === 0) {
      return NextResponse.json({ error: 'Reset no configurado' }, { status: 403 })
    }

    const { secretKey } = await request.json()

    if (typeof secretKey !== 'string' || secretKey.length === 0 || secretKey !== configuredSecret) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const supabase = getSupabaseAdmin()

    const tablas = [
      'vote_intention_answers',
      'archived_topic_forum_comments',
      'comment_access_participants',
      'reto_ganadores',
    ]

    const resultados = []

    for (const tabla of tablas) {
      const { error, count } = await supabase
        .from(tabla)
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000')

      if (error) {
        console.error(`Error en ${tabla}:`, error)
        return NextResponse.json({ error: 'No se pudo resetear' }, { status: 500 })
      }

      resultados.push({ tabla, eliminados: count })
    }

    return NextResponse.json({
      success: true,
      message: 'Datos de prueba reseteados',
      resultados,
    })
  } catch (error) {
    console.error('Error en reset-all-test:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

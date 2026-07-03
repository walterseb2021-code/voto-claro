import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'

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

    // Validar clave secreta (debe estar en .env.local)
    if (typeof secretKey !== 'string' || secretKey.length === 0 || secretKey !== configuredSecret) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          async get(name: string) {
            const cookieStore = await cookies()
            return cookieStore.get(name)?.value
          },
          async set(name: string, value: string, options: any) {
            const cookieStore = await cookies()
            cookieStore.set({ name, value, ...options })
          },
          async remove(name: string, options: any) {
            const cookieStore = await cookies()
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )

    // Verificar que es admin por sesión también
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Lista de tablas a limpiar
    const tablas = [
      'vote_intention_answers',
      'archived_topic_forum_comments',
      'comment_access_participants',
      'reto_ganadores'
    ]

    const resultados = []

    for (const tabla of tablas) {
      const { error, count } = await supabase
        .from(tabla)
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000') // eliminar todos

      if (error) {
        console.error(`Error en ${tabla}:`, error)
        resultados.push({ tabla, error: error.message })
      } else {
        resultados.push({ tabla, eliminados: count })
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Datos de prueba reseteados',
      resultados 
    })

  } catch (error) {
    console.error('Error en reset-all-test:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

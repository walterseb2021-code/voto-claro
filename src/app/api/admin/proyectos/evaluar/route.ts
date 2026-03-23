import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  try {
    const { projectId, viability, impact, originality, participation } = await req.json();
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verificar si ya existe evaluación para este proyecto
    const { data: existing } = await supabase
      .from('project_evaluations')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (existing) {
      // Actualizar evaluación existente
      const { error } = await supabase
        .from('project_evaluations')
        .update({
          viability_score: viability,
          impact_score: impact,
          originality_score: originality,
          participation_score: participation,
          evaluated_at: new Date().toISOString(),
        })
        .eq('project_id', projectId);

      if (error) throw error;
    } else {
      // Insertar nueva evaluación
      const { error } = await supabase
        .from('project_evaluations')
        .insert({
          project_id: projectId,
          judge_name: 'Admin',
          viability_score: viability,
          impact_score: impact,
          originality_score: originality,
          participation_score: participation,
        });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error guardando evaluación:', error);
    return NextResponse.json({ error: 'Error al guardar evaluación' }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_MIN_SUPPORTS_REQUIRED = 100;

function clampScore(value: unknown, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function POST(req: Request) {
  try {
    const { projectId, impact, clarity, viability, sustainability, confirm } = await req.json();

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Falta projectId.' },
        { status: 400 }
      );
    }

    if (confirm !== 'yes') {
      return NextResponse.json(
        { success: false, error: 'La evaluación no fue confirmada.' },
        { status: 400 }
      );
    }

    const impactScore = clampScore(impact, 0, 15);
    const clarityScore = clampScore(clarity, 0, 15);
    const viabilityScore = clampScore(viability, 0, 15);
    const sustainabilityScore = clampScore(sustainability, 0, 15);

    if (
      impactScore == null ||
      clarityScore == null ||
      viabilityScore == null ||
      sustainabilityScore == null
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Todos los puntajes deben ser números válidos entre 0 y 15.',
        },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: existing } = await supabase
      .from('project_evaluations')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: 'Ya existe una evaluación para este proyecto. No se puede modificar.',
        },
        { status: 400 }
      );
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, beneficiary_count, minimum_supports_required, eligible_for_final_review')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) throw projectError;

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Proyecto no encontrado.' },
        { status: 404 }
      );
    }

    const beneficiaryCount = Number(project.beneficiary_count || 0);
    const minimumSupportsRequired = Number(
      project.minimum_supports_required || DEFAULT_MIN_SUPPORTS_REQUIRED
    );
    const eligibleForFinalReview =
      typeof project.eligible_for_final_review === 'boolean'
        ? project.eligible_for_final_review
        : beneficiaryCount >= minimumSupportsRequired;

    if (!eligibleForFinalReview && beneficiaryCount < minimumSupportsRequired) {
      return NextResponse.json(
        {
          success: false,
          error: `Este proyecto todavía no puede evaluarse. Le faltan ${
            minimumSupportsRequired - beneficiaryCount
          } apoyos.`,
        },
        { status: 400 }
      );
    }

    const qualityScore = round2(
      impactScore + clarityScore + viabilityScore + sustainabilityScore
    );

    let citizenSupportScore = 40;
    if (beneficiaryCount < minimumSupportsRequired) {
      citizenSupportScore = round2((beneficiaryCount / minimumSupportsRequired) * 40);
    }

    const finalScore = round2(citizenSupportScore + qualityScore);

    const { error: insertError } = await supabase.from('project_evaluations').insert({
      project_id: projectId,
      judge_name: 'Admin',

      // Reutilización de columnas existentes con nuevo significado lógico:
      // impact_score -> impacto comunitario
      // originality_score -> claridad del problema y la solución
      // viability_score -> viabilidad técnica y presupuestal
      // participation_score -> sostenibilidad del beneficio
      impact_score: impactScore,
      originality_score: clarityScore,
      viability_score: viabilityScore,
      participation_score: sustainabilityScore,

      citizen_support_score: citizenSupportScore,
      quality_score: qualityScore,
      final_score: finalScore,
      comments:
        `Evaluación 40/60 aplicada. ` +
        `Respaldo ciudadano: ${citizenSupportScore}/40. ` +
        `Calidad del proyecto: ${qualityScore}/60. ` +
        `Impacto: ${impactScore}/15. ` +
        `Claridad: ${clarityScore}/15. ` +
        `Viabilidad: ${viabilityScore}/15. ` +
        `Sostenibilidad: ${sustainabilityScore}/15.`,
    });

    if (insertError) throw insertError;

    const { error: updateProjectError } = await supabase
  .from('projects')
  .update({
    eligible_for_final_review: true,
    final_score: finalScore,
    score_updated_at: new Date().toISOString(),
  })
  .eq('id', projectId);

    if (updateProjectError) throw updateProjectError;

    return NextResponse.json({
      success: true,
      citizen_support_score: citizenSupportScore,
      quality_score: qualityScore,
      final_score: finalScore,
    });
  } catch (error) {
    console.error('Error guardando evaluación:', error);
    return NextResponse.json(
      { success: false, error: 'Error al guardar evaluación' },
      { status: 500 }
    );
  }
}
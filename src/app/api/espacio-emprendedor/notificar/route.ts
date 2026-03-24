// src/app/api/espacio-emprendedor/notificar/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Inicializar Resend (requiere API key)
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { projectTitle, category, department, investment_min, investment_max } = await req.json();

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Buscar inversionistas con preferencias coincidentes
    const { data: investors, error } = await supabase
      .from('espacio_inversionistas')
      .select(`
        id,
        investment_range_min,
        investment_range_max,
        categories,
        departments,
        notify_email,
        participant_id
      `)
      .eq('notify_email', true);

    if (error) throw error;

    // Obtener los datos de los participantes por separado
    const participantIds = investors?.map(i => i.participant_id).filter(Boolean) || [];
    
    let participantsMap: Record<string, { email: string; alias: string }> = {};
    if (participantIds.length > 0) {
      const { data: participants } = await supabase
        .from('project_participants')
        .select('id, email, alias')
        .in('id', participantIds);
      
      participantsMap = Object.fromEntries(
        (participants || []).map(p => [p.id, { email: p.email, alias: p.alias || 'Inversionista' }])
      );
    }

    // Filtrar inversionistas que coinciden con el proyecto
    const matches = investors?.filter(investor => {
      // Coincidencia de categoría
      const categoryMatch = investor.categories?.includes(category) || !investor.categories?.length;
      
      // Coincidencia de departamento
      const departmentMatch = investor.departments?.includes(department) || !investor.departments?.length;
      
      // Coincidencia de rango de inversión
      let investmentMatch = true;
      if (investor.investment_range_min && investment_max && investor.investment_range_min > investment_max) {
        investmentMatch = false;
      }
      if (investor.investment_range_max && investment_min && investor.investment_range_max < investment_min) {
        investmentMatch = false;
      }
      
      return categoryMatch && departmentMatch && investmentMatch;
    }) || [];

    // Enviar correos
    const emailsSent = [];
    for (const investor of matches) {
      const participant = participantsMap[investor.participant_id];
      const email = participant?.email;
      const alias = participant?.alias || 'Inversionista';
      
      if (!email) continue;

      try {
        await resend.emails.send({
          from: 'Voto Claro <notificaciones@voto-claro.vercel.app>',
          to: email,
          subject: `Nuevo proyecto: ${projectTitle}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #166534;">Nuevo proyecto en Espacio Emprendedor APP</h2>
              <p>Hola <strong>${alias}</strong>,</p>
              <p>Se ha publicado un nuevo proyecto que coincide con tus preferencias:</p>
              <div style="background-color: #f0fdf4; padding: 15px; border-radius: 12px; margin: 15px 0;">
                <h3 style="margin: 0 0 8px 0; color: #166534;">${projectTitle}</h3>
                <p style="margin: 4px 0;"><strong>Categoría:</strong> ${category}</p>
                <p style="margin: 4px 0;"><strong>Departamento:</strong> ${department}</p>
                <p style="margin: 4px 0;"><strong>Inversión:</strong> ${investment_min ? `S/ ${investment_min.toLocaleString()}` : 'No especificado'} ${investment_max ? `- S/ ${investment_max.toLocaleString()}` : ''}</p>
              </div>
              <p>Puedes ver todos los proyectos disponibles en el siguiente enlace:</p>
              <p><a href="https://voto-claro.vercel.app/espacio-emprendedor/explorar" style="background-color: #166534; color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; display: inline-block;">Ver proyectos</a></p>
              <p style="font-size: 12px; color: #666; margin-top: 30px;">Este es un mensaje automático de Voto Claro. Puedes modificar tus preferencias en tu perfil de inversionista.</p>
            </div>
          `,
        });
        emailsSent.push({ email, success: true });
      } catch (err) {
        console.error(`Error enviando correo a ${email}:`, err);
        emailsSent.push({ email, success: false });
      }
    }

    return NextResponse.json({
      success: true,
      matches: matches.length,
      emailsSent,
    });
  } catch (error) {
    console.error('Error en notificación:', error);
    return NextResponse.json({ error: 'Error al procesar notificaciones' }, { status: 500 });
  }
}
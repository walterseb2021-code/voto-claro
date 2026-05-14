export const metadata = {
  title: "Términos y Condiciones | VOTO CLARO",
  description: "Términos y condiciones de uso de la plataforma VOTO CLARO.",
};

export default function TerminosPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="mx-auto max-w-4xl rounded-2xl border-2 border-red-600 bg-white/90 p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">
          Términos y Condiciones de Uso
        </h1>

        <p className="mt-2 text-sm font-semibold text-slate-700">
          Última actualización: 2026
        </p>

        <section className="mt-6 space-y-4 text-sm font-semibold leading-relaxed text-slate-800">
          <p>
            VOTO CLARO es una plataforma digital de información, participación ciudadana,
            educación política, interacción con propuestas, comentarios, intención de voto,
            proyectos ciudadanos, emprendimiento, retos y espacios de comunicación vinculados
            a actividades democráticas y políticas.
          </p>

          <p>
            Al acceder, navegar, registrarte, comentar, votar, enviar información, publicar
            proyectos, usar asistentes de inteligencia artificial o continuar usando la
            plataforma, declaras haber leído y aceptado estos Términos y Condiciones, la
            Política de Privacidad y la autorización de Tratamiento de Datos Personales.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">1. Uso permitido</h2>
          <p>
            El usuario se compromete a usar la plataforma de forma responsable, respetuosa,
            lícita y compatible con la participación democrática. No está permitido publicar
            insultos, amenazas, difamaciones, contenido discriminatorio, información falsa
            presentada como hecho comprobado, datos personales de terceros sin autorización,
            spam, suplantación de identidad o contenido que afecte derechos de otras personas.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">2. Naturaleza informativa y participativa</h2>
          <p>
            La información mostrada en VOTO CLARO tiene finalidad informativa, participativa,
            formativa, organizativa y de comunicación política. La plataforma no reemplaza el
            criterio personal del ciudadano ni constituye una fuente oficial electoral.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">3. Contenido generado por usuarios</h2>
          <p>
            Los comentarios, videos, proyectos, mensajes, formularios, propuestas, preguntas,
            votos internos, preferencias, perfiles o cualquier otro contenido enviado por
            usuarios son responsabilidad de quien los publica o envía. VOTO CLARO puede aplicar
            reglas de moderación, revisión, archivo, bloqueo o eliminación cuando el contenido
            incumpla las reglas de uso o pueda generar riesgos legales, técnicos o reputacionales.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">4. Participación, registro y trazabilidad</h2>
          <p>
            Algunas funciones pueden requerir registro previo, código de acceso, identificación
            técnica del dispositivo, validación de participación o control interno para evitar
            duplicidad, abuso, manipulación de resultados, uso indebido o publicaciones masivas.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">5. Intención de voto y consultas internas</h2>
          <p>
            Las consultas de intención de voto, preferencias, encuestas internas, votaciones
            ciudadanas o dinámicas participativas dentro de la plataforma son mecanismos de
            interacción y medición interna, salvo que expresamente se indique otra cosa. No
            sustituyen resultados oficiales emitidos por autoridades electorales competentes.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">6. Proyectos ciudadanos y emprendimientos</h2>
          <p>
            Los proyectos ciudadanos o emprendedores publicados por usuarios son de exclusiva
            responsabilidad de sus autores. VOTO CLARO no garantiza rentabilidad, veracidad
            financiera, retorno económico, ejecución, solvencia, legalidad comercial ni éxito
            de ningún proyecto. Los interesados deben realizar su propia evaluación.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">7. Inteligencia artificial</h2>
          <p>
            Las funciones de asistencia mediante inteligencia artificial pueden ayudar a orientar,
            resumir, explicar o responder sobre información visible en la plataforma. Sus respuestas
            pueden requerir verificación humana y no deben ser consideradas asesoría legal,
            electoral, financiera, médica ni profesional.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">8. Propaganda, comunicación política y normativa electoral</h2>
          <p>
            La plataforma puede contener información, propuestas, mensajes, actividades o contenidos
            de naturaleza política. Su uso debe respetar la normativa peruana aplicable sobre
            organizaciones políticas, propaganda electoral, publicidad electoral, financiamiento,
            transparencia y fiscalización por las autoridades competentes.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">9. Suspensión o restricción de acceso</h2>
          <p>
            VOTO CLARO puede restringir, suspender o bloquear el acceso a funciones cuando detecte
            uso abusivo, intentos de manipulación, incumplimiento de reglas, riesgos de seguridad,
            vulneración de derechos o afectación del funcionamiento de la plataforma.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">10. Cambios en los términos</h2>
          <p>
            Estos términos pueden actualizarse para adecuarse a mejoras de la plataforma, cambios
            normativos o nuevas funcionalidades. La versión vigente será la publicada en esta página.
          </p>
        </section>

        <div className="mt-8">
          <a
            href="/"
            className="inline-flex rounded-xl border-2 border-red-600 bg-green-800 px-4 py-2 text-sm font-extrabold text-white hover:bg-green-900"
          >
            ← Volver a VOTO CLARO
          </a>
        </div>
      </div>
    </main>
  );
}
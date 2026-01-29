export default function PitchPage() {
  return (
    <main className="min-h-screen p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">VotoClaro</h1>
          <p className="mt-2 text-sm text-gray-600">
            Asistente informativo neutral para que el votante entienda rápido a cada candidato con
            evidencia y fuentes.
          </p>
        </div>
        <a
          href="/"
          className="border rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
        >
          Ir a la demo
        </a>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="border rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Problema</h2>
          <ul className="mt-3 text-sm text-gray-700 list-disc pl-5 space-y-2">
            <li>
              La información oficial (hojas de vida / planes) suele estar dispersa y es difícil de
              consultar rápidamente.
            </li>
            <li>
              El votante recibe información incompleta o sesgada, y pierde tiempo filtrando fuentes.
            </li>
            <li>
              La desinformación crece cuando no hay una forma simple de verificar con evidencia.
            </li>
          </ul>
        </section>

        <section className="border rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Solución</h2>
          <ul className="mt-3 text-sm text-gray-700 list-disc pl-5 space-y-2">
            <li>
              Buscador de candidatos con ficha rápida (foto, partido, resumen).
            </li>
            <li>
              3 módulos: <b>Hoja de Vida</b> / <b>Actuar político (con fuentes)</b> /{" "}
              <b>Plan de Gobierno</b>.
            </li>
            <li>
              Respuestas claras y cortas, siempre con <b>Fuentes visibles</b>.
            </li>
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <section className="border rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Diferenciador clave</h2>
          <p className="mt-3 text-sm text-gray-700">
            La IA está diseñada como <b>“lector con evidencia”</b>:
            <br />
            <span className="font-medium">
              si no hay evidencia, responde “No hay evidencia suficiente en las fuentes consultadas.”
            </span>
          </p>
        </section>

        <section className="border rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Cumplimiento y neutralidad</h2>
          <ul className="mt-3 text-sm text-gray-700 list-disc pl-5 space-y-2">
            <li>No recomienda por quién votar.</li>
            <li>Separa hechos verificables vs. alegaciones (cuando aplique).</li>
            <li>Lista blanca de fuentes y trazabilidad de respuestas.</li>
          </ul>
        </section>

        <section className="border rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Usuario objetivo</h2>
          <ul className="mt-3 text-sm text-gray-700 list-disc pl-5 space-y-2">
            <li>Votante que quiere informarse en 1–3 minutos.</li>
            <li>Periodistas / docentes / líderes vecinales.</li>
            <li>Organizaciones cívicas que promueven voto informado.</li>
          </ul>
        </section>
      </div>

      <div className="mt-8 border rounded-2xl p-5">
        <h2 className="text-lg font-semibold">Cómo se usa (demo actual)</h2>
        <ol className="mt-3 text-sm text-gray-700 list-decimal pl-5 space-y-2">
          <li>Buscar candidato por nombre.</li>
          <li>Entrar a su ficha.</li>
          <li>
            Elegir módulo (HV / Fuentes / Plan), usar preguntas sugeridas o escribir una pregunta.
          </li>
          <li>Ver respuesta + fuentes (o “No hay evidencia…”).</li>
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/" className="bg-black text-white rounded-lg px-4 py-2 text-sm">
            Probar la demo
          </a>
          <a
            href="/candidate/armando-joaquin-masse-fernandez?tab=HV"
            className="border rounded-lg px-4 py-2 text-sm"
          >
            Ver ejemplo (Armando)
          </a>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="border rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Roadmap</h2>
          <div className="mt-3 text-sm text-gray-700 space-y-3">
            <div>
              <div className="font-medium">Fase 1 (MVP)</div>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>UI + búsqueda + ficha + tabs + fuentes (listo).</li>
                <li>Imágenes y datos básicos por candidato (rápido).</li>
              </ul>
            </div>
            <div>
              <div className="font-medium">Fase 2 (IA + documentos)</div>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Subida de PDFs (HV/Plan) y lectura con evidencia (RAG).</li>
                <li>Gemini (gratis → Pro) con “no-inventar” + citas obligatorias.</li>
              </ul>
            </div>
            <div>
              <div className="font-medium">Fase 3 (fuentes externas + voz)</div>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>Lista blanca de medios + snapshots verificables.</li>
                <li>Entrada/salida por voz (STT/TTS).</li>
                <li>Comparador de candidatos + semáforo de verificabilidad.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Riesgos y mitigación</h2>
          <ul className="mt-3 text-sm text-gray-700 list-disc pl-5 space-y-2">
            <li>
              <b>Riesgo:</b> alucinaciones de IA. <b>Mitigación:</b> respuestas solo con evidencia y
              fuentes obligatorias.
            </li>
            <li>
              <b>Riesgo:</b> sesgo / propaganda. <b>Mitigación:</b> neutralidad, trazabilidad y
              tratamiento uniforme.
            </li>
            <li>
              <b>Riesgo:</b> fuentes de baja calidad. <b>Mitigación:</b> lista blanca + snapshots +
              auditoría.
            </li>
          </ul>

          <div className="mt-4 border rounded-xl p-4 bg-gray-50">
            <div className="text-sm font-medium">Mensaje clave</div>
            <p className="mt-1 text-sm text-gray-700">
              “VotoClaro no opina: muestra evidencia, resume y cita.”
            </p>
          </div>
        </section>
      </div>

      <footer className="mt-10 text-xs text-gray-500">
        Nota: La demo actual usa datos de prueba. La versión final integrará lectura de PDFs oficiales
        y fuentes verificadas con citas obligatorias.
      </footer>
    </main>
  );
}

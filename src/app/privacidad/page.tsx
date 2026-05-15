export const metadata = {
  title: "Política de Privacidad | VOTO CLARO",
  description: "Política de privacidad y protección de datos personales de VOTO CLARO.",
};

export default async function PrivacidadPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const rawReturnTo = params.returnTo || "/pitch";
  const returnTo = rawReturnTo.startsWith("/pitch") ? rawReturnTo : "/pitch";
  const encodedReturnTo = encodeURIComponent(returnTo);

  return (
    <main className="min-h-screen bg-gradient-to-b from-green-50 via-white to-green-100 px-4 py-8">
      <div className="mx-auto max-w-4xl rounded-2xl border-2 border-red-600 bg-white/90 p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">
          Política de Privacidad
        </h1>

        <p className="mt-2 text-sm font-semibold text-slate-700">
          Última actualización: 2026
        </p>

        <section className="mt-6 space-y-4 text-sm font-semibold leading-relaxed text-slate-800">
          <p>
            Esta Política de Privacidad explica cómo VOTO CLARO recopila, usa,
            conserva y protege la información personal de los usuarios que acceden,
            navegan, se registran o participan en la plataforma.
          </p>

          <p>
            VOTO CLARO busca tratar los datos personales conforme a la normativa
            peruana aplicable, incluyendo la Ley N.º 29733, Ley de Protección de
            Datos Personales, y sus disposiciones reglamentarias vigentes.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            1. Datos que podemos recopilar
          </h2>

          <p>
            Dependiendo del uso que realices de la plataforma, podemos recopilar
            datos como nombres, alias, correo electrónico, teléfono, DNI cuando sea
            necesario para validaciones específicas, código de acceso, identificador
            técnico del dispositivo, grupo de participación, comentarios, votos
            internos, preferencias, mensajes, proyectos, archivos enviados, enlaces
            de video, formularios y registros de actividad dentro de la aplicación.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            2. Finalidades del tratamiento
          </h2>

          <p>
            Los datos pueden ser utilizados para permitir el registro único del
            usuario, habilitar participación ciudadana, evitar duplicidad de votos
            o comentarios, controlar límites de participación, moderar contenido,
            gestionar proyectos ciudadanos o emprendedores, enviar notificaciones,
            responder consultas, mejorar la experiencia de uso, mantener la
            seguridad de la plataforma y cumplir obligaciones legales o
            requerimientos de autoridad competente.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            3. Participación política y comunicación
          </h2>

          <p>
            Al tratarse de una plataforma de información, participación ciudadana y
            comunicación política, algunos datos pueden utilizarse para organizar
            dinámicas de participación, mostrar propuestas, medir preferencias,
            facilitar interacción con contenidos políticos, informar actividades,
            difundir ideas o permitir contacto con ciudadanos interesados, siempre
            dentro del marco legal aplicable.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            4. Datos sensibles y documentos
          </h2>

          <p>
            VOTO CLARO no solicitará datos sensibles salvo que resulten necesarios
            para una funcionalidad concreta y legítima. Cuando se soliciten datos
            como DNI, afiliación, validaciones de identidad o documentos de
            proyectos, estos deberán ser utilizados solo para la finalidad informada
            al usuario.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            5. Publicación de contenido
          </h2>

          <p>
            Algunos contenidos enviados por los usuarios pueden mostrarse
            públicamente dentro de la plataforma, como comentarios aprobados,
            videos revisados, proyectos publicados, foros, reconocimientos o
            participaciones destacadas. No se deben publicar datos personales de
            terceros sin autorización.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            6. Seguridad y control
          </h2>

          <p>
            La plataforma puede usar identificadores técnicos, controles de sesión,
            códigos de acceso, registros de fecha y hora, metadatos y reglas de
            validación para proteger el sistema, prevenir abuso, reducir spam,
            evitar duplicidad y conservar trazabilidad de acciones relevantes.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            7. Servicios tecnológicos de terceros
          </h2>

          <p>
            Para operar la plataforma pueden utilizarse servicios tecnológicos de
            terceros, como alojamiento web, base de datos, autenticación, envío de
            correos, almacenamiento de archivos, analítica técnica o funciones de
            inteligencia artificial. Estos servicios podrán procesar datos solo en
            la medida necesaria para prestar dichas funcionalidades.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            8. Conservación de datos
          </h2>

          <p>
            Los datos podrán conservarse mientras exista una finalidad legítima,
            participación activa, necesidad de trazabilidad, obligación legal,
            seguridad técnica, prevención de fraude, historial público de
            participación o defensa frente a reclamos.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            9. Derechos del titular
          </h2>

          <p>
            El usuario puede solicitar el acceso, actualización, rectificación,
            cancelación u oposición respecto de sus datos personales, cuando
            corresponda conforme a la normativa peruana de protección de datos
            personales.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            10. Responsabilidad del usuario
          </h2>

          <p>
            El usuario es responsable de la veracidad de la información que envía,
            del contenido que publica y de no ingresar datos de terceros sin contar
            con autorización suficiente.
          </p>

          <h2 className="text-lg font-extrabold text-slate-900">
            11. Cambios en la política
          </h2>

          <p>
            Esta Política de Privacidad puede actualizarse para reflejar cambios
            legales, técnicos, operativos o nuevas funcionalidades. La versión
            vigente será la publicada en esta página.
          </p>

          </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={returnTo}
            className="inline-flex rounded-xl border-2 border-red-600 bg-green-800 px-4 py-2 text-sm font-extrabold text-white hover:bg-green-900"
          >
            ← Volver a VOTO CLARO
          </a>

          <a
            href={`/terminos?returnTo=${encodedReturnTo}`}
            className="inline-flex rounded-xl border-2 border-red-600 bg-white px-4 py-2 text-sm font-extrabold text-slate-900 hover:bg-green-50"
          >
            Ver Términos y Condiciones
          </a>

          <a
            href={`/tratamiento-datos?returnTo=${encodedReturnTo}`}
            className="inline-flex rounded-xl border-2 border-red-600 bg-white px-4 py-2 text-sm font-extrabold text-slate-900 hover:bg-green-50"
          >
            Ver Tratamiento de Datos
          </a>
        </div>
      </div>
    </main>
  );
}
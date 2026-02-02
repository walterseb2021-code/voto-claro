// src/lib/reflexionContent.ts

export type ReflectionQuestion = {
  id: string;
  question: string;
  reflection: string;
  followups?: string[];
};

export type Axis = {
  id: string;
  title: string;
  subtitle?: string;
  questions: ReflectionQuestion[];
};

// 👇 AQUÍ VA TU CONTENIDO REAL
export const REFLEXION_AXES: Axis[] = [
        {
        id: "eco",
        title: "Economía y empleo",
        subtitle: "Trabajo digno, oportunidades reales y bienestar en la vida cotidiana.",
        questions: [
          {
            id: "eco-1",
            question:
              "¿La economía que se propone busca solo cifras de crecimiento o bienestar real para las familias?",
            reflection:
              "Durante años se ha hablado de crecimiento económico como si los números por sí solos garantizaran una vida mejor. Sin embargo, el ciudadano debe preguntarse si ese crecimiento se siente en su mesa, en su barrio y en su tranquilidad diaria. Una economía puede mostrar cifras positivas mientras muchas familias siguen endeudadas, con empleos inseguros y sin acceso a servicios básicos. El bienestar real no se mide solo en porcentajes, sino en la posibilidad de vivir con dignidad, planificar el futuro y no sobrevivir con angustia permanente. Reflexionar sobre esta pregunta implica evaluar si la propuesta económica coloca a la persona y a la familia en el centro, o si reduce el desarrollo a estadísticas que no reflejan la realidad cotidiana.",
            followups: [
              "¿Cómo se refleja este crecimiento económico en mi vida diaria y la de mi comunidad?",
              "¿Quiénes se benefician realmente cuando la economía “crece”?",
            ],
          },
          {
            id: "eco-2",
            question:
              "¿El empleo que se promete será digno y estable, o precario y temporal?",
            reflection:
              "El trabajo no es solo una fuente de ingresos; es también una fuente de estabilidad emocional, identidad y respeto social. Cuando el empleo es precario, mal pagado o inestable, la persona vive con miedo al mañana y la familia entera sufre esa inseguridad. El ciudadano debe reflexionar si las propuestas de empleo buscan crear trabajos dignos, con derechos y condiciones justas, o si solo apuntan a cifras de ocupación sin importar la calidad del trabajo. Un país donde el empleo es frágil produce ciudadanos cansados y resignados. El empleo digno, en cambio, fortalece la economía, reduce la desigualdad y construye una sociedad más justa.",
            followups: [
              "¿Qué tipo de vida permite el empleo que se propone?",
              "¿El trabajo es visto como derecho o solo como herramienta económica?",
            ],
          },
          {
            id: "eco-3",
            question:
              "¿Se piensa en oportunidades para todos los sectores sociales, o solo para quienes ya tienen ventajas?",
            reflection:
              "Una economía verdaderamente inclusiva no se construye beneficiando siempre a los mismos. El ciudadano consciente debe observar si las oportunidades se abren también para jóvenes, mujeres, trabajadores informales y regiones históricamente olvidadas. Cuando el desarrollo favorece solo a quienes ya tienen recursos, la desigualdad se profundiza y el resentimiento social crece. Reflexionar sobre esta pregunta es preguntarse si el modelo económico busca integrar o excluir, si permite que el esfuerzo tenga recompensa o si el origen social determina el destino. Un país sin oportunidades equitativas pierde talento y esperanza.",
            followups: [
              "¿Qué sectores quedan fuera de estas oportunidades?",
              "¿El esfuerzo personal basta para progresar en este modelo?",
            ],
          },
          {
            id: "eco-4",
            question:
              "¿La política económica respeta la justicia social o sacrifica a los más vulnerables?",
            reflection:
              "Toda decisión económica tiene consecuencias humanas. Ajustes, recortes o reformas pueden parecer necesarias, pero el ciudadano debe preguntarse quién paga el precio. Cuando siempre son los mismos —los más pobres y vulnerables— quienes cargan con el costo, la economía pierde legitimidad moral. La justicia social implica distribuir de manera más equitativa los beneficios y también los sacrificios. Reflexionar sobre esta pregunta es analizar si la política económica protege a quienes menos tienen o si los expone aún más. Una sociedad que acepta el sacrificio permanente de los débiles termina normalizando la injusticia.",
            followups: [
              "¿Quién gana y quién pierde con estas decisiones económicas?",
              "¿Los más vulnerables están protegidos o son la variable de ajuste?",
            ],
          },
          {
            id: "eco-5",
            question:
              "¿Se prioriza el desarrollo sostenible o se busca riqueza rápida sin medir consecuencias?",
            reflection:
              "Hay modelos económicos que prometen resultados rápidos, pero dejan heridas profundas: ecosistemas destruidos, comunidades desplazadas, trabajo informal y dependencia. El ciudadano debe reflexionar si el desarrollo propuesto piensa en el mañana o solo en el beneficio inmediato. Un país no se construye con riqueza fugaz, sino con estabilidad y responsabilidad. La economía sostenible exige paciencia, planificación y ética: implica crecer sin destruir, producir sin excluir, y asegurar que el progreso no se compre al precio del futuro. Reflexionar aquí es preguntarse si se está eligiendo un camino que dura o una ilusión de corto plazo.",
            followups: [
              "¿Qué consecuencias dejará este modelo en 10 o 20 años?",
              "¿Se sacrifica el futuro por beneficios inmediatos?",
            ],
          },
        ],
      },

      {
        id: "salud",
        title: "Salud",
        subtitle: "La vida como prioridad y la salud como bien común.",
        questions: [
          {
            id: "salud-1",
            question:
              "¿La salud se entiende como un derecho garantizado o como un servicio condicionado?",
            reflection:
              "La salud no puede depender del poder adquisitivo o de la suerte. Cuando la salud se vuelve un servicio condicionado, muchos quedan fuera: los pobres, los que viven lejos, los que no tienen contactos. Un Estado ético reconoce que la salud es un derecho fundamental, porque sin salud la libertad pierde sentido. Reflexionar sobre esta pregunta es mirar si las propuestas buscan garantizar atención real para todos o si solo prometen mejoras para quienes ya acceden al sistema. Una sociedad justa mide su grandeza por cómo cuida a los más vulnerables.",
            followups: [
              "¿La propuesta asegura atención real para todos o solo para algunos?",
              "¿Qué pasa con quienes viven lejos o no tienen recursos?",
            ],
          },
          {
            id: "salud-2",
            question:
              "¿La propuesta se enfoca solo en curar o también en prevenir y cuidar?",
            reflection:
              "Un país que solo reacciona cuando la enfermedad ya avanzó vive apagando incendios. La prevención es más humana, más eficiente y más justa. Cuidar implica promover hábitos saludables, agua limpia, nutrición, salud mental, y una red primaria fuerte. Reflexionar sobre esta pregunta es preguntar si el plan ve a la salud como atención hospitalaria únicamente o como un sistema completo que protege la vida desde antes de enfermar. La prevención es una forma de respeto por la dignidad humana.",
            followups: [
              "¿Se fortalecen los centros de salud primaria y la prevención?",
              "¿La salud mental está considerada como parte real de la salud?",
            ],
          },
          {
            id: "salud-3",
            question:
              "¿Se proponen soluciones realistas para mejorar hospitales, personal y medicinas?",
            reflection:
              "Prometer hospitales suena bien, pero un hospital sin personal suficiente, sin medicinas y sin gestión termina siendo un edificio vacío. Reflexionar exige mirar la coherencia: ¿cómo se financiará?, ¿cómo se formará y retendrá personal?, ¿cómo se garantizarán insumos? Un ciudadano responsable no solo escucha la promesa, sino que evalúa el camino. La salud no necesita discursos grandiosos, sino sistemas que funcionen cada día.",
            followups: [
              "¿Qué mecanismos concretos asegurarán medicinas y personal?",
              "¿La propuesta explica cómo se implementará y sostendrá en el tiempo?",
            ],
          },
          {
            id: "salud-4",
            question:
              "¿La atención llega también a zonas rurales y regiones olvidadas, o se concentra en las ciudades?",
            reflection:
              "La desigualdad sanitaria se ve en la distancia: una ambulancia que nunca llega, un centro sin especialista, una comunidad sin agua segura. Reflexionar aquí es preguntar si la propuesta entiende el país real: diverso, disperso, con barreras geográficas. La justicia sanitaria significa que nacer lejos no sea una condena. Un Estado que concentra todo en las ciudades reduce a muchos a ciudadanos de segunda.",
            followups: [
              "¿Hay un plan claro para cerrar brechas regionales en salud?",
              "¿Qué pasa con comunidades alejadas y pueblos originarios?",
            ],
          },
          {
            id: "salud-5",
            question:
              "¿La salud se maneja con ética y transparencia, o se abre espacio a corrupción y negocio?",
            reflection:
              "La corrupción en salud no es solo robo: es vida que se pierde. Medicinas sobrevaloradas, obras abandonadas, compras irregulares… todo eso se traduce en sufrimiento humano. Reflexionar sobre esta pregunta implica mirar si existen controles, transparencia y rendición de cuentas. La salud no puede ser un negocio para unos pocos. Un ciudadano consciente entiende que sin ética, cualquier sistema colapsa.",
            followups: [
              "¿Qué mecanismos de control y transparencia se proponen?",
              "¿Cómo se evitará que la salud se convierta en botín político?",
            ],
          },
        ],
      },

      {
        id: "seg",
        title: "Seguridad ciudadana",
        subtitle: "Seguridad con justicia, prevención y respeto a la libertad.",
        questions: [
          {
            id: "seg-1",
            question:
              "¿Se busca seguridad real o solo promesas punitivas que suenan bien?",
            reflection:
              "El miedo puede ganar elecciones, pero no construye paz duradera. Muchas propuestas de seguridad se basan solo en castigo, como si la mano dura fuera suficiente. Reflexionar es distinguir entre discursos que tranquilizan y políticas que funcionan. La seguridad verdadera también requiere prevención, investigación, justicia rápida, rehabilitación y oportunidades. Un ciudadano consciente se pregunta si se está eligiendo un camino efectivo o solo una respuesta emocional.",
            followups: [
              "¿Hay prevención además de castigo?",
              "¿Se fortalece investigación, inteligencia y justicia?",
            ],
          },
          {
            id: "seg-2",
            question:
              "¿Se protege al ciudadano o se propone controlar a la población?",
            reflection:
              "Una política de seguridad puede convertirse en control social si se exageran medidas que recortan libertades sin resultados. Reflexionar sobre esta pregunta es mirar el equilibrio: ¿se respetan derechos?, ¿hay supervisión?, ¿se evita el abuso? La seguridad no puede justificar cualquier cosa. Un país seguro es uno donde el ciudadano vive con tranquilidad, pero también con dignidad y libertad.",
            followups: [
              "¿Qué garantías existen contra abusos de poder?",
              "¿Se respeta el derecho a la privacidad y al debido proceso?",
            ],
          },
          {
            id: "seg-3",
            question:
              "¿La propuesta atiende causas del delito o solo sus efectos visibles?",
            reflection:
              "El delito no nace de la nada: crece donde hay abandono, desigualdad, impunidad y falta de oportunidades. Si solo se combate el síntoma, la raíz sigue intacta. Reflexionar es preguntarse si hay políticas para jóvenes, educación, empleo, espacios comunitarios, salud mental, y reinserción. La seguridad se construye también con justicia social.",
            followups: [
              "¿Qué se propone para prevenir el delito desde la raíz?",
              "¿Hay estrategias para jóvenes y zonas más vulnerables?",
            ],
          },
          {
            id: "seg-4",
            question:
              "¿Se fortalece la policía con formación y control, o solo con más poder sin supervisión?",
            reflection:
              "Una policía sin formación y sin control puede convertirse en parte del problema. La fuerza pública necesita recursos, sí, pero también educación, ética y supervisión. Reflexionar aquí implica mirar si hay mejora de capacitación, salarios, tecnología, protocolos y mecanismos para sancionar abusos. La seguridad necesita autoridad, pero autoridad legítima.",
            followups: [
              "¿Se plantea capacitación real y mejora institucional?",
              "¿Cómo se controlarán y sancionarán abusos o corrupción interna?",
            ],
          },
          {
            id: "seg-5",
            question:
              "¿La seguridad se piensa como un bien común con participación comunitaria?",
            reflection:
              "Los barrios, las juntas vecinales, la iluminación, el urbanismo, la participación local… todo eso influye. Si la seguridad se deja solo a la policía, se pierde la dimensión comunitaria. Reflexionar es valorar si hay enfoque integral: municipalidades, comunidad, escuela, familia, Estado. La paz se construye en lo cotidiano, no solo en operativos.",
            followups: [
              "¿Se incluye a municipios y comunidad en la estrategia?",
              "¿Se mejora el entorno (luz, espacios públicos, prevención)?",
            ],
          },
        ],
      },

      {
        id: "edu",
        title: "Educación",
        subtitle: "Formar ciudadanos libres: educación para pensar, no solo para obedecer.",
        questions: [
          {
            id: "edu-1",
            question:
              "¿La educación se trata como gasto o como inversión en generaciones?",
            reflection:
              "Tratar la educación como gasto es una visión corta; verla como inversión es pensar en generaciones. Reflexionar sobre esta pregunta implica evaluar si hay compromiso real con infraestructura, docentes, materiales y continuidad. Una educación sólida no se improvisa. Es la base de la libertad ciudadana: un pueblo educado piensa, cuestiona y no se deja manipular.",
            followups: [
              "¿Qué parte del presupuesto y de la prioridad política se asigna a educación?",
              "¿La propuesta sostiene cambios a largo plazo o solo promesas inmediatas?",
            ],
          },
          {
            id: "edu-2",
            question:
              "¿Se busca mejorar aprendizaje real o solo construir escuelas como cifra política?",
            reflection:
              "Construir escuelas puede ser necesario, pero no basta. Sin calidad docente, currículo relevante, evaluación y acompañamiento, el aprendizaje no mejora. Reflexionar aquí significa mirar lo esencial: ¿qué tipo de ciudadano se quiere formar? La educación debe liberar, no adiestrar. Debe crear capacidad crítica, no solo repetición.",
            followups: [
              "¿Qué se propone para mejorar la calidad docente y el aprendizaje?",
              "¿Se habla de formación integral o solo de infraestructura?",
            ],
          },
          {
            id: "edu-3",
            question:
              "¿La propuesta reduce brechas entre regiones o profundiza desigualdades?",
            reflection:
              "La brecha educativa es una forma silenciosa de injusticia. Un niño en una región olvidada no debería tener menos futuro por nacer lejos. Reflexionar es preguntar si se mejorarán escuelas rurales, conectividad, transporte, y acceso a materiales. Una nación se mide por el cuidado que brinda a sus niños, en todas sus regiones.",
            followups: [
              "¿Cómo se asegura igualdad de oportunidades educativas en regiones?",
              "¿Hay compromiso con conectividad y recursos para zonas rurales?",
            ],
          },
          {
            id: "edu-4",
            question:
              "¿Se promueve educación con valores democráticos o con propaganda y control?",
            reflection:
              "La educación también puede usarse como herramienta de control si se vuelve propaganda. Reflexionar aquí es defender la escuela como espacio de pensamiento y convivencia democrática. Un Estado sano no teme a ciudadanos críticos; los necesita. La educación debe enseñar a dialogar, respetar y construir comunidad.",
            followups: [
              "¿Se protege la libertad de pensamiento y el pluralismo en la escuela?",
              "¿Se fomenta ciudadanía y ética pública?",
            ],
          },
          {
            id: "edu-5",
            question:
              "¿Se prepara a los jóvenes para el mundo real o se les deja sin herramientas?",
            reflection:
              "La educación debe conectar con la vida: habilidades, empleo, tecnología, cultura, y dignidad. Si se enseña para memorizar sin comprender, se forma frustración. Reflexionar implica ver si hay formación técnica, superior accesible, orientación vocacional, y oportunidades reales. El futuro no espera: el país debe preparar a sus jóvenes para construirlo.",
            followups: [
              "¿Hay propuestas para formación técnica y empleo juvenil?",
              "¿Se fortalece educación superior pública y acceso equitativo?",
            ],
          },
        ],
      },

      {
        id: "des",
        title: "Descentralización y regiones",
        subtitle: "Equilibrio territorial: el país no es solo la capital.",
        questions: [
          {
            id: "des-1",
            question:
              "¿Se entiende que el país es diverso o se gobierna como si todo fuera Lima?",
            reflection:
              "El Perú no es solo Lima. Centralizar el poder es empobrecer la diversidad. Reflexionar implica evaluar si el plan reconoce realidades distintas: costa, sierra, selva; ciudades y campo; regiones con necesidades y potenciales diferentes. Un gobierno que solo mira el centro deja a millones como espectadores.",
            followups: [
              "¿Las regiones son escuchadas o utilizadas?",
              "¿La propuesta considera necesidades específicas por territorio?",
            ],
          },
          {
            id: "des-2",
            question:
              "¿Se fortalecen gobiernos regionales y locales con capacidades reales o solo con discursos?",
            reflection:
              "La descentralización no es solo transferir responsabilidades: es dar capacidades. Reflexionar aquí es preguntar si habrá recursos, asistencia técnica y control para que gobiernos locales gestionen bien. Sin capacidades, la descentralización se vuelve frustración y desorden.",
            followups: [
              "¿Se propone fortalecer gestión y capacidades en regiones?",
              "¿Cómo se evitará la ineficiencia sin recentralizar todo?",
            ],
          },
          {
            id: "des-3",
            question:
              "¿Se combate la corrupción regional con controles claros sin castigar a las regiones?",
            reflection:
              "La corrupción puede existir en cualquier nivel. Reflexionar exige equilibrio: controlar y sancionar sin usar la corrupción como excusa para quitar autonomía a las regiones. La solución es transparencia, control y participación ciudadana, no volver al centralismo.",
            followups: [
              "¿Qué mecanismos de control se proponen en regiones?",
              "¿Se respeta autonomía regional con supervisión efectiva?",
            ],
          },
          {
            id: "des-4",
            question:
              "¿Se impulsa infraestructura y servicios donde más falta hacen o solo donde conviene políticamente?",
            reflection:
              "Cuando la inversión se decide por cálculo electoral, se traiciona la justicia territorial. Reflexionar es mirar si se prioriza agua, salud, educación, conectividad y caminos en zonas históricamente olvidadas. El desarrollo debe corregir desigualdades, no premiar cercanías al poder.",
            followups: [
              "¿Qué criterios se usan para priorizar inversión pública?",
              "¿Se atienden brechas históricas o se repiten patrones de abandono?",
            ],
          },
          {
            id: "des-5",
            question:
              "¿Se respeta la identidad y voz regional en las decisiones nacionales?",
            reflection:
              "Gobernar es equilibrar, no concentrar. Reflexionar aquí es preguntar si las regiones participan en decisiones que las afectan. La identidad cultural, económica y social de cada región debe ser parte del país, no una nota al pie. Sin reconocimiento, no hay nación compartida.",
            followups: [
              "¿Cómo se incorpora participación regional en decisiones nacionales?",
              "¿Se respeta diversidad cultural y prioridades locales?",
            ],
          },
        ],
      },

      {
        id: "jus",
        title: "Justicia y corrupción",
        subtitle: "Verdad, coherencia y lucha real contra el abuso del poder.",
        questions: [
          {
            id: "jus-1",
            question:
              "¿Se combate la corrupción con voluntad real o solo con discursos?",
            reflection:
              "La corrupción erosiona la confianza y destruye el tejido social. Combatirla exige voluntad real, no solo discursos. Reflexionar aquí implica mirar si existen medidas concretas: prevención, transparencia, sanción efectiva y autonomía de instituciones. Un país no mejora cuando se acostumbra a convivir con el robo.",
            followups: [
              "¿Qué mecanismos concretos se proponen para prevenir y sancionar corrupción?",
              "¿Se fortalecen instituciones o se las debilita cuando incomodan?",
            ],
          },
          {
            id: "jus-2",
            question:
              "¿La justicia se propone independiente o sometida al poder político?",
            reflection:
              "Sin justicia independiente, el poder no tiene límites. Reflexionar sobre esta pregunta es evaluar si se respeta la autonomía del sistema judicial o si se pretende capturarlo. La justicia sometida se vuelve herramienta de venganza o impunidad. La justicia independiente protege al ciudadano, incluso cuando el ciudadano no tiene poder.",
            followups: [
              "¿Se respeta autonomía judicial y fiscal?",
              "¿Cómo se evita que la justicia se use como arma política?",
            ],
          },
          {
            id: "jus-3",
            question:
              "¿Se promueve integridad en funcionarios o se normaliza el “roba pero hace”?",
            reflection:
              "La ética es lo que permanece cuando no hay cámaras. Normalizar el “roba pero hace” destruye la moral pública. Reflexionar aquí es entender que la corrupción no es un detalle: es una forma de violencia contra el ciudadano que paga impuestos, espera servicios y recibe abandono.",
            followups: [
              "¿Se exige integridad como estándar real?",
              "¿Se tolera corrupción por resultados aparentes?",
            ],
          },
          {
            id: "jus-4",
            question:
              "¿Se propone transparencia y rendición de cuentas o se evita el control ciudadano?",
            reflection:
              "El poder que no escucha se vuelve autoritario. Gobernar no es hablar todo el tiempo, sino saber oír. Reflexionar implica ver si habrá datos públicos, auditorías, y acceso a información. La transparencia no es un favor: es deber.",
            followups: [
              "¿Habrá acceso real a información pública y seguimiento ciudadano?",
              "¿Se fortalecen organismos de control o se los debilita?",
            ],
          },
          {
            id: "jus-5",
            question:
              "¿La política se basa en verdad o en manipulación y mentira útil?",
            reflection:
              "La mentira sistemática destruye la confianza, y sin confianza no hay comunidad política. Reflexionar aquí es preguntar si se prefiere una verdad incómoda o una mentira reconfortante. Cuando la verdad se relativiza, el abuso del poder se vuelve más fácil.",
            followups: [
              "¿El liderazgo corrige errores o los oculta?",
              "¿Se apela a datos verificables o a relatos convenientes?",
            ],
          },
        ],
      },

      {
        id: "amb",
        title: "Medio ambiente",
        subtitle: "Cuidar el futuro: desarrollo sin destruir lo irrecuperable.",
        questions: [
          {
            id: "amb-1",
            question:
              "¿Se protege la naturaleza como un legado o se la trata como recurso para explotar?",
            reflection:
              "La naturaleza no pertenece a una generación; es un préstamo del futuro. Destruirla por beneficio inmediato es una forma de egoísmo histórico. Reflexionar aquí es pensar si el desarrollo propuesto respeta límites y responsabilidades. Un país que destruye sus ríos, bosques y suelos se empobrece, aunque parezca “crecer”.",
            followups: [
              "¿Qué país quedará cuando ya no estemos?",
              "¿Se mide el costo ambiental de las decisiones económicas?",
            ],
          },
          {
            id: "amb-2",
            question:
              "¿Se plantea desarrollo sostenible o solo crecimiento rápido sin cuidado?",
            reflection:
              "El desarrollo sostenible exige planificación, ciencia y ética. Reflexionar es distinguir entre progreso real y aceleración destructiva. Cuando se sacrifica lo irrecuperable por ganancias inmediatas, la sociedad paga el precio después: desastres, enfermedades, pérdida de agua y alimentos.",
            followups: [
              "¿La propuesta equilibra economía y ambiente con claridad?",
              "¿Se incluyen metas y controles ambientales verificables?",
            ],
          },
          {
            id: "amb-3",
            question:
              "¿Se protege el agua como bien común o se la deja vulnerable a intereses privados?",
            reflection:
              "Sin agua, no hay vida ni agricultura ni salud. Reflexionar sobre esta pregunta es revisar si el agua se considera un derecho y un bien común, o si se deja al azar del poder. La gestión del agua requiere justicia, inversión y participación. El agua no puede ser privilegio.",
            followups: [
              "¿Se garantizan fuentes de agua limpias y seguras?",
              "¿Cómo se protege a comunidades ante contaminación?",
            ],
          },
          {
            id: "amb-4",
            question:
              "¿Se reconoce el impacto del cambio climático en la vida cotidiana del país?",
            reflection:
              "El cambio climático ya impacta: lluvias extremas, sequías, pérdida de cultivos. Reflexionar aquí es ver si la propuesta entiende riesgos y adapta infraestructura, agricultura, ciudades y respuesta a emergencias. Ignorar el clima es gobernar con los ojos cerrados.",
            followups: [
              "¿Hay medidas de adaptación y prevención de desastres?",
              "¿Se protege a los más vulnerables frente a eventos extremos?",
            ],
          },
          {
            id: "amb-5",
            question:
              "¿Se respeta a las comunidades afectadas por proyectos extractivos o se las ignora?",
            reflection:
              "Gobernar también es saber decir “no” cuando el desarrollo sacrifica lo irrecuperable. Reflexionar implica reconocer que no todo proyecto es progreso si deja conflicto, contaminación o ruptura social. Dialogar, respetar y reparar es parte de la ética pública.",
            followups: [
              "¿Se consulta y respeta a comunidades locales?",
              "¿Qué mecanismos garantizan diálogo, compensación y vigilancia real?",
            ],
          },
        ],
      },

      {
        id: "tec",
        title: "Tecnología e innovación",
        subtitle: "Progreso con inclusión: tecnología para servir a la ciudadanía.",
        questions: [
          {
            id: "tec-1",
            question:
              "¿La tecnología se usa para mejorar servicios públicos o solo como discurso moderno?",
            reflection:
              "La tecnología no vale por sonar futurista, sino por resolver problemas reales: colas, trámites, corrupción, acceso. Reflexionar aquí es preguntarse si hay planes concretos, presupuesto y capacidad para digitalizar servicios, y si eso mejora la vida del ciudadano común.",
            followups: [
              "¿Qué servicios se transformarán realmente y cómo?",
              "¿La propuesta explica implementación, seguridad y mantenimiento?",
            ],
          },
          {
            id: "tec-2",
            question:
              "¿Se reduce la brecha digital o se deja fuera a quienes no tienen acceso?",
            reflection:
              "La innovación que excluye no es progreso: es privilegio. Reflexionar implica ver si hay conectividad para escuelas, postas, zonas rurales, y si se enseña alfabetización digital. Sin acceso, la tecnología se convierte en otra forma de desigualdad.",
            followups: [
              "¿Hay plan real de conectividad en regiones y zonas rurales?",
              "¿Se promueve educación digital para todos?",
            ],
          },
          {
            id: "tec-3",
            question:
              "¿Se protege la privacidad y los datos personales de la ciudadanía?",
            reflection:
              "Digitalizar sin proteger datos es poner en riesgo a las personas. Reflexionar aquí es evaluar si existen medidas de seguridad, transparencia y límites. La tecnología debe servir al ciudadano, no vigilarlo ni exponerlo.",
            followups: [
              "¿Qué garantías hay sobre privacidad y uso de datos?",
              "¿Habrá supervisión y reglas claras sobre tecnologías de vigilancia?",
            ],
          },
          {
            id: "tec-4",
            question:
              "¿La innovación impulsa empleo y oportunidades o desplaza sin plan?",
            reflection:
              "La innovación puede crear trabajo o destruirlo, según cómo se gestione. Reflexionar aquí es preguntar si hay capacitación, reconversión laboral, apoyo a emprendimiento y ciencia. Un país innovador prepara a su gente, no la abandona.",
            followups: [
              "¿Hay programas de capacitación y reconversión laboral?",
              "¿Se apoya a emprendimientos y ciencia con continuidad?",
            ],
          },
          {
            id: "tec-5",
            question:
              "¿Se promueve investigación y desarrollo real o solo se compra tecnología importada?",
            reflection:
              "Comprar tecnología no es innovar. Reflexionar exige ver si se apoya investigación, universidades, centros científicos, y si hay visión a largo plazo. La innovación real crea soberanía, capacidades y futuro.",
            followups: [
              "¿Se financia I+D y se fortalecen universidades públicas?",
              "¿Hay una visión de largo plazo para ciencia y tecnología?",
            ],
          },
        ],
      },

      {
        id: "ext",
        title: "Política exterior y defensa",
        subtitle: "Soberanía con responsabilidad, paz con firmeza y visión estratégica.",
        questions: [
          {
            id: "ext-1",
            question:
              "¿La política exterior busca cooperación y respeto o se basa en conflictos y polarización?",
            reflection:
              "La política exterior no es un escenario para ego personal: es defensa del interés nacional. Reflexionar aquí es evaluar si se propone diálogo, cooperación y prestigio internacional, o si se alimenta confrontación inútil. El país necesita aliados, no enemigos imaginarios.",
            followups: [
              "¿Se fortalece la diplomacia profesional o se la politiza?",
              "¿Se priorizan intereses del país sobre discursos ideológicos?",
            ],
                   },
          {
            id: "ext-2",
            question:
              "¿Se defiende la soberanía con estrategia o solo con frases patrióticas?",
            reflection:
              "La soberanía no se protege con slogans, sino con instituciones fuertes, inteligencia, fronteras cuidadas y relaciones internacionales estables. Reflexionar aquí es distinguir entre patriotismo emocional y defensa real. El país necesita seriedad, no espectáculo.",
            followups: [
              "¿Qué medidas concretas se proponen para fronteras y soberanía?",
              "¿Se coordina defensa con desarrollo y seguridad interna?",
            ],
          },
          {
            id: "ext-3",
            question:
              "¿La defensa se piensa como protección del ciudadano o como poder militar sin control?",
            reflection:
              "La defensa nacional existe para proteger a la ciudadanía, no para intimidarla. Reflexionar sobre esto implica mirar controles democráticos, transparencia en compras, y respeto a derechos. Un país seguro es uno donde fuerzas del orden están al servicio de la Constitución.",
            followups: [
              "¿Hay control civil y democrático sobre defensa?",
              "¿Cómo se evita corrupción en compras y contratos de defensa?",
            ],
          },
          {
            id: "ext-4",
            question:
              "¿Se prepara al país para amenazas modernas (ciberseguridad, crimen transnacional)?",
            reflection:
              "Las amenazas cambiaron: ciberataques, redes criminales, trata, narcotráfico. Reflexionar aquí es preguntar si hay estrategia moderna, coordinación internacional y capacidades técnicas. Defender el país hoy es también proteger infraestructura digital y seguridad económica.",
            followups: [
              "¿Existe una política real de ciberseguridad y crimen transnacional?",
              "¿Hay coordinación regional e internacional con objetivos claros?",
            ],
          },
          {
             id: "ext-5",
            question:
              "¿La política exterior protege a peruanos en el extranjero y fortalece oportunidades para el país?",
            reflection:
              "La política exterior también es protección de peruanos migrantes y construcción de oportunidades: comercio, educación, ciencia, inversiones responsables. Reflexionar aquí es ver si hay visión para abrir puertas y cuidar a quienes viven fuera. El país también se representa en cómo cuida a su gente en el mundo.",
            followups: [
              "¿Cómo se protegerá a peruanos en el extranjero y sus derechos?",
              "¿Qué estrategia hay para oportunidades internacionales sin perder soberanía?",
            ],
          },
        ],
      },
];
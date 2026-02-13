// src/lib/hvNormalize.ts
// Normaliza HV estilo JNE 2026 a una estructura segura (siempre existen los nodos clave)

type AnyObj = Record<string, any>;

function asObj(v: any): AnyObj {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function asArr(v: any): any[] {
  return Array.isArray(v) ? v : [];
}
function bool(v: any): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim().toLowerCase() === "true";
  return !!v;
}

export function normalizeHvJne2026(input: any) {
  const root = asObj(input);

  const meta = asObj(root.meta);
  const dp = asObj(root.datos_personales);

  const exp = asObj(root.experiencia_laboral);
  const fa = asObj(root.formacion_academica);
  const tp = asObj(root.trayectoria_partidaria);
  const sent = asObj(root.sentencias);
  const ibr = asObj(root.ingresos_bienes_rentas);
  const info = asObj(root.informacion_adicional_opcional);

  // Formacion: algunos JSON pueden traer 'detalle' en no-univ en vez de 'registros'
  const noUniv = asObj(fa.estudios_no_universitarios);
  const noUnivRegs = asArr(noUniv.registros).length ? asArr(noUniv.registros) : asArr(noUniv.detalle);

  // Sentencias: algunos pueden traer ambito_civil/ambito_familiar o un nodo distinto
  const ambPen = asObj(sent.ambito_penal);
  const ambCiv = asObj((sent as any).ambito_civil);
  const ambFam = asObj((sent as any).ambito_familiar);

  // Ingresos: algunos pueden traer total_ingresos en otra ruta
  const ingresos = asObj(ibr.ingresos);

  const out: AnyObj = {
    kind: root.kind ?? "HV",
    meta: {
      formato: meta.formato ?? "",
      proceso_electoral: meta.proceso_electoral ?? "",
      anio: meta.anio ?? null,
      fecha_registro: meta.fecha_registro ?? "",
      fuente: {
        tipo: asObj(meta.fuente).tipo ?? "",
        archivo: asObj(meta.fuente).archivo ?? "",
        paginas: asObj(meta.fuente).paginas ?? null,
      },
    },

    datos_personales: {
      dni: dp.dni ?? "",
      sexo: dp.sexo ?? "",
      apellidos: {
        paterno: asObj(dp.apellidos).paterno ?? "",
        materno: asObj(dp.apellidos).materno ?? "",
      },
      nombres: dp.nombres ?? "",
      fecha_nacimiento: dp.fecha_nacimiento ?? "",
      lugar_nacimiento: {
        pais: asObj(dp.lugar_nacimiento).pais ?? "",
        departamento: asObj(dp.lugar_nacimiento).departamento ?? "",
        provincia: asObj(dp.lugar_nacimiento).provincia ?? "",
        distrito: asObj(dp.lugar_nacimiento).distrito ?? "",
      },
      domicilio: {
        pais: asObj(dp.domicilio).pais ?? "",
        departamento: asObj(dp.domicilio).departamento ?? "",
        provincia: asObj(dp.domicilio).provincia ?? "",
        distrito: asObj(dp.domicilio).distrito ?? "",
        direccion: asObj(dp.domicilio).direccion ?? "",
      },
      organizacion_politica: dp.organizacion_politica ?? "",
      cargo_postula: dp.cargo_postula ?? "",
      circunscripcion: dp.circunscripcion ?? "",
      nota_circunscripcion: dp.nota_circunscripcion ?? "",
    },

    experiencia_laboral: {
      tiene_informacion: bool(exp.tiene_informacion),
      registros: asArr(exp.registros),
    },

    formacion_academica: {
      educacion_basica_regular: {
        tiene_informacion: bool(asObj(fa.educacion_basica_regular).tiene_informacion),
        primaria: {
          cuenta: bool(asObj(asObj(fa.educacion_basica_regular).primaria).cuenta),
          concluida: bool(asObj(asObj(fa.educacion_basica_regular).primaria).concluida),
        },
        secundaria: {
          cuenta: bool(asObj(asObj(fa.educacion_basica_regular).secundaria).cuenta),
          concluida: bool(asObj(asObj(fa.educacion_basica_regular).secundaria).concluida),
        },
      },
      estudios_no_universitarios: {
        tiene_informacion: bool(noUniv.tiene_informacion),
        ultimo_estudio_realizado: noUniv.ultimo_estudio_realizado ?? null,
        registros: noUnivRegs,
      },
      estudios_universitarios: {
        tiene_informacion: bool(asObj(fa.estudios_universitarios).tiene_informacion),
        registros: asArr(asObj(fa.estudios_universitarios).registros),
      },
      posgrado: {
        cuenta_posgrado: bool(asObj(fa.posgrado).cuenta_posgrado),
        registros: asArr(asObj(fa.posgrado).registros),
      },
    },

    trayectoria_partidaria: {
      cargos_partidarios: {
        tiene_informacion: bool(asObj(asObj(tp.cargos_partidarios)).tiene_informacion),
        registros: asArr(asObj(tp.cargos_partidarios).registros),
      },
      cargos_eleccion_popular: {
        tiene_informacion: bool(asObj(tp.cargos_eleccion_popular).tiene_informacion),
        registros: asArr(asObj(tp.cargos_eleccion_popular).registros),
      },
      renuncias: {
        tiene_informacion: bool(asObj(tp.renuncias).tiene_informacion),
        registros: asArr(asObj(tp.renuncias).registros),
      },
    },

    sentencias: {
      ambito_penal: {
        tiene_informacion: bool(ambPen.tiene_informacion),
        registros: asArr(ambPen.registros),
      },
      ambito_civil: {
        tiene_informacion: bool(ambCiv.tiene_informacion),
        registros: asArr(ambCiv.registros),
      },
      ambito_familiar: {
        tiene_informacion: bool(ambFam.tiene_informacion),
        registros: asArr(ambFam.registros),
      },
      obligaciones_familiares_contractuales_laborales_violencia: {
        tiene_informacion: bool(asObj(sent.obligaciones_familiares_contractuales_laborales_violencia).tiene_informacion),
        registros: asArr(asObj(sent.obligaciones_familiares_contractuales_laborales_violencia).registros),
      },
    },

    ingresos_bienes_rentas: {
      ingresos: {
        tiene_informacion: bool(ingresos.tiene_informacion),
        anio_declarado: ingresos.anio_declarado ?? null,
        total_ingresos: ingresos.total_ingresos ?? ingresos.total ?? null,
        nota: ingresos.nota ?? "",
        remuneracion_bruta_anual_quinta: asObj(ingresos.remuneracion_bruta_anual_quinta),
        renta_bruta_anual_cuarta_ejercicio_individual: asObj(ingresos.renta_bruta_anual_cuarta_ejercicio_individual),
        otros_ingresos_anuales: asObj(ingresos.otros_ingresos_anuales),
      },
      bienes_inmuebles: {
        tiene_informacion: bool(asObj(ibr.bienes_inmuebles).tiene_informacion),
        registros: asArr(asObj(ibr.bienes_inmuebles).registros),
      },
      bienes_muebles: {
        tiene_informacion: bool(asObj(ibr.bienes_muebles).tiene_informacion),
        vehiculos: asArr(asObj(ibr.bienes_muebles).vehiculos),
        total_bienes_muebles: asObj(ibr.bienes_muebles).total_bienes_muebles ?? null,
      },
      acciones_y_participaciones: {
        tiene_informacion: bool(asObj(ibr.acciones_y_participaciones).tiene_informacion),
        registros: asArr(asObj(ibr.acciones_y_participaciones).registros),
      },
    },

    informacion_adicional_opcional: {
      tiene_informacion: bool(info.tiene_informacion),
      texto: info.texto ?? null,
    },
  };

  return out;
}

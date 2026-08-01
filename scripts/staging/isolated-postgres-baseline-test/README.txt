Herramienta para preparar una futura prueba local aislada de la baseline.

Finalidad

Este directorio contiene una herramienta revisable para planificar una restauracion local aislada de la baseline candidata en PostgreSQL 17. La version actual no autoriza ejecutar la baseline, crear clusters, crear bases ni destruir archivos.

Alcance aprobado ahora

Solo la accion Plan esta preparada para ejecutarse en esta fase. Ninguna accion distinta de Plan esta aprobada todavia.

ready_for_create no equivale a autorizacion humana. Solo indica que las herramientas, el puerto, la ruta, los nombres, la baseline, el paquete PostgreSQL completo y el preflight local pasan controles locales de preparacion.

Apply permanece bloqueado aunque la estrategia local de compatibilidad este completa.

Acciones

Plan: solo lectura. Valida herramientas, puerto, nombres, DataRoot futuro, baseline candidata y dependencias tecnicas.

Create: bloqueada en esta version. En una fase futura debera exigir confirmacion exacta y crear un cluster local temporal.

Apply: bloqueada en esta version. En una fase futura debera exigir confirmacion exacta, preflight local aprobado, base vacia y autorizacion humana explicita.

Verify: bloqueada en esta version. En una fase futura debera validar estado restaurado mediante consultas controladas.

Destroy: bloqueada en esta version. Destroy siempre es accion separada y nunca se ejecuta desde FullTest ni desde finally.

FullTest: bloqueada en esta version. FullTest no destruye; en una fase futura debera conservar el cluster para revision y exigir Destroy por separado.

Ruta y puerto

El DataRoot futuro debe resolverse fuera del repositorio, bajo:

LOCALAPPDATA\VotoClaro\isolated-postgres-baseline-test\<ClusterName>

El padre canonico debe ser exactamente esa carpeta y la hoja debe ser exactamente ClusterName.

Puerto predeterminado: 55432.

Host operativo unico: 127.0.0.1.

Nombres permitidos

ClusterName debe comenzar con vc_staging_baseline_test_.

DatabaseName debe comenzar con vc_staging_baseline_test_.

El usuario administrador local futuro queda definido como vc_isolated_admin.

No se deben usar postgres, service_role, anon, authenticated ni el usuario de Windows como administrador de la prueba.

Paquete PostgreSQL local

El paquete PostgreSQL completo esperado se resuelve dinamicamente bajo:

LOCALAPPDATA\VotoClaro\PostgreSQL\17.10-complete

La herramienta exige binarios, share\postgres.bki, share\extension\pgcrypto.control y lib\pgcrypto.dll. Una instalacion parcial debe ser rechazada aunque exista postgres.exe.

Dependencias tecnicas detectadas

Roles: anon, authenticated, postgres, service_role.

Schemas externos: auth, extensions, storage.

Objeto Auth: auth.users.

Objeto Storage: storage.objects.

Funcion externa: extensions.gen_random_uuid.

Estrategia local candidata

La compatibilidad local se prepara mediante un preflight temporal exclusivo del cluster local. No debe ubicarse en supabase/migrations, no debe modificar la baseline, no debe crear datos y no debe reutilizarse en produccion.

Las estrategias aplicadas son PRECREATE_ROLE_LOCAL, PRECREATE_EMPTY_SCHEMA_LOCAL, CREATE_MINIMAL_STUB_LOCAL e INSTALL_EXTENSION_LOCAL.

pgcrypto esta disponible en el paquete PostgreSQL completo bajo LOCALAPPDATA. La dependencia extensions.gen_random_uuid se resuelve mediante CREATE EXTENSION pgcrypto WITH SCHEMA extensions en el preflight candidato, sin wrapper manual y sin IF NOT EXISTS.

unresolved_dependency_count=0 indica que la estrategia tecnica candidata esta completa; no autoriza Create ni Apply.

GRANT, REVOKE y ACL

GRANT y REVOKE son conteos del artefacto fuente, no historial recuperable desde catalogos despues de restaurar. PostgreSQL conserva el estado ACL final, no el numero de sentencias ejecutadas.

La verificacion futura debe separar conteos sintacticos del archivo y verificacion semantica de ACL restauradas.

Controles anti-produccion

No usar Supabase Production.

No usar hosts remotos.

No leer archivos .env.

No leer variables de conexion de produccion.

No usar service_role ni claves anon.

No imprimir secretos, cuerpos SQL, policies ni hashes completos.

Baseline

La baseline candidata sigue sin ser migration activa.

No contiene datos ni seeds.

Permanece fuera de supabase/migrations.

Preflight local de compatibilidad

El preflight local candidato es un archivo SQL separado, revisable y exclusivo para un futuro cluster PostgreSQL local aislado. No es migration, no pertenece a produccion, no pertenece a staging remoto y no debe ejecutarse en esta fase.

Su objetivo es preparar compatibilidad minima para que una restauracion futura de la baseline pueda avanzar en PostgreSQL puro. No crea servicios Supabase reales.

El preflight sigue candidate.

ready_for_execution=false.

ready_for_apply=false.

Compatibilidad minima

Roles simulados: anon, authenticated, postgres y service_role. Se declaran como roles locales NOLOGIN sin privilegios administrativos.

Schemas simulados: auth, storage y extensions.

Tablas stub vacias:

auth.users: solo incluye la columna id, porque la baseline la referencia como clave externa.

storage.objects: tabla vacia por construccion, porque la baseline referencia la relacion pero no requiere columnas para parsear el artefacto.

Limitaciones

Auth no funcional.

Storage no funcional.

Realtime no funcional.

cron no funcional.

PostgreSQL puro todavia no valida Auth, Storage, Realtime o cron funcionales.

El preflight y la baseline siguen sin autorizacion de ejecucion.

Apply continua bloqueado.

La siguiente fase debe ser revision semantica del preflight local candidato antes de cualquier Create o Apply.

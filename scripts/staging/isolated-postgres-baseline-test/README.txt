Herramienta para preparar una futura prueba local aislada de la baseline.

Finalidad

Este directorio contiene una herramienta revisable para planificar una restauracion local aislada de la baseline candidata en PostgreSQL 17. La version actual no autoriza ejecutar la baseline, crear clusters, crear bases ni destruir archivos.

Alcance aprobado ahora

Solo la accion Plan esta preparada para ejecutarse en esta fase. Ninguna accion distinta de Plan esta aprobada todavia.

ready_for_create no equivale a autorizacion humana. Solo indica que las herramientas, el puerto, la ruta, los nombres y la baseline pasan controles locales de preparacion.

Apply permanece bloqueado por dependencias hasta que exista una estrategia local aprobada.

Acciones

Plan: solo lectura. Valida herramientas, puerto, nombres, DataRoot futuro, baseline candidata y dependencias tecnicas.

Create: bloqueada en esta version. En una fase futura debera exigir confirmacion exacta y crear un cluster local temporal.

Apply: bloqueada en esta version. En una fase futura debera exigir confirmacion exacta, preflight local aprobado y base vacia.

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

Dependencias tecnicas detectadas

Roles: anon, authenticated, postgres, service_role.

Schemas externos: auth, extensions, storage.

Objeto Auth: auth.users.

Objeto Storage: storage.objects.

Funcion externa: extensions.gen_random_uuid.

Estrategia pendiente

La compatibilidad local debe prepararse en una fase futura mediante un preflight temporal exclusivo del cluster local. No debe ubicarse en supabase/migrations, no debe modificar la baseline, no debe crear datos y no debe reutilizarse en produccion.

Las estrategias posibles son PRECREATE_ROLE_LOCAL, PRECREATE_EMPTY_SCHEMA_LOCAL, CREATE_MINIMAL_STUB_LOCAL y REQUIRES_MANUAL_REVIEW. No se deben implementar stubs automaticamente sin aprobacion explicita.

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

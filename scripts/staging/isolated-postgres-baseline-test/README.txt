Herramienta para preparar una futura prueba local aislada de la baseline.

Finalidad

Este directorio contiene una herramienta revisable para planificar una restauracion local aislada de la baseline candidata en PostgreSQL 17. La version actual no autoriza ejecutar la baseline, crear clusters, crear bases ni destruir archivos.

Alcance aprobado ahora

La accion Create esta implementada en el codigo para una futura ejecucion local aislada, pero no esta aprobada para ejecutarse en esta fase.

Create requiere doble autorizacion exacta: un switch explicito y un token literal revisado en el codigo. No se documenta aqui un comando ejecutable de Create para evitar ejecucion accidental.

ready_for_create no equivale a autorizacion humana. Solo indica que las herramientas, el puerto, la ruta, los nombres, la baseline, el paquete PostgreSQL completo y el preflight local pasan controles locales de preparacion.

Apply permanece bloqueado aunque la estrategia local de compatibilidad este completa.

Controles reforzados de Create

La futura ejecucion de Create valida descendencia Git real con merge-base --is-ancestor contra el commit base revisado. No acepta hashes genericos por regex.

El runner de procesos drena stdout y stderr de forma concurrente antes de esperar la salida final, limita los tails conservados y evita deadlocks por buffers llenos. Esta estrategia se documenta como drenaje concurrente de ambos streams.

El quoting de Windows conserva espacios, comillas, backslashes finales, Unicode y representa el argumento vacio como "".

pg_hba.conf permite unicamente IPv4 loopback con SCRAM-SHA-256 y rechaza IPv4 general e IPv6 general con CIDR canonico ::/0.

La ACL diferenciada usa herencia solo para directorios. Los archivos sensibles y de estado usan herencia NONE.

cluster-state.json conserva created_utc estable durante todas las transiciones y actualiza updated_utc en cada cambio.

Create exige concordancia marker/state: cluster_id, instancia, host, puerto y metadatos no sensibles deben coincidir antes de continuar y antes de reportar exito.

La contrasena en texto existe como System.String durante el intervalo minimo necesario; System.String no puede borrarse de memoria de forma garantizada en PowerShell 5.1. El flujo no la imprime, no la incluye en excepciones, state, marker ni logs, y reduce la referencia con $null en finally.

Invoke-GitCommand aplica realmente el WorkingDirectory canonico del repositorio mediante el runner seguro; no cambia el directorio global y no ignora la ruta recibida.

El runner distingue explicitamente fallos de drenaje de salida con process_output_drain_failed. Si stdout o stderr no completan dentro del limite, ese codigo prevalece sobre un timeout generico.

Si pg_ctl start falla o entra en timeout, Create debe clasificar el estado del servidor antes de fallar: valida postmaster.pid, DataRoot, PID, puerto, ejecutable postgres.exe del paquete completo y listener local cuando corresponda.

La detencion de recuperacion solo puede usar pg_ctl stop verificado con modo fast, espera activa y timeout controlado. Nunca usa Stop-Process, taskkill ni kill por nombre de proceso.

Despues de un pg_ctl stop de recuperacion se comprueba que postmaster.pid desaparecio, que el PID original ya no existe y que el listener 127.0.0.1:55432 esta cerrado.

Si la evidencia del servidor queda ambigua, el flujo falla cerrado como postgres_server_state_unresolved. Si el stop verificado falla, usa postgres_server_cleanup_failed.

NO_SERVER_EVIDENCE solo puede declararse cuando no existen postmaster.pid, listener local, procesos postgres del paquete autorizado ni procesos postgres ambiguos. El inventario usa enumeracion local .NET solo para clasificacion interna y no imprime PID, rutas ni command line.

La resolucion del ejecutable de procesos es compatible con Windows PowerShell 5.1 y usa Process.MainModule.FileName. Process.Path no se utiliza.

Si MainModule.FileName no esta disponible, si hay acceso denegado, si el proceso termino durante la lectura o si la ruta no puede verificarse, la evidencia queda ambigua y falla cerrado.

Ningun proceso se detiene sin un postmaster.pid valido que vincule de forma inequivoca DataRoot, PID, puerto y ejecutable. La identidad temporal del servidor verificado usa PID, ExecutablePath y StartTimeUtc solo en memoria durante la misma recuperacion.

El inventario local de procesos dispone cada objeto Process despues de clasificarlo.

Incidente acl_validation_failed

La primera ejecucion real de Create alcanzo create_directories y fallo con acl_validation_failed antes de crear data, logs, state, secrets, marker, credencial, pwfile, initdb o PostgreSQL.

La causa diagnosticada fue una comparacion fragil entre SID y NTAccount al releer la ACL. La validacion corregida normaliza cada IdentityReference mediante Translate(SecurityIdentifier), no compara nombres de cuenta y falla cerrado si una identidad no puede traducirse.

La validacion de ACL es semantica: revisa el conjunto de ACE sin depender del orden, rechaza identidades adicionales, reglas Deny y reglas heredadas, valida FullControl con mascara bitwise, acepta reglas Allow equivalentes fusionadas o divididas del mismo SID, y exige InheritanceFlags y PropagationFlags esperados.

La recuperacion de reglas para validacion usa explicitamente GetAccessRules con includeExplicit=true, includeInherited=true y targetType SecurityIdentifier. La propiedad Access de la ACL no se usa como fuente operativa ni como fallback.

Las reglas heredadas quedan visibles para la validacion aunque la ACL este protegida. Ninguna regla se filtra antes de detectar herencia, Deny o identidades adicionales, y cualquier fallo al recuperar o enumerar reglas falla cerrado sin asumir una coleccion vacia.

Owner no forma parte de esta correccion minima; el acceso queda gobernado por la DACL restringida. Cualquier validacion futura de Owner requiere una fase separada.

El estado parcial requiere limpieza controlada antes de reintentar Create. No volver a ejecutar Create todavia, no usar Destroy, no cambiar ACL manualmente, no abrir secrets y no borrar carpetas fuera de una fase autorizada.

Despues de cualquier resultado de pg_ctl stop, incluido timeout o exit code distinto de cero, la herramienta revalida durante una espera acotada de 15 segundos el pidfile, la identidad del proceso original y el listener local. Un PID reutilizado no se trata como el mismo proceso.

El JSON de state se inspecciona como texto crudo antes de ConvertFrom-Json. Se rechazan claves duplicadas, arrays, objetos anidados, campos extra, tipos incorrectos y contenido adicional fuera del objeto plano aprobado.

cluster-state.json usa schema estricto con allowlist exacta. Solo admite campos no sensibles, incluido server_state y flags de cleanup; no admite PID, stdout, stderr, argumentos, token, credencial ni rutas personales.

Acciones

Plan: solo lectura. Valida herramientas, puerto, nombres, DataRoot futuro, baseline candidata y dependencias tecnicas.

Create: implementada pero protegida por doble autorizacion exacta. En una fase futura aprobada podra crear una instancia PostgreSQL local aislada, inicializarla con initdb, configurar loopback y arrancarla con pg_ctl.

CleanupPartialCreate: implementada pero no ejecutada en esta fase. Su proposito exclusivo es una futura limpieza autorizada del estado minimo y vacio dejado por el fallo create_directories.

CleanupPartialCreate exige doble autorizacion propia, distinta de Create, usa rutas fijas bajo LOCALAPPDATA, no acepta rutas suministradas por usuario y no imprime el token completo.

CleanupPartialCreate solo puede eliminar una InstanceRoot completamente vacia y luego IsolatedRoot si queda vacia. No permite borrado recursivo, comodines, Remove-Item, cambios de ACL, takeown, icacls, procesos, SQL, Supabase ni modificaciones del paquete PostgreSQL.

CleanupPartialCreate no ejecuta Create despues de limpiar. Cualquier reintento de Create requiere una fase posterior de diagnostico, auditoria y autorizacion separadas.

Incidente cleanup_not_authorized

Dos intentos autorizados de CleanupPartialCreate fallaron antes de cualquier efecto con cleanup_not_authorized.

La causa fue una colision entre parametros de entrada y constantes internas de autorizacion. Los parametros CreateApprovalToken y CleanupApprovalToken vivian en scope script y las constantes internas homonimas los sobrescribian despues del param().

Las constantes internas fueron renombradas a ExpectedCreateApprovalToken y ExpectedCleanupApprovalToken. Los parametros de entrada se preservan y la autorizacion usa funciones puras con parametros explicitos.

Create y CleanupPartialCreate comparan tokens con StringComparison.Ordinal. El token Create y el token Cleanup permanecen separados: Create rechaza cualquier switch o token de Cleanup, y Cleanup rechaza cualquier switch o token de Create.

No volver a ejecutar CleanupPartialCreate hasta auditar y versionar esta correccion. El estado parcial queda intacto. No se ejecuta SQL, no se accede a Supabase y Destroy permanece bloqueada.

Incidente cleanup_preflight / cleanup_failed

Despues de versionar la autorizacion, una ejecucion autorizada de CleanupPartialCreate avanzo hasta cleanup_preflight y fallo con cleanup_failed. El estado parcial conocido quedo intacto: IsolatedRoot e InstanceRoot siguieron presentes y no se observo eliminacion parcial.

La causa exacta no era identificable porque el catch generico ocultaba la excepcion real, el substage preciso y el tipo seguro de fallo.

CleanupPartialCreate ahora usa substages cerrados para layout, ambiente, Git, rutas, atributos, estado exacto, firma inicial, actividad, revalidacion, borrado de instancia, borrado de raiz y postcheck.

Los reason de cleanup son codigos cerrados. Las excepciones no seguras se clasifican mediante una allowlist de exception_type y nunca imprimen mensajes, rutas, SID, usuario, secretos, stack trace ni objetos completos.

Directory.Delete de InstanceRoot solo puede ejecutarse con stage cleanup_delete_instance. Directory.Delete de IsolatedRoot solo puede ejecutarse con stage cleanup_delete_root. Ningun borrado ocurre durante substages de preflight o revalidacion.

No volver a intentar CleanupPartialCreate hasta auditar y versionar esta instrumentacion. No se ejecuta SQL, no se accede a Supabase y Destroy permanece bloqueada.


Incidente cleanup_exact_state / collection contract

Una ejecucion autorizada de CleanupPartialCreate avanzo hasta cleanup_exact_state y fallo con cleanup_enumeration_failed y UnknownException. Una sonda local de solo lectura reprodujo las operaciones esperadas y paso completamente: raices presentes, atributos permitidos, rutas tecnicas ausentes, InstanceRoot vacia, IsolatedRoot con una entrada y comparacion de paths correcta.

La causa raiz fue el contrato inestable de colecciones devuelto por una funcion PowerShell: cero entradas podia llegar al caller como null, una entrada como String escalar y multiples entradas como array. Con StrictMode, Count sobre un String escalar falla antes de la firma TOCTOU o del primer Directory.Delete.

Get-CleanupDirectoryEntries ahora devuelve un objeto contenedor unico con Entries tipado como string[]. Los callers consumen Entries explicitamente y la firma TOCTOU usa el mismo contrato. El clasificador reconoce PropertyNotFoundException y wrappers PowerShell relevantes con desempaquetado seguro limitado.

No volver a intentar CleanupPartialCreate hasta auditar y versionar esta correccion. El estado parcial queda intacto. No se ejecuta SQL, no se accede a Supabase y Destroy permanece bloqueada.

Incidente cleanup_delete_root / caller residual

La auditoria posterior detecto que el bloque cleanup_delete_root todavia consumia directamente el contenedor devuelto por Get-CleanupDirectoryEntries y evaluaba Count sobre el contenedor, no sobre Entries. Ese patron podia bloquear el segundo borrado aunque el directorio padre quedara vacio despues de borrar InstanceRoot.

cleanup_delete_root ahora valida el contenedor, consume Entries con cast explicito a string[] y evalua Count solo sobre ese arreglo. Todos los callers inventariados usan Entries y el validador rechaza Count o indexacion directa sobre el contenedor, incluido el caso posterior al primer Directory.Delete.

El contenedor queda definido como PSCustomObject literal con Entries tipado como string[]. No se usa clase personalizada para este contrato. Los SelfTests cubren padre vacio, padre no vacio, cero, una y multiples entradas, ademas del flujo simbolico entre ambos borrados. CleanupPartialCreate sigue suspendido, el estado parcial queda intacto, no se ejecuta SQL, no se accede a Supabase y Destroy permanece bloqueada.

Incidente cleanup_validate_parent_empty / reason de padre

La auditoria posterior detecto que cleanup_delete_root empezaba antes de validar que IsolatedRoot estuviera vacia despues de borrar InstanceRoot, y que cleanup_parent_not_empty no estaba preservado de forma coherente en el clasificador seguro. Eso podia clasificar un padre no vacio como fallo de borrado de raiz.

La validacion del padre ahora usa el substage cerrado cleanup_validate_parent_empty. Ese substage cubre enumeracion, guard del contenedor, cast a string[] y Count del padre. cleanup_parent_not_empty queda preservado como reason seguro sin exception_type cuando el padre no esta vacio.

cleanup_delete_root queda reservado exclusivamente para el segundo Directory.Delete y se activa solo despues de confirmar Count=0. El validador fue reforzado para detectar stages adelantados, reasons huerfanos y allowlists incompletas. CleanupPartialCreate sigue suspendido, el estado parcial queda intacto, no se ejecuta SQL, no se accede a Supabase y Destroy permanece bloqueada.
Apply: bloqueada en esta version. En una fase futura debera exigir confirmacion exacta, preflight local aprobado, base vacia y autorizacion humana explicita.

Verify: bloqueada en esta version. En una fase futura debera validar estado restaurado mediante consultas controladas.

Destroy: bloqueada en esta version. Destroy siempre es accion separada y nunca se ejecuta desde FullTest ni desde finally.

FullTest: bloqueada en esta version. FullTest no destruye; en una fase futura debera conservar el cluster para revision y exigir Destroy por separado.

Ruta y puerto

La instancia futura debe resolverse fuera del repositorio, bajo:

LOCALAPPDATA\VotoClaro\PostgreSQL\isolated-baseline-test\pg17-port55432

Subrutas fijas:

data: directorio del cluster.

logs: log local del servidor PostgreSQL.

state: marker y estado JSON no sensible.

secrets: credencial DPAPI y pwfile temporal durante initdb.

Puerto fijo: 55432.

Host operativo unico: 127.0.0.1.

Nombres permitidos

ClusterName debe comenzar con vc_staging_baseline_test_.

DatabaseName debe comenzar con vc_staging_baseline_test_.

El usuario administrador local futuro queda definido como vc_isolated_admin.

No se deben usar postgres, service_role, anon, authenticated ni el usuario de Windows como administrador de la prueba.

Create y seguridad local

Create usa exclusivamente LOCALAPPDATA y no permite rutas relativas, UNC, Program Files, Windows, el repositorio ni raices protegidas.

Create usa 127.0.0.1:55432 y SCRAM-SHA-256. No usa localhost, 0.0.0.0, IPv6, puerto 5432 ni otros puertos.

La contrasena administrativa se genera aleatoriamente con RandomNumberGenerator durante una ejecucion futura autorizada. No existe contrasena fija.

La credencial administrativa se protege con DPAPI del usuario actual mediante ConvertFrom-SecureString sin clave explicita y se guarda bajo secrets. No copiar, abrir ni compartir archivos de secrets.

El pwfile temporal para initdb vive bajo secrets, recibe ACL restrictiva y debe eliminarse en finally. No debe persistir despues de initdb.

Create no crea servicio Windows, no modifica Firewall, no usa sc.exe, no usa netsh, no usa Docker y no se conecta a Supabase.

Create no ejecuta SQL, no ejecuta el preflight, no ejecuta la baseline, no usa psql, no usa createdb y no usa dropdb.

Una instancia parcial no se borra automaticamente. Cualquier limpieza de cluster debe quedar para Destroy futuro autorizado.

La ejecucion real de Create requiere revision y autorizacion de ChatGPT.

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
Incidente cleanup_revalidate_activity_after_instance_delete / actividad entre borrados

La auditoria final detecto que Assert-CleanupNoPostgresActivity seguia ejecutandose despues de confirmar que IsolatedRoot estaba vacia y antes de cleanup_delete_root. Eso mezclaba una comprobacion de actividad PostgreSQL dentro del contexto semantico de cleanup_validate_parent_empty.

La revalidacion de actividad se conserva y ahora usa el stage cerrado cleanup_revalidate_activity_after_instance_delete despues de confirmar que InstanceRoot ya no existe y antes de la validacion final del padre. cleanup_validate_parent_empty queda reservado solo para enumerar el padre, validar el contenedor, castear Entries a string[] y evaluar Count.

cleanup_delete_root se activa inmediatamente antes del segundo Directory.Delete. Los fallos de actividad se mantienen separados de los fallos de enumeracion del padre y no se clasifican como cleanup_delete_root_failed. CleanupPartialCreate sigue suspendido; no se ejecuta SQL, no se accede a Supabase y Destroy permanece bloqueada.
Incidente state_write_failed / escritura de estado Create

La investigacion de B-SEC-23F confirmo que state_write_failed agrupaba demasiados subpasos: validacion de entrada, created_utc, payload, JSON, temporal, move inicial, replace existente, ACL, readback de schema y concordancia marker/state. Eso impedia distinguir el primer punto de fallo.

Write-ClusterState ahora usa stages cerrados de escritura de estado y conserva la escritura atomica. La primera escritura sin StatePath usa move inicial; las transiciones posteriores usan replace existente. Despues de escribir se valida ACL semantica, schema estricto y ausencia de temporales residuales.

Invoke-Create conserva el error primario. Si el registro posterior de state=failed tambien falla, la razon secundaria queda separada como diagnostico seguro y no reemplaza silenciosamente la causa original. Create sigue bloqueado antes de credential e initdb si el estado inicial no queda escrito, protegido y validado.

La correccion no debilita ACL, no ejecuta SQL, no accede a Supabase y no cambia el estado parcial real durante las validaciones locales.
B-SEC-23G CleanupFailedCreate

CleanupFailedCreate es una accion separada de CleanupPartialCreate. CleanupPartialCreate conserva su contrato anterior: solo acepta una InstanceRoot completamente vacia y no se flexibiliza para estados fallidos con contenido conocido.

CleanupFailedCreate existe solo para el estado parcial exacto producido por Create cuando falla en create_directories. Requiere autorizacion doble independiente mediante ConfirmCleanupFailedCreate y CleanupFailedCreateApprovalToken. El token esperado interno usa ExpectedCleanupFailedCreateApprovalToken y es distinto de los tokens Create y CleanupPartialCreate. La comparacion es Ordinal, con parametros explicitos y sin sobrescribir entradas.

El estado aceptado es exclusivamente IsolatedRoot con InstanceRoot pg17-port55432; dentro de InstanceRoot deben existir solo data, logs, secrets y state. data, logs y secrets deben estar vacios. state debe contener solo cluster-state.json y VC_ISOLATED_BASELINE_TEST.marker. No se aceptan temporales cluster-state.*.tmp, PG_VERSION, postmaster.pid, configuraciones PostgreSQL, credencial DPAPI, pwfile, server log, contenido de base de datos ni entradas adicionales.

Antes de borrar se valida marker y JSON: artifact_type y schema_version esperados, state=failed, stage=create_directories, host 127.0.0.1, port 55432, instance_name pg17-port55432, cluster_id valido y coincidente, fechas validas, server_state=not_started y banderas initdb_completed, configuration_completed, server_started, credential_protected, plaintext_password_file_present, server_cleanup_attempted y server_cleanup_completed en false.

Tambien se valida ACL de solo lectura: reglas protegidas, SID actual, FullControl semantico, sin Deny, sin heredadas y sin identidades inesperadas. Si la validacion no puede leer o traducir una regla, falla cerrado.

El orden de borrado es explicito y no recursivo: File.Delete de cluster-state.json, File.Delete del marker, Directory.Delete(state,false), Directory.Delete(data,false), Directory.Delete(logs,false), Directory.Delete(secrets,false), Directory.Delete(InstanceRoot,false) y Directory.Delete(IsolatedRoot,false). No usa Remove-Item, comodines, takeown, icacls ni Directory.Delete(path,true).

La accion revalida actividad PostgreSQL antes de cualquier borrado, antes de borrar InstanceRoot, antes de borrar IsolatedRoot y al final. Exige cero procesos postgres autorizados o ambiguos, cero servicios PostgreSQL en ejecucion, puerto 127.0.0.1:55432 cerrado y ausencia de postmaster.pid. Usa firma TOCTOU antes de entrar a los grupos destructivos.

CleanupFailedCreate no encadena Create, no ejecuta SQL, no usa Supabase, no toca produccion y no modifica el paquete PostgreSQL. Debe permanecer sin ejecutar hasta una aprobacion humana separada.
B-SEC-23G1 ACL de IsolatedRoot

El intento real de CleanupFailedCreate mostro que IsolatedRoot conservaba ACL heredada porque Create la creaba implicitamente al crear InstanceRoot y solo aplicaba Set-RestrictedAcl desde InstanceRoot hacia abajo. El estado parcial real no se borro ni se modifico durante esta correccion.

CleanupFailedCreate separa ahora dos contratos ACL. IsolatedRoot usa un contrato seguro especial compatible con el estado heredado: ruta canonica exacta, directorio existente, sin reparse, sin Hidden/System, propietario del usuario actual por SID, FullControl efectivo del usuario actual mediante Allow, sin Deny, sin reglas explicitas inesperadas cuando la ACL no esta protegida, lectura y enumeracion completas, y contenido exacto limitado a InstanceRoot. Esta validacion no modifica ACL.

Los objetos internos conservan el contrato estricto: InstanceRoot, data, logs, secrets, state, marker y cluster-state.json deben tener ACL protegida, SID actual, FullControl, sin herencia, sin Deny y sin identidad inesperada.

Para ejecuciones futuras, Create endurece IsolatedRoot explicitamente: crea IsolatedRoot si falta, aplica Set-RestrictedAcl sobre IsolatedRoot y solo despues continua con InstanceRoot y los directorios internos. Si el readback semantico falla, Create no avanza.

La correccion no autoriza por si sola CleanupFailedCreate. La accion sigue requiriendo aprobacion humana separada, no ejecuta SQL, no usa Supabase, no toca produccion y mantiene borrado explicito no recursivo.

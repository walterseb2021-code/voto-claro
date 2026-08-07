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

B-SEC-23H created_utc y CleanupFailedCreate

El fallo real state_get_created_utc_failed confirmo una carrera temporal interna: la escritura de estado tomaba un reloj para updated_utc y Get-StableCreatedUtc tomaba otro reloj cuando aun no existia StatePath. En la primera escritura, created_utc podia quedar unos milisegundos en el futuro respecto del reloj de la misma operacion y el flujo fallaba cerrado antes de iniciar PostgreSQL.

Write-ClusterState usa ahora un unico reloj autoritativo por escritura. Ese valor se pasa como fallback explicito a Get-StableCreatedUtc. Si StatePath no existe, created_utc queda exactamente igual al fallback de la misma operacion. Si StatePath existe, se preserva el created_utc previo tras validar schema, identidad de instancia y fecha UTC exacta. La validacion de fechas sigue fallando cerrado si created_utc esta en el futuro; no se agrego tolerancia, Sleep, CreationTimeUtc ni reloj local.

CleanupFailedCreate acepta ahora de forma segura el estado fallido stage=state_get_created_utc con last_error_code=state_get_created_utc_failed, siempre que el schema estricto, marker/state, tamanos acotados, directorios exactos, ACL, ausencia de actividad PostgreSQL y firma TOCTOU sigan siendo validos. La comprobacion de longitud exacta del JSON fue reemplazada por limites cerrados para cubrir el JSON real actual sin aceptar contenido arbitrario.

CleanupFailedCreate, CleanupPartialCreate, Create, Destroy, PostgreSQL, SQL, Supabase y operaciones Git de escritura permanecen sin ejecutar durante esta correccion.
B-SEC-23I reemplazo de cluster-state.json en Windows

El fallo real posterior a B-SEC-23H demostro que la primera escritura de cluster-state.json funcionaba, pero la actualizacion despues de initdb podia fallar en File.Replace cuando se usaba sin respaldo explicito. El estado principal quedaba en initializing/initdb y el temporal residual contenia el avance initialized/initialized con el mismo cluster_id y created_utc preservado.

La estrategia elegida conserva File.Replace, pero ahora usa un respaldo GUID explicito dentro de StateRoot y endurece el temporal antes del reemplazo. El temporal se escribe primero, se valida como JSON estricto, se protege con ACL estricta de archivo, se valida por SID y bitmask, y luego se reemplaza el estado usando el respaldo controlado. El archivo final vuelve a validarse con ACL estricta, created_utc preservado, updated_utc nuevo, schema esperado y ausencia de temporales o respaldos residuales.

Los nombres auxiliares permitidos son exclusivamente cluster-state.<guid>.tmp y cluster-state.<guid>.bak dentro de StateRoot. Cualquier temporal o respaldo residual se trata como estado ambiguo y bloquea nuevos writes. El respaldo exitoso se elimina de forma explicita por ruta exacta; no se usa Remove-Item, borrado recursivo ni rutas suministradas por usuario.

La clasificacion de fallo de reemplazo mantiene reason=state_replace_existing_failed y agrega solo telemetria sanitizada: tipo de excepcion allowlisted, HResult hexadecimal, categoria estable, banderas de IOException, UnauthorizedAccessException y PlatformNotSupportedException, existencia de origen/destino/respaldo y apertura exclusiva posterior. No se imprimen mensajes del sistema ni rutas privadas.

Validate-IsolatedBaselineTestTool ejecuta una prueba real de filesystem bajo Path.GetTempPath: crea una carpeta desechable propia, aplica ACL equivalente, realiza dos reemplazos con el mismo protocolo, verifica contenido, created_utc, updated_utc, ACL final, ausencia de temporales/respaldo y retira exclusivamente la carpeta creada.

Plan reconoce ahora de solo lectura el estado parcial avanzado con DataRoot inicializado, cluster-state.json atrasado y exactamente un temporal residual valido. Cuando esa forma exacta se cumple, emite cleanup_partial_create_required=true y bloquea ready_for_create. CleanupPartialCreate reconoce esa forma exacta para diagnostico y autorizacion futura separada. CleanupFailedCreate no se amplio para borrar DataRoot inicializado.

No repetir Create mientras exista este estado parcial. Cualquier limpieza futura requiere revision posterior por ChatGPT y autorizacion humana independiente. Esta fase no ejecuta Create, CleanupPartialCreate, CleanupFailedCreate, PostgreSQL, SQL, Supabase, produccion ni Git de escritura.
B-SEC-23J CleanupPartialCreate con DataRoot inicializado

El fallo previo confirmo una contradiccion operativa: Plan reconocia un estado parcial avanzado con DataRoot inicializado, cluster-state.json atrasado y un temporal residual valido, pero CleanupPartialCreate conservaba un borrado pensado para InstanceRoot vacia. Directory.Delete(InstanceRoot,false) no podia borrar de forma controlada una instancia initdb no vacia.

CleanupPartialCreate usa ahora un manifiesto cerrado para ese estado exacto. Antes de borrar valida rutas fijas, ausencia de reparse points, estado marker/state, temporal residual unico, SecretRoot con solo la credencial permitida, LogRoot vacio, PG_VERSION=17, ausencia de postmaster.pid y pg_tblspc vacio. El manifiesto enumera archivos y directorios dentro de la instancia autorizada, conserva firma determinista y crea un journal GUID en StateRoot con telemetria segura.

El borrado es bottom-up y no generico: primero File.Delete sobre archivos manifestados, despues Directory.Delete(path,false) sobre directorios ordenados por profundidad descendente. No usa Remove-Item, comodines, Directory.Delete(path,true), takeown, icacls ni ACL forcing. StateRoot se conserva hasta despues de borrar data, logs y secrets; el journal se retira antes de borrar StateRoot. La recuperacion es determinista porque cualquier cambio frente al manifiesto invalida la limpieza antes del primer borrado.

CleanupPartialCreate sigue siendo una accion humana separada y suspendida. No encadena Create, no ejecuta SQL, no accede a Supabase, no toca produccion y no modifica el paquete PostgreSQL. CleanupFailedCreate conserva su alcance anterior para fallos tempranos sin DataRoot inicializado.

Validate-IsolatedBaselineTestTool ejecuta ahora un SelfTest real y desechable bajo Path.GetTempPath. Ese test crea una estructura parcial equivalente con DataRoot no vacio, usa el mismo helper de manifiesto que CleanupPartialCreate, verifica que los siblings fuera de alcance queden intactos, prueba un rechazo fail-closed por contenido inesperado y elimina solo el arbol temporal creado para la prueba.

No repetir Create mientras exista el estado parcial real. La siguiente accion operativa debe ser revision por ChatGPT y autorizacion humana separada para la limpieza correspondiente.
Revision puntual B-SEC-23J file_added_after

El SelfTest desechable de CleanupPartialCreate cubre ahora explicitamente el caso en que se construye un manifiesto valido y luego aparece un archivo nuevo dentro de una raiz controlada antes de invocar el helper de borrado. El helper usado es el mismo que usa CleanupPartialCreate. La prueba exige rechazo fail-closed por cambio de estado y comprueba que los archivos autorizados, la instancia de prueba, el paquete simulado y el repositorio simulado no sean eliminados. La senal de cobertura es CLEANUP_PARTIAL_FILE_ADDED_AFTER_MANIFEST_SELF_TEST_OK.

B-SEC-23L pg_ctl start y procesos persistentes

pg_ctl start no usa la estrategia general de pipes de Invoke-SafeProcess. Ese runner sigue reservado para procesos cortos: drena stdout/stderr con ReadToEndAsync y ahora su finally solo dispone tareas completadas para no enmascarar process_output_drain_failed.

Para pg_ctl start se usa una estrategia nativa separada. El proceso se lanza con CreateProcessW y stdout/stderr apuntan a archivos controlados dentro de StateRoot mediante handles heredables de archivo, no pipes del proceso llamador. El llamador espera solo a pg_ctl; si postgres queda persistente, no puede retener un pipe que bloquee al PowerShell exterior.

La evidencia de stdout/stderr se lee como cola sanitizada desde esos archivos. Si un hijo persistente retiene temporalmente un archivo, la lectura se tolera sin convertir un pg_ctl start exitoso en fallo; la decision de exito sigue dependiendo de las verificaciones posteriores de postmaster.pid, DataRoot, PID, ejecutable, listener y puerto 127.0.0.1:55432.

No repetir Create despues de un fallo con instancia parcial. La instancia parcial debe revisarse y limpiarse solo mediante una accion autorizada separada. Esta documentacion no autoriza Create, CleanupPartialCreate, CleanupFailedCreate, Destroy, SQL, Supabase ni produccion.

B-SEC-23M CleanupFailedCreate para pg_ctl_start

CleanupFailedCreate conserva el contrato temprano existente y agrega un segundo modo exacto llamado PG_CTL_START_INITIALIZED_RESIDUAL. Este modo solo aplica a un Create fallido en pg_ctl_start cuando initdb ya dejo un cluster PostgreSQL 17 inicializado, el servidor nunca quedo iniciado, PostgreSQL esta detenido, no existe postmaster.pid y el puerto 127.0.0.1:55432 esta cerrado.

El contrato valida rutas fijas bajo LOCALAPPDATA, InstanceRoot dentro de IsolatedRoot y el paquete PostgreSQL 17.10 fuera del alcance de limpieza. Exige IsolatedRoot con una sola entrada InstanceRoot; InstanceRoot con data, logs, secrets y state; logs con postgresql-server.log; secrets con solo la credencial DPAPI; state con cluster-state.json y marker concordantes; ausencia de password file en texto plano, temporales residuales, postmaster.pid y reparse points. El JSON mantiene schema estricto, state=failed, stage=pg_ctl_start, last_error_code=unexpected_failure, host 127.0.0.1, port 55432, version 17.10, server_state=not_started e initdb_completed=true con configuration_completed, server_started y server_cleanup en false.

Antes de cualquier borrado autorizado, el modo construye un manifest completo en memoria con rutas relativas, tipo, tamanos y firmas estables. Los archivos se hashean con SHA-256 y las rutas de directorios se firman de forma determinista. El manifest se revalida antes del primer borrado junto con Git, actividad PostgreSQL y estado exacto; cualquier archivo agregado, faltante o modificado bloquea fail-closed.

La secuencia de borrado preparada es explicita: archivos autorizados uno por uno con File.Delete y directorios vacios de abajo hacia arriba con Directory.Delete(path,false). No se permite Remove-Item, borrado recursivo, Directory.Delete(path,true), takeown, icacls ni cambios de ACL. El paquete PostgreSQL, el repositorio y cualquier hermano quedan fuera del scope. IsolatedRoot solo se elimina cuando queda vacia.

Plan reconoce este residuo de solo lectura y emite cleanup_failed_create_required=true, cleanup_failed_create_exact_state_valid=true, cleanup_failed_create_mode=PG_CTL_START_INITIALIZED_RESIDUAL, cleanup_failed_create_manifest_valid=true y ready_for_create=false. Plan no borra, no escribe, no cambia ACL, no abre puertos, no inicia PostgreSQL, no ejecuta SQL y no accede a produccion.

La limpieza real de este modo requiere revision humana separada y autorizacion independiente de CleanupFailedCreate. No se debe reintentar manualmente despues de una salida ambigua. Ante cualquier diferencia de estructura, ACL, manifest, actividad PostgreSQL, paquete o estado, el flujo debe quedar bloqueado y no debe encadenar Create.

B-SEC-23P1 ciclo de vida PostgreSQL aislado

Create sigue siendo una accion de una sola vez para crear la instancia aislada. No debe repetirse cuando ya existe un cluster exacto, aunque el estado diga running y postmaster.pid haya quedado residual despues de una interrupcion de consola.

El inicio persistente de pg_ctl/postgres queda separado del runner general de procesos cortos. La estrategia usa STARTUPINFOEX con PROC_THREAD_ATTRIBUTE_HANDLE_LIST, stdout/stderr en archivos controlados y proceso desacoplado de la consola, de modo que cerrar el terminal no debe apagar PostgreSQL ni bloquear el PowerShell exterior por handles heredados.

Plan clasifica de solo lectura los estados CLEAN_ABSENT, RUNNING_EXACT, STOPPED_CLEAN_EXACT y STALE_RUNNING_AFTER_CONSOLE_INTERRUPT_EXACT. El estado stale solo es aceptado si coinciden estrictamente rutas fijas, marker, state, credencial DPAPI, PG_VERSION 17, host 127.0.0.1, puerto 55432, rol vc_isolated_admin, postmaster.pid residual con PID inexistente, cero procesos, cero listener, cero servicios, pg_isready no disponible, pg_controldata en production, sin password en texto plano, sin reparse points y ACL esperadas.

RecoverStart, tambien disponible como StartExisting, inicia un cluster existente y exacto sin ejecutar initdb, sin recrear directorios, sin cambiar credenciales, sin ejecutar SQL y sin tocar Supabase ni produccion. Requiere autorizacion y token propios, revalida TOCTOU y acepta solo STOPPED_CLEAN_EXACT o STALE_RUNNING_AFTER_CONSOLE_INTERRUPT_EXACT.

Stop apaga un RUNNING_EXACT mediante pg_ctl stop -m fast con autorizacion y token propios. No usa Stop-Process, taskkill, Ctrl+C ni cierre del terminal. Debe verificar cero listener, cero proceso de esa instancia, postmaster.pid ausente y pg_controldata shut down antes de registrar stopped.

No borrar postmaster.pid manualmente. No usar Ctrl+C para apagar el cluster. Apply, Verify, Destroy y FullTest continuan bloqueados mientras no tengan implementacion autorizada. Todas las acciones siguen siendo locales: no SQL, no Supabase, no produccion.

B-SEC-23P1A correccion puntual launcher y plan

La correccion P1A valida dinamicamente el launcher persistente: compila el C# real usado por Invoke-PersistentChildSafeProcess y ejecuta un PowerShell temporal inocuo con argumentos que incluyen espacios, comillas, backslash final y valor vacio. stdin usa un handle controlado a NUL mediante CreateFileW, stdout/stderr quedan en archivos controlados y la lista PROC_THREAD_ATTRIBUTE_HANDLE_LIST contiene solo handles validos.

La estrategia documentada para el proceso iniciador usa STARTUPINFOEX, CREATE_NO_WINDOW y CREATE_NEW_PROCESS_GROUP con stdout/stderr locales. No combina DETACHED_PROCESS con CREATE_NO_WINDOW. Plan refleja que enumera procesos locales y que verifica estado local; create_retry_blocked_until_cleanup queda reservado para residuos que requieren limpieza, mientras create_blocked_existing_cluster cubre clusters exactos existentes.

Create, CleanupPartialCreate y CleanupFailedCreate rechazan switches o tokens de RecoverStart y Stop antes de cualquier efecto. RecoverStart/StartExisting y Stop siguen siendo acciones separadas, con autorizacion propia, y no se ejecutan durante validaciones.

B-SEC-23P1B cierre final

El launcher persistente publica ahora la estrategia STARTUPINFOEX_HANDLE_LIST_NO_WINDOW. El contrato nativo expone ChildPid, WaitResult, ProcessStateUnresolved, TimedOut, ProcessKilled y ProcessExitConfirmed para que WAIT_FAILED, timeout no confirmado y resultados desconocidos fallen cerrado.

Plan separa create_blocked_existing_cluster de create_retry_blocked_until_cleanup y mantiene la clasificacion exacta STALE_RUNNING_AFTER_CONSOLE_INTERRUPT_EXACT para el residuo actual sin modificarlo. La clasificacion valida payload persistido, configuracion administrada, pg_controldata esperado y contratos cerrados de StateRoot, LogRoot y SecretRoot.

RecoverStart persiste una etapa recuperable antes de tocar postmaster.pid stale, persiste otra etapa despues de retirarlo y verifica runtime antes de escribir running. Stop conserva la verificacion fisica antes de escribir stopped y registra estados stale recuperables ante fallo de escritura. Las pruebas P1B usan procesos y carpetas temporales controlados, llaman el runner persistente y funciones reales de validacion/autorizacion, y no ejecutan PostgreSQL real, SQL, Supabase ni produccion.

B-SEC-23P1C correccion real
El SelfTest P1B simulado fue reemplazado por Invoke-P1BRealLifecycleSelfTest. Cada senal se emite despues de asserts sobre procesos temporales, salida stdout/stderr del runner, nieto temporal verificado por PID/ruta/marker, independencia de consola, matriz WAIT fail-closed, payloads exactos y autorizacion cruzada. El validador rechaza el nombre antiguo Invoke-P1BSimulatedLifecycleSelfTest y patrones que solo imprimen senales OK sin usar helpers reales.
El runner persistent-child usa nombres fijos derivados de ToolName dentro del OutputDirectory de la accion y elimina stdout/stderr cuando el proceso directo ya cerro handles. StateRoot ya no acepta archivos persistent-child arbitrarios; Plan debe fallar cerrado ante residuos inesperados.
B-SEC-23P1D correccion puntual final

La prueba P1B real verifica ahora un handle Windows heredable distinto de stdin/stdout/stderr y confirma que el hijo no lo hereda cuando STARTUPINFOEX publica solo la lista autorizada. El mismo SelfTest conserva controles positivos de stdout/stderr, ejecuta el runner real para WAIT_OBJECT_0 y timeout, y usa inyeccion solo en memoria para WAIT_FAILED y terminacion no confirmada dentro del mismo interpretador nativo.

RecoverStart reconcilia RUNTIME_RUNNING_STATE_STALE_EXACT escribiendo running sin invocar pg_ctl start. STOPPED_RUNTIME_STATE_STALE_EXACT y recover_start_failed_no_server se reconcilian primero a stopped y requieren una ejecucion autorizada posterior para iniciar. Stop acepta RUNNING_EXACT y RUNTIME_RUNNING_STATE_STALE_EXACT, siempre mediante pg_ctl stop verificado y sin iniciar PostgreSQL.

La clasificacion de runtime activo exige listener exacto 127.0.0.1:55432 con OwningPid, postmaster verificado por PID/ruta/StartTimeUtc, arbol de procesos obtenido por Toolhelp, cero procesos fuera del arbol, cero OTHER y cero AMBIGUOUS. La firma TOCTOU incluye ACL normalizada de raices y archivos de control, mas rutas y hashes de postgres.exe, pg_ctl.exe, pg_isready.exe y pg_controldata.exe.

Plan separa recover_start_required, recovery_reconciliation_required y start_required, y publica los estados exactos aceptados por RecoverStart y Stop. El validador exige P1B_REAL_SELF_TEST_OK, las ocho senales Recover/Stop por casos separados, listener propietario, arbol de procesos, firma ACL/paquete y rechaza senales agrupadas.
B-SEC-23P1E correccion confirmada

Get-LoopbackTcpListenerOwnerEvidence usa ahora un resultado estructurado con ApiSuccess, ErrorCode, Rows y QuerySucceeded. La conversion del puerto TCP evita el resultado firmado de Int16 y conserva el rango 0..65535. Cualquier fallo de GetExtendedTcpTable, longitud invalida o fila malformada produce fallo cerrado con AmbiguousCount mayor que cero, de modo que stale, stopped y running exactos no aceptan una consulta TCP fallida como ausencia de listener.

El SelfTest P1E abre un TcpListener temporal real en 127.0.0.1 con puerto alto, valida que OwningPid corresponda al proceso propietario, confirma ExactOwner con AllowedPids correcto y rechaza AllowedPids incorrecto y puerto diferente. Tambien inyecta resultados TCP de error API y fila malformada para verificar fail-closed sin tocar PostgreSQL real.

RecoverStart y Stop pasan por Invoke-RecoverStopTransitionEngine, un motor comun con callbacks. Produccion lo usa como preflight compartido de transicion y los SelfTests Recover/Stop ejecutan los ocho casos contra el mismo motor, incluidos fallo de start, fallo de stop, fallo de escritura running, fallo de escritura stopped y doble fallo de escritura recuperable.

La autorizacion superior SelfTest/KeepOnSuccess se concentra en Assert-TopLevelActionGuards y la matriz SelfTest prueba autorizacion propia de Create, CleanupPartialCreate, CleanupFailedCreate, RecoverStart y Stop, switches extranjeros, tokens extranjeros y guards reales. La firma TOCTOU ya no convierte ACL o paquete ilegibles en sentinels estables: lifecycle_acl_unreadable y lifecycle_package_unverified fallan cerrado.

La clasificacion de runtime exige listener propietario con QuerySucceeded, postmaster incluido en TreePids, cero procesos fuera del arbol, cero OTHER y cero AMBIGUOUS, con segunda captura antes de devolver estados activos exactos. recover_start_preparing persiste un origen controlado mediante last_error_code recover_origin_stale o recover_origin_stopped.

B-SEC-23P1F correccion de bloqueadores finales

RecoverStart y Stop ya no usan Invoke-RecoverStopTransitionEngine como ProbeOnly decorativo. Ambas acciones construyen callbacks productivos reales y delegan en el motor compartido la clasificacion inicial, revalidacion TOCTOU, escritura de estado, retiro exacto de postmaster.pid stale, pg_ctl start, resolucion de fallo de arranque, pg_ctl stop y reconciliaciones running/stopped stale. La decision de exito o error se toma desde el resultado estructurado del motor.

El resultado del motor expone InitialState, RevalidatedState, FinalLogicalState, RuntimeState, SafeErrorCode, ReconciliationRequired, StartInvoked, StopInvoked, PidfileRemovalInvoked, PidfileRemovalSucceeded y StateWrites. DestructiveOperationUsed refleja start, stop o retiro real de pidfile. Si RemovePidfile falla, el motor no escribe recover_start_pidfile_removed ni invoca start.

El snapshot de arbol de procesos devuelve QuerySucceeded, ErrorCode, ParentByPid y RowCount. Fallos de CreateToolhelp32Snapshot, Process32FirstW, filas malformadas o duplicadas incompatibles son fail-closed y aumentan evidencia ambigua; no se fabrica TreePids con el postmaster esperado en caso de error.

RUNNING_EXACT y RUNTIME_RUNNING_STATE_STALE_EXACT requieren dos capturas activas completas. La segunda captura vuelve a validar postmaster.pid, PID, ruta ejecutable, StartTimeUtc, listener propietario, inventario de procesos, arbol exacto con postmaster incluido, cero procesos fuera del arbol, cero OTHER, cero AMBIGUOUS, pg_isready, ausencia de servicio PostgreSQL ajeno y pg_controldata IN_PRODUCTION.

recover_start_preparing se clasifica por origen. RECOVER_START_PREPARING_STALE_EXACT exige recover_origin_stale, postmaster.pid residual, runtime detenido y pg_controldata IN_PRODUCTION. RECOVER_START_PREPARING_STOPPED_EXACT exige recover_origin_stopped, postmaster.pid ausente, runtime detenido y pg_controldata SHUT_DOWN. RecoverStart solo retira pidfile para el origen stale y no sobrescribe el origen detenido.

El SelfTest agrega casos negativos del motor para fallo de RemovePidfile, arranque no resuelto, doble fallo de escritura running/stopped y origen stale/stopped interrumpido. Tambien agrega contratos negativos inyectados para snapshot de procesos fallido, fila malformada, proceso autorizado fuera del arbol, OTHER, AMBIGUOUS y postmaster ausente de TreePids. Las senales nuevas son P1F_ENGINE_NEGATIVE_CASES_SELF_TEST_OK y P1F_NEGATIVE_RUNTIME_CONTRACT_SELF_TEST_OK.

B-SEC-23P1G correccion final confirmada

El snapshot de arbol de procesos valida Process32NextW hasta ERROR_NO_MORE_FILES=18. Cualquier terminacion distinta se considera error estructurado y no captura parcial valida. El resultado expone QuerySucceeded, ApiSuccess, ErrorCode, Rows, ParentByPid, ProcessIds y RowCount.

La pertenencia del postmaster al arbol exige que el PID esperado exista en el snapshot y en ProcessEvidence como AUTHORIZED_PACKAGE_PROCESS. Test-ProcessBelongsToPostmasterTree ya no suple la ausencia del PID raiz. El arbol exacto requiere RowCount positivo, todos los PID autorizados presentes en snapshot, cero OutsideTree, cero OTHER y cero AMBIGUOUS.

Los estados activos contradictorios validan primero el payload especifico con Assert-LifecycleStatePayloadExact. recover_start_preparing conserva y valida recover_origin_stale o recover_origin_stopped; recover_start_pidfile_removed solo acepta recover_origin_stale. running y runtime_running_state_stale con runtime fisico detenido y pg_controldata SHUT_DOWN clasifican STOPPED_RUNTIME_STATE_STALE_EXACT para que RecoverStart reconcilie a stopped sin arrancar en esa ejecucion.

El doble fallo real de Stop queda cubierto desde RUNNING_EXACT y RUNTIME_RUNNING_STATE_STALE_EXACT. StopServer se invoca, stopped falla, stopped_runtime_state_stale falla, RuntimeState queda stopped, SafeErrorCode queda stop_state_write_failed, ReconciliationRequired queda true y StateWrites conserva ambas escrituras en orden.

Las pruebas negativas P1G cubren Process32NextW parcial, membresia de postmaster en snapshot, mutaciones de payload contradictorio, reparse mediante helper/inyeccion segura, lifecycle_acl_unreadable, lifecycle_package_unverified y mutacion de hash en archivo temporal controlado. El paquete PostgreSQL real no se modifica.

El motor ya no expone ProbeOnly. Usa allowlist interna por operacion y preserva lifecycle_exact_state_invalid, recover_start_not_allowed y stop_not_allowed sin colapsarlos a errores genericos.
B-SEC-23P1H revision ChatGPT PowerShell

La revision independiente posterior a P1G endurece la validacion exacta de los payloads recover_start_failed_no_server, runtime_running_state_stale y stopped_runtime_state_stale, incluyendo todos los flags de runtime y cleanup. Stop preserva lifecycle_exact_state_invalid y stop_not_allowed devueltos por el motor compartido. El SelfTest de payload cubre todos los estados transitorios y el SelfTest de reparse usa un junction temporal real; ningun archivo del paquete PostgreSQL real es modificado.

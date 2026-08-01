Este directorio contiene una baseline candidata de revision para staging.

La transformacion aplicada es byte-preservante.

Unicamente se eliminaron dos metacomandos psql de linea completa:

1. restrict.
2. unrestrict.

No se normalizaron saltos de linea.

No se agrego BOM.

Cualquier regeneracion debe aprobar una equivalencia byte a byte contra el SQL fuente despues de eliminar solo esas dos lineas autorizadas.

No es una migration activa.

No debe moverse a supabase/migrations sin una fase posterior aprobada.

No debe ejecutarse en produccion.

No debe ejecutarse todavia en staging.

Primero requiere una restauracion aislada y una comparacion estructural.

Las migrations existentes no son reproducibles desde una base vacia.

Debe resolverse la estrategia de linaje antes de usar este artefacto:

1. Definir si esta baseline sera la base nueva para entornos futuros.
2. Definir el tratamiento de las 23 migrations historicas.
3. Conciliar en una fase posterior la tabla supabase_migrations del entorno que corresponda.
4. Prohibir aplicar esta baseline a una base que ya contiene el esquema.

Seeds y datos sinteticos deben ir separados del esquema.

Los componentes fuera de public requieren configuracion separada:

1. Storage.
2. Auth.
3. Realtime.
4. Extensiones.
5. Cron.
6. SMTP.
7. Servicios externos.

Este directorio no debe ser consumido por build ni runtime.

# Roadmap de la operación

Lo que dice el documento de la casa (*ROADMAP Y BASES DE DATOS AGENTE*), contrastado
contra lo que existe hoy en el código.

El documento describe el **bot de botones actual** —el que funciona bien pero solo toma
solicitudes— y anota, en cada flujo, qué se podría hacer mejor. Esas anotaciones son la
parte valiosa: son el diagnóstico de quien lo opera todos los días.

La frase que resume el encargo, textual del documento:

> El problema es que el chatbot no es inteligente, lo único que hace es tomar solicitudes,
> pero no está conectado a bases de datos con los clientes en verdad, y eso lo que hace es
> consumir tiempo de los demás al reenviar la solicitud con una persona para que lo revise
> a mano.

---

## Los nueve flujos

| # | Flujo | Estado |
|---|---|---|
| 1 | Consignar un inmueble | construido |
| 2 | Buscar un inmueble | construido |
| 3 | Pagos / estado de cuenta | construido, falta certificados |
| 4 | Solicitar una reparación | construido |
| 5 | Solicitar un avalúo | construido, sin tarifario |
| 6 | Inquietudes | construido |
| 7 | Propiedad horizontal | **fuera de alcance** por decisión de la casa |
| 8 | PQR | construido |
| 9 | Registro para contratos (matrícula) | construido, sin canal de documentos |

---

### 1 · Buscar un inmueble

**Secuencia del bot actual**

1. Arriendo o venta
2. Código del inmueble (si responde NO, sigue)
3. Vivienda o comercio
4. Tipo de vivienda o comercio (menú)
5. Cuartos · ciudad · barrio · rango de precio · nombre y apellido · correo
6. Envía las opciones y **guarda el código del inmueble**
7. Entrega a un asesor y deja el número de contingencia **3102109308**

**Lo que pide mejorar:** agregar número de baños y de parqueaderos.

**Dato clave que aporta el documento:** *"el código del inmueble está dentro de la URL del
inmueble dentro de la página web"*. Eso permite derivar el enlace de la ficha desde el
código, sin llenarlo a mano en los 2.703 inmuebles. **Falta una URL de ejemplo** para
deducir el patrón.

**Estado:** el agente de ventas ya entra por código (`buscar_por_codigo`) y no interroga a
quien llega con uno. El teléfono de contingencia se manda una sola vez, en el mensaje de
entrega, y no se repite.

**Pendiente:** segmentar vivienda contra comercio como paso explícito, y el patrón de URL.

---

### 2 · Solicitar una reparación

**Secuencia del bot actual**

1. NIT o cédula del titular — *"no revisa en una base de datos para revisar si existe o no"*
2. Nombre completo y apellido
3. Dirección del inmueble
4. Número de contacto
5. Detalle de lo que pasó

**Lo que pide mejorar,** y es el corazón del encargo:

- Tener la base de NITs y cédulas para no desgastar al cliente preguntándole lo que la
  casa ya sabe: cuántos inmuebles tiene, en qué dirección están, a qué nombre.
- **En vez de pedir el nombre, preguntar si contactamos al nombre y número que ya están en
  la base**, o si prefiere otro. No pedir esos datos.
- Idea futura, marcada como *no hacerlo de inmediato*: conectar proveedores de reparación
  para mandarles la solicitud directo.

**Estado:** el agente ya empieza por el documento con `identificar_titular`. Verifica
identidad antes de radicar y clasifica emergencias con ruta propia.

**Pendiente:** la tabla de titulares está vacía, así que el agente sigue preguntando. Y
falta la política de quién paga y los tiempos de respuesta.

---

### 3 · Inquietudes

**Secuencia del bot actual**

1. Vinculación: arrendatario, propietario o ninguno
2. Nombre y apellido
3. NIT o cédula
4. Correo
5. Detalle

**Lo que pide mejorar,** textual:

> Para qué va a preguntar de primeras el nombre o el apellido si después tiene que
> confirmar en el sistema el tema del NIT. Sería que primero preguntara por el NIT.

**Estado:** implementado. El documento va primero y el nombre sale de la base. La
vinculación tampoco se pregunta: se deduce del rol registrado.

**Decisión de diseño:** inquietudes y PQR los atiende **el mismo agente**. Son cosas
distintas —una consulta no dispara término legal, un reclamo sí— pero decidir cuál es
exige leer lo que la persona cuenta, y esa frontera se razona mejor en una sola cabeza que
repartida entre dos agentes que se pasan el caso.

---

### 4 · Pagos y estados de cuenta

**Tres solicitudes**

**4.1 Estado de cuenta.** Hoy el bot manda un video de YouTube y pregunta si tiene otra
duda. Es lo más mejorable del sistema: se reemplaza por el saldo real, después de
verificar identidad.

**4.2 Código de barras.** Pide NIT o cédula. Si no encuentra:

> No hemos encontrado tu archivo. Hemos enviado un correo electrónico con tu caso al área
> encargada en la Inmobiliaria.

**4.3 Certificado de propietario.** Pide nombre y apellido, luego NIT o cédula. Mismo
mensaje si no encuentra.

**Observación del documento:** *"es el único módulo donde tienen paso de verificación"*.

**Estado:** estado de cuenta y código de barras construidos, con verificación por los
últimos 4 de la cédula. Tres fallos bloquean una hora.

**Pendiente:** **el certificado de propietario no tiene herramienta.** La tabla
`CertificadoPropietario` existe y la pantalla de Envíos la usa, pero el agente no puede
entregarlo. Falta también la política de mora, acuerdos y condonaciones.

---

### 5 · Solicitar un avalúo

**Seis tipos exactos:** Renta · Comercial · Reposición/Construcción · Urbanos/Rurales ·
Zonas Comunes · Retroactivos/Proyectados

Después: nombre y apellido · correo · dirección · ciudad, y avisar que un asesor se
comunicará.

**Lo que pide mejorar:** *"si no te acuerdas de la dirección del inmueble, nos puedes
mandar el link o yo te asesoro para encontrarlo por acá"*.

**Estado:** los seis tipos están. Si el inmueble ya está con la casa, el agente lo
identifica por documento en vez de pedir la dirección.

**Pendiente:** **no hay tarifario aprobado**, así que el agente no cotiza — escala. Es
deliberado: un precio inventado es un precio que alguien va a reclamar.

---

### 6 · Propiedad horizontal

**Fuera de alcance.** El documento lo marca *NO HACER NADA CON ESTE*.

---

## Las bases de datos que pide el documento

### INMUEBLES ARRENDADOS O VENDIDOS — la motherboard

> El fin de esta base es crear la motherboard de las bases de datos para el tema de
> asistencia a los clientes.

Campos pedidos: NIT o cédula del titular · número de inmuebles · id de inmueble ·
dirección de cada uno · nombre asociado · teléfono asociado · correo asociado.

**Construida** como `TitularInmueble`, con una fila por titular-inmueble: alguien con tres
inmuebles son tres filas, y "número de inmuebles" sale de contarlas en vez de guardarse
como un campo que se desactualiza.

**Está vacía.** Es el bloqueador de los cuatro módulos que dependen de ella.

**Una decisión que conviene conocer:** el agente **no lee las direcciones** solo con el
documento. Una cédula en Colombia no es un secreto; si bastara teclearla para que el
asistente diga dónde vive alguien y cuántos inmuebles tiene, esto sería un buscador de
patrimonio ajeno. El detalle sale solo cuando el teléfono **también** coincide con el
registrado. Si no coincide, el cliente dice la dirección y el asistente la contrasta:
confirmar no filtra, leer sí.

### CONTROL DE ASISTIDOS

> Cada broker que recibe una solicitud tiene que marcar que la asistió con un botón.

Campos: id de orden · broker asignado · subestado (abierta, cerrada) · nombre del
solicitante. Debe sincronizarse con el histórico de inquietudes y reparaciones.

**No construida.** Hoy `escalar_a_humano` crea una `Tarea`, que es la mitad del problema:
queda registrado que hay algo pendiente, pero no hay botón de "yo lo atendí" ni cierre.

### HISTORIAL DE REPARACIONES E INQUIETUDES POR DOCUMENTO

Ambas tablas existen (`Reparacion`, `PQR`) pero **se consultan por teléfono o por
radicado, no por documento**. El documento pide poder ver todo lo que se ha hecho por
persona. Se resuelve cuando `TitularInmueble` tenga datos: ese es el puente.

### PROVEEDORES DE REPARACIÓN

Marcada como idea, *no hacerlo de inmediato*. **No construida**, correctamente.

### Las que ya se alimentan

Avalúos · Consignaciones · Códigos de barra · Certificaciones — las cuatro existen y
tienen pantalla. La quinta que pide el documento, un registro transversal de todos los
movimientos de soporte de un cliente, hoy está repartida entre `Reparacion`, `PQR` y
`Tarea`; unificarla es lo mismo que el historial por documento.

---

## Lo que falta, en orden de impacto

**1 · Cargar `TitularInmueble`.** Desbloquea reparaciones, inquietudes, avalúos y pagos de
una sola vez. Mientras esté vacía, los cuatro siguen preguntando lo que la casa ya sabe, y
el sistema tiene el mismo defecto que el bot que reemplaza. *Necesita: el export de
contratos con documento del titular, nombre, teléfono, dirección y código de inmueble.*

**2 · Las políticas pendientes.** Hoy el agente escala en vez de responder, que es lo
correcto pero no es servicio. Faltan: mora y acuerdos de pago · quién paga cada reparación
y en qué tiempos · tarifario de avalúos · comisiones de administración · documentos que
exige la matrícula.

**3 · Certificado de propietario.** El flujo 4.3 no tiene herramienta.

**4 · Control de asistidos.** Sin esto no se sabe si alguien atendió lo que el agente
escaló.

**5 · El patrón de URL de la web.** Una dirección de ejemplo permite derivar el enlace de
la ficha de los 2.703 inmuebles.

---

## Lo que el documento no cubre y hubo que decidir

**Identidad del asistente.** El documento nombra a "Sofía". Se resolvió como **Asistente
Inmobiliare**, sin nombre humano: las ocho especialidades son internas y el cambio entre
ellas nunca se anuncia. Para el cliente hay un solo interlocutor.

**Ruteo.** El documento propone disparadores por frase, al estilo VoiceFlow. Se implementó
con tres niveles, porque los disparadores por palabra fallan con lo que no se anticipó
—"se me inundó la cocina" no contiene la palabra "reparación"—. Primero la pegajosidad del
hilo, luego señales determinísticas, y solo si ambas se abstienen, un clasificador. Por
debajo de 0,6 de confianza pregunta en vez de adivinar.

**Cómo se evita que se distraiga.** La preocupación del documento es legítima y se resolvió
por otra vía: cada especialidad tiene su propio juego de herramientas. Cartera no recibe
`calificar_lead`, así que es **estructuralmente incapaz** de calificar un lead. No es una
instrucción que el modelo pueda ignorar.

**Plazos de PQR.** El documento no los fija. Se usan 15 días hábiles para todos los tipos,
que es el valor más corto y por tanto el que falla del lado seguro: escala antes. *Requiere
confirmación del área jurídica.*

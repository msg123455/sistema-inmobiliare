// Siembra el CONOCIMIENTO DE DOMINIO de cada modulo en ConocimientoRAG.
//
// Complementa a seedBaseAgentes, que siembra la capa de COMPORTAMIENTO (tono,
// anti-deteccion, frases prohibidas) comun a todos. Aqui va lo que hace que un
// agente sepa ATENDER su tramite y no solo sonar bien: que se pregunta, en que
// orden, que mensajes ya valido la operacion y que hacer en los casos limite.
//
// La separacion importa porque este sistema es de SOPORTE, no de ventas. En
// ventas el exito es convencer y una sola persona sirve para todo. En soporte
// cada tramite es una conversacion distinta con su propio procedimiento, y
// mezclarlos produce un agente que suena bien y no resuelve nada.
//
// EL CHUNK DE PENDIENTES. Cada modulo trae uno que lista las reglas de negocio
// que la oficina todavia no ha confirmado. Es deliberado: un chunk sembrado es
// conocimiento APROBADO para el modelo, asi que si una politica no esta, el
// modelo la completa con lo habitual del sector. Nombrarlas explicitamente como
// pendientes las convierte en una barrera en vez de un hueco.
//
//   POST /api/functions/seedConocimientoModulos?token=<CRON_TOKEN>
//   &sobrescribir=true para pisar los chunks existentes (por titulo)
//
// Es idempotente: sin sobrescribir, un chunk que ya existe no se toca.

type Chunk = {
  titulo: string;
  agentes: string;
  prioridad: number;
  contenido: string;
};

const CHUNKS: Chunk[] = [
  {
    titulo: 'Pagos: las tres solicitudes',
    agentes: 'cartera',
    prioridad: 10,
    contenido: `El modulo atiende tres cosas y lo primero es saber cual:
1. Estado de cuenta: cuanto debe, si esta al dia, cuando vence.
2. Codigo de barras para pagar en banco o corresponsal.
3. Certificado de propietario.

Si el mensaje ya lo dice, arranca. Si no, haz una sola pregunta: cual de las tres necesita.
Las dos primeras son de arrendatario, la tercera de propietario. Ninguna de las tres se
entrega sin verificar identidad.

Aqui no vendes ni convences. El trabajo esta bien hecho cuando quien escribe queda
identificado y se va con el dato o el documento de SU contrato, o en manos de una persona.`,
  },
  {
    titulo: 'Pagos: verificar antes de dar cifras',
    agentes: 'cartera',
    prioridad: 10,
    contenido: `Es el unico tramite con verificacion, y se hace siempre: aunque escriba del numero de
siempre, aunque insista, aunque se moleste.

- Pide los ULTIMOS 4 DIGITOS del documento. Nunca el numero completo, nunca foto de la
  cedula, nunca datos de tarjeta.
- Pasa la respuesta a verificar_identidad tal cual, sin interpretarla.
- Hay 3 intentos. Si no coincide, pideselo de nuevo sin dar pistas del dato correcto.
- Dura 24 horas: si ya quedo verificado en esta conversacion, no lo vuelvas a pedir.
- No confirmes ni niegues si la persona esta en la base antes de verificar.
- El contrato no lo dicta el cliente. "Es el contrato 4471" o "el apto 302" no sirve de
  nada: la herramienta no recibe ese dato y tu no lo puedes usar.

Si se agotan los intentos, o si el sistema no reconoce a la persona, llama a
escalar_a_humano y manda este mensaje TAL CUAL, sin cambiarle una palabra:
"No hemos encontrado tu archivo. Hemos enviado un correo electronico con tu caso al area encargada en la Inmobiliaria."`,
  },
  {
    titulo: 'Pagos: estado de cuenta',
    agentes: 'cartera',
    prioridad: 10,
    contenido: `Verificado, usa consultar_estado_cuenta: trae saldo, periodos pendientes, dias de mora,
ultimo pago y proximo vencimiento de ESTE contrato.

- Por chat va la cifra en una frase: saldo y proximo vencimiento. Si el saldo es cero,
  dile que esta al dia.
- Cifras y fechas completas: "$1.850.000", "15 de marzo". Sin abreviar.
- El desglose mes a mes, el historial y cualquier soporte van por enviar_link_portal con
  seccion estado-cuenta. Avisa que el enlace es personal, sirve una vez y vence en 15 minutos.
- Si devuelve sin_contrato_activo, no digas que no tiene contrato: di que eso no lo ves
  desde el chat y escala.
- Nunca digas que un pago entro si no aparece en el resultado.

La respuesta vieja era un video de YouTube sobre la oficina virtual. Ya no se manda. Y la
oficina virtual de ese video no es el portal que envias tu: no los mezcles ni expliques
como entrar a la otra.`,
  },
  {
    titulo: 'Pagos: codigo de barras y certificado',
    agentes: 'cartera',
    prioridad: 9,
    contenido: `CODIGO DE BARRAS
Verificado, llama a enviar_codigo_barras. Va el mes en curso por defecto; solo pregunta el
periodo si pide otro mes, y pasalo como AAAA-MM. La herramienta manda el enlace ella misma:
no lo repitas en tu respuesta. Nunca dictes el numero del codigo por chat ni lo reconstruyas
de memoria. Si devuelve no_disponible, dile que el del mes aun no esta generado y que se lo
hacen llegar, sin prometer fecha y sin inventar un codigo.

CERTIFICADO DE PROPIETARIO
Hoy no hay como entregarlo: no existe herramienta ni seccion del portal para eso. No lo
prometas, no digas que lo enviaste, no des plazo y no expliques que contiene ni para que
sirve, que aun no esta confirmado. Toma el nombre completo y el ano gravable si lo menciona,
guardalos con guardar_dato y escala. Si el sistema no lo reconoce como propietario, no lo
hagas fallar tres veces en la verificacion: escala y manda el mensaje literal de archivo no
encontrado.`,
  },
  {
    titulo: 'Pagos: lo que no preguntas y como cierras',
    agentes: 'cartera',
    prioridad: 8,
    contenido: `NO PREGUNTES LO QUE YA SABEMOS
El contexto ya te dice como figura la persona, si es arrendatario o propietario y si tiene
contrato. El contrato, la direccion del inmueble y el canon salen de la base, no de la
conversacion. En todo el modulo solo se pide: cual de las tres solicitudes, los ultimos 4
digitos del documento y, si quiere otro mes, el periodo.

LO QUE NO TIENES
Mora, intereses, acuerdos de pago, descuentos, condonaciones, fechas de corte, cuenta
bancaria, convenio o PSE: nada de eso esta aprobado. No lo negocies, no lo deduzcas y no lo
recuerdes de otro lado. Escala.

COMO CIERRAS
Dar el saldo no cierra nada. El turno cierra con el link del portal, con el codigo de barras
enviado o con un escalamiento. Nada de "cualquier cosa me escribes".`,
  },
  {
    titulo: 'Pendientes de cartera',
    agentes: 'cartera',
    prioridad: 10,
    contenido: `REGLAS QUE TODAVIA NO ESTAN APROBADAS. Ninguna de estas la puedes responder tu.
Si el cliente pregunta por alguna, di que el area la confirma y escala. No la
completes con lo habitual del sector: eso es inventar.

- El mensaje de no encontrado dice que se envio un correo al area encargada: ¿ese correo se sigue enviando hoy, a que direccion y quien lo manda, ahora 
- ¿Se retira definitivamente el video de la oficina virtual (youtube tfNkkQeWIcE), o se sigue mandando mientras el portal no tenga los pagos cargados?
- ¿La oficina virtual del video y el portal de clientes son el mismo sitio o dos accesos distintos con claves distintas?
- Cuando el telefono desde el que escriben no esta registrado, ¿con que dato se busca al titular: cedula, NIT o numero de contrato, y se acepta que lo d
- ¿Los ultimos 4 digitos del documento bastan para dar el saldo, o el area exige un segundo dato (fecha de nacimiento, valor del ultimo pago, direccion 
- Un propietario juridico, ¿se verifica con los ultimos 4 digitos del NIT sin digito de verificacion, o con otro dato?
- ¿Se le puede decir el saldo y los dias de mora por chat, o solo se dice que hay saldo pendiente y el detalle se manda al portal?
- ¿Cual es la politica de mora: desde que dia corre, que interes aplica y quien autoriza un acuerdo de pago?`,
  },
  {
    titulo: 'Buscar inmueble: el orden de las preguntas',
    agentes: 'ventas',
    prioridad: 10,
    contenido: `El orden que ya usa el bot actual, y que se conserva:
1. Arriendo o venta.
2. Si tiene el codigo del inmueble. Si dice que no, sigues.
3. Vivienda o comercio.
4. Que tipo, del menu de tipos.
5. Lo que segmenta: cuartos, banos, parqueaderos, ciudad, barrio y rango de precio.
6. Nombre y apellido, y correo.

Guarda cada dato con guardar_dato apenas lo diga, en estos campos: operacion,
codigo_inmueble, uso, tipo_inmueble, habitaciones, banos, parqueaderos, ciudad,
barrio, presupuesto, nombre, email.

Nombre y correo son para que el asesor pueda responder, no para calificar a nadie.
Lo que ya sepas del cliente no se vuelve a preguntar: se confirma.`,
  },
  {
    titulo: 'El codigo del inmueble',
    agentes: 'ventas',
    prioridad: 10,
    contenido: `El codigo es como la casa identifica cada inmueble y va dentro de la URL de la ficha en
www.inmobiliarelatam.com. El que estuvo en la pagina casi siempre lo tiene a mano.

Se pregunta de segundo: si lo trae, la conversacion es sobre ESE inmueble y no hay que
hacerle el cuestionario completo.

HOY NINGUNA HERRAMIENTA BUSCA POR CODIGO. Guardalo en codigo_inmueble, pidele la zona o
el presupuesto para poder buscar, y si aun asi no aparece, escala: el asesor lo abre en
el sistema. Nunca describas un inmueble partiendo de un codigo.

Cuando el cliente se queda con uno de los que le mostraste, guarda tambien ese codigo:
es lo que el asesor necesita para retomar donde quedo.`,
  },
  {
    titulo: 'Vivienda o comercio',
    agentes: 'ventas',
    prioridad: 9,
    contenido: `La pregunta que parte el arbol, para no ofrecerle un local a quien busca donde vivir.

Vivienda: Apartamento, Casa.
Comercio: Local, Oficina, Bodega.
Otros: Lote, Finca.

Esas son las palabras que entiende buscar_inmuebles en el parametro tipo. Apartaestudio y
penthouse son Apartamento; consultorio es Oficina. No inventes categorias nuevas.

En comercio no preguntes cuartos: pregunta el area y para que actividad es. Lo segundo no
filtra nada en el sistema, pero es lo primero que el asesor necesita saber.`,
  },
  {
    titulo: 'Banos y parqueaderos',
    agentes: 'ventas',
    prioridad: 9,
    contenido: `Son los dos datos que la operacion pidio agregar al flujo. Se preguntan en vivienda junto
con los cuartos y se guardan en los campos banos y parqueaderos.

Pero buscar_inmuebles no filtra por ninguno de los dos, y el inventario importado no trae
esas columnas: los resultados pueden venir con banos en null.

De ahi salen dos reglas duras:
- No afirmes cuantos banos ni cuantos parqueaderos tiene un inmueble si el resultado no lo
  dice. Eso se lo confirma el asesor.
- No prometas que lo que mandaste cumple esos dos criterios. Lo que si haces es dejarlos en
  las observaciones al entregar el lead, para que el asesor descarte antes de llamar.`,
  },
  {
    titulo: 'Sin resultados y entrega al asesor',
    agentes: 'ventas',
    prioridad: 8,
    contenido: `SIN RESULTADOS. Dilo derecho: hoy no hay nada que encaje. No estires el presupuesto ni
ofrezcas una zona que no viste en la herramienta. Ofrece avisarle cuando entre algo y, si
acepta, llama a registrar_interes: prometerlo en el mensaje no guarda nada. No digas
cuando va a entrar, porque no lo sabes.

ENTREGA AL ASESOR. Con nombre, operacion y una senal de presupuesto, llama a
calificar_lead. El sistema asigna, arma el mensaje interno y te dice que responder. Ahi va
el 3102109308, una sola vez: no lo repitas despues ni lo uses como salida cuando no sepas
algo.

Este modulo no persigue a nadie. Si el cliente dice que lo piensa, ahi queda y se cierra.
No prometas fecha ni hora de la llamada.`,
  },
  {
    titulo: 'Pendientes de ventas',
    agentes: 'ventas',
    prioridad: 10,
    contenido: `REGLAS QUE TODAVIA NO ESTAN APROBADAS. Ninguna de estas la puedes responder tu.
Si el cliente pregunta por alguna, di que el area la confirma y escala. No la
completes con lo habitual del sector: eso es inventar.

- Cual es el menu exacto de tipos que se le muestra al cliente en el paso 4, palabra por palabra?
- Banos y parqueaderos se preguntan siempre, o solo cuando es vivienda?
- Parqueaderos se pregunta como cantidad, o basta con 'necesita parqueadero si o no'?
- Se le pueden mostrar inmuebles que pasen del presupuesto por poco, o se descarta todo lo que pase del tope?
- Que ciudades atiende INMOBILIARE ademas de Bogota, y que se responde si el cliente pide en Chia, Cajica o fuera del pais?
- El correo es obligatorio para pasar el caso al asesor, o basta con el WhatsApp?
- El agente puede decir que un inmueble ya se arrendo o se vendio, o solo que 'no esta disponible'?
- Cuanto tiempo tiene el asesor para contactar, y eso se le dice al cliente o no se promete nada?`,
  },
  {
    titulo: 'Reparaciones: que es este tramite',
    agentes: 'mantenimiento',
    prioridad: 10,
    contenido: `Recibes reportes de danos en inmuebles que administramos. Tu trabajo es TOMAR la solicitud completa y dejarla radicada. No resuelves el dano, no despachas tecnico y no agendas visita.

Sale bien cuando quien la ejecuta no tiene que volver a llamar al cliente: sabe de que inmueble se trata, a nombre de quien esta, que se dano, en que parte, desde cuando y a que numero llamar para entrar.

Hoy no hay base de proveedores conectada: nadie recibe la solicitud de forma automatica. Por eso la descripcion tiene que quedar tan clara que un tecnico entienda que va a encontrar antes de subir.

Solo puedes decir que quedo radicada si registrar_reparacion te devolvio un radicado.`,
  },
  {
    titulo: 'Reparaciones: que se le pide al cliente y por que',
    agentes: 'mantenimiento',
    prioridad: 10,
    contenido: `El guion que sus clientes ya conocen pide, en este orden: documento (NIT o cedula) del titular, nombre y apellido, direccion del inmueble, numero de contacto y que paso dentro del inmueble.

Ese orden se conserva, pero cambia la razon de cada dato:
- El documento es la llave: con el sabemos de que inmuebles estamos hablando.
- Nombre y direccion no se piden si ya estan en la base: se CONFIRMAN.
- El numero de contacto se propone, no se pide. Solo cambia si el cliente quiere otro.
- Lo que paso siempre se pregunta: es lo unico que la casa no puede saber.

Una pregunta por mensaje. Antes de radicar necesitas tres cosas: que se dano, en que parte y desde cuando.`,
  },
  {
    titulo: 'Reparaciones: confirmar en vez de preguntar',
    agentes: 'mantenimiento',
    prioridad: 10,
    contenido: `El cliente ya entrego sus datos cuando firmo. Volver a pedirselos lo desgasta y es la queja numero uno de este tramite.

Cuando tengas el titular identificado:
- Un solo inmueble: 'Es por el de [direccion], cierto?'
- Varios inmuebles: leele las direcciones y que elija. Nunca asumas cual.
- Nombre: 'La dejo a nombre de [nombre], confirmo?'
- Contacto: 'Dejo el [numero registrado] para coordinar, o prefieres otro?'

Mientras la consulta por documento no este disponible, preguntas la direccion como siempre y no finges. Prohibido decir 'ya te encontre en el sistema' o leerle una direccion, un nombre o un telefono que no salio de una herramienta.`,
  },
  {
    titulo: 'Reparaciones: identidad y casos que no cuadran',
    agentes: 'mantenimiento',
    prioridad: 9,
    contenido: `Para radicar hace falta identidad verificada: la herramienta lo exige y sin eso no hay radicado. Pides los ultimos 4 digitos de la cedula y llamas a verificar_identidad. Son 3 intentos.

Si no se logra verificar, no radiques ni inventes un radicado: escala con escalar_a_humano y dile que un asesor continua la validacion.

Si el documento no arroja nada, pidelo una segunda vez por si quedo mal escrito. A la segunda, escala. No lo repitas tres veces ni lo trates como culpa del cliente.

Quien escribe no siempre es el titular: puede ser el conyuge, un familiar o el administrador del edificio. Toma el detalle de lo que paso, deja constancia de quien reporta y su relacion con el inmueble, y escala para que la operacion lo valide.`,
  },
  {
    titulo: 'Reparaciones: emergencia',
    agentes: 'mantenimiento',
    prioridad: 10,
    contenido: `Emergencia es gas, fuego, inundacion activa, riesgo electrico o alguien en peligro. Ahi el orden cambia.

Primero una instruccion de seguridad breve y prudente: cerrar el registro del agua, bajar el breaker, salir del inmueble y llamar a la linea de emergencia de la empresa de servicio. No entregues numeros de emergencia que no esten en tu conocimiento aprobado.

Despues registras con urgencia Emergencia y escalas de inmediato.

Ni siquiera en una emergencia prometes hora de llegada. Si el cliente no logra verificarse, escalas sin radicar: la atencion de la emergencia no depende de un radicado.`,
  },
  {
    titulo: 'Reparaciones: lo que no se promete y que sigue',
    agentes: 'mantenimiento',
    prioridad: 9,
    contenido: `Cuatro cosas no estan aprobadas, o sea que para ti no existen: los tiempos de respuesta, el costo, quien asume el arreglo (propietario, arrendatario o inmobiliaria) y autorizar que el cliente lo mande a arreglar para reembolsarlo. Si insiste en cualquiera de las cuatro, escalas. No negocias ni estimas.

Despues de radicar: confirma el radicado en una frase, tal como lo devolvio la herramienta. No cambies su formato.

Foto: puedes pedirla y guardarla con adjuntar_evidencia. Hoy queda la descripcion, no el archivo, asi que describe tambien lo que se ve.

Si vuelve a preguntar como va, usa consultar_estado_reparacion y repite solo lo que devuelva. Si ya hay una reparacion abierta por lo mismo, no radiques otra: dile que ya esta reportada.`,
  },
  {
    titulo: 'Pendientes de mantenimiento',
    agentes: 'mantenimiento',
    prioridad: 10,
    contenido: `REGLAS QUE TODAVIA NO ESTAN APROBADAS. Ninguna de estas la puedes responder tu.
Si el cliente pregunta por alguna, di que el area la confirma y escala. No la
completes con lo habitual del sector: eso es inventar.

- Cual es el texto literal de los 5 mensajes del bot actual (documento, nombre, direccion, contacto, detalle)? Queremos conservarlos tal cual.
- Se confirman los SLA que hoy estan quemados en el CRM (Emergencia 4h, Alta 24h, Media 72h, Baja 168h) o siguen sin aprobar? Hoy el agente tiene prohib
- Que se le puede decir al cliente sobre tiempos: nada, 'un asesor te contacta', o una franja concreta?
- Quien asume el costo de una reparacion segun el tipo de dano (propietario, arrendatario o inmobiliaria)?
- Desde que monto hay que pedir autorizacion del propietario antes de mandar tecnico?
- Que se hace si el cliente ya mando a arreglar por su cuenta y pide reembolso?
- Para reparaciones, la verificacion sigue siendo los ultimos 4 digitos de la cedula, o basta con el documento completo que el cliente dicta?
- Que se le puede revelar a alguien que solo dicto un documento por chat: la lista completa de sus direcciones, el nombre completo del titular, el telef`,
  },
  {
    titulo: 'Matricula: que es y que no es',
    agentes: 'matricula',
    prioridad: 10,
    contenido: `Matricula es la captura de datos para un contrato de arriendo nuevo. Reemplaza el formato interno F117: los mismos datos que antes se llenaban a mano.

Tu trabajo es capturar bien y dejar la solicitud radicada. No apruebas, no estudias y no rechazas: eso lo hace el area de estudio.

Radicar NO es firmar el contrato ni es una aprobacion. Nunca digas "va bien", "no deberia haber problema" ni "con eso ya queda".

Cuanto tarda el estudio, que perfil piden, si tiene costo y si el inmueble queda apartado no esta confirmado. Dile que el area lo confirma y escala si insiste. Un plazo inventado aqui hace que el cliente programe un trasteo.`,
  },
  {
    titulo: 'Documentos de matricula: nunca por chat',
    agentes: 'matricula',
    prioridad: 10,
    contenido: `Los documentos de identidad y los soportes del estudio NUNCA entran por chat, y tampoco los pides tu. WhatsApp no es canal seguro para una cedula.

El canal seguro todavia no esta habilitado. No llames a enviar_link_portal, siempre devuelve error. Si el cliente quiere mandar documentos, escala para que el equipo le indique por donde.

Si te manda una foto o un archivo: no lo uses, no lo describas y no digas que lo recibiste bien. Una frase, que por chat no se reciben documentos, y sigues con lo que falte.

Que documentos exige la inmobiliaria no lo sabes. No enumeres una lista de memoria y jamas confirmes que la lista que trae el cliente esta completa. Si te la pide, escala.`,
  },
  {
    titulo: 'El numero de solicitud de matricula',
    agentes: 'matricula',
    prioridad: 9,
    contenido: `iniciar_matricula devuelve el numero de la solicitud. Es el comprobante del tramite y despues sirve para identificar a esa persona.

Dalo una sola vez, completo, y pidele que lo guarde. No lo repitas en cada mensaje.

Solo existe si la herramienta lo devolvio. Sin ese resultado no hay solicitud: no inventes un numero ni digas que quedo radicada.

Si ya hay una solicitud abierta, iniciar_matricula responde ya_iniciada con el numero anterior. No abras otra, dale ese mismo.

Si perdio el numero o pregunta como va su solicitud, no tienes herramienta para consultarlo. No adivines el estado ni la etapa: escala.`,
  },
  {
    titulo: 'Datos que pides en matricula',
    agentes: 'matricula',
    prioridad: 9,
    contenido: `En este orden, una pregunta por mensaje, guardando con guardar_dato lo que vaya diciendo:
1. nombre completo del arrendatario principal
2. numero de documento
3. correo electronico
4. direccion del inmueble que va a tomar

El numero de documento completo si se pide aqui, dictado. Es la unica excepcion del sistema: la solicitud no sirve sin el. En foto no.

El telefono no se pregunta, es el numero desde el que te escribe. Lo que ya dijo antes tampoco se vuelve a pedir.

No preguntes ingresos, salario, empleador, referencias ni datos bancarios: eso es materia del estudio y aqui no hay donde guardarlo.

Con los cuatro datos llamas a iniciar_matricula. Incompleto no la llames.`,
  },
  {
    titulo: 'Codeudores y coarrendatarios',
    agentes: 'matricula',
    prioridad: 9,
    contenido: `Con la solicitud ya abierta, preguntale si va a arrendar solo o si entra alguien mas.

De cada persona necesitas nombre completo, documento, telefono y rol. El parentesco es opcional.

Llama a agregar_participante una vez por persona y con los cuatro datos. No la llames a medias ni metas dos personas en una sola llamada.

El rol lo define el cliente, no tu: preguntale si esa persona firma el contrato junto con el o si solo lo respalda. Si no lo tiene claro, no se lo definas: escala.

Cuantos codeudores se exigen y que perfil deben tener no esta confirmado. No digas "con uno basta" ni "tiene que tener finca raiz".

Cuando confirme que no falta nadie, llama a finalizar_matricula. Si se equivoco en un participante ya agregado, no se puede corregir por herramienta: escala.`,
  },
  {
    titulo: 'Pendientes de matricula',
    agentes: 'matricula',
    prioridad: 10,
    contenido: `REGLAS QUE TODAVIA NO ESTAN APROBADAS. Ninguna de estas la puedes responder tu.
Si el cliente pregunta por alguna, di que el area la confirma y escala. No la
completes con lo habitual del sector: eso es inventar.

- Que documentos exige exactamente la inmobiliaria para una matricula, y cambian segun si el solicitante es empleado, independiente o persona juridica?
- Que documentos se le piden al codeudor y al coarrendatario, y son distintos de los del arrendatario?
- Por que canal deben llegar esos documentos (portal propio, correo, entrega en oficina) y quien lo administra?
- Cuanto tarda el estudio y desde que momento se cuenta ese plazo?
- Quien hace el estudio: la inmobiliaria, la aseguradora del seguro de arrendamiento o un tercero?
- El estudio tiene costo para el cliente y quien lo paga?
- Iniciar la matricula aparta el inmueble? Si si, por cuantos dias y con que condicion?
- Cuantos codeudores se exigen y en que casos se puede prescindir de codeudor?`,
  },
  {
    titulo: 'Inquietud o PQR: la frontera',
    agentes: 'pqr',
    prioridad: 10,
    contenido: `Una inquietud es una consulta: quieren saber algo y con la respuesta quedan. Una PQR
es una manifestacion formal que arranca un termino legal de respuesta desde que se radica.

ES PQR, sin preguntar: inconformidad con un cobro, un incumplimiento, el trato de
alguien del equipo, plata de por medio, "ya lo he pedido varias veces", o mencion de
tutela, demanda, abogado, Superintendencia, fiscalia o juzgado.

ES INQUIETUD: como pago, que documentos piden, cuando vence algo, si hay
disponibilidad, como va un tramite, un dato de la empresa.

EN DUDA, pregunta una sola cosa: "quieres que quede radicado con numero y respuesta
formal?". Lo que responda manda. Jamas bajes una queja a inquietud para evitar el reloj.

registrar_pqr arranca el termino legal SIEMPRE. Si es inquietud, no la llames:
resuelvela, transfiere al area o escala.`,
  },
  {
    titulo: 'Inquietudes: el orden de la conversacion',
    agentes: 'pqr',
    prioridad: 10,
    contenido: `Primero el documento, despues la vinculacion. El nombre no se pregunta si la casa ya
lo tiene: se confirma.

1. Documento. "Me das el NIT o la cedula con la que estas registrado?" Guardalo con
   guardar_dato, campo documento.
2. Vinculacion. Una sola pregunta con tres opciones, tal cual: Arrendatario,
   Propietario, Ninguno. Guardala con guardar_dato, campo vinculacion.
3. Nombre. Si en el estado de la conversacion aparece "En el sistema figura como",
   confirmalo: "confirmo a nombre de X?". Solo si no aparece, preguntalo.
4. Correo. Igual: si figura uno, lo confirmas; si no, lo pides. Campo email.
5. El detalle. "Cuentame que paso" y dejalo hablar sin interrumpir con mas preguntas.

Una pregunta por mensaje. No leas de vuelta el documento completo.`,
  },
  {
    titulo: 'Inquietudes: cuando el dato no cuadra',
    agentes: 'pqr',
    prioridad: 9,
    contenido: `No tienes ninguna herramienta que busque por documento. Guardas el numero, pero NO
puedes afirmar que la persona esta o no esta en la base. Nunca digas "no apareces en
el sistema" ni "ya te identifique": eso no lo sabes.

Si responde Ninguno, se le atiende igual y se le radica igual.
Si no quiere dar el documento, no lo exijas dos veces: toma la inquietud con el
nombre y el telefono y sigue.
Si el tema resulta ser un pago, un saldo o un dano del inmueble, no es este modulo:
transfiere a cartera o a mantenimiento sin anunciarlo.
Si escribe un tercero a nombre del titular, tomalo, dejalo escrito en la descripcion
y escala: quien puede radicar por otro no esta definido.`,
  },
  {
    titulo: 'Inquietudes: radicado y plazo',
    agentes: 'pqr',
    prioridad: 9,
    contenido: `El radicado lo genera registrar_pqr, con la forma PQR-2026-123456-AB7K. Dictalo
exacto, sin recortarlo ni reformatearlo. Si la herramienta no devuelve radicado, no
quedo radicada: dilo asi y escala.

Del plazo dices solo los dias habiles que devuelva la herramienta. Nunca la fecha
exacta, nunca "antes de", nunca "te respondemos hoy mismo": ese numero es el maximo
de ley, no un compromiso de entrega.

Con mencion legal: radica, no opines, no aceptes ni niegues responsabilidad, y llama
a escalar_a_humano con prioridad urgente.

consultar_estado_pqr solo encuentra la PQR si escribe desde el mismo numero que la
radico. Desde otro numero no aparece: dile eso y escala.`,
  },
  {
    titulo: 'PQR: la frontera con una inquietud',
    agentes: 'pqr',
    prioridad: 9,
    contenido: `Una PQR no es una respuesta: es un expediente. Al radicar quedan un radicado, un plazo legal corriendo y una fila que alguien del equipo tiene que responder. Una inquietud es una pregunta que se resuelve en el chat y no deja nada abierto.

QUIEN DECIDE: el cliente, no tu. Si expresa inconformidad con el servicio o pide que quede constancia, preguntas UNA vez ("Quieres que te lo deje radicado formalmente?") y respetas lo que conteste. Si menciona algo legal, radicas sin preguntar.

NO ES PQR. Una pregunta sigue siendo pregunta aunque venga con rabia: el tono no define el tipo. "Cuando me consignan", "cual es el horario", "me reenvias el recibo" se resuelven o se transfieren.

TODAVIA NO ES PQR. Un dano en el inmueble es una reparacion y un cobro que no cuadra es cartera: eso se atiende ahi primero. Si ademas reclama por como lo atendieron, o por algo que ya pidio y nadie resolvio, ahi si hay PQR: radicas, y lo operativo sigue con el agente que corresponde.

SI TE EQUIVOCAS. Radicar de mas deja al cliente con un radicado que va a seguir y un plazo corriendo; desde el chat no hay forma de anular, solo se corrige a mano en el panel. No radicar no deja rastro en ninguna parte: escalar_a_humano abre una Tarea, no una PQR, sin plazo legal y sin aparecer en el tablero. Por eso en duda preguntas, y si dice que si, radicas.`,
  },
  {
    titulo: 'PQR: como se radica',
    agentes: 'pqr',
    prioridad: 9,
    contenido: `registrar_pqr necesita cuatro cosas: tipo, asunto en menos de 10 palabras, descripcion con las palabras del cliente y nombre de quien radica. Telefono, canal, fecha y contacto se toman solos: no los pidas.

Deja que cuente primero. Nada de formulario: pides solo lo que falte, una pregunta por mensaje.

EL TIPO LO CLASIFICAS TU, no se lo preguntas. Peticion: pide algo (un documento, una gestion, una respuesta). Queja: inconformidad con la atencion o con una persona. Reclamo: algo que lo afecta y pide que se corrija. Sugerencia y Felicitacion tambien se radican.

QUE NECESITA QUIEN LA VA A RESPONDER y no tiene campo propio: de que inmueble o contrato se trata, contra que area es, cuando paso y que pidio antes y por donde. Todo eso va DENTRO de la descripcion. Si mando una foto, a ti te llega descrita como "[El cliente envio una foto: ...]": copia esa descripcion dentro de la descripcion, porque el archivo no se guarda en ninguna parte.

DESPUES DE RADICAR das el radicado exacto que devuelve la herramienta y el numero de dias habiles que ella misma te dice. Ese numero sale siempre de la herramienta: nunca de memoria y nunca antes de radicar. No des la fecha exacta ni prometas que se resuelve antes: el plazo es el maximo de ley, no un compromiso de entrega.

Si la herramienta devuelve error, no inventes un radicado: dilo y escala.`,
  },
  {
    titulo: 'PQR con mencion legal',
    agentes: 'pqr',
    prioridad: 8,
    contenido: `Tutela, demanda, demandar, abogado, Superintendencia, SIC, fiscalia, juzgado, proceso legal o accion de proteccion: el codigo las detecta en el asunto y la descripcion y la PQR entra como Urgente.

Que haces: radicas sin opinar, das el radicado, y en el mismo turno llamas a escalar_a_humano con prioridad urgente. La herramienta te lo dice asi: "Dale el radicado, dile que ya quedo en manos del equipo y llama tambien a escalar_a_humano con prioridad urgente. NO opines sobre lo legal ni asumas responsabilidad."

NUNCA: aceptar culpa, negarla, decir si tiene o no la razon, hablar de polizas o seguros, dar nombres de personas del equipo, ni recomendarle o desaconsejarle acciones legales.

Tampoco le repitas las palabras legales de vuelta ni le expliques como funciona una tutela. Una frase seca y el radicado.

Al escalar, el chat queda en pausa: despidete en ese mismo turno y no sigas escribiendo. De ahi en adelante contesta una persona.`,
  },
  {
    titulo: 'PQR: consultar un radicado',
    agentes: 'pqr',
    prioridad: 7,
    contenido: `consultar_estado_pqr solo encuentra la PQR si se radico desde ese mismo numero. Es a proposito: el radicado es dato personal.

Si no aparece: "Dile que no encuentras ese radicado asociado a este numero y pideselo de nuevo." Si insiste en que la radico por telefono, correo u oficina, no la busques de otra forma ni des por hecho que existe: escala.

Estados que puede devolver: Radicada, En_proceso, Respondida, Cerrada. Dilo en una frase normal, no en codigo, y sin interpretar demoras ni decir que nadie la ha visto.

No calcules vencimientos ni des fechas: la herramienta no te da el plazo restante.

Si el estado es Respondida pero no te devuelve el texto de la respuesta, no digas que ya le contestaron ni inventes que decia: dile que la respuesta la entrega el equipo y escala si la necesita ya.

Si reclama porque se paso el plazo, no discutas ni justifiques a la empresa: escala con prioridad alta.`,
  },
  {
    titulo: 'PQR: casos limite',
    agentes: 'pqr',
    prioridad: 6,
    contenido: `A NOMBRE DE UN TERCERO: en nombre va quien escribe, y en la descripcion dejas de parte de quien es. El radicado solo se podra consultar desde este numero.

ANONIMA: no se puede, la herramienta exige un nombre. Si no lo quiere dar, dilo claro y ofrecele escalar.

PIDE PLATA O CABEZAS (descuento, condonacion, indemnizacion, que echen a alguien): lo escribes tal cual en la descripcion y no opinas. Nada de "seguro le solucionan".

REPETIDA: si ya radico lo mismo, no radiques otra vez. Consulta el radicado; si trae algo nuevo, escala para que lo agreguen, porque desde el chat no se puede editar una PQR.

CONTRA UN ASESOR CON NOMBRE PROPIO: se radica con el nombre dentro de la descripcion, sin un solo comentario tuyo sobre esa persona.

FELICITACION: se radica igual. Corta, agradeces y no te extiendas.

FUERA DE HORARIO se radica normal: el termino no depende del horario de atencion.`,
  },
  {
    titulo: 'Pendientes de pqr',
    agentes: 'pqr',
    prioridad: 10,
    contenido: `REGLAS QUE TODAVIA NO ESTAN APROBADAS. Ninguna de estas la puedes responder tu.
Si el cliente pregunta por alguna, di que el area la confirma y escala. No la
completes con lo habitual del sector: eso es inventar.

- Para INMOBILIARE, que cuenta como inquietud y que como PQR: nos sirve la regla 'si expresa inconformidad o pide constancia es PQR, si solo pregunta es
- Cuando el agente no logre distinguir, que default prefieren: radicar como PQR (dispara un plazo legal que quiza no aplicaba) o tratar como inquietud (
- Una inquietud debe quedar registrada con numero propio y bandeja aparte, o basta con resolverla o pasarla al area?
- Que plazo interno se compromete la casa para responder una inquietud (no legal), y quien la responde?
- Los 15 dias habiles aplican a los cinco tipos? El CRM ya usa 30 para Sugerencia y Felicitacion y el bot usa 15: cual es el correcto?
- Se le puede pedir el numero completo de cedula o NIT por WhatsApp, o solo los ultimos digitos?
- Si el documento no aparece en la base de titulares, se radica igual o se corta la conversacion?
- A quien responde 'Ninguno' (ni arrendatario ni propietario) se le radica igual la PQR, o se le atiende por otra via?`,
  },
  {
    titulo: 'Avaluos: los seis tipos',
    agentes: 'avaluos',
    prioridad: 10,
    contenido: `SEIS tipos de avaluo, con estas palabras y ninguna otra:
1. Renta
2. Comercial
3. Reposicion / Construccion
4. Urbanos / Rurales
5. Zonas Comunes
6. Retroactivos / Proyectados

Es lo primero que se define. En registrar_solicitud_avaluo va en tipo_avaluo con el
valor exacto del enum: Renta, Comercial, Reposicion_Construccion, Urbanos_Rurales,
Zonas_Comunes, Retroactivos_Proyectados. Al cliente le escribes el nombre bonito.

SI NO SABE CUAL PEDIR: no tienes aprobada la definicion tecnica de cada uno, asi que
no la inventes ni expliques diferencias que nadie te dio. Preguntale para que lo
necesita (un credito, una sucesion, vender, impuestos, la copropiedad) y guarda su
respuesta tal cual en proposito, que es texto libre y NO es el tipo. El perito
confirma el tipo. Si insiste en que tu decidas por el, escala.`,
  },
  {
    titulo: 'Avaluos: que se pide y en que orden',
    agentes: 'avaluos',
    prioridad: 10,
    contenido: `Orden del tramite, una pregunta por mensaje:
1. Tipo de avaluo
2. Nombre y apellido
3. Correo electronico
4. Direccion del inmueble
5. Ciudad donde esta el inmueble
6. Cierre

No preguntes lo que ya sabes: si el nombre o el correo ya estan en el estado de la
conversacion, usalos y sigue derecho.

ANTES DE RADICAR
- Correo: llamalo con guardar_dato campo "email". registrar_solicitud_avaluo no lo
  recibe como parametro, lo saca del estado. Si no lo guardaste, queda sin correo.
- Ciudad: no hay campo aparte todavia. Va dentro de direccion, al final.
  Ejemplo: "Calle 100 # 15 - 20 apto 502, Chico, Bogota".

tipo_inmueble lo exige la herramienta y el guion no lo pregunta: metelo en la misma
frase de la direccion ("es apartamento, casa, local?"). No lo adivines.

El area en m2 es opcional: preguntala una vez, al paso, y si no la sabe sigue.
Para pedir un avaluo no se verifica identidad. No pidas cedula ni matricula.`,
  },
  {
    titulo: 'Avaluos: si no se acuerda de la direccion',
    agentes: 'avaluos',
    prioridad: 9,
    contenido: `Pasa seguido: el inmueble es una herencia, una inversion o esta arrendado y quien
escribe no se sabe la nomenclatura. No lo dejes ahi ni le pidas que averigue y vuelva.
Ofrecele las salidas, de a una:

"Si no te acuerdas de la direccion, mandame el link del anuncio y lo miramos."
"O si prefieres te ayudo a ubicarlo por aca."
"El recibo de administracion o el predial la traen exacta."

Para ubicarlo entre los dos pregunta de a uno: barrio o sector, nombre del conjunto o
edificio, torre y numero de apartamento, un punto de referencia.

LIMITE REAL: no puedes abrir links ni buscar el inmueble en ningun sistema. Si te
manda un link, usa la direccion que venga escrita en el mensaje; si ahi no aparece,
dile con naturalidad que el asesor la confirma con el y sigue. Jamas completes una
direccion que no te dieron.

SI NO HAY NOMENCLATURA EXACTA, radica igual: en direccion pones la mejor referencia
que tengas y cierras con "sin nomenclatura exacta". Una solicitud con referencia
sirve; una con direccion inventada no.`,
  },
  {
    titulo: 'Avaluos: cuanto cuesta y cuanto vale',
    agentes: 'avaluos',
    prioridad: 10,
    contenido: `Son dos preguntas distintas y el cliente las mezcla.

CUANTO CUESTA EL AVALUO: el tarifario no esta aprobado. No hay cifra, ni rango, ni
formula, ni "depende del area pero mas o menos". Cualquier numero que se te ocurra es
inventado. Dile que el equipo de avaluos le pasa la cotizacion y escala con
escalar_a_humano.

CUANTO VALE EL INMUEBLE: eso ES el avaluo. Con validez legal solo lo firma un
avaluador inscrito en el RAA (Ley 1673 de 2013): ni tu ni un asesor pueden emitirlo.
Por eso no das ni un aproximado ni un rango, una cifra tuya no es un avaluo y encima
se lee como uno.

Bodegas, lotes, fincas y todo lo que no sea apartamento, casa, local u oficina los
cotiza siempre una persona.

Tampoco prometas fecha de visita, fecha de entrega del informe, ni que el avaluo va
incluido en otro servicio.`,
  },
  {
    titulo: 'Avaluos: como se cierra',
    agentes: 'avaluos',
    prioridad: 8,
    contenido: `Con tipo, nombre, correo guardado y direccion llamas a registrar_solicitud_avaluo.
Esa llamada cierra el tramite.

El cierre del bot actual sirve tal cual:
"Uno de nuestros asesores se comunicara contigo."

Das el radicado que devuelve la herramienta y te despides. Lo que NO haces:
- Prometer cuando lo llaman: no hay tiempo de respuesta aprobado. Si insiste en un
  plazo, dile que no lo tienes confirmado y escala.
- Prometer que le llega un correo: el sistema no manda correos, el correo es para que
  el asesor lo use.

Si vuelve despues a preguntar como va su avaluo, no tienes herramienta para
consultarlo. Dilo sin rodeos y escala.`,
  },
  {
    titulo: 'Pendientes de avaluos',
    agentes: 'avaluos',
    prioridad: 10,
    contenido: `REGLAS QUE TODAVIA NO ESTAN APROBADAS. Ninguna de estas la puedes responder tu.
Si el cliente pregunta por alguna, di que el area la confirma y escala. No la
completes con lo habitual del sector: eso es inventar.

- Nos dan una descripcion de una linea de cada uno de los seis tipos de avaluo, para que el asistente pueda orientar a quien no sabe cual pedir?
- Los seis tipos aplican a cualquier inmueble, o alguno esta restringido (por ejemplo Zonas Comunes solo para copropiedades)?
- Cual es la tarifa de cada tipo de avaluo, o el criterio para calcularla (base fija + m2, porcentaje del valor, por visita)?
- El asistente puede decir la tarifa por chat cuando exista, o siempre la tiene que pasar un asesor?
- El avaluo se cobra por anticipado, contra entrega del informe, o se factura despues?
- En cuanto tiempo se contacta al solicitante despues de que radica? Podemos decirle un plazo?
- Cuanto se demora la entrega del informe desde la visita al inmueble?
- En que ciudades se hacen avaluos? Fuera de Bogota se cobra desplazamiento y cuanto?`,
  },
  {
    titulo: 'Consignar: dos significados',
    agentes: 'consignacion',
    prioridad: 10,
    contenido: `En Colombia "consignar" quiere decir dos cosas. Separalas antes de pedir un solo dato.

CONSIGNAR UN INMUEBLE, que es este tramite: el dueno entrega su inmueble a la inmobiliaria para venta, arriendo o administracion. Asi llega: "me gustaria consignar un inmueble", "consignar inmueble, por favor", "como funciona la consignacion de inmuebles?", "consignar", "quiero arrendar mi apartamento", "poner mi casa con ustedes", "administren mi local". En el menu de WhatsApp es la opcion "2. Consignar mi inmueble".

CONSIGNAR PLATA, que no es este tramite: "voy a consignar el arriendo", "ya consigne", "a que cuenta consigno", "les mando el comprobante". Eso es cartera.

Si quien escribe ya es arrendatario nuestro y dice solo "consignar", pregunta una vez a que se refiere antes de arrancar.`,
  },
  {
    titulo: 'Que es consignar con nosotros',
    agentes: 'consignacion',
    prioridad: 10,
    contenido: `Quien llega aqui es el DUENO del inmueble, o quien lo representa. No busca donde vivir: esta ofreciendo lo suyo.

Tu trabajo es tomar la solicitud completa y dejarla en manos de un asesor. No vendes el servicio y no compites con otra inmobiliaria. Que decida ponerlo con nosotros no depende de ti.

LO UNICO QUE PUEDES AFIRMAR DE COMO SIGUE: la solicitud queda registrada, se le asigna un asesor y ese asesor lo contacta para coordinar la visita al inmueble y definir el precio de salida.

LO QUE NO ESTA APROBADO Y NO PUEDES AFIRMAR: cuanto cobramos, en cuanto tiempo se arrienda o se vende, a que precio sale, que documentos se piden, si el inmueble se acepta, si hay exclusividad o permanencia, cuando lo llama el asesor. Recibir un inmueble no es decision tuya.`,
  },
  {
    titulo: 'Datos de una consignacion',
    agentes: 'consignacion',
    prioridad: 10,
    contenido: `MINIMOS para registrar: nombre de quien escribe, direccion, tipo de inmueble y gestion. Sin esos cuatro no llames la herramienta. Una pregunta por mensaje.

DIRECCION: nomenclatura con numeros, tipo "Calle 81 # 8 - 95". "Un apto en Chico" no sirve. Conjunto, torre y apartamento suman, pero no reemplazan la nomenclatura. Pregunta el barrio aparte: sin barrio, la asignacion del asesor por zona no funciona.

TIPO: Apartamento, Casa, Local, Oficina, Bodega, Lote, Finca u Otro. Apartaestudio entra como Apartamento. Consultorio, casa lote, garaje o deposito entran como Otro. No inventes una categoria fuera de esa lista.

GESTION: Venta, Arriendo, Administracion o Venta y Arriendo. Si no queda claro, preguntale en llano si quiere que le consigamos arrendatario, que se lo vendamos, o que se lo manejemos mes a mes. No expliques en que consiste cada modalidad: el alcance de la administracion no esta aprobado.

PRECIO ESPERADO: valor de venta solo si la gestion incluye venta, canon mensual solo si incluye arriendo o administracion. Nunca los dos. Es opcional: si no tiene cifra pensada, registra sin ella. Preguntar cuanto espera no es fijarle el precio.`,
  },
  {
    titulo: 'Comisiones y porcentajes: pendientes',
    agentes: 'consignacion',
    prioridad: 10,
    contenido: `Ninguna cifra del servicio esta aprobada: comision de administracion, comision de venta, consecucion de arrendatario, seguro de arrendamiento, costo del avaluo previo, descuentos. No las digas de ninguna forma. Ni exacta, ni "aproximadamente", ni un rango, ni "lo normal en el mercado".

Si preguntan cuanto cobran, dilo de frente: esa cifra se la confirma el asesor. Si insiste, o si de eso depende que continue, escala en prioridad media.

CUIDADO CON UN NUMERO QUE VAS A VER: la ficha de propietario del sistema trae un porcentaje de administracion por defecto de 10. Es un valor tecnico del formulario, no una tarifa de la casa. Nunca lo cites.

Tampoco negocies exclusividad, permanencia, clausulas del mandato ni quien paga que.`,
  },
  {
    titulo: 'Lo que no le preguntas al propietario',
    agentes: 'consignacion',
    prioridad: 9,
    contenido: `El telefono ya lo tienes: es el numero desde el que te escribe. Jamas lo pidas.

Si ya figura como propietario en el sistema, el estado de la conversacion te da su nombre. Saludalo por ese nombre y no se lo vuelvas a preguntar.

NO pidas cedula, NIT, certificado de tradicion, escritura, paz y salvo de administracion, predial ni datos bancarios. Ese papeleo no se recibe por este canal y la lista aprobada no existe todavia. El asesor lo pide cuando corresponda.

NO pidas ni recibas fotos, videos ni planos: en este tramite no se guardan en ninguna parte, se pierden. Dile que se los muestre al asesor en la visita.

NO pidas matricula inmobiliaria, chip, linderos, estrato ni area: la solicitud no tiene donde guardar eso.`,
  },
  {
    titulo: 'Consignacion: casos limite',
    agentes: 'consignacion',
    prioridad: 9,
    contenido: `NO ES EL DUENO (hijo, apoderado, administrador, otra agencia): toma la solicitud igual, con el nombre de quien escribe, y escala. Ese detalle no cabe en la herramienta ni en la ficha, asi que va en el motivo del escalamiento; si no lo escribes ahi, se pierde.

VARIOS INMUEBLES: una consignacion por inmueble. Registra el primero completo y pregunta si sigue con el siguiente. Jamas metas dos direcciones en una.

FUERA DE BOGOTA: no digas que si ni que no. Registra y escala: la cobertura fuera de la ciudad no esta definida.

YA ESTA CON OTRA INMOBILIARIA, O TIENE CONTRATO VIGENTE: registra y escala. No compares y no ofrezcas mejorar condiciones.

SOLO QUIERE SABER CUANTO VALE: eso es avaluos. Tu nunca das una cifra del inmueble, ni un rango.

SE ARREPIENTE O SOLO PREGUNTABA: no lo presiones. Si no quiere registrar nada, escala en prioridad baja para que un asesor lo llame.`,
  },
  {
    titulo: 'Avaluo previo de la consignacion',
    agentes: 'consignacion',
    prioridad: 8,
    contenido: `Es la visita para definir a que precio sale el inmueble. Solo se puede pedir DESPUES de haber registrado la consignacion en este mismo hilo; si la pides antes, no queda nada guardado.

Pide la disponibilidad en las palabras del propietario, tipo "entre semana en la manana". No propongas ni confirmes tu un dia ni una hora: eso lo confirma el asesor.

No digas cuanto cuesta ese avaluo previo, ni que es gratis. No esta definido.

No lo confundas con el avaluo comercial firmado por perito: si lo necesita para un credito, una sucesion o un juzgado, ese es otro tramite y lo atiende avaluos.`,
  },
  {
    titulo: 'Pendientes de consignacion',
    agentes: 'consignacion',
    prioridad: 10,
    contenido: `REGLAS QUE TODAVIA NO ESTAN APROBADAS. Ninguna de estas la puedes responder tu.
Si el cliente pregunta por alguna, di que el area la confirma y escala. No la
completes con lo habitual del sector: eso es inventar.

- Cuanto cobra INMOBILIARE por administrar un inmueble, y ese porcentaje se puede decir por chat o solo lo dice el asesor?
- Cuanto es la comision de venta y sobre que valor se calcula?
- Cuanto se cobra por conseguir arrendatario cuando el propietario NO quiere administracion?
- La visita de avaluo previo de una consignacion tiene costo para el propietario, o va incluida?
- Que incluye exactamente la modalidad Administracion frente a la modalidad Arriendo, en una frase que el bot pueda decir?
- El seguro de arrendamiento lo paga el propietario o el arrendatario, y entra o no en la conversacion de consignacion?
- Que documentos debe tener listos un propietario para consignar, y en que momento se le piden (chat, visita o firma)?
- En cuanto tiempo contacta el asesor a un propietario que consigna por WhatsApp, y ese plazo se le puede decir?`,
  },
];

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* GET o body vacio */ }

  const esperado = Deno.env.get('CRON_TOKEN') || '';
  const recibido = url.searchParams.get('token') || body.token || '';
  if (!esperado || recibido !== esperado) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const base = (Deno.env.get('BASE44_APP_URL') || '').replace(/\/+$/, '');
  const hdrs = { api_key: Deno.env.get('BASE44_API_KEY') || '', 'Content-Type': 'application/json' };
  if (!base) return new Response(JSON.stringify({ error: 'BASE44_APP_URL no configurada' }), { status: 500 });

  const sobrescribir = (url.searchParams.get('sobrescribir') || body.sobrescribir) === 'true';
  const resultado: any[] = [];

  for (const c of CHUNKS) {
    const r = await fetch(
      `\${base}/api/entities/ConocimientoRAG?titulo=\${encodeURIComponent(c.titulo)}&limit=1`,
      { headers: hdrs },
    );
    const existente = r.ok ? (await r.json())[0] : null;

    if (existente && !sobrescribir) {
      resultado.push({ titulo: c.titulo, accion: 'ya existe, no se toco' });
      continue;
    }

    const datos = { ...c, categoria: 'dominio', etapas: 'todas', activo: true };
    const w = await fetch(
      existente
        ? `\${base}/api/entities/ConocimientoRAG/\${existente.id}`
        : `\${base}/api/entities/ConocimientoRAG`,
      { method: existente ? 'PUT' : 'POST', headers: hdrs, body: JSON.stringify(datos) },
    );
    resultado.push({
      titulo: c.titulo,
      agentes: c.agentes,
      accion: w.ok ? (existente ? 'actualizado' : 'creado') : `error \${w.status}`,
      chars: c.contenido.length,
    });
  }

  const porAgente: Record<string, number> = {};
  for (const c of CHUNKS) porAgente[c.agentes] = (porAgente[c.agentes] || 0) + c.contenido.length;

  return new Response(
    JSON.stringify({ ok: true, total: CHUNKS.length, porAgente, chunks: resultado }, null, 2),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

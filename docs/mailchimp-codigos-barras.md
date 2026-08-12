# Mailchimp: lo que se comprobó contra la cuenta real

Notas de una sonda corrida contra la cuenta de INMOBILIARE (datacenter `us17`)
el 12 de agosto de 2026. Todo lo de aquí está **verificado con llamadas
reales**, no leído en la documentación. Varias cosas contradicen lo que la
documentación da a entender, así que conviene no “corregirlas” sin volver a
medir.

## Lo que funciona

**El File Manager acepta PDFs.** Era la pregunta que podía tumbar el diseño: la
herramienta está pensada para imágenes. Sube bien, devuelve `full_size_url` y
sirve el archivo con `Content-Type: application/pdf`.

**Mailchimp no re-codifica el archivo.** El `sha256` de los bytes subidos y el
del archivo descargado desde `full_size_url` coinciden. Por eso la verificación
de ida y vuelta sirve: prueba, byte a byte, que la URL que va en el correo de un
inquilino sirve exactamente su recibo.

**La asignación a carpeta sí funciona al subir.** El `file_count` que devuelve
`GET /file-manager/folders` es correcto y refleja los archivos subidos con
`folder_id`.

## Lo que NO funciona

**`GET /file-manager/files?folder_id=X` ignora el filtro.** Devuelve los 29.690
archivos de la cuenta entera, y cada archivo reporta `folder_id: 0`. Se probaron
cuatro variantes y un barrido de 6.000 archivos: cero coincidencias con la
carpeta pedida.

Consecuencia de diseño: **no se le puede preguntar a Mailchimp qué hay dentro de
una carpeta.** La idempotencia y la auditoría salen de la entidad
`CodigoBarras`, que es nuestro libro mayor. El `file_count` de la carpeta se usa
solo como control de totales.

**Al colisionar un nombre, Mailchimp renombra.** Subir dos veces
`90_Son9999.01.pdf` deja el segundo como `90_Son9999.01.01.pdf`, con otra URL.
De ahí la regla del código: **la URL sale siempre del `full_size_url` de la
respuesta, nunca se reconstruye desde el nombre.** Comprobado, no supuesto.

## Cómo está montado hoy

**Una audiencia nueva cada mes.** Hay 12 audiencias, entre ellas
`CODIGOS DE BARRA AGOSTO 2026` (584), `CODIGOS DE BARRAS JULIO 2026` (578),
`CODIGOS DE BARRA JUNIO 2026` (600), `CÓDIGOS DE BARRA- MAYO 2026` (596).

**Los merge fields de esas audiencias son solo dos**, y hay que respetarlos o se
rompe la plantilla del correo que ya usan:

| Tag | Contenido |
|---|---|
| `*|FNAME|*` | nombre completo del inquilino (“Roncancio Mejia Julio Rodolfo”) |
| `*|PDF|*` | la URL del código de barras en Mailchimp |

No es `CODURL`: es **`PDF`**.

**Las carpetas del File Manager van por mes** (22 en total): `Agosto 2026` (592
archivos), `Julio 2026` (588), `Junio 2026` (610)… El espaciado es
inconsistente (`Octubre2025`, `Noviembre2025`), así que el código busca por
nombre normalizado —sin espacios ni acentos— para no crear una carpeta duplicada
al lado de la que el equipo abre a mano.

## El costo de la audiencia mensual

Agosto: 584 suscritos, **6 `cleaned`**, 0 desuscritos.
Julio: 578 suscritos, **7 `cleaned`**, 2 desuscritos.

`cleaned` son direcciones que rebotaron duro al enviar. O sea: **cada mes entre
6 y 9 inquilinos no reciben su código de barras, y nadie se entera**, porque el
rebote se descubre después del envío y en una audiencia nueva no hay historia
que consultar antes.

Con una audiencia permanente esa lista se conoce **antes** de enviar
(`GET /lists/{id}/members?status=cleaned`), y esos inquilinos se pueden atender
por otro canal en vez de darlos por notificados. Es, además, la razón por la que
recrear la audiencia cada mes vuelve a escribirle a direcciones que ya se sabía
que rebotaban.

## Cómo repetir la medición

Las sondas viven fuera del repo (traen la API key por variable de entorno). El
modo `sonda` de `base44/functions/codigosMensuales/entry.ts` hace la
comprobación equivalente desde el backend y devuelve booleanos, nunca fragmentos
de la clave.

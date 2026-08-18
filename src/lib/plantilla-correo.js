/**
 * Plantilla del correo mensual con el codigo de barras.
 *
 * Va en tablas y con estilos en linea porque los clientes de correo —Outlook
 * sobre todo— ignoran las hojas de estilo y buena parte de flex y grid. Lo que
 * aqui parece anticuado es lo unico que se ve igual en Gmail, Outlook y el
 * telefono.
 *
 * Los merge tags son los que la oficina YA usa en sus audiencias, medidos
 * contra la cuenta real: *|FNAME|* y *|PDF|*. Inventar otros romperia la
 * continuidad con las campanas de meses anteriores.
 */

const MARCA = '#5400CF';
const TINTA = '#14101F';
const GRIS = '#5c5566';
const BORDE = '#e6e1f0';

/** Un bloque con el boton al recibo. `tag` es PDF, PDF2, PDF3... */
function bloqueRecibo(tag, etiqueta) {
  return `
              <tr>
                <td style="padding:0 0 12px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                         style="border:1px solid ${BORDE};border-radius:10px;">
                    <tr>
                      <td style="padding:18px 20px;">
                        ${etiqueta ? `<p style="margin:0 0 10px;font:600 12px/1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${GRIS};">${etiqueta}</p>` : ''}
                        <a href="*|${tag}|*"
                           style="display:inline-block;background:${MARCA};color:#ffffff;text-decoration:none;
                                  font:600 15px/1 Arial,sans-serif;padding:14px 26px;border-radius:8px;">
                          Ver mi código de barras
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>`;
}

/**
 * Construye el HTML del correo.
 *
 * @param periodo  AAAA-MM, solo para el texto
 * @param tags     etiquetas de recibo a incluir. Uno solo en la campana masiva;
 *                 varios en la de quienes tienen mas de un inmueble.
 */
export function plantillaCorreo({ periodo = '', tags = ['PDF'] } = {}) {
  const [anio, mes] = String(periodo).split('-');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = MESES[Number(mes) - 1] || '';
  const cuando = nombreMes ? `${nombreMes} de ${anio}` : 'este mes';

  const varios = tags.length > 1;
  const bloques = tags
    .map((t, i) => bloqueRecibo(t, varios ? `Inmueble ${i + 1}` : ''))
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f4fa;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f4fa;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
               style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">

          <tr><td style="height:4px;background:${MARCA};font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr>
            <td style="padding:32px 28px 8px;">
              <p style="margin:0 0 18px;font:600 12px/1 Arial,sans-serif;letter-spacing:.1em;
                        text-transform:uppercase;color:${MARCA};">Inmobiliare Julio Corredor</p>
              <h1 style="margin:0 0 14px;font:400 24px/1.25 Georgia,serif;color:${TINTA};">
                Tu código de pago de ${cuando}
              </h1>
              <p style="margin:0 0 6px;font:400 15px/1.6 Arial,sans-serif;color:${GRIS};">
                Hola *|FNAME|*,
              </p>
              <p style="margin:0 0 22px;font:400 15px/1.6 Arial,sans-serif;color:${GRIS};">
                ${varios
    ? 'Estos son los códigos de barras de tus inmuebles. Cada botón abre el recibo que corresponde a uno, así que revisa la etiqueta antes de pagar.'
    : 'Ya está disponible tu código de barras. Puedes pagarlo en el banco o en cualquier corresponsal presentando el recibo desde tu celular.'}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${bloques}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 28px 30px;">
              <p style="margin:0;font:400 13px/1.6 Arial,sans-serif;color:${GRIS};">
                Si ya realizaste el pago, puedes ignorar este mensaje. Si tienes cualquier duda,
                responde a este correo y te ayudamos.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px;border-top:1px solid ${BORDE};">
              <p style="margin:0;font:400 12px/1.5 Arial,sans-serif;color:#8b8397;">
                Inmobiliare Julio Corredor · Bogotá, Colombia<br>
                Recibes este correo porque tienes un contrato de arrendamiento con nosotros.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

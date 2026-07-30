// Publicar en Instagram y/o Facebook via Meta Graph API
export default async function publishSocialPost(
  { campana_id, propiedad_id, plataformas, caption, imagen_url }: {
    campana_id?: string;
    propiedad_id: string;
    plataformas: string[];
    caption: string;
    imagen_url?: string;
  },
  context: any
) {
  const envVars = context.env;
  const accessToken = envVars?.META_ACCESS_TOKEN;
  const igAccountId = envVars?.INSTAGRAM_ACCOUNT_ID;
  const fbPageId = envVars?.FACEBOOK_PAGE_ID;

  if (!accessToken) {
    throw new Error('Meta API no configurado. Configura META_ACCESS_TOKEN en variables de entorno.');
  }

  const propiedad = await context.entities.Propiedad.findOne({ id: propiedad_id });
  const imageUrl = imagen_url || propiedad?.foto_principal_url || propiedad?.fotos_urls?.[0];

  if (!imageUrl) {
    throw new Error('La propiedad no tiene fotos para publicar.');
  }

  const postIds: Record<string, string> = {};

  // Publicar en Instagram
  if (plataformas.includes('instagram') && igAccountId) {
    // Paso 1: crear contenedor de media
    const mediaRes = await fetch(
      `https://graph.facebook.com/v19.0/${igAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: imageUrl,
          caption,
          access_token: accessToken,
        }),
      }
    );
    const mediaData = await mediaRes.json();
    if (!mediaRes.ok) throw new Error(mediaData.error?.message || 'Error al crear media de Instagram');

    // Paso 2: publicar el contenedor
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${igAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: mediaData.id, access_token: accessToken }),
      }
    );
    const publishData = await publishRes.json();
    if (publishRes.ok) {
      postIds.instagram = publishData.id;
    }
  }

  // Publicar en Facebook Page
  if (plataformas.includes('facebook') && fbPageId) {
    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${fbPageId}/photos`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrl, caption, access_token: accessToken }),
      }
    );
    const fbData = await fbRes.json();
    if (fbRes.ok) {
      postIds.facebook = fbData.post_id || fbData.id;
    }
  }

  // Actualizar propiedad con estado de publicación
  const updateData: Record<string, boolean> = {};
  if (postIds.instagram) updateData.publicado_instagram = true;
  if (postIds.facebook) updateData.publicado_facebook = true;
  if (Object.keys(updateData).length > 0) {
    await context.entities.Propiedad.update({ where: { id: propiedad_id }, data: updateData });
  }

  // Actualizar campaña si existe
  if (campana_id) {
    await context.entities.CampanaSocial.update({
      where: { id: campana_id },
      data: {
        estado: 'Publicado',
        fecha_publicado: new Date().toISOString(),
        post_id_instagram: postIds.instagram || null,
        post_id_facebook: postIds.facebook || null,
      },
    });
  }

  return { post_ids: postIds };
}
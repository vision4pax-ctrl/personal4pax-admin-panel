// Personal4Pax — Modalidad demo (migración 0116)
// Enlaces de demostración de un solo uso, con duración limitada:
//   · Demo inicial  → 4 minutos  (primer contacto)
//   · Demo ampliada → 15 minutos (prospecto interesado)
//
// Acciones (POST JSON { accion, ... }):
//   generar            { clave, modalidad }   → par de enlaces Administración + Elena
//   canjear            { token }              → credenciales de un solo uso para entrar
//   acceso-trabajador  { trabajador_id }      → enlace para una persona creada DURANTE la demo
//                                               (llamada con la sesión del administrador demo)
//   preparar           { clave }              → crea (una vez) el administrador demo y el acceso de Elena
//   caducar            {}                     → bloquea accesos terminados y borra lo creado en demos acabadas
//                                               (idempotente e inofensivo: lo llama pg_cron cada 5 minutos)
//
// Secretos de la función: DEMO_CLAVE_GENERADOR, ADMIN_APP_URL, TRABAJADOR_APP_URL.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const MINUTOS: Record<string, number> = { inicial: 4, ampliada: 15 };
const BLOQUEO = '87600h'; // 10 años: el acceso se reabre solo al canjear un enlace nuevo

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function tokenAleatorio(bytes = 32): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(texto: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('');
}

function igualSeguro(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function crearEnlace(db: ReturnType<typeof admin>, fila: Record<string, unknown>): Promise<string> {
  const token = tokenAleatorio();
  const { error } = await db.from('demo_enlaces').insert({ ...fila, token_hash: await sha256(token) });
  if (error) throw new Error('No se pudo guardar el enlace: ' + error.message);
  return token;
}

function urlConToken(base: string, token: string) {
  return `${base.replace(/#.*$/, '')}#demo=${token}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'Petición no válida' }, 400); }
  const db = admin();

  try {
    // --------------------------------------------------------------- preparar
    if (body.accion === 'preparar') {
      if (!igualSeguro(String(body.clave || ''), Deno.env.get('DEMO_CLAVE_GENERADOR') || '')) return json({ error: 'Clave incorrecta' }, 401);
      const { data: cfg } = await db.from('demo_config').select('*').eq('id', 1).maybeSingle();
      if (!cfg) return json({ error: 'Aplica antes la migración 0116 (tabla demo_config)' }, 500);
      const cambios: Record<string, string> = {};

      // Administrador demo dedicado: así las cuentas reales de los hoteles demo no se bloquean nunca.
      if (!cfg.admin_user_id) {
        const { data: nuevo, error } = await db.auth.admin.createUser({
          email: 'demo.direccion@personal4pax.com', password: tokenAleatorio(18), email_confirm: true, ban_duration: BLOQUEO,
        });
        if (error || !nuevo?.user) return json({ error: 'No se pudo crear el administrador demo: ' + (error?.message || '') }, 500);
        const { error: eU } = await db.from('usuarios').insert({ id: nuevo.user.id, hotel_id: cfg.hotel_id, nombre: 'Dirección (demo)', rol: 'rrhh_direccion' });
        if (eU) return json({ error: 'No se pudo crear el perfil del administrador demo: ' + eU.message }, 500);
        cambios.admin_user_id = nuevo.user.id;
      }

      // Acceso de Elena: su ficha no tenía cuenta. Se crea con un correo propio de la demo, sin enviar nada.
      if (!cfg.trabajador_user_id) {
        const { data: nueva, error } = await db.auth.admin.createUser({
          email: 'demo.elena@personal4pax.com', password: tokenAleatorio(18), email_confirm: true, ban_duration: BLOQUEO,
        });
        if (error || !nueva?.user) return json({ error: 'No se pudo crear el acceso de Elena: ' + (error?.message || '') }, 500);
        const { error: eP } = await db.from('personas_trabajadoras').update({ user_id: nueva.user.id }).eq('id', cfg.trabajador_id).is('user_id', null);
        if (eP) return json({ error: 'No se pudo enlazar el acceso con la ficha de Elena: ' + eP.message }, 500);
        cambios.trabajador_user_id = nueva.user.id;
      }

      if (Object.keys(cambios).length) await db.from('demo_config').update(cambios).eq('id', 1);
      return json({ ok: true, creados: Object.keys(cambios) });
    }

    // ---------------------------------------------------------------- generar
    if (body.accion === 'generar') {
      const clave = String(body.clave || '');
      if (!igualSeguro(clave, Deno.env.get('DEMO_CLAVE_GENERADOR') || '')) return json({ error: 'Clave incorrecta' }, 401);
      const modalidad = String(body.modalidad || 'inicial');
      const minutos = MINUTOS[modalidad];
      if (!minutos) return json({ error: 'Modalidad no válida' }, 400);

      const { data: cfg, error: errCfg } = await db.from('demo_config').select('*').eq('id', 1).maybeSingle();
      if (errCfg || !cfg) return json({ error: 'Falta la configuración de la demo (tabla demo_config)' }, 500);
      if (!cfg.admin_user_id || !cfg.trabajador_user_id) return json({ error: 'Demo sin preparar: pulsa antes «Preparar demo» en esta página.' }, 409);

      const abrirAntes = new Date(Date.now() + minutos * 60_000).toISOString();
      const lote = crypto.randomUUID();
      const comun = { lote, modalidad, minutos, abrir_antes_de: abrirAntes, hotel_id: cfg.hotel_id };
      const tAdmin = await crearEnlace(db, { ...comun, rol: 'admin', user_id: cfg.admin_user_id });
      const tTrab = await crearEnlace(db, { ...comun, rol: 'trabajador', user_id: cfg.trabajador_user_id });

      return json({
        modalidad,
        minutos,
        abrir_antes_de: abrirAntes,
        enlace_admin: urlConToken(Deno.env.get('ADMIN_APP_URL') || '', tAdmin),
        enlace_trabajador: urlConToken(Deno.env.get('TRABAJADOR_APP_URL') || '', tTrab),
      });
    }

    // ---------------------------------------------------------------- canjear
    if (body.accion === 'canjear') {
      const token = String(body.token || '');
      if (token.length < 20) return json({ error: 'Enlace no válido' }, 400);
      const ahora = new Date();
      const { data: enlace } = await db.from('demo_enlaces').select('*').eq('token_hash', await sha256(token)).maybeSingle();
      if (!enlace) return json({ error: 'Enlace no válido' }, 404);
      if (enlace.usado_en) return json({ error: 'Este enlace ya se ha utilizado. Pide uno nuevo.' }, 410);
      if (new Date(enlace.abrir_antes_de) < ahora) return json({ error: 'Este enlace ha caducado. Pide uno nuevo.' }, 410);

      const expira = new Date(ahora.getTime() + enlace.minutos * 60_000).toISOString();
      // Marcado atómico: si dos personas abren el mismo enlace a la vez, solo entra la primera.
      const { data: marcado } = await db.from('demo_enlaces')
        .update({ usado_en: ahora.toISOString(), expira_en: expira })
        .eq('id', enlace.id).is('usado_en', null).select('id').maybeSingle();
      if (!marcado) return json({ error: 'Este enlace ya se ha utilizado. Pide uno nuevo.' }, 410);

      // Clave nueva de un solo uso y desbloqueo del acceso (se vuelve a bloquear al caducar).
      const clave = tokenAleatorio(18);
      const { data: u, error: errU } = await db.auth.admin.updateUserById(enlace.user_id, { password: clave, ban_duration: 'none' });
      if (errU || !u?.user?.email) return json({ error: 'No se pudo preparar el acceso de demostración' }, 500);

      return json({ rol: enlace.rol, email: u.user.email, password: clave, expira_en: expira, modalidad: enlace.modalidad });
    }

    // ------------------------------------------------------ acceso-trabajador
    if (body.accion === 'acceso-trabajador') {
      const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: quien } = await db.auth.getUser(jwt);
      if (!quien?.user) return json({ error: 'Sesión no válida' }, 401);

      // Solo el administrador demo, con una sesión de demostración activa.
      const { data: sesion } = await db.from('demo_enlaces').select('*')
        .eq('user_id', quien.user.id).eq('rol', 'admin').gt('expira_en', new Date().toISOString())
        .order('expira_en', { ascending: false }).limit(1).maybeSingle();
      if (!sesion) return json({ error: 'Solo disponible durante una demostración activa' }, 403);

      const { data: p } = await db.from('personas_trabajadoras').select('id, user_id, hotel_id, created_at')
        .eq('id', String(body.trabajador_id || '')).maybeSingle();
      if (!p || p.hotel_id !== sesion.hotel_id) return json({ error: 'Persona no encontrada en el hotel de demostración' }, 404);
      if (new Date(p.created_at) < new Date(sesion.usado_en)) {
        return json({ error: 'En la demo solo se puede abrir la app de personas creadas durante esta demostración (o la de Elena con su enlace).' }, 403);
      }
      if (!p.user_id) return json({ error: 'Esta persona aún no tiene acceso: pulsa «Crear acceso a la app» en su ficha.' }, 409);

      const token = await crearEnlace(db, {
        lote: sesion.lote, modalidad: sesion.modalidad, minutos: sesion.minutos, hotel_id: sesion.hotel_id,
        rol: 'trabajador', user_id: p.user_id, creado_en_demo: true,
        // Se puede abrir mientras dure la demo; su sesión termina a la vez que la del administrador.
        abrir_antes_de: sesion.expira_en,
      });
      return json({ enlace_trabajador: urlConToken(Deno.env.get('TRABAJADOR_APP_URL') || '', token), expira_en: sesion.expira_en });
    }

    // ---------------------------------------------------------------- caducar
    if (body.accion === 'caducar') {
      const ahora = new Date().toISOString();
      const { data: vencidas } = await db.from('demo_enlaces').select('id, user_id')
        .lt('expira_en', ahora).is('acceso_bloqueado_en', null);
      let bloqueados = 0;
      for (const v of vencidas || []) {
        // No se bloquea a quien tenga OTRA demo en curso con el mismo usuario (p. ej. Elena en dos demos a la vez).
        const { count } = await db.from('demo_enlaces').select('id', { count: 'exact', head: true })
          .eq('user_id', v.user_id).gt('expira_en', ahora);
        if (!count) {
          await db.auth.admin.updateUserById(v.user_id, { password: tokenAleatorio(18), ban_duration: BLOQUEO });
          bloqueados++;
        }
        await db.from('demo_enlaces').update({ acceso_bloqueado_en: ahora }).eq('id', v.id);
      }
      // Borra lo creado durante las demos ya terminadas (como service_role, que es quien puede
      // saltarse el bloqueo de borrado de registros laborales) y después las cuentas creadas en ellas.
      const { data: limpieza, error: eL } = await db.rpc('demo_limpiar');
      if (eL) return json({ error: 'Limpieza: ' + eL.message, bloqueados }, 500);
      const cuentas: string[] = (limpieza && limpieza.cuentas_a_borrar) || [];
      for (const uid of cuentas) await db.auth.admin.deleteUser(uid);
      return json({ revisadas: (vencidas || []).length, bloqueados, limpieza, cuentas_borradas: cuentas.length });
    }

    return json({ error: 'Acción no válida' }, 400);
  } catch (e) {
    console.error('demo-acceso', e);
    return json({ error: 'Error interno de la demo' }, 500);
  }
});

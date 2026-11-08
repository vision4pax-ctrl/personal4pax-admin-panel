// ---------- Personal4Pax — Panel de Administración / RR.HH. (Fase 3, Lote 1) ----------
// Web app de escritorio, sin build (vanilla JS + supabase-js UMD) — abre index.html directamente.

const SUPABASE_URL = 'https://uybljgcimvnfbgumucwo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ndBnIFRxI4TB5YYJiBxdXQ_o_qVnb-i';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function $(id) {
  return document.getElementById(id);
}

function mostrarToast(msg, ok) {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast ' + (ok === false ? 'error' : 'ok');
  el.classList.remove('hidden');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

const BADGE_ESTADO = {
  aprobada: 'b-emerald', pendiente: 'b-amber', rechazada: 'b-rose',
  abierta: 'b-amber', resuelta: 'b-emerald', activo: 'b-emerald',
  trabajando: 'b-emerald', pausa: 'b-amber', teletrabajo: 'b-indigo', ausente: 'b-rose',
  finalizada: 'b-slate', no_fichado: 'b-slate',
  firmado: 'b-sky', rrhh: 'b-amber', gestoria: 'b-emerald', aprobado: 'b-emerald',
  // Circuito de Vigilancia de la Salud / Formación PRL (migración 0068)
  'propuesta pendiente': 'b-slate', 'solicitud enviada a la mutua': 'b-amber', 'enviada a prevenlia': 'b-amber',
  'cita confirmada': 'b-indigo', 'firma pendiente': 'b-indigo', 'cita aprobada': 'b-sky', 'realizada': 'b-emerald',
  // Devoluciones de EPI — 3er estado (migración 0084)
  'enviado_gestoria': 'b-emerald',
  // Entrega inicial de uniformidad y EPI al alta (f18), reenviada a la tienda colaboradora
  'enviado_proveedor': 'b-emerald'
};
function badgeEstado(estado) {
  const key = (estado || '').toLowerCase();
  return `<span class="badge2 ${BADGE_ESTADO[key] || 'b-slate'}">${estado || '—'}</span>`;
}

function iniciales(nombre) {
  return (nombre || '—')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

// ---------- Sesión ----------
let usuarioActual = null; // { id, hotel_id, nombre, rol }
let hotelActual = null;

// César: "cuando tú estás trabajando con un programa de esto, como mínimo la sesión debe quedar
// abierta 30 minutos. Y luego darte un aviso, tu sesión está a punto de cerrarse, para que tú
// canceles [...] si no respondes, que se cierre [...] en la tablet lo acabamos de probar, hemos
// refrescado la sesión y no [...]" — el token de Supabase ya dura 1h por defecto (> 30 min), pero
// supabase-js solo lo renueva solo con un temporizador en segundo plano que un navegador de tablet
// puede pausar al poner la pestaña en segundo plano durante la entrevista; eso deja el token
// caducado SIN avisar hasta que falla un guardado (lo que ya se probó y seguía fallando). Esto
// vigila la caducidad cada minuto Y justo al volver a la pestaña (visibilitychange — el caso real
// de la tablet) y renueva en segundo plano ANTES de que caduque; solo si ese refresco falla se
// muestra el aviso en pantalla, cancelable, con cierre automático a los 2 minutos si no se
// responde — salvo que la Entrevista estructurada esté abierta, para no arriesgarse a perder lo ya
// puntuado: en ese caso se sigue reintentando en vez de cerrar la sesión.
let _vigilanciaSesionInterval = null;
let _avisoCierreSesionTimeout = null;
function iniciarVigilanciaSesion() {
  if (_vigilanciaSesionInterval) clearInterval(_vigilanciaSesionInterval);
  _vigilanciaSesionInterval = setInterval(comprobarCaducidadSesion, 60 * 1000);
  if (!window.__vigilanciaSesionVisibilidadRegistrada) {
    window.__vigilanciaSesionVisibilidadRegistrada = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && usuarioActual) comprobarCaducidadSesion();
    });
  }
}
function detenerVigilanciaSesion() {
  if (_vigilanciaSesionInterval) clearInterval(_vigilanciaSesionInterval);
  _vigilanciaSesionInterval = null;
  ocultarAvisoCierreSesion();
}
async function comprobarCaducidadSesion() {
  const { data } = await sb.auth.getSession();
  if (!data || !data.session) return;
  const msRestantes = data.session.expires_at * 1000 - Date.now();
  if (msRestantes < 5 * 60 * 1000) {
    const { error } = await sb.auth.refreshSession();
    if (error) {
      mostrarAvisoCierreSesion();
      return;
    }
  }
  ocultarAvisoCierreSesion();
}
function mostrarAvisoCierreSesion() {
  if (!$('avisoCierreSesion')) {
    const el = document.createElement('div');
    el.id = 'avisoCierreSesion';
    el.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;max-width:340px;background:#fff;border:2px solid #dc2626;border-radius:12px;padding:14px 16px;box-shadow:0 8px 24px rgba(0,0,0,.18);font-size:13px;';
    el.innerHTML = `
      <p style="margin:0 0 8px;font-weight:800;color:#dc2626;">⚠️ Tu sesión está a punto de cerrarse</p>
      <p style="margin:0 0 10px;">No se ha podido renovar sola (sin conexión u otro problema). Si no respondes en 2 minutos, se cerrará por seguridad.</p>
      <button type="button" class="btn btn-sm" style="width:100%;" id="btnSeguirConectado">Seguir conectado</button>`;
    document.body.appendChild(el);
    $('btnSeguirConectado').addEventListener('click', async () => {
      $('btnSeguirConectado').disabled = true;
      $('btnSeguirConectado').textContent = 'Reconectando…';
      const { error } = await sb.auth.refreshSession();
      if (!error) {
        ocultarAvisoCierreSesion();
        mostrarToast('Sesión renovada ✓ puedes continuar.', true);
      } else {
        $('btnSeguirConectado').disabled = false;
        $('btnSeguirConectado').textContent = 'Reintentar';
        mostrarToast('Seguimos sin poder renovar la sesión — comprueba tu conexión a internet.', false);
      }
    });
  }
  _programarCierreSesionPorInactividad();
}
function _programarCierreSesionPorInactividad() {
  clearTimeout(_avisoCierreSesionTimeout);
  _avisoCierreSesionTimeout = setTimeout(async () => {
    const entrevistaAbierta = $('modalEntrevistaApp') && !$('modalEntrevistaApp').classList.contains('hidden');
    if (entrevistaAbierta) {
      mostrarToast('Seguimos sin poder renovar la sesión, pero no la cerramos mientras tengas la Entrevista estructurada abierta — guarda el borrador en cuanto puedas.', false);
      _programarCierreSesionPorInactividad();
      return;
    }
    ocultarAvisoCierreSesion();
    await logout();
    mostrarToast('Tu sesión se ha cerrado por seguridad al no responder al aviso. Vuelve a entrar.', false);
  }, 2 * 60 * 1000);
}
function ocultarAvisoCierreSesion() {
  clearTimeout(_avisoCierreSesionTimeout);
  const el = $('avisoCierreSesion');
  if (el) el.remove();
}

async function login(e) {
  e.preventDefault();
  $('loginError').classList.add('hidden');
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    $('loginError').textContent = 'No se pudo entrar: ' + error.message;
    $('loginError').classList.remove('hidden');
    return;
  }
  const { data: usr, error: errUsr } = await sb.from('usuarios').select('*').eq('id', data.user.id).maybeSingle();
  if (errUsr || !usr) {
    $('loginError').textContent = 'Esta cuenta no tiene perfil de administración (tabla usuarios).';
    $('loginError').classList.remove('hidden');
    await sb.auth.signOut();
    return;
  }
  usuarioActual = usr;
  const { data: hotel } = await sb.from('hoteles').select('*').eq('id', usr.hotel_id).maybeSingle();
  hotelActual = hotel;
  $('sbHotelNombre').textContent = hotel ? hotel.nombre : '—';
  $('sbNombre').textContent = usr.nombre;
  $('sbRol').textContent = usr.rol === 'rrhh_direccion' ? 'RR.HH. / Dirección' : 'Jefe de Departamento';
  $('sbAvatar').textContent = iniciales(usr.nombre);
  $('viewLogin').classList.add('hidden');
  $('viewApp').classList.add('active');
  await cargarTodo();
  iniciarVigilanciaSesion();
}

async function logout() {
  detenerVigilanciaSesion();
  await sb.auth.signOut();
  usuarioActual = null;
  $('viewApp').classList.remove('active');
  $('viewLogin').classList.remove('hidden');
}

// ---------- Navegación ----------
const TITULOS_PANTALLA = {
  'admin-panel': ['Panel General', 'Resumen de la jornada en tiempo real'],
  'admin-mapa': ['Mapa de Módulos', 'Índice completo de la aplicación — busca cualquier pantalla por nombre o palabra clave'],
  'admin-aprobaciones': ['Aprobaciones', 'Bandeja de vacaciones e incidencias pendientes de validar'],
  'admin-empleados': ['Personas trabajadoras', 'Listado completo con acceso a la ficha individual de cada una'],
  'admin-cuadrantes': ['Cuadrantes', 'Vista mensual por persona trabajadora'],
  'admin-incidencias-nomina': ['Incidencias de Nómina', 'Libro de horas extra, cambios de turno, días libres trabajados, absentismo y plus personal — periodos de 20 a 20, informe para Dirección'],
  'admin-incidencias': ['Incidencias', 'Conversación directa por incidencia con cada persona trabajadora'],
  'admin-chat': ['Chat de Incidencias', 'El mismo hilo que ve la persona trabajadora en «Chat con RR.HH.»'],
  'admin-vacaciones': ['Vacaciones', 'Gestión de solicitudes de todo el equipo'],
  'admin-ausencias': ['Ausencias y permisos', 'Permisos cortos y bajas médicas de todo el equipo'],
  'admin-formularios': ['Formularios y Firma Digital', 'Trámites firmados por personas trabajadoras'],
  'admin-organigrama': ['Organigrama', 'Estructura de departamentos y responsables'],
  'admin-descripciones-puesto': ['Descripción de puesto de trabajo', 'Uso exclusivo de RR.HH./Admin — un documento por puesto, enviable a firma'],
  'admin-uniformidad': ['Uniformidad y EPIs', 'Catálogo por puesto, entregas firmadas y devoluciones'],
  'admin-formacion': ['Formación', '6 cursos en catálogo · coste y horas por curso'],
  'formacion-interna': ['Formación Interna', 'Expediente Formativo — Plan de Excelencia (6 bloques, 22 módulos) + Bloque T'],
  'matriz-cumplimiento-formacion': ['Matriz de Cumplimiento Formativo', 'Vista consolidada y filtrable de todos los registros, con semáforo de cumplimiento'],
  'panel-direccion-formacion': ['Panel de Dirección — Formación', 'KPIs de cumplimiento formativo, desglose por departamento y Cierre Mensual'],
  'admin-compliance': ['Compliance normativo', 'Checklist de obligaciones de la empresa'],
  'admin-manual': ['Manual de Empresa', 'Prevención de Riesgos Laborales, formación y vigilancia de la salud'],
  'admin-normativa': ['Asistente Normativo', 'Mismo contenido que consulta la persona trabajadora — solo lectura'],
  'admin-vigilancia-salud': ['Vigilancia de la Salud', 'Matriz de control para inspección de trabajo — nunca contenido médico'],
  'admin-formacion-prl': ['Formación PRL', 'Circuito con Prevenlia — propuesta, firma, aprobación y realización'],
  'admin-coordinacion': ['Coordinación Empresarial', 'Empresas, centros de trabajo y personas trabajadoras vinculadas'],
  'admin-accidentes': ['Accidentes de Trabajo', 'Parte de Accidente de Trabajo · Informe de Investigación'],
  'admin-sugerencias': ['Buzón de Sugerencias', 'Canal de propuestas de mejora a RR.HH.'],
  'admin-denuncias': ['Canal de Denuncias', 'Sistema Interno de Información (Ley 2/2023)'],
  'admin-disciplina': ['Disciplina', 'Catálogo de faltas, formularios disciplinarios y expedientes'],
  'admin-auditoria': ['Auditoría', 'Trazabilidad de acciones en módulos sensibles'],
  'admin-candidaturas': ['Formulario del Candidato', 'Circuito de candidaturas, entrevista y alta automática de ficha'],
  'admin-llamamientos': ['Llamamientos', 'Llamamiento y fin de llamamiento de personal fijo discontinuo — escalafón, preaviso, firma y envío a gestoría'],
  'admin-informes': ['Informes', 'Coste de cobertura, rotación y bajas'],
  'admin-panel-direccion': ['Panel de Dirección', 'KPIs globales de empresa y costes de procesos RR.HH.'],
  'admin-comunidad': ['Comunidad', 'Muro de comunicados, bienvenidas y moderación'],
  'admin-ficha': ['Ficha de la persona trabajadora', 'Datos, cuadrante, formularios y costes asociados'],
  'admin-empresa-ficha': ['Ficha de empresa', 'Centros, documentación, cumplimiento y auditorías'],
  'vista-trabajador-ficha': ['Mi Ficha', 'Persona trabajadora · datos propios, cuadrante, formularios y todo lo relacionado con tu perfil — privado'],
  'vista-trabajador-jornada': ['Mi Jornada', 'Persona trabajadora · estado de fichaje de hoy y accesos directos a vacaciones, ausencias e incidencias'],
  'vista-trabajador-organigrama': ['Organigrama', 'Persona trabajadora · consulta (solo lectura) de la estructura de departamentos y responsables'],
  'vista-trabajador-cuadrante': ['Mi Cuadrante', 'Persona trabajadora · vista mensual de tus propios turnos'],
  'vista-trabajador-vacaciones': ['Mis Vacaciones', 'Persona trabajadora · solicitudes de vacaciones y su estado'],
  'vista-trabajador-ausencias': ['Mis Ausencias', 'Persona trabajadora · permisos, ausencias y bajas médicas'],
  'vista-trabajador-incidencias': ['Mis Incidencias', 'Persona trabajadora · historial de incidencias reportadas o levantadas'],
  'vista-trabajador-chat': ['Chat con RR.HH.', 'Persona trabajadora · mismo hilo de conversación que ve RR.HH. por cada incidencia'],
  'vista-trabajador-formularios': ['Mis Formularios', 'Persona trabajadora · trámites con firma digital, incluida la solicitud de formación'],
  'vista-trabajador-epi': ['Mi Uniformidad y EPIs', 'Persona trabajadora · prendas y EPI asignados, con conformidad de entrega firmada'],
  'vista-trabajador-formacion': ['Mi Formación', 'Persona trabajadora · cursos asignados y solicitud de formación con ROI y desarrollo profesional'],
  'vista-trabajador-formacion-interna': ['Formación Interna — Expediente Formativo', 'Persona trabajadora · tu Plan de Excelencia y Bloque T'],
  'vista-trabajador-documentos': ['Mis Documentos', 'Persona trabajadora · nóminas, contrato y documentación'],
  'vista-trabajador-sugerencias': ['Buzón de Sugerencias', 'Persona trabajadora · envía propuestas de mejora directamente a RR.HH.'],
  'vista-trabajador-denuncias': ['Canal de Denuncias', 'Persona trabajadora · comunica de forma confidencial o anónima una irregularidad'],
  'vista-trabajador-comunidad': ['Comunidad', 'Persona trabajadora · espacio social del equipo']
};

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = $('screen-' + id);
  if (target) target.classList.add('active');
  document.querySelectorAll('.sb-item').forEach((b) => b.classList.toggle('active', b.dataset.screen === id));
  const titulo = TITULOS_PANTALLA[id];
  if (titulo) {
    $('pgTitle').textContent = titulo[0];
    $('pgSubtitle').textContent = titulo[1];
  }
  if (VISTA_TRABAJADOR_RENDER[id]) {
    sincronizarSelectoresVistaTrabajador();
    VISTA_TRABAJADOR_RENDER[id]();
  }
}

// ---------- Vista de la persona trabajadora (preview de admin/RR.HH., por persona seleccionada) ----------
// Las 10 pantallas del grupo "🪪 Vista de la persona trabajadora" (Mapa del Prototipo) NO
// reconstruyen la app móvil independiente de la persona trabajadora (personalia-app-trabajador-src,
// ya existe y es donde ocurre la interacción real: fichar, firmar, iniciar formación…). Esto es
// un PREVIEW de solo lectura dentro del panel de RR.HH./Admin, para que quien gestiona pueda ver
// exactamente qué vería una persona concreta — reutilizando los datos ya cargados por el resto del
// panel (empleadosCache, cuadranteCache, sugerenciasCache, denunciasCache, etc.), filtrados a
// trabajador_id, en vez de repetir consultas a Supabase que ya se han hecho. Mismo patrón que el
// selector de "Formación Interna" (expedienteFormativoEmpleadoId / cambiarEmpleadoExpediente).
let vistaTrabajadorId = null;

// Incluye TODOS los estados (Activo, Baja IT, Baja voluntaria, Excedencia) — no solo Activo:
// esto es un registro de control y seguimiento, también debe poder consultarse la vista de
// alguien de baja en cualquier momento, no solo mientras está en activo (petición de César).
function vistaTrabajadorOrdenados() {
  return [...empleadosCache].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function vistaTrabajadorActivarPorDefecto() {
  if (vistaTrabajadorId && empleadosCache.some((p) => p.id === vistaTrabajadorId)) return;
  const todos = vistaTrabajadorOrdenados();
  const activos = todos.filter((p) => (p.estado_laboral || 'Activo') === 'Activo');
  vistaTrabajadorId = activos.length ? activos[0].id : todos.length ? todos[0].id : null;
}

function vistaTrabajadorSelectorHTML(idSelect) {
  vistaTrabajadorActivarPorDefecto();
  const todos = vistaTrabajadorOrdenados();
  const activos = todos.filter((p) => (p.estado_laboral || 'Activo') === 'Activo');
  const resto = todos.filter((p) => (p.estado_laboral || 'Activo') !== 'Activo');
  const opcion = (p) => `<option value="${p.id}" ${p.id === vistaTrabajadorId ? 'selected' : ''}>${p.nombre} — ${p.puesto || p.departamento || ''}${p.estado_laboral && p.estado_laboral !== 'Activo' ? ' (' + p.estado_laboral + ')' : ''}</option>`;
  return `<div class="card card-pad" style="margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <span style="font-size:11px;font-weight:700;color:var(--slate-500);">🪪 Previsualizando como</span>
    <select class="form-select vista-trabajador-selector" id="${idSelect}" style="margin:0;max-width:300px;" onchange="cambiarVistaTrabajador(this.value)">
      <optgroup label="Activos">${activos.map(opcion).join('')}</optgroup>
      ${resto.length ? `<optgroup label="Baja / Excedencia">${resto.map(opcion).join('')}</optgroup>` : ''}
    </select>
    <span class="sub-c">Vista de solo lectura — las acciones reales (fichar, firmar, iniciar formación…) se realizan desde la app móvil de la persona trabajadora.</span>
  </div>`;
}

function sincronizarSelectoresVistaTrabajador() {
  document.querySelectorAll('.vista-trabajador-selector').forEach((sel) => {
    if (sel.value !== vistaTrabajadorId) sel.value = vistaTrabajadorId || '';
  });
}

function cambiarVistaTrabajador(id) {
  vistaTrabajadorId = id;
  sincronizarSelectoresVistaTrabajador();
  const activa = document.querySelector('.screen.active');
  const key = activa ? activa.id.replace('screen-', '') : null;
  if (key && VISTA_TRABAJADOR_RENDER[key]) VISTA_TRABAJADOR_RENDER[key]();
}

function vistaTrabajadorActual() {
  vistaTrabajadorActivarPorDefecto();
  return empleadosCache.find((p) => p.id === vistaTrabajadorId) || null;
}

// ---- 🪪 Mi Ficha ----
function renderVistaTrabajadorFicha() {
  $('vtFichaSelector').innerHTML = vistaTrabajadorSelectorHTML('vtFichaSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  $('vtFichaAvatar').textContent = iniciales(t.nombre);
  $('vtFichaNombre').textContent = t.nombre || '—';
  $('vtFichaPuestoLinea').textContent = [t.puesto, t.departamento, t.centros_trabajo ? t.centros_trabajo.nombre : null].filter(Boolean).join(' · ') || '—';
  const estBadge = $('vtFichaEstadoBadge');
  estBadge.textContent = t.estado_laboral || '—';
  estBadge.className = 'badge2 ' + (BADGE_ESTADO[(t.estado_laboral || '').toLowerCase()] || 'b-emerald');
  const filasDatos = [
    ['Código', t.codigo],
    ['Email', t.email],
    ['Rol', t.rol_puesto],
    ['Fecha de incorporación', t.fecha_incorporacion ? fechaCorta(t.fecha_incorporacion) : null],
    ['Supervisor/a', t.supervisor_nombre],
    ['DNI/NIE', t.dni_nie],
    ['Fecha de nacimiento', t.fecha_nacimiento ? fechaCorta(t.fecha_nacimiento) : null],
    ['Nº Seguridad Social', t.seguridad_social],
    ['Dirección', t.direccion]
  ];
  $('vtFichaDatos').innerHTML = filasDatos.map(([label, val]) => `<tr><td class="sub-c">${label}</td><td>${val || '—'}</td></tr>`).join('');
  const filasContacto = [
    ['Persona de contacto', t.contacto_emergencia_nombre],
    ['Parentesco o relación', t.contacto_emergencia_parentesco],
    ['Teléfono de contacto', t.contacto_emergencia_telefono]
  ];
  $('vtFichaContacto').innerHTML = filasContacto.map(([label, val]) => `<tr><td class="sub-c">${label}</td><td>${val || '—'}</td></tr>`).join('');
  const fichajeHoy = empleadosFichajesHoyCache.find((f) => f.trabajador_id === t.id);
  $('vtFichaFichajeHoy').textContent = fichajeHoy
    ? `Entrada: ${fichajeHoy.hora_entrada || '—'} · Salida: ${fichajeHoy.hora_salida || '—'} · Estado: ${fichajeHoy.estado || '—'}`
    : 'Sin fichaje registrado hoy.';
}

// ---- 👋 Mi Jornada (inicio) ----
function renderVistaTrabajadorJornada() {
  $('vtJornadaSelector').innerHTML = vistaTrabajadorSelectorHTML('vtJornadaSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  const fichajeHoy = empleadosFichajesHoyCache.find((f) => f.trabajador_id === t.id);
  $('vtJornadaFichaje').textContent = fichajeHoy
    ? `Entrada: ${fichajeHoy.hora_entrada || '—'} · Salida: ${fichajeHoy.hora_salida || '—'} · Estado: ${fichajeHoy.estado || '—'}`
    : 'Sin fichaje registrado hoy.';
  const diasAprobados = vacacionesTodasCache.filter((v) => v.trabajador_id === t.id && v.estado === 'aprobada').reduce((s, v) => s + (Number(v.dias) || 0), 0);
  $('vtJornadaVacDisponibles').textContent = `${diasAprobados} día(s)`;
  const ausPendientes = ausenciasTodasCache.filter((a) => a.trabajador_id === t.id && a.estado === 'pendiente').length;
  $('vtJornadaAusPendientes').textContent = ausPendientes;
  const incAbiertas = incidenciasAdminCache.filter((i) => i.trabajador_id === t.id && i.estado !== 'resuelta').length;
  $('vtJornadaIncAbiertas').textContent = incAbiertas;
}

// ---- 🌴 Mis Vacaciones ----
function renderVistaTrabajadorVacaciones() {
  $('vtVacacionesSelector').innerHTML = vistaTrabajadorSelectorHTML('vtVacacionesSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  const propias = vacacionesTodasCache.filter((v) => v.trabajador_id === t.id);
  const aprobadas = propias.filter((v) => v.estado === 'aprobada');
  const diasAprobados = aprobadas.reduce((s, v) => s + (Number(v.dias) || 0), 0);
  const pendientes = propias.filter((v) => v.estado === 'pendiente').length;
  $('vtVacacionesKpis').innerHTML = `
    <div class="card kpi"><div class="ic">🌴</div><div><div class="t">Solicitudes totales</div><div class="v">${propias.length}</div></div></div>
    <div class="card kpi"><div class="ic">✅</div><div><div class="t">Días aprobados</div><div class="v">${diasAprobados}</div></div></div>
    <div class="card kpi"><div class="ic">🕓</div><div><div class="t">Pendientes de resolución</div><div class="v">${pendientes}</div></div></div>`;
  $('vtVacacionesBody').innerHTML =
    propias
      .map((v) => `<tr><td>${fechaCorta(v.fecha_inicio)} → ${fechaCorta(v.fecha_fin)}</td><td>${v.dias}</td><td>${badgeEstado(v.estado)}</td><td>${v.acuse === 'confirmado' ? '✓ Confirmado' : v.acuse === 'pendiente' ? 'Pendiente' : '—'}</td></tr>`)
      .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin solicitudes de vacaciones todavía.</td></tr>';
}

// ---- 📄 Mis Ausencias ----
function renderVistaTrabajadorAusencias() {
  $('vtAusenciasSelector').innerHTML = vistaTrabajadorSelectorHTML('vtAusenciasSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  const propias = ausenciasTodasCache.filter((a) => a.trabajador_id === t.id);
  $('vtAusenciasBody').innerHTML =
    propias.map((a) => `<tr><td>${a.motivo}</td><td>${a.fechas}</td><td>${badgeEstado(a.estado)}</td></tr>`).join('') ||
    '<tr><td colspan="3" class="sub-c" style="text-align:center;padding:14px;">Sin solicitudes de ausencia todavía.</td></tr>';
  const misBajas = bajasTodasCache.filter((b) => b.trabajador_id === t.id);
  $('vtBajasBody').innerHTML =
    misBajas.map((b) => `<tr><td>${b.motivo}</td><td>${fechaCorta(b.fecha_inicio)}</td><td>${b.dias ?? '—'}</td><td>${b.fecha_alta ? fechaCorta(b.fecha_alta) : 'En curso'}</td></tr>`).join('') ||
    '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin bajas médicas registradas.</td></tr>';
}

// ---- ⚠ Mis Incidencias ----
function renderVistaTrabajadorIncidencias() {
  $('vtIncidenciasSelector').innerHTML = vistaTrabajadorSelectorHTML('vtIncidenciasSelectorSelect');
  const t = vistaTrabajadorActual();
  const el = $('vtIncidenciasLista');
  if (!t || !el) return;
  const propias = incidenciasAdminCache.filter((i) => i.trabajador_id === t.id);
  el.innerHTML =
    propias
      .map(
        (i) => `<div class="card card-pad" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
            <div>${badgeEstado(i.estado)}<p class="sub-c" style="margin:2px 0 0;">${badgeOrigenIncidencia(i.origen)}</p></div>
            <span class="sub-c">${new Date(i.created_at).toLocaleDateString('es-ES')}</span>
          </div>
          <p style="margin:8px 0 2px;font-weight:800;font-size:12.5px;text-transform:uppercase;">${i.tipo}</p>
          ${i.descripcion ? `<p class="sub-c" style="margin:0 0 8px;">${i.descripcion}</p>` : ''}
        </div>`
      )
      .join('') || '<p class="sub-c">Sin incidencias registradas para esta persona.</p>';
}

// ---- 💬 Chat con RR.HH. ----
function renderVistaTrabajadorChat() {
  $('vtChatSelector').innerHTML = vistaTrabajadorSelectorHTML('vtChatSelectorSelect');
  const t = vistaTrabajadorActual();
  const threadListEl = $('vtChatThreadList');
  const bubblesEl = $('vtChatBubbles');
  if (!t || !threadListEl || !bubblesEl) return;
  const propias = incidenciasAdminCache.filter((i) => i.trabajador_id === t.id);
  threadListEl.innerHTML =
    propias
      .map((i) => `<div class="row-item"><span class="sub-c">${i.tipo}</span>${badgeEstado(i.estado)}</div>`)
      .join('') || '<p class="sub-c">Sin conversaciones todavía.</p>';
  const todosMensajes = propias
    .flatMap((i) => (i.incidencia_mensajes || []).map((m) => ({ ...m, _tipo: i.tipo })))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  bubblesEl.innerHTML =
    todosMensajes
      .map((m) => `<div class="burbuja ${m.rol === 'admin' ? 'otra' : 'propia'}"><strong>${m.autor}</strong> (${m._tipo})${m.texto}<div style="margin-top:3px;font-size:10px;opacity:.7;">${fechaHoraCorta(m.created_at)}</div></div>`)
      .join('') || '<p class="sub-c">Sin mensajes todavía.</p>';
}

// ---- 📂 Mis Documentos ----
async function renderVistaTrabajadorDocumentos() {
  $('vtDocumentosSelector').innerHTML = vistaTrabajadorSelectorHTML('vtDocumentosSelectorSelect');
  const t = vistaTrabajadorActual();
  const body = $('vtDocumentosBody');
  if (!t || !body) return;
  // César (03/11/2026): "en la ficha del trabajador no debería haber su entrevista" — el documento
  // "Entrevista estructurada" que darAltaDesdeCanditado() archiva al dar de alta (104 criterios,
  // resultado, quién evaluó) es información de RR.HH./administración, no algo que la propia persona
  // trabajadora deba ver en su "Mis Documentos" (ni cuando entra ella misma ni cuando admin mira esta
  // misma pantalla). Sigue existiendo igual en la tabla "documentos" — se ve completo en el
  // expediente de la candidatura, en administración — solo se excluye de ESTA lista.
  const { data } = await sb.from('documentos').select('*').eq('trabajador_id', t.id).neq('tipo', 'entrevista_estructurada').order('fecha', { ascending: false });
  body.innerHTML =
    (data || [])
      .map(
        (d) =>
          `<tr><td>${d.nombre}${d.adjunto_url ? `<br><a href="#" data-ver-adjunto-doc-admin="${d.adjunto_url}" style="font-size:11px;">📎 Ver adjunto</a>` : ''}</td><td class="sub-c">${d.tipo}</td><td>${fechaCorta(d.fecha)}</td><td>${badgeEstado(d.estado)}</td></tr>`
      )
      .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin documentos registrados para esta persona.</td></tr>';
  body.querySelectorAll('[data-ver-adjunto-doc-admin]').forEach((a) =>
    a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const { data: signed, error } = await sb.storage.from('formularios-adjuntos').createSignedUrl(a.dataset.verAdjuntoDocAdmin, 3600);
      if (error) { mostrarToast('No se pudo abrir el adjunto: ' + error.message, false); return; }
      window.open(signed.signedUrl, '_blank');
    })
  );
}

// ---- 🏛 Organigrama (solo lectura) ----
function renderVistaTrabajadorOrganigrama() {
  $('vtOrganigramaSelector').innerHTML = vistaTrabajadorSelectorHTML('vtOrganigramaSelectorSelect');
  const t = vistaTrabajadorActual();
  const niveles = {};
  organigramaCache.forEach((n) => {
    (niveles[n.nivel] = niveles[n.nivel] || []).push(n);
  });
  $('vtOrganigramaBody').innerHTML =
    Object.keys(niveles)
      .sort((a, b) => a - b)
      .map((niv) =>
        niveles[niv]
          .map((n) => {
            const padre = organigramaCache.find((x) => x.id === n.reporta_a_id);
            const miembros = Array.isArray(n.miembros) ? n.miembros : [];
            const esSuDepto = t && t.departamento === n.dept;
            return `<div class="card card-pad"${esSuDepto ? ' style="border-color:var(--brand-600);"' : ''}>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div><b style="font-size:13px;">${n.dept}</b>${esSuDepto ? ' <span class="badge2 b-brand">Su departamento</span>' : ''}<p class="sub-c" style="margin:2px 0 0;">Nivel ${n.nivel}${padre ? ' · reporta a ' + padre.dept : ''}</p></div>
                <span class="badge2 b-brand">${n.responsable_nombre || 'Vacante'}</span>
              </div>
              ${miembros.length ? `<p class="sub-c" style="margin-top:8px;">👥 ${miembros.join(', ')}</p>` : ''}
            </div>`;
          })
          .join('')
      )
      .join('') || '<p class="sub-c">Sin departamentos todavía.</p>';
}

// ---- 📅 Mi Cuadrante (mismo mes/año que Cuadrantes admin) ----
function renderVistaTrabajadorCuadrante() {
  $('vtCuadranteSelector').innerHTML = vistaTrabajadorSelectorHTML('vtCuadranteSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t || !$('cuadMes') || !$('cuadMes').options.length) {
    $('vtCuadranteBody').innerHTML = '<tr><td class="sub-c">Abre primero «Cuadrantes» para cargar el mes.</td></tr>';
    return;
  }
  const mes = parseInt($('cuadMes').value, 10);
  const anio = parseInt($('cuadAnio').value, 10);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  $('vtCuadranteHeadRow').innerHTML = '<th>Semana</th>' + Array.from({ length: diasEnMes }, (_, i) => `<th>${i + 1}</th>`).join('');
  const celdas = Array.from({ length: diasEnMes }, (_, i) => {
    const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    const a = cuadranteCache.find((x) => x.trabajador_id === t.id && x.fecha === fecha);
    let texto = '';
    let cls = 'sh-empty';
    // César (06/11/2026, Incidencias de Nómina): "se tiene que reflejar en el cuadrante [...]
    // genera incidencia nómina [...] y luego el turno [...] como vacaciones que pone V, pero en
    // este caso tiene que poner genera incidencia nómina y el horario correspondiente" — convive
    // turno_id + estado_especial (migración 0116/0120): se comprueba ANTES que el caso normal de
    // turno, para no perder el aviso. César (parte 5, tras probar en producción): "todas las
    // incidencias que se crean[,] se tiene que actualizar el cuadrante para poder hacer un doble
    // check" — ya no es solo el aviso genérico de turno extra: CUALQUIER estado_especial puede
    // convivir con un turno ya asignado (p. ej. 'ausente' de un absentismo sobre un turno
    // convocado) y se muestra igual de prioritario.
    if (a && a.estado_especial && a.turnos_catalogo) {
      const esIncidenciaGenerica = a.estado_especial === 'incidencia_nomina';
      texto = esIncidenciaGenerica ? '💶' + (a.turnos_catalogo.codigo.split('-')[1] || '?').charAt(0) : _abreviaturaEstadoEspecial(a.estado_especial);
      cls = esIncidenciaGenerica ? 'sh-inom' : 'sh-d';
    } else if (a && a.turnos_catalogo) {
      texto = (a.turnos_catalogo.codigo.split('-')[1] || '?').charAt(0);
      cls = claseTurno(a.turnos_catalogo.codigo);
    } else if (a && a.estado_especial) {
      texto = _abreviaturaEstadoEspecial(a.estado_especial);
      cls = 'sh-d';
    }
    const tituloBase = a && a.estado_especial && a.turnos_catalogo
      ? (a.estado_especial === 'incidencia_nomina' ? `💶 Genera incidencia nómina — ${a.turnos_catalogo.nombre}` : `${NOMBRES_ESTADO_CUADRANTE[a.estado_especial] || a.estado_especial} — turno convocado: ${a.turnos_catalogo.nombre}`)
      : a && a.turnos_catalogo ? a.turnos_catalogo.nombre : a && a.estado_especial ? (NOMBRES_ESTADO_CUADRANTE[a.estado_especial] || a.estado_especial) : 'Sin asignar';
    const nInom = inomCountCache[`${t.id}|${fecha}`] || 0;
    const contador = nInom > 1 ? `<span class="shift-cell-count" title="${nInom} incidencias de nómina este día" onclick="abrirModalTurno('${t.id}','${fecha}')">${nInom}</span>` : '';
    return `<td><span class="shift-cell ${cls}" title="${tituloBase}${a && a.es_festivo ? ' · 🎉 Festivo trabajado' : ''}">${texto}${a && a.es_festivo ? '🎉' : ''}</span>${contador}</td>`;
  }).join('');
  $('vtCuadranteBody').innerHTML = `<tr><td><b>${MESES[mes]} ${anio}</b></td>${celdas}</tr>`;
  $('vtCuadranteLeyenda').textContent = '🟦 Mañana · 🟧 Tarde · 🟪 Noche · 🟣 Intermedio · 🟩 Partido · ⬜ Descanso/especial · 💶 Incidencia de nómina';
}

// ---- 📝 Mis Formularios ----
function renderVistaTrabajadorFormularios() {
  $('vtFormulariosSelector').innerHTML = vistaTrabajadorSelectorHTML('vtFormulariosSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  const propias = formulariosSolicitudesCache.filter((s) => s.trabajador_id === t.id);
  $('vtFormulariosBody').innerHTML =
    propias
      .map((s) => {
        const plantilla = formulariosPlantillasCache.find((p) => p.id === s.plantilla_id);
        return `<tr>
          <td>${plantilla ? plantilla.nombre : s.plantilla_id}</td>
          <td>${plantilla ? plantilla.bloque : '—'}</td>
          <td>${fechaCorta((s.fecha_solicitud || '').slice(0, 10))}</td>
          <td><span class="badge2 ${BADGE_ESTADO[s.estado] || 'b-slate'}">${STATUS_FORMULARIOS[s.estado] || s.estado}</span></td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Todavía no ha solicitado ningún trámite.</td></tr>';
  const porBloque = {};
  formulariosPlantillasCache.forEach((p) => {
    (porBloque[p.bloque] = porBloque[p.bloque] || []).push(p);
  });
  $('vtFormulariosCatalogo').innerHTML = Object.keys(porBloque)
    .map(
      (bloque) => `<div class="card card-pad"><b style="font-size:12px;">${BLOQUE_ICONOS[bloque] || '📝'} ${bloque}</b><p class="sub-c" style="margin:6px 0 0;">${porBloque[bloque].map((p) => p.nombre).join(', ')}</p></div>`
    )
    .join('');
  const discPropias = (discFormulariosFirmadosCache || []).filter((f) => f.expedientes_disciplinarios && f.expedientes_disciplinarios.trabajador_id === t.id);
  const vtDiscBody = $('vtDiscFormulariosBody');
  if (vtDiscBody) {
    vtDiscBody.innerHTML =
      discPropias
        .map((f) => {
          const exp = f.expedientes_disciplinarios;
          return `<tr><td>${f.formulario_nombre}</td><td>${exp ? fechaCorta(exp.fecha_hecho) : '—'}</td><td><span class="badge2 b-emerald">✔️ Firmado y archivado</span></td></tr>`;
        })
        .join('') || '<tr><td colspan="3" class="sub-c" style="text-align:center;padding:14px;">Sin comunicaciones disciplinarias.</td></tr>';
  }
}

// ---- 🥽 Mi Uniformidad y EPIs ----
async function renderVistaTrabajadorEpi() {
  $('vtEpiSelector').innerHTML = vistaTrabajadorSelectorHTML('vtEpiSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  const idPedido = t.id;
  const { data: entregas } = await sb.from('epi_entregas').select('*').eq('trabajador_id', idPedido).order('fecha_entrega', { ascending: false });
  if (!vistaTrabajadorId || vistaTrabajadorId !== idPedido) return; // la persona se cambió mientras cargaba
  const propias = entregas || [];
  const firmadas = propias.filter((e) => e.conformidad_firmada).length;
  const proximaRenovacion = propias.map((e) => e.proxima_renovacion).filter(Boolean).sort()[0];
  $('vtEpiKpis').innerHTML = `
    <div class="card kpi"><div class="ic">👕</div><div><div class="t">Dotaciones entregadas</div><div class="v">${firmadas}/${propias.length}</div></div></div>
    <div class="card kpi"><div class="ic">🗓</div><div><div class="t">Próxima renovación</div><div class="v">${proximaRenovacion ? fechaCorta(proximaRenovacion) : 'No programada'}</div></div></div>
    <div class="card kpi"><div class="ic">👔</div><div><div class="t">Catálogo de su puesto</div><div class="v">${epiCatalogoCache.filter((c) => c.puesto_key === t.puesto_key).length} art.</div></div></div>`;
  $('vtEpiBody').innerHTML =
    propias
      .map(
        (e) => `<tr>
          <td>${e.item}${e.talla ? ' — ' + e.talla : ''} <span class="badge2 ${BADGE_TIPO_EPI[e.tipo] || 'b-slate'}">${e.tipo || '—'}</span></td>
          <td>${e.cantidad}</td>
          <td>${fechaCorta(e.fecha_entrega)}</td>
          <td>${e.conformidad_firmada ? '<span class="badge2 b-emerald">Firmada ✓</span>' : '<span class="badge2 b-amber">Pendiente</span>'}</td>
        </tr>`
      )
      .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin artículos asignados todavía.</td></tr>';
}

// ---- 🎓 Mi Formación (cursos obligatorios + solicitud f16 con ROI) ----
function renderVistaTrabajadorFormacion() {
  $('vtFormacionSelector').innerHTML = vistaTrabajadorSelectorHTML('vtFormacionSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  $('vtFormacionCursosBody').innerHTML =
    formacionCursosCatalogoCache
      .map((c) => {
        const registro = formacionCursosRegistroCache.find((r) => r.trabajador_id === t.id && r.curso_id === c.id);
        const ind = formacionCursoEstadoIndicador(registro, c);
        return `<tr><td>${c.nombre}</td><td>${registro ? fechaCorta(registro.fecha_realizacion) : '—'}</td><td><span class="badge2 ${ind.cls}">${ind.label}</span></td></tr>`;
      })
      .join('') || '<tr><td colspan="3" class="sub-c" style="text-align:center;padding:14px;">Sin cursos en catálogo.</td></tr>';
  const solicitudes = formulariosSolicitudesCache.filter((s) => s.plantilla_id === 'f16' && s.trabajador_id === t.id);
  $('vtFormacionSolicitudes').innerHTML =
    solicitudes
      .map(
        (s) => `<div class="card card-pad" style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <b style="font-size:12px;">${fechaCorta((s.fecha_solicitud || '').slice(0, 10))}</b>
            <span class="badge2 ${BADGE_ESTADO[s.estado] || 'b-slate'}">${s.estado === 'aprobado' ? 'Formación aprobada por RR.HH.' : STATUS_FORMULARIOS[s.estado] || s.estado}</span>
          </div>
          ${s.fecha_programada ? `<p class="sub-c" style="margin:6px 0 0;">🗓️ Programada: ${new Date(s.fecha_programada).toLocaleString('es-ES')}</p>` : ''}
          ${s.detalle ? `<p class="sub-c" style="margin:6px 0 0;white-space:pre-line;">${s.detalle}</p>` : ''}
        </div>`
      )
      .join('') || '<p class="sub-c">Todavía no ha solicitado ninguna formación por iniciativa propia.</p>';
}

// ---- 🎬 Formación Interna — Expediente Formativo (solo lectura) ----
function renderVistaTrabajadorFormacionInterna() {
  $('vtFormacionInternaSelector').innerHTML = vistaTrabajadorSelectorHTML('vtFormacionInternaSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  const regs = formacionAsignacionesCache.filter((a) => a.trabajador_id === t.id);
  const excelencia = regs.filter((r) => r.bloque !== 'T' && !(r.codigo || '').startsWith('T'));
  const transversal = regs.filter((r) => r.bloque === 'T' || (r.codigo || '').startsWith('T'));
  const superadosExc = excelencia.filter((r) => r.estado === 'SUPERADO').length;
  const superadosT = transversal.filter((r) => r.estado === 'SUPERADO').length;
  $('vtFormacionInternaProgreso').innerHTML = `Plan de Excelencia: <b>${superadosExc}/${excelencia.length}</b> módulos superados &nbsp;·&nbsp; Bloque T: <b>${superadosT}/${transversal.length}</b> formaciones superadas`;
  function filaModulo(r) {
    const modulo = formacionCatalogoCache.find((m) => m.codigo === r.codigo);
    const sem = semaforoFormacionAsignacion(r);
    return `<div class="row-item" style="display:block;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
        <b style="font-size:12.5px;">${r.codigo} — ${r.titulo}</b>
        <div style="display:flex;gap:5px;flex-wrap:wrap;"><span class="badge2 ${sem.clase}">${sem.label}</span>${badgeFormacion(r.estado)}</div>
      </div>
      <p class="sub-c" style="margin:6px 0 4px;">${modulo ? modulo.objetivo : ''}</p>
      <p class="sub-c" style="margin:0;">📅 Asignado: ${fechaCorta(r.fecha_asignacion)} · Fecha límite: <b>${fechaCorta(r.fecha_limite)}</b>${r.teorica_nota != null ? ` · Nota teórica: <b>${r.teorica_nota}%</b>` : ''}${r.certificado_codigo ? ` · 🏅 Certificado ${r.certificado_codigo}` : ''}</p>
    </div>`;
  }
  $('vtFormacionInternaBody').innerHTML = `
    <div class="card card-pad" style="margin-bottom:14px;"><b style="font-size:12.5px;">Plan de Excelencia</b>${excelencia.map(filaModulo).join('') || '<p class="sub-c">Sin módulos asignados.</p>'}</div>
    <div class="card card-pad"><b style="font-size:12.5px;">Bloque T — transversal</b>${transversal.map(filaModulo).join('') || '<p class="sub-c">Sin formación transversal asignada.</p>'}</div>`;
}

// ---- 💡 Buzón de Sugerencias (propias — las confidenciales no se ven, trabajador_id es null de verdad) ----
function renderVistaTrabajadorSugerencias() {
  $('vtSugerenciasSelector').innerHTML = vistaTrabajadorSelectorHTML('vtSugerenciasSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  const propias = sugerenciasCache.filter((s) => s.trabajador_id === t.id);
  $('vtSugerenciasBody').innerHTML =
    propias
      .map((s) => {
        const est = SUGERENCIA_ESTADOS[s.estado] || ['—', 'b-slate'];
        return `<tr><td>${s.titulo}</td><td>${s.categoria || '—'}</td><td>${fechaCorta((s.created_at || '').slice(0, 10))}</td><td><span class="badge2 ${est[1]}">${est[0]}</span></td></tr>`;
      })
      .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin sugerencias enviadas.</td></tr>';
}

// ---- 🚨 Canal de Denuncias (propias, no anónimas — mismo criterio que la RLS real) ----
function renderVistaTrabajadorDenuncias() {
  $('vtDenunciasSelector').innerHTML = vistaTrabajadorSelectorHTML('vtDenunciasSelectorSelect');
  const t = vistaTrabajadorActual();
  if (!t) return;
  const propias = denunciasCache.filter((d) => d.trabajador_id === t.id);
  $('vtDenunciasBody').innerHTML =
    propias
      .map((d) => {
        const est = DENUNCIA_ESTADOS[d.estado] || ['—', 'b-slate'];
        return `<tr><td>${DENUNCIA_CATEGORIAS[d.categoria] || d.categoria || '—'}</td><td><span class="badge2 ${est[1]}">${est[0]}</span></td></tr>`;
      })
      .join('') || '<tr><td colspan="2" class="sub-c" style="text-align:center;padding:14px;">Sin denuncias enviadas.</td></tr>';
}

// ---- 🌐 Comunidad (muro compartido, con las propias señaladas) ----
function renderVistaTrabajadorComunidad() {
  $('vtComunidadSelector').innerHTML = vistaTrabajadorSelectorHTML('vtComunidadSelectorSelect');
  const t = vistaTrabajadorActual();
  $('vtComunidadMuro').innerHTML =
    comunidadAdminCache
      .map(
        (p) => `<div class="card card-pad" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div><b style="font-size:12.5px;">${p.autor_nombre}</b> ${t && p.autor_nombre === t.nombre ? '<span class="badge2 b-sky">Tu publicación</span>' : ''}${p.pinned ? ' <span class="badge2 b-brand">📌 Fijado</span>' : ''}<p class="sub-c" style="margin:2px 0 6px;">${new Date(p.created_at).toLocaleString('es-ES')} · ${p.kind}</p></div>
          </div>
          <p style="margin:0 0 6px;">${p.texto}</p>
          ${p.imagen_url ? `<img src="${p.imagen_url}" alt="" style="max-width:100%;border-radius:8px;display:block;">` : ''}
        </div>`
      )
      .join('') || '<p class="sub-c">Sin publicaciones todavía.</p>';
}

const VISTA_TRABAJADOR_RENDER = {
  'vista-trabajador-ficha': renderVistaTrabajadorFicha,
  'vista-trabajador-jornada': renderVistaTrabajadorJornada,
  'vista-trabajador-organigrama': renderVistaTrabajadorOrganigrama,
  'vista-trabajador-cuadrante': renderVistaTrabajadorCuadrante,
  'vista-trabajador-vacaciones': renderVistaTrabajadorVacaciones,
  'vista-trabajador-ausencias': renderVistaTrabajadorAusencias,
  'vista-trabajador-incidencias': renderVistaTrabajadorIncidencias,
  'vista-trabajador-chat': renderVistaTrabajadorChat,
  'vista-trabajador-formularios': renderVistaTrabajadorFormularios,
  'vista-trabajador-epi': renderVistaTrabajadorEpi,
  'vista-trabajador-formacion': renderVistaTrabajadorFormacion,
  'vista-trabajador-formacion-interna': renderVistaTrabajadorFormacionInterna,
  'vista-trabajador-documentos': renderVistaTrabajadorDocumentos,
  'vista-trabajador-sugerencias': renderVistaTrabajadorSugerencias,
  'vista-trabajador-denuncias': renderVistaTrabajadorDenuncias,
  'vista-trabajador-comunidad': renderVistaTrabajadorComunidad
};

// ---------- Mapa de Módulos (índice navegable de toda la aplicación) ----------
const MAPA_MODULOS = [
  { titulo:'▦ Gestión general', items:[
    { id:'admin-aprobaciones', icon:'☑', label:'Aprobaciones', desc:'Bandeja de vacaciones e incidencias pendientes de validar' },
    { id:'admin-empleados', icon:'👥', label:'Personas trabajadoras', desc:'Listado completo con acceso a la ficha individual de cada una' },
    { id:'admin-organigrama', icon:'🏛', label:'Organigrama', desc:'Estructura de departamentos y responsables' },
    { id:'admin-descripciones-puesto', icon:'📋', label:'Descripción de puesto', desc:'Uso exclusivo de RR.HH./Admin — un documento por puesto, enviable a firma' },
    { id:'admin-candidaturas', icon:'🧑‍💼', label:'Formulario del Candidato', desc:'Circuito de candidaturas, entrevista y alta automática de ficha' },
    { id:'admin-llamamientos', icon:'📣', label:'Llamamientos', desc:'Llamamiento y fin de llamamiento de personal fijo discontinuo — escalafón, preaviso, firma y gestoría' },
    { id:'admin-cuadrantes', icon:'📅', label:'Cuadrantes', desc:'Vista mensual por persona trabajadora' },
    { id:'admin-incidencias-nomina', icon:'💶', label:'Incidencias de Nómina', desc:'Horas extra, cambios de turno, días libres, absentismo y plus personal — periodos 20 a 20, informe para Dirección' },
    { id:'admin-vacaciones', icon:'🌴', label:'Vacaciones', desc:'Gestión de solicitudes de todo el equipo' },
    { id:'admin-ausencias', icon:'📄', label:'Ausencias y Permisos', desc:'Permisos cortos y bajas médicas de todo el equipo' },
    { id:'admin-incidencias', icon:'⚠', label:'Incidencias', desc:'Conversación directa por incidencia con cada persona trabajadora' },
    { id:'admin-chat', icon:'💬', label:'Chat de Incidencias', desc:'El mismo hilo que ve la persona trabajadora en «Chat con RR.HH.»' },
  ]},
  { titulo:'📝 Formularios, comunidad y formación', items:[
    { id:'admin-formularios', icon:'📝', label:'Formularios', desc:'Trámites firmados por personas trabajadoras' },
    { id:'admin-comunidad', icon:'🌐', label:'Comunidad', desc:'Muro de comunicados, bienvenidas y moderación' },
    { id:'admin-formacion', icon:'🎓', label:'Formación', desc:'6 cursos en catálogo · coste y horas por curso' },
    { id:'formacion-interna', icon:'🎬', label:'Formación Interna', desc:'Expediente Formativo — Plan de Excelencia (6 bloques, 22 módulos) + Bloque T' },
    { id:'matriz-cumplimiento-formacion', icon:'📐', label:'Matriz de Cumplimiento Formativo', desc:'Vista consolidada y filtrable de todos los registros, con semáforo de cumplimiento' },
    { id:'panel-direccion-formacion', icon:'📈', label:'Panel de Dirección — Formación', desc:'KPIs de cumplimiento formativo, desglose por departamento y Cierre Mensual' },
    { id:'admin-uniformidad', icon:'🥽', label:'Uniformidad y EPIs', desc:'Catálogo por puesto, entregas firmadas y devoluciones' },
  ]},
  { titulo:'🛡 Cultura y Compliance', items:[
    { id:'admin-compliance', icon:'🛡', label:'Compliance', desc:'Checklist de obligaciones de la empresa' },
    { id:'admin-manual', icon:'📘', label:'Manual de Empresa', desc:'Prevención de Riesgos Laborales, formación y vigilancia de la salud' },
    { id:'admin-vigilancia-salud', icon:'🩺', label:'Vigilancia de la Salud', desc:'Matriz de control para inspección de trabajo — nunca contenido médico' },
    { id:'admin-formacion-prl', icon:'⛑️', label:'Formación PRL', desc:'Circuito con Prevenlia — propuesta, firma, aprobación y realización' },
    { id:'admin-coordinacion', icon:'🗃', label:'Coordinación Empresarial', desc:'Empresas, centros de trabajo y personas trabajadoras vinculadas' },
    { id:'admin-accidentes', icon:'🚑', label:'Accidentes de Trabajo', desc:'Parte de Accidente de Trabajo · Informe de Investigación' },
    { id:'admin-sugerencias', icon:'💡', label:'Buzón de Sugerencias', desc:'Canal de propuestas de mejora a RR.HH.' },
    { id:'admin-denuncias', icon:'🚨', label:'Canal de Denuncias', desc:'Sistema Interno de Información (Ley 2/2023)' },
    { id:'admin-disciplina', icon:'⚖️', label:'Disciplina', desc:'Catálogo de faltas, formularios disciplinarios y expedientes' },
    { id:'admin-auditoria', icon:'🔍', label:'Auditoría', desc:'Trazabilidad de acciones en módulos sensibles' },
    { id:'admin-normativa', icon:'✨', label:'Asistente Normativo', desc:'Mismo contenido que consulta la persona trabajadora — solo lectura' },
  ]},
  { titulo:'📊 Informes y Dirección', items:[
    { id:'admin-informes', icon:'📊', label:'Informes', desc:'Coste de cobertura, rotación y bajas' },
    { id:'admin-panel-direccion', icon:'🏢', label:'Dirección', desc:'KPIs globales de empresa y costes de procesos RR.HH.' },
  ]},
  { titulo:'🪪 Vista de la persona trabajadora', items:[
    { id:'vista-trabajador-ficha', icon:'🪪', label:'Mi Ficha', desc:'Datos propios, cuadrante, formularios y todo lo relacionado con tu perfil — privado' },
    { id:'vista-trabajador-organigrama', icon:'🏛', label:'Organigrama', desc:'Consulta (solo lectura) de la estructura de departamentos y responsables' },
    { id:'vista-trabajador-cuadrante', icon:'📅', label:'Mi Cuadrante', desc:'Vista mensual de tus propios turnos' },
    { id:'vista-trabajador-formularios', icon:'📝', label:'Mis Formularios', desc:'Trámites con firma digital, incluida la solicitud de formación' },
    { id:'vista-trabajador-epi', icon:'🥽', label:'Mi Uniformidad y EPIs', desc:'Prendas y EPI asignados, con conformidad de entrega firmada' },
    { id:'vista-trabajador-formacion', icon:'🎓', label:'Mi Formación', desc:'Cursos asignados y solicitud de formación con ROI y desarrollo profesional' },
    { id:'vista-trabajador-formacion-interna', icon:'🎬', label:'Formación Interna — Expediente Formativo', desc:'Tu Plan de Excelencia y Bloque T: inicia cada módulo, evaluación teórica y certificados' },
    { id:'vista-trabajador-sugerencias', icon:'💡', label:'Buzón de Sugerencias', desc:'Envía propuestas de mejora directamente a RR.HH.' },
    { id:'vista-trabajador-denuncias', icon:'🚨', label:'Canal de Denuncias', desc:'Comunica de forma confidencial o anónima una irregularidad' },
    { id:'vista-trabajador-comunidad', icon:'🌐', label:'Comunidad', desc:'Espacio social del equipo' },
  ]},
];

function renderMapaModulos() {
  const el = $('mapaModulosContent');
  if (!el) return;
  el.innerHTML = MAPA_MODULOS.map(sec => `
    <div class="card card-pad" style="margin-bottom:14px;" data-mapa-grupo="1">
      <div class="aprob-section-title">${sec.titulo}</div>
      <div class="grid g3">
        ${sec.items.map(it => `
          <div class="card card-pad mapa-modulo-card" style="cursor:pointer;" data-mapa-texto="${(it.label + ' ' + it.desc).toLowerCase()}" onclick="showScreen('${it.id}')">
            <div style="display:flex;align-items:center;gap:8px;"><span style="font-size:18px;">${it.icon}</span><b>${it.label}</b></div>
            <p class="sub-c" style="margin:6px 0 0;">${it.desc}</p>
          </div>`).join('')}
      </div>
    </div>`).join('');
}

function filtrarMapaModulos() {
  const q = ($('mapaModulosBuscar').value || '').trim().toLowerCase();
  const tarjetas = document.querySelectorAll('.mapa-modulo-card');
  let visibles = 0;
  tarjetas.forEach(c => {
    const coincide = !q || c.dataset.mapaTexto.includes(q);
    c.style.display = coincide ? '' : 'none';
    if (coincide) visibles++;
  });
  document.querySelectorAll('[data-mapa-grupo]').forEach(grupo => {
    const algunaVisible = Array.from(grupo.querySelectorAll('.mapa-modulo-card')).some(c => c.style.display !== 'none');
    grupo.style.display = algunaVisible ? '' : 'none';
  });
  const sinResultados = $('mapaModulosSinResultados');
  if (sinResultados) sinResultados.style.display = visibles === 0 ? '' : 'none';
}

async function cargarTodo() {
  renderMapaModulos();
  // cargarEmpleados() primero y en espera: cargarCuadrantes() lee empleadosCache para
  // pintar las filas de personal, y si corrieran en el mismo Promise.all podía ganar la
  // carrera la consulta de Cuadrantes y pintar la tabla vacía (bug real detectado en
  // auditoría — no dependía del orden de llegada de ninguna otra pantalla).
  await cargarEmpleados();
  await Promise.all([
    cargarPanelGeneral(),
    cargarAprobaciones(),
    cargarCuadrantes(),
    cargarCuadrantesCatalogoYSecuencias(),
    cargarIncidenciasNominaAdmin(),
    cargarIncidenciasAdmin(),
    cargarVacacionesAdmin(),
    cargarAusenciasAdmin(),
    cargarFormulariosAdmin(),
    cargarOrganigramaAdmin(),
    cargarDescPuesto(),
    cargarUniformidadAdmin(),
    cargarFormacionAdmin(),
    cargarFormacionInternaAdmin(),
    cargarNormativaAdmin(),
    cargarVigilanciaAdmin(),
    cargarFormacionPRLAdmin(),
    cargarCoordinacionAdmin(),
    cargarAccidentesAdmin(),
    cargarSugerenciasAdmin(),
    cargarDenunciasAdmin(),
    cargarDisciplinaAdmin(),
    cargarAuditoriaAdmin(),
    cargarManualEmpresaAdmin(),
    cargarCandidatosAdmin(),
    cargarLlamamientosAdmin(),
    cargarInformesAdmin(),
    cargarInformesEvaluacionesDesempeno(),
    cargarPanelDireccionGeneralAdmin(),
    cargarComunidadAdmin(),
    cargarNotificacionesCampana()
  ]);
  // Secuencial, después del Promise.all: depende de candidatosCache (cargarCandidatosAdmin)
  // ya poblado para contar procesos de contratación reales en el coste de entrevista.
  await cargarDireccionEjecutivaAdmin();
  // Refresca la campanita de notificaciones sola cada 60s — igual que el cron de la cola de
  // envío (cada 5 min) pero del lado del centro de avisos dentro de la propia app, para que el
  // contador de "no leídas" y el listado no dependan de recargar la página ni navegar de pantalla.
  clearInterval(window.__notifPollTimer);
  window.__notifPollTimer = setInterval(cargarNotificacionesCampana, 60000);
}

// ---------- Centro de notificaciones (🔔) — cierra el hueco real nº 9 de la lista de paridad ----
// notificaciones_cola (migración 0038) ya existía como cola de ENVÍO de push/email; aquí se
// reutiliza para pintar un centro de avisos dentro de la propia app — RLS (migración 0066)
// limita lo que se ve a las filas dirigidas al email de esta sesión de admin/RR.HH.
let notificacionesCampanaCache = [];
function _tiempoRelativo(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `hace ${dias} d`;
  return fechaCorta(iso.slice(0, 10));
}
async function cargarNotificacionesCampana() {
  const { data, error } = await sb
    .from('notificaciones_cola')
    .select('id, tipo, titulo, cuerpo, creado_en, leido')
    .order('creado_en', { ascending: false })
    .limit(30);
  if (error) {
    console.error('Error cargando notificaciones', error);
    return;
  }
  notificacionesCampanaCache = data || [];
  renderNotificacionesCampana();
}
function renderNotificacionesCampana() {
  const noLeidas = notificacionesCampanaCache.filter((n) => !n.leido).length;
  const badge = $('notifBadge');
  if (badge) {
    badge.textContent = noLeidas > 9 ? '9+' : String(noLeidas);
    badge.classList.toggle('hidden', noLeidas === 0);
  }
  const cont = $('notifLista');
  if (!cont) return;
  if (!notificacionesCampanaCache.length) {
    cont.innerHTML = '<div class="notif-empty">No tienes notificaciones todavía.</div>';
    return;
  }
  cont.innerHTML = notificacionesCampanaCache
    .map(
      (n) => `
    <div class="notif-item ${n.leido ? 'leido' : 'no-leido'}" data-notif-id="${n.id}">
      <span class="notif-dot"></span>
      <div class="notif-body">
        <p class="notif-title">${n.titulo || '—'}</p>
        <p class="notif-text">${(n.cuerpo || '').replace(/</g, '&lt;')}</p>
        <p class="notif-time">${_tiempoRelativo(n.creado_en)}</p>
      </div>
    </div>`
    )
    .join('');
}
function toggleNotifPanel() {
  $('notifPanel').classList.toggle('hidden');
}
async function marcarNotificacionLeida(id) {
  const n = notificacionesCampanaCache.find((x) => x.id === id);
  if (!n || n.leido) return;
  n.leido = true;
  renderNotificacionesCampana();
  await sb.rpc('marcar_notificaciones_leidas', { p_ids: [id] });
}
async function marcarTodasNotificacionesLeidas() {
  notificacionesCampanaCache.forEach((n) => (n.leido = true));
  renderNotificacionesCampana();
  await sb.rpc('marcar_notificaciones_leidas', { p_ids: null });
  mostrarToast('Notificaciones marcadas como leídas ✓', true);
}

function estadoPorFecha(proximaFecha) {
  if (!proximaFecha) return 'pendiente';
  const hoy = new Date().toISOString().slice(0, 10);
  return proximaFecha >= hoy ? 'al_dia' : 'pendiente';
}

// César (ficha de Ana Belén Pérez Miguel, 02/11/2026): "Formulario enviado el Invalid Date",
// "enviado el Invalid Date" en el correo de confirmación de cita y en el historial — fechaCorta()
// se escribió para fechas sin hora (candidatos.fecha_solicitud, tipo date) y les añadía
// "T00:00:00" para que new Date() las interpretase en hora local; pero se reutilizó también con
// columnas timestamptz (cita_confirmada_en, formulario_entrevista_enviado_en/_recibido_en,
// fecha_entrevista, notificaciones_cola.enviado_en) que YA llegan con hora — "T00:00:00" se
// concatenaba a continuación de esa hora, new Date() no podía parsear el resultado y devolvía
// "Invalid Date" (en inglés, tal cual) en pantalla y hasta dentro del cuerpo de un correo real
// al candidato. Ahora solo añade la hora si el valor no la trae ya, y nunca muestra ese texto en
// inglés: si por lo que sea la fecha sigue sin poder interpretarse, se muestra "—" como el resto
// de fechas vacías.
function fechaCorta(iso) {
  if (!iso) return '—';
  const valor = String(iso).includes('T') ? iso : iso + 'T00:00:00';
  const d = new Date(valor);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
// César (captura, 02/11/2026, cuarta vuelta): "en la captura solamente se ve eso, no se ve ni una
// hora ni nada" — el historial de correos enviados a un candidato puede tener varias entradas el
// mismo día (reenvíos, recordatorios) e indistinguibles con solo la fecha; misma lógica que
// fechaCorta() pero añadiendo hora:minuto.
function fechaHoraCorta(iso) {
  if (!iso) return '—';
  const valor = String(iso).includes('T') ? iso : iso + 'T00:00:00';
  const d = new Date(valor);
  if (isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
}

// ---------- Panel General ----------
// Minutos trabajados hoy a partir de un fichaje real (hora_entrada/hora_salida, tipo time).
// Si la jornada ya terminó, se usa el tramo entrada→salida; si sigue activa (trabajando/pausa/
// teletrabajo, sin hora_salida todavía), se cuenta entrada→ahora; en cualquier otro caso (ausente
// o sin fichar) no hay tiempo trabajado que mostrar — nunca una cifra inventada.
function _minutosDesdeHHMM(hhmm) {
  if (!hhmm) return null;
  const partes = hhmm.split(':');
  return Number(partes[0]) * 60 + Number(partes[1] || 0);
}
function _minutosTrabajadosFichaje(f) {
  if (!f) return 0;
  const entrada = _minutosDesdeHHMM(f.hora_entrada);
  if (entrada == null) return 0;
  if (f.hora_salida) {
    const salida = _minutosDesdeHHMM(f.hora_salida);
    return Math.max(0, salida - entrada);
  }
  if (f.estado === 'trabajando' || f.estado === 'pausa' || f.estado === 'teletrabajo') {
    const ahora = new Date();
    return Math.max(0, ahora.getHours() * 60 + ahora.getMinutes() - entrada);
  }
  return 0;
}
function _formatoHorasMin(totalMinutos) {
  const h = Math.floor(totalMinutos / 60);
  const m = Math.round(totalMinutos % 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Los 6 estados reales de fichajes.estado (ver migración 0003_fichajes.sql), en el mismo orden y
// con el mismo color/emoji que el prototipo real — antes solo se contaban 3 de los 6.
const PANEL_ESTADOS_FICHAJE = [
  { key: 'trabajando', emoji: '🟢', label: 'Trabajando' },
  { key: 'pausa', emoji: '🟡', label: 'Pausa' },
  { key: 'teletrabajo', emoji: '🔵', label: 'Teletrabajo' },
  { key: 'ausente', emoji: '🔴', label: 'Ausente' },
  { key: 'finalizada', emoji: '🟣', label: 'Finalizada' },
  { key: 'no_fichado', emoji: '⚪', label: 'No ha fichado' }
];
function panelBadgeEstadoFichaje(estado) {
  if (estado === 'finalizada') return '<span class="badge2" style="background:#f3e8ff;color:#7e22ce;">Jornada finalizada</span>';
  const etiquetas = { trabajando: 'Trabajando', pausa: 'Pausa', teletrabajo: 'Teletrabajo', ausente: 'Ausente', no_fichado: 'No ha fichado' };
  return `<span class="badge2 ${BADGE_ESTADO[estado] || 'b-slate'}">${etiquetas[estado] || estado}</span>`;
}

async function cargarPanelGeneral() {
  const hoy = new Date().toISOString().slice(0, 10);
  // "Recordatorios pendientes" leía de la tabla `recordatorios` (migración 0007), que solo tiene
  // la fila de ejemplo sembrada en su día y a la que nadie más vuelve a insertar — el motor real
  // de avisos (escalado de fichaje 0063, caducidades de Vigilancia/Formación PRL 0068, etc.) escribe
  // en notificaciones_cola (0038) desde hace tiempo, igual que el centro de notificaciones 🔔
  // (0066, ver cargarNotificacionesCampana() más arriba). Esta tarjeta mostraba siempre el mismo
  // aviso demo de hace 81 migraciones aunque el sistema sí estuviera avisando de verdad, solo que
  // por otro canal — se reapunta a la misma fuente real que la campana (RLS ya exige que
  // destinatario_email coincida con el email de esta sesión, así cada admin ve lo suyo).
  const [{ data: personal }, { data: fichajesHoy }, { data: vacPend }, { data: incAbiertas }, { data: avisosPendientes }, { data: asignacionesHoy }] = await Promise.all([
    sb.from('personas_trabajadoras').select('*').eq('estado_laboral', 'Activo').order('nombre'),
    sb.from('fichajes').select('*').eq('fecha', hoy),
    sb.from('vacaciones_solicitudes').select('*').eq('estado', 'pendiente'),
    sb.from('incidencias').select('*').eq('estado', 'abierta'),
    sb.from('notificaciones_cola').select('id, titulo, cuerpo, creado_en').eq('leido', false).order('creado_en', { ascending: false }).limit(8),
    sb.from('cuadrante_asignaciones').select('*, turnos_catalogo(codigo, hora_entrada_1)').eq('fecha', hoy)
  ]);

  const total = (personal || []).length;
  const minutosHoyTotal = (fichajesHoy || []).reduce((s, f) => s + _minutosTrabajadosFichaje(f), 0);

  $('panelKpis').innerHTML = `
    <div class="card kpi"><div class="ic">👥</div><div><div class="t">Plantilla activa</div><div class="v">${total}</div></div></div>
    <div class="card kpi"><div class="ic">⏱</div><div><div class="t">Horas trabajadas hoy</div><div class="v">${_formatoHorasMin(minutosHoyTotal)}</div></div></div>
    <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-aprobaciones')"><div class="ic">🌴</div><div><div class="t">Vacaciones pendientes</div><div class="v">${(vacPend || []).length}</div></div></div>
    <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-incidencias')"><div class="ic">⚠</div><div><div class="t">Incidencias abiertas</div><div class="v">${(incAbiertas || []).length}</div></div></div>`;

  renderPanelKpisCoste();

  const asignacionPorTrabajador = {};
  (asignacionesHoy || []).forEach((a) => {
    asignacionPorTrabajador[a.trabajador_id] = a;
  });

  const porEstado = { trabajando: 0, pausa: 0, teletrabajo: 0, ausente: 0, finalizada: 0, no_fichado: 0 };
  const filasEquipo = (personal || []).map((p) => {
    const f = (fichajesHoy || []).find((x) => x.trabajador_id === p.id);
    const estado = f ? f.estado : 'no_fichado';
    porEstado[estado] = (porEstado[estado] || 0) + 1;
    const minutos = _minutosTrabajadosFichaje(f);
    const asign = asignacionPorTrabajador[p.id];
    const turnoInfo =
      estado === 'no_fichado' && asign && asign.turnos_catalogo
        ? ` <span class="sub-c">(turno ${asign.turnos_catalogo.codigo}${asign.turnos_catalogo.hora_entrada_1 ? ', ' + asign.turnos_catalogo.hora_entrada_1.slice(0, 5) : ''})</span>`
        : '';
    return `<tr>
      <td><b>${p.nombre}</b></td>
      <td>${p.departamento || '—'}</td>
      <td>${panelBadgeEstadoFichaje(estado)}${turnoInfo}</td>
      <td>${f && f.hora_entrada ? f.hora_entrada.slice(0, 5) : '—'}</td>
      <td>${_formatoHorasMin(minutos)}</td>
    </tr>`;
  });

  $('panelEstadoEquipo').innerHTML = PANEL_ESTADOS_FICHAJE.map((e) => `<span class="pill">${e.emoji} ${e.label} — <b>${porEstado[e.key] || 0}</b></span>`).join('');

  const tbody = $('panelEquipoTablaBody');
  if (tbody) tbody.innerHTML = filasEquipo.join('') || '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin personas trabajadoras activas.</td></tr>';

  $('panelRecordatorios').innerHTML =
    (avisosPendientes || [])
      .map((r) => `<div class="row-item"><div><b style="font-size:12.5px;">${r.titulo}</b><p class="sub-c" style="margin:2px 0 0;">${(r.cuerpo || '').replace(/</g, '&lt;')}</p></div><span class="sub-c" style="white-space:nowrap;">${_tiempoRelativo(r.creado_en)}</span></div>`)
      .join('') || '<p class="sub-c">Sin recordatorios pendientes.</p>';
}

// Segunda fila de KPIs de Panel General — coste de cobertura de plantilla y coste de personal
// semanal (TOTAL plantilla, salario + Seg. Social), ambos ya calculados en Panel de Dirección
// (cargarDireccionEjecutivaAdmin → direccionData), reutilizados aquí en vez de recalculados por
// duplicado. Mientras direccionData todavía no se ha cargado (primera carga de la app, antes de
// que termine cargarDireccionEjecutivaAdmin) se muestra "—", igual que el prototipo; esta misma
// función se vuelve a llamar desde cargarDireccionEjecutivaAdmin() en cuanto el dato real está listo.
function renderPanelKpisCoste() {
  const el = $('panelKpisCoste');
  if (!el) return;
  const d = direccionData;
  el.innerHTML = `
    <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-informes')"><div class="ic">💰</div><div><div class="t">Coste de cobertura de plantilla</div><div class="v">${d ? fmtEur(d.coberturaBaseTotal) : '—'}</div></div></div>
    <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-cuadrantes')"><div class="ic">🏛</div><div><div class="t">Coste de personal semanal — TOTAL plantilla (salario + Seg. Social)</div><div class="v">${d ? fmtEur(d.granTotalAjustadoSemanal) : '—'}</div></div></div>`;
}

// ---------- Aprobaciones ----------
async function cargarAprobaciones() {
  const [{ data: vac }, { data: aus }, { data: inc }] = await Promise.all([
    sb.from('vacaciones_solicitudes').select('*, personas_trabajadoras(nombre, departamento)').eq('estado', 'pendiente').order('created_at', { ascending: false }),
    sb.from('ausencias_solicitudes').select('*, personas_trabajadoras(nombre, departamento)').eq('estado', 'pendiente').order('created_at', { ascending: false }),
    sb.from('incidencias').select('*, personas_trabajadoras(nombre, departamento)').eq('estado', 'abierta')
  ]);

  $('aprobVacaciones').innerHTML =
    (vac || [])
      .map(
        (v) => `<div class="row-item">
          <div><b style="font-size:12.5px;">${v.personas_trabajadoras ? v.personas_trabajadoras.nombre : '—'}</b><p class="sub-c" style="margin:2px 0 0;">${v.fecha_inicio} → ${v.fecha_fin} · ${v.dias} día(s)</p></div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-sm" onclick="resolverVacacion('${v.id}','aprobada')">✓ Aprobar</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="resolverVacacion('${v.id}','rechazada')">✕ Rechazar</button>
          </div>
        </div>`
      )
      .join('') || '<p class="sub-c">Sin solicitudes pendientes.</p>';

  $('aprobAusencias').innerHTML =
    (aus || [])
      .map(
        (a) => `<div class="row-item">
          <div><b style="font-size:12.5px;">${a.personas_trabajadoras ? a.personas_trabajadoras.nombre : '—'}</b><p class="sub-c" style="margin:2px 0 0;">${a.motivo} · ${a.fechas}</p></div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-sm" onclick="resolverAusencia('${a.id}','aprobada')">✓ Aprobar</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="resolverAusencia('${a.id}','rechazada')">✕ Rechazar</button>
          </div>
        </div>`
      )
      .join('') || '<p class="sub-c">Sin solicitudes pendientes.</p>';

  $('aprobIncidenciasResumen').innerHTML =
    (inc || [])
      .map(
        (i) => `<div class="row-item">
          <div><b style="font-size:12.5px;">${i.personas_trabajadoras ? i.personas_trabajadoras.nombre : '—'}</b><p class="sub-c" style="margin:2px 0 0;">${i.personas_trabajadoras ? i.personas_trabajadoras.departamento || '' : ''}</p><p style="margin:4px 0 0;font-weight:600;">${i.tipo || '—'}</p><p class="sub-c" style="margin:2px 0 0;">${i.descripcion || ''}</p></div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-sm" onclick="resolverIncidenciaDesdeAprobaciones('${i.id}')">✓ Aprobar</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="showScreen('admin-incidencias');seleccionarIncidencia('${i.id}');">✕ Rechazar</button>
          </div>
        </div>`
      )
      .join('') || '<p class="sub-c">Sin incidencias abiertas.</p>';

  const totalPend = (vac || []).length + (aus || []).length;
  const countEl = $('countAprobaciones');
  countEl.textContent = totalPend;
  countEl.classList.toggle('hidden', totalPend === 0);
  const countInc = $('countIncidencias');
  countInc.textContent = (inc || []).length;
  countInc.classList.toggle('hidden', (inc || []).length === 0);
}

async function resolverVacacion(id, estado) {
  // Al aprobar, se marca acuse:'pendiente' y se avisa a la persona trabajadora para que confirme
  // la recepción del aviso desde "Mis vacaciones" — igual que el circuito del prototipo
  // (addNotification('employee', ...) + acuse obligatorio), que antes no existía en la app real.
  const payload = { estado };
  if (estado === 'aprobada') payload.acuse = 'pendiente';
  const { error } = await sb.from('vacaciones_solicitudes').update(payload).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Solicitud ' + estado + ' ✓', !error);
  if (!error) {
    await registrarAuditoria('Vacaciones', 'Solicitud de vacaciones ' + estado, id);
    if (estado === 'aprobada') {
      const v = (vacacionesTodasCache || []).find((x) => x.id === id);
      await sb.from('notificaciones_cola').insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: v ? v.trabajador_id : null,
        tipo: 'vacaciones_aprobadas',
        titulo: '🌴 Tus vacaciones han sido aprobadas',
        cuerpo: 'Abre "Mis vacaciones" y confirma el acuse de recibo de este aviso.',
        canal_push: true,
        canal_email: false,
        referencia_tabla: 'vacaciones_solicitudes',
        referencia_id: id
      });
    }
    await cargarAprobaciones();
    await cargarPanelGeneral();
    await cargarVacacionesAdmin();
  }
}

async function resolverAusencia(id, estado) {
  if (estado === 'aprobada') {
    // ausencia_aprobar (RPC, migración 0075): aprueba + avisa por correo real al/a la jefe de
    // departamento + sincroniza el cuadrante SOLO cuando RR.HH. indicó fecha_inicio/fecha_fin
    // estructuradas al solicitarla — y solo rellenando días vacíos, nunca pisando una asignación
    // que ya existiera (turno real, vacaciones, baja…). Si solo hay texto libre en "fechas" (el
    // caso heredado), aprueba igual pero no toca el cuadrante — el mensaje que devuelve dice
    // exactamente qué pasó, no se inventa aquí.
    const { data: mensaje, error } = await sb.rpc('ausencia_aprobar', { p_id: id });
    mostrarToast(error ? 'Error: ' + error.message : `Ausencia aprobada ✓ ${mensaje || ''}`, !error);
    if (!error) {
      await registrarAuditoria('Ausencias', 'Solicitud de ausencia aprobada', mensaje || id);
      await cargarAprobaciones();
      await cargarAusenciasAdmin();
    }
    return;
  }
  const { error } = await sb.from('ausencias_solicitudes').update({ estado }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Solicitud ' + estado + ' ✓', !error);
  if (!error) {
    await registrarAuditoria('Ausencias', 'Solicitud de ausencia ' + estado, id);
    await cargarAprobaciones();
    await cargarAusenciasAdmin();
  }
}

// ---------- Vacaciones (admin) ----------
let vacacionesTodasCache = [];
async function cargarVacacionesAdmin() {
  const { data } = await sb
    .from('vacaciones_solicitudes')
    .select('*, personas_trabajadoras(nombre)')
    .order('created_at', { ascending: false });
  const todas = data || [];
  vacacionesTodasCache = todas;
  const pendientes = todas.filter((v) => v.estado === 'pendiente');
  const historial = todas.filter((v) => v.estado !== 'pendiente');

  $('vacacionesAdminPendientesBody').innerHTML =
    pendientes
      .map(
        (v) => `<tr>
          <td><b>${v.personas_trabajadoras ? v.personas_trabajadoras.nombre : '—'}</b></td>
          <td>${fechaCorta(v.fecha_inicio)} → ${fechaCorta(v.fecha_fin)}</td>
          <td>${v.dias}</td>
          <td>${badgeEstado(v.estado)}</td>
          <td style="display:flex;gap:6px;">
            <button type="button" class="btn btn-sm" onclick="resolverVacacion('${v.id}','aprobada')">✓ Aprobar</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="resolverVacacion('${v.id}','rechazada')">✕ Rechazar</button>
          </td>
        </tr>`
      )
      .join('') || '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin solicitudes pendientes.</td></tr>';

  $('vacacionesAdminHistorialBody').innerHTML =
    historial
      .map(
        (v) => `<tr>
          <td>${v.personas_trabajadoras ? v.personas_trabajadoras.nombre : '—'}</td>
          <td>${fechaCorta(v.fecha_inicio)} → ${fechaCorta(v.fecha_fin)}</td>
          <td>${v.dias}</td>
          <td>${badgeEstado(v.estado)}</td>
          <td>${v.acuse === 'confirmado' ? '✓ Confirmado' : v.acuse === 'pendiente' ? 'Pendiente' : '—'}</td>
        </tr>`
      )
      .join('') || '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin historial todavía.</td></tr>';
}

// ---------- Ausencias y permisos (admin) ----------
let ausenciasTodasCache = [];
let bajasTodasCache = [];
async function cargarAusenciasAdmin() {
  const [{ data: ausencias }, { data: bajas }] = await Promise.all([
    sb.from('ausencias_solicitudes').select('*, personas_trabajadoras(nombre)').order('created_at', { ascending: false }),
    sb.from('bajas_medicas').select('*, personas_trabajadoras(nombre)').order('fecha_inicio', { ascending: false })
  ]);
  const todas = ausencias || [];
  ausenciasTodasCache = todas;
  bajasTodasCache = bajas || [];
  const pendientes = todas.filter((a) => a.estado === 'pendiente');
  const historial = todas.filter((a) => a.estado !== 'pendiente');

  $('ausenciasAdminPendientesBody').innerHTML =
    pendientes
      .map(
        (a) => `<tr>
          <td><b>${a.personas_trabajadoras ? a.personas_trabajadoras.nombre : '—'}</b></td>
          <td>${a.motivo}</td>
          <td>${a.fechas}</td>
          <td>${badgeEstado(a.estado)}</td>
          <td style="display:flex;gap:6px;">
            <button type="button" class="btn btn-sm" onclick="resolverAusencia('${a.id}','aprobada')">✓ Aprobar</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="resolverAusencia('${a.id}','rechazada')">✕ Rechazar</button>
          </td>
        </tr>`
      )
      .join('') || '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin solicitudes pendientes.</td></tr>';

  $('ausenciasAdminHistorialBody').innerHTML =
    historial
      .map((a) => `<tr><td>${a.personas_trabajadoras ? a.personas_trabajadoras.nombre : '—'}</td><td>${a.motivo}</td><td>${a.fechas}</td><td>${badgeEstado(a.estado)}</td></tr>`)
      .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin historial todavía.</td></tr>';

  if ($('bajaTrabajadorId') && !$('bajaTrabajadorId').dataset.poblado) {
    $('bajaTrabajadorId').innerHTML = '<option value="">— Persona trabajadora —</option>' + empleadosCache.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');
    $('bajaTrabajadorId').dataset.poblado = '1';
  }
  $('bajasAdminBody').innerHTML =
    (bajas || [])
      .map(
        (b) => `<tr>
          <td>${b.personas_trabajadoras ? b.personas_trabajadoras.nombre : '—'}</td>
          <td>${b.motivo}</td>
          <td>${fechaCorta(b.fecha_inicio)}</td>
          <td>${b.dias ?? '—'}</td>
          <td>${b.fecha_alta ? fechaCorta(b.fecha_alta) : 'En curso'}</td>
          <td>${b.fecha_alta ? '' : `<button type="button" class="btn btn-secondary btn-sm" onclick="cerrarBajaMedica('${b.id}')">✓ Dar de alta</button>`}</td>
        </tr>`
      )
      .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin bajas registradas.</td></tr>';
}
// ---- CRUD de Bajas médicas (gap de la auditoría — antes solo lectura, sin forma de registrarlas
// ni cerrarlas desde la app; "la gestión la inicia RR.HH." seguía siendo cierto, solo que ahora
// puede hacerlo desde aquí en vez de "desde fuera de la app"). ----
async function guardarBajaMedica(e) {
  e.preventDefault();
  const trabajadorId = $('bajaTrabajadorId').value;
  if (!trabajadorId) {
    mostrarToast('⚠️ Selecciona la persona trabajadora', false);
    return;
  }
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: trabajadorId,
    motivo: $('bajaMotivo').value.trim(),
    fecha_inicio: $('bajaFechaInicio').value,
    dias: $('bajaDias').value ? parseInt($('bajaDias').value, 10) : null
  };
  const { error } = await sb.from('bajas_medicas').insert(payload);
  mostrarToast(error ? 'Error al registrar: ' + error.message : 'Baja médica registrada ✓', !error);
  if (!error) {
    e.target.reset();
    const p = empleadosCache.find((x) => x.id === trabajadorId);
    await registrarAuditoria('Ausencias y bajas', 'Baja médica registrada', `${p ? p.nombre : trabajadorId} — ${payload.motivo}`);
    await cargarAusenciasAdmin();
  }
}
async function cerrarBajaMedica(id) {
  const { error } = await sb.from('bajas_medicas').update({ fecha_alta: new Date().toISOString().slice(0, 10) }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Alta médica registrada ✓', !error);
  if (!error) {
    const b = (bajasTodasCache || []).find((x) => x.id === id);
    await registrarAuditoria('Ausencias y bajas', 'Alta médica registrada (fin de baja)', b && b.personas_trabajadoras ? b.personas_trabajadoras.nombre : id);
    await cargarAusenciasAdmin();
  }
}

// ---------- Formularios y Firma Digital (admin) ----------
// Estados reales (formularios_solicitudes.estado, migración 0006): pendiente / firmado / rrhh /
// gestoria / aprobado. No se usa "Signaturit" en ningún texto — la migración 0036 documenta que
// César sustituyó Signaturit por firma electrónica simple interna por coste; usar esa marca aquí
// sería copiar un dato del prototipo que la propia app ya decidió dejar atrás por una razón de
// negocio real.
const STATUS_FORMULARIOS = {
  pendiente: 'Pendiente de firma de la persona trabajadora',
  firmado: 'Firmado por la persona trabajadora',
  rrhh: 'Notificado a RR.HH.',
  gestoria: 'Reenviado a gestoría',
  enviado_proveedor: 'Enviado a la tienda colaboradora de uniformidad',
  aprobado: 'Formación aprobada por RR.HH.'
};
const BLOQUE_ICONOS = {
  'Datos personales, fiscales y bancarios': '🧾',
  'Retribución y condiciones laborales': '💶',
  'Salidas, extinciones y bajas': '🚪',
  'Uniformidad y EPI': '🦺',
  'Permisos, vacaciones y conciliación': '🗓',
  'Registro y control de jornada': '⏱',
  'Formación y desarrollo profesional': '🎓'
};
let formulariosPlantillasCache = [];
let formulariosSolicitudesCache = [];
let formulariosDestinatariosCache = [];

function formularioEstadoLabel(s) {
  const bloque = s.formularios_plantillas ? s.formularios_plantillas.bloque : null;
  if (s.estado === 'aprobado' && bloque !== 'Formación y desarrollo profesional') return 'Aprobado';
  return STATUS_FORMULARIOS[s.estado] || s.estado || '—';
}

function formularioAccionHTML(s) {
  const bloque = s.formularios_plantillas ? s.formularios_plantillas.bloque : null;
  const esFormacion = bloque === 'Formación y desarrollo profesional';
  if (s.estado === 'firmado') return '<span class="sub-c">Procesando…</span>';
  if (s.estado === 'rrhh') {
    if (esFormacion) return `<button type="button" class="btn btn-sm" onclick="aprobarFormacionSolicitud('${s.id}')">✅ Aprobar formación</button>`;
    if (bloque === 'Registro y control de jornada') return '<span class="sub-c">Procesando…</span>';
    return `<button type="button" class="btn btn-sm" onclick="enviarFormularioGestoria('${s.id}')">📧 Reenviar a gestoría</button>`;
  }
  if (s.estado === 'gestoria') return '<span class="badge2 b-emerald">Enviado ✓</span>';
  if (s.estado === 'enviado_proveedor') return '<span class="badge2 b-emerald">Enviado a la tienda ✓</span>';
  if (s.estado === 'aprobado' && esFormacion) return `<button type="button" class="btn btn-sm" onclick="abrirProgramarFormacion('${s.id}')">🗓️ Programar fecha y hora</button>`;
  if (s.estado === 'aprobado') return '<span class="badge2 b-emerald">✓ Gestionado</span>';
  return '<span class="sub-c">—</span>';
}

function formularioFilaHTML(s, incluirBloque) {
  const plantilla = s.formularios_plantillas;
  const nuevoBadge = !s.leido_rrhh ? ' <span class="badge2 b-rose" style="padding:1px 5px;font-size:9px;margin-left:2px;">Nuevo</span>' : '';
  return `<tr>
    <td><b>${s.personas_trabajadoras ? s.personas_trabajadoras.nombre : '—'}</b></td>
    <td>${plantilla ? plantilla.nombre : s.plantilla_id}</td>
    ${incluirBloque ? `<td class="sub-c">${plantilla ? plantilla.bloque : '—'}</td>` : ''}
    <td>${fechaCorta((s.fecha_solicitud || '').slice(0, 10))}</td>
    <td><span class="badge2 ${BADGE_ESTADO[s.estado] || 'b-slate'}">${formularioEstadoLabel(s)}</span></td>
    <td style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
      <button type="button" class="btn btn-secondary btn-sm" onclick="verFormularioSolicitud('${s.id}')">👁 Ver${nuevoBadge}</button>
      ${formularioAccionHTML(s)}
      ${plantilla && plantilla.bloque === 'Formación y desarrollo profesional' ? `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirGenerarCorreoFormacion('${s.id}')">✉️ Generar correo</button>` : ''}
    </td>
  </tr>`;
}

async function cargarFormulariosAdmin() {
  const [{ data: solicitudes }, { data: plantillas }, { data: destinatarios }] = await Promise.all([
    sb
      .from('formularios_solicitudes')
      .select(
        '*, personas_trabajadoras(nombre, dni_nie, codigo, puesto, centros_trabajo(nombre)), formularios_plantillas(nombre, bloque, adjunto_obligatorio)'
      )
      .order('fecha_solicitud', { ascending: false }),
    sb.from('formularios_plantillas').select('*').order('bloque'),
    sb.from('formularios_destinatarios').select('*').order('etiqueta')
  ]);
  formulariosPlantillasCache = plantillas || [];
  formulariosSolicitudesCache = solicitudes || [];
  formulariosDestinatariosCache = destinatarios || [];
  renderBandejaFirmas();

  const porBloque = {};
  formulariosPlantillasCache.forEach((p) => {
    porBloque[p.bloque] = porBloque[p.bloque] || [];
    porBloque[p.bloque].push(p);
  });
  $('formulariosCatalogoGrid').innerHTML =
    Object.keys(porBloque)
      .map(
        (bloque) => `<h3 style="margin:16px 0 8px;font-size:13.5px;">${BLOQUE_ICONOS[bloque] || '📄'} ${bloque}</h3>
      <div class="grid g2" style="gap:10px;margin-bottom:6px;">
        ${porBloque[bloque]
          .map(
            (p) => `<div class="card card-pad" style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <div style="display:flex;gap:10px;align-items:center;">
              <div style="width:34px;height:34px;border-radius:9px;background:var(--brand-50);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">${BLOQUE_ICONOS[bloque] || '📄'}</div>
              <div><b style="font-size:13px;display:block;">${p.nombre}</b><span class="sub-c">Firma electrónica simple interna · adjunto ${p.adjunto_obligatorio ? 'obligatorio' : 'opcional'}</span></div>
            </div>
          </div>`
          )
          .join('')}
      </div>`
      )
      .join('') || '<p class="sub-c" style="text-align:center;padding:14px;">Sin plantillas en el catálogo.</p>';
}

function renderBandejaFirmas() {
  const soloCierres = $('formulariosSoloCierres') && $('formulariosSoloCierres').checked;
  const filas = soloCierres
    ? formulariosSolicitudesCache.filter((s) => s.formularios_plantillas && s.formularios_plantillas.bloque === 'Registro y control de jornada')
    : formulariosSolicitudesCache;
  $('formulariosAdminBody').innerHTML = filas.map((s) => formularioFilaHTML(s, true)).join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin solicitudes todavía.</td></tr>';
}

// Documento formal del trámite — mismo formato que el resto de documentos técnicos de la app
// (letterhead + meta-grid + bloque de firma), puerto de generarDocumentoFirmadoHTML() del
// prototipo real, adaptado a las columnas reales de formularios_solicitudes y sin mencionar
// Signaturit en ningún sitio (migración 0036: firma electrónica simple interna, sin proveedor
// externo — decisión de César por coste).
function generarDocumentoFormularioHTML(s) {
  const t = s.personas_trabajadoras || {};
  const plantilla = s.formularios_plantillas || {};
  const detalleHtml = (s.detalle || '').trim()
    ? s.detalle
        .split('\n')
        .map((l) => (l.trim() ? `<p style="margin:0 0 8px;">${l.replace(/</g, '&lt;')}</p>` : ''))
        .join('')
    : '<p style="margin:0 0 8px;color:#64748b;">(sin detalle adicional)</p>';
  const fechaSolicitud = fechaCorta((s.fecha_solicitud || '').slice(0, 10));
  const estaFirmado = s.estado !== 'pendiente';
  const firmaBloque = estaFirmado
    ? `<div class="signature-box">
        <span class="badge-signed">✓ FIRMADO ELECTRÓNICAMENTE</span>
        <p style="margin:0 0 4px;"><b>Firmante:</b> ${s.firma_nombre || t.nombre || '—'}</p>
        <p style="margin:0 0 4px;"><b>Fecha y hora de firma:</b> ${s.fecha_firma ? new Date(s.fecha_firma).toLocaleString('es-ES') : '—'}</p>
        ${s.firma_ref ? `<p style="margin:0 0 4px;"><b>Referencia de integridad:</b> ${s.firma_ref}</p>` : ''}
        <p style="margin:0;font-size:12px;color:#065f46;">La persona firmante declaró que los datos incluidos en este documento son correctos y firmó electrónicamente mediante la firma simple interna de la plataforma (sin proveedor externo), con validez conforme al Reglamento (UE) 910/2014 (eIDAS) y la Ley 6/2020.</p>
      </div>`
    : `<div class="signature-box" style="background:#fffbeb;border-color:#d97706;">
        <span class="badge-signed" style="background:#d97706;">⏳ PENDIENTE DE FIRMA</span>
        <p style="margin:0;font-size:12px;color:#92400e;">La persona trabajadora todavía no ha firmado este trámite.</p>
      </div>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${plantilla.nombre || s.plantilla_id} — ${t.nombre || ''}</title>
<style>
body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.5;}
.letterhead{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #166534;padding-bottom:14px;margin-bottom:24px;}
.brand{font-size:22px;font-weight:bold;color:#166534;}
.doc-title{font-size:18px;font-weight:bold;margin:18px 0 4px;}
.doc-block{font-size:12px;color:#475569;margin-bottom:4px;}
.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;background:#f1f5f9;border-radius:8px;padding:14px 18px;margin:14px 0 22px;font-size:13px;}
.meta-grid div b{display:block;font-size:11px;color:#475569;font-weight:normal;}
.section-title{font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;color:#166534;margin:20px 0 8px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;}
.signature-box{margin-top:32px;border:2px solid #166534;border-radius:10px;padding:16px 20px;background:#ecfdf5;}
.badge-signed{display:inline-block;background:#166534;color:#fff;font-size:11px;font-weight:bold;padding:3px 10px;border-radius:999px;margin-bottom:8px;}
.footer-note{margin-top:26px;font-size:10px;color:#64748b;}
</style></head><body>
<div class="letterhead"><div class="brand">Personal4Pax</div><div style="text-align:right;font-size:12px;color:#475569;">Documento generado automáticamente<br>${fechaSolicitud}</div></div>
<div class="doc-title">${plantilla.nombre || s.plantilla_id}</div>
<div class="doc-block">${plantilla.bloque || '—'}</div>
<div class="meta-grid">
  <div><b>Persona trabajadora</b>${t.nombre || '—'}</div>
  <div><b>Fecha de la solicitud</b>${fechaSolicitud}</div>
  <div><b>Puesto</b>${t.puesto || '—'}</div>
  <div><b>Centro de trabajo</b>${t.centros_trabajo ? t.centros_trabajo.nombre : '—'}</div>
  <div><b>Estado del trámite</b>${formularioEstadoLabel(s)}</div>
  <div><b>DNI/NIE</b>${t.dni_nie || '—'}</div>
</div>
<div class="section-title">Detalle de la solicitud</div>
${detalleHtml}
${firmaBloque}
<p class="footer-note">Documento generado por Personal4Pax a partir del formulario digital firmado por la persona trabajadora. Sustituye a la versión en papel a todos los efectos internos y de tramitación con la gestoría laboral.</p>
</body></html>`;
}

function verFormularioSolicitud(id) {
  const s = formulariosSolicitudesCache.find((x) => x.id === id);
  if (!s) return;
  const plantilla = s.formularios_plantillas || {};
  const t = s.personas_trabajadoras || {};
  const esUniformidad = plantilla.bloque === 'Uniformidad y EPI';
  const adjuntoHtml = s.adjunto_url
    ? `<div class="card card-pad" style="margin-top:10px;">
        <b style="font-size:12.5px;">📎 Documento adjuntado por la persona trabajadora</b>
        <p class="sub-c" style="margin:4px 0 8px;">${s.adjunto_nombre || 'documento'}</p>
        <button type="button" class="btn btn-secondary btn-sm" onclick="verAdjuntoFormulario('${s.id}')">👁 Ver documento adjunto</button>
      </div>`
    : plantilla.adjunto_obligatorio
      ? `<p class="sub-c" style="margin-top:10px;">Este trámite requiere adjunto y todavía no se ha subido ninguno.</p>`
      : '';
  $('verFormularioDetalle').innerHTML = `
    <p class="callout" style="margin:0 0 10px;">Al abrir este detalle, la persona trabajadora recibe automáticamente la confirmación de que RR.HH. ha recibido y revisado su formulario.</p>
    <div class="row-item"><span>Persona trabajadora</span><b>${t.nombre || '—'}</b></div>
    <div class="row-item"><span>Bloque</span><b>${plantilla.bloque || '—'}</b></div>
    <div class="row-item"><span>Estado</span><span class="badge2 ${BADGE_ESTADO[s.estado] || 'b-slate'}">${formularioEstadoLabel(s)}</span></div>
    ${s.fecha_programada ? `<div class="row-item"><span>Fecha programada</span><b>${new Date(s.fecha_programada).toLocaleString('es-ES')}</b></div>` : ''}
    ${adjuntoHtml}
    <div style="margin-top:12px;">
      <label style="margin-bottom:4px;">Documento — mismo formato que el resto de documentos técnicos de la aplicación (con trazabilidad de firma)</label>
      <iframe id="verFormularioDocFrame" title="Documento del formulario" style="width:100%;height:420px;border:1px solid var(--slate-300,#cbd5e1);border-radius:10px;background:#fff;"></iframe>
    </div>
    <div class="card card-pad" style="margin-top:12px;">
      <label style="margin-bottom:4px;">Destinatario del envío</label>
      <select id="verFormularioDestinatarioSelect" onchange="cambiarDestinatarioVerFormulario()"></select>
      <input type="text" id="verFormularioDestinatarioNuevo" placeholder="nueva-direccion@ejemplo.es" style="display:none;">
      <label style="display:none;align-items:center;gap:6px;font-size:11.5px;font-weight:400;color:var(--slate-600,#475569);" id="verFormularioGestoriaCheckWrap">
        <input type="checkbox" id="verFormularioEsGestoriaCheck" checked style="width:auto;margin:0;"> ${esUniformidad ? 'Es nuestra tienda/proveedor de uniformidad habitual — recordar como destinatario predeterminado' : 'Es la gestoría (colaborador habitual) — recordar como destinatario predeterminado'}
      </label>
      <label style="margin:10px 0 4px;">CC (copia) — opcional</label>
      <input type="text" id="verFormularioDestinatarioCC" placeholder="copia1@ejemplo.es, copia2@ejemplo.es">
      <p class="sub-c" style="margin:4px 0 0;">Varias direcciones separadas por coma. Precargada con RR.HH./Dirección por defecto — puedes editarla o vaciarla.</p>
    </div>
    ${(s.estado === 'enviado_proveedor' || s.estado === 'gestoria') ? `<p class="sub-c" style="margin:10px 0 0;color:#166534;font-weight:600;">✅ Ya enviado${s.destinatario_email ? ' a ' + s.destinatario_email : ''}${s.destinatario_cc_email ? ' · CC: ' + s.destinatario_cc_email : ''} — si vuelves a pulsar "Enviar", se reenviará de nuevo.</p>` : ''}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      <button type="button" class="btn btn-sm" onclick="reenviarFormularioADestinatario('${s.id}')">📧 Enviar a este destinatario</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="verDocumentoFormularioNuevaPestana('${s.id}')">📄 Abrir PDF</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="descargarDocumentoFormulario('${s.id}')">⬇ Descargar PDF</button>
    </div>`;
  $('verFormularioDocFrame').srcdoc = generarDocumentoFormularioHTML(s);
  poblarDestinatarioVerFormulario(s);
  $('modalVerFormulario').classList.remove('hidden');
  if (!s.leido_rrhh) marcarFormularioLeidoYNotificar(s);
}

// Marca el trámite como revisado por RR.HH. y avisa automáticamente a la persona trabajadora —
// mismo comportamiento que record.leido en verFormulario() del prototipo real.
async function marcarFormularioLeidoYNotificar(s) {
  s.leido_rrhh = true;
  const ahora = new Date().toISOString();
  const { error } = await sb.from('formularios_solicitudes').update({ leido_rrhh: true, leido_rrhh_en: ahora }).eq('id', s.id);
  if (error) return;
  const plantilla = s.formularios_plantillas || {};
  // RPC security definer (0039) en vez de insert directo: el cliente admin no tiene (ni debe tener)
  // permiso de insertar en notificaciones_cola por RLS — un insert directo aquí fallaba en silencio.
  await sb.rpc('encolar_notificacion', {
    p_trabajador_id: s.trabajador_id,
    p_hotel_id: s.hotel_id,
    p_tipo: 'formulario_revisado',
    p_titulo: '✅ Formulario recibido por RR.HH.',
    p_cuerpo: `RR.HH. ha revisado tu formulario "${plantilla.nombre || s.plantilla_id}".`,
    p_referencia_tabla: 'formularios_solicitudes',
    p_referencia_id: s.id
  });
  await registrarAuditoria('Formularios', 'Formulario leído por RR.HH.', `${plantilla.nombre || s.plantilla_id} — ${s.personas_trabajadoras ? s.personas_trabajadoras.nombre : '—'}`);
}

async function poblarDestinatarioVerFormulario(s) {
  const sel = $('verFormularioDestinatarioSelect');
  if (!sel) return;
  const esUniformidad = s.formularios_plantillas && s.formularios_plantillas.bloque === 'Uniformidad y EPI';
  const predeterminado = formulariosDestinatariosCache.find((d) => (esUniformidad ? d.predeterminado_uniformidad : d.predeterminado_gestoria));
  const actual = s.destinatario_email || (predeterminado ? predeterminado.email : null);
  sel.innerHTML =
    formulariosDestinatariosCache.map((d) => `<option value="${d.email}" ${d.email === actual ? 'selected' : ''}>${d.etiqueta || d.email}</option>`).join('') +
    '<option value="__nuevo__">+ Nueva dirección de correo…</option>';
  cambiarDestinatarioVerFormulario();
  // CC: si este envío ya tenía una copia registrada se respeta; si no, se precarga con el grupo
  // RR.HH./Dirección del hotel (mismo criterio que forwardToGestoria()/cc del HTML original) —
  // editable/vaciable antes de enviar.
  const ccInput = $('verFormularioDestinatarioCC');
  if (ccInput) {
    if (s.destinatario_cc_email) {
      ccInput.value = s.destinatario_cc_email;
    } else {
      const { data: ccDefault } = await sb.rpc('rrhh_emails_hotel');
      ccInput.value = ccDefault || '';
    }
  }
}

function cambiarDestinatarioVerFormulario() {
  const sel = $('verFormularioDestinatarioSelect');
  const nuevoWrap = $('verFormularioDestinatarioNuevo');
  const gestoriaWrap = $('verFormularioGestoriaCheckWrap');
  if (!sel || !nuevoWrap || !gestoriaWrap) return;
  const esNuevo = sel.value === '__nuevo__';
  nuevoWrap.style.display = esNuevo ? '' : 'none';
  gestoriaWrap.style.display = esNuevo ? 'flex' : 'none';
}

async function reenviarFormularioADestinatario(id) {
  const s = formulariosSolicitudesCache.find((x) => x.id === id);
  if (!s) return;
  // César: mismo modal/flujo para cualquier trámite firmado, pero el bloque "Uniformidad y EPI"
  // (f18, entrega inicial al alta) va a una tienda/proveedor colaborador, no a gestoría — RPC y
  // destinatario predeterminado propios (enviar_formulario_a_destinatario y predeterminado_gestoria
  // quedan intactos para el resto de trámites).
  const esUniformidad = s.formularios_plantillas && s.formularios_plantillas.bloque === 'Uniformidad y EPI';
  const sel = $('verFormularioDestinatarioSelect');
  let email = sel ? sel.value : null;
  if (email === '__nuevo__') {
    email = ($('verFormularioDestinatarioNuevo').value || '').trim();
    if (!email) {
      mostrarToast('⚠️ Indica la dirección de correo del destinatario', false);
      return;
    }
    const marcarPredeterminado = $('verFormularioEsGestoriaCheck').checked;
    if (marcarPredeterminado) {
      await sb.from('formularios_destinatarios').update(esUniformidad ? { predeterminado_uniformidad: false } : { predeterminado_gestoria: false }).eq('hotel_id', usuarioActual.hotel_id);
    }
    const nuevoDestinatario = {
      hotel_id: usuarioActual.hotel_id,
      email,
      etiqueta: marcarPredeterminado ? (esUniformidad ? 'Proveedor de uniformidad (colaborador habitual)' : 'Gestoría (colaborador habitual)') : email
    };
    if (esUniformidad) nuevoDestinatario.predeterminado_uniformidad = marcarPredeterminado;
    else nuevoDestinatario.predeterminado_gestoria = marcarPredeterminado;
    await sb.from('formularios_destinatarios').insert(nuevoDestinatario);
  }
  const cc = ($('verFormularioDestinatarioCC') ? $('verFormularioDestinatarioCC').value : '').trim();
  // RPC security definer (0061/0071): actualiza el estado/destinatario Y encola el envío real por
  // correo (Resend) en un solo paso, con comprobación de que el formulario es de tu hotel. p_cc_email
  // añade la(s) dirección(es) en copia — mismo criterio que forwardToGestoria() en el HTML original.
  const { error } = await sb.rpc(esUniformidad ? 'enviar_formulario_a_proveedor_uniformidad' : 'enviar_formulario_a_destinatario', {
    p_solicitud_id: id,
    p_destinatario_email: email,
    p_cc_email: cc || null
  });
  mostrarToast(error ? 'Error: ' + error.message : `Enviado a ${email}${cc ? ' · CC: ' + cc : ''} ✓`, !error);
  if (!error) {
    await registrarAuditoria('Formularios', esUniformidad ? 'Trámite de uniformidad reenviado a la tienda colaboradora' : 'Trámite reenviado a destinatario', `${id} → ${email}${cc ? ' · CC: ' + cc : ''}`);
    $('modalVerFormulario').classList.add('hidden');
    await cargarFormulariosAdmin();
  }
}

async function verAdjuntoFormulario(id) {
  const s = formulariosSolicitudesCache.find((x) => x.id === id);
  if (!s || !s.adjunto_url) return;
  const { data, error } = await sb.storage.from('formularios-adjuntos').createSignedUrl(s.adjunto_url, 3600);
  if (error) {
    mostrarToast('No se pudo abrir el adjunto: ' + error.message, false);
    return;
  }
  window.open(data.signedUrl, '_blank');
  await registrarAuditoria('Formularios', 'Visualización de adjunto', s.adjunto_nombre || s.adjunto_url);
}

// César (08/11/2026): "quiero que se abra como PDF y luego dentro del PDF puedas coger la opción de
// imprimir" — un PDF real generado en el navegador (html2pdf.js, cargado en index.html), no el HTML
// con un botón "Imprimir" de antes. Así el visor de PDF del propio navegador da ya, de serie, los
// botones de guardar/descargar e imprimir — no hace falta ningún paso intermedio.
const PDF_OPCIONES_DOCUMENTO = {
  margin: 10,
  image: { type: 'jpeg', quality: 0.95 },
  html2canvas: { scale: 2, useCORS: true },
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  pagebreak: { mode: ['css', 'legacy'] }
};

function nombreArchivoDocumentoFormulario(s) {
  const plantilla = s.formularios_plantillas || {};
  const t = s.personas_trabajadoras || {};
  return `${(plantilla.nombre || s.plantilla_id).replace(/[^\w]+/g, '_').slice(0, 60)}_${(t.nombre || '').replace(/[^\w]+/g, '_')}.pdf`;
}

function generarDocumentoFormularioPDFBlob(s) {
  return html2pdf().set(PDF_OPCIONES_DOCUMENTO).from(generarDocumentoFormularioHTML(s), 'string').outputPdf('blob');
}

// Abre una pestaña nueva YA (respuesta directa al clic, para que el navegador no la bloquee como
// pop-up) y la navega al PDF en cuanto está generado — evita el fallo de "no funciona" que daba
// window.open() cuando se llamaba después de un await.
function verDocumentoFormularioNuevaPestana(id) {
  const s = formulariosSolicitudesCache.find((x) => x.id === id);
  if (!s) return;
  const ventana = window.open('', '_blank');
  if (ventana) {
    ventana.document.title = 'Generando PDF…';
    ventana.document.write('<p style="font-family:Arial,sans-serif;color:#64748b;padding:40px;text-align:center;">Generando PDF…</p>');
  }
  generarDocumentoFormularioPDFBlob(s)
    .then((blob) => {
      if (ventana && !ventana.closed) {
        const url = ventana.URL.createObjectURL(blob);
        ventana.location.href = url;
        setTimeout(() => { try { ventana.URL.revokeObjectURL(url); } catch (err) {} }, 60000);
      } else {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    })
    .catch((e) => {
      if (ventana && !ventana.closed) ventana.document.body.innerHTML = `<p style="font-family:Arial,sans-serif;color:#b91c1c;padding:40px;">No se pudo generar el PDF: ${e.message}</p>`;
      mostrarToast('No se pudo generar el PDF: ' + e.message, false);
    });
}

function descargarDocumentoFormulario(id) {
  const s = formulariosSolicitudesCache.find((x) => x.id === id);
  if (!s) return;
  const plantilla = s.formularios_plantillas || {};
  const t = s.personas_trabajadoras || {};
  html2pdf()
    .set({ ...PDF_OPCIONES_DOCUMENTO, filename: nombreArchivoDocumentoFormulario(s) })
    .from(generarDocumentoFormularioHTML(s), 'string')
    .save()
    .then(() => {
      registrarAuditoria('Formularios', 'Descarga de documento', `${plantilla.nombre || s.plantilla_id} — ${t.nombre || '—'}`);
      mostrarToast('PDF descargado ✓', true);
    })
    .catch((e) => mostrarToast('No se pudo generar el PDF: ' + e.message, false));
}

function verCatalogoFormularios() {
  const el = $('formulariosCatalogoGrid');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Mismo mecanismo que exportarManualEmpresaDocx() — HTML con espacios de nombres de Word, no un
// .docx (OOXML) real fabricado sin librería.
function exportarCatalogoFormulariosDocx() {
  const porBloque = {};
  formulariosPlantillasCache.forEach((p) => {
    porBloque[p.bloque] = porBloque[p.bloque] || [];
    porBloque[p.bloque].push(p);
  });
  const cuerpo = Object.keys(porBloque)
    .map(
      (bloque) => `<h2>${BLOQUE_ICONOS[bloque] || '📄'} ${bloque}</h2>
      <table><thead><tr><th>Trámite</th><th>Adjunto obligatorio</th></tr></thead><tbody>
        ${porBloque[bloque].map((p) => `<tr><td>${p.nombre}</td><td>${p.adjunto_obligatorio ? 'Sí' : 'No'}</td></tr>`).join('')}
      </tbody></table>`
    )
    .join('');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Catálogo de Formularios</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;} table{border-collapse:collapse;width:100%;margin:8px 0 18px;} th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;}</style>
</head><body><h1>Catálogo de Formularios — 17 trámites con firma obligatoria</h1>
<p>Cada trámite firmado por la persona trabajadora se notifica automáticamente a RR.HH. — firma electrónica simple interna, sin proveedor externo.</p>
${cuerpo}</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Catalogo_de_Formularios.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  registrarAuditoria('Formularios', 'Descarga del Catálogo de Formularios', 'Documento (.doc compatible con Word)');
  mostrarToast('Catálogo de Formularios descargado ✓', true);
}

async function enviarFormularioGestoria(id) {
  const predeterminado = formulariosDestinatariosCache.find((d) => d.predeterminado_gestoria);
  if (!predeterminado) {
    mostrarToast('⚠️ No hay destinatario de gestoría predeterminado — ábrelo y usa "Enviar a este destinatario"', false);
    return;
  }
  // RPC security definer (0061/0071): mismo mecanismo que reenviarFormularioADestinatario —
  // actualiza y encola el envío real por correo en un solo paso. CC por defecto al grupo
  // RR.HH./Dirección (mismo criterio que forwardToGestoria() -> cc: 'rrhh@...' en el original).
  const { data: cc } = await sb.rpc('rrhh_emails_hotel');
  const { error } = await sb.rpc('enviar_formulario_a_destinatario', {
    p_solicitud_id: id,
    p_destinatario_email: predeterminado.email,
    p_cc_email: cc || null
  });
  mostrarToast(error ? 'Error: ' + error.message : `Reenviado a gestoría ✓${cc ? ' · CC: ' + cc : ''}`, !error);
  if (!error) {
    await registrarAuditoria('Formularios', 'Trámite reenviado a gestoría', id);
    await cargarFormulariosAdmin();
  }
}

// ---------- "✉️ Generar correo" a empresa de formación (C10 del prototipo) — con CC opcional al
// jefe/a de departamento de la persona solicitante (migración 0072). ------------------------------
let correoFormacionTarget = null;
async function abrirGenerarCorreoFormacion(id) {
  const s = formulariosSolicitudesCache.find((x) => x.id === id);
  if (!s) return;
  correoFormacionTarget = id;
  const plantilla = s.formularios_plantillas || {};
  const nombreTrabajador = s.personas_trabajadoras ? s.personas_trabajadoras.nombre : '—';
  $('correoFormacionSolicitudId').value = id;
  $('correoFormacionPara').value = '';
  $('correoFormacionCC').value = '';
  $('correoFormacionAsunto').value = `Solicitud de formación — ${nombreTrabajador}`;
  $('correoFormacionCuerpo').value = `Buenos días,\n\nSolicitamos información/plaza para la siguiente formación: ${plantilla.nombre || s.plantilla_id}.\n\nPersona trabajadora: ${nombreTrabajador}\nFecha de la solicitud: ${fechaCorta((s.fecha_solicitud || '').slice(0, 10))}\n\nQuedamos a la espera de su confirmación.\n\nUn saludo,\nDepartamento de RR.HH.`;
  $('modalCorreoFormacion').classList.remove('hidden');
  if (s.trabajador_id) {
    const { data: ccJefe } = await sb.rpc('jefe_departamento_email_de', { p_trabajador_id: s.trabajador_id });
    if (correoFormacionTarget === id && ccJefe) $('correoFormacionCC').value = ccJefe;
  }
}
function cerrarGenerarCorreoFormacion() {
  $('modalCorreoFormacion').classList.add('hidden');
  correoFormacionTarget = null;
}
async function enviarCorreoFormacion() {
  const id = $('correoFormacionSolicitudId').value;
  const s = formulariosSolicitudesCache.find((x) => x.id === id);
  const para = $('correoFormacionPara').value.trim();
  const cc = $('correoFormacionCC').value.trim();
  const asunto = $('correoFormacionAsunto').value.trim();
  const cuerpo = $('correoFormacionCuerpo').value.trim();
  if (!para) {
    mostrarToast('⚠️ Indica la dirección de correo de la empresa de formación', false);
    return;
  }
  if (!asunto) {
    mostrarToast('⚠️ Indica el asunto', false);
    return;
  }
  if (!cuerpo) {
    mostrarToast('⚠️ Escribe el cuerpo del correo', false);
    return;
  }
  const { error } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: para,
    p_asunto: asunto,
    p_cuerpo: cuerpo,
    p_cc_email: cc || null,
    p_referencia_tabla: 'formularios_solicitudes',
    p_referencia_id: id
  });
  mostrarToast(error ? 'Error: ' + error.message : `Correo enviado ✓ Para: ${para}${cc ? ' · CC: ' + cc : ''}`, !error);
  if (!error) {
    await registrarAuditoria(
      'Formación',
      'Correo enviado a empresa de formación',
      `${s && s.personas_trabajadoras ? s.personas_trabajadoras.nombre : id} — Para: ${para}${cc ? ' · CC: ' + cc : ''}`
    );
    cerrarGenerarCorreoFormacion();
  }
}

async function aprobarFormacionSolicitud(id) {
  const { error } = await sb.from('formularios_solicitudes').update({ estado: 'aprobado' }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Formación aprobada ✓', !error);
  if (!error) {
    await registrarAuditoria('Formación', 'Solicitud de formación aprobada por RR.HH.', id);
    await cargarFormulariosAdmin();
    if ($('formacionSolicitudesBody')) await cargarFormacionAdmin();
  }
}

// Modal "Programar fecha y hora de formación" (Fecha/Hora/Duración) — sustituye al prompt() del
// navegador que se usaba antes, sin campos separados ni duración. formacionSolicitudesCache se
// rellena en cargarFormacionAdmin(); si esta solicitud no está ahí (se abrió desde Formularios y
// Firma, no desde Formación obligatoria) se cae a formulariosSolicitudesCache.
function abrirProgramarFormacion(id) {
  const s = (formacionSolicitudesCache.find((x) => x.id === id)) || formulariosSolicitudesCache.find((x) => x.id === id);
  if (!s) return;
  $('programarFormacionId').value = id;
  $('programarFormacionPersona').textContent = s.personas_trabajadoras ? s.personas_trabajadoras.nombre : '—';
  $('programarFormacionTramite').textContent = (s.formularios_plantillas && s.formularios_plantillas.nombre) || 'Solicitud de formación / curso profesional';
  $('programarFormacionFecha').value = '';
  $('programarFormacionHora').value = '';
  $('programarFormacionDuracion').value = 4;
  $('modalProgramarFormacion').classList.remove('hidden');
}
function cerrarProgramarFormacion() {
  $('modalProgramarFormacion').classList.add('hidden');
}
async function confirmarProgramarFormacion() {
  const id = $('programarFormacionId').value;
  const fechaStr = $('programarFormacionFecha').value;
  const horaStr = $('programarFormacionHora').value;
  const duracion = $('programarFormacionDuracion').value ? parseFloat($('programarFormacionDuracion').value) : null;
  if (!fechaStr || !horaStr) return mostrarToast('⚠️ Indica la fecha y la hora', false);
  const fecha = new Date(`${fechaStr}T${horaStr}`);
  if (Number.isNaN(fecha.getTime())) return mostrarToast('Fecha no válida', false);
  const { error } = await sb
    .from('formularios_solicitudes')
    .update({ fecha_programada: fecha.toISOString(), fecha_programada_en: new Date().toISOString(), duracion_horas: duracion })
    .eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Fecha programada ✓ Pendiente de firma de la persona trabajadora', !error);
  if (!error) {
    await registrarAuditoria('Formación', 'Fecha de formación programada', fecha.toLocaleString('es-ES'));
    cerrarProgramarFormacion();
    await cargarFormulariosAdmin();
    if ($('formacionSolicitudesBody')) await cargarFormacionAdmin();
  }
}

// ---------- "👁 Ver solicitud" de formación (f16) — a diferencia del visor genérico de
// formularios (verFormularioSolicitud, pensado para documentos ya firmados que se reenvían), este
// permite corregir el texto libre que escribió la persona trabajadora (relación con el puesto /
// ROI / desarrollo profesional) antes de aprobar — igual que el prototipo. ----------
function verSolicitudFormacion(id) {
  const s = formacionSolicitudesCache.find((x) => x.id === id);
  if (!s) return;
  $('verSolicitudFormacionId').value = id;
  $('verSolicitudFormacionPersona').textContent = s.personas_trabajadoras ? s.personas_trabajadoras.nombre : '—';
  $('verSolicitudFormacionTramite').textContent = 'Solicitud de formación / curso profesional';
  $('verSolicitudFormacionFecha').textContent = fechaCorta((s.fecha_solicitud || '').slice(0, 10));
  const estadoLabel = s.estado === 'aprobado' ? 'Formación aprobada por RR.HH.' : STATUS_FORMULARIOS[s.estado] || s.estado;
  $('verSolicitudFormacionEstado').textContent = estadoLabel;
  $('verSolicitudFormacionEstado').className = 'badge2 ' + (BADGE_ESTADO[s.estado] || 'b-slate');
  $('verSolicitudFormacionDetalle').value = s.detalle || '';
  $('modalVerSolicitudFormacion').classList.remove('hidden');
}
function cerrarVerSolicitudFormacion() {
  $('modalVerSolicitudFormacion').classList.add('hidden');
}
async function guardarSolicitudFormacionDetalle() {
  const id = $('verSolicitudFormacionId').value;
  const detalle = $('verSolicitudFormacionDetalle').value.trim();
  const { error } = await sb.from('formularios_solicitudes').update({ detalle }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Cambios guardados ✓', !error);
  if (!error) {
    await registrarAuditoria('Formación', 'Solicitud de formación corregida por RR.HH.', id);
    cerrarVerSolicitudFormacion();
    await cargarFormulariosAdmin();
    if ($('formacionSolicitudesBody')) await cargarFormacionAdmin();
  }
}

// Circuito completo (fecha/firma/escalado/cuadrante), mismo patrón que vigilancia_aprobar_cita/
// formacion_prl_aprobar_fecha (migración 0068): solo aquí se toca el cuadrante, y solo si la
// formación coincide con un turno real de ese día — el mensaje devuelto por el RPC dice exactamente
// qué pasó, para no inventarlo en el cliente.
async function aprobarFechaFormacionSolicitud(id) {
  const { data: mensaje, error } = await sb.rpc('formacion_general_aprobar_fecha', { p_id: id });
  mostrarToast(error ? 'Error: ' + error.message : `Fecha de formación aprobada ✓ ${mensaje || ''}`, !error);
  if (!error) {
    await registrarAuditoria('Formación', 'Fecha de formación aprobada por RR.HH.', mensaje || id);
    await cargarFormulariosAdmin();
    if ($('formacionSolicitudesBody')) await cargarFormacionAdmin();
  }
}

// ---------- Organigrama (admin edit) ----------
let organigramaCache = [];

async function cargarOrganigramaAdmin() {
  const { data } = await sb.from('organigrama_departamentos').select('*').order('nivel');
  organigramaCache = data || [];
  const niveles = {};
  organigramaCache.forEach((n) => {
    (niveles[n.nivel] = niveles[n.nivel] || []).push(n);
  });
  $('organigramaAdminBody').innerHTML =
    Object.keys(niveles)
      .sort((a, b) => a - b)
      .map((niv) =>
        niveles[niv]
          .map((n) => {
            const padre = organigramaCache.find((x) => x.id === n.reporta_a_id);
            const miembros = Array.isArray(n.miembros) ? n.miembros : [];
            const comunicaCon = (Array.isArray(n.comunica_con_ids) ? n.comunica_con_ids : [])
              .map((cid) => organigramaCache.find((x) => x.id === cid))
              .filter(Boolean);
            return `<div class="card card-pad">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div><b style="font-size:13px;">${n.dept}</b><p class="sub-c" style="margin:2px 0 0;">Nivel ${n.nivel}${padre ? ' · reporta a ' + padre.dept : ''}</p></div>
                <span class="badge2 b-brand">${n.responsable_nombre || 'Vacante'}</span>
              </div>
              ${miembros.length ? `<p class="sub-c" style="margin-top:8px;">👥 ${miembros.join(', ')}</p>` : ''}
              ${comunicaCon.length ? `<p class="sub-c" style="margin-top:6px;">${comunicaCon.map((c) => `<span class="badge2 b-sky">🔗 ${c.dept}</span>`).join(' ')}</p>` : ''}
              <div style="margin-top:10px;"><button type="button" class="btn btn-secondary btn-sm" onclick="abrirModalDepartamento('${n.id}')">✎ Editar</button></div>
            </div>`;
          })
          .join('')
      )
      .join('') || '<p class="sub-c">Sin departamentos todavía.</p>';
}

function abrirModalDepartamento(id) {
  const n = id ? organigramaCache.find((x) => x.id === id) : null;
  $('modalDepartamentoTitulo').textContent = n ? 'Editar — ' + n.dept : 'Nuevo departamento';
  $('odId').value = n ? n.id : '';
  $('odDept').value = n ? n.dept : '';
  $('odResponsableNombre').value = n ? n.responsable_nombre || '' : '';
  $('odNivel').value = n ? n.nivel : 1;
  $('odMiembros').value = n && Array.isArray(n.miembros) ? n.miembros.join(', ') : '';
  const opciones = ['<option value="">— Ninguno (nivel superior) —</option>'].concat(
    organigramaCache.filter((x) => x.id !== id).map((x) => `<option value="${x.id}">${x.dept}</option>`)
  );
  $('odReportaA').innerHTML = opciones.join('');
  $('odReportaA').value = n && n.reporta_a_id ? n.reporta_a_id : '';
  const comunicaConIds = n && Array.isArray(n.comunica_con_ids) ? n.comunica_con_ids : [];
  $('odComunicaCon').innerHTML = organigramaCache
    .filter((x) => x.id !== id)
    .map((x) => `<option value="${x.id}" ${comunicaConIds.includes(x.id) ? 'selected' : ''}>${x.dept}</option>`)
    .join('');
  $('modalDepartamento').classList.remove('hidden');
}

function cerrarModalDepartamento() {
  $('modalDepartamento').classList.add('hidden');
}

async function guardarDepartamento(e) {
  e.preventDefault();
  const id = $('odId').value;
  const miembros = $('odMiembros')
    .value.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const comunica_con_ids = Array.from($('odComunicaCon').selectedOptions).map((o) => o.value);
  const payload = {
    dept: $('odDept').value.trim(),
    responsable_nombre: $('odResponsableNombre').value.trim() || 'Vacante',
    nivel: parseInt($('odNivel').value, 10) || 1,
    reporta_a_id: $('odReportaA').value || null,
    miembros,
    comunica_con_ids
  };
  let error;
  if (id) {
    ({ error } = await sb.from('organigrama_departamentos').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('organigrama_departamentos').insert({ ...payload, hotel_id: usuarioActual.hotel_id }));
  }
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Departamento guardado ✓', !error);
  if (!error) {
    await registrarAuditoria('Organigrama', id ? 'Departamento editado' : 'Departamento creado', payload.dept);
    cerrarModalDepartamento();
    await cargarOrganigramaAdmin();
  }
}

// ---------- Descripción de puesto (admin) ----------
let descPuestoCache = [];
let puestoEvaluacionesCache = [];

// Reparte el 65% restante (100% − Actitud 20% − Reglamento interno 15%) a partes iguales entre
// las funciones propias del puesto — mismo criterio que el prototipo (calcularPesosDefault).
function calcularPesosDefaultPuesto(nFunciones) {
  if (!nFunciones) return [];
  const restante = 65;
  const base = Math.floor(restante / nFunciones);
  const pesos = new Array(nFunciones).fill(base);
  let resto = restante - base * nFunciones;
  for (let i = 0; i < resto; i++) pesos[i] += 1;
  return pesos;
}
// Funciones "a efectos de evaluación": las propias del puesto + los 2 criterios transversales,
// siempre en este orden — no se guardan en desc.funciones para no mezclarlas con la edición libre.
const CRITERIOS_TRANSVERSALES_EVAL = ['Actitud ante el trabajo, el equipo y la clientela', 'Cumplimiento del reglamento interno de la empresa'];
const PESOS_TRANSVERSALES_EVAL = [20, 15];
function funcionesEvaluacionPuesto(d) {
  return [...(d.funciones || []), ...CRITERIOS_TRANSVERSALES_EVAL];
}
function pesosEvaluacionPuesto(d) {
  const funciones = d.funciones || [];
  const pesos = funciones.length === (d.pesos || []).length ? d.pesos : calcularPesosDefaultPuesto(funciones.length);
  return [...pesos, ...PESOS_TRANSVERSALES_EVAL];
}
function findUltimaEvaluacionPuesto(trabajadorId, puestoKey) {
  const mias = puestoEvaluacionesCache.filter((e) => e.trabajador_id === trabajadorId && e.puesto_key === puestoKey);
  return mias.length ? mias[0] : null; // viene ordenado created_at desc desde cargarDescPuesto()
}

// César: "no has arreglado lo de evaluación del desempeño" — el modal se abría con FUNCIÓN vacía y
// VALORACIÓN/EJECUCIÓN a 0, pese a que la migración 0084 ya sembró las funciones y pesos reales de
// los 8 puestos. Esa siembra fue un UPDATE de una sola vez sobre las filas que existían en ese
// momento: cualquier fila de puesto_descripciones creada después (otro hotel, "Clonar puesto", o
// simplemente una fila que en ese momento aún no existía) se quedó con funciones=[] para siempre, sin
// ningún mecanismo que la rellenara. En vez de depender de que la migración haya corrido en el
// momento justo, se repara aquí mismo, en tiempo real, cada vez que se carga la pantalla.
const FUNCIONES_BASE_PUESTO = {
  sala: ['Recepción y acomodo de la clientela bajo protocolos de cortesía y comunicación avanzada', 'Toma de comandas (incluyendo asesoramiento de alérgenos y maridajes básicos — Niveles 1 y 2)', 'Montaje, mise en place, servicio en mesa y desmontaje', 'Control de alérgenos y prevención de contaminación cruzada en sala', 'Cobro, cierre de caja del turno y control de registros asociados'],
  cocina: ['Preparación, elaboración y presentación de platos según los escandallos y fichas técnicas del hotel', 'Aplicación rigurosa de las normas de higiene, control de temperaturas y APPCC', 'Correcto almacenamiento de materias primas aplicando criterios FIFO/FEFO y sectorización de cámaras', 'Mantenimiento de la limpieza y orden absoluto en su zona de trabajo', 'Cumplimentación de los registros diarios de control de puntos críticos'],
  recepcion_hotel: ['Atención personalizada al cliente desde su llegada, garantizando los estándares de bienvenida premium', 'Gestión de reservas, perfiles VIP, asignación de habitaciones y cobros', 'Coordinación transversal con Pisos y Mantenimiento para incidencias de habitaciones', 'Resolución asertiva de quejas y reclamaciones aplicando protocolos de gestión emocional', 'Registro y control de documentación legal y normativa de seguridad'],
  pisos: ['Limpieza y arreglo de habitaciones de salida, de estancia y zonas comunes asignadas', 'Control y reposición de amenities de alta gama y lencería según el estándar de la marca', 'Detección y comunicación inmediata de averías o incidencias al departamento de Mantenimiento', 'Aplicación de protocolos de seguridad, prevención de riesgos ergonómicos y gestión adecuada de productos de limpieza químicos', 'Registro de habitaciones limpias y control de objetos olvidados (Lost & Found)'],
  mantenimiento: ['Ejecución de reparaciones de electricidad, fontanería, carpintería, climatización y pintura', 'Revisión periódica de sistemas técnicos y preventivos (climatización, iluminación, piscinas, etc.)', 'Registro diario de incidencias técnicas en el software del hotel y cierre de partes de trabajo', 'Actuación rápida y discreta ante incidencias en zonas de clientes o habitaciones ocupadas', 'Cumplimiento estricto de las normativas de seguridad y gestión de residuos peligrosos'],
  recepcion: ['Gestión y archivo de documentación administrativa', 'Soporte contable y facturación', 'Atención telefónica y por correo electrónico', 'Coordinación con gestoría y proveedores'],
  reformas: ['Ejecución de trabajos de albañilería/reforma según indicaciones', 'Uso correcto de maquinaria y herramientas de obra', 'Cumplimiento estricto de la normativa de PRL en obra', 'Orden y limpieza de la zona de trabajo'],
  oficina: ['Gestión administrativa, contable o de RR.HH. según el puesto', 'Tratamiento de datos personales conforme al RGPD', 'Coordinación con el resto de departamentos', 'Custodia y archivo de documentación sensible'],
  // Añadidos tras la migración 0086 (puestos piscina/jardineria) — sin esta entrada, cualquier
  // fila de puesto_descripciones de estos dos puestos que se cree sin funciones (otro hotel futuro,
  // "Clonar puesto") se quedaría vacía igual que le pasó a los 8 originales antes de la 0084.
  piscina: ['Vigilancia activa del baño y actuación inmediata en primeros auxilios y rescate acuático (socorrismo)', 'Control y registro periódico de parámetros químicos del agua (cloro, pH) y dosificación segura de productos', 'Mantenimiento, limpieza y puesta a punto de vasos, playas, depuradoras y equipos de piscina', 'Aplicación de los protocolos de aforo, señalización y prevención de riesgos en zonas húmedas', 'Cumplimentación de los registros sanitarios obligatorios de la instalación (libro de piscina)'],
  jardineria: ['Riego, abonado, poda y mantenimiento general de jardines, césped y zonas verdes', 'Poda de árboles y palmeras, incluidos trabajos en altura con arnés y línea de vida', 'Manejo seguro de maquinaria y herramientas de jardinería (desbrozadoras, motosierras, etc.)', 'Control fitosanitario y aplicación de tratamientos conforme a la normativa vigente', 'Orden, limpieza y recogida de residuos vegetales de las zonas de trabajo']
};
async function _repararFuncionesPuestoVacias(filas) {
  const rotas = (filas || []).filter((d) => (!d.funciones || !d.funciones.length) && FUNCIONES_BASE_PUESTO[d.puesto_key]);
  if (!rotas.length) return;
  await Promise.all(
    rotas.map(async (d) => {
      const funciones = FUNCIONES_BASE_PUESTO[d.puesto_key];
      const pesos = calcularPesosDefaultPuesto(funciones.length);
      const { error } = await sb.from('puesto_descripciones').update({ funciones, pesos }).eq('id', d.id);
      if (!error) {
        d.funciones = funciones;
        d.pesos = pesos;
      }
    })
  );
}

async function cargarDescPuesto() {
  const [{ data }, { data: evals }] = await Promise.all([
    sb.from('puesto_descripciones').select('*').order('puesto_key'),
    sb.from('puesto_evaluaciones').select('*').order('created_at', { ascending: false })
  ]);
  descPuestoCache = data || [];
  await _repararFuncionesPuestoVacias(descPuestoCache);
  puestoEvaluacionesCache = evals || [];
  $('descPuestoBody').innerHTML =
    descPuestoCache
      .map((d) => {
        const equipo = empleadosCache.filter((p) => p.puesto_key === d.puesto_key && (p.estado_laboral || 'Activo') === 'Activo');
        const filasEquipo = equipo
          .map((p) => {
            const evalUltima = findUltimaEvaluacionPuesto(p.id, d.puesto_key);
            const evalBadge = evalUltima
              ? `<span class="badge2 ${evalUltima.total_ponderado >= 70 ? 'b-emerald' : evalUltima.total_ponderado >= 50 ? 'b-amber' : 'b-rose'}" title="Última evaluación · ${fechaCorta(evalUltima.created_at)}">${Number(evalUltima.total_ponderado).toFixed(1)}%</span>`
              : '<span class="sub-c">Sin evaluar</span>';
            return `<tr><td>${p.nombre}</td><td>${evalBadge}</td><td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirEvaluacionPuestoModal('${p.id}','${d.puesto_key}')">📊 Evaluar</button></td></tr>`;
          })
          .join('');
        return `<div class="card card-pad">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div><b style="font-size:13px;">${d.titulo}</b><p class="sub-c" style="margin:2px 0 0;">Puesto: ${d.puesto_key}</p></div>
            ${d.enviado_at ? '<span class="badge2 b-emerald">Enviada</span>' : '<span class="badge2 b-amber">Sin enviar</span>'}
          </div>
          <p class="sub-c" style="margin-top:8px;max-height:60px;overflow:hidden;">${d.contenido}</p>
          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="verDocDescPuesto('${d.id}')">👁 Ver documento</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="abrirModalDescPuesto('${d.id}')">✎ Editar</button>
            <button type="button" class="btn btn-sm" onclick="enviarDescPuesto('${d.id}')">✉ Enviar a firma</button>
          </div>
          <div style="margin-top:12px;border-top:1px solid var(--slate-200,#e2e8f0);padding-top:10px;">
            <b style="font-size:12px;">👥 Evaluación de desempeño del equipo</b>
            <table style="margin-top:6px;"><thead><tr><th>Persona trabajadora</th><th>Última evaluación</th><th></th></tr></thead>
            <tbody>${filasEquipo || '<tr><td colspan="3" class="sub-c" style="text-align:center;padding:8px;">Sin personas activas en este puesto.</td></tr>'}</tbody></table>
          </div>
        </div>`;
      })
      .join('') || '<p class="sub-c">Sin descripciones de puesto todavía.</p>';
}

function abrirModalDescPuesto(id) {
  const d = id ? descPuestoCache.find((x) => x.id === id) : null;
  $('modalDescPuestoTitulo').textContent = d ? 'Editar — ' + d.titulo : 'Nueva descripción de puesto';
  $('dpId').value = d ? d.id : '';
  $('dpPuestoKey').value = d ? d.puesto_key : '';
  $('dpTitulo').value = d ? d.titulo : '';
  $('dpContenido').value = d ? d.contenido : '';
  $('dpFunciones').value = d && d.funciones ? d.funciones.join('\n') : '';
  $('modalDescPuesto').classList.remove('hidden');
}

function cerrarModalDescPuesto() {
  $('modalDescPuesto').classList.add('hidden');
}

// Vista de solo lectura, íntegra (sin recortar), del documento — separada de "Editar"
// para que RR.HH. pueda consultar/imprimir el contenido completo tal como lo recibirá
// la persona trabajadora al enviarse a firma.
function verDocDescPuesto(id) {
  const d = descPuestoCache.find((x) => x.id === id);
  if (!d) return;
  $('verDocDescPuestoTitulo').textContent = d.titulo;
  $('verDocDescPuestoSub').textContent =
    'Puesto: ' + d.puesto_key + (d.enviado_at ? ' · Enviada a firma' : ' · Sin enviar todavía');
  $('verDocDescPuestoBody').innerHTML = d.contenido;
  $('modalVerDescPuesto').classList.remove('hidden');
}

function cerrarModalVerDescPuesto() {
  $('modalVerDescPuesto').classList.add('hidden');
}

async function guardarDescPuesto(e) {
  e.preventDefault();
  const id = $('dpId').value;
  const funciones = $('dpFunciones')
    .value.split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
  const payload = {
    puesto_key: $('dpPuestoKey').value.trim(),
    titulo: $('dpTitulo').value.trim(),
    contenido: $('dpContenido').value,
    funciones,
    pesos: calcularPesosDefaultPuesto(funciones.length),
    updated_at: new Date().toISOString()
  };
  let error;
  if (id) {
    ({ error } = await sb.from('puesto_descripciones').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('puesto_descripciones').insert({ ...payload, hotel_id: usuarioActual.hotel_id }));
  }
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Descripción guardada ✓', !error);
  if (!error) {
    cerrarModalDescPuesto();
    await cargarDescPuesto();
  }
}

// ---------- Evaluación de desempeño por puesto ----------
// La valoración del supervisor/a nunca puede superar el 100%. Valores en memoria (evaluacionCtx)
// mientras el modal está abierto; se persiste todo junto en guardarEvaluacionPuesto().
const NIVELES_EJECUCION_EVAL = ['Excelente', 'Buena', 'Aceptable', 'A mejorar'];
let evaluacionCtx = null; // {trabajadorId, trabajadorNombre, puestoKey, valores:[{valoracion,ejecucion}]}

function abrirEvaluacionPuestoModal(trabajadorId, puestoKey) {
  const d = descPuestoCache.find((x) => x.puesto_key === puestoKey);
  const p = empleadosCache.find((x) => x.id === trabajadorId);
  if (!d || !p) return;
  const funciones = funcionesEvaluacionPuesto(d);
  const previa = findUltimaEvaluacionPuesto(trabajadorId, puestoKey);
  const valoresPrevios = previa && Array.isArray(previa.valores) ? previa.valores : [];
  const valores = funciones.map((f, i) => (valoresPrevios[i] ? { ...valoresPrevios[i] } : { valoracion: 0, ejecucion: '' }));
  evaluacionCtx = { trabajadorId, trabajadorNombre: p.nombre, puestoKey, valores };
  $('evaluacionPuestoEmployee').textContent = p.nombre;
  $('evaluacionPuestoPuesto').textContent = d.titulo;
  renderEvaluacionPuestoTabla();
  $('modalEvaluacionPuesto').classList.remove('hidden');
}

function cerrarEvaluacionPuestoModal() {
  $('modalEvaluacionPuesto').classList.add('hidden');
  evaluacionCtx = null;
}

function renderEvaluacionPuestoTabla() {
  const body = $('evaluacionPuestoBody');
  if (!body || !evaluacionCtx) return;
  const d = descPuestoCache.find((x) => x.puesto_key === evaluacionCtx.puestoKey);
  if (!d) return;
  const funciones = funcionesEvaluacionPuesto(d);
  const pesos = pesosEvaluacionPuesto(d);
  body.innerHTML = funciones
    .map((f, i) => {
      const peso = pesos[i] ?? 0;
      const v = evaluacionCtx.valores[i];
      const colValoracion = `<input type="number" class="form-select" min="0" max="100" style="width:90px;" value="${v.valoracion || 0}" oninput="actualizarValoracionEvaluacionPuesto(${i}, this.value)">`;
      const colEjecucion = `<select class="form-select" style="min-width:150px;" onchange="actualizarEjecucionEvaluacionPuesto(${i}, this.value)">
        <option value="">—</option>
        ${NIVELES_EJECUCION_EVAL.map((n) => `<option value="${n}" ${v.ejecucion === n ? 'selected' : ''}>${n}</option>`).join('')}
      </select>`;
      return `<tr><td style="max-width:260px;font-size:12.5px;">${f}</td><td style="text-align:center;">${peso}%</td><td>${colValoracion}</td><td>${colEjecucion}</td></tr>`;
    })
    .join('');
  renderEvaluacionPuestoTotal();
}

function actualizarValoracionEvaluacionPuesto(idx, valorStr) {
  if (!evaluacionCtx) return;
  let v = parseInt(valorStr, 10);
  if (Number.isNaN(v)) v = 0;
  if (v > 100) {
    v = 100;
    mostrarToast('⚠️ La valoración no puede superar el 100%', false);
  }
  if (v < 0) v = 0;
  evaluacionCtx.valores[idx].valoracion = v;
  renderEvaluacionPuestoTotal();
}

function actualizarEjecucionEvaluacionPuesto(idx, valor) {
  if (!evaluacionCtx) return;
  evaluacionCtx.valores[idx].ejecucion = valor;
}

function renderEvaluacionPuestoTotal() {
  const el = $('evaluacionPuestoTotal');
  if (!el || !evaluacionCtx) return;
  const d = descPuestoCache.find((x) => x.puesto_key === evaluacionCtx.puestoKey);
  if (!d) return;
  const pesos = pesosEvaluacionPuesto(d);
  const total = evaluacionCtx.valores.reduce((acc, v, i) => acc + ((v.valoracion || 0) * (pesos[i] || 0)) / 100, 0);
  el.textContent = `${total.toFixed(1)}%`;
}

// César: "se debe enviar firmado por quien realiza la valoración" — antes esta función insertaba
// la evaluación en silencio (sin ningún momento de firma, pese a guardar ya el nombre de quien
// evalúa) y no se enviaba a ningún sitio: ni a la persona evaluada (Mis Documentos) ni a ningún
// informe. Ahora el guardado ES la firma (firmado_en = ahora, por quien tiene la sesión abierta) y
// genera además el documento de entrega — mismo mecanismo ya usado por enviarDescPuesto() para
// repartir "documentos" a la persona trabajadora (migración 0089 añade firmado_en/documento_id).
async function guardarEvaluacionPuesto() {
  if (!evaluacionCtx) return;
  const d = descPuestoCache.find((x) => x.puesto_key === evaluacionCtx.puestoKey);
  if (!d) return;
  const pesos = pesosEvaluacionPuesto(d);
  const total = evaluacionCtx.valores.reduce((acc, v, i) => acc + ((v.valoracion || 0) * (pesos[i] || 0)) / 100, 0);
  const ahora = new Date().toISOString();
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: evaluacionCtx.trabajadorId,
    puesto_key: evaluacionCtx.puestoKey,
    evaluador: usuarioActual.nombre,
    valores: evaluacionCtx.valores,
    total_ponderado: Number(total.toFixed(2)),
    firmado_en: ahora
  };
  const { data: fila, error } = await sb.from('puesto_evaluaciones').insert(payload).select('id').single();
  if (error) {
    mostrarToast('Error al guardar: ' + error.message, false);
    return;
  }
  // Documento de entrega a la persona evaluada (Mis Documentos) — mismo patrón que
  // enviarDescPuesto(); si falla el envío, la evaluación ya firmada queda guardada igualmente,
  // pero se avisa para que RR.HH. no crea que se entregó cuando no fue así.
  const { data: doc, error: errDoc } = await sb
    .from('documentos')
    .insert({
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: evaluacionCtx.trabajadorId,
      tipo: 'evaluacion_desempeno',
      nombre: `Evaluación de desempeño — ${d.titulo}`,
      meta: `Firmada por ${usuarioActual.nombre} · Puntuación ponderada ${total.toFixed(1)}% · ${new Date(ahora).toLocaleDateString('es-ES')}`
    })
    .select('id')
    .single();
  if (!errDoc && doc) {
    await sb.from('puesto_evaluaciones').update({ documento_id: doc.id }).eq('id', fila.id);
  }
  mostrarToast(
    errDoc
      ? `Evaluación firmada ✓ (puntuación ${total.toFixed(1)}%), pero no se pudo enviar a Mis Documentos: ${errDoc.message}`
      : `Evaluación firmada y enviada a ${evaluacionCtx.trabajadorNombre} ✓ Puntuación ponderada: ${total.toFixed(1)}%`,
    !errDoc
  );
  await registrarAuditoria('Descripción de puesto', 'Evaluación de desempeño firmada y enviada', `${evaluacionCtx.trabajadorNombre} — ${d.titulo} — ${total.toFixed(1)}% — firmado por ${usuarioActual.nombre}`);
  cerrarEvaluacionPuestoModal();
  await cargarDescPuesto();
  await cargarInformesEvaluacionesDesempeno();
}

async function enviarDescPuesto(id) {
  const d = descPuestoCache.find((x) => x.id === id);
  if (!d) return;
  const { data: trabajadores, error: errT } = await sb
    .from('personas_trabajadoras')
    .select('id')
    .eq('puesto_key', d.puesto_key)
    .eq('estado_laboral', 'Activo');
  if (errT) {
    mostrarToast('Error al buscar personas trabajadoras: ' + errT.message, false);
    return;
  }
  const filas = (trabajadores || []).map((t) => ({
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: t.id,
    tipo: 'descripcion_puesto',
    nombre: d.titulo,
    meta: 'Descripción de puesto · ' + d.puesto_key
  }));
  if (filas.length) {
    const { error } = await sb.from('documentos').insert(filas);
    if (error) {
      mostrarToast('Error al enviar: ' + error.message, false);
      return;
    }
  }
  const { error: errUpd } = await sb.from('puesto_descripciones').update({ enviado_at: new Date().toISOString() }).eq('id', id);
  mostrarToast(errUpd ? 'Error: ' + errUpd.message : `Enviada a ${filas.length} persona(s) trabajadora(s) ✓`, !errUpd);
  if (!errUpd) await cargarDescPuesto();
}

// ---------- Uniformidad y EPIs (admin) ----------
let epiCatalogoCache = [];
let formacionRequisitosPuestoCache = [];
// Mismo mapa de colores por tipo que personalia-app-trabajador-src/main.js — usado por la
// Vista de la persona trabajadora (Mi Uniformidad y EPIs).
const BADGE_TIPO_EPI = { uniformidad: 'b-brand', calzado: 'b-sky', epi: 'b-amber' };
const ICONO_TIPO_EPI = { uniformidad: '👔', calzado: '👞', epi: '🥽' };
const LABEL_TIPO_EPI = { uniformidad: 'Uniformidad', calzado: 'Calzado', epi: 'EPI' };

// ---- Motor de coste de EPI/Uniformidad y de Formación obligatoria por puesto — fuente única -----
// usada tanto por esta pantalla como por cargarDireccionEjecutivaAdmin() (Panel de Dirección /
// Informes), para no repetir la fórmula en dos sitios. El de EPI replica exactamente el criterio
// del prototipo: ×3 dotaciones/año en artículos de "uniformidad", 1 ud en calzado y EPI.
function calcularCosteEpiPuesto(itemsCatalogo, puestoKey) {
  const delPuesto = (itemsCatalogo || []).filter((i) => i.puesto_key === puestoKey);
  const uniforme = delPuesto.filter((i) => i.tipo === 'uniformidad').reduce((s, i) => s + Number(i.coste || 0), 0) * 3;
  const calzado = delPuesto.filter((i) => i.tipo === 'calzado').reduce((s, i) => s + Number(i.coste || 0), 0);
  const epis = delPuesto.filter((i) => i.tipo === 'epi').reduce((s, i) => s + Number(i.coste || 0), 0);
  return uniforme + calzado + epis;
}
// Formación obligatoria por puesto — usa formacion_requisitos_puesto (migración 0076) para saber
// qué cursos de formacion_cursos_catalogo aplican a cada puesto_key. Antes de esta tabla puente,
// formacionPorPuesto() del Panel de Dirección usaba, a falta de otra cosa, una media plana del
// catálogo igual para todos los puestos — esto la sustituye por el desglose real.
function calcularFormacionPuesto(requisitos, catalogoCursos, puestoKey) {
  const claves = new Set((requisitos || []).filter((r) => r.puesto_key === puestoKey).map((r) => r.curso_clave));
  const cursos = (catalogoCursos || []).filter((c) => claves.has(c.clave));
  return {
    cursos,
    coste: cursos.reduce((s, c) => s + Number(c.coste || 0), 0),
    horas: cursos.reduce((s, c) => s + Number(c.horas || 0), 0)
  };
}

let puestoLabelsCache = [];
async function cargarUniformidadAdmin() {
  const [{ data: catalogo }, { data: entregas }, { data: devoluciones }, { data: requisitos }, { data: cursosCatalogo }, { data: personal }, { data: labels }, { data: parametros }] = await Promise.all([
    sb.from('epi_catalogo_puesto').select('*').order('puesto_key'),
    sb.from('epi_entregas').select('*, personas_trabajadoras(nombre, puesto, puesto_key)').order('fecha_entrega', { ascending: false }),
    sb.from('epi_devoluciones').select('*, personas_trabajadoras(nombre)').order('fecha', { ascending: false }),
    sb.from('formacion_requisitos_puesto').select('*'),
    sb.from('formacion_cursos_catalogo').select('*').order('nombre'),
    sb.from('personas_trabajadoras').select('id, puesto_key').eq('estado_laboral', 'Activo'),
    sb.from('puesto_labels').select('*'),
    sb.from('coef_parametros').select('tarifa_hora_neta, entrevista_minutos').eq('hotel_id', usuarioActual.hotel_id).maybeSingle()
  ]);
  epiCatalogoCache = catalogo || [];
  formacionRequisitosPuestoCache = requisitos || [];
  formacionCursosCatalogoCache = cursosCatalogo || formacionCursosCatalogoCache || [];
  puestoLabelsCache = labels || [];
  // Entrevista de contratación (migración 0086/0042): coste fijo por puesto, igual al prototipo
  // ("Entrevista de contratación · 45 min · 0,75 h"), calculado con los mismos minutos/tarifa ya
  // editables en Panel de Dirección → Plantilla de establecimiento (no un número suelto aparte).
  const minutosEntrevista = Number((parametros || {}).entrevista_minutos ?? 45);
  const tarifaHoraEntrevista = Number((parametros || {}).tarifa_hora_neta ?? 23);
  const horasEntrevista = minutosEntrevista / 60;
  const costeEntrevista = horasEntrevista * tarifaHoraEntrevista;

  const headcountPorPuesto = {};
  (personal || []).forEach((p) => { const k = p.puesto_key || '_sin_puesto_key'; headcountPorPuesto[k] = (headcountPorPuesto[k] || 0) + 1; });

  // Un puesto aparece como tarjeta si tiene catálogo de EPI, requisitos de formación, nombre
  // editado (puesto_labels), o es uno de los puestos reales del organigrama
  // (CANDIDATO_DEPARTAMENTOS) — así un puesto real sin catálogo todavía se ve igualmente, listo
  // para rellenar. "Piscina" y "Jardinería" del prototipo ya tienen catálogo propio (migración
  // 0086) y aparecen por tener filas en epiCatalogoCache/puesto_labels.
  const puestoKeys = Array.from(
    new Set([
      ...CANDIDATO_DEPARTAMENTOS.map((d) => d.puestoKey),
      ...epiCatalogoCache.map((c) => c.puesto_key),
      ...formacionRequisitosPuestoCache.map((r) => r.puesto_key),
      ...puestoLabelsCache.map((l) => l.puesto_key)
    ])
  );
  const labelPuesto = (k) => {
    const override = puestoLabelsCache.find((l) => l.puesto_key === k);
    if (override) return override.label;
    return (CANDIDATO_DEPARTAMENTOS.find((d) => d.puestoKey === k) || {}).label || k;
  };

  const filasCoste = puestoKeys.map((k) => {
    const costeEpi = calcularCosteEpiPuesto(epiCatalogoCache, k);
    const f = calcularFormacionPuesto(formacionRequisitosPuestoCache, formacionCursosCatalogoCache, k);
    return { puestoKey: k, costeEpi, costeFormacion: f.coste, horasFormacion: f.horas, costeEntrevista, horasEntrevista, minutosEntrevista, costeUnit: costeEpi + f.coste + costeEntrevista, headcount: headcountPorPuesto[k] || 0 };
  });
  const puestosConCatalogo = filasCoste.filter((f) => f.costeEpi > 0).length;
  const costeMedioEpi = filasCoste.length ? filasCoste.reduce((s, f) => s + f.costeEpi, 0) / filasCoste.length : 0;
  const costeMedioCobertura = filasCoste.length ? filasCoste.reduce((s, f) => s + f.costeUnit, 0) / filasCoste.length : 0;
  const puestoMayorCoste = filasCoste.reduce((max, f) => (f.costeUnit > (max ? max.costeUnit : -1) ? f : max), null);

  $('uniformidadKpis').innerHTML = `
    <div class="card kpi"><div class="ic">💶</div><div><div class="t">Coste medio EPI/uniformidad por persona</div><div class="v">${fmtEur(costeMedioEpi)}</div></div></div>
    <div class="card kpi"><div class="ic">🧮</div><div><div class="t">Coste medio de cobertura por puesto</div><div class="v">${fmtEur(costeMedioCobertura)}</div></div></div>
    <div class="card kpi"><div class="ic">📋</div><div><div class="t">Puestos con catálogo definido</div><div class="v">${puestosConCatalogo}/${puestoKeys.length}</div></div></div>
    <div class="card kpi"><div class="ic">🏆</div><div><div class="t">Puesto de mayor coste</div><div class="v" style="font-size:13px;">${puestoMayorCoste ? labelPuesto(puestoMayorCoste.puestoKey) + ' · ' + fmtEur(puestoMayorCoste.costeUnit) : '—'}</div></div></div>`;

  $('uniformidadPuestosBody').innerHTML = filasCoste
    .sort((a, b) => labelPuesto(a.puestoKey).localeCompare(labelPuesto(b.puestoKey)))
    .map((f) => tarjetaPuestoEpiHTML(f, labelPuesto(f.puestoKey)))
    .join('');

  $('epiEntregasBody').innerHTML =
    (entregas || [])
      .map(
        (e) => `<tr>
          <td>${e.personas_trabajadoras ? e.personas_trabajadoras.nombre : '—'}</td>
          <td>${e.personas_trabajadoras ? (labelPuesto(e.personas_trabajadoras.puesto_key) !== e.personas_trabajadoras.puesto_key ? labelPuesto(e.personas_trabajadoras.puesto_key) : e.personas_trabajadoras.puesto || '—') : '—'}</td>
          <td>${e.item}</td>
          <td>${e.cantidad}</td>
          <td>${fechaCorta(e.fecha_entrega)}</td>
          <td>${e.conformidad_firmada ? '<span class="badge2 b-emerald">Firmada ✓</span>' : '<span class="badge2 b-amber">Pendiente</span>'}</td>
        </tr>`
      )
      .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin entregas registradas.</td></tr>';

  $('epiDevolucionesBody').innerHTML =
    (devoluciones || [])
      .map(
        (d) => `<tr>
          <td>${d.personas_trabajadoras ? d.personas_trabajadoras.nombre : '—'}</td>
          <td>${d.motivo}</td>
          <td>${d.prendas}</td>
          <td>${fechaCorta(d.fecha)}</td>
          <td>${d.entrevista_salida_realizada ? 'Sí' : 'No'}</td>
          <td>${badgeEstado(d.estado === 'enviado_gestoria' ? 'Enviado a gestoría' : d.estado)}</td>
          <td>${_accionDevolucionEpi(d)}</td>
        </tr>`
      )
      .join('') || '<tr><td colspan="7" class="sub-c" style="text-align:center;padding:14px;">Sin devoluciones registradas.</td></tr>';
}

// Circuito de devolución (migración 0084): Registrada (pendiente) → Devuelto/resguardo firmado →
// Enviado a gestoría (p.ej. para el finiquito) — mismo circuito de 3 pasos que el prototipo.
function _accionDevolucionEpi(d) {
  if (d.estado === 'pendiente') return `<button type="button" class="btn btn-sm" onclick="firmarDevolucion('${d.id}')">✓ Marcar firmado</button>`;
  if (d.estado === 'firmado') return `<button type="button" class="btn btn-secondary btn-sm" onclick="enviarGestoriaDevolucion('${d.id}')">📨 Enviar a gestoría (finiquito)</button>`;
  if (d.estado === 'enviado_gestoria') return `<span class="sub-c">✓ ${d.gestoria_enviado_en ? fechaCorta(d.gestoria_enviado_en.slice(0, 10)) : ''}</span>`;
  return '';
}

// Tarjeta por puesto: catálogo de EPI con coste inline-editable (por tipo), formación obligatoria
// (checklist sobre el catálogo de 6 cursos) y el cuadro de costes del puesto — mismo formato que
// el prototipo (capturas 4-6), sobre datos reales en vez de los puestos de ejemplo del prototipo.
function tarjetaPuestoEpiHTML(f, label) {
  const articulos = epiCatalogoCache.filter((c) => c.puesto_key === f.puestoKey);
  // Encabezado + botón "+ Añadir" contextual por sección (César: poder crear referencias concretas
  // como "pantalón de pinzas beige" o "camiseta interior térmica" sin tener que buscar el botón
  // global de arriba ni escribir la clave del puesto a mano).
  const seccionTipo = (tipo, tituloSeccion) => {
    const filas =
      articulos
        .filter((c) => c.tipo === tipo)
        .map(
          (c) => `<div class="row-item"><div class="l"><div class="icon">${ICONO_TIPO_EPI[tipo]}</div><div><b>${c.item}</b><span class="meta">${c.cantidad || 1} ud/año</span></div></div>
            <span style="display:flex;align-items:center;gap:6px;">
              <input type="number" class="cost-input" step="0.5" min="0" value="${c.coste != null ? Number(c.coste) : 0}" data-articulo="${c.id}" onchange="actualizarCosteArticuloEpi(this)"> €
              <button type="button" class="btn btn-secondary btn-sm" title="Eliminar artículo" onclick="eliminarArticuloEpi('${c.id}')">🗑</button>
            </span></div>`
        )
        .join('') || `<p class="sub-c" style="padding:4px 0;">Sin artículos de ${LABEL_TIPO_EPI[tipo].toLowerCase()} todavía.</p>`;
    return `<div style="margin-top:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <b style="font-size:12px;">${ICONO_TIPO_EPI[tipo]} ${tituloSeccion}</b>
        <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px;" onclick="abrirModalArticuloEpi('${f.puestoKey}','${tipo}')">+ Añadir</button>
      </div>
      ${filas}
    </div>`;
  };

  const clavesActuales = new Set(formacionRequisitosPuestoCache.filter((r) => r.puesto_key === f.puestoKey).map((r) => r.curso_clave));
  const filasFormacion = (formacionCursosCatalogoCache || [])
    .map((c) => {
      const marcado = clavesActuales.has(c.clave);
      return `<div class="row-item"><div class="l">
          <input type="checkbox" ${marcado ? 'checked' : ''} data-puesto="${f.puestoKey}" data-curso="${c.clave}" onchange="toggleFormacionRequisitoPuesto(this)">
          <div><b>${c.nombre}</b><span class="meta">${c.etiqueta || ''} · ${Number(c.horas || 0)} h</span></div>
        </div><span class="meta">${fmtEur(c.coste)}</span></div>`;
    })
    .join('');

  return `<div class="card card-pad">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
      <div>
        <div style="display:flex;align-items:center;gap:6px;">
          <b style="font-size:13px;">${label}</b>
          <button type="button" class="btn btn-secondary btn-sm" style="padding:1px 6px;font-size:11px;" title="Editar el nombre de este puesto/departamento" onclick="abrirEditarPuestoLabel('${f.puestoKey}','${label.replace(/'/g, "\\'")}')">✎</button>
        </div>
        <p class="sub-c" style="margin:2px 0 0;">${f.headcount} persona(s) activa(s) en este puesto · clave: ${f.puestoKey}</p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" onclick="abrirModalClonarPuesto('${f.puestoKey}')" title="Crea un puesto nuevo copiando este catálogo de EPI, formación y descripción de puesto, para personalizarlo">🧬 Clonar puesto</button>
    </div>

    ${seccionTipo('uniformidad', 'Uniformidad (×3 dotaciones/año) — coste editable')}
    ${seccionTipo('calzado', 'Calzado EPI — coste editable')}
    ${seccionTipo('epi', 'EPI específicos — coste editable')}

    <div style="margin-top:12px;border-top:1px solid var(--slate-200,#e2e8f0);padding-top:10px;">
      <b style="font-size:12px;">🎓 Formación obligatoria (${clavesActuales.size} · ${f.horasFormacion.toFixed(0)} h) — marca o desmarca los cursos de este puesto</b>
      ${filasFormacion || '<p class="sub-c" style="padding:4px 0;">El catálogo de formación obligatoria está vacío.</p>'}
    </div>

    <div style="margin-top:12px;background:var(--slate-50);border-radius:8px;padding:10px 12px;">
      <b style="font-size:12px;">🧮 Cuadro de costes del puesto</b>
      <div class="row-item"><span class="sub-c">Uniformidad + calzado + EPIs</span><span>${fmtEur(f.costeEpi)}</span></div>
      <div class="row-item"><span class="sub-c">Formación obligatoria (${f.horasFormacion.toFixed(0)} h)</span><span>${fmtEur(f.costeFormacion)}</span></div>
      <div class="row-item"><span class="sub-c">Entrevista de contratación (${f.minutosEntrevista.toFixed(0)} min · ${f.horasEntrevista.toFixed(2)} h)</span><span>${fmtEur(f.costeEntrevista)}</span></div>
      <div class="row-item" style="font-weight:800;color:var(--brand-700,#146950);"><span>Coste total de cobertura del puesto</span><span>${fmtEur(f.costeUnit)}</span></div>
      <div class="row-item" style="margin-top:6px;border-top:1px dashed var(--slate-200,#e2e8f0);padding-top:6px;"><span class="sub-c">Total con la plantilla actual (${f.headcount} persona(s))</span><span>${fmtEur(f.costeUnit * f.headcount)}</span></div>
    </div>
  </div>`;
}

async function actualizarCosteArticuloEpi(input) {
  const id = input.dataset.articulo;
  const valor = Number(input.value) || 0;
  const { error } = await sb.from('epi_catalogo_puesto').update({ coste: valor }).eq('id', id);
  if (error) {
    mostrarToast('Error al actualizar: ' + error.message, false);
    return;
  }
  const item = epiCatalogoCache.find((c) => c.id === id);
  mostrarToast('Coste actualizado ✓', true);
  await registrarAuditoria('Uniformidad y EPIs', 'Coste de artículo actualizado', `${item ? item.item : id} → ${valor.toFixed(2)} €`);
  await cargarUniformidadAdmin();
}

async function eliminarArticuloEpi(id) {
  if (!confirm('¿Eliminar este artículo del catálogo?')) return;
  const { error } = await sb.from('epi_catalogo_puesto').delete().eq('id', id);
  mostrarToast(error ? 'Error al eliminar: ' + error.message : 'Artículo eliminado ✓', !error);
  if (!error) await cargarUniformidadAdmin();
}

// Marca/desmarca un curso de formacion_cursos_catalogo como obligatorio para un puesto — así el
// botón "Clonar puesto" y esta casilla son las dos formas de personalizar el puesto que pedía
// César: EPI/coste con Clonar o edición directa, formación con esta casilla.
async function toggleFormacionRequisitoPuesto(checkbox) {
  const puestoKey = checkbox.dataset.puesto;
  const cursoClave = checkbox.dataset.curso;
  if (checkbox.checked) {
    const { error } = await sb.from('formacion_requisitos_puesto').insert({ hotel_id: usuarioActual.hotel_id, puesto_key: puestoKey, curso_clave: cursoClave });
    if (error) { mostrarToast('Error al añadir: ' + error.message, false); checkbox.checked = false; return; }
  } else {
    const { error } = await sb.from('formacion_requisitos_puesto').delete().eq('hotel_id', usuarioActual.hotel_id).eq('puesto_key', puestoKey).eq('curso_clave', cursoClave);
    if (error) { mostrarToast('Error al quitar: ' + error.message, false); checkbox.checked = true; return; }
  }
  await registrarAuditoria('Uniformidad y EPIs', 'Formación obligatoria del puesto', `${puestoKey}: ${cursoClave} ${checkbox.checked ? 'añadido' : 'quitado'}`);
  await cargarUniformidadAdmin();
}

// Antes solo había un botón global arriba del todo, sin relación visible con ningún puesto
// concreto — había que saber y escribir a mano la clave exacta del puesto. Ahora cada sección
// (Uniformidad/Calzado/EPI) de cada tarjeta tiene su propio "+ Añadir", que precarga puesto y tipo
// (p. ej. para añadir "Camiseta interior térmica" al EPI de Cocina sin poder equivocarse de puesto).
function abrirModalArticuloEpi(puestoKey, tipo) {
  $('formArticuloEpi').reset();
  if (puestoKey) {
    $('aePuestoKey').value = puestoKey;
    $('aePuestoKey').readOnly = true;
    $('aeTipo').value = tipo || 'uniformidad';
  } else {
    $('aePuestoKey').readOnly = false;
  }
  $('modalArticuloEpi').classList.remove('hidden');
  setTimeout(() => $('aeItem').focus(), 50);
}

function cerrarModalArticuloEpi() {
  $('modalArticuloEpi').classList.add('hidden');
}

async function guardarArticuloEpi(e) {
  e.preventDefault();
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    puesto_key: $('aePuestoKey').value.trim(),
    item: $('aeItem').value.trim(),
    tipo: $('aeTipo').value,
    cantidad: $('aeCantidad').value ? parseInt($('aeCantidad').value, 10) : 1,
    coste: $('aeCoste').value ? parseFloat($('aeCoste').value) : null
  };
  const { error } = await sb.from('epi_catalogo_puesto').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Artículo añadido ✓', !error);
  if (!error) {
    cerrarModalArticuloEpi();
    await cargarUniformidadAdmin();
  }
}

// Editar el nombre de puesto/departamento que aparece en la cabecera de cada tarjeta de
// Uniformidad y EPIs (César: "también se tiene que poder editar el nombre del puesto de trabajo o
// del departamento"). Se guarda como override por hotel (puesto_labels, migración 0086); si nunca
// se edita, se sigue usando el nombre por defecto del código.
let editarPuestoLabelCtx = null;
function abrirEditarPuestoLabel(puestoKey, labelActual) {
  editarPuestoLabelCtx = puestoKey;
  $('eplClave').textContent = puestoKey;
  $('eplNombre').value = labelActual || '';
  $('modalEditarPuestoLabel').classList.remove('hidden');
  setTimeout(() => $('eplNombre').select(), 50);
}
function cerrarEditarPuestoLabel() {
  $('modalEditarPuestoLabel').classList.add('hidden');
  editarPuestoLabelCtx = null;
}
async function guardarPuestoLabel(e) {
  e.preventDefault();
  if (!editarPuestoLabelCtx) return;
  const nombre = $('eplNombre').value.trim();
  if (!nombre) return;
  if (nombre.length > 60) { mostrarToast('⚠️ El nombre del puesto no puede superar 60 caracteres', false); return; }
  const { error } = await sb
    .from('puesto_labels')
    .upsert({ hotel_id: usuarioActual.hotel_id, puesto_key: editarPuestoLabelCtx, label: nombre }, { onConflict: 'hotel_id,puesto_key' });
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Nombre del puesto actualizado ✓', !error);
  if (!error) {
    await registrarAuditoria('Uniformidad y EPIs', 'Nombre de puesto editado', `${editarPuestoLabelCtx} → ${nombre}`);
    cerrarEditarPuestoLabel();
    await cargarUniformidadAdmin();
  }
}

// ---------- Clonar puesto — duplica todo el catálogo de EPIs (y la descripción de puesto, si existe)
// de un puesto ya existente bajo una clave nueva, para no tener que recrear uno similar desde cero ----
function _generarClavePuestoUnica(nombreBase) {
  const sinAcentos = (nombreBase || 'puesto').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const base = sinAcentos.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'puesto';
  const existentes = new Set([...epiCatalogoCache.map((c) => c.puesto_key), ...(descPuestoCache || []).map((d) => d.puesto_key)]);
  let key = base;
  let n = 2;
  while (existentes.has(key)) key = `${base}_${n++}`;
  return key;
}
function abrirModalClonarPuesto(puestoKeyOrigen) {
  $('formClonarPuesto').reset();
  $('clonarPuestoOrigen').value = puestoKeyOrigen;
  $('clonarPuestoNombre').value = 'Copia de ' + puestoKeyOrigen;
  $('modalClonarPuesto').classList.remove('hidden');
  setTimeout(() => $('clonarPuestoNombre').select(), 50);
}
function cerrarModalClonarPuesto() {
  $('modalClonarPuesto').classList.add('hidden');
}
async function guardarClonarPuesto(e) {
  e.preventDefault();
  const puestoKeyOrigen = $('clonarPuestoOrigen').value;
  const nombreNuevo = $('clonarPuestoNombre').value.trim();
  if (!nombreNuevo) return;
  await clonarPuesto(puestoKeyOrigen, nombreNuevo);
  cerrarModalClonarPuesto();
}
async function clonarPuesto(puestoKeyOrigen, nombreNuevo) {
  const puestoKeyNuevo = _generarClavePuestoUnica(nombreNuevo);

  const articulosOrigen = epiCatalogoCache.filter((c) => c.puesto_key === puestoKeyOrigen);
  const payloadsEpi = articulosOrigen.map((c) => ({
    hotel_id: usuarioActual.hotel_id,
    puesto_key: puestoKeyNuevo,
    item: c.item,
    tipo: c.tipo,
    cantidad: c.cantidad || 1,
    coste: c.coste
  }));
  const { error: errorEpi } = payloadsEpi.length ? await sb.from('epi_catalogo_puesto').insert(payloadsEpi) : { error: null };

  const requisitosOrigen = formacionRequisitosPuestoCache.filter((r) => r.puesto_key === puestoKeyOrigen);
  const payloadsFormacion = requisitosOrigen.map((r) => ({
    hotel_id: usuarioActual.hotel_id,
    puesto_key: puestoKeyNuevo,
    curso_clave: r.curso_clave
  }));
  const { error: errorFormacion } = payloadsFormacion.length ? await sb.from('formacion_requisitos_puesto').insert(payloadsFormacion) : { error: null };

  let errorDesc = null;
  const descOrigen = (descPuestoCache || []).find((d) => d.puesto_key === puestoKeyOrigen);
  if (descOrigen) {
    const { error } = await sb.from('puesto_descripciones').insert({
      hotel_id: usuarioActual.hotel_id,
      puesto_key: puestoKeyNuevo,
      titulo: 'Copia de ' + (descOrigen.titulo || puestoKeyOrigen),
      contenido: descOrigen.contenido || null,
      funciones: descOrigen.funciones || [],
      pesos: descOrigen.pesos || []
    });
    errorDesc = error;
  }

  const error = errorEpi || errorFormacion || errorDesc;
  mostrarToast(error ? 'Clonado con avisos: ' + error.message : `Puesto clonado como "${puestoKeyNuevo}" (${payloadsEpi.length} artículo(s) de EPI, ${payloadsFormacion.length} curso(s) obligatorio(s)${descOrigen ? ' + descripción de puesto' : ''}) ✓`, !error);
  await registrarAuditoria('Uniformidad y EPIs', 'Puesto clonado', `${puestoKeyOrigen} → ${puestoKeyNuevo}`);
  await cargarUniformidadAdmin();
  if (typeof cargarDescPuesto === 'function') await cargarDescPuesto();
}

function abrirModalDevolucion() {
  $('formDevolucion').reset();
  $('devTrabajadorId').innerHTML = empleadosCache.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');
  $('devFecha').value = new Date().toISOString().slice(0, 10);
  $('modalDevolucion').classList.remove('hidden');
}

function cerrarModalDevolucion() {
  $('modalDevolucion').classList.add('hidden');
}

async function guardarDevolucion(e) {
  e.preventDefault();
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: $('devTrabajadorId').value,
    motivo: $('devMotivo').value.trim(),
    prendas: $('devPrendas').value.trim(),
    fecha: $('devFecha').value || new Date().toISOString().slice(0, 10),
    entrevista_salida_realizada: $('devEntrevista').checked
  };
  const { error } = await sb.from('epi_devoluciones').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Devolución registrada ✓', !error);
  if (!error) {
    cerrarModalDevolucion();
    await cargarUniformidadAdmin();
  }
}

async function firmarDevolucion(id) {
  const { error } = await sb.from('epi_devoluciones').update({ estado: 'firmado' }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Devolución marcada como firmada ✓', !error);
  if (!error) {
    await registrarAuditoria('Uniformidad y EPIs', 'Resguardo de devolución firmado', id);
    await cargarUniformidadAdmin();
  }
}

// "Enviar a gestoría" (migración 0084): 3er estado del circuito de devolución, para que gestoría
// pueda incorporar el resguardo firmado al finiquito. CC por defecto al grupo RR.HH./Dirección,
// mismo criterio que enviarFormularioGestoria().
async function enviarGestoriaDevolucion(id) {
  const d = (await sb.from('epi_devoluciones').select('*, personas_trabajadoras(nombre)').eq('id', id).single()).data;
  const predeterminado = formulariosDestinatariosCache.find((x) => x.predeterminado_gestoria);
  const { error: errorUpdate } = await sb
    .from('epi_devoluciones')
    .update({ estado: 'enviado_gestoria', gestoria_enviado_en: new Date().toISOString() })
    .eq('id', id);
  if (errorUpdate) {
    mostrarToast('Error: ' + errorUpdate.message, false);
    return;
  }
  if (predeterminado && predeterminado.email) {
    const { data: cc } = await sb.rpc('rrhh_emails_hotel');
    await sb.rpc('enviar_correo_externo', {
      p_destinatario_email: predeterminado.email,
      p_asunto: `Resguardo de devolución de EPI/uniformidad — ${d && d.personas_trabajadoras ? d.personas_trabajadoras.nombre : id}`,
      p_cuerpo: `Buenos días,\n\nAdjuntamos a efectos de finiquito el resguardo de devolución de EPI/uniformidad firmado por la persona trabajadora.\n\nPersona: ${d && d.personas_trabajadoras ? d.personas_trabajadoras.nombre : '—'}\nMotivo: ${d ? d.motivo : '—'}\nPrendas/EPI devueltos: ${d ? d.prendas : '—'}\nFecha de devolución: ${d ? fechaCorta(d.fecha) : '—'}\nEntrevista de salida realizada: ${d && d.entrevista_salida_realizada ? 'Sí' : 'No'}\n\nUn saludo,\nDepartamento de RR.HH.`,
      p_cc_email: cc || null,
      p_referencia_tabla: 'epi_devoluciones',
      p_referencia_id: id
    });
  }
  mostrarToast(predeterminado && predeterminado.email ? 'Enviado a gestoría ✓' : 'Marcado como enviado a gestoría ✓ (sin destinatario de gestoría predeterminado — configúralo en Formularios)', true);
  await registrarAuditoria('Uniformidad y EPIs', 'Resguardo de devolución enviado a gestoría', id);
  await cargarUniformidadAdmin();
}

// ---------- Personas trabajadoras ----------
let empleadosCache = [];
let empleadosFichajesHoyCache = [];

async function cargarEmpleados() {
  const hoy = new Date().toISOString().slice(0, 10);
  const [{ data: personal }, { data: fichajesHoy }] = await Promise.all([
    sb.from('personas_trabajadoras').select('*, centros_trabajo(nombre)').order('nombre'),
    sb.from('fichajes').select('*').eq('fecha', hoy)
  ]);
  empleadosCache = personal || [];
  empleadosFichajesHoyCache = fichajesHoy || [];

  if ($('empFiltroDepartamento')) {
    const actual = $('empFiltroDepartamento').value;
    const deptos = Array.from(new Set(empleadosCache.map((p) => p.departamento).filter(Boolean))).sort();
    $('empFiltroDepartamento').innerHTML = '<option value="">Todos los departamentos</option>' + deptos.map((d) => `<option value="${d}">${d}</option>`).join('');
    $('empFiltroDepartamento').value = actual;
  }
  renderListaEmpleados();
}

function renderListaEmpleados() {
  const q = ($('empBuscador') ? $('empBuscador').value : '').trim().toLowerCase();
  const fDepto = $('empFiltroDepartamento') ? $('empFiltroDepartamento').value : '';
  const filtrados = empleadosCache.filter((p) => {
    if (fDepto && p.departamento !== fDepto) return false;
    if (q && !p.nombre.toLowerCase().includes(q)) return false;
    return true;
  });
  if ($('empleadosTitulo')) $('empleadosTitulo').textContent = `Personas trabajadoras — ${filtrados.length} encontrada(s)`;
  $('listaEmpleados').innerHTML =
    filtrados
      .map((p) => {
        const f = empleadosFichajesHoyCache.find((x) => x.trabajador_id === p.id);
        const estadoHoy = f ? f.estado : 'no_fichado';
        return `<tr class="clickable" onclick="abrirFichaAdmin('${p.id}')">
          <td>${p.codigo || '—'}</td>
          <td><b>${p.nombre}</b></td>
          <td>${p.puesto || '—'}</td>
          <td>${p.departamento || '—'}</td>
          <td>${p.supervisor_nombre || '—'}</td>
          <td>${p.centros_trabajo ? p.centros_trabajo.nombre : p.centro || '—'}</td>
          <td>${p.rol_puesto || '—'}</td>
          <td>${p.fecha_incorporacion ? fechaCorta(p.fecha_incorporacion) : '—'}</td>
          <td>${badgeEstado(p.estado_laboral || 'Activo')}</td>
          <td>${badgeEstado(estadoHoy)}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="10" class="sub-c" style="text-align:center;padding:14px;">Sin personas trabajadoras que coincidan.</td></tr>';
}

async function exportarEmpleadosCSV() {
  // Mismas 18 columnas que espera "⬆ Importar" (EMPLEADO_CAMPOS_IMPORT), para poder editar en Excel y
  // volver a importar sin reordenar nada.
  descargarCSV(
    'personas_trabajadoras.csv',
    EMPLEADO_CAMPOS_IMPORT,
    empleadosCache.map((p) => [
      p.codigo || '',
      p.nombre || '',
      p.email || '',
      p.puesto || '',
      p.departamento || '',
      p.centros_trabajo ? p.centros_trabajo.nombre : p.centro || '',
      p.rol_puesto || '',
      p.puesto_key || '',
      p.fecha_incorporacion || '',
      p.estado_laboral || 'Activo',
      p.supervisor_nombre || '',
      p.contacto_emergencia_nombre || '',
      p.contacto_emergencia_parentesco || '',
      p.contacto_emergencia_telefono || '',
      p.seguridad_social || '',
      p.direccion || '',
      p.dni_nie || '',
      p.fecha_nacimiento || ''
    ])
  );
}

// ---------- Ficha de la persona trabajadora (pantalla completa) ----------
let fichaAdminDocumentosCache = [];
async function abrirFichaAdmin(id) {
  showScreen('admin-ficha');
  await renderFichaAdmin(id);
}
// César (03/11/2026) — la creación automática de cuenta (crear-cuenta-trabajador, migración 0113)
// solo se dispara en el momento de dar de alta o en la carga masiva; una persona ya existente en
// personas_trabajadoras sin user_id (p. ej. dada de alta antes de que existiera esta función, o si
// aquella llamada falló) se quedaba sin ninguna forma de reintentarlo desde la propia app — había
// que ir a Supabase a mano. Este botón (solo visible si falta user_id) reutiliza la misma función.
async function crearAccesoTrabajadorFicha(id, btn) {
  if (btn && btn.disabled) return;
  const textoBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Creando acceso…'; }
  try {
    const { data, error } = await sb.functions.invoke('crear-cuenta-trabajador', { body: { trabajador_id: id } });
    if (error) { mostrarToast('Error al crear el acceso: ' + error.message, false); return; }
    if (data && data.omitido) { mostrarToast(data.omitido, true); }
    else { mostrarToast('Acceso creado ✓ — correo de bienvenida encolado', true); }
    await registrarAuditoria('Personas trabajadoras', 'Acceso a la app creado manualmente', id);
    await cargarEmpleados();
    await renderFichaAdmin(id);
  } finally {
    if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = textoBtn; }
  }
}
// ---- Uniformidad y EPI — entrega inicial al alta (plantilla f18) ------------------------------
// César: "cuando se da alta la ficha [...] ahí tiene que salir la uniformidad que corresponde a
// ese puesto [...] introducir la talla [...] y le damos a enviar a firmar al trabajador [...] y
// nosotros [...] lo enviaremos a nuestro colaborador, que es el proveedor de uniformidad, que es
// una tienda" — mismo patrón que seguimientoContratoBlockHTML (tarjeta de pasos en la propia
// ficha) y reutiliza el motor genérico de Formularios (plantilla f18, igual que f1-f17): la firma
// del trabajador la hace la app del trabajador sin ningún cambio (ya firma cualquier trámite con
// detalle/adjunto genérico — formulario_firmar no distingue plantillas) y la revisión/envío a la
// tienda reutiliza el modal verFormularioSolicitud() ya existente, con RPC propia
// (enviar_formulario_a_proveedor_uniformidad) para no mezclar el estado con el de gestoría.
function uniformidadFichaBlockHTML(p, entregas, misFormularios) {
  const catalogoPuesto = epiCatalogoCache.filter((c) => c.puesto_key === p.puesto_key);
  const solicitudUniformidad = (misFormularios || [])
    .filter((s) => s.plantilla_id === 'f18')
    .sort((a, b) => new Date(b.fecha_solicitud) - new Date(a.fecha_solicitud))[0];

  if (!entregas.length) {
    if (!catalogoPuesto.length) {
      return `<div class="card card-pad" style="margin-top:16px;">
        <div class="aprob-section-title" style="padding:0 0 10px;border-bottom:none;">🦺 Uniformidad y EPI</div>
        <p class="sub-c" style="margin:0;">Este puesto${p.puesto_key ? ' (' + p.puesto_key + ')' : ''} todavía no tiene catálogo de uniformidad/EPI definido en «Uniformidad y EPIs → Catálogo por puesto».</p>
      </div>`;
    }
    return `<div class="card card-pad" style="margin-top:16px;">
      <div class="aprob-section-title" style="padding:0 0 10px;border-bottom:none;">🦺 Uniformidad y EPI</div>
      <p class="sub-c" style="margin:0 0 10px;">Según el catálogo del puesto le corresponden ${catalogoPuesto.length} artículo(s). Genera la dotación para indicar las tallas y enviarla a firmar.</p>
      <button type="button" class="btn btn-sm" id="btnGenerarDotacionEpi_${p.id}" onclick="generarDotacionEpiFicha('${p.id}', this)">🦺 Generar dotación desde el catálogo del puesto</button>
    </div>`;
  }

  const soloLectura = !!solicitudUniformidad;
  const filasHTML = entregas
    .map(
      (e) => `
    <div class="row-item">
      <div><b>${e.item}</b><br><span class="sub-c">${e.tipo || '—'}</span></div>
      <div style="display:flex;gap:8px;align-items:center;">
        <div>
          <input type="number" min="1" step="1" id="cantidadEpi_${e.id}" value="${e.cantidad || 1}" placeholder="Cant." style="max-width:64px;margin:0;" ${soloLectura ? 'disabled' : ''}>
          <div class="sub-c" style="text-align:center;margin-top:2px;">cantidad</div>
        </div>
        <div>
          <input type="text" id="tallaEpi_${e.id}" value="${e.talla ? String(e.talla).replace(/"/g, '&quot;') : ''}" placeholder="Talla estimada" style="max-width:140px;margin:0;" ${soloLectura ? 'disabled' : ''}>
          <div class="sub-c" style="text-align:center;margin-top:2px;">talla</div>
        </div>
      </div>
    </div>`
    )
    .join('');

  let accionHTML;
  if (!solicitudUniformidad) {
    accionHTML = `<button type="button" class="btn btn-secondary btn-sm" id="btnGuardarTallasEpi_${p.id}" onclick="guardarTallasEpiFicha('${p.id}', this)">💾 Guardar tallas</button>
      <button type="button" class="btn btn-sm" id="btnEnviarFirmarEpi_${p.id}" onclick="enviarUniformidadAFirmarFicha('${p.id}', this)">✉️ Enviar a firmar al trabajador</button>`;
  } else if (solicitudUniformidad.estado === 'pendiente') {
    accionHTML = `<span class="badge2 b-amber">⏳ Pendiente de firma del trabajador</span>`;
  } else if (solicitudUniformidad.estado === 'firmado') {
    accionHTML = `<span class="badge2 b-sky">✍️ Firmado por ${solicitudUniformidad.firma_nombre || p.nombre}</span>
      <button type="button" class="btn btn-sm" onclick="verFormularioSolicitud('${solicitudUniformidad.id}')">👁️ Revisar y enviar a la tienda colaboradora</button>`;
  } else if (solicitudUniformidad.estado === 'enviado_proveedor') {
    accionHTML = `<span class="badge2 b-emerald">✅ Enviado a ${solicitudUniformidad.destinatario_email || 'la tienda colaboradora'}</span>
      <button type="button" class="btn btn-secondary btn-sm" onclick="verFormularioSolicitud('${solicitudUniformidad.id}')">👁️ Ver</button>`;
  } else {
    accionHTML = `<button type="button" class="btn btn-secondary btn-sm" onclick="verFormularioSolicitud('${solicitudUniformidad.id}')">👁️ Ver</button>`;
  }

  return `<div class="card card-pad" style="margin-top:16px;">
    <div class="aprob-section-title" style="padding:0 0 10px;border-bottom:none;">🦺 Uniformidad y EPI — dotación de alta</div>
    ${filasHTML}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center;">${accionHTML}</div>
  </div>`;
}

async function generarDotacionEpiFicha(trabajadorId, btn) {
  if (btn && btn.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Generando…'; }
  try {
    const { data: trabajador } = await sb.from('personas_trabajadoras').select('puesto_key').eq('id', trabajadorId).maybeSingle();
    if (!trabajador || !trabajador.puesto_key) { mostrarToast('Esta persona no tiene puesto_key asignado.', false); return; }
    const catalogoPuesto = epiCatalogoCache.filter((c) => c.puesto_key === trabajador.puesto_key);
    if (!catalogoPuesto.length) { mostrarToast('El puesto no tiene catálogo de uniformidad/EPI.', false); return; }
    const fechaHoy = new Date().toISOString().slice(0, 10);
    const { error } = await sb.from('epi_entregas').insert(
      catalogoPuesto.map((item) => ({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: trabajadorId,
        item: item.item,
        tipo: item.tipo,
        cantidad: item.cantidad || 1,
        fecha_entrega: fechaHoy,
        conformidad_firmada: false
      }))
    );
    if (error) { mostrarToast('Error al generar la dotación: ' + error.message, false); return; }
    mostrarToast('Dotación generada ✓', true);
    await renderFichaAdmin(trabajadorId);
  } finally {
    if (btn && document.body.contains(btn)) btn.disabled = false;
  }
}

async function guardarTallasEpiFicha(trabajadorId, btn) {
  if (btn && btn.disabled) return;
  const textoOriginal = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    const inputsTalla = document.querySelectorAll('[id^="tallaEpi_"]');
    await Promise.all(
      Array.from(inputsTalla).map((inp) => {
        const entregaId = inp.id.replace('tallaEpi_', '');
        const inpCantidad = document.getElementById('cantidadEpi_' + entregaId);
        const cantidad = inpCantidad ? Math.max(1, parseInt(inpCantidad.value, 10) || 1) : undefined;
        const patch = { talla: inp.value.trim() || null };
        if (cantidad !== undefined) patch.cantidad = cantidad;
        return sb.from('epi_entregas').update(patch).eq('id', entregaId);
      })
    );
    mostrarToast('Tallas y cantidades guardadas ✓', true);
    await renderFichaAdmin(trabajadorId);
  } finally {
    if (btn && document.body.contains(btn)) { btn.disabled = false; btn.textContent = textoOriginal; }
  }
}

// Crea la solicitud de firma (plantilla f18, motor genérico de Formularios — mismo botón
// "✍️ Firmar" que el resto de trámites en la app del trabajador, sin tocar su código) con el
// detalle de artículos/tallas que RR.HH. acaba de confirmar.
async function enviarUniformidadAFirmarFicha(trabajadorId, btn) {
  if (btn && btn.disabled) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const { data: entregas } = await sb.from('epi_entregas').select('*').eq('trabajador_id', trabajadorId).order('created_at', { ascending: true });
    if (!entregas || !entregas.length) { mostrarToast('No hay dotación generada todavía.', false); return; }
    const detalle = entregas
      .map((e) => `${e.item} (${e.tipo || '—'}) · cantidad ${e.cantidad || 1}${e.talla ? ' · talla ' + e.talla : ' · talla sin indicar'}`)
      .join('\n');
    const { error } = await sb.from('formularios_solicitudes').insert({
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: trabajadorId,
      plantilla_id: 'f18',
      estado: 'pendiente',
      detalle,
      fecha_solicitud: new Date().toISOString()
    });
    if (error) { mostrarToast('Error al enviar a firmar: ' + error.message, false); return; }
    mostrarToast('Enviado a firmar ✓ — el trabajador lo verá en sus trámites pendientes', true);
    await cargarFormulariosAdmin();
    await renderFichaAdmin(trabajadorId);
  } finally {
    if (btn && document.body.contains(btn)) btn.disabled = false;
  }
}

// ---- Seguimiento del contrato — alta con gestoría (C6-C8 del prototipo, migración 0074) -------
// 5 pasos: solicitud de alta enviada (correo real) → alta confirmada por gestoría (simulado — la
// app no puede recibir correo externo real) → contrato recibido (simulado) → firmado en oficina
// (sube a Mis Documentos) → copia firmada reenviada a gestoría (correo real). Los pasos 2 y 3 se
// simulan con un botón porque, igual que en el propio prototipo, no hay forma real de que la
// gestoría conteste automáticamente dentro de la app — solo se simula la recepción de su respuesta.
const SEG_CONTRATO_PASOS = [
  ['solicitud_enviada', '📧 Solicitud de alta enviada a gestoría'],
  ['alta_confirmada', '✅ Alta confirmada por gestoría'],
  ['contrato_recibido', '📄 Contrato recibido — pendiente de firma en oficina'],
  ['contrato_firmado', '✍️ Contrato firmado y subido a Mis Documentos'],
  ['completado', '↩️ Copia firmada reenviada a gestoría — trámite completo']
];
function seguimientoContratoBlockHTML(p, seg) {
  const estado = seg ? seg.estado : null;
  const idxActual = estado ? SEG_CONTRATO_PASOS.findIndex(([k]) => k === estado) : -1;
  const fechas = {
    solicitud_enviada: seg && seg.fecha_solicitud,
    alta_confirmada: seg && seg.fecha_alta_confirmada,
    contrato_recibido: seg && seg.fecha_contrato,
    contrato_firmado: seg && seg.fecha_firma,
    completado: null
  };
  // César (07/11/2026): "la solicitud de alta ya está enviada, debería salir marcada [...] para
  // que no se duplique" — cuando este paso 1 se marcó solo (renderFichaAdmin, a partir del envío
  // ya hecho en el paso 5 de la candidatura), seg.texto_solicitud queda vacío (nunca se redactó ni
  // se envió un correo aquí); se avisa de esto en vez de dejarlo indistinguible de un envío manual.
  const solicitudAutoDerivada = estado && idxActual >= 0 && seg && !seg.texto_solicitud;
  const pasosHTML = SEG_CONTRATO_PASOS.map(([k, label], i) => {
    const hecho = i <= idxActual;
    const fecha = fechas[k] ? ' · ' + fechaCorta(String(fechas[k]).slice(0, 10)) : '';
    const nota = k === 'solicitud_enviada' && hecho && solicitudAutoDerivada ? ' <span class="sub-c">(enviada junto con la documentación de la candidatura — paso 5)</span>' : '';
    // El antiguo icono emoji (⬜/✅) quedaba visualmente ambiguo — con el check ya dibujado dentro
    // del propio texto del paso ("✅ Alta confirmada...", icono meramente temático del paso, no del
    // progreso real) parecía que el paso ya estaba hecho aunque el estado real todavía no lo reflejara.
    // Un checkbox real (disabled, solo lectura) es el único indicador de progreso y no deja lugar a dudas.
    return `<div class="row-item"><div class="l"><input type="checkbox" class="seg-check" disabled ${hecho ? 'checked' : ''} aria-label="${hecho ? 'Paso completado' : 'Paso pendiente'}"><div><span class="${hecho ? '' : 'sub-c'}">${label}${hecho ? fecha : ''}${nota}</span></div></div></div>`;
  }).join('');
  let accion;
  if (!estado) {
    const texto = `Solicitud de alta en Seguridad Social\n\nDepartamento: ${p.departamento || '—'}\nNombre y apellidos: ${p.nombre}\nTipo de contrato: Indefinido\nHoras por semana: 40 h\n\nSe adjuntan los documentos de la persona trabajadora (DNI/NIE, ficha y resultado de la entrevista) para tramitar el alta a la mayor brevedad posible. Quedamos a la espera de la confirmación del alta y del contrato correspondiente.\n\nUn saludo,\nPersonal4Pax — RR.HH.`;
    accion = `<form onsubmit="enviarSolicitudAltaGestoria(event,'${p.id}')" style="margin-top:8px;">
      <div class="grid g2" style="gap:10px;">
        <div><label style="margin-bottom:4px;">Tipo de contrato</label><select id="segTipoContrato_${p.id}"><option>Indefinido</option><option>Temporal</option><option>Fijo discontinuo</option><option>Formativo</option></select></div>
        <div><label style="margin-bottom:4px;">Horas/semana</label><input type="number" id="segHorasSemana_${p.id}" value="40" style="margin:0;"></div>
      </div>
      <label style="margin-top:8px;display:block;">Texto de la solicitud (editable)</label>
      <textarea id="segTextoSolicitud_${p.id}" rows="5">${texto}</textarea>
      <button type="submit" class="btn btn-sm" style="margin-top:8px;">✉️ Enviar solicitud de alta a gestoría</button>
    </form>`;
  } else if (estado === 'solicitud_enviada') {
    accion = `<button type="button" class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="simularAltaConfirmadaGestoria('${p.id}')">📥 Simular confirmación de alta (gestoría)</button>`;
  } else if (estado === 'alta_confirmada') {
    accion = `<button type="button" class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="simularContratoRecibidoGestoria('${p.id}')">📥 Simular envío del contrato (gestoría)</button>`;
  } else if (estado === 'contrato_recibido') {
    accion = `<button type="button" class="btn btn-sm" style="margin-top:10px;" onclick="firmarContratoEnOficina('${p.id}','${(seg.tipo_contrato || 'Indefinido').toLowerCase().replace(/\s+/g, '-')}','${seg.horas_semana || 40}')">✍️ Marcar contrato firmado en oficina</button>`;
  } else if (estado === 'contrato_firmado') {
    accion = `<button type="button" class="btn btn-sm" style="margin-top:10px;" onclick="reenviarContratoFirmadoGestoria('${p.id}')">↩️ Reenviar copia firmada a gestoría</button>`;
  } else {
    accion = `<span class="badge2 b-emerald" style="margin-top:10px;display:inline-block;">✅ Trámite de alta y contrato completo</span>`;
  }
  return `<div class="card" style="margin-top:16px;">
    <div class="aprob-section-title">📋 Seguimiento del contrato — alta con gestoría</div>
    <div style="padding:0 16px;">${pasosHTML}${accion}</div>
  </div>`;
}
async function enviarSolicitudAltaGestoria(e, trabajadorId) {
  e.preventDefault();
  const p = empleadosCache.find((x) => x.id === trabajadorId);
  const tipoContrato = $('segTipoContrato_' + trabajadorId).value;
  const horasSemana = parseInt($('segHorasSemana_' + trabajadorId).value, 10) || 40;
  const texto = $('segTextoSolicitud_' + trabajadorId).value.trim();
  const { data: cc } = await sb.rpc('rrhh_emails_hotel');
  const { data: destinatario } = await sb.rpc('rrhh_emails_hotel'); // mismo grupo RR.HH./Dirección por defecto; editable en Formularios → Destinatarios si se quiere una gestoría externa
  const { error } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: destinatario || 'rrhh@' + (usuarioActual.hotel_nombre || 'empresa').toLowerCase().replace(/\s+/g, '') + '.es',
    p_cc_email: cc || null,
    p_asunto: `Solicitud de alta en Seguridad Social — ${p ? p.nombre : ''}`,
    p_cuerpo: texto,
    p_referencia_tabla: 'seguimiento_contrato',
    p_referencia_id: trabajadorId
  });
  if (error) {
    mostrarToast('Error al enviar: ' + error.message, false);
    return;
  }
  const { error: errorUpsert } = await sb.from('seguimiento_contrato').upsert(
    {
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: trabajadorId,
      estado: 'solicitud_enviada',
      tipo_contrato: tipoContrato,
      horas_semana: horasSemana,
      texto_solicitud: texto,
      fecha_solicitud: new Date().toISOString().slice(0, 10)
    },
    { onConflict: 'trabajador_id' }
  );
  mostrarToast(errorUpsert ? 'Error: ' + errorUpsert.message : `Solicitud de alta enviada ✓ (${p ? p.nombre : ''})`, !errorUpsert);
  if (!errorUpsert) {
    await registrarAuditoria('Seguimiento del contrato', 'Solicitud de alta enviada a gestoría', `${p ? p.nombre : trabajadorId} — ${tipoContrato} · ${horasSemana} h/semana`);
    await renderFichaAdmin(trabajadorId);
  }
}
async function simularAltaConfirmadaGestoria(trabajadorId) {
  const { error } = await sb.from('seguimiento_contrato').update({ estado: 'alta_confirmada', fecha_alta_confirmada: new Date().toISOString().slice(0, 10) }).eq('trabajador_id', trabajadorId);
  mostrarToast(error ? 'Error: ' + error.message : 'Correo de gestoría recibido ✓ Alta confirmada', !error);
  if (!error) {
    const p = empleadosCache.find((x) => x.id === trabajadorId);
    await registrarAuditoria('Seguimiento del contrato', 'Alta confirmada por gestoría', p ? p.nombre : trabajadorId);
    await renderFichaAdmin(trabajadorId);
  }
}
async function simularContratoRecibidoGestoria(trabajadorId) {
  const { error } = await sb.from('seguimiento_contrato').update({ estado: 'contrato_recibido', fecha_contrato: new Date().toISOString().slice(0, 10) }).eq('trabajador_id', trabajadorId);
  if (!error) {
    const p = empleadosCache.find((x) => x.id === trabajadorId);
    await sb.from('notificaciones_cola').insert({
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: trabajadorId,
      tipo: 'contrato_recibido',
      titulo: '📄 Tu contrato ya está listo para firmar',
      cuerpo: 'Tu contrato ha llegado desde gestoría. Acude a la oficina para firmarlo en persona lo antes posible.',
      canal_push: true,
      canal_email: false
    });
    await registrarAuditoria('Seguimiento del contrato', 'Contrato recibido de gestoría', `${p ? p.nombre : trabajadorId} — pendiente de firma presencial en oficina`);
  }
  mostrarToast(error ? 'Error: ' + error.message : 'Contrato recibido de gestoría ✓ Aviso enviado a la persona trabajadora', !error);
  if (!error) await renderFichaAdmin(trabajadorId);
}
async function firmarContratoEnOficina(trabajadorId, tipoSlug, horas) {
  const { error } = await sb.from('seguimiento_contrato').update({ estado: 'contrato_firmado', fecha_firma: new Date().toISOString().slice(0, 10) }).eq('trabajador_id', trabajadorId);
  if (!error) {
    const p = empleadosCache.find((x) => x.id === trabajadorId);
    await sb.from('documentos').insert({
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: trabajadorId,
      tipo: 'contrato',
      nombre: `Contrato de trabajo — ${tipoSlug} — ${p ? p.codigo || p.nombre : trabajadorId}`,
      meta: `Contrato de trabajo · ${horas} h/semana`
    });
    await registrarAuditoria('Seguimiento del contrato', 'Contrato firmado en oficina y subido a Mis Documentos', p ? p.nombre : trabajadorId);
  }
  mostrarToast(error ? 'Error: ' + error.message : 'Contrato firmado ✓ Subido a "Mis Documentos"', !error);
  if (!error) await renderFichaAdmin(trabajadorId);
}
async function reenviarContratoFirmadoGestoria(trabajadorId) {
  const p = empleadosCache.find((x) => x.id === trabajadorId);
  const { data: destinatario } = await sb.rpc('rrhh_emails_hotel');
  const { error: errorEnvio } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: destinatario || 'rrhh@empresa.es',
    p_asunto: `Contrato firmado — ${p ? p.nombre : ''}`,
    p_cuerpo: `Se adjunta/comunica el contrato firmado en oficina por ${p ? p.nombre : ''}.`,
    p_referencia_tabla: 'seguimiento_contrato',
    p_referencia_id: trabajadorId
  });
  if (errorEnvio) {
    mostrarToast('Error al enviar: ' + errorEnvio.message, false);
    return;
  }
  const { error } = await sb.from('seguimiento_contrato').update({ estado: 'completado' }).eq('trabajador_id', trabajadorId);
  mostrarToast(error ? 'Error: ' + error.message : `Contrato firmado reenviado a gestoría ✓ (${p ? p.nombre : ''})`, !error);
  if (!error) {
    await registrarAuditoria('Seguimiento del contrato', 'Contrato firmado reenviado a gestoría', p ? p.nombre : trabajadorId);
    await renderFichaAdmin(trabajadorId);
  }
}

async function renderFichaAdmin(id) {
  const p = empleadosCache.find((x) => x.id === id);
  const el = $('fichaAdminContent');
  if (!p || !el) return;
  const { data: docs } = await sb.from('documentos').select('*').eq('trabajador_id', id).order('fecha', { ascending: false });
  fichaAdminDocumentosCache = docs || [];
  // César: dotación de uniformidad/EPI de esta persona (talla editable antes de enviarla a firmar) —
  // no está en ningún caché global (epi_entregas es por persona), se consulta aquí igual que docs/seg.
  const { data: entregasEpiFicha } = await sb.from('epi_entregas').select('*').eq('trabajador_id', id).order('created_at', { ascending: true });
  let { data: seg } = await sb.from('seguimiento_contrato').select('*').eq('trabajador_id', id).maybeSingle();
  // César (07/11/2026): "la solicitud de alta ya está enviada, debería salir marcada [...] para que
  // no esté ocupando espacio ni para que no se duplique, hay que quitarlo" — si esta persona viene
  // del circuito de candidaturas (paso 5 "Enviar a gestoría" YA mandó el DNI/NIE + certificado
  // bancario + IBAN con la solicitud de alta real), no tiene sentido pedir aquí un SEGUNDO envío
  // manual de la misma solicitud: el paso 1 se marca solo, con la fecha real de aquel envío, sin
  // mandar ningún correo nuevo — el formulario de envío manual (pensado para altas que no vienen de
  // una candidatura) deja de mostrarse en ese caso.
  if (!seg) {
    const { data: candidatoOrigen } = await sb.from('candidatos').select('documentacion_enviada_gestoria_en').eq('trabajador_id', id).maybeSingle();
    if (candidatoOrigen && candidatoOrigen.documentacion_enviada_gestoria_en) {
      const { data: segAuto } = await sb
        .from('seguimiento_contrato')
        .upsert(
          { hotel_id: usuarioActual.hotel_id, trabajador_id: id, estado: 'solicitud_enviada', fecha_solicitud: String(candidatoOrigen.documentacion_enviada_gestoria_en).slice(0, 10) },
          { onConflict: 'trabajador_id' }
        )
        .select()
        .maybeSingle();
      seg = segAuto || seg;
    }
  }

  // Antes sumaba TODO el catálogo de formación (6 cursos), no solo los asignados al puesto de esta
  // persona — mismo motor que Uniformidad y EPIs / Panel de Dirección (calcularCosteEpiPuesto +
  // calcularFormacionPuesto), para que las tres pantallas coincidan siempre en el mismo coste.
  const costeEpi = calcularCosteEpiPuesto(epiCatalogoCache, p.puesto_key);
  const formacionPuesto = calcularFormacionPuesto(formacionRequisitosPuestoCache, formacionCursosCatalogoCache, p.puesto_key);
  const costeFormacion = formacionPuesto.coste;
  const horasFormacion = formacionPuesto.horas;
  const costeTotal = costeEpi + costeFormacion;

  const misFormularios = formulariosSolicitudesCache.filter((s) => s.trabajador_id === p.id);
  const misDisc = discFormulariosFirmadosCache.filter((f) => f.expedientes_disciplinarios && f.expedientes_disciplinarios.trabajador_id === p.id);
  const miFormacion = formacionCursosRegistroCache.filter((r) => r.trabajador_id === p.id);
  const fichajeHoy = empleadosFichajesHoyCache.find((f) => f.trabajador_id === p.id);

  el.innerHTML = `
    <div class="card card-pad" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
      <div class="av" style="width:52px;height:52px;border-radius:999px;background:var(--brand-600);color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;flex-shrink:0;">${iniciales(p.nombre)}</div>
      <div style="flex:1;min-width:200px;">
        <b style="font-size:16px;">${p.nombre}</b>
        <p class="sub-c" style="margin:2px 0 0;">${[p.puesto, p.departamento, p.centros_trabajo ? p.centros_trabajo.nombre : p.centro].filter(Boolean).join(' · ') || '—'}</p>
      </div>
      <span class="code-hl" style="font-size:13px;">${p.codigo || '—'}</span>
      <span class="badge2 b-slate">${p.rol_puesto || 'Persona trabajadora'}</span>
      ${badgeEstado(p.estado_laboral || 'Activo')}
      <button type="button" class="btn btn-secondary btn-sm" onclick="abrirFichaEmpleado('${p.id}')">✎ Editar</button>
      <button type="button" class="btn btn-secondary btn-sm" onclick="abrirCorreoTrabajadorModal('${p.id}')">📧 Enviar correo</button>
      ${!p.user_id ? `<button type="button" class="btn btn-sm" id="btnCrearAccesoFicha_${p.id}" onclick="crearAccesoTrabajadorFicha('${p.id}', this)">🔑 Crear acceso a la app</button>` : ''}
    </div>

    <div class="grid g2" style="margin-top:16px;align-items:start;">
      <div class="card card-pad">
        <div class="aprob-section-title" style="padding:0 0 10px;border-bottom:none;">🪪 Datos personales</div>
        <table class="tbl"><tbody>
          <tr><td class="sub-c">Email</td><td>${p.email || '—'}</td></tr>
          <tr><td class="sub-c">DNI/NIE</td><td>${p.dni_nie || '—'}</td></tr>
          <tr><td class="sub-c">Fecha de nacimiento</td><td>${p.fecha_nacimiento ? fechaCorta(p.fecha_nacimiento) : '—'}</td></tr>
          <tr><td class="sub-c">Nº Seguridad Social</td><td>${p.seguridad_social || '—'}</td></tr>
          <tr><td class="sub-c">Dirección</td><td>${p.direccion || '—'}</td></tr>
          <tr><td class="sub-c">Código de persona trabajadora</td><td>${p.codigo || '—'}</td></tr>
          <tr><td class="sub-c">Supervisor/a asignado/a</td><td>${p.supervisor_nombre || '—'}</td></tr>
          <tr><td class="sub-c">Fecha de incorporación</td><td>${p.fecha_incorporacion ? fechaCorta(p.fecha_incorporacion) : '—'}</td></tr>
          ${p.fecha_cese ? `<tr><td class="sub-c">Fecha de cese</td><td>${fechaCorta(p.fecha_cese)}${p.motivo_cese ? ' · ' + p.motivo_cese : ''}</td></tr>` : ''}
          <tr><td class="sub-c">Fichaje de hoy</td><td>${fichajeHoy ? `Entrada: ${fichajeHoy.hora_entrada || '—'} · Salida: ${fichajeHoy.hora_salida || '—'} · ${fichajeHoy.estado || '—'}` : 'Sin fichaje registrado hoy.'}</td></tr>
        </tbody></table>
      </div>
      <div class="card card-pad">
        <div class="aprob-section-title" style="padding:0 0 10px;border-bottom:none;">🚨 Contacto en caso de urgencia</div>
        <table class="tbl"><tbody>
          <tr><td class="sub-c">Persona de contacto</td><td>${p.contacto_emergencia_nombre || '—'}</td></tr>
          <tr><td class="sub-c">Parentesco o relación</td><td>${p.contacto_emergencia_parentesco || '—'}</td></tr>
          <tr><td class="sub-c">Teléfono de contacto</td><td>${p.contacto_emergencia_telefono || '—'}</td></tr>
        </tbody></table>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px;max-width:480px;">
      <b style="font-size:12.5px;">💰 Cuadro de costes asociados${p.puesto_key ? ' (' + p.puesto_key + ')' : ''}</b>
      <div class="row-item"><span class="sub-c">Uniformidad + calzado + EPIs del puesto</span><b>${fmtEur(costeEpi)}</b></div>
      <div class="row-item"><span class="sub-c">Formación obligatoria (${horasFormacion.toFixed(1)} h)</span><b>${fmtEur(costeFormacion)}</b></div>
      <div class="row-item" style="border-bottom:none;"><span><b>Coste total de cobertura</b></span><b>${fmtEur(costeTotal)}</b></div>
    </div>

    ${uniformidadFichaBlockHTML(p, entregasEpiFicha || [], misFormularios)}

    ${seguimientoContratoBlockHTML(p, seg)}

    <p class="label-mock" style="margin:20px 0 10px;">Accesos rápidos</p>
    <div class="grid g4">
      <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-cuadrantes')"><div class="ic">📅</div><div><div class="t">Cuadrante</div><div class="v" style="font-size:13px;">Ver turnos</div></div></div>
      <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-uniformidad')"><div class="ic">🥽</div><div><div class="t">Uniformidad y EPIs</div><div class="v" style="font-size:13px;">Ver catálogo</div></div></div>
      <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-formularios')"><div class="ic">📝</div><div><div class="t">Formularios firmados</div><div class="v" style="font-size:13px;">${misFormularios.length} trámite(s)</div></div></div>
      <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-formacion')"><div class="ic">🎓</div><div><div class="t">Formación</div><div class="v" style="font-size:13px;">${miFormacion.length ? miFormacion.length + ' registro(s)' : 'Sin registros'}</div></div></div>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="aprob-section-title">📝 Formularios firmados por esta persona</div>
      <table><thead><tr><th>Formulario</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${
        misFormularios.length
          ? misFormularios
              .map((s) => {
                const plantilla = formulariosPlantillasCache.find((pl) => pl.id === s.plantilla_id);
                return `<tr><td>${plantilla ? plantilla.nombre : s.plantilla_id}</td><td>${fechaCorta((s.fecha_solicitud || '').slice(0, 10))}</td><td><span class="badge2 ${BADGE_ESTADO[s.estado] || 'b-slate'}">${STATUS_FORMULARIOS[s.estado] || s.estado}</span></td></tr>`;
              })
              .join('')
          : '<tr><td colspan="3" class="sub-c">Sin formularios firmados registrados.</td></tr>'
      }${
        misDisc.length
          ? `<tr><td colspan="3" style="background:var(--slate-50);font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--slate-500);padding-top:14px;">⚖️ Disciplina</td></tr>` +
            misDisc.map((f) => `<tr><td>${f.formulario_nombre}</td><td>${f.expedientes_disciplinarios ? fechaCorta(f.expedientes_disciplinarios.fecha_hecho) : '—'}</td><td><span class="badge2 b-emerald">✔️ Firmado y archivado</span></td></tr>`).join('')
          : ''
      }</tbody></table>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="aprob-section-title">🎓 Formación</div>
      <table><thead><tr><th>Curso</th><th>Fecha de realización</th><th>Estado</th></tr></thead>
      <tbody>${
        miFormacion.length
          ? miFormacion
              .map((r) => {
                const curso = formacionCursosCatalogoCache.find((c) => c.id === r.curso_id);
                const ind = formacionCursoEstadoIndicador(r, curso);
                return `<tr><td>${curso ? curso.nombre : r.curso_id}</td><td>${fechaCorta(r.fecha_realizacion)}</td><td><span class="badge2 ${ind.cls}">${ind.label}</span></td></tr>`;
              })
              .join('')
          : '<tr><td colspan="3" class="sub-c">Sin registros de formación para esta persona.</td></tr>'
      }</tbody></table>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="aprob-section-title">📂 Documentos</div>
      <table><thead><tr><th>Documento</th><th>Tipo</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>${
        fichaAdminDocumentosCache.length
          ? fichaAdminDocumentosCache.map((d) => `<tr><td>${d.nombre}${d.adjunto_url ? `<br><a href="#" data-ver-adjunto-ficha="${d.adjunto_url}" style="font-size:11px;">📎 Ver adjunto</a>` : ''}</td><td class="sub-c">${d.tipo}</td><td>${fechaCorta(d.fecha)}</td><td>${badgeEstado(d.estado)}</td></tr>`).join('')
          : '<tr><td colspan="4" class="sub-c">Sin documentos registrados para esta persona.</td></tr>'
      }</tbody></table>
      <form onsubmit="subirNominaFicha(event,'${p.id}')" style="padding:12px 16px;border-top:1px solid var(--slate-100);">
        <label style="margin-bottom:4px;">💶 Subir nómina (PDF u otro archivo)</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input type="text" id="nominaPeriodo_${p.id}" placeholder="Periodo (p. ej. Octubre 2026)" style="margin:0;flex:1;min-width:160px;" required>
          <input type="file" id="nominaArchivo_${p.id}" style="margin:0;">
          <button type="submit" class="btn btn-secondary btn-sm">Subir</button>
        </div>
      </form>
    </div>
  `;
  $('fichaAdminContent').querySelectorAll('[data-ver-adjunto-ficha]').forEach((a) =>
    a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const { data: signed, error } = await sb.storage.from('formularios-adjuntos').createSignedUrl(a.dataset.verAdjuntoFicha, 3600);
      if (error) { mostrarToast('No se pudo abrir el adjunto: ' + error.message, false); return; }
      window.open(signed.signedUrl, '_blank');
    })
  );
}

// Nómina real emitida por RR.HH. — mismo bucket/patrón que el resto de adjuntos (sin política de
// storage nueva); cierra el hueco de "documentos" tipo 'nomina', que nunca llegaba a poblarse en
// ningún circuito. El archivo es opcional (si RR.HH. solo quiere dejar constancia del periodo).
async function subirNominaFicha(e, trabajadorId) {
  e.preventDefault();
  const periodo = $('nominaPeriodo_' + trabajadorId).value.trim();
  const archivo = $('nominaArchivo_' + trabajadorId).files[0];
  let adjuntoUrl = null;
  if (archivo) {
    const ruta = `${trabajadorId}/nominas/${Date.now()}-${archivo.name}`;
    const { error: errorSubida } = await sb.storage.from('formularios-adjuntos').upload(ruta, archivo);
    if (errorSubida) {
      mostrarToast('Error al subir el archivo: ' + errorSubida.message, false);
      return;
    }
    adjuntoUrl = ruta;
  }
  const { error } = await sb.from('documentos').insert({
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: trabajadorId,
    tipo: 'nomina',
    nombre: `Nómina — ${periodo}`,
    meta: 'Subida por RR.HH.',
    adjunto_url: adjuntoUrl
  });
  mostrarToast(error ? 'Error: ' + error.message : 'Nómina registrada ✓', !error);
  if (!error) {
    const p = empleadosCache.find((x) => x.id === trabajadorId);
    await registrarAuditoria('Mis Documentos', 'Nómina subida', `${p ? p.nombre : trabajadorId} — ${periodo}`);
    await renderFichaAdmin(trabajadorId);
  }
}

// ---------- "📧 Enviar correo" (Admin → persona trabajadora) — equivalente real del C11 del
// prototipo (enviarCorreoFicha/abrirEnviarCorreoModal), con CC opcional a su jefe/a de departamento
// (mejora pedida expresamente por César, siguiendo el mismo patrón "para CC en correos, etc." que
// el propio HTML original ya usaba en otros circuitos vía getJefeDepartamentoDe). ------------------
let correoTrabajadorTarget = null;
async function abrirCorreoTrabajadorModal(id) {
  const p = empleadosCache.find((x) => x.id === id);
  if (!p) return;
  correoTrabajadorTarget = id;
  $('correoTrabajadorId').value = id;
  $('correoTrabajadorTitulo').textContent = `📧 Enviar correo — ${p.nombre}`;
  $('correoTrabajadorPara').value = p.email || '(sin email registrado)';
  $('correoTrabajadorAsunto').value = '';
  $('correoTrabajadorCuerpo').value = '';
  $('correoTrabajadorCC').value = '';
  $('modalCorreoTrabajador').classList.remove('hidden');
  // RPC security definer (0071): resuelve el email del/de la jefe/a de departamento a partir del
  // organigrama (sube un nivel si la propia persona ES la jefatura) — editable/vaciable.
  const { data: ccJefe } = await sb.rpc('jefe_departamento_email_de', { p_trabajador_id: id });
  if (correoTrabajadorTarget === id && ccJefe) $('correoTrabajadorCC').value = ccJefe;
}
function cerrarCorreoTrabajadorModal() {
  $('modalCorreoTrabajador').classList.add('hidden');
  correoTrabajadorTarget = null;
}
async function enviarCorreoTrabajador() {
  const id = $('correoTrabajadorId').value;
  const p = empleadosCache.find((x) => x.id === id);
  if (!p) return;
  const asunto = $('correoTrabajadorAsunto').value.trim();
  const cuerpo = $('correoTrabajadorCuerpo').value.trim();
  const cc = $('correoTrabajadorCC').value.trim();
  if (!p.email) {
    mostrarToast('⚠️ Esta persona trabajadora no tiene email registrado', false);
    return;
  }
  if (!asunto) {
    mostrarToast('⚠️ Indica el asunto', false);
    return;
  }
  if (!cuerpo) {
    mostrarToast('⚠️ Escribe el cuerpo del correo', false);
    return;
  }
  const { error } = await sb.rpc('enviar_correo_trabajador', {
    p_trabajador_id: id,
    p_asunto: asunto,
    p_cuerpo: cuerpo,
    p_cc_email: cc || null
  });
  mostrarToast(error ? 'Error: ' + error.message : `Correo enviado a ${p.nombre} ✓${cc ? ' · CC: ' + cc : ''}`, !error);
  if (!error) {
    await registrarAuditoria('Comunicaciones', 'Correo enviado desde la ficha', `${p.nombre} — ${asunto}${cc ? ' · CC: ' + cc : ''}`);
    cerrarCorreoTrabajadorModal();
  }
}

function _opcionesPuestoKeyConocidas() {
  // Une las claves de puesto ya en uso en este hotel (descripciones de puesto + catálogo de EPIs) para
  // sugerirlas en el campo de ficha — sin forzar un listado fijo, porque distintas pantallas de la app
  // pueden ir ampliando el catálogo de puestos con el tiempo.
  const claves = new Set();
  (descPuestoCache || []).forEach((d) => d.puesto_key && claves.add(d.puesto_key));
  (epiCatalogoCache || []).forEach((c) => c.puesto_key && claves.add(c.puesto_key));
  return Array.from(claves).sort();
}

function abrirFichaEmpleado(id) {
  const p = id ? empleadosCache.find((x) => x.id === id) : null;
  $('modalFichaTitulo').textContent = p ? 'Ficha — ' + p.nombre : 'Nueva persona trabajadora';
  $('fEmpleadoId').value = p ? p.id : '';
  $('fNombre').value = p ? p.nombre || '' : '';
  $('fCodigo').value = p ? p.codigo || '' : '';
  $('fEmail').value = p ? p.email || '' : '';
  $('fPuesto').value = p ? p.puesto || '' : '';
  $('fDepartamento').value = p ? p.departamento || '' : '';
  $('fCentro').value = p ? p.centro || '' : '';
  $('fSupervisor').value = p ? p.supervisor_nombre || '' : '';
  $('fRolPuesto').value = p ? p.rol_puesto || '' : '';
  $('fPuestoKey').value = p ? p.puesto_key || '' : '';
  if ($('dlPuestoKeys')) $('dlPuestoKeys').innerHTML = _opcionesPuestoKeyConocidas().map((k) => `<option value="${k}">`).join('');
  $('fEstadoLaboral').value = p ? p.estado_laboral || 'Activo' : 'Activo';
  $('fFechaIncorporacion').value = p ? p.fecha_incorporacion || '' : '';
  $('fFechaCese').value = p ? p.fecha_cese || '' : '';
  $('fMotivoCese').value = p ? p.motivo_cese || '' : '';
  $('fContactoNombre').value = p ? p.contacto_emergencia_nombre || '' : '';
  $('fContactoParentesco').value = p ? p.contacto_emergencia_parentesco || '' : '';
  $('fContactoTelefono').value = p ? p.contacto_emergencia_telefono || '' : '';
  $('fDniNie').value = p ? p.dni_nie || '' : '';
  $('fFechaNacimiento').value = p ? p.fecha_nacimiento || '' : '';
  $('fSeguridadSocial').value = p ? p.seguridad_social || '' : '';
  $('fDireccion').value = p ? p.direccion || '' : '';
  $('modalFicha').classList.remove('hidden');
}

function cerrarModalFicha() {
  $('modalFicha').classList.add('hidden');
}

async function guardarFichaEmpleado(e) {
  e.preventDefault();
  const id = $('fEmpleadoId').value;
  const anterior = id ? empleadosCache.find((x) => x.id === id) : null;
  const payload = {
    nombre: $('fNombre').value.trim(),
    codigo: $('fCodigo').value.trim() || null,
    email: $('fEmail').value.trim() || null,
    puesto: $('fPuesto').value.trim() || null,
    departamento: $('fDepartamento').value.trim() || null,
    centro: $('fCentro').value.trim() || null,
    supervisor_nombre: $('fSupervisor').value.trim() || null,
    rol_puesto: $('fRolPuesto').value.trim() || null,
    puesto_key: $('fPuestoKey').value.trim().toLowerCase() || null,
    estado_laboral: $('fEstadoLaboral').value,
    fecha_incorporacion: $('fFechaIncorporacion').value || null,
    fecha_cese: $('fFechaCese').value || null,
    motivo_cese: $('fMotivoCese').value.trim() || null,
    contacto_emergencia_nombre: $('fContactoNombre').value.trim() || null,
    contacto_emergencia_parentesco: $('fContactoParentesco').value.trim() || null,
    contacto_emergencia_telefono: $('fContactoTelefono').value.trim() || null,
    dni_nie: $('fDniNie').value.trim() || null,
    fecha_nacimiento: $('fFechaNacimiento').value || null,
    seguridad_social: $('fSeguridadSocial').value.trim() || null,
    direccion: $('fDireccion').value.trim() || null
  };
  let error;
  if (id) {
    ({ error } = await sb.from('personas_trabajadoras').update(payload).eq('id', id));
  } else {
    ({ error } = await sb.from('personas_trabajadoras').insert({ ...payload, hotel_id: usuarioActual.hotel_id }));
  }
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Guardado ✓', !error);
  if (!error) {
    // "⚙️ Cambiar situación" del prototipo — no era un modal propio en la app real (ya se podía
    // cambiar estado_laboral desde la ficha completa), pero el cambio no quedaba auditado ni
    // avisaba a Admin, a diferencia del original (logAudit + addNotification('admin', ...)).
    if (anterior && (anterior.estado_laboral || 'Activo') !== payload.estado_laboral) {
      const detalle = `${payload.nombre} — ${anterior.estado_laboral || 'Activo'} → ${payload.estado_laboral}`;
      await registrarAuditoria('Personas trabajadoras', payload.estado_laboral === 'Activo' ? 'Persona reactivada — vuelve a estar Activo' : 'Cambio de situación de la persona trabajadora', detalle);
      await sb.from('notificaciones_cola').insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: null,
        tipo: 'cambio_situacion',
        titulo: payload.estado_laboral === 'Activo' ? '✅ Persona reactivada' : '🚫 Cambio de situación laboral',
        cuerpo: detalle,
        canal_push: true,
        canal_email: false
      });
    }
    cerrarModalFicha();
    await cargarEmpleados();
    await cargarPanelGeneral();
    const idGuardado = id || (empleadosCache.find((x) => x.nombre === payload.nombre) || {}).id;
    if ($('screen-admin-ficha') && $('screen-admin-ficha').classList.contains('active') && idGuardado) {
      await renderFichaAdmin(idGuardado);
    }
  }
}

// ---------- Personas trabajadoras: importación masiva desde Excel/CSV ----------
// Misma cabecera que usa "Exportar" (EMPLEADO_CAMPOS del prototipo original), para que lo exportado desde
// un hotel se pueda reeditar en Excel y volver a importar sin tener que tocar columnas.
const EMPLEADO_CAMPOS_IMPORT = [
  'Código', 'Nombre', 'Email', 'Puesto', 'Departamento', 'Centro', 'Rol', 'PuestoKey',
  'Fecha incorporación', 'Estado laboral', 'Supervisor asignado',
  'Persona de contacto en caso de urgencia', 'Parentesco o relación', 'Teléfono de la persona de contacto',
  'Número de Seguridad Social', 'Dirección actual', 'DNI/NIE', 'Fecha de nacimiento'
];

function _normalizarFechaImport(v) {
  if (v === null || v === undefined || v === '' || v === '—') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'number') {
    // Serial de fecha de Excel (días desde 1899-12-30).
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function _mapearFilaImportEmpleado(campos) {
  // campos: array alineado con EMPLEADO_CAMPOS_IMPORT (18 columnas) — strings ya "trim"eadas, '' si vacío.
  const v = (i) => (campos[i] !== undefined && campos[i] !== null ? String(campos[i]).trim() : '');
  return {
    codigo: v(0) || null,
    nombre: v(1) || null,
    email: v(2) || null,
    puesto: v(3) || null,
    departamento: v(4) || null,
    centro: v(5) || null,
    rol_puesto: v(6) || 'Empleado',
    puesto_key: v(7) ? v(7).toLowerCase() : null,
    fecha_incorporacion: _normalizarFechaImport(campos[8]),
    estado_laboral: v(9) || 'Activo',
    supervisor_nombre: v(10) || null,
    contacto_emergencia_nombre: v(11) || null,
    contacto_emergencia_parentesco: v(12) || null,
    contacto_emergencia_telefono: v(13) || null,
    seguridad_social: v(14) || null,
    direccion: v(15) || null,
    dni_nie: v(16) || null,
    fecha_nacimiento: _normalizarFechaImport(campos[17])
  };
}

function abrirModalImportarEmpleados() {
  $('importEmpleadosArchivo').value = '';
  $('importEmpleadosResultado').innerHTML = '';
  $('modalImportarEmpleados').classList.remove('hidden');
}
function cerrarModalImportarEmpleados() {
  $('modalImportarEmpleados').classList.add('hidden');
}

async function confirmarImportarEmpleados() {
  const file = $('importEmpleadosArchivo').files[0];
  const resultEl = $('importEmpleadosResultado');
  if (!file) { resultEl.textContent = 'Selecciona un archivo .xlsx o .csv.'; return; }
  if (typeof XLSX === 'undefined') { resultEl.textContent = 'No se ha podido cargar el motor de Excel (xlsx.min.js).'; return; }

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filasObj = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });
    // La primera fila es la cabecera (EMPLEADO_CAMPOS); se ignora su contenido literal y solo se usa el
    // ORDEN de columnas, igual que hacía la importación del HTML original.
    const filasDatos = filasObj.slice(1).filter((f) => f && f.some((c) => String(c ?? '').trim() !== ''));
    if (!filasDatos.length) { resultEl.textContent = 'El archivo no contiene filas de datos bajo la cabecera.'; return; }

    const errores = [];
    const payloadsNuevos = [];
    const payloadsActualizar = []; // { id, payload }
    // César (03/11/2026): "si una empresa contrata esta aplicación le vamos a pedir que nos envíe
    // el listado de todos los trabajadores con la fecha inicial [...] en función de esta fecha será
    // el código" — antes, una fila sin "Código" (justo el caso de un cliente nuevo, que nunca tuvo
    // nuestro formato de código) se descartaba entera. Ya NO se exige Código: si falta, se genera
    // con el mismo criterio AAMMDD+nº que usa darAltaDesdeCanditado() (migración 0112), a partir de
    // la propia "Fecha incorporación" de esa fila — que pasa también a guardarse como fecha_primera_
    // incorporacion (fecha real del primer contrato, la que usa antiguedad_anos_naturales()). Si la
    // fila SÍ trae Código (reimportación de un Excel ya exportado desde aquí), se respeta tal cual,
    // exactamente igual que antes.
    filasDatos.forEach((campos, idx) => {
      const nFila = idx + 2; // +1 cabecera, +1 índice humano (base 1)
      if (campos.length < 2 || !String(campos[1] ?? '').trim()) {
        errores.push(`Fila ${nFila}: descartada — falta Nombre.`);
        return;
      }
      const payload = _mapearFilaImportEmpleado(campos);
      const existente = payload.codigo && empleadosCache.find((p) => (p.codigo || '').trim() && p.codigo.trim() === payload.codigo);
      if (existente) payloadsActualizar.push({ id: existente.id, payload });
      else payloadsNuevos.push(payload);
    });

    if (!payloadsNuevos.length && !payloadsActualizar.length) {
      resultEl.innerHTML = 'Ninguna fila es válida.<br>' + errores.join('<br>');
      return;
    }

    let errorInsert = null;
    let errorUpdate = null;
    // César (03/11/2026): "si una empresa contrata esta aplicación le vamos a pedir que nos envíe el
    // listado" — ese alta masiva de la plantilla de un cliente nuevo tenía el mismo hueco que ya se
    // cerró para el alta individual (darAltaDesdeCanditado): la ficha se creaba, pero nunca se
    // llamaba a crear-cuenta-trabajador(), así que ninguna de esas personas recibía cuenta ni correo
    // de bienvenida. Mismo criterio aquí: solo para filas NUEVAS (nunca al actualizar una ficha ya
    // existente) y solo si traen email; si falla para una fila concreta, no bloquea el resto de la
    // importación — se cuenta como omitida y se puede crear a mano después, igual que en el alta
    // individual.
    let cuentasCreadas = 0;
    let cuentasOmitidas = 0;
    let cuentasSinEmail = 0;
    // Inserción secuencial (no en bloque): cada fila nueva sin Código necesita ver ya insertadas las
    // anteriores de la misma fecha en esta misma tanda para no repetir el mismo nº de secuencia
    // (generar_codigo_empleado cuenta las filas ya existentes en BD en el momento de la llamada).
    for (const payload of payloadsNuevos) {
      let codigo = payload.codigo;
      if (!codigo) {
        const fechaBase = payload.fecha_incorporacion || new Date().toISOString().slice(0, 10);
        const { data: codigoGenerado, error: errCodigo } = await sb.rpc('generar_codigo_empleado', { p_fecha: fechaBase });
        if (errCodigo) { errorInsert = errCodigo; break; }
        codigo = codigoGenerado;
      }
      const { data: filaNueva, error } = await sb.from('personas_trabajadoras').insert({
        ...payload,
        codigo,
        fecha_primera_incorporacion: payload.fecha_incorporacion || null,
        hotel_id: usuarioActual.hotel_id
      }).select('id, email').single();
      if (error) { errorInsert = error; break; }
      if (filaNueva?.email) {
        const { error: errorCuenta } = await sb.functions.invoke('crear-cuenta-trabajador', { body: { trabajador_id: filaNueva.id } });
        if (errorCuenta) cuentasOmitidas++; else cuentasCreadas++;
      } else {
        cuentasSinEmail++;
      }
    }
    if (!errorInsert && payloadsActualizar.length) {
      for (const { id, payload } of payloadsActualizar) {
        const { error } = await sb.from('personas_trabajadoras').update(payload).eq('id', id);
        if (error) { errorUpdate = error; break; }
      }
    }
    if (errorInsert || errorUpdate) {
      resultEl.textContent = 'Error al importar: ' + (errorInsert || errorUpdate).message;
      return;
    }

    const resumenAccesos = payloadsNuevos.length
      ? ` · Accesos: ${cuentasCreadas} creado(s)` + (cuentasOmitidas ? `, ${cuentasOmitidas} con error (créalos a mano)` : '') + (cuentasSinEmail ? `, ${cuentasSinEmail} sin email` : '')
      : '';
    const resumen = `${payloadsNuevos.length} persona(s) nueva(s), ${payloadsActualizar.length} actualizada(s)` + (errores.length ? `, ${errores.length} fila(s) descartada(s)` : '') + resumenAccesos;
    mostrarToast(`Importación completada ✓ ${resumen}`, true);
    await registrarAuditoria('Personas trabajadoras', 'Carga masiva por importación', resumen);
    if (errores.length) {
      resultEl.innerHTML = `${resumen}.<br>` + errores.join('<br>');
    } else {
      cerrarModalImportarEmpleados();
    }
    await cargarEmpleados();
    await cargarPanelGeneral();
  } catch (err) {
    resultEl.textContent = 'No se ha podido leer el archivo: ' + err.message;
  }
}

// ---------- Cuadrantes ----------
let turnosCache = [];
let cuadranteCache = [];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ESTADOS_ESPECIALES = [
  ['descanso', 'D · Descanso'],
  ['permiso', 'P · Permiso'],
  ['baja', 'B · Baja'],
  ['ausente', 'A · Ausente'],
  ['ausencia_autorizada', 'AA · Ausencia autorizada'],
  ['ausencia_parcial', 'AP · Ausencia parcial'],
  ['descanso_festivo', 'DF · Descanso festivo (compensatorio)'],
  ['festivo_trabajado', 'FT · Festivo trabajado']
];

function poblarSelectoresMesAnio() {
  const hoy = new Date();
  if (!$('cuadMes').options.length) {
    $('cuadMes').innerHTML = MESES.map((m, i) => `<option value="${i}">${m}</option>`).join('');
    $('cuadMes').value = hoy.getMonth();
  }
  if (!$('cuadAnio').options.length) {
    const anios = [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1];
    $('cuadAnio').innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join('');
    $('cuadAnio').value = hoy.getFullYear();
  }
}

function claseTurno(codigo) {
  if (!codigo) return 'sh-empty';
  const letra = (codigo.split('-')[1] || '').charAt(0);
  const map = { M: 'sh-m', T: 'sh-t', N: 'sh-n', I: 'sh-i', P: 'sh-p', D: 'sh-d' };
  return map[letra] || 'sh-slate';
}

// Filtro de departamento (vacío = todos). Se rellena una sola vez, a partir de los
// departamentos reales ya presentes en empleadosCache — no inventa una lista fija.
function poblarFiltroDeptoCuadrantes() {
  const sel = $('cuadFiltroDepto');
  if (!sel || sel.options.length) return;
  const deptos = Array.from(new Set(empleadosCache.map((p) => p.departamento).filter(Boolean))).sort();
  sel.innerHTML = deptos.map((d) => `<option value="${d}">${d}</option>`).join('');
}
function deptosSeleccionadosCuadrantes() {
  const sel = $('cuadFiltroDepto');
  if (!sel) return [];
  return Array.from(sel.selectedOptions).map((o) => o.value);
}

// Semanas lunes-domingo que cubren el mes seleccionado (normalmente 5, a veces 4 o 6 según en qué
// día de la semana caiga el 1 y el último día) — réplica del "vista mensual (5 semanas)" del
// prototipo, pero calculada para cualquier mes/año en vez de una ventana fija de demo.
function semanasDelMes(anio, mes) {
  const primerDia = new Date(anio, mes, 1);
  const ultimoDia = new Date(anio, mes + 1, 0);
  const lunesPrimera = new Date(primerDia);
  lunesPrimera.setDate(primerDia.getDate() - ((primerDia.getDay() + 6) % 7));
  const semanas = [];
  let cursor = new Date(lunesPrimera);
  while (cursor <= ultimoDia) {
    semanas.push(Array.from({ length: 7 }, (_, i) => {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      return d;
    }));
    cursor.setDate(cursor.getDate() + 7);
  }
  return semanas;
}
function isoFecha(d) {
  return d.toISOString().slice(0, 10);
}
function rangoSemanaTxt(dias) {
  const opts = { day: '2-digit', month: 'short' };
  return `${dias[0].toLocaleDateString('es-ES', opts)} – ${dias[6].toLocaleDateString('es-ES', opts)}`;
}

let cuadranteSemanasCache = [];
let inomCountCache = {}; // "${trabajador_id}|${fecha}" -> nº de incidencias_nomina ese día (ver _renderIncidenciasNominaEnModalTurno)

async function cargarCuadrantes() {
  poblarSelectoresMesAnio();
  poblarFiltroDeptoCuadrantes();
  const mes = parseInt($('cuadMes').value, 10);
  const anio = parseInt($('cuadAnio').value, 10);
  const semanas = semanasDelMes(anio, mes);
  cuadranteSemanasCache = semanas;
  const desde = isoFecha(semanas[0][0]);
  const hasta = isoFecha(semanas[semanas.length - 1][6]);

  const [{ data: turnos }, { data: asignaciones }, { data: inomDelRango }] = await Promise.all([
    sb.from('turnos_catalogo').select('*').order('codigo'),
    sb.from('cuadrante_asignaciones').select('*, turnos_catalogo(codigo, nombre)').gte('fecha', desde).lte('fecha', hasta),
    sb.from('incidencias_nomina').select('trabajador_id, fecha').gte('fecha', desde).lte('fecha', hasta)
  ]);
  turnosCache = turnos || [];
  cuadranteCache = asignaciones || [];
  inomCountCache = {};
  (inomDelRango || []).forEach((i) => {
    const k = `${i.trabajador_id}|${i.fecha}`;
    inomCountCache[k] = (inomCountCache[k] || 0) + 1;
  });

  const deptosFiltro = deptosSeleccionadosCuadrantes();
  const empleadosFiltrados = deptosFiltro.length ? empleadosCache.filter((p) => deptosFiltro.includes(p.departamento)) : empleadosCache;

  const resumenEl = $('cuadFiltroResumen');
  if (resumenEl) {
    const deptosTxt = deptosFiltro.length ? deptosFiltro.join(', ') : 'todos los departamentos';
    resumenEl.textContent = `Mostrando: ${deptosTxt} · ${empleadosFiltrados.length} persona(s) · ${MESES[mes]} ${anio} (${semanas.length} semana(s))`;
  }

  $('cuadSemanasContainer').innerHTML = semanas
    .map((dias, idxSemana) => {
      const filas = empleadosFiltrados
        .map((p) => {
          const celdas = dias
            .map((d) => {
              const fecha = isoFecha(d);
              const a = cuadranteCache.find((x) => x.trabajador_id === p.id && x.fecha === fecha);
              let texto = '';
              let cls = 'sh-empty';
              // César (parte 5): cualquier estado_especial puede convivir con un turno ya asignado,
              // no solo el aviso genérico de turno extra — ver misma nota en vistaTrabajadorCuadrante.
              if (a && a.estado_especial && a.turnos_catalogo) {
                const esIncidenciaGenerica = a.estado_especial === 'incidencia_nomina';
                texto = esIncidenciaGenerica ? '💶' + (a.turnos_catalogo.codigo.split('-')[1] || '?').charAt(0) : _abreviaturaEstadoEspecial(a.estado_especial);
                cls = esIncidenciaGenerica ? 'sh-inom' : 'sh-d';
              } else if (a && a.turnos_catalogo) {
                texto = (a.turnos_catalogo.codigo.split('-')[1] || '?').charAt(0);
                cls = claseTurno(a.turnos_catalogo.codigo);
              } else if (a && a.estado_especial) {
                texto = _abreviaturaEstadoEspecial(a.estado_especial);
                cls = 'sh-d';
              }
              const tieneNota = !!(a && a.nota);
              const tituloBase = a && a.estado_especial && a.turnos_catalogo
                ? (a.estado_especial === 'incidencia_nomina' ? `💶 Genera incidencia nómina — ${a.turnos_catalogo.nombre}` : `${NOMBRES_ESTADO_CUADRANTE[a.estado_especial] || a.estado_especial} — turno convocado: ${a.turnos_catalogo.nombre}`)
                : a && a.turnos_catalogo ? a.turnos_catalogo.nombre : a && a.estado_especial ? (NOMBRES_ESTADO_CUADRANTE[a.estado_especial] || a.estado_especial) : 'Sin asignar';
              const esFestivo = !!(a && a.es_festivo);
              const titulo = (tieneNota ? `${tituloBase} — 📝 ${a.nota}` : tituloBase) + (esFestivo ? ' · 🎉 Festivo trabajado' : '');
              const marcaNota = tieneNota ? '<span class="shift-nota-dot" title="Tiene nota">📝</span>' : '';
              const marcaFestivo = esFestivo ? '<span class="shift-nota-dot" title="Festivo trabajado">🎉</span>' : '';
              const nInom = inomCountCache[`${p.id}|${fecha}`] || 0;
              const contador = nInom > 1 ? `<span class="shift-cell-count" title="${nInom} incidencias de nómina este día" onclick="abrirModalTurno('${p.id}','${fecha}')">${nInom}</span>` : '';
              return `<td><span class="shift-cell ${cls}" onclick="abrirModalTurno('${p.id}','${fecha}')" title="${(titulo || '').replace(/"/g, '&quot;')}">${texto}</span>${contador}${marcaNota}${marcaFestivo}</td>`;
            })
            .join('');
          return `<tr><td><b style="font-size:11.5px;">${p.nombre}</b></td>${celdas}</tr>`;
        })
        .join('');
      return `<div class="card card-pad" style="margin-bottom:12px;">
        <div class="form-block-title" style="margin-bottom:2px;">Semana ${idxSemana + 1} · ${rangoSemanaTxt(dias)}</div>
        <div class="cuad-grid"><table>
          <thead><tr><th>Persona trabajadora</th><th>L</th><th>M</th><th>X</th><th>J</th><th>V</th><th>S</th><th>D</th></tr></thead>
          <tbody>${filas || '<tr><td colspan="8" class="sub-c" style="text-align:center;padding:14px;">Ningún departamento seleccionado tiene personas asignadas.</td></tr>'}</tbody>
        </table></div>
        <div id="cuadResumenSemana${idxSemana}" style="margin-top:8px;"></div>
      </div>`;
    })
    .join('');

  // César (06/11/2026): "en la parte de abajo, donde está la memoria de los nombres de los
  // turnos, ahí debería aparecer los iconos de las incidencias nómina" — se añade como referencia
  // permanente (igual que el resto de la leyenda), aunque el icono 💶 y el contador solo se vean
  // en el día en que de verdad ocurre una incidencia — no en todos los trabajadores por defecto.
  $('cuadLeyenda').innerHTML =
    '🟦 Mañana · 🟧 Tarde · 🟪 Noche · 🟣 Intermedio · 🟩 Partido · ⬜ Descanso/especial · 💶 Incidencia de nómina ' +
    '(<span class="shift-cell-count" style="position:static;margin-left:0;">n</span> = varias el mismo día, clic para verlas) ' +
    '— haz clic en cualquier turno para reasignarlo desde la base de datos.';

  // Extras añadidos sobre el mismo ciclo de carga de Cuadrantes — se recalculan cada vez que
  // se recarga el cuadrante (cambio de mes/año o de filtro), nunca en paralelo con cargarCuadrantes
  // desde otro sitio, así que no hay condición de carrera con cuadranteCache/empleadosCache.
  renderCuadTotales(empleadosFiltrados, semanas);
  await actualizarFichajeHoy();
  await renderCuadranteSecuenciaEstado();
  await renderEstadoPublicacionCuadrante(mes, anio);
}

// ---------- Cuadrantes: publicación e importación desde Excel/CSV ----------
// Cierra los dos pendientes de interactividad que en el prototipo solo mostraban
// 'Función no incluida en este prototipo': "Publicar" y "Importar Excel".
async function renderEstadoPublicacionCuadrante(mes, anio) {
  const el = $('cuadEstadoPublicacion');
  if (!el) return;
  const { data } = await sb.from('cuadrante_publicaciones').select('*').eq('mes', mes).eq('anio', anio).maybeSingle();
  el.textContent = data
    ? `✅ Publicado el ${new Date(data.publicado_en).toLocaleString('es-ES')} por ${data.publicado_por || '—'}`
    : '⚠ Cuadrante de este mes aún sin publicar.';
}

async function publicarCuadranteActual() {
  const mes = parseInt($('cuadMes').value, 10);
  const anio = parseInt($('cuadAnio').value, 10);
  const deptosFiltro = deptosSeleccionadosCuadrantes();
  const empleadosAfectados = deptosFiltro.length ? empleadosCache.filter((p) => deptosFiltro.includes(p.departamento)) : empleadosCache;
  if (!empleadosAfectados.length) {
    mostrarToast('No hay personas trabajadoras en el filtro actual — nada que publicar.', false);
    return;
  }
  const { error: errorPub } = await sb.from('cuadrante_publicaciones').upsert(
    {
      hotel_id: usuarioActual.hotel_id,
      mes,
      anio,
      publicado_en: new Date().toISOString(),
      publicado_por: usuarioActual ? usuarioActual.nombre : '—',
      departamentos: deptosFiltro.length ? deptosFiltro.join(', ') : 'todos los departamentos'
    },
    { onConflict: 'hotel_id,mes,anio' }
  );
  if (errorPub) {
    mostrarToast('Error al publicar: ' + errorPub.message, false);
    return;
  }
  const notificaciones = empleadosAfectados.map((p) => ({
    trabajador_id: p.id,
    hotel_id: usuarioActual.hotel_id,
    tipo: 'cuadrante_publicado',
    titulo: 'Nuevo cuadrante publicado',
    cuerpo: `Se ha publicado tu cuadrante de ${MESES[mes]} ${anio}. Consúltalo en "Mi Cuadrante".`,
    referencia_tabla: 'cuadrante_publicaciones',
    canal_push: true,
    canal_email: true
  }));
  const { error: errorNotif } = await sb.from('notificaciones_cola').insert(notificaciones);
  if (errorNotif) {
    // La publicación ya quedó registrada; si falla solo el aviso, se informa pero no se revierte.
    mostrarToast('Publicado, pero no se pudieron encolar las notificaciones: ' + errorNotif.message, false);
  } else {
    mostrarToast(`Cuadrante publicado ✓ — ${notificaciones.length} persona(s) notificada(s)`, true);
  }
  await registrarAuditoria('Cuadrantes', 'Publicación de cuadrante', `${MESES[mes]} ${anio} · ${empleadosAfectados.length} persona(s) · ${deptosFiltro.length ? deptosFiltro.join(', ') : 'todos los departamentos'}`);
  await renderEstadoPublicacionCuadrante(mes, anio);
}

function abrirModalImportarCuadrante() {
  $('importCuadranteArchivo').value = '';
  $('importCuadranteResultado').textContent = '';
  $('modalImportarCuadrante').classList.remove('hidden');
}
function cerrarModalImportarCuadrante() {
  $('modalImportarCuadrante').classList.add('hidden');
}
async function confirmarImportarCuadrante() {
  const file = $('importCuadranteArchivo').files[0];
  const resultEl = $('importCuadranteResultado');
  if (!file) return (resultEl.textContent = 'Selecciona un archivo .xlsx o .csv.');
  if (typeof XLSX === 'undefined') return (resultEl.textContent = 'No se ha podido cargar el motor de Excel (xlsx.min.js).');
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
    if (!filas.length) {
      resultEl.textContent = 'El archivo no contiene filas de datos.';
      return;
    }
    const errores = [];
    const payloads = [];
    filas.forEach((f, idx) => {
      const nFila = idx + 2; // +1 cabecera, +1 índice humano
      const email = String(f.email || '').trim().toLowerCase();
      const fecha = String(f.fecha || '').trim();
      const turnoCodigo = String(f.turno_codigo || '').trim();
      const estadoEspecial = String(f.estado_especial || '').trim().toLowerCase();
      if (!email || !fecha) {
        errores.push(`Fila ${nFila}: falta email o fecha.`);
        return;
      }
      const empleado = empleadosCache.find((p) => (p.email || '').toLowerCase() === email);
      if (!empleado) {
        errores.push(`Fila ${nFila}: no existe ninguna persona trabajadora con email "${email}".`);
        return;
      }
      if (!turnoCodigo && !estadoEspecial) {
        errores.push(`Fila ${nFila}: indica turno_codigo o estado_especial.`);
        return;
      }
      let turnoId = null;
      if (turnoCodigo) {
        const turno = turnosCache.find((t) => t.codigo.toLowerCase() === turnoCodigo.toLowerCase());
        if (!turno) {
          errores.push(`Fila ${nFila}: no existe ningún turno con código "${turnoCodigo}" en el catálogo.`);
          return;
        }
        turnoId = turno.id;
      }
      if (estadoEspecial && !CATEGORIAS_CUADRANTE.includes(estadoEspecial)) {
        errores.push(`Fila ${nFila}: estado_especial "${estadoEspecial}" no reconocido.`);
        return;
      }
      payloads.push({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: empleado.id,
        fecha,
        turno_id: turnoId,
        estado_especial: turnoId ? null : estadoEspecial
      });
    });
    if (!payloads.length) {
      resultEl.innerHTML = 'Ninguna fila es válida.<br>' + errores.join('<br>');
      return;
    }
    const { error } = await sb.from('cuadrante_asignaciones').upsert(payloads, { onConflict: 'trabajador_id,fecha' });
    if (error) {
      resultEl.textContent = 'Error al importar: ' + error.message;
      return;
    }
    mostrarToast(`${payloads.length} turno(s) importado(s) ✓${errores.length ? ` (${errores.length} fila(s) omitida(s))` : ''}`, true);
    await registrarAuditoria('Cuadrantes', 'Importación de turnos desde Excel', `${payloads.length} turno(s) importado(s) · ${errores.length} fila(s) omitida(s)`);
    if (errores.length) {
      resultEl.innerHTML = `${payloads.length} turno(s) importado(s). Filas omitidas:<br>` + errores.join('<br>');
    } else {
      cerrarModalImportarCuadrante();
    }
    await cargarCuadrantes();
  } catch (err) {
    resultEl.textContent = 'No se ha podido leer el archivo: ' + err.message;
  }
}

let turnoEditContext = null; // { trabajadorId, fecha }

function abrirModalTurno(trabajadorId, fecha) {
  turnoEditContext = { trabajadorId, fecha };
  const p = empleadosCache.find((x) => x.id === trabajadorId);
  $('modalTurnoTitulo').textContent = `${p ? p.nombre : ''} — ${fecha}`;
  const actual = cuadranteCache.find((x) => x.trabajador_id === trabajadorId && x.fecha === fecha);
  const opciones = ['<option value="">— Sin asignar (borrar) —</option>']
    .concat(turnosCache.map((t) => `<option value="turno:${t.id}">${t.codigo} — ${t.nombre}${t.departamento ? ' (' + t.departamento + ')' : ''}</option>`))
    .concat(ESTADOS_ESPECIALES.map(([v, label]) => `<option value="especial:${v}">${label}</option>`));
  $('turnoSelect').innerHTML = opciones.join('');
  if (actual && actual.turno_id) $('turnoSelect').value = 'turno:' + actual.turno_id;
  else if (actual && actual.estado_especial) $('turnoSelect').value = 'especial:' + actual.estado_especial;
  else $('turnoSelect').value = '';
  $('turnoNota').value = (actual && actual.nota) || '';
  $('turnoEsFestivo').checked = !!(actual && actual.es_festivo);
  $('modalTurno').classList.remove('hidden');
  _renderIncidenciasNominaEnModalTurno(trabajadorId, fecha);
}

// César (06/11/2026, parte 6): "revisa que el cuadrante no refleja ninguno de los cambios [...]
// aunque haya habido un cambio y posteriormente otro cambio que anula el anterior, debe quedar
// registrado en el día [...] Cambio 1, cambio 2 o simplemente 1, ver incidencia nómina. 2, ver
// incidencia nómina" — el cuadrito del día solo puede mostrar UN estado_especial (una sola
// columna en cuadrante_asignaciones), así que la trazabilidad completa de ese día se muestra aquí,
// al pinchar la celda: todas las incidencias_nomina de esa persona en esa fecha, numeradas.
async function _renderIncidenciasNominaEnModalTurno(trabajadorId, fecha) {
  const cont = $('turnoIncidenciasNomina');
  if (!cont) return;
  cont.classList.add('hidden');
  cont.innerHTML = '';
  const { data } = await sb.from('incidencias_nomina').select('*').eq('trabajador_id', trabajadorId).eq('fecha', fecha).order('created_at');
  if (!data || !data.length) return;
  cont.classList.remove('hidden');
  cont.innerHTML = `<label style="margin-top:10px;">💶 Incidencias de nómina este día (${data.length})</label>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${data.map((i, idx) => {
        const tl = INOM_TIPO_LABEL[i.tipo] || ['—'];
        const firmas = `🏢${i.firma_rrhh_en ? '✓' : '⏳'} 👤${i.firma_trabajador_en ? '✓' : '⏳'} 🧑‍💼${i.confidencial ? '—' : i.firma_jefe_departamento_en ? '✓' : '⏳'}`;
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12.5px;">
          <span><b>${idx + 1}.</b> ${tl[0]}${i.descripcion ? ' — ' + i.descripcion : ''} <span class="sub-c">(${firmas})</span></span>
          <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px;white-space:nowrap;" onclick="irAIncidenciasNominaDesdeCuadrante('${trabajadorId}','${fecha}')">Ver incidencia nómina</button>
        </div>`;
      }).join('')}
    </div>`;
}

function _inomPeriodoIndexParaFecha(fecha) {
  if (!_inomPeriodos.length) _construirPeriodosNomina();
  const idx = _inomPeriodos.findIndex((p) => fecha >= p.desde && fecha <= p.hasta);
  return idx >= 0 ? idx : 0;
}

async function irAIncidenciasNominaDesdeCuadrante(trabajadorId, fecha) {
  cerrarModalTurno();
  showScreen('admin-incidencias-nomina');
  if ($('inomPeriodoSelect')) $('inomPeriodoSelect').value = String(_inomPeriodoIndexParaFecha(fecha));
  await cargarIncidenciasNominaAdmin();
  if ($('inomFiltroPersona')) $('inomFiltroPersona').value = trabajadorId;
  renderIncidenciasNominaTabla();
}

function cerrarModalTurno() {
  $('modalTurno').classList.add('hidden');
  turnoEditContext = null;
}

async function guardarTurno() {
  if (!turnoEditContext) return;
  const { trabajadorId, fecha } = turnoEditContext;
  const valor = $('turnoSelect').value;
  const existente = cuadranteCache.find((x) => x.trabajador_id === trabajadorId && x.fecha === fecha);

  if (!valor) {
    if (existente) {
      const { error } = await sb.from('cuadrante_asignaciones').delete().eq('id', existente.id);
      mostrarToast(error ? 'Error: ' + error.message : 'Asignación eliminada ✓', !error);
    }
    cerrarModalTurno();
    await cargarCuadrantes();
    return;
  }

  const [tipo, valorReal] = valor.split(':');
  const registro = {
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: trabajadorId,
    fecha,
    turno_id: tipo === 'turno' ? valorReal : null,
    estado_especial: tipo === 'especial' ? valorReal : null,
    nota: $('turnoNota').value.trim() || null,
    es_festivo: $('turnoEsFestivo').checked
  };
  const { error } = await sb.from('cuadrante_asignaciones').upsert(registro, { onConflict: 'trabajador_id,fecha' });
  mostrarToast(error ? 'Error: ' + error.message : 'Turno guardado ✓', !error);
  cerrarModalTurno();
  await cargarCuadrantes();
}

// ---------- Cuadrantes: totales, control de fichaje, secuencias rotativas y catálogo ----------
const NOMBRES_ESTADO_CUADRANTE = {
  descanso: 'Descanso',
  descanso_festivo: 'Descanso festivo (compensatorio)',
  festivo_trabajado: 'Festivo trabajado',
  permiso: 'Permiso retribuido',
  baja: 'Baja IT',
  ausente: 'Ausente sin justificar',
  ausencia_autorizada: 'Ausencia autorizada',
  ausencia_parcial: 'Ausencia parcial',
  // Estos dos nunca se asignan a mano — solo los pone vigilancia_aprobar_cita()/formacion_prl_
  // aprobar_fecha() (migración 0068) cuando la cita/formación coincide con un turno real ese día.
  ausente_prl: 'Vigilancia de la salud',
  formacion_prl: 'Formación PRL',
  // Migración 0116 — normalmente convive con un turno_id (ver renderCuadrante*), este nombre solo
  // se usa si por algún motivo llegara a quedar solo (defensivo).
  incidencia_nomina: 'Genera incidencia nómina'
};
// Abreviatura para la celda del cuadrante. Se reutiliza el propio código de 2 letras que ya
// lleva cada estado en ESTADOS_ESPECIALES ("DF · Descanso festivo...", "AA · Ausencia...") en vez
// de recalcular solo la inicial — con solo la inicial, "descanso_festivo" (D) colisionaba con
// "descanso" (D) y "ausencia_autorizada"/"ausencia_parcial" (A) con "ausente" (A). ausente_prl/
// formacion_prl no están en ESTADOS_ESPECIALES (nunca se asignan a mano) y mantienen su letra fija.
function _abreviaturaEstadoEspecial(estado) {
  if (estado === 'ausente_prl') return 'V';
  if (estado === 'formacion_prl') return 'F';
  const def = ESTADOS_ESPECIALES.find(([k]) => k === estado);
  if (def) return def[1].split('·')[0].trim();
  return (estado || '').charAt(0).toUpperCase();
}

// Totales del cuadrante mostrado — misma clasificación que usa cada celda del calendario
// (turno asignado = "trabajando", estado_especial = la categoría correspondiente, nada = sin
// asignar). Calcula el total mensual (agregando todas las semanas visibles) y, además, el
// resumen de cada semana por separado — réplica de los recuadros "Total semana N" del prototipo.
const CATEGORIAS_CUADRANTE = ['descanso', 'permiso', 'baja', 'ausente', 'ausencia_autorizada', 'ausencia_parcial'];
function categorizarDiaCuadrante(personas, dias) {
  let trabajando = 0;
  let sinAsignar = 0;
  const porEstado = { descanso: 0, permiso: 0, baja: 0, ausente: 0, ausencia_autorizada: 0, ausencia_parcial: 0 };
  personas.forEach((p) => {
    dias.forEach((d) => {
      const fecha = isoFecha(d);
      const a = cuadranteCache.find((x) => x.trabajador_id === p.id && x.fecha === fecha);
      if (a && a.turno_id) trabajando++;
      else if (a && a.estado_especial && porEstado.hasOwnProperty(a.estado_especial)) porEstado[a.estado_especial]++;
      else sinAsignar++;
    });
  });
  return { trabajando, sinAsignar, porEstado };
}
function renderCuadTotales(personas, semanas) {
  const el = $('cuadTotales');
  if (!el) return;
  const porSemana = semanas.map((dias) => categorizarDiaCuadrante(personas, dias));
  semanas.forEach((dias, i) => {
    const t = porSemana[i];
    const resEl = $(`cuadResumenSemana${i}`);
    if (!resEl) return;
    resEl.innerHTML = `<div class="legend" style="background:var(--slate-50);border-radius:8px;padding:8px 10px;">
      <span><b>Total semana ${i + 1}:</b></span>
      <span>🟢 Trabajando: <b>${t.trabajando}</b></span>
      <span>⚪ Descanso: <b>${t.porEstado.descanso}</b></span>
      <span>🔵 Permiso: <b>${t.porEstado.permiso}</b></span>
      <span>🟠 Baja IT: <b>${t.porEstado.baja}</b></span>
      <span>🔴 Ausente sin justificar: <b>${t.porEstado.ausente}</b></span>
      <span>🟣 Ausencia autorizada: <b>${t.porEstado.ausencia_autorizada}</b></span>
      <span>🟡 Ausencia parcial: <b>${t.porEstado.ausencia_parcial}</b></span>
    </div>`;
  });
  const total = { trabajando: 0, sinAsignar: 0, porEstado: { descanso: 0, permiso: 0, baja: 0, ausente: 0, ausencia_autorizada: 0, ausencia_parcial: 0 } };
  porSemana.forEach((t) => {
    total.trabajando += t.trabajando;
    total.sinAsignar += t.sinAsignar;
    CATEGORIAS_CUADRANTE.forEach((k) => (total.porEstado[k] += t.porEstado[k]));
  });
  const totalGeneral = total.trabajando + total.sinAsignar + CATEGORIAS_CUADRANTE.reduce((s, k) => s + total.porEstado[k], 0);
  el.innerHTML = `
    <div class="grid g4">
      <div class="card kpi"><div class="ic">🟢</div><div><div class="t">Trabajando (persona/día)</div><div class="v">${total.trabajando}</div></div></div>
      <div class="card kpi"><div class="ic">⚪</div><div><div class="t">Descanso (persona/día)</div><div class="v">${total.porEstado.descanso}</div></div></div>
      <div class="card kpi"><div class="ic">🔵</div><div><div class="t">Permiso retribuido</div><div class="v">${total.porEstado.permiso}</div></div></div>
      <div class="card kpi"><div class="ic">🟠</div><div><div class="t">Baja IT</div><div class="v">${total.porEstado.baja}</div></div></div>
      <div class="card kpi"><div class="ic">🔴</div><div><div class="t">Ausente sin justificar</div><div class="v">${total.porEstado.ausente}</div></div></div>
      <div class="card kpi"><div class="ic">🟣</div><div><div class="t">Ausencia autorizada</div><div class="v">${total.porEstado.ausencia_autorizada}</div></div></div>
      <div class="card kpi"><div class="ic">🟡</div><div><div class="t">Ausencia parcial</div><div class="v">${total.porEstado.ausencia_parcial}</div></div></div>
      <div class="card kpi" style="background:var(--brand-50,#f0fdf9);"><div class="ic">Σ</div><div><div class="t">Total (persona/semana, ${semanas.length} semana${semanas.length === 1 ? '' : 's'})</div><div class="v">${totalGeneral}</div></div></div>
    </div>`;
}

// Control de fichaje de HOY — independiente de qué mes esté mostrando el calendario de arriba
// (siempre comprueba la fecha real de hoy), por eso hace su propio fetch en vez de reutilizar
// cuadranteCache, que está limitado al mes visible.
//
// Escalado +5/+10 min: una tarea programada en la base de datos (evaluar_avisos_fichaje_automaticos,
// cada 5 minutos — migración 0063) hace esto mismo sola, en segundo plano, aunque esta pantalla esté
// cerrada: a los +5 min sin fichar encola un recordatorio real (push/email) a la persona y a RR.HH.;
// a los +10 min lo escalda a "aviso de falta" y genera un aviso disciplinario automático en su
// expediente. Los botones de aquí permiten a RR.HH. adelantar ese mismo escalado a mano, o
// confirmar/descartar la falta una vez decidido.
// Indicador real de que el escalado automático (+5/+10 min, migración 0063) está funcionando —
// César: "no veo nada que indique que funciona lo que te dije". Antes había que confiar a ciegas en
// que el cron de la base de datos corría en segundo plano; ahora se consulta su estado real
// (fichaje_automatico_estado(), migración 0085) y se muestra cuándo se ejecutó por última vez.
async function _badgeEstadoFichajeAutomatico() {
  try {
    const { data, error } = await sb.rpc('fichaje_automatico_estado');
    const r = Array.isArray(data) ? data[0] : data;
    if (error || !r || !r.configurado) {
      return '<span class="badge2 b-amber" title="El cron de escalado automático (migración 0063) no está activo en esta base de datos. Revísalo con tu proveedor de Supabase (extensión pg_cron).">⚠️ Escalado automático no detectado</span>';
    }
    if (!r.ultima_ejecucion) {
      return '<span class="badge2 b-amber">⚠️ Programado, todavía sin ninguna ejecución registrada</span>';
    }
    const minsAtras = Math.round((Date.now() - new Date(r.ultima_ejecucion).getTime()) / 60000);
    return `<span class="badge2 b-emerald" title="Revisa cada 5 minutos si hay personas con turno sin fichar">✅ Escalado automático activo — última comprobación hace ${minsAtras} min</span>`;
  } catch {
    return '<span class="sub-c">—</span>';
  }
}
async function actualizarFichajeHoy() {
  const el = $('cuadFichajeHoy');
  if (!el) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const [{ data: asigHoy }, { data: fichajesHoy }, { data: avisosHoy }, badgeAutomatico] = await Promise.all([
    sb.from('cuadrante_asignaciones').select('*, turnos_catalogo(codigo, nombre, hora_entrada_1)').eq('fecha', hoy).not('turno_id', 'is', null),
    sb.from('fichajes').select('*').eq('fecha', hoy),
    sb.from('fichaje_avisos').select('*').eq('fecha', hoy),
    _badgeEstadoFichajeAutomatico()
  ]);
  const filas = (asigHoy || [])
    .map((a) => {
      const p = empleadosCache.find((x) => x.id === a.trabajador_id);
      const f = (fichajesHoy || []).find((x) => x.trabajador_id === a.trabajador_id);
      const aviso = (avisosHoy || []).find((x) => x.trabajador_id === a.trabajador_id);
      return { persona: p, asignacion: a, fichado: !!f, aviso };
    })
    .filter((f) => f.persona);
  const pendientes = filas.filter((f) => !f.fichado).length;
  const escape = (s) => String(s || '').replace(/'/g, "\\'");
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <h2 class="pg-title" style="margin:0;">🔔 Control de fichaje — hoy ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</h2>
      <span class="badge2 ${pendientes ? 'b-rose' : 'b-emerald'}">${pendientes} sin fichar</span>
    </div>
    <p class="pg-sub">Personas con turno asignado hoy que todavía no han fichado. El escalado +5/+10 min (recordatorio → aviso de falta → aviso disciplinario) ocurre solo, en segundo plano; aquí puedes verlo y adelantarlo o resolverlo. ${badgeAutomatico}</p>
    <div style="overflow-x:auto;"><table><thead><tr><th>Persona trabajadora</th><th>Turno hoy</th><th>Fichaje</th><th>Acción</th></tr></thead>
    <tbody>${
      filas.length
        ? filas
            .map((f) => {
              const id = f.persona.id;
              const nom = escape(f.persona.nombre);
              let accion;
              if (f.fichado) {
                accion = '<span class="badge2 b-emerald">Fichado ✓</span>';
              } else if (f.aviso && f.aviso.estado === 'confirmada_falta') {
                accion = `<span class="badge2 b-rose">Falta sin justificar (confirmada)</span> <button type="button" class="btn btn-secondary btn-sm" onclick="descartarAvisoFichajeHoy('${id}','${nom}')">RR.HH. ha hablado — corregir</button>`;
              } else if (f.aviso && f.aviso.estado === 'aviso_falta') {
                accion = `<span class="badge2 b-rose">"Vamos a considerar falta sin justificar"</span> <button type="button" class="btn btn-danger btn-sm" onclick="marcarFaltaHoy('${id}','${nom}')">Confirmar falta</button> <button type="button" class="btn btn-secondary btn-sm" onclick="descartarAvisoFichajeHoy('${id}','${nom}')">RR.HH. ha hablado — descartar</button>`;
              } else if (f.aviso && f.aviso.estado === 'recordatorio') {
                accion = `<span class="badge2 b-amber">Recordatorio enviado (+5 min)</span> <button type="button" class="btn btn-danger btn-sm" onclick="escalarAvisoFaltaFichajeHoy('${id}','${nom}')">Enviar aviso de falta</button>`;
              } else if (f.aviso && f.aviso.estado === 'descartado') {
                accion = `<span class="badge2 b-slate">Aviso descartado</span>`;
              } else {
                accion = `<button type="button" class="btn btn-secondary btn-sm" onclick="enviarRecordatorioFichajeHoy('${id}','${nom}')">🔔 Enviar recordatorio (+5 min)</button>`;
              }
              if (!f.fichado) accion += ` <button type="button" class="btn btn-secondary btn-sm" onclick="enviarAvisoFichajeHoy('${id}','${nom}')">✉️ Enviar mensaje</button>`;
              return `<tr><td>${f.persona.nombre}</td><td>${f.asignacion.turnos_catalogo ? f.asignacion.turnos_catalogo.codigo : '—'}</td><td>${f.fichado ? '<span class="badge2 b-emerald">Sí</span>' : '<span class="badge2 b-rose">No fichado</span>'}</td><td>${accion}</td></tr>`;
            })
            .join('')
        : '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Nadie tiene turno asignado hoy, o todo el mundo ya ha fichado.</td></tr>'
    }</tbody></table></div>`;
}

async function _upsertAvisoFichajeHoy(trabajadorId, estado) {
  const hoy = new Date().toISOString().slice(0, 10);
  return sb.from('fichaje_avisos').upsert(
    { hotel_id: usuarioActual.hotel_id, trabajador_id: trabajadorId, fecha: hoy, estado },
    { onConflict: 'trabajador_id,fecha' }
  );
}

async function enviarRecordatorioFichajeHoy(trabajadorId, nombre) {
  const { error: errorAviso } = await _upsertAvisoFichajeHoy(trabajadorId, 'recordatorio');
  const { error: errorNotif } = await sb.rpc('encolar_notificacion', {
    p_trabajador_id: trabajadorId,
    p_hotel_id: usuarioActual.hotel_id,
    p_tipo: 'fichaje_recordatorio',
    p_titulo: '🔔 Aviso de fichaje (+5 min)',
    p_cuerpo: 'Tienes turno asignado hoy y todavía no has fichado la entrada. Por favor, ficha cuanto antes o contacta con RR.HH. si ha habido una incidencia.',
    p_referencia_tabla: 'fichaje_avisos',
    p_referencia_id: null
  });
  const error = errorAviso || errorNotif;
  mostrarToast(error ? 'Error al enviar el recordatorio: ' + error.message : `Recordatorio (+5 min) enviado a ${nombre} ✓`, !error);
  if (!error) await registrarAuditoria('Cuadrantes', 'Recordatorio de fichaje (+5 min) enviado', nombre);
  await actualizarFichajeHoy();
}

async function escalarAvisoFaltaFichajeHoy(trabajadorId, nombre) {
  const hoy = new Date().toISOString().slice(0, 10);
  const p = empleadosCache.find((x) => x.id === trabajadorId);
  const { error: errorAviso } = await _upsertAvisoFichajeHoy(trabajadorId, 'aviso_falta');
  await sb.rpc('encolar_notificacion', {
    p_trabajador_id: trabajadorId,
    p_hotel_id: usuarioActual.hotel_id,
    p_tipo: 'fichaje_aviso_falta',
    p_titulo: '⚠️ Aviso de fichaje (+10 min)',
    p_cuerpo: 'Vamos a considerar poner una falta sin justificar para este día de trabajo si no fichas o te comunicas con RR.HH. Se ha generado automáticamente un aviso disciplinario que deberás firmar.',
    p_referencia_tabla: 'fichaje_avisos',
    p_referencia_id: null
  });
  const detalle = `Turno de hoy (${hoy}). Departamento: ${p && p.departamento ? p.departamento : '—'}. Supervisor/a: ${p && p.supervisor_nombre ? p.supervisor_nombre : 'sin asignar'}.\nNo se ha detectado el fichaje de entrada transcurridos 10 minutos desde el inicio del turno. Aviso escalado desde el panel de Cuadrantes por ${usuarioActual.nombre}.`;
  const { error: errorDisc } = await sb.from('disciplina_formularios_firmados').insert({
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: trabajadorId,
    formulario_nombre: 'Aviso disciplinario por no fichaje',
    base_legal: 'Art. 20.3 ET (facultad de control de la actividad laboral) + Reglamento interno de fichaje',
    contenido: detalle,
    firmado_por: usuarioActual.nombre || 'Administración',
    origen: 'automatico'
  });
  const error = errorAviso || errorDisc;
  mostrarToast(error ? 'Aviso enviado, pero no se pudo registrar el aviso disciplinario: ' + error.message : `Aviso de falta escalado para ${nombre} — aviso disciplinario generado en Disciplina ✓`, !error);
  await registrarAuditoria('Disciplina', 'Aviso disciplinario por no fichaje generado', nombre);
  await actualizarFichajeHoy();
}

async function marcarFaltaHoy(trabajadorId, nombre) {
  const { error: errorAviso } = await _upsertAvisoFichajeHoy(trabajadorId, 'confirmada_falta');
  const { error } = await sb.from('incidencias').insert({
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: trabajadorId,
    tipo: 'Falta sin justificar',
    descripcion: `Turno asignado hoy sin fichaje registrado. Confirmado desde Cuadrantes por ${usuarioActual.nombre}.`,
    estado: 'abierta',
    origen: 'admin'
  });
  mostrarToast(error || errorAviso ? 'Error: ' + (error || errorAviso).message : 'Falta sin justificar confirmada ✓', !(error || errorAviso));
  await registrarAuditoria('Cuadrantes', 'Falta sin justificar confirmada', nombre);
  await actualizarFichajeHoy();
}

async function descartarAvisoFichajeHoy(trabajadorId, nombre) {
  const { error } = await _upsertAvisoFichajeHoy(trabajadorId, 'descartado');
  mostrarToast(error ? 'Error: ' + error.message : `Aviso descartado para ${nombre} — RR.HH. ya ha hablado con la persona ✓`, !error);
  if (!error) await registrarAuditoria('Cuadrantes', 'Aviso de fichaje descartado (RR.HH. ha hablado con la persona)', nombre);
  await actualizarFichajeHoy();
}

async function enviarAvisoFichajeHoy(trabajadorId, nombre) {
  const { error: errorNotif } = await sb.rpc('encolar_notificacion', {
    p_trabajador_id: trabajadorId,
    p_hotel_id: usuarioActual.hotel_id,
    p_tipo: 'fichaje_mensaje_admin',
    p_titulo: '📩 Mensaje de RR.HH.',
    p_cuerpo: 'No hemos detectado tu fichaje de entrada. Por favor, ficha cuanto antes o contacta con RR.HH. si ha habido una incidencia.',
    p_referencia_tabla: null,
    p_referencia_id: null
  });
  await sb.from('incidencias').insert({
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: trabajadorId,
    tipo: 'Aviso de fichaje',
    descripcion: 'Mensaje directo enviado por RR.HH. por falta de fichaje.',
    estado: 'abierta',
    origen: 'admin'
  });
  mostrarToast(errorNotif ? 'Error al enviar el mensaje: ' + errorNotif.message : `Mensaje enviado a ${nombre} ✓`, !errorNotif);
  if (!errorNotif) await registrarAuditoria('Cuadrantes', 'Mensaje directo enviado por falta de fichaje', nombre);
}

// ---- Catálogo de turnos (solo lectura) ----
function minutosDesdeMedianoche(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}
function solaparMinutos(aIni, aFin, bIni, bFin) {
  return Math.max(0, Math.min(aFin, bFin) - Math.max(aIni, bIni));
}
function horasNocturnidadTurno(t) {
  const tramos = [];
  const e1 = minutosDesdeMedianoche(t.hora_entrada_1);
  const s1 = minutosDesdeMedianoche(t.hora_salida_1);
  if (e1 != null && s1 != null) tramos.push([e1, s1 <= e1 ? s1 + 1440 : s1]);
  if (t.tipo === 'Partido' && t.hora_entrada_2 && t.hora_salida_2) {
    const e2 = minutosDesdeMedianoche(t.hora_entrada_2);
    const s2 = minutosDesdeMedianoche(t.hora_salida_2);
    if (e2 != null && s2 != null) tramos.push([e2, s2 <= e2 ? s2 + 1440 : s2]);
  }
  let h2206 = 0;
  let h0007 = 0;
  tramos.forEach(([ini, fin]) => {
    [-1440, 0, 1440].forEach((offset) => {
      h2206 += solaparMinutos(ini, fin, 22 * 60 + offset, 30 * 60 + offset);
      h0007 += solaparMinutos(ini, fin, 0 + offset, 7 * 60 + offset);
    });
  });
  return { h2206: h2206 / 60, h0007: h0007 / 60 };
}
let cuadrantesCatalogoCache = [];
let cuadrantesSecuenciasCache = [];
let catalogoTurnosFiltroDepto = '';
function filtrarCatalogoTurnosPorDepto(valor) {
  catalogoTurnosFiltroDepto = valor || '';
  renderCatalogoTurnos();
}
// Clasificación de nocturnidad de un turno a partir de es_nocturno — misma correspondencia que
// usa el prototipo para la columna "Clasificación nocturnidad" de la Base de datos de turnos
// (líneas 9282 y siguientes): 'No'→Sin nocturnidad, 'Parcial'→Puntual, 'Sí (≥3h)'→Mensual.
function clasificacionNocturnidadTurno(esNocturno) {
  if (esNocturno === 'Sí (≥3h)') return { label: 'Mensual', cls: 'b-rose' };
  if (esNocturno === 'Parcial') return { label: 'Puntual', cls: 'b-amber' };
  return { label: 'Sin nocturnidad', cls: 'b-slate' };
}
async function cargarCuadrantesCatalogoYSecuencias() {
  const [{ data: cat }, { data: secs }] = await Promise.all([
    sb.from('turnos_catalogo').select('*').order('departamento').order('codigo'),
    sb.from('cuadrante_secuencias').select('*').order('created_at', { ascending: false })
  ]);
  cuadrantesCatalogoCache = cat || [];
  cuadrantesSecuenciasCache = secs || [];
  renderCatalogoTurnos();
  renderListaSecuencias();
}
function renderCatalogoTurnos() {
  const el = $('cuadCatalogoTurnos');
  if (!el) return;
  const deptos = Array.from(new Set(cuadrantesCatalogoCache.map((t) => t.departamento).filter(Boolean))).sort();
  if (catalogoTurnosFiltroDepto && !deptos.includes(catalogoTurnosFiltroDepto)) catalogoTurnosFiltroDepto = '';
  const filas = catalogoTurnosFiltroDepto ? cuadrantesCatalogoCache.filter((t) => t.departamento === catalogoTurnosFiltroDepto) : cuadrantesCatalogoCache;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 4px;">
      <h2 class="pg-title" style="margin:0;">🗄️ Catálogo de turnos — ${filas.length} de ${cuadrantesCatalogoCache.length} turno(s)</h2>
      <select onchange="filtrarCatalogoTurnosPorDepto(this.value)" style="max-width:240px;">
        <option value="">Todos los departamentos</option>
        ${deptos.map((d) => `<option value="${d}" ${d === catalogoTurnosFiltroDepto ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
    </div>
    <p class="pg-sub" style="margin:0 0 10px;">Horas dentro de cada franja retributiva de nocturnidad, calculadas a partir de los horarios del catálogo.</p>
    <div style="overflow-x:auto;"><table><thead><tr><th>Código</th><th>Departamento</th><th>Turno</th><th>Horario</th><th>Tipo</th><th>Horas efectivas</th><th>22:00–06:00</th><th>00:00–07:00</th><th>Clasificación nocturnidad</th></tr></thead>
    <tbody>${filas
      .map((t) => {
        const n = horasNocturnidadTurno(t);
        const horario = t.tipo === 'Partido' && t.hora_entrada_2 ? `${t.hora_entrada_1}–${t.hora_salida_1} + ${t.hora_entrada_2}–${t.hora_salida_2}` : `${t.hora_entrada_1}–${t.hora_salida_1}`;
        const clasif = clasificacionNocturnidadTurno(t.es_nocturno);
        return `<tr><td><b>${t.codigo}</b>${t.es_ett ? ' <span class="badge2 b-amber">ETT</span>' : ''}</td><td>${t.departamento}</td><td>${t.nombre}</td><td>${horario}</td><td>${t.tipo}</td><td>${Number(t.horas).toFixed(2)} h</td><td>${n.h2206.toFixed(1)} h</td><td>${n.h0007.toFixed(1)} h</td><td><span class="badge2 ${clasif.cls}">${clasif.label}</span></td></tr>`;
      })
      .join('') || `<tr><td colspan="9" class="sub-c" style="text-align:center;padding:14px;">${cuadrantesCatalogoCache.length ? 'Ningún turno coincide con el departamento seleccionado.' : 'Sin turnos en el catálogo.'}</td></tr>`}</tbody></table></div>`;
}

// ---- Secuencias rotativas (3 semanas) ----
const DIAS_SEMANA_LABEL = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
function renderListaSecuencias() {
  const el = $('cuadSecuenciasLista');
  if (!el) return;
  el.innerHTML = cuadrantesSecuenciasCache.length
    ? `<div style="overflow-x:auto;"><table><thead><tr><th>Nombre</th><th>Departamento</th><th>Creada</th><th>Acciones</th></tr></thead><tbody>${cuadrantesSecuenciasCache
        .map(
          (s) =>
            `<tr><td><b>${s.nombre}</b></td><td>${s.departamento || '—'}</td><td>${new Date(s.created_at).toLocaleDateString('es-ES')}</td><td>
              <button type="button" class="btn btn-secondary btn-sm" onclick="abrirModalSecuencia('${s.id}')">✏️ Editar</button>
              <button type="button" class="btn btn-sm" onclick="abrirModalAsignarSecuencia('${s.id}')">🧬 Asignar a personas</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="borrarSecuencia('${s.id}')">🗑 Eliminar</button>
            </td></tr>`
        )
        .join('')}</tbody></table></div>`
    : '<p class="sub-c">Todavía no hay secuencias guardadas.</p>';
}
let secuenciaEditId = null;
function opcionesTurnoSelect(valorActual) {
  const opts = ['<option value="">— Descanso —</option>'].concat(
    cuadrantesCatalogoCache.map((t) => `<option value="${t.codigo}"${t.codigo === valorActual ? ' selected' : ''}>${t.codigo} — ${t.nombre} (${t.departamento})</option>`)
  );
  if (valorActual) opts[0] = '<option value="">— Descanso —</option>';
  return opts.join('');
}
function abrirModalSecuencia(id) {
  secuenciaEditId = id || null;
  const s = id ? cuadrantesSecuenciasCache.find((x) => x.id === id) : null;
  $('modalSecuenciaTitulo').textContent = s ? 'Editar secuencia — ' + s.nombre : 'Nueva secuencia rotativa (3 semanas)';
  $('secId').value = id || '';
  $('secNombre').value = s ? s.nombre : '';
  $('secDepartamento').value = s ? s.departamento || '' : '';
  const semanas = s ? [s.semana_1 || [], s.semana_2 || [], s.semana_3 || []] : [[], [], []];
  let gridHtml = '<table><thead><tr><th>Semana</th>' + DIAS_SEMANA_LABEL.map((d) => `<th>${d}</th>`).join('') + '</tr></thead><tbody>';
  for (let w = 0; w < 3; w++) {
    gridHtml += `<tr><td><b>Semana ${w + 1}</b></td>`;
    for (let d = 0; d < 7; d++) {
      const valorActual = semanas[w][d] || '';
      gridHtml += `<td><select id="secCelda_${w}_${d}" style="margin:0;min-width:140px;">${opcionesTurnoSelect(valorActual)}</select></td>`;
    }
    gridHtml += '</tr>';
  }
  gridHtml += '</tbody></table>';
  $('secGrid').innerHTML = gridHtml;
  $('secValidacion').innerHTML = '';
  $('modalSecuencia').classList.remove('hidden');
}
function cerrarModalSecuencia() {
  $('modalSecuencia').classList.add('hidden');
  secuenciaEditId = null;
}
function leerCeldasSecuencia() {
  const semanas = [[], [], []];
  for (let w = 0; w < 3; w++) {
    for (let d = 0; d < 7; d++) {
      semanas[w].push($(`secCelda_${w}_${d}`).value || null);
    }
  }
  return semanas;
}
// Validador legal: descanso semanal mínimo de 2 días (Art. 37.1 ET + convenio hostelería Illes
// Balears) y descanso mínimo de 12h entre el fin de una jornada y el inicio de la siguiente
// (Art. 34.3 ET), calculado con los horarios reales del catálogo de turnos.
function validarSecuenciaLegal(semanas) {
  const mensajes = [];
  const plano = [...semanas[0], ...semanas[1], ...semanas[2]];
  semanas.forEach((semana, i) => {
    const descansos = semana.filter((c) => !c).length;
    if (descansos < 2) mensajes.push(`Semana ${i + 1}: solo ${descansos} día(s) de descanso — el mínimo legal son 2 días completos por semana.`);
  });
  for (let i = 0; i < plano.length - 1; i++) {
    const codA = plano[i];
    const codB = plano[i + 1];
    if (!codA || !codB) continue;
    const tA = cuadrantesCatalogoCache.find((t) => t.codigo === codA);
    const tB = cuadrantesCatalogoCache.find((t) => t.codigo === codB);
    if (!tA || !tB) continue;
    const finA = tA.tipo === 'Partido' && tA.hora_salida_2 ? tA.hora_salida_2 : tA.hora_salida_1;
    const iniA = minutosDesdeMedianoche(tA.hora_entrada_1);
    let finAmin = minutosDesdeMedianoche(finA);
    if (finAmin <= iniA) finAmin += 1440; // turno nocturno, acaba al día siguiente
    const iniBmin = minutosDesdeMedianoche(tB.hora_entrada_1) + 1440; // día siguiente
    const descansoHoras = (iniBmin - finAmin) / 60;
    if (descansoHoras < 12) {
      const semanaN = Math.floor(i / 7) + 1;
      const diaN = (i % 7) + 1;
      mensajes.push(`Semana ${semanaN}, día ${diaN} → día siguiente: solo ${descansoHoras.toFixed(1)}h de descanso entre jornadas (mínimo legal: 12h, Art. 34.3 ET).`);
    }
  }
  return { ok: mensajes.length === 0, mensajes };
}
async function guardarSecuencia(e) {
  e.preventDefault();
  const semanas = leerCeldasSecuencia();
  const validacion = validarSecuenciaLegal(semanas);
  if (!validacion.ok) {
    $('secValidacion').innerHTML = '⚠️ No se puede guardar — incumple el validador legal:<br>' + validacion.mensajes.map((m) => '• ' + m).join('<br>');
    return;
  }
  $('secValidacion').innerHTML = '';
  const payload = {
    nombre: $('secNombre').value.trim(),
    departamento: $('secDepartamento').value.trim() || null,
    semana_1: semanas[0],
    semana_2: semanas[1],
    semana_3: semanas[2]
  };
  let error;
  if (secuenciaEditId) {
    ({ error } = await sb.from('cuadrante_secuencias').update(payload).eq('id', secuenciaEditId));
  } else {
    ({ error } = await sb.from('cuadrante_secuencias').insert({ ...payload, hotel_id: usuarioActual.hotel_id, creado_por: usuarioActual.id }));
  }
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Secuencia guardada ✓', !error);
  if (!error) {
    cerrarModalSecuencia();
    await cargarCuadrantesCatalogoYSecuencias();
    await registrarAuditoria('Cuadrantes', 'Secuencia rotativa guardada', payload.nombre);
  }
}
async function borrarSecuencia(id) {
  if (!confirm('¿Eliminar esta secuencia guardada? Esta acción no se puede deshacer.')) return;
  const { error } = await sb.from('cuadrante_secuencias').delete().eq('id', id);
  mostrarToast(error ? 'Error al eliminar: ' + error.message : 'Secuencia eliminada ✓', !error);
  if (!error) await cargarCuadrantesCatalogoYSecuencias();
}

let asignarSecuenciaId = null;
function abrirModalAsignarSecuencia(id) {
  asignarSecuenciaId = id;
  const s = cuadrantesSecuenciasCache.find((x) => x.id === id);
  if (!s) return;
  $('asignarSecuenciaNombre').textContent = `Secuencia: ${s.nombre}${s.departamento ? ' · ' + s.departamento : ''}`;
  const candidatos = s.departamento ? empleadosCache.filter((p) => p.departamento === s.departamento) : empleadosCache;
  $('asignarSecuenciaPersonas').innerHTML = (candidatos.length ? candidatos : empleadosCache).map((p) => `<option value="${p.id}">${p.nombre}${p.departamento ? ' (' + p.departamento + ')' : ''}</option>`).join('');
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  $('asignarSecuenciaFecha').value = lunes.toISOString().slice(0, 10);
  $('modalAsignarSecuencia').classList.remove('hidden');
}
function cerrarModalAsignarSecuencia() {
  $('modalAsignarSecuencia').classList.add('hidden');
  asignarSecuenciaId = null;
}
async function confirmarAsignarSecuencia() {
  const s = cuadrantesSecuenciasCache.find((x) => x.id === asignarSecuenciaId);
  if (!s) return;
  const personaIds = Array.from($('asignarSecuenciaPersonas').selectedOptions).map((o) => o.value);
  if (!personaIds.length) return mostrarToast('Elige al menos una persona', false);
  const fechaInicio = $('asignarSecuenciaFecha').value;
  if (!fechaInicio) return mostrarToast('Elige la fecha de inicio', false);
  const plano = [...(s.semana_1 || []), ...(s.semana_2 || []), ...(s.semana_3 || [])];
  const inicio = new Date(fechaInicio + 'T00:00:00');
  const registros = [];
  personaIds.forEach((trabajadorId) => {
    plano.forEach((codigo, i) => {
      const fecha = new Date(inicio);
      fecha.setDate(inicio.getDate() + i);
      const turno = codigo ? cuadrantesCatalogoCache.find((t) => t.codigo === codigo) : null;
      registros.push({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: trabajadorId,
        fecha: fecha.toISOString().slice(0, 10),
        turno_id: turno ? turno.id : null,
        estado_especial: !codigo ? 'descanso' : null
      });
    });
  });
  const { error } = await sb.from('cuadrante_asignaciones').upsert(registros, { onConflict: 'trabajador_id,fecha' });
  mostrarToast(error ? 'Error al asignar: ' + error.message : `Secuencia volcada al cuadrante para ${personaIds.length} persona(s) ✓`, !error);
  if (!error) {
    cerrarModalAsignarSecuencia();
    await cargarCuadrantes();
    await registrarAuditoria('Cuadrantes', 'Secuencia asignada al cuadrante', `${s.nombre} → ${personaIds.length} persona(s)`);
  }
}

// ---- "Diseñar secuencia rotativa de turnos — Semanas 1, 2 y 3" (por persona, datos reales) ----
// Distinto del bloque anterior (plantillas reutilizables): aquí se comprueba el cumplimiento legal
// de lo que YA está asignado en el cuadrante real de cada persona, hoy + las 2 semanas siguientes,
// y se puede corregir directamente esa ventana de 21 días. Independiente del mes/año que esté
// filtrado arriba (igual que actualizarFichajeHoy(), que tampoco depende del mes visible).
function tresSemanasDesdeHoy() {
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  return Array.from({ length: 3 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const dia = new Date(lunes);
      dia.setDate(lunes.getDate() + w * 7 + d);
      return dia;
    })
  );
}
let cuadranteSecuenciaEstadoCache = []; // [{ persona, semanas (Date[3][7]), codigos (string|null)[3][7] }]
async function renderCuadranteSecuenciaEstado() {
  const el = $('cuadSecuenciaEstadoBody');
  if (!el) return;
  const semanas = tresSemanasDesdeHoy();
  const desde = isoFecha(semanas[0][0]);
  const hasta = isoFecha(semanas[2][6]);
  const { data: asignaciones } = await sb
    .from('cuadrante_asignaciones')
    .select('*, turnos_catalogo(codigo)')
    .gte('fecha', desde)
    .lte('fecha', hasta);
  cuadranteSecuenciaEstadoCache = empleadosCache.map((p) => {
    const codigos = semanas.map((dias) => dias.map((d) => {
      const a = (asignaciones || []).find((x) => x.trabajador_id === p.id && x.fecha === isoFecha(d));
      return a && a.turnos_catalogo ? a.turnos_catalogo.codigo : null;
    }));
    return { persona: p, semanas, codigos };
  });
  el.innerHTML = cuadranteSecuenciaEstadoCache
    .map(({ persona, codigos }) => {
      const validacion = validarSecuenciaLegal(codigos);
      const badge = validacion.ok ? '<span class="badge2 b-emerald">✅ Cumple</span>' : `<span class="badge2 b-rose">🚨 ${validacion.mensajes.length} incidencia(s)</span>`;
      return `<tr><td>${persona.nombre}</td><td>${persona.departamento || '—'}</td><td>${badge}</td><td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirModalSecuenciaIndividual('${persona.id}')">✏️ Diseñar / corregir secuencia</button></td></tr>`;
    })
    .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin personas trabajadoras activas.</td></tr>';
}

let secuenciaIndividualTrabajadorId = null;
function abrirModalSecuenciaIndividual(trabajadorId) {
  const entrada = cuadranteSecuenciaEstadoCache.find((x) => x.persona.id === trabajadorId);
  if (!entrada) return;
  secuenciaIndividualTrabajadorId = trabajadorId;
  $('secIndTrabajadorId').value = trabajadorId;
  $('modalSecuenciaIndividualTitulo').textContent = `Diseñar secuencia — ${entrada.persona.nombre} · Semanas 1 a 3 (${rangoSemanaTxt(entrada.semanas[0])} → ${rangoSemanaTxt(entrada.semanas[2])})`;
  let gridHtml = '<table><thead><tr><th>Semana</th>' + DIAS_SEMANA_LABEL.map((d) => `<th>${d}</th>`).join('') + '</tr></thead><tbody>';
  for (let w = 0; w < 3; w++) {
    gridHtml += `<tr><td><b>Semana ${w + 1}</b></td>`;
    for (let d = 0; d < 7; d++) {
      const valorActual = entrada.codigos[w][d] || '';
      gridHtml += `<td><select id="secIndCelda_${w}_${d}" style="margin:0;min-width:140px;">${opcionesTurnoSelect(valorActual)}</select></td>`;
    }
    gridHtml += '</tr>';
  }
  gridHtml += '</tbody></table>';
  $('secIndGrid').innerHTML = gridHtml;
  $('secIndValidacion').innerHTML = '';
  $('modalSecuenciaIndividual').classList.remove('hidden');
}
function cerrarModalSecuenciaIndividual() {
  $('modalSecuenciaIndividual').classList.add('hidden');
  secuenciaIndividualTrabajadorId = null;
}
async function guardarSecuenciaIndividual() {
  const entrada = cuadranteSecuenciaEstadoCache.find((x) => x.persona.id === secuenciaIndividualTrabajadorId);
  if (!entrada) return;
  const semanasCodigos = [[], [], []];
  for (let w = 0; w < 3; w++) {
    for (let d = 0; d < 7; d++) {
      semanasCodigos[w].push($(`secIndCelda_${w}_${d}`).value || null);
    }
  }
  const validacion = validarSecuenciaLegal(semanasCodigos);
  if (!validacion.ok) {
    $('secIndValidacion').innerHTML = '⚠️ No se puede guardar — incumple el validador legal:<br>' + validacion.mensajes.map((m) => '• ' + m).join('<br>');
    return;
  }
  $('secIndValidacion').innerHTML = '';
  const registros = [];
  for (let w = 0; w < 3; w++) {
    for (let d = 0; d < 7; d++) {
      const codigo = semanasCodigos[w][d];
      const turno = codigo ? cuadrantesCatalogoCache.find((t) => t.codigo === codigo) : null;
      registros.push({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: secuenciaIndividualTrabajadorId,
        fecha: isoFecha(entrada.semanas[w][d]),
        turno_id: turno ? turno.id : null,
        estado_especial: !codigo ? 'descanso' : null
      });
    }
  }
  const { error } = await sb.from('cuadrante_asignaciones').upsert(registros, { onConflict: 'trabajador_id,fecha' });
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Secuencia individual guardada en el cuadrante ✓', !error);
  if (!error) {
    cerrarModalSecuenciaIndividual();
    await cargarCuadrantes();
    await registrarAuditoria('Cuadrantes', 'Secuencia individual guardada', entrada.persona.nombre);
  }
}

// ---------- Incidencias (admin) + chat ----------
let incidenciasAdminCache = [];
let incidenciaSeleccionadaId = null;

async function cargarIncidenciasAdmin() {
  const { data } = await sb
    .from('incidencias')
    .select('*, incidencia_mensajes(*), personas_trabajadoras(nombre)')
    .order('created_at', { ascending: false });
  incidenciasAdminCache = data || [];
  renderListaIncidenciasAdmin();
  renderAdminChatThreadList();
  if (incidenciaSeleccionadaId && incidenciasAdminCache.some((i) => i.id === incidenciaSeleccionadaId)) {
    renderIncidenciaDetalle();
    renderAdminChatConversacion();
  }
}

// Origen real (incidencias.origen: trabajador/admin, ver migración 0012) — existía en la base de
// datos desde el principio pero no se mostraba en ningún sitio; el prototipo lo muestra como
// "📤 Levantada por RR.HH./Admin" / "📥 Reportada por la persona trabajadora" en cada incidencia.
function badgeOrigenIncidencia(origen) {
  return origen === 'admin' ? '<span class="sub-c">📤 Levantada por RR.HH./Admin</span>' : '<span class="sub-c">📥 Reportada por la persona trabajadora</span>';
}

function renderListaIncidenciasAdmin() {
  const el = $('incidenciasAbiertasLista');
  if (!el) return;
  const abiertas = incidenciasAdminCache.filter((i) => i.estado !== 'resuelta');
  el.innerHTML =
    abiertas
      .map(
        (i) => `<div class="card card-pad" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
            <div>
              <b>${i.personas_trabajadoras ? i.personas_trabajadoras.nombre : '—'}</b>
              ${badgeEstado(i.estado)}
              <p class="sub-c" style="margin:2px 0 0;">${badgeOrigenIncidencia(i.origen)}</p>
            </div>
          </div>
          <p style="margin:8px 0 2px;font-weight:800;font-size:12.5px;text-transform:uppercase;">${i.tipo}</p>
          ${i.descripcion ? `<p class="sub-c" style="margin:0 0 8px;">${i.descripcion}</p>` : ''}
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="cambiarEstadoIncidenciaDesdeTarjeta('${i.id}','resuelta')">✓ Marcar resuelta</button>
            <button type="button" class="btn btn-secondary btn-sm" onclick="seleccionarIncidencia('${i.id}')">💬 Ver conversación (${(i.incidencia_mensajes || []).length})</button>
          </div>
        </div>`
      )
      .join('') || '<p class="sub-c">Sin incidencias abiertas.</p>';

  const resueltas = incidenciasAdminCache.filter((i) => i.estado === 'resuelta');
  const bodyEl = $('incidenciasResueltasBody');
  if (bodyEl) {
    bodyEl.innerHTML =
      resueltas
        .map(
          (i) => `<tr><td>${i.personas_trabajadoras ? i.personas_trabajadoras.nombre : '—'}</td><td>${i.tipo}</td><td>${new Date(i.created_at).toLocaleDateString('es-ES')}</td><td>${badgeEstado(i.estado)}</td><td>${i.origen === 'admin' ? 'RR.HH./Admin' : 'Persona trabajadora'}</td></tr>`
        )
        .join('') || '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin incidencias resueltas todavía.</td></tr>';
  }
}

function seleccionarIncidencia(id) {
  incidenciaSeleccionadaId = id;
  const panel = $('incidenciaConversacionPanel');
  if (panel) panel.classList.remove('hidden');
  renderListaIncidenciasAdmin();
  renderIncidenciaDetalle();
  renderAdminChatThreadList();
  renderAdminChatConversacion();
}

async function cambiarEstadoIncidenciaDesdeTarjeta(id, estado) {
  incidenciaSeleccionadaId = id;
  await cambiarEstadoIncidencia(estado);
}

// ---------- Levantar incidencia (RR.HH./Admin → persona trabajadora) ----------
function abrirModalLevantarIncidencia() {
  $('incLevantarPersona').innerHTML = empleadosCache.map((p) => `<option value="${p.id}">${p.nombre}${p.departamento ? ' (' + p.departamento + ')' : ''}</option>`).join('');
  $('incLevantarTipo').value = '';
  $('incLevantarDescripcion').value = '';
  $('modalLevantarIncidencia').classList.remove('hidden');
}
function cerrarModalLevantarIncidencia() {
  $('modalLevantarIncidencia').classList.add('hidden');
}
async function guardarLevantarIncidencia(e) {
  e.preventDefault();
  const trabajadorId = $('incLevantarPersona').value;
  const tipo = $('incLevantarTipo').value.trim();
  const descripcion = $('incLevantarDescripcion').value.trim();
  if (!trabajadorId || !tipo) return mostrarToast('Elige la persona trabajadora y el tipo de incidencia', false);
  const { error } = await sb.from('incidencias').insert({
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: trabajadorId,
    tipo,
    descripcion: descripcion || null,
    estado: 'abierta',
    origen: 'admin'
  });
  mostrarToast(error ? 'Error al levantar la incidencia: ' + error.message : 'Incidencia levantada ✓', !error);
  if (!error) {
    const nombre = (empleadosCache.find((p) => p.id === trabajadorId) || {}).nombre || '';
    cerrarModalLevantarIncidencia();
    await cargarIncidenciasAdmin();
    await cargarPanelGeneral();
    await registrarAuditoria('Incidencias', 'Incidencia levantada por RR.HH./Admin', `${nombre} — ${tipo}`);
  }
}

// ---------- Chat de Incidencias (admin) — bandeja de todas las conversaciones; mismo dato real
// (incidenciasAdminCache / incidencia_mensajes) que Incidencias, presentado como pantalla propia
// (antes solo existía como panel de detalle dentro de Incidencias) ----------
function renderAdminChatThreadList() {
  const el = $('adminChatThreadList');
  if (!el) return;
  el.innerHTML =
    incidenciasAdminCache
      .map((i) => {
        const ultimo = (i.incidencia_mensajes || []).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        return `<li class="row-item clickable" style="flex-direction:column;align-items:stretch;padding:8px;border-radius:8px;${i.id === incidenciaSeleccionadaId ? 'background:var(--brand-50);' : ''}" onclick="seleccionarIncidencia('${i.id}')">
          <div style="display:flex;justify-content:space-between;gap:6px;"><b style="font-size:12px;">${i.personas_trabajadoras ? i.personas_trabajadoras.nombre : '—'}</b>${badgeEstado(i.estado)}</div>
          <span class="sub-c">${i.tipo}</span>
          ${ultimo ? `<span class="sub-c" style="margin-top:2px;">${ultimo.autor}: ${ultimo.texto.slice(0, 60)}${ultimo.texto.length > 60 ? '…' : ''}</span>` : ''}
        </li>`;
      })
      .join('') || '<li class="sub-c">Sin conversaciones de incidencias todavía.</li>';
}

function renderAdminChatConversacion() {
  const headerEl = $('adminChatHeader');
  const bubblesEl = $('adminChatBubbles');
  if (!headerEl || !bubblesEl) return;
  const i = incidenciasAdminCache.find((x) => x.id === incidenciaSeleccionadaId);
  if (!i) {
    headerEl.innerHTML = '';
    bubblesEl.innerHTML = '<p class="sub-c">Selecciona una conversación de la bandeja.</p>';
    return;
  }
  headerEl.innerHTML = `<div><b>${i.personas_trabajadoras ? i.personas_trabajadoras.nombre : '—'}</b><p class="sub-c" style="margin:2px 0 0;">${i.tipo}</p></div>${badgeEstado(i.estado)}`;
  const mensajes = (i.incidencia_mensajes || [])
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((m) => `<div class="burbuja ${m.rol === 'admin' ? 'propia' : 'otra'}"><strong>${m.autor}</strong>${m.texto}<div style="margin-top:3px;font-size:10px;opacity:.7;">${fechaHoraCorta(m.created_at)}</div></div>`)
    .join('');
  bubblesEl.innerHTML = mensajes || '<p class="sub-c">Sin mensajes todavía.</p>';
}

async function enviarMensajeAdminChat() {
  const input = $('adminChatInput');
  const texto = input.value.trim();
  if (!texto || !incidenciaSeleccionadaId) return;
  const { error } = await sb.from('incidencia_mensajes').insert({
    incidencia_id: incidenciaSeleccionadaId,
    autor: usuarioActual.nombre,
    rol: 'admin',
    texto
  });
  mostrarToast(error ? 'Error al enviar: ' + error.message : 'Mensaje enviado ✓', !error);
  if (!error) {
    input.value = '';
    await cargarIncidenciasAdmin();
    const i = incidenciasAdminCache.find((x) => x.id === incidenciaSeleccionadaId);
    await registrarAuditoria('Chat de Incidencias', 'Mensaje enviado', i && i.personas_trabajadoras ? i.personas_trabajadoras.nombre : '—');
  }
}

function fechaHoraCorta(iso) {
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderIncidenciaDetalle() {
  const i = incidenciasAdminCache.find((x) => x.id === incidenciaSeleccionadaId);
  const el = $('incidenciaDetalle');
  if (!i) {
    el.innerHTML = '<p class="sub-c">Selecciona una incidencia de la lista.</p>';
    return;
  }
  // Burbujas alineadas por quién habla (RR.HH. a la derecha, la persona trabajadora a la
  // izquierda) — antes se listaban todas igual, en plano, y había que leer el nombre de cada
  // una para saber quién había escrito qué.
  const mensajes = (i.incidencia_mensajes || [])
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(
      (m) => `<div class="burbuja ${m.rol === 'admin' ? 'propia' : 'otra'}"><strong>${m.autor}</strong>${m.texto}<div style="margin-top:3px;font-size:10px;opacity:.7;">${fechaHoraCorta(m.created_at)}</div></div>`
    )
    .join('');
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
      <div><b>${i.personas_trabajadoras ? i.personas_trabajadoras.nombre : '—'}</b><p class="sub-c" style="margin:2px 0 0;">${i.tipo}</p></div>
      ${badgeEstado(i.estado)}
    </div>
    ${i.descripcion ? `<p class="sub-c" style="margin:0 0 10px;">${i.descripcion}</p>` : ''}
    <div class="bubble-area" style="max-height:220px;overflow-y:auto;border-top:1px solid var(--slate-200);border-bottom:1px solid var(--slate-200);padding:10px 0;margin-bottom:10px;">
      ${mensajes || '<p class="sub-c">Sin mensajes todavía.</p>'}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:8px;">
      <input type="text" id="incAdminMensaje" placeholder="Responder…" style="margin:0;flex:1;">
      <button type="button" class="btn btn-sm" onclick="enviarMensajeAdmin()">Enviar</button>
    </div>
    <div style="display:flex;gap:6px;">
      ${i.estado !== 'resuelta' ? `<button type="button" class="btn btn-secondary btn-sm" onclick="cambiarEstadoIncidencia('resuelta')">✓ Marcar como resuelta</button>` : `<button type="button" class="btn btn-secondary btn-sm" onclick="cambiarEstadoIncidencia('abierta')">↺ Reabrir</button>`}
    </div>`;
}

async function enviarMensajeAdmin() {
  const input = $('incAdminMensaje');
  const texto = input.value.trim();
  if (!texto || !incidenciaSeleccionadaId) return;
  const { error } = await sb.from('incidencia_mensajes').insert({
    incidencia_id: incidenciaSeleccionadaId,
    autor: usuarioActual.nombre,
    rol: 'admin',
    texto
  });
  mostrarToast(error ? 'Error al enviar: ' + error.message : 'Mensaje enviado ✓', !error);
  if (!error) {
    input.value = '';
    await cargarIncidenciasAdmin();
    const i = incidenciasAdminCache.find((x) => x.id === incidenciaSeleccionadaId);
    await registrarAuditoria('Chat de Incidencias', 'Mensaje enviado', i && i.personas_trabajadoras ? i.personas_trabajadoras.nombre : '—');
  }
}

async function resolverIncidenciaDesdeAprobaciones(id) {
  const previa = incidenciasAdminCache.find((i) => i.id === id);
  const { error } = await sb.from('incidencias').update({ estado: 'resuelta' }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Incidencia marcada como resuelta ✓', !error);
  if (!error) {
    await cargarAprobaciones();
    await cargarPanelGeneral();
    if ($('incidenciasAbiertasLista')) await cargarIncidenciasAdmin();
    const nombre = previa && previa.personas_trabajadoras ? previa.personas_trabajadoras.nombre : '';
    await registrarAuditoria('Incidencias', 'Incidencia resuelta', `${nombre}${previa ? ' — ' + previa.tipo : ''}`.trim());
  }
}

async function cambiarEstadoIncidencia(estado) {
  if (!incidenciaSeleccionadaId) return;
  const previa = incidenciasAdminCache.find((i) => i.id === incidenciaSeleccionadaId);
  const { error } = await sb.from('incidencias').update({ estado }).eq('id', incidenciaSeleccionadaId);
  mostrarToast(error ? 'Error: ' + error.message : 'Incidencia actualizada ✓', !error);
  if (!error) {
    await cargarIncidenciasAdmin();
    await cargarPanelGeneral();
    const nombre = previa && previa.personas_trabajadoras ? previa.personas_trabajadoras.nombre : '';
    await registrarAuditoria('Incidencias', `Incidencia → ${estado}`, `${nombre}${previa ? ' — ' + previa.tipo : ''}`.trim());
  }
}

// ---------- Formación obligatoria (admin): catálogo real de 6 cursos, editable ----------
// Distinto del Plan de Excelencia de Formación Interna (27 módulos, formacion_catalogo_modulos) —
// hasta esta revisión el motor de costes de Dirección/Informes leía por error del catálogo de
// Formación Interna; ver cargarDireccionEjecutivaAdmin().
let formacionCursosCatalogoCache = [];
let formacionCursosRegistroCache = [];
let formacionSolicitudesCache = [];

function formacionCursoEstadoIndicador(registro, curso) {
  if (!registro) return { label: '⚪ Sin realizar', cls: 'b-slate' };
  if (!curso || !curso.caducidad_meses) return { label: '🟢 Realizado', cls: 'b-emerald' };
  const vencimiento = new Date(registro.fecha_realizacion);
  vencimiento.setMonth(vencimiento.getMonth() + Number(curso.caducidad_meses));
  const diffDias = Math.round((vencimiento - new Date()) / 86400000);
  if (diffDias < 0) return { label: '🔴 Caducada', cls: 'b-rose' };
  if (diffDias <= 60) return { label: `🟡 Por vencer (${diffDias} d.)`, cls: 'b-amber' };
  return { label: '🟢 En plazo', cls: 'b-emerald' };
}

function formacionCatalogoListHTML() {
  const totalCoste = formacionCursosCatalogoCache.reduce((s, c) => s + Number(c.coste || 0), 0);
  const totalHoras = formacionCursosCatalogoCache.reduce((s, c) => s + Number(c.horas || 0), 0);
  return (
    formacionCursosCatalogoCache
      .map(
        (c) => `<div class="row-item"><div class="l"><div class="icon">🎓</div><div><b>${c.nombre}</b><span class="meta">${c.etiqueta || '—'} · caduca a los ${c.caducidad_meses || '—'} meses</span></div></div>
      <span style="display:flex;align-items:center;gap:10px;font-size:11px;color:var(--slate-500);">
        <span style="display:flex;align-items:center;gap:4px;"><input type="number" class="cost-input" step="0.5" min="0" value="${c.horas}" data-curso="${c.id}" onchange="updateFormacionCursoCampo(this, 'horas')"> h / persona</span>
        <span style="display:flex;align-items:center;gap:4px;"><input type="number" class="cost-input" step="0.5" min="0" value="${c.coste}" data-curso="${c.id}" onchange="updateFormacionCursoCampo(this, 'coste')"> € / persona</span>
      </span></div>`
      )
      .join('') +
    `<div class="row-item" style="background:var(--slate-50);border-top:2px solid var(--slate-300);">
      <div class="l"><div class="icon">Σ</div><div><b>Total formación obligatoria (${formacionCursosCatalogoCache.length} cursos)</b><span class="meta">Suma del coste y de las horas por persona, para la totalidad del catálogo obligatorio</span></div></div>
      <span style="display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;color:var(--slate-700);"><span>${totalHoras.toFixed(1)} h</span><span>${fmtEur(totalCoste)}</span></span>
    </div>`
  );
}

async function updateFormacionCursoCampo(input, campo) {
  const cursoId = input.dataset.curso;
  const valor = Number(input.value) || 0;
  const { error } = await sb.from('formacion_cursos_catalogo').update({ [campo]: valor }).eq('id', cursoId);
  if (error) {
    mostrarToast('Error al actualizar: ' + error.message, false);
    return;
  }
  await cargarFormacionAdmin();
  if (direccionData) await cargarDireccionEjecutivaAdmin();
}

async function cargarFormacionAdmin() {
  const [{ data: catalogo }, { data: registros }, { data: personal }] = await Promise.all([
    sb.from('formacion_cursos_catalogo').select('*').order('nombre'),
    sb.from('formacion_cursos_registro').select('*, personas_trabajadoras(nombre)').order('fecha_realizacion', { ascending: false }),
    sb.from('personas_trabajadoras').select('id, nombre')
  ]);
  formacionCursosCatalogoCache = catalogo || [];
  formacionCursosRegistroCache = registros || [];

  const avgCoste = formacionCursosCatalogoCache.length ? formacionCursosCatalogoCache.reduce((s, c) => s + Number(c.coste || 0), 0) / formacionCursosCatalogoCache.length : 0;
  const avgHoras = formacionCursosCatalogoCache.length ? formacionCursosCatalogoCache.reduce((s, c) => s + Number(c.horas || 0), 0) / formacionCursosCatalogoCache.length : 0;
  const hoy = new Date();
  const caducadasPendientes = formacionCursosRegistroCache.filter((r) => {
    const curso = formacionCursosCatalogoCache.find((c) => c.id === r.curso_id);
    if (!curso || !curso.caducidad_meses) return false;
    const vencimiento = new Date(r.fecha_realizacion);
    vencimiento.setMonth(vencimiento.getMonth() + Number(curso.caducidad_meses));
    return Math.round((vencimiento - hoy) / 86400000) <= 60;
  }).length;

  if ($('formacionKpis')) {
    $('formacionKpis').innerHTML = `
      <div class="card kpi"><div class="ic">💶</div><div><div class="t">Coste medio por curso obligatorio</div><div class="v">${fmtEur(avgCoste)}</div></div></div>
      <div class="card kpi"><div class="ic">⏱</div><div><div class="t">Horas medias por curso obligatorio</div><div class="v">${avgHoras.toFixed(1)} h</div></div></div>
      <div class="card kpi"><div class="ic">🎓</div><div><div class="t">Cursos en catálogo</div><div class="v">${formacionCursosCatalogoCache.length}</div></div></div>
      <div class="card kpi"><div class="ic">⚠</div><div><div class="t">Formaciones caducadas / por vencer</div><div class="v">${caducadasPendientes}</div></div></div>`;
  }
  if ($('formacionCatalogList')) $('formacionCatalogList').innerHTML = formacionCatalogoListHTML();

  if ($('formacionStatusBody')) {
    $('formacionStatusBody').innerHTML =
      (personal || [])
        .flatMap((p) =>
          formacionCursosCatalogoCache.map((c) => {
            const registro = formacionCursosRegistroCache.find((r) => r.trabajador_id === p.id && r.curso_id === c.id);
            const ind = formacionCursoEstadoIndicador(registro, c);
            return `<tr><td>${p.nombre}</td><td>${c.nombre}</td><td>${registro ? fechaCorta(registro.fecha_realizacion) : '—'}</td><td><span class="badge2 ${ind.cls}">${ind.label}</span></td></tr>`;
          })
        )
        .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin personal todavía.</td></tr>';
  }

  // "Solicitudes de formación": consulta propia e independiente de cargarFormulariosAdmin()
  // (ambas corren en paralelo en cargarTodo() — depender de su caché sería una carrera). El
  // formulario f16 ("Solicitud de formación / curso profesional") ya existe en el catálogo
  // desde la migración 0032 — aquí sí hay plantilla real, por eso ya no se muestra el aviso de
  // "todavía no existe la plantilla".
  if ($('formacionSolicitudesBody')) {
    const { data: solicitudesFormacion } = await sb
      .from('formularios_solicitudes')
      .select('*, personas_trabajadoras(nombre)')
      .eq('plantilla_id', 'f16')
      .order('fecha_solicitud', { ascending: false });
    formacionSolicitudesCache = solicitudesFormacion || [];
    $('formacionSolicitudesBody').innerHTML =
      formacionSolicitudesCache
        .map((s) => {
          let accion = '<span class="sub-c">Procesando…</span>';
          let estadoLabel = s.estado === 'aprobado' ? 'Formación aprobada por RR.HH.' : STATUS_FORMULARIOS[s.estado] || s.estado;
          if (s.estado === 'rrhh') {
            accion = `<button type="button" class="btn btn-sm" onclick="aprobarFormacionSolicitud('${s.id}')">✅ Aprobar formación</button>`;
          } else if (s.estado === 'aprobado' && !s.fecha_programada) {
            accion = `<button type="button" class="btn btn-sm" onclick="abrirProgramarFormacion('${s.id}')">🗓️ Programar fecha y hora</button>`;
          } else if (s.estado === 'aprobado' && s.fecha_programada && !s.fecha_programada_firmada_en) {
            estadoLabel = `Fecha programada: ${fechaCorta(s.fecha_programada.slice(0, 10))} ${s.fecha_programada.slice(11, 16)} h`;
            accion = '<span class="sub-c">⏳ Pendiente de firma de la persona trabajadora</span>';
          } else if (s.estado === 'aprobado' && s.fecha_programada_firmada_en && !s.fecha_programada_aprobada_en) {
            estadoLabel = '✍️ Fecha firmada por la persona trabajadora';
            accion = `<button type="button" class="btn btn-sm" onclick="aprobarFechaFormacionSolicitud('${s.id}')">✅ Aprobar fecha (comprobar cuadrante)</button>`;
          } else if (s.fecha_programada_aprobada_en) {
            estadoLabel = `✅ Formación programada y aprobada${s.cuadrante_actualizado ? ' · cuadrante actualizado' : ''}`;
            accion = '<span class="sub-c">Completo ✓</span>';
          } else if (s.estado === 'gestoria') {
            accion = '<span class="sub-c">Enviado ✓</span>';
          }
          return `<tr>
            <td><b>${s.personas_trabajadoras ? s.personas_trabajadoras.nombre : '—'}</b></td>
            <td>Solicitud de formación / curso profesional</td>
            <td>${fechaCorta((s.fecha_solicitud || '').slice(0, 10))}</td>
            <td><span class="badge2 ${BADGE_ESTADO[s.estado] || 'b-slate'}">${estadoLabel}</span></td>
            <td style="display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="verSolicitudFormacion('${s.id}')">👁 Ver solicitud</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="abrirGenerarCorreoFormacion('${s.id}')">✉️ Generar correo</button>
              ${accion}
            </td>
          </tr>`;
        })
        .join('') ||
      '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Todavía no se ha recibido ninguna solicitud de formación.</td></tr>';
  }
}

// ---------- Formación Interna (Plan de Excelencia) + Matriz de Cumplimiento + Panel de Dirección — Formación ----------
// Las tres pantallas leen del mismo dato real (formacion_asignaciones, 27 módulos del Plan de
// Excelencia) — una sola carga, tres renders independientes (cada pantalla su propio bloque
// visual, nunca mezclados), igual que el patrón ya usado en cargarDireccionEjecutivaAdmin().
let formacionAsignacionesCache = [];
let formacionCatalogoCache = [];
let formacionItinerariosCache = []; // formacion_itinerarios_completados (migración 0083) — una fila por persona con el Plan de Excelencia 100% superado
let expedienteFormativoEmpleadoId = null;
let evalPracticaContext = null; // { id, codigo }

const ESTADO_FORMACION_BADGE = {
  ASIGNADO: 'b-slate', EN_PROGRESO: 'b-sky', FORMACION_COMPLETADA: 'b-sky', EVALUACION_PENDIENTE: 'b-amber',
  TEORICA_SUPERADA: 'b-amber', PRACTICA_PENDIENTE: 'b-amber', SUPERADO: 'b-emerald',
  NO_APTO: 'b-rose', PENDIENTE_REPETICION: 'b-rose'
};
const ESTADO_FORMACION_LABEL = {
  ASIGNADO: 'Asignado', EN_PROGRESO: 'En progreso', FORMACION_COMPLETADA: 'Formación completada',
  EVALUACION_PENDIENTE: 'Evaluación pendiente', TEORICA_SUPERADA: 'Teórica superada',
  PRACTICA_PENDIENTE: 'Práctica pendiente', SUPERADO: 'Superado', NO_APTO: 'No apto',
  PENDIENTE_REPETICION: 'Pendiente de repetición'
};
function badgeFormacion(estado) {
  return `<span class="badge2 ${ESTADO_FORMACION_BADGE[estado] || 'b-slate'}">${ESTADO_FORMACION_LABEL[estado] || estado || '—'}</span>`;
}
// Semáforo real por fecha límite (no por flags fijos de demo) — réplica de semaforoFormacion()
// del prototipo, sobre fecha_limite real de formacion_asignaciones.
function semaforoFormacionAsignacion(a) {
  if (a.estado === 'SUPERADO') return { color: 'verde', clase: 'b-emerald', label: '🟢 Superado' };
  if (a.estado === 'NO_APTO' || a.estado === 'PENDIENTE_REPETICION') return { color: 'rojo', clase: 'b-rose', label: '🔴 No apto — pendiente de repetición' };
  if (!a.fecha_limite) return { color: 'verde', clase: 'b-emerald', label: '🟢 En plazo' };
  const diffDias = Math.round((new Date(a.fecha_limite) - new Date()) / 86400000);
  if (diffDias < 0) {
    const retraso = -diffDias;
    return retraso <= 7 ? { color: 'naranja', clase: 'b-amber', label: `🟠 Vencido (${retraso} d.)` } : { color: 'rojo', clase: 'b-rose', label: `🔴 Vencido (${retraso} d.)` };
  }
  if (diffDias <= 7) return { color: 'amarillo', clase: 'b-amber', label: `🟡 Próximo a vencer (${diffDias} d.)` };
  return { color: 'verde', clase: 'b-emerald', label: '🟢 En plazo' };
}

async function cargarFormacionInternaAdmin() {
  const [{ data: asignaciones }, { data: catalogo }, { data: itinerarios }] = await Promise.all([
    sb.from('formacion_asignaciones').select('*, personas_trabajadoras(id, nombre, departamento, puesto)').order('fecha_limite'),
    sb.from('formacion_catalogo_modulos').select('*'),
    sb.from('formacion_itinerarios_completados').select('*')
  ]);
  formacionAsignacionesCache = asignaciones || [];
  formacionCatalogoCache = catalogo || [];
  formacionItinerariosCache = itinerarios || [];

  if (expedienteFormativoEmpleadoId == null && formacionAsignacionesCache.length && formacionAsignacionesCache[0].personas_trabajadoras) {
    expedienteFormativoEmpleadoId = formacionAsignacionesCache[0].trabajador_id;
  }

  const pendientesPractica = formacionAsignacionesCache.filter((a) => a.estado === 'PRACTICA_PENDIENTE').length;
  const countEl = $('countFormacionPractica');
  if (countEl) {
    countEl.textContent = pendientesPractica;
    countEl.classList.toggle('hidden', pendientesPractica === 0);
  }

  renderFormacionInternaAdmin();
  renderMatrizCumplimientoFormacionAdmin();
  renderPanelDireccionFormacionAdmin();
}

function cambiarEmpleadoExpediente(trabajadorId) {
  expedienteFormativoEmpleadoId = trabajadorId;
  renderFormacionInternaAdmin();
}

function renderFormacionInternaAdmin() {
  const body = $('formacionInternaBody');
  if (!body) return;
  const candidatos = [...new Map(formacionAsignacionesCache.filter((a) => a.personas_trabajadoras).map((a) => [a.trabajador_id, a.personas_trabajadoras.nombre])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const selectorBox = $('expedienteFormativoSelector');
  if (selectorBox) {
    selectorBox.innerHTML = `<span class="label-mock" style="font-size:11px;font-weight:700;color:var(--slate-500);">Persona trabajadora</span>
      <select class="form-select" style="margin:0;" onchange="cambiarEmpleadoExpediente(this.value)">
        ${candidatos.map(([id, nombre]) => `<option value="${id}" ${id === expedienteFormativoEmpleadoId ? 'selected' : ''}>${nombre}</option>`).join('')}
      </select>`;
  }
  const regs = formacionAsignacionesCache.filter((a) => a.trabajador_id === expedienteFormativoEmpleadoId);
  const excelencia = regs.filter((r) => r.bloque !== 'T' && !(r.codigo || '').startsWith('T'));
  const transversal = regs.filter((r) => r.bloque === 'T' || (r.codigo || '').startsWith('T'));
  const superadosExc = excelencia.filter((r) => r.estado === 'SUPERADO').length;
  const superadosT = transversal.filter((r) => r.estado === 'SUPERADO').length;
  const itinerario = formacionItinerariosCache.find((it) => it.trabajador_id === expedienteFormativoEmpleadoId);

  const progresoEl = $('formacionInternaProgreso');
  if (progresoEl) {
    progresoEl.innerHTML = `Plan de Excelencia: <b>${superadosExc}/${excelencia.length}</b> módulos superados &nbsp;·&nbsp; Bloque T (cumplimiento transversal): <b>${superadosT}/${transversal.length}</b> formaciones superadas` +
      (itinerario ? ` &nbsp;·&nbsp; <span class="badge2 b-emerald">🏆 Itinerario completo — Certificado ${itinerario.codigo}</span>` : '');
  }

  function filaModulo(r) {
    const modulo = formacionCatalogoCache.find((m) => m.codigo === r.codigo);
    let acciones = '';
    if (r.estado === 'PRACTICA_PENDIENTE') acciones = `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirModalEvalPractica('${r.id}')">🎯 Evaluación práctica</button>`;
    else if (r.estado === 'SUPERADO' && r.certificado_codigo) acciones = `<span class="badge2 b-emerald">🏅 Certificado ${r.certificado_codigo}</span> <button type="button" class="btn btn-secondary btn-sm" onclick="descargarCertificadoFormacionAdmin('${r.id}')">📄 Ver / descargar</button> <button type="button" class="btn btn-secondary btn-sm" onclick="enviarCertificadoSupervisorAdmin('${r.id}')">✉️ Enviar a supervisor/Dirección</button>`;
    return `<div class="row-item" style="display:block;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
        <b style="font-size:12.5px;">${r.codigo} — ${r.titulo}</b>
        ${badgeFormacion(r.estado)}
      </div>
      <p class="sub-c" style="margin:6px 0 4px;">${modulo ? modulo.objetivo : ''}</p>
      <p class="sub-c" style="margin:0 0 8px;">📅 Asignado: ${fechaCorta(r.fecha_asignacion)} · Fecha límite: <b>${fechaCorta(r.fecha_limite)}</b>${r.teorica_nota != null ? ` · Nota teórica: <b>${r.teorica_nota}%</b>` : ''}${r.practica_nivel ? ` · Práctica: <b>${r.practica_nivel}</b>` : ''}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${acciones}</div>
    </div>`;
  }

  const bloquesExc = [...new Set(excelencia.map((r) => r.bloque))].sort();
  const excelenciaHTML =
    bloquesExc
      .map((bnum) => {
        const rs = excelencia.filter((r) => r.bloque === bnum);
        const tituloBloque = (formacionCatalogoCache.find((m) => m.bloque === bnum) || {}).bloque_titulo || `Bloque ${bnum}`;
        return `<div class="card card-pad" style="margin-top:12px;"><div class="aprob-section-title">${tituloBloque}</div>${rs.map(filaModulo).join('')}</div>`;
      })
      .join('') || '<p class="sub-c">Esta persona no tiene módulos del Plan de Excelencia asignados según su puesto.</p>';
  const transversalHTML = transversal.length
    ? `<div class="card card-pad" style="margin-top:12px;"><div class="aprob-section-title">🛡 Bloque T — Cumplimiento Transversal (obligatorio, no forma parte del Plan de Excelencia)</div>${transversal.map(filaModulo).join('')}</div>`
    : '';
  body.innerHTML = `<div class="callout">📘 Plan de Excelencia Operativa y F&amp;B — módulos técnicos según el puesto de la persona trabajadora.</div>${excelenciaHTML}
    <div class="callout" style="margin-top:14px;background:var(--sky-50,#f0f9ff);">🛡 Cumplimiento Transversal (Bloque T) — formación legal obligatoria para toda la plantilla, independiente del Plan de Excelencia.</div>${transversalHTML}
    ${itinerario ? `<div class="card card-pad" style="margin-top:14px;border:2px solid var(--emerald-500,#10b981);background:var(--emerald-50,#ecfdf5);">
      <div class="aprob-section-title">🏆 Itinerario formativo completo</div>
      <p class="sub-c" style="margin:0 0 8px;">Certificado de itinerario: <b>${itinerario.codigo}</b> — emitido el ${fechaCorta(itinerario.fecha)}.</p>
      <button type="button" class="btn btn-secondary btn-sm" onclick="verCertificadoItinerarioAdmin('${itinerario.trabajador_id}')">🏅 Ver certificado de itinerario</button>
    </div>` : ''}`;
}

// ---------- Certificado de "Itinerario Formativo Completo" (migración 0083) ----------
function generarCertificadoItinerarioHTML(it, nombre) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Certificado de Itinerario — ${nombre}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:800px;margin:60px auto;padding:0 24px;text-align:center;line-height:1.6;}
.brand{font-size:22px;font-weight:bold;color:#166534;margin-bottom:30px;}
.title{font-size:24px;font-weight:bold;margin:20px 0;}
.box{border:3px solid #166534;border-radius:14px;padding:36px;background:#ecfdf5;}
.code{display:inline-block;background:#166534;color:#fff;font-weight:bold;padding:6px 16px;border-radius:999px;margin-top:16px;}
.print-bar{text-align:right;margin-bottom:14px;}
.print-bar button{background:#166534;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;cursor:pointer;}
@media print{ .print-bar{display:none;} }</style></head><body>
<div class="print-bar"><button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button></div>
<div class="brand">Personal4Pax · X10 THINK</div>
<div class="box"><div class="title">🏆 Certificado de Itinerario Formativo Completo</div>
<p>Se certifica que <b>${nombre}</b> ha superado la totalidad de los módulos del Plan de Excelencia aplicables a su puesto de trabajo.</p>
<p>Fecha de emisión: ${fechaCorta(it.fecha)}</p>
<div class="code">CÓDIGO VERIFICABLE: ${it.codigo}</div></div>
</body></html>`;
}
function verCertificadoItinerarioAdmin(trabajadorId) {
  const it = formacionItinerariosCache.find((x) => x.trabajador_id === trabajadorId);
  if (!it) return;
  const p = empleadosCache.find((x) => x.id === trabajadorId);
  const html = generarCertificadoItinerarioHTML(it, p ? p.nombre : '—');
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  registrarAuditoria('Formación Interna', 'Visualización de certificado de itinerario', `${p ? p.nombre : trabajadorId} — ${it.codigo}`);
}

// ---------- "✉️ Enviar a supervisor/Dirección" (migración 0083 — envios_certificado) ----------
async function enviarCertificadoSupervisorAdmin(id) {
  const r = formacionAsignacionesCache.find((x) => x.id === id);
  if (!r || !r.certificado_codigo) return;
  const { data: destinatario } = await sb.rpc('jefe_departamento_email_de', { p_trabajador_id: r.trabajador_id });
  const destino = destinatario || 'Dirección';
  const envio = { fecha: new Date().toISOString(), destinatario: destino, usuario: usuarioActual ? usuarioActual.nombre : 'RR.HH.' };
  const nuevosEnvios = [...(r.envios_certificado || []), envio];
  const { error } = await sb.from('formacion_asignaciones').update({ envios_certificado: nuevosEnvios }).eq('id', id);
  if (error) {
    mostrarToast('Error: ' + error.message, false);
    return;
  }
  r.envios_certificado = nuevosEnvios;
  const p = r.personas_trabajadoras || empleadosCache.find((x) => x.id === r.trabajador_id) || {};
  await registrarAuditoria('Formación Interna', 'Certificado enviado a supervisor/Dirección', `${r.codigo} — ${p.nombre || ''} → ${destino}`);
  mostrarToast(`Certificado enviado a ${destino} ✓`, true);
}

// ---------- Certificado de formación (documento descargable, mismo formato que ve la persona
// trabajadora desde su propia app) ----------
function generarCertificadoFormacionHTML(r) {
  const p = r.personas_trabajadoras || empleadosCache.find((x) => x.id === r.trabajador_id) || {};
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Certificado de Formación — ${r.certificado_codigo}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:700px;margin:40px auto;padding:0 24px;color:#1e293b;text-align:center;}
.marco{border:3px double #0d9488;border-radius:14px;padding:36px 28px;}
h1{font-size:22px;margin:4px 0 2px;color:#0f766e;}
.sub{color:#64748b;font-size:13px;margin:0 0 22px;}
.nombre{font-size:26px;font-weight:800;margin:18px 0 4px;}
.modulo{font-size:16px;margin:4px 0 18px;}
.grid{display:flex;justify-content:center;gap:28px;font-size:12.5px;color:#475569;margin-top:18px;flex-wrap:wrap;}
.grid b{display:block;color:#1e293b;}
.code{margin-top:22px;font-size:12px;color:#94a3b8;}
footer{margin-top:26px;font-size:10.5px;color:#94a3b8;}</style></head><body>
<div class="marco">
  <p class="sub">Personal4Pax · X10 THINK</p>
  <h1>🎓 Certificado de Formación</h1>
  <p class="sub">Se certifica que</p>
  <p class="nombre">${p.nombre || '—'}</p>
  <p class="sub">ha superado el módulo de formación</p>
  <p class="modulo"><b>${r.codigo} — ${r.titulo}</b></p>
  <div class="grid">
    <div><b>${r.teorica_nota != null ? r.teorica_nota + '%' : '—'}</b>Nota teórica</div>
    <div><b>${fechaCorta(r.fecha_limite) || '—'}</b>Fecha límite del módulo</div>
    <div><b>${new Date().toLocaleDateString('es-ES')}</b>Fecha de emisión</div>
  </div>
  <p class="code">Código de certificado: ${r.certificado_codigo}</p>
</div>
<footer>Documento generado automáticamente por Personal4Pax a partir del expediente formativo registrado en la aplicación.</footer>
</body></html>`;
}
function descargarCertificadoFormacionAdmin(id) {
  const r = formacionAsignacionesCache.find((x) => x.id === id);
  if (!r) return;
  const html = generarCertificadoFormacionHTML(r);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = `Certificado_${r.certificado_codigo || r.codigo}.html`;
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
  URL.revokeObjectURL(url);
  registrarAuditoria('Formación', 'Certificado de formación descargado', r.certificado_codigo || r.codigo);
}

// ---------- Matriz de Cumplimiento Formativo ----------
function renderMatrizCumplimientoFormacionAdmin() {
  if (!$('matrizFormacionBody')) return;
  const deptos = [...new Set(formacionAsignacionesCache.map((a) => (a.personas_trabajadoras ? a.personas_trabajadoras.departamento : null)).filter(Boolean))].sort();
  const estados = Object.keys(ESTADO_FORMACION_LABEL);
  const bloques = [...new Set(formacionAsignacionesCache.map((a) => a.bloque))].filter(Boolean).sort();
  if ($('matrizFiltroDepto').options.length <= 1) $('matrizFiltroDepto').innerHTML = '<option value="">Todos</option>' + deptos.map((d) => `<option value="${d}">${d}</option>`).join('');
  if ($('matrizFiltroEstado').options.length <= 1) $('matrizFiltroEstado').innerHTML = '<option value="">Todos</option>' + estados.map((e) => `<option value="${e}">${ESTADO_FORMACION_LABEL[e]}</option>`).join('');
  if ($('matrizFiltroBloque').options.length <= 1) $('matrizFiltroBloque').innerHTML = '<option value="">Todos</option>' + bloques.map((b) => `<option value="${b}">${b === 'T' ? 'Bloque T (transversal)' : 'Bloque ' + b}</option>`).join('');

  const fDepto = $('matrizFiltroDepto').value;
  const fEstado = $('matrizFiltroEstado').value;
  const fBloque = $('matrizFiltroBloque').value;
  const filtradas = formacionAsignacionesCache.filter((a) => {
    const depto = a.personas_trabajadoras ? a.personas_trabajadoras.departamento : null;
    if (fDepto && depto !== fDepto) return false;
    if (fEstado && a.estado !== fEstado) return false;
    if (fBloque && a.bloque !== fBloque) return false;
    return true;
  });
  $('matrizFormacionTotal').textContent = `${filtradas.length} de ${formacionAsignacionesCache.length} registro(s)`;
  $('matrizFormacionBody').innerHTML =
    filtradas
      .map((a) => {
        const sem = semaforoFormacionAsignacion(a);
        const ultimoEnvio = (a.envios_certificado || []).slice(-1)[0];
        return `<tr>
          <td>${a.personas_trabajadoras ? a.personas_trabajadoras.nombre : '—'}</td>
          <td>${a.personas_trabajadoras ? a.personas_trabajadoras.departamento || '—' : '—'}</td>
          <td>${a.personas_trabajadoras ? a.personas_trabajadoras.puesto || '—' : '—'}</td>
          <td>${(a.bloque === 'T' ? '🛡 ' : '') + a.codigo + ' — ' + a.titulo}</td>
          <td>${fechaCorta(a.fecha_asignacion)}</td>
          <td>${fechaCorta(a.fecha_limite)}</td>
          <td>${badgeFormacion(a.estado)}</td>
          <td>${a.teorica_nota != null ? a.teorica_nota : '—'}</td>
          <td><span class="badge2 ${sem.clase}">${sem.label}</span></td>
          <td>${ultimoEnvio ? `${fechaCorta((ultimoEnvio.fecha || '').slice(0, 10))} → ${ultimoEnvio.destinatario}` : '<span class="sub-c">Sin enviar</span>'}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="10" class="sub-c" style="text-align:center;padding:14px;">Sin registros con estos filtros.</td></tr>';
}

function exportarMatrizCumplimientoFormacion() {
  const headers = ['Persona trabajadora', 'Departamento', 'Puesto', 'Módulo', 'Asignada', 'Fecha límite', 'Estado', 'Nota teórica', 'Semáforo', 'Último envío a supervisor/Dirección'];
  const filas = formacionAsignacionesCache.map((a) => {
    const sem = semaforoFormacionAsignacion(a);
    const ultimoEnvio = (a.envios_certificado || []).slice(-1)[0];
    return [
      a.personas_trabajadoras ? a.personas_trabajadoras.nombre : '—',
      a.personas_trabajadoras ? a.personas_trabajadoras.departamento || '—' : '—',
      a.personas_trabajadoras ? a.personas_trabajadoras.puesto || '—' : '—',
      `${a.codigo} — ${a.titulo}`,
      fechaCorta(a.fecha_asignacion),
      fechaCorta(a.fecha_limite),
      ESTADO_FORMACION_LABEL[a.estado] || a.estado,
      a.teorica_nota != null ? a.teorica_nota : '',
      sem.label,
      ultimoEnvio ? `${fechaCorta((ultimoEnvio.fecha || '').slice(0, 10))} → ${ultimoEnvio.destinatario}` : 'Sin enviar'
    ];
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...filas]), 'Matriz de Cumplimiento');
  XLSX.writeFile(wb, `Matriz_Cumplimiento_Formativo_${new Date().toISOString().slice(0, 10)}.xlsx`);
  registrarAuditoria('Formación Interna', 'Exportación de la Matriz de Cumplimiento Formativo', `${formacionAsignacionesCache.length} registros`);
  mostrarToast('Matriz de Cumplimiento Formativo exportada ✓', true);
}

// ---------- Panel de Dirección — Formación ----------
function renderPanelDireccionFormacionAdmin() {
  if (!$('panelDireccionFormacionKpis')) return;
  const total = formacionAsignacionesCache.length;
  const superados = formacionAsignacionesCache.filter((a) => a.estado === 'SUPERADO').length;
  const pctGlobal = total ? Math.round((superados / total) * 100) : 0;
  const transversal = formacionAsignacionesCache.filter((a) => a.bloque === 'T' || (a.codigo || '').startsWith('T'));
  const transversalSuperados = transversal.filter((a) => a.estado === 'SUPERADO').length;
  const pctTransversal = transversal.length ? Math.round((transversalSuperados / transversal.length) * 100) : 0;
  const pendRepeticion = formacionAsignacionesCache.filter((a) => a.estado === 'PENDIENTE_REPETICION').length;
  const certificados = formacionAsignacionesCache.filter((a) => a.certificado_codigo).length;

  $('panelDireccionFormacionKpis').innerHTML = `
    <div class="card kpi"><div class="ic">📘</div><div><div class="t">Cumplimiento Plan de Excelencia</div><div class="v">${pctGlobal}%</div></div></div>
    <div class="card kpi"><div class="ic">🛡</div><div><div class="t">Cumplimiento Bloque T (transversal)</div><div class="v">${pctTransversal}%</div></div></div>
    <div class="card kpi"><div class="ic">🏅</div><div><div class="t">Certificados emitidos</div><div class="v">${certificados}</div></div></div>
    <div class="card kpi"><div class="ic">↻</div><div><div class="t">Pendientes de repetición</div><div class="v" style="color:#e11d48;">${pendRepeticion}</div></div></div>`;

  const porDepto = {};
  formacionAsignacionesCache.forEach((a) => {
    const d = a.personas_trabajadoras ? a.personas_trabajadoras.departamento || 'Sin departamento' : 'Sin departamento';
    porDepto[d] = porDepto[d] || { total: 0, superados: 0 };
    porDepto[d].total++;
    if (a.estado === 'SUPERADO') porDepto[d].superados++;
  });
  $('direccionFormacionDeptos').innerHTML =
    Object.keys(porDepto)
      .sort()
      .map((d) => {
        const r = porDepto[d];
        const p = r.total ? Math.round((r.superados / r.total) * 100) : 0;
        return `<tr><td>${d}</td><td>${r.total}</td><td>${r.superados}</td><td>${p}%</td></tr>`;
      })
      .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin registros todavía.</td></tr>';

  const modulosT = formacionCatalogoCache.filter((m) => m.bloque === 'T');
  $('direccionFormacionBloqueT').innerHTML =
    modulosT
      .map((m) => {
        const rs = formacionAsignacionesCache.filter((a) => a.codigo === m.codigo);
        const sup = rs.filter((a) => a.estado === 'SUPERADO').length;
        const p = rs.length ? Math.round((sup / rs.length) * 100) : 0;
        return `<tr><td>${m.codigo} — ${m.titulo}</td><td>${rs.length}</td><td>${sup}</td><td>${p}%</td></tr>`;
      })
      .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin registros del Bloque T todavía.</td></tr>';
}

function generarCierreMensualFormacionDatos() {
  const total = formacionAsignacionesCache.length;
  const superados = formacionAsignacionesCache.filter((a) => a.estado === 'SUPERADO').length;
  const noApto = formacionAsignacionesCache.filter((a) => a.estado === 'PENDIENTE_REPETICION' || a.estado === 'NO_APTO').length;
  const vencidos = formacionAsignacionesCache.filter((a) => ['rojo', 'naranja'].includes(semaforoFormacionAsignacion(a).color)).length;
  const periodo = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return { periodo, total, superados, noApto, vencidos, pct: total ? Math.round((superados / total) * 100) : 0 };
}

function exportarCierreMensualFormacion() {
  const c = generarCierreMensualFormacionDatos();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Periodo', 'Total registros', 'Superados', '% Cumplimiento', 'No aptos/pendientes de repetición', 'Vencidos'],
      [c.periodo, c.total, c.superados, c.pct + '%', c.noApto, c.vencidos]
    ]),
    'Cierre mensual'
  );
  XLSX.writeFile(wb, `Cierre_Mensual_Formacion_${c.periodo.replace(' ', '_')}.xlsx`);
  registrarAuditoria('Formación Interna', 'Exportación del Cierre Mensual de Formación', c.periodo);
  mostrarToast('Cierre mensual de formación exportado ✓', true);
}

// No hay infraestructura de envío de email interno RR.HH.→Dirección en esta app: registramos el
// cierre en la auditoría (trazable y consultable en Auditoría) en vez de simular un envío que no
// ocurre de verdad.
async function enviarCierreMensualFormacionDireccion() {
  const c = generarCierreMensualFormacionDatos();
  await registrarAuditoria('Formación Interna', 'Cierre Mensual de Formación registrado para Dirección', `${c.periodo}: ${c.pct}% cumplimiento (${c.superados}/${c.total}), ${c.noApto} pendientes de repetición, ${c.vencidos} vencidos`);
  mostrarToast('Cierre mensual registrado en Auditoría ✓', true);
}

function abrirModalEvalPractica(id) {
  const a = formacionAsignacionesCache.find((x) => x.id === id);
  if (!a) return;
  const modulo = formacionCatalogoCache.find((m) => m.codigo === a.codigo);
  evalPracticaContext = { id, requiereRubrica: modulo ? modulo.rubrica : false };
  $('modalEvalPracticaTitulo').textContent = `Evaluación práctica — ${a.titulo}`;
  $('evalNivel').value = '';
  if (evalPracticaContext.requiereRubrica) {
    $('modalEvalPracticaRubrica').innerHTML = RUBRICA_CRITERIOS.map(
      ([clave, etiqueta]) => `<label>${etiqueta} (1-5)</label><input type="number" min="1" max="5" id="rubrica_${clave}" value="3">`
    ).join('');
  } else {
    $('modalEvalPracticaRubrica').innerHTML = '<p class="sub-c">Este módulo se evalúa como Apto / No apto, sin rúbrica detallada.</p>';
  }
  $('modalEvalPractica').classList.remove('hidden');
}

const RUBRICA_CRITERIOS = [
  ['tecnica', 'Técnica y precisión de corte/cocción'],
  ['higiene', 'Higiene y organización del puesto'],
  ['tiempo', 'Gestión del tiempo de ejecución'],
  ['presentacion', 'Presentación y emplatado'],
  ['equipo', 'Trabajo en equipo y comunicación']
];

function cerrarModalEvalPractica() {
  $('modalEvalPractica').classList.add('hidden');
  evalPracticaContext = null;
}

async function guardarEvalPractica(apto) {
  if (!evalPracticaContext) return;
  let rubrica = null;
  if (evalPracticaContext.requiereRubrica) {
    rubrica = {};
    RUBRICA_CRITERIOS.forEach(([clave]) => {
      const el = $('rubrica_' + clave);
      if (el) rubrica[clave] = parseInt(el.value, 10) || null;
    });
  }
  const nivel = $('evalNivel').value.trim() || null;
  const { error } = await sb.rpc('formacion_evaluar_practica', {
    p_id: evalPracticaContext.id,
    p_apto: apto,
    p_rubrica: rubrica,
    p_nivel: nivel
  });
  mostrarToast(error ? 'Error: ' + error.message : apto ? 'Evaluado como Apto ✓' : 'Evaluado como No apto', !error);
  if (!error) {
    cerrarModalEvalPractica();
    await cargarFormacionInternaAdmin();
  }
}

// ---------- Manual de Empresa (admin) ----------
// Bloques 1/3/4/6/7 son contenido legal/referencia estático (igual que admin-compliance, ya
// intencionalmente estático). El Bloque 2 NO duplica el circuito de Vigilancia de la Salud (mismo
// criterio que el prototipo: "completa el circuito del Bloque 2, no lo duplica") — antes
// reconstruía una fila falsa de "Propuesta pendiente" a partir de fecha_incorporacion para TODAS
// las personas, con un botón que llamaba a enviarSolicitudMutua(trabajador_id) cuando esa función
// espera un vigilancia_salud.id: no hacía nada real y siempre volvía a mostrar "pendiente" aunque
// la cita ya estuviera aprobada o realizada. Ahora lee vigilancia_salud (la misma caché/acción que
// la pantalla dedicada) y muestra el estado y la acción reales de cada persona.
async function cargarManualEmpresaAdmin() {
  const [{ data: catalogoCursos }, { data: registrosCursos }, { data: devoluciones }, { data: parametros }] = await Promise.all([
    sb.from('formacion_cursos_catalogo').select('*'),
    sb.from('formacion_cursos_registro').select('*'),
    sb.from('epi_devoluciones').select('estado'),
    sb.from('coef_parametros').select('coste_revision_medica, horas_revision_medica, tarifa_hora_neta').eq('hotel_id', usuarioActual.hotel_id).maybeSingle()
  ]);
  // Reutiliza el motor de Vigilancia de la Salud en vez de duplicarlo: si la pantalla dedicada ya
  // cargó vigilanciaCache en esta sesión se reutiliza tal cual; si no, se carga aquí mismo.
  if (!vigilanciaCache || !vigilanciaCache.length) await cargarVigilanciaAdmin();
  const personal = (await sb.from('personas_trabajadoras').select('id, nombre, fecha_incorporacion').eq('estado_laboral', 'Activo').order('fecha_incorporacion')).data || [];

  if ($('manualVigSeguimientoBody')) {
    $('manualVigSeguimientoBody').innerHTML =
      personal
        .filter((p) => p.fecha_incorporacion)
        .map((p) => {
          const incorporacion = new Date(p.fecha_incorporacion + 'T00:00:00');
          const propuesta = new Date(incorporacion);
          propuesta.setDate(propuesta.getDate() + 15);
          // Última revisión de vigilancia de esta persona (puede no existir todavía si aún no han
          // pasado los 15 días del alta — la crea sola evaluar_propuestas_vigilancia_formacion_prl()).
          const v = vigilanciaCache.filter((x) => x.trabajador_id === p.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
          const cita = v && v.cita_fecha ? `${fechaCorta(v.cita_fecha)} · ${(v.cita_hora || '').slice(0, 5)}${v.firma_trabajador_en ? ' ✍️' : ''}` : '<span class="sub-c">—</span>';
          return `<tr>
            <td>${p.nombre}</td>
            <td>${fechaCorta(p.fecha_incorporacion)}</td>
            <td>${propuesta.toLocaleDateString('es-ES')}</td>
            <td>${v ? v.tipo : 'Inicial'}</td>
            <td>${v ? badgeEstado(v.estado) : '<span class="badge2 b-slate">Aún no generada (+15 días del alta)</span>'}</td>
            <td>${cita}</td>
            <td>${v ? _accionVigilancia(v) : '<span class="sub-c">—</span>'}</td>
          </tr>`;
        })
        .join('') || '<tr><td colspan="7" class="sub-c" style="text-align:center;padding:14px;">Sin plantilla todavía.</td></tr>';
  }

  if ($('manualVigCosteCard') && parametros) {
    const precioRevision = Number(parametros.coste_revision_medica || 0);
    const tiempoValorado = Number(parametros.horas_revision_medica || 0) * Number(parametros.tarifa_hora_neta || 0);
    $('manualVigCosteCard').innerHTML = `
      <b style="font-size:12.5px;">💰 Coste de la revisión de vigilancia de la salud</b>
      <div class="grid g3" style="gap:10px;margin-top:8px;">
        <div><span class="sub-c">Precio de la revisión (mutua)</span><div style="font-weight:700;font-size:15px;">${fmtEur(precioRevision)}</div></div>
        <div><span class="sub-c">Tiempo valorado (${parametros.horas_revision_medica} h × ${parametros.tarifa_hora_neta} €/h)</span><div style="font-weight:700;font-size:15px;">${fmtEur(tiempoValorado)}</div></div>
        <div><span class="sub-c">Coste total por revisión</span><div style="font-weight:700;font-size:15px;">${fmtEur(precioRevision + tiempoValorado)}</div></div>
      </div>
      <p class="sub-c" style="margin:8px 0 0;">Editable desde Panel de Dirección → Plantilla de establecimiento. Integrado en el cuadro de costes de Dirección / Informes.</p>`;
  }

  if ($('manualAlertasKpis')) {
    const cursos = catalogoCursos || [];
    const registros = registrosCursos || [];
    const activos = personal || [];
    let caducadas = 0, pendientes = 0, alDia = 0;
    activos.forEach((p) => {
      cursos.forEach((c) => {
        const r = registros.find((x) => x.trabajador_id === p.id && x.curso_id === c.id);
        const ind = formacionCursoEstadoIndicador(r, c);
        if (ind.label.includes('Caducada')) caducadas++;
        else if (ind.label.includes('Sin realizar') || ind.label.includes('Por vencer')) pendientes++;
        else alDia++;
      });
    });
    const totalCombos = activos.length * cursos.length;
    const pctAlDia = totalCombos ? Math.round((alDia / totalCombos) * 100) : 0;
    const devPendientes = (devoluciones || []).filter((d) => d.estado !== 'firmado').length;
    $('manualAlertasKpis').innerHTML = `
      <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-formacion')"><div class="ic">🔴</div><div><div class="t">Formaciones pendientes</div><div class="v">${pendientes}</div></div></div>
      <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-formacion')"><div class="ic">🔴</div><div><div class="t">Formaciones caducadas</div><div class="v">${caducadas}</div></div></div>
      <div class="card kpi" style="cursor:pointer;" onclick="showScreen('admin-uniformidad')"><div class="ic">🟠</div><div><div class="t">Devoluciones EPI pend. de resguardo</div><div class="v">${devPendientes}</div></div></div>
      <div class="card kpi"><div class="ic">🟢</div><div><div class="t">Formación registrada al día</div><div class="v">${pctAlDia}%</div></div></div>`;
  }
}

// "Ver" (migración 0084): antes solo hacía scroll dentro de la propia pantalla del manual — ahora
// abre el documento completo en una pestaña nueva (mismo mecanismo que los certificados: blob HTML
// + window.open), para poder consultarlo sin tener que descargarlo. La descarga real en .docx
// sigue disponible aparte con "⬇ Descargar".
// César: "el botón de ver no funciona". No era un fallo de cableado (el listener y el id del
// botón eran correctos) sino de estilo: esta función montaba una hoja de estilos propia, mínima y
// escrita a mano, que no entendía ninguna de las clases reales del manual (card, grid, badges,
// etc.) — el documento se abría, pero como un amasijo de texto sin maquetar, ilegible. Se sustituye
// por el mismo mecanismo ya probado y en uso en _generarReporteEjecutivoHTML: inyectar el CSS real
// de la propia app (document.querySelector('style').textContent), así el documento abierto se ve
// exactamente igual que la pantalla de origen.
function verManualEmpresaCompleto() {
  const el = document.getElementById('screen-admin-manual');
  if (!el) { mostrarToast('No se encontró el contenido del Manual de Empresa', false); return; }
  const estilos = (document.querySelector('style') || {}).textContent || '';
  const contenido = el.innerHTML;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Manual de Empresa — Personal4Pax</title>
<style>${estilos}
body{max-width:900px;margin:0 auto;padding:32px 24px 60px;background:#fff;}
h1.manual-titulo{font-size:22px;color:var(--brand-700,#146950);margin:0 0 18px;}
button,input,select{display:none;}
</style>
</head><body><h1 class="manual-titulo">📘 Manual de Empresa — Personal4Pax</h1>${contenido}</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  registrarAuditoria('Manual de Empresa', 'Visualización del Manual de Empresa completo', 'Documento (vista, sin descarga)');
}

// ---------- Bloque 7 · Índice del Manual Corporativo (migración 0084) ----------
// Convierte cada tarjeta en un botón que abre el contenido normativo correspondiente en una
// pestaña nueva (mismo mecanismo que verManualEmpresaCompleto). Dos títulos ya tienen contenido
// real modelado en otros módulos (se enlazan tal cual, sin duplicar texto); el resto son áreas que
// el propio manual señala como "pendiente de redacción completa" — se marcan explícitamente como
// borrador inicial a validar por Dirección, en vez de simular un contenido normativo definitivo
// que nadie ha redactado ni aprobado todavía.
// Sustituido por el contenido real del "Manual Corporativo v-01" que aportó César (14 secciones,
// cada una con su desarrollo operativo + su párrafo de compromiso/motivación) — ya no son
// borradores: ya no se marcan como "borrador" ni se avisa de pendiente de validación, puesto que
// el propio documento aportado por Dirección ES la versión definitiva de estos contenidos.
const BLOQUE7_CONTENIDO = {
  mision: { titulo: '🎯 Misión, Visión y Valores', html: `<h2>Desarrollo</h2><p>La misión de nuestra empresa es ofrecer una experiencia integral y excepcional, segura, cuidada y humana, tanto para las personas que confían en nosotros (nuestros clientes) como para el equipo que la hace posible. La visión es ser un referente en la gestión profesional del talento y la excelencia operativa. Nuestros valores (respeto, integridad, excelencia, trabajo en equipo y mejora continua) se operacionalizan bajo un enfoque de <b>Agile Mindset</b>: fomentamos la adaptabilidad al cambio, la transparencia y la inspección continua de nuestros procesos. Desde PRL, la seguridad es un valor fundamental no negociable, y desde Igualdad, garantizamos un entorno inclusivo donde el mérito es el único criterio de crecimiento.</p><h2>Fundamento filosófico y estratégico</h2><p>Esta cultura se cimenta en la ética de <b>Immanuel Kant</b>, cuyo imperativo categórico nos exige tratar a cada cliente y trabajador siempre como un fin en sí mismo y nunca como un medio, garantizando su dignidad intrínseca. El desarrollo de la organización se inspira en el pensamiento de <b>Adam Smith</b>, entendiendo que la división del trabajo y la especialización incrementan la productividad, y que la búsqueda del interés individual, cuando está guiada por la "simpatía" (empatía) y la justicia, genera una prosperidad colectiva (la "mano invisible"). Este crecimiento humano y económico se perfecciona a través del <i>Learning by Doing</i>: tal como la especialización smithiana requiere de la práctica para generar valor, entendemos que el conocimiento y la mejora continua nacen de la experimentación, del hacer y de la reflexión sobre la acción. Para garantizar que este "hacer" se alinee con la excelencia, integramos la <b>Calidad de Philip Crosby</b>, asumiendo que la calidad no es un lujo, sino "el cumplimiento de los requisitos" y la búsqueda del "Cero Defectos". Finalmente, toda esta maquinaria se gestiona con el <b>método Agile</b>, basado en ciclos iterativos (sprints), transparencia radical y adaptación constante.</p><h2>Compromiso y motivación</h2><p>Queremos que sientas que formas parte de una organización íntegra, donde tu voz es escuchada y protegida. Actuar con ética no es solo una obligación legal, es el pilar que nos permite mirarnos a los ojos con orgullo y construir un legado de confianza.</p>` },
  etico: { titulo: '⚖️ Código Ético', html: `<h2>Desarrollo operativo</h2><p>Este marco de actuación se basa en la honestidad y la transparencia. Se establece una tolerancia cero hacia los conflictos de interés no declarados y cualquier forma de corrupción. En línea con la <b>Ley 2/2023</b>, disponemos de un Canal de Denuncias confidencial que garantiza la ausencia de represalias. Cualquier decisión debe anteponer el cumplimiento normativo y la seguridad de las personas a los resultados económicos, asegurando la sostenibilidad y reputación de la marca a largo plazo.</p><h2>Compromiso y motivación</h2><p>Al elegir siempre el camino correcto, incluso cuando es el más difícil, no solo proteges a nuestra empresa, sino que te proteges a ti mismo y a tus compañeros, creando un espacio de trabajo seguro, justo y acogedor donde el respeto mutuo es la norma inquebrantable.</p>` },
  conducta: { titulo: '📜 Código de Conducta', html: `<h2>Desarrollo operativo</h2><p>Define las normas de convivencia y desempeño diario. Se exige puntualidad, uso eficiente de los recursos y un trato respetuoso, erradicando cualquier atisbo de acoso laboral o sexual. En el marco de la calidad (Crosby), el personal se compromete a seguir los procedimientos operativos estandarizados (SOPs) para minimizar errores. Las desviaciones se gestionan a través de un régimen disciplinario proporcional y documentado (módulo Disciplina).</p><h2>Compromiso y motivación</h2><p>Al ser puntual y respetuoso, no solo demuestras profesionalidad, sino que tiendes la mano a tus compañeros para que su trabajo sea más fácil. Vive este código no como un conjunto de reglas, sino como la receta para un ambiente armonioso.</p>` },
  liderazgo: { titulo: '👑 Liderazgo', html: `<h2>Desarrollo operativo</h2><p>Promovemos un <b>Liderazgo de Servicio (Servant Leadership)</b>. Los responsables actúan como facilitadores que eliminan bloqueos (Agile) y garantizan la seguridad física y psicosocial de su equipo (PRL). Se exige coherencia (predicar con el ejemplo), feedback continuo y protección frente a cargas de trabajo no razonables. El liderazgo se evalúa objetivamente mediante la matriz de meritocracia (ver Bloque 6).</p><h2>Compromiso y motivación</h2><p>Si eres responsable de un equipo, tu misión principal es crear un escudo protector a tu alrededor, inspirando confianza y ofreciendo las herramientas para que cada persona brille con luz propia.</p>` },
  comunicacion: { titulo: '💬 Comunicación Interna', html: `<h2>Desarrollo operativo</h2><p>Sistema de comunicación ágil y bidireccional. Se utilizan canales digitales (app, chat) y reuniones periódicas (Daily Stand-ups o Retrospectivas departamentales). Se prioriza la comunicación directa y a tiempo, especialmente ante incidencias operativas o cambios organizativos, minimizando los silos de información.</p><h2>Compromiso y motivación</h2><p>Te animamos a abrir tus canales de comunicación, a compartir tus ideas y a expresar tus inquietudes sin filtros. Este es un espacio de puertas abiertas donde la transparencia nos une.</p>` },
  imagen: { titulo: '🏨 Imagen Corporativa', html: `<h2>Desarrollo operativo</h2><p>La imagen de nuestra empresa es el reflejo de nuestra calidad y valores. La presencia en el centro de trabajo debe ser impecable, coherente con la excelencia en el servicio. Cualquier comunicación externa o uso de instalaciones para fines promocionales requerirá autorización de Dirección y cumplirá estrictamente con el derecho a la propia imagen y la protección de datos de clientes y empleados (RGPD).</p><h2>Compromiso y motivación</h2><p>Tu profesionalidad, tu presencia impecable y tu sonrisa son nuestra mejor tarjeta de presentación. Cuidemos juntos nuestro espacio y nuestra reputación.</p>` },
  vestimenta: { titulo: '👔 Vestimenta y uniformidad', html: `<h2>Desarrollo operativo</h2><p>La uniformidad y los Equipos de Protección Individual (EPI) están estandarizados por puesto en el módulo correspondiente. El uso de EPIs (calzado de seguridad, protección solar, etc.) es obligatorio y auditado. El sistema digitaliza la entrega, reposición y devolución mediante firma, garantizando el cumplimiento de la LPRL. Se promueve una uniformidad inclusiva y adaptada a las necesidades ergonómicas del puesto.</p><h2>Compromiso y motivación</h2><p>Vestir el uniforme y equiparte con tus EPIs es el acto de amor propio y de cuidado hacia tus compañeros: "mi salud es lo primero" y "quiero que volvamos a casa sanos y salvos".</p>`, remitirA: 'admin-uniformidad' },
  redes: { titulo: '📱 Redes Sociales', html: `<h2>Desarrollo operativo</h2><p>El uso personal de redes es libre, pero exige responsabilidad digital. Queda prohibido compartir información confidencial de clientes o compañeros (RGPD) o utilizar la marca sin autorización. Fomentamos que los empleados actúen como <i>brand ambassadors</i> positivos. Las publicaciones institucionales se centralizan en el departamento de Marketing/Comunicación.</p><h2>Compromiso y motivación</h2><p>Comparte con orgullo tu día a día (sin datos sensibles) y ayúdanos a construir una comunidad virtual positiva.</p>` },
  ia: { titulo: '🤖 Uso de Inteligencia Artificial', html: `<h2>Desarrollo operativo</h2><p>La IA es una herramienta de apoyo para la eficiencia y la calidad, no un sustituto de la responsabilidad humana. Todo output generado por IA debe ser revisado y validado por la persona trabajadora. En estricto cumplimiento del RGPD, <b>queda terminantemente prohibido</b> introducir datos personales (clientes, empleados) en herramientas de IA no autorizadas por la empresa (Shadow AI). Se promueve un uso ético y libre de sesgos.</p><h2>Compromiso y motivación</h2><p>Abraza la IA como un compañero de equipo que te ayuda a ser más eficiente, pero recuerda que tu criterio, tu empatía y tu talento son irreemplazables.</p>` },
  confidencialidad: { titulo: '🔒 Confidencialidad', html: `<h2>Desarrollo operativo</h2><p>Deber de secreto profesional que se extiende más allá de la relación laboral (Ley de Secretos Empresariales). La información operativa, económica y comercial, así como la de clientes y compañeros, es confidencial. El acceso a la información se rige por el principio de "necesidad de saber".</p><h2>Compromiso y motivación</h2><p>Cuando guardas la confidencialidad, estás honrando la promesa de discreción que nuestros clientes y tus propios compañeros han depositado en ti.</p>` },
  rgpd: { titulo: '🛡️ Protección de Datos (RGPD)', html: `<h2>Desarrollo operativo</h2><p>Cumplimiento estricto del RGPD y la LOPDGDD. Se aplica <i>Privacy by Design</i> en todos los procesos. Especial celo en la categoría especial de datos (salud en vigilancia PRL y datos del Canal de Denuncias). RR.HH. nunca almacena diagnósticos o historiales médicos, solo la aptitud laboral, garantizando el cumplimiento del Art. 22 LPRL. La gestión operativa se detalla en el módulo de Compliance.</p><h2>Compromiso y motivación</h2><p>Tus datos, y los de nuestros clientes, son sagrados para nosotros: la protección de la privacidad no es un trámite burocrático, es una muestra de respeto profundo hacia la persona.</p>`, remitirA: 'admin-compliance' },
  desconexion: { titulo: '📴 Desconexión Digital', html: `<h2>Desarrollo operativo</h2><p>Respeto al tiempo de descanso como medida de prevención de riesgos psicosociales y fomento de la conciliación (Art. 88 LOPDGDD). No se exige disponibilidad fuera de la jornada pactada. Las comunicaciones digitales fuera de horario no generan obligación de respuesta, salvo emergencias operativas justificadas.</p><h2>Compromiso y motivación</h2><p>Descansar no es un premio, es tu derecho. Apaga las pantallas, disfruta de tu familia y de tus pasiones.</p>` },
  sostenibilidad: { titulo: '🌱 Sostenibilidad', html: `<h2>Desarrollo operativo</h2><p>Compromiso ESG (Environmental, Social and Governance). Promovemos la eficiencia energética e hídrica, la economía circular y la reducción de residuos. La mejora continua (Kaizen) se aplica también a nuestra huella ambiental.</p><h2>Compromiso y motivación</h2><p>Cada pequeño gesto cuenta: apagar una luz, ahorrar agua o reciclar correctamente. Trabajar aquí significa también dejar una huella verde.</p>` },
  'derechos-humanos': { titulo: '🤝 Derechos Humanos', html: `<h2>Desarrollo operativo</h2><p>Tolerancia cero ante el trabajo forzoso, infantil, explotación o discriminación (por razón de sexo, raza, orientación, etc.). Esta política se exige también a toda la cadena de suministro y proveedores externos mediante cláusulas contractuales (Debida Diligencia). El Canal de Denuncias es el cauce seguro para reportar cualquier vulneración.</p><h2>Compromiso y motivación</h2><p>Alzar la voz contra cualquier injusticia o discriminación es un acto de valentía y de amor hacia los demás.</p>` }
};
// César (captura 6): "Estos botones no hacen nada". Causa real: abrían el contenido con
// window.open() sobre una blob: URL — en Chrome/Android y en bastantes configuraciones de
// navegador móvil eso se bloquea o simplemente no hace nada visible, sin ningún error que lo
// delate. Se sustituye por un modal dentro de la propia app (mismo patrón que el resto de "Ver"
// de la aplicación), que no depende de ventanas emergentes y funciona igual en móvil y escritorio.
let _verSeccionManualClave = null;
function verSeccionManualBloque7(clave) {
  const s = BLOQUE7_CONTENIDO[clave];
  if (!s) return;
  _verSeccionManualClave = clave;
  $('verSeccionManualTitulo').textContent = s.titulo;
  $('verSeccionManualContenido').innerHTML = s.html;
  $('modalVerSeccionManual').classList.remove('hidden');
  if (s.remitirA) {
    mostrarToast(`${s.titulo}: esta sección además se gestiona con datos reales en "${TITULOS_PANTALLA[s.remitirA] ? TITULOS_PANTALLA[s.remitirA][0] : s.remitirA}" — puedes consultarla ahí para el detalle operativo.`, true);
  }
  registrarAuditoria('Manual de Empresa', `Visualización de sección — ${s.titulo}`, clave);
}
function cerrarVerSeccionManualModal() {
  $('modalVerSeccionManual').classList.add('hidden');
}
function imprimirSeccionManual() {
  const s = BLOQUE7_CONTENIDO[_verSeccionManualClave];
  if (!s) return;
  const w = window.open('', '_blank');
  if (!w) {
    mostrarToast('El navegador ha bloqueado la ventana de impresión — permite las ventanas emergentes para este sitio, o usa el menú de impresión del propio navegador sobre esta ventana.', false);
    return;
  }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${s.titulo.replace(/^[^\w]+/, '').trim()} — Manual Corporativo</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:680px;margin:40px auto;padding:0 24px;color:#1e293b;line-height:1.6;}
h1{font-size:20px;color:#0f766e;margin-bottom:18px;} h2{font-size:13.5px;text-transform:uppercase;letter-spacing:.03em;color:#475569;margin:18px 0 4px;}
p{margin:0 0 8px;}</style>
</head><body><h1>${s.titulo}</h1>${s.html}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// Genera un documento compatible con Microsoft Word (HTML con los espacios de nombres de Word,
// que Word abre y pagina como un .doc nativo) con los 7 bloques completos del manual — no hay
// librería de generación de .docx real vendorizada en esta app (solo xlsx.min.js para Excel), así
// que se usa esta técnica estándar en vez de fabricar un .docx que no sería un OOXML válido.
function exportarManualEmpresaDocx() {
  const contenido = document.getElementById('screen-admin-manual').innerHTML;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>Manual de Empresa</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;} table{border-collapse:collapse;width:100%;margin:8px 0;} th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;} h3{margin-top:18px;} button,input,select{display:none;}</style>
</head><body><h1>Manual de Empresa — Personal4Pax</h1>${contenido}</body></html>`;
  const blob = new Blob(['﻿', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Manual_de_Empresa.doc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  registrarAuditoria('Manual de Empresa', 'Descarga del Manual de Empresa completo', 'Documento (.doc compatible con Word)');
  mostrarToast('Manual de Empresa descargado ✓', true);
}

// ---------- Asistente Normativo (admin, solo lectura) ----------
// La pantalla decía "mismo contenido que consulta la persona trabajadora" pero solo cargaba
// normativa_faq, sin los enlaces de referencia (normativa_links) que sí ve la persona trabajadora
// cuando no hay ficha exacta — y ninguna consulta dejaba rastro de auditoría. Cierra ambos huecos
// (migración 0074: registrar_consulta_normativa + lectura de normativa_links y auditoria_log).
let normativaFaqCache = [];
let normativaLinksCacheAdmin = [];
let normativaRespaldoCacheAdmin = [];

// Mismo normalizador de texto que usa buscarNormativa() en la app de la persona trabajadora
// (tolerante a tildes/mayúsculas) — se duplica aquí porque cada app es un bundle independiente.
function normalizarTextoAdmin(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Chips de sugerencia agrupados por categoría (badge) — réplica exacta de
// renderNormativaSugerencias() de la app de la persona trabajadora, para que RR.HH. vea el
// mismo formato interactivo del Asistente Normativo original, no solo una lista plana.
function renderNormativaSugerenciasAdmin() {
  const cont = $('normativaSugerenciasAdmin');
  if (!cont) return;
  if (!normativaFaqCache.length) {
    cont.innerHTML = '<p class="sub-c">No hay preguntas frecuentes cargadas todavía.</p>';
    return;
  }
  const porBadge = {};
  normativaFaqCache.forEach((f) => {
    (porBadge[f.badge] = porBadge[f.badge] || []).push(f);
  });
  cont.innerHTML = Object.keys(porBadge)
    .map(
      (badge) => `
        <details class="sugerencias-grupo">
          <summary>${badge} (${porBadge[badge].length})</summary>
          <div class="sugerencias">
            ${porBadge[badge].map((f) => `<button type="button" data-sugerencia-admin="${f.pregunta.replace(/"/g, '&quot;')}">${f.pregunta}</button>`).join('')}
          </div>
        </details>`
    )
    .join('');
}

// Misma regla de búsqueda de respuesta que el original (líneas 1437/6063 del prototipo): 1) ficha
// exacta en normativa_faq por coincidencia de palabras clave, 2) si no hay ficha, respuesta
// orientativa por área legal en normativa_respaldo, 3) si tampoco hay respaldo, se ofrecen los
// enlaces de referencia (normativa_links) como último recurso — nunca se inventa una respuesta
// fuera de esas 3 fuentes. No se usa registrar_consulta_normativa (exige current_trabajador_id(),
// que para un usuario admin es null y haría fallar la llamada) — se deja constancia con el mismo
// registrarAuditoria() que usa el resto del panel.
function buscarNormativaAdmin() {
  const input = $('normativaQueryAdmin');
  const qRaw = (input.value || '').trim();
  const q = normalizarTextoAdmin(qRaw);
  const box = $('normativaResultadoAdmin');
  if (!q) {
    box.innerHTML = '<div class="norm-result"><span class="norm-badge norm-badge-slate">SIN CONSULTA</span><div>Escribe una pregunta arriba (o usa una sugerencia) y pulsa "Consultar".</div></div>';
    return;
  }
  let best = null, bestScore = 0;
  normativaFaqCache.forEach((f) => {
    let score = 0;
    (f.keywords || []).forEach((k) => {
      if (q.includes(normalizarTextoAdmin(k))) score += normalizarTextoAdmin(k).length;
    });
    if (q.includes(normalizarTextoAdmin(f.pregunta).slice(0, 10))) score += 5;
    if (score > bestScore) { bestScore = score; best = f; }
  });
  if (best && bestScore > 0) {
    box.innerHTML = `<div class="norm-result"><span class="norm-badge norm-badge-brand">${best.badge}</span><div class="q">${best.pregunta}</div><div>${best.respuesta}</div><div class="sub-c" style="margin-top:8px;">🔗 ${best.fuente}</div></div>`;
    registrarAuditoria('Normativa', 'Consulta de normativa (RR.HH.)', `Pregunta: "${qRaw}" — ficha: ${best.pregunta}`);
    return;
  }
  let bestResp = null, bestRespScore = 0;
  normativaRespaldoCacheAdmin.forEach((r) => {
    let score = 0;
    (r.keywords || []).forEach((k) => {
      if (q.includes(normalizarTextoAdmin(k))) score += normalizarTextoAdmin(k).length;
    });
    if (score > bestRespScore) { bestRespScore = score; bestResp = r; }
  });
  const sugeridos = normativaLinksCacheAdmin
    .slice(0, 3)
    .map((l) => `<a href="${l.url}" target="_blank" rel="noopener" style="display:block;font-size:12.5px;margin-top:4px;">🔗 ${l.titulo}</a>`)
    .join('');
  if (bestResp && bestRespScore > 0) {
    box.innerHTML = `<div class="norm-result"><span class="norm-badge norm-badge-amber">RESPALDO · ${bestResp.badge}</span><div class="q">"${qRaw}"</div><div>${bestResp.respuesta}</div><div class="sub-c" style="margin-top:8px;">🔗 ${bestResp.fuente}</div><p class="sub-c" style="margin:8px 0 0;">📚 Respuesta orientativa (área: ${bestResp.area}) — todavía no hay una ficha específica para esta consulta exacta. Enlaces de referencia:${sugeridos}</p></div>`;
    registrarAuditoria('Normativa', 'Consulta de normativa (RR.HH.)', `Pregunta: "${qRaw}" — respaldo: ${bestResp.area}`);
  } else {
    box.innerHTML = `<div class="norm-result"><span class="norm-badge norm-badge-slate">SIN RESULTADO EXACTO</span><div class="q">"${qRaw}"</div><div>Todavía no hay una respuesta preparada para esta consulta concreta. Estos enlaces de referencia pueden ayudar:${sugeridos}</div></div>`;
    registrarAuditoria('Normativa', 'Consulta de normativa (RR.HH.)', `Pregunta: "${qRaw}" — sin resultado exacto`);
  }
}

async function cargarNormativaAdmin() {
  const [{ data: faq }, { data: links }, { data: respaldo }] = await Promise.all([
    sb.from('normativa_faq').select('*').order('orden'),
    sb.from('normativa_links').select('*').order('orden'),
    sb.from('normativa_respaldo').select('*').order('orden')
  ]);
  normativaFaqCache = faq || [];
  normativaLinksCacheAdmin = links || [];
  normativaRespaldoCacheAdmin = respaldo || [];
  renderNormativaAdmin();
  renderNormativaSugerenciasAdmin();
  if ($('normativaLinksBody')) {
    // Gestión real de RR.HH. (prototipo: "Enlaces de referencia — gestión de RR.HH.", líneas
    // 1440/6101) — antes esta lista era de solo lectura y no tenía forma de añadir ni quitar
    // enlaces; la migración 0079 añade las políticas RLS de escritura que faltaban.
    $('normativaLinksBody').innerHTML =
      normativaLinksCacheAdmin
        .map(
          (l) => `<div class="row-item" style="flex-wrap:nowrap;"><a href="${l.url}" target="_blank" rel="noopener" style="font-size:12.5px;flex:1;min-width:0;">🔗 ${l.titulo}</a><button type="button" class="btn btn-danger btn-sm" style="flex-shrink:0;" onclick="eliminarEnlaceNormativa('${l.id}')">✕</button></div>`
        )
        .join('') || '<p class="sub-c">Sin enlaces añadidos todavía.</p>';
  }
  if ($('normativaAuditoriaBody')) {
    const { data: consultas } = await sb
      .from('auditoria_log')
      .select('*')
      .eq('modulo', 'Normativa')
      .order('created_at', { ascending: false })
      .limit(20);
    $('normativaAuditoriaBody').innerHTML =
      (consultas || [])
        .map(
          (c) => `<div class="row-item" style="flex-direction:column;align-items:stretch;">
            <div style="display:flex;justify-content:space-between;gap:8px;"><b style="font-size:12px;">${c.actor || '—'}</b><span class="sub-c">${new Date(c.created_at).toLocaleString('es-ES')}</span></div>
            <span class="sub-c" style="margin-top:2px;">${c.detalle || ''}</span>
          </div>`
        )
        .join('') || '<p class="sub-c">Todavía no se ha registrado ninguna consulta.</p>';
  }
}

async function guardarNuevoEnlaceNormativa(e) {
  e.preventDefault();
  const titulo = $('nlTitulo').value.trim();
  const url = $('nlUrl').value.trim();
  if (!titulo || !url) return;
  const orden = normativaLinksCacheAdmin.length ? Math.max(...normativaLinksCacheAdmin.map((l) => l.orden || 0)) + 1 : 1;
  const { error } = await sb.from('normativa_links').insert({ titulo, url, orden });
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Enlace añadido ✓', !error);
  if (!error) {
    $('nlTitulo').value = '';
    $('nlUrl').value = '';
    await registrarAuditoria('Normativa', 'Enlace de referencia añadido', titulo);
    await cargarNormativaAdmin();
  }
}
async function eliminarEnlaceNormativa(id) {
  const l = normativaLinksCacheAdmin.find((x) => x.id === id);
  const { error } = await sb.from('normativa_links').delete().eq('id', id);
  mostrarToast(error ? 'Error al eliminar: ' + error.message : 'Enlace eliminado ✓', !error);
  if (!error) {
    await registrarAuditoria('Normativa', 'Enlace de referencia eliminado', l ? l.titulo : id);
    await cargarNormativaAdmin();
  }
}
function renderNormativaAdmin() {
  const q = ($('normativaBuscador').value || '').toLowerCase().trim();
  const filtradas = q
    ? normativaFaqCache.filter((f) => (f.pregunta + ' ' + f.respuesta + ' ' + (f.keywords || '')).toLowerCase().includes(q))
    : normativaFaqCache;
  $('normativaFaqBody').innerHTML =
    filtradas
      .map(
        (f) => `<div class="row-item" style="flex-direction:column;align-items:stretch;">
          <b style="font-size:12.5px;">${f.badge ? `<span class="badge2 b-brand">${f.badge}</span> ` : ''}${f.pregunta}</b>
          <p class="sub-c" style="margin:4px 0 0;">${f.respuesta}</p>
          ${f.fuente ? `<span class="sub-c" style="margin-top:2px;">📎 ${f.fuente}</span>` : ''}
        </div>`
      )
      .join('') || '<p class="sub-c">Sin resultados.</p>';
}

// ---------- Vigilancia de la Salud (admin) — circuito completo, migración 0068 ----------
// Propuesta pendiente (la crea sola evaluar_propuestas_vigilancia_formacion_prl(), a los 15 días del
// alta) → Solicitud enviada a la mutua → Cita confirmada (pendiente de firma) → firma de la persona
// trabajadora → Cita aprobada (SOLO aquí se toca el cuadrante, vía la RPC vigilancia_aprobar_cita,
// que comprueba si coincide con el turno real) → asistencia confirmada → Realizada (aptitud +
// documento real en Mis Documentos).
let vigilanciaCache = [];
let vigCitaContext = null; // { id }
let vigResultadoContext = null; // { id }

async function cargarVigilanciaAdmin() {
  const { data } = await sb
    .from('vigilancia_salud')
    .select('*, personas_trabajadoras(nombre, puesto)')
    .order('created_at', { ascending: false });
  vigilanciaCache = data || [];
  const total = vigilanciaCache.length;
  const realizadas = vigilanciaCache.filter((v) => v.estado === 'Realizada').length;
  const pendientesFirma = vigilanciaCache.filter((v) => v.estado === 'Cita confirmada' && !v.firma_trabajador_en).length;
  const proxima = vigilanciaCache
    .filter((v) => v.proxima_fecha && new Date(v.proxima_fecha) >= new Date())
    .sort((a, b) => (a.proxima_fecha < b.proxima_fecha ? -1 : 1))[0];
  $('vigKpis').innerHTML = `
    <div class="card kpi"><div class="ic">👥</div><div><div class="t">En seguimiento</div><div class="v">${total}</div></div></div>
    <div class="card kpi"><div class="ic">✅</div><div><div class="t">Realizadas</div><div class="v">${realizadas}</div></div></div>
    <div class="card kpi"><div class="ic">✍️</div><div><div class="t">Pendientes de firma</div><div class="v">${pendientesFirma}</div></div></div>
    <div class="card kpi"><div class="ic">📅</div><div><div class="t">Próxima revisión más cercana</div><div class="v">${proxima ? fechaCorta(proxima.proxima_fecha) : '—'}</div></div></div>`;
  renderVigilanciaMatriz();
  // Bug real reportado por César: "pinchas, pone solicitud enviada, pero no marca qué se ha
  // enviado" — el botón que pulsaba estaba en Manual de Empresa (manualVigSeguimientoBody), que
  // reutiliza estas mismas acciones pero NUNCA se refrescaba desde aquí (solo se refrescaba
  // vigMatrizBody, de la pantalla dedicada). El estado SÍ cambiaba en la base de datos — solo no se
  // veía reflejado en la pantalla que estaba mirando. cargarManualEmpresaAdmin() no vuelve a pedir
  // vigilanciaCache (ya está en memoria), así que este refresco cruzado es barato.
  if ($('manualVigSeguimientoBody')) await cargarManualEmpresaAdmin();
}

function _accionVigilancia(v) {
  if (v.estado === 'Propuesta pendiente') return `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirEnviarSolicitudMutua('${v.id}')">📨 Enviar solicitud a la mutua (Previs)</button>`;
  if (v.estado === 'Solicitud enviada a la mutua') return `<button type="button" class="btn btn-sm" onclick="abrirModalVigCita('${v.id}')">📅 Confirmar cita (correo de Previs)</button>`;
  if (v.estado === 'Cita confirmada' && !v.firma_trabajador_en) {
    let extra = '<span class="sub-c">⏳ Pendiente de firma de la persona trabajadora</span>';
    if (v.recordatorio_30min_enviado) extra += ' <span class="badge2 b-amber" style="font-size:9px;">🔔 Recordatorio +30min</span>';
    if (v.escalado_24h_enviado) extra += ' <span class="badge2 b-rose" style="font-size:9px;">⚠️ Sin firmar tras 24h</span>';
    return extra;
  }
  if (v.estado === 'Cita confirmada' && v.firma_trabajador_en) return `<button type="button" class="btn btn-sm" onclick="aprobarCitaVigilancia('${v.id}')">✅ Aprobar cita y actualizar cuadrante</button>`;
  if (v.estado === 'Cita aprobada' && !v.asistencia_confirmada_en) return `<button type="button" class="btn btn-secondary btn-sm" onclick="confirmarAsistenciaVigilancia('${v.id}')">✅ Confirmar asistencia a la cita</button>`;
  if (v.estado === 'Cita aprobada' && v.asistencia_confirmada_en) return `<button type="button" class="btn btn-sm" onclick="abrirModalVigResultado('${v.id}')">📧 Recibir resultado de Previs</button>`;
  if (v.estado === 'Realizada') {
    const cls = v.aptitud === 'No apto' ? 'b-rose' : v.aptitud === 'Apto con restricciones/adaptaciones' ? 'b-amber' : 'b-emerald';
    return `<span class="badge2 ${cls}">${v.aptitud || 'Apto'}</span><div class="sub-c" style="margin-top:2px;">Próxima: ${v.proxima_fecha ? fechaCorta(v.proxima_fecha) : '—'}</div>`;
  }
  return '<span class="sub-c">—</span>';
}

function renderVigilanciaMatriz() {
  const fEstado = $('vigFiltroEstado').value;
  const fTipo = $('vigFiltroTipo').value;
  const filtradas = vigilanciaCache.filter((v) => (!fEstado || v.estado === fEstado) && (!fTipo || v.tipo === fTipo));
  $('vigMatrizBody').innerHTML =
    filtradas
      .map((v) => {
        const cita = v.cita_fecha ? `${fechaCorta(v.cita_fecha)} · ${(v.cita_hora || '').slice(0, 5)}${v.firma_trabajador_en ? ' ✍️' : ''}` : '<span class="sub-c">—</span>';
        return `<tr>
          <td>${v.personas_trabajadoras ? v.personas_trabajadoras.nombre : '—'}</td>
          <td class="sub-c">${v.personas_trabajadoras ? v.personas_trabajadoras.puesto || '—' : '—'}</td>
          <td>${v.tipo}</td>
          <td>${badgeEstado(v.estado)}</td>
          <td>${cita}</td>
          <td>${_accionVigilancia(v)}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin registros con estos filtros — la propuesta se crea sola a los 15 días del alta de cada persona.</td></tr>';
}

// Antes cambiaba el estado directamente sin enviar ningún correo real. César pidió exactamente el
// mismo circuito que ya tiene Formación PRL: ventana de revisión con Para/CC (precargado con el/la
// responsable) y cuerpo editable, que solo cambia el estado si el correo se envía correctamente.
let vigEnviarTarget = null;
async function abrirEnviarSolicitudMutua(id) {
  const v = vigilanciaCache.find((x) => x.id === id);
  if (!v) return;
  vigEnviarTarget = id;
  const nombreTrabajador = v.personas_trabajadoras ? v.personas_trabajadoras.nombre : '—';
  $('vigEnviarId').value = id;
  $('vigEnviarPara').value = '';
  $('vigEnviarCC').value = '';
  $('vigEnviarAsunto').value = `Solicitud de cita de vigilancia de la salud — ${nombreTrabajador}`;
  $('vigEnviarCuerpo').value = `Buenos días,\n\nSolicitamos programar cita de vigilancia de la salud (${v.tipo || 'revisión'}) para la siguiente persona trabajadora:\n\nNombre: ${nombreTrabajador}\nPuesto: ${v.personas_trabajadoras ? v.personas_trabajadoras.puesto || '—' : '—'}\n\nQuedamos a la espera de fecha y hora propuestas.\n\nUn saludo,\nDepartamento de RR.HH.`;
  $('modalVigEnviarSolicitud').classList.remove('hidden');
  if (v.trabajador_id) {
    const { data: ccJefe } = await sb.rpc('jefe_departamento_email_de', { p_trabajador_id: v.trabajador_id });
    if (vigEnviarTarget === id && ccJefe) $('vigEnviarCC').value = ccJefe;
  }
}
function cerrarEnviarSolicitudMutua() {
  $('modalVigEnviarSolicitud').classList.add('hidden');
  vigEnviarTarget = null;
}
async function confirmarEnviarSolicitudMutua() {
  const id = $('vigEnviarId').value;
  const para = $('vigEnviarPara').value.trim();
  const cc = $('vigEnviarCC').value.trim();
  const asunto = $('vigEnviarAsunto').value.trim();
  const cuerpo = $('vigEnviarCuerpo').value.trim();
  if (!para) {
    mostrarToast('⚠️ Indica la dirección de correo de la mutua (Previs)', false);
    return;
  }
  if (!asunto || !cuerpo) {
    mostrarToast('⚠️ Completa el asunto y el cuerpo del correo', false);
    return;
  }
  const { error: errorEnvio } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: para,
    p_asunto: asunto,
    p_cuerpo: cuerpo,
    p_cc_email: cc || null,
    p_referencia_tabla: 'vigilancia_salud',
    p_referencia_id: id
  });
  if (errorEnvio) {
    mostrarToast('Error al enviar: ' + errorEnvio.message, false);
    return;
  }
  const { error } = await sb.from('vigilancia_salud').update({ estado: 'Solicitud enviada a la mutua' }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : `Solicitud enviada a la mutua ✓ Para: ${para}${cc ? ' · CC: ' + cc : ''}`, !error);
  if (!error) {
    await registrarAuditoria('Vigilancia de la salud', 'Solicitud enviada a la mutua', `Para: ${para}${cc ? ' · CC: ' + cc : ''}`);
    cerrarEnviarSolicitudMutua();
    await cargarVigilanciaAdmin();
  }
}

function abrirModalVigCita(id) {
  const v = vigilanciaCache.find((x) => x.id === id);
  vigCitaContext = { id };
  $('vigCitaNombre').textContent = v && v.personas_trabajadoras ? v.personas_trabajadoras.nombre : '—';
  $('vigCitaFecha').value = '';
  $('vigCitaHora').value = '';
  $('modalVigCita').classList.remove('hidden');
}
function cerrarModalVigCita() {
  $('modalVigCita').classList.add('hidden');
  vigCitaContext = null;
}
async function guardarVigCita() {
  if (!vigCitaContext) return;
  const fecha = $('vigCitaFecha').value;
  const hora = $('vigCitaHora').value;
  if (!fecha || !hora) {
    mostrarToast('Indica fecha y hora de la cita', false);
    return;
  }
  const { error } = await sb
    .from('vigilancia_salud')
    .update({
      estado: 'Cita confirmada',
      cita_fecha: fecha,
      cita_hora: hora,
      cita_confirmada_en: new Date().toISOString(),
      firma_trabajador_en: null,
      firma_trabajador_ref: null,
      aprobada_rrhh_en: null,
      cuadrante_actualizado: false,
      asistencia_confirmada_en: null,
      aptitud: null,
      recordatorio_30min_enviado: false,
      escalado_24h_enviado: false
    })
    .eq('id', vigCitaContext.id);
  const vReg = vigilanciaCache.find((x) => x.id === vigCitaContext.id);
  if (!error) {
    await sb.rpc('encolar_notificacion', {
      p_trabajador_id: vReg?.trabajador_id,
      p_hotel_id: usuarioActual.hotel_id,
      p_tipo: 'vigilancia_cita_recibida',
      p_titulo: '🩺 Cita de vigilancia de la salud recibida — pendiente tu firma',
      p_cuerpo: `${fechaCorta(fecha)} a las ${hora} h. Fírmala desde tu ficha para confirmarla.`,
      p_referencia_tabla: 'vigilancia_salud',
      p_referencia_id: vigCitaContext.id
    });
    // Avisa también al/a la responsable (pedido explícito de César: "enviar aviso al trabajador y a
    // su responsable" al confirmar la cita) — el volcado real al cuadrante llega un paso después,
    // en "Aprobar cita y actualizar cuadrante", una vez la persona trabajadora ha firmado.
    if (vReg?.trabajador_id) {
      const { data: emailResponsable } = await sb.rpc('jefe_departamento_email_de', { p_trabajador_id: vReg.trabajador_id });
      if (emailResponsable) {
        await sb.rpc('enviar_correo_externo', {
          p_destinatario_email: emailResponsable,
          p_asunto: `Cita de vigilancia de la salud — ${vReg.personas_trabajadoras ? vReg.personas_trabajadoras.nombre : ''}`,
          p_cuerpo: `Se ha recibido cita de vigilancia de la salud para ${vReg.personas_trabajadoras ? vReg.personas_trabajadoras.nombre : 'la persona trabajadora'} el ${fechaCorta(fecha)} a las ${hora} h.\n\nQueda pendiente de la firma de la persona trabajadora; una vez firmada y aprobada por RR.HH., se reflejará automáticamente en el cuadrante.`,
          p_referencia_tabla: 'vigilancia_salud',
          p_referencia_id: vigCitaContext.id
        });
      }
    }
  }
  mostrarToast(error ? 'Error: ' + error.message : 'Cita registrada ✓ aviso enviado a la persona trabajadora y a su responsable — pendiente de firma', !error);
  cerrarModalVigCita();
  await cargarVigilanciaAdmin();
}

async function aprobarCitaVigilancia(id) {
  const { data, error } = await sb.rpc('vigilancia_aprobar_cita', { p_id: id });
  mostrarToast(error ? 'Error: ' + error.message : `Cita aprobada ✓ ${data}`, !error);
  if (!error) await cargarVigilanciaAdmin();
}

async function confirmarAsistenciaVigilancia(id) {
  const { error } = await sb.from('vigilancia_salud').update({ asistencia_confirmada_en: new Date().toISOString() }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Asistencia confirmada ✓ — a la espera del resultado de Previs', !error);
  if (!error) await cargarVigilanciaAdmin();
}

function abrirModalVigResultado(id) {
  vigResultadoContext = { id };
  const v = vigilanciaCache.find((x) => x.id === id);
  $('vigResultadoNombre').textContent = v && v.personas_trabajadoras ? v.personas_trabajadoras.nombre : '—';
  $('vigResultadoAptitud').value = 'Apto';
  $('modalVigResultado').classList.remove('hidden');
}
function cerrarModalVigResultado() {
  $('modalVigResultado').classList.add('hidden');
  vigResultadoContext = null;
}
async function guardarVigResultado() {
  if (!vigResultadoContext) return;
  const v = vigilanciaCache.find((x) => x.id === vigResultadoContext.id);
  if (!v) return;
  const aptitud = $('vigResultadoAptitud').value;
  const meses = v.tipo === 'Adaptación de puesto' ? 6 : 12;
  const proxima = new Date(v.cita_fecha || new Date());
  proxima.setMonth(proxima.getMonth() + meses);
  const proximaIso = proxima.toISOString().slice(0, 10);
  const { data: doc, error: errDoc } = await sb
    .from('documentos')
    .insert({
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: v.trabajador_id,
      tipo: 'vigilancia_salud',
      nombre: `Resultado vigilancia de la salud — ${v.tipo} — ${fechaCorta(v.cita_fecha)}.pdf`,
      meta: `Servicio de prevención (Previs) · ${v.tipo}`,
      fecha: v.cita_fecha || new Date().toISOString().slice(0, 10),
      estado: 'disponible'
    })
    .select()
    .single();
  if (errDoc) {
    mostrarToast('Error al archivar el documento: ' + errDoc.message, false);
    return;
  }
  const { error } = await sb
    .from('vigilancia_salud')
    .update({ aptitud, estado: 'Realizada', proxima_fecha: proximaIso, documento_id: doc.id })
    .eq('id', vigResultadoContext.id);
  if (!error) {
    await sb.rpc('encolar_notificacion', {
      p_trabajador_id: v.trabajador_id,
      p_hotel_id: usuarioActual.hotel_id,
      p_tipo: 'vigilancia_resultado',
      p_titulo: '📄 Nuevo documento disponible en Mis Documentos',
      p_cuerpo: `El resultado de tu revisión de vigilancia de la salud (${v.tipo}) ya está disponible en "Mis Documentos".`,
      p_referencia_tabla: 'documentos',
      p_referencia_id: doc.id
    });
  }
  mostrarToast(error ? 'Error: ' + error.message : `Resultado guardado ✓ (${aptitud}) — documento disponible en Mis Documentos`, !error);
  cerrarModalVigResultado();
  await cargarVigilanciaAdmin();
}

// ---------- Formación PRL (admin) — circuito completo, réplica exacta del de arriba (migración 0068) ----------
let formacionPRLCache = [];
let prlCitaContext = null;
let prlResultadoContext = null;

async function cargarFormacionPRLAdmin() {
  const { data } = await sb.from('formacion_prl_seguimiento').select('*, personas_trabajadoras(nombre, puesto)').order('created_at', { ascending: false });
  formacionPRLCache = data || [];
  const realizadas = formacionPRLCache.filter((p) => p.estado === 'realizada').length;
  const pendientesFirma = formacionPRLCache.filter((p) => p.estado === 'firma_pendiente' && !p.firma_trabajador_en).length;
  const total = formacionPRLCache.length;
  const pct = total ? Math.round((realizadas / total) * 100) : 0;
  $('prlKpis').innerHTML = `
    <div class="card kpi"><div class="ic">⛑️</div><div><div class="t">Seguimientos activos</div><div class="v">${total}</div></div></div>
    <div class="card kpi"><div class="ic">✅</div><div><div class="t">Realizadas</div><div class="v">${realizadas}</div></div></div>
    <div class="card kpi"><div class="ic">✍️</div><div><div class="t">Pendientes de firma</div><div class="v">${pendientesFirma}</div></div></div>
    <div class="card kpi"><div class="ic">📊</div><div><div class="t">% Cumplimiento</div><div class="v">${pct}%</div></div></div>`;
  renderFormacionPRLMatriz();
}

function renderFormacionPRLMatriz() {
  const fEstado = $('prlFiltroEstado') ? $('prlFiltroEstado').value : '';
  const fTipo = $('prlFiltroTipo') ? $('prlFiltroTipo').value : '';
  const filtradas = formacionPRLCache.filter((p) => (!fEstado || p.estado === fEstado) && (!fTipo || p.tipo === fTipo));
  $('prlSeguimientoBody').innerHTML =
    filtradas
      .map((p) => `<tr>
          <td>${p.personas_trabajadoras ? p.personas_trabajadoras.nombre : '—'}</td>
          <td class="sub-c">${p.personas_trabajadoras ? p.personas_trabajadoras.puesto || '—' : '—'}</td>
          <td>${p.tipo}</td>
          <td>${badgeEstado(PRL_ESTADO_LABEL[p.estado] || p.estado)}</td>
          <td>${p.fecha_formacion ? fechaCorta(p.fecha_formacion) + (p.hora_formacion ? ' · ' + p.hora_formacion.slice(0, 5) : '') + (p.firma_trabajador_en ? ' ✍️' : '') : '—'}</td>
          <td>${_accionFormacionPRL(p)}</td>
        </tr>`)
      .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin registros con estos filtros — la propuesta se crea sola a los 15 días del alta de cada persona.</td></tr>';
}

async function exportarFormacionPRLCSV() {
  const { data, error } = await sb.from('formacion_prl_seguimiento').select('*, personas_trabajadoras(nombre, puesto)').order('created_at', { ascending: false });
  if (error) return mostrarToast('Error al exportar: ' + error.message, false);
  descargarCSV(
    'formacion_prl.csv',
    ['Persona trabajadora', 'Puesto', 'Tipo', 'Estado', 'Fecha formación', 'Resultado'],
    (data || []).map((p) => [p.personas_trabajadoras ? p.personas_trabajadoras.nombre : '—', p.personas_trabajadoras ? p.personas_trabajadoras.puesto || '—' : '—', p.tipo || '—', PRL_ESTADO_LABEL[p.estado] || p.estado || '—', p.fecha_formacion || '—', p.resultado || '—'])
  );
  await registrarAuditoria('Formación PRL', 'Matriz exportada a Excel', `${(data || []).length} registro(s)`);
}

const PRL_ESTADO_LABEL = {
  propuesta_pendiente: 'Propuesta pendiente',
  enviada_prevenlia: 'Enviada a Prevenlia',
  firma_pendiente: 'Firma pendiente',
  aprobada: 'Aprobada',
  realizada: 'Realizada'
};

function _accionFormacionPRL(p) {
  if (p.estado === 'propuesta_pendiente') return `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirEnviarSolicitudPrevenlia('${p.id}')">📨 Enviar solicitud a Prevenlia</button>`;
  if (p.estado === 'enviada_prevenlia') return `<button type="button" class="btn btn-sm" onclick="abrirModalPrlCita('${p.id}')">📅 Confirmar fecha (correo de Prevenlia)</button>`;
  if (p.estado === 'firma_pendiente' && !p.firma_trabajador_en) {
    let extra = '<span class="sub-c">⏳ Pendiente de firma de la persona trabajadora</span>';
    if (p.recordatorio_30min_enviado) extra += ' <span class="badge2 b-amber" style="font-size:9px;">🔔 Recordatorio +30min</span>';
    if (p.escalado_24h_enviado) extra += ' <span class="badge2 b-rose" style="font-size:9px;">⚠️ Sin firmar tras 24h</span>';
    return extra;
  }
  if (p.estado === 'firma_pendiente' && p.firma_trabajador_en) return `<button type="button" class="btn btn-sm" onclick="aprobarFechaFormacionPRL('${p.id}')">✅ Aprobar fecha y actualizar cuadrante</button>`;
  if (p.estado === 'aprobada' && !p.asistencia_confirmada_en) return `<button type="button" class="btn btn-secondary btn-sm" onclick="confirmarAsistenciaFormacionPRL('${p.id}')">✅ Confirmar asistencia</button>`;
  if (p.estado === 'aprobada' && p.asistencia_confirmada_en) return `<button type="button" class="btn btn-sm" onclick="abrirModalPrlResultado('${p.id}')">📧 Recibir certificado de Prevenlia</button>`;
  if (p.estado === 'realizada') {
    const cls = p.resultado === 'No superada — repetir formación' ? 'b-rose' : p.resultado === 'Formación superada con recomendaciones' ? 'b-amber' : 'b-emerald';
    return `<span class="badge2 ${cls}">${p.resultado || 'Formación superada'}</span><div class="sub-c" style="margin-top:2px;">Próxima: ${p.proxima_fecha ? fechaCorta(p.proxima_fecha) : '—'}</div>`;
  }
  return '<span class="sub-c">—</span>';
}

// "Enviar solicitud" (migración 0084): antes cambiaba el estado directamente, sin ninguna
// comprobación. Ahora abre una ventana de revisión para comprobar/añadir el correo (con copia por
// defecto al/a la responsable de la persona trabajadora) y un texto predeterminado editable, igual
// que el circuito ya existente de "✉️ Correo a empresa de formación".
let prlEnviarTarget = null;
async function abrirEnviarSolicitudPrevenlia(id) {
  const p = formacionPRLCache.find((x) => x.id === id);
  if (!p) return;
  prlEnviarTarget = id;
  const nombreTrabajador = p.personas_trabajadoras ? p.personas_trabajadoras.nombre : '—';
  $('prlEnviarId').value = id;
  $('prlEnviarPara').value = '';
  $('prlEnviarCC').value = '';
  $('prlEnviarAsunto').value = `Solicitud de formación PRL — ${nombreTrabajador}`;
  $('prlEnviarCuerpo').value = `Buenos días,\n\nSolicitamos programar la formación PRL (${p.tipo || 'formación'}) para la siguiente persona trabajadora:\n\nNombre: ${nombreTrabajador}\nPuesto: ${p.personas_trabajadoras ? p.personas_trabajadoras.puesto || '—' : '—'}\n\nQuedamos a la espera de fecha y hora propuestas.\n\nUn saludo,\nDepartamento de RR.HH.`;
  $('modalPrlEnviarSolicitud').classList.remove('hidden');
  if (p.trabajador_id) {
    const { data: ccJefe } = await sb.rpc('jefe_departamento_email_de', { p_trabajador_id: p.trabajador_id });
    if (prlEnviarTarget === id && ccJefe) $('prlEnviarCC').value = ccJefe;
  }
}
function cerrarEnviarSolicitudPrevenlia() {
  $('modalPrlEnviarSolicitud').classList.add('hidden');
  prlEnviarTarget = null;
}
async function confirmarEnviarSolicitudPrevenlia() {
  const id = $('prlEnviarId').value;
  const para = $('prlEnviarPara').value.trim();
  const cc = $('prlEnviarCC').value.trim();
  const asunto = $('prlEnviarAsunto').value.trim();
  const cuerpo = $('prlEnviarCuerpo').value.trim();
  if (!para) {
    mostrarToast('⚠️ Indica la dirección de correo de Prevenlia', false);
    return;
  }
  if (!asunto || !cuerpo) {
    mostrarToast('⚠️ Completa el asunto y el cuerpo del correo', false);
    return;
  }
  const { error: errorEnvio } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: para,
    p_asunto: asunto,
    p_cuerpo: cuerpo,
    p_cc_email: cc || null,
    p_referencia_tabla: 'formacion_prl_seguimiento',
    p_referencia_id: id
  });
  if (errorEnvio) {
    mostrarToast('Error al enviar: ' + errorEnvio.message, false);
    return;
  }
  const { error } = await sb.from('formacion_prl_seguimiento').update({ estado: 'enviada_prevenlia' }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : `Solicitud enviada a Prevenlia ✓ Para: ${para}${cc ? ' · CC: ' + cc : ''}`, !error);
  if (!error) {
    await registrarAuditoria('Formación PRL', 'Solicitud enviada a Prevenlia', `Para: ${para}${cc ? ' · CC: ' + cc : ''}`);
    cerrarEnviarSolicitudPrevenlia();
    await cargarFormacionPRLAdmin();
  }
}

function abrirModalPrlCita(id) {
  const p = formacionPRLCache.find((x) => x.id === id);
  prlCitaContext = { id };
  $('prlCitaNombre').textContent = p && p.personas_trabajadoras ? p.personas_trabajadoras.nombre : '—';
  $('prlCitaFecha').value = '';
  $('prlCitaHora').value = '';
  $('modalPrlCita').classList.remove('hidden');
}
function cerrarModalPrlCita() {
  $('modalPrlCita').classList.add('hidden');
  prlCitaContext = null;
}
async function guardarPrlCita() {
  if (!prlCitaContext) return;
  const fecha = $('prlCitaFecha').value;
  const hora = $('prlCitaHora').value;
  if (!fecha || !hora) {
    mostrarToast('Indica fecha y hora de la formación', false);
    return;
  }
  const p = formacionPRLCache.find((x) => x.id === prlCitaContext.id);
  const { error } = await sb
    .from('formacion_prl_seguimiento')
    .update({
      estado: 'firma_pendiente',
      fecha_formacion: fecha,
      hora_formacion: hora,
      fecha_confirmada_en: new Date().toISOString(),
      firma_trabajador_en: null,
      firma_trabajador_ref: null,
      aprobada_rrhh_en: null,
      cuadrante_actualizado: false,
      asistencia_confirmada_en: null,
      resultado: null,
      recordatorio_30min_enviado: false,
      escalado_24h_enviado: false
    })
    .eq('id', prlCitaContext.id);
  if (!error) await sb.rpc('encolar_notificacion', {
    p_trabajador_id: p?.trabajador_id,
    p_hotel_id: usuarioActual.hotel_id,
    p_tipo: 'formacion_prl_fecha_recibida',
    p_titulo: '⛑️ Fecha de formación PRL recibida — pendiente tu firma',
    p_cuerpo: `${fechaCorta(fecha)} a las ${hora} h. Fírmala desde tu ficha para confirmarla.`,
    p_referencia_tabla: 'formacion_prl_seguimiento',
    p_referencia_id: prlCitaContext.id
  });
  mostrarToast(error ? 'Error: ' + error.message : 'Fecha registrada ✓ pendiente de firma de la persona trabajadora', !error);
  cerrarModalPrlCita();
  await cargarFormacionPRLAdmin();
}

async function aprobarFechaFormacionPRL(id) {
  const { data, error } = await sb.rpc('formacion_prl_aprobar_fecha', { p_id: id });
  mostrarToast(error ? 'Error: ' + error.message : `Fecha aprobada ✓ ${data}`, !error);
  if (!error) await cargarFormacionPRLAdmin();
}

async function confirmarAsistenciaFormacionPRL(id) {
  const { error } = await sb.from('formacion_prl_seguimiento').update({ asistencia_confirmada_en: new Date().toISOString() }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Asistencia confirmada ✓ — a la espera del certificado de Prevenlia', !error);
  if (!error) await cargarFormacionPRLAdmin();
}

function abrirModalPrlResultado(id) {
  prlResultadoContext = { id };
  const p = formacionPRLCache.find((x) => x.id === id);
  $('prlResultadoNombre').textContent = p && p.personas_trabajadoras ? p.personas_trabajadoras.nombre : '—';
  $('prlResultadoValor').value = 'Formación superada';
  $('modalPrlResultado').classList.remove('hidden');
}
function cerrarModalPrlResultado() {
  $('modalPrlResultado').classList.add('hidden');
  prlResultadoContext = null;
}
async function guardarPrlResultado() {
  if (!prlResultadoContext) return;
  const p = formacionPRLCache.find((x) => x.id === prlResultadoContext.id);
  if (!p) return;
  const resultado = $('prlResultadoValor').value;
  const meses = p.tipo === 'Específica de puesto' ? 12 : 24;
  const proxima = new Date(p.fecha_formacion || new Date());
  proxima.setMonth(proxima.getMonth() + meses);
  const proximaIso = proxima.toISOString().slice(0, 10);
  const certificado = 'PREV-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const { data: doc, error: errDoc } = await sb
    .from('documentos')
    .insert({
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: p.trabajador_id,
      tipo: 'formacion_prl',
      nombre: `Certificado de formación PRL — ${p.tipo} — ${fechaCorta(p.fecha_formacion)}.pdf`,
      meta: `Prevenlia · ${p.tipo} · ${certificado}`,
      fecha: p.fecha_formacion || new Date().toISOString().slice(0, 10),
      estado: 'disponible'
    })
    .select()
    .single();
  if (errDoc) {
    mostrarToast('Error al archivar el documento: ' + errDoc.message, false);
    return;
  }
  const { error } = await sb
    .from('formacion_prl_seguimiento')
    .update({ resultado, estado: 'realizada', proxima_fecha: proximaIso, certificado_prevenlia: certificado, documento_id: doc.id })
    .eq('id', prlResultadoContext.id);
  if (!error) {
    await sb.rpc('encolar_notificacion', {
      p_trabajador_id: p.trabajador_id,
      p_hotel_id: usuarioActual.hotel_id,
      p_tipo: 'formacion_prl_resultado',
      p_titulo: '📄 Nuevo documento disponible en Mis Documentos',
      p_cuerpo: `El certificado de tu formación PRL (${p.tipo}) ya está disponible en "Mis Documentos".`,
      p_referencia_tabla: 'documentos',
      p_referencia_id: doc.id
    });
  }
  mostrarToast(error ? 'Error: ' + error.message : `Resultado guardado ✓ (${resultado}) — certificado disponible en Mis Documentos`, !error);
  cerrarModalPrlResultado();
  await cargarFormacionPRLAdmin();
}

// ---------- Coordinación Empresarial ----------
let empresasCache = [];
let centrosCache = [];

let coordPersonalCache = [];
async function cargarCoordinacionAdmin() {
  const [{ data: empresas }, { data: centros }] = await Promise.all([
    sb.from('empresas').select('*').order('nombre'),
    sb.from('centros_trabajo').select('*').order('nombre')
  ]);
  empresasCache = empresas || [];
  centrosCache = centros || [];
  // No se duplica el circuito: "Personas trabajadoras" ya es la fuente maestra (empleadosCache,
  // cargada por cargarEmpleados() antes que cargarCoordinacionAdmin() dentro de cargarTodo() —
  // ver el comentario en cargarTodo()), así que Coordinación Empresarial reutiliza esa misma
  // caché en vez de volver a pedir personas_trabajadoras con un select recortado.
  coordPersonalCache = empleadosCache;
  const centrosSinPersonal = centrosCache.filter((c) => !coordPersonalCache.some((p) => p.centro_trabajo_id === c.id)).length;

  $('coordKpis').innerHTML = `
    <div class="card kpi"><div class="ic">🏢</div><div><div class="t">Empresas</div><div class="v">${empresasCache.length}</div></div></div>
    <div class="card kpi"><div class="ic">📍</div><div><div class="t">Centros de trabajo</div><div class="v">${centrosCache.length}</div></div></div>
    <div class="card kpi"><div class="ic">👥</div><div><div class="t">Personas trabajadoras vinculadas</div><div class="v">${coordPersonalCache.filter((p) => p.centro_trabajo_id).length}</div></div></div>
    <div class="card kpi" style="cursor:pointer;"><div class="ic">⚠</div><div><div class="t">Centros sin personal asignado</div><div class="v">${centrosSinPersonal}</div></div></div>`;

  renderCoordEmpresasBody();
  await cargarCoordExportaciones();
}

function renderCoordEmpresasBody() {
  const q = ($('coordBuscador') ? $('coordBuscador').value : '').trim().toLowerCase();
  const filtradas = !q
    ? empresasCache
    : empresasCache.filter((e) => {
        const centrosDeEmpresa = centrosCache.filter((c) => c.empresa_id === e.id);
        return (
          e.nombre.toLowerCase().includes(q) ||
          (e.cif || '').toLowerCase().includes(q) ||
          (e.sector || '').toLowerCase().includes(q) ||
          centrosDeEmpresa.some((c) => c.nombre.toLowerCase().includes(q))
        );
      });
  $('coordEmpresasBody').innerHTML =
    filtradas
      .map((e) => {
        const centrosDeEmpresa = centrosCache.filter((c) => c.empresa_id === e.id);
        const idsCentros = centrosDeEmpresa.map((c) => c.id);
        const trabajadores = coordPersonalCache.filter((p) => idsCentros.includes(p.centro_trabajo_id)).length;
        const centrosSinPersonalEmpresa = centrosDeEmpresa.filter((c) => !coordPersonalCache.some((p) => p.centro_trabajo_id === c.id)).length;
        const alertas = centrosSinPersonalEmpresa + (centrosDeEmpresa.length === 0 ? 1 : 0);
        return `<tr>
          <td><b>${e.nombre}</b></td>
          <td>${e.cif || '—'}</td>
          <td>${e.sector || '—'}</td>
          <td>${centrosDeEmpresa.length}</td>
          <td>${trabajadores}</td>
          <td>${alertas > 0 ? `<span class="badge2 b-amber">⚠ ${alertas}</span>` : '<span class="badge2 b-emerald">✓ 0</span>'}</td>
          <td><span class="badge2 ${e.estado === 'activa' ? 'b-emerald' : 'b-slate'}">${e.estado}</span></td>
          <td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirFichaEmpresa('${e.id}')">🏢 Ver ficha</button></td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="8" class="sub-c" style="text-align:center;padding:14px;">Sin empresas que coincidan.</td></tr>';
}

// ---------- Ficha de empresa (pantalla completa) ----------
async function abrirFichaEmpresa(id) {
  showScreen('admin-empresa-ficha');
  await renderFichaEmpresa(id);
}
async function renderFichaEmpresa(id) {
  const e = empresasCache.find((x) => x.id === id);
  const el = $('fichaEmpresaContent');
  if (!e || !el) return;
  const [{ data: documentos }, { data: cumplimiento }, { data: auditorias }] = await Promise.all([
    sb.from('documentos_empresa').select('*').eq('empresa_id', id).order('created_at', { ascending: false }),
    sb.from('cumplimiento_empresa').select('*').eq('empresa_id', id).order('created_at', { ascending: false }),
    sb.from('auditorias_empresa').select('*').eq('empresa_id', id).order('fecha', { ascending: false })
  ]);
  const centrosDeEmpresa = centrosCache.filter((c) => c.empresa_id === e.id);
  const idsCentros = centrosDeEmpresa.map((c) => c.id);
  const trabajadores = coordPersonalCache.filter((p) => idsCentros.includes(p.centro_trabajo_id));

  el.innerHTML = `
    <div class="card card-pad" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;"><b style="font-size:16px;">${e.nombre}</b><p class="sub-c" style="margin:2px 0 0;">${e.sector || '—'}</p></div>
      <span class="code-hl" style="font-size:13px;">${e.cif || '—'}</span>
      <span class="badge2 ${e.estado === 'activa' ? 'b-emerald' : 'b-slate'}">${e.estado}</span>
      <button type="button" class="btn btn-secondary btn-sm" onclick="exportarExpedienteEmpresa('${e.id}')">📦 Exportar expediente completo (Excel)</button>
    </div>

    <div class="grid g2" style="align-items:start;margin-top:16px;">
      <div class="card card-pad">
        <div class="aprob-section-title" style="padding:0 0 10px;border-bottom:none;">🏢 Datos generales</div>
        <form onsubmit="guardarDatosGeneralesEmpresa(event,'${e.id}')" class="grid g2" style="gap:10px;">
          <div><label style="margin-bottom:4px;">Forma jurídica</label><input type="text" id="edFormaJuridica_${e.id}" value="${e.forma_juridica || ''}"></div>
          <div><label style="margin-bottom:4px;">Fecha de constitución</label><input type="date" id="edFechaConstitucion_${e.id}" value="${e.fecha_constitucion || ''}"></div>
          <div><label style="margin-bottom:4px;">CNAE</label><input type="text" id="edCnae_${e.id}" value="${e.cnae || ''}"></div>
          <div><label style="margin-bottom:4px;">Actividad principal</label><input type="text" id="edActividad_${e.id}" value="${e.actividad_principal || ''}"></div>
          <div><label style="margin-bottom:4px;">Convenio colectivo aplicable</label><input type="text" id="edConvenio_${e.id}" value="${e.convenio_colectivo || ''}"></div>
          <div><label style="margin-bottom:4px;">Domicilio social</label><input type="text" id="edDomicilio_${e.id}" value="${e.domicilio_social || ''}"></div>
          <div><label style="margin-bottom:4px;">C.P. / Municipio / Provincia</label>
            <div style="display:flex;gap:6px;">
              <input type="text" id="edCp_${e.id}" value="${e.cp || ''}" placeholder="C.P." style="width:70px;">
              <input type="text" id="edMunicipio_${e.id}" value="${e.municipio || ''}" placeholder="Municipio">
              <input type="text" id="edProvincia_${e.id}" value="${e.provincia || ''}" placeholder="Provincia">
            </div>
          </div>
          <div><label style="margin-bottom:4px;">Teléfono / Email</label>
            <div style="display:flex;gap:6px;">
              <input type="text" id="edTelefono_${e.id}" value="${e.telefono || ''}" placeholder="Teléfono">
              <input type="email" id="edEmailGeneral_${e.id}" value="${e.email || ''}" placeholder="Email">
            </div>
          </div>
          <div style="grid-column:1/-1;"><button type="submit" class="btn btn-sm">💾 Guardar datos generales</button></div>
        </form>
      </div>
      <div class="card card-pad">
        <div class="aprob-section-title" style="padding:0 0 10px;border-bottom:none;">🧑‍💼 Organización · Responsables</div>
        <form onsubmit="guardarResponsablesEmpresa(event,'${e.id}')" class="grid g2" style="gap:10px;">
          <div><label style="margin-bottom:4px;">Administrador</label><input type="text" id="erAdministrador_${e.id}" value="${e.responsable_administrador || ''}"></div>
          <div><label style="margin-bottom:4px;">Dirección General</label><input type="text" id="erDireccion_${e.id}" value="${e.responsable_direccion_general || ''}"></div>
          <div><label style="margin-bottom:4px;">Responsable de RR.HH.</label><input type="text" id="erRrhh_${e.id}" value="${e.responsable_rrhh || ''}"></div>
          <div><label style="margin-bottom:4px;">Responsable financiero</label><input type="text" id="erFinanciero_${e.id}" value="${e.responsable_financiero || ''}"></div>
          <div><label style="margin-bottom:4px;">Responsable de prevención</label><input type="text" id="erPrevencion_${e.id}" value="${e.responsable_prevencion || ''}"></div>
          <div><label style="margin-bottom:4px;">Responsable de protección de datos</label><input type="text" id="erProteccionDatos_${e.id}" value="${e.responsable_proteccion_datos || ''}"></div>
          <div style="grid-column:1/-1;"><label style="margin-bottom:4px;">Responsable de coordinación empresarial</label><input type="text" id="erCoordinacion_${e.id}" value="${e.responsable_coordinacion || ''}"></div>
          <div style="grid-column:1/-1;"><button type="submit" class="btn btn-sm">💾 Guardar organización</button></div>
        </form>
      </div>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="aprob-section-title" style="padding:0 0 10px;border-bottom:none;">📧 Contactos de Accidentes de Trabajo y PRL</div>
      <p class="sub-c" style="margin:0 0 10px;">Direcciones reales a las que se envían el Parte de Accidente de Trabajo (Mutua), la comunicación urgente de 24 h (Autoridad Laboral) y el Informe de Investigación (Comité de Seguridad y Salud).</p>
      <form onsubmit="guardarContactosEmpresa(event,'${e.id}')" class="grid g2" style="gap:10px;">
        <div><label style="margin-bottom:4px;">Mutua colaboradora</label><input type="text" id="ecMutua_${e.id}" value="${e.email_mutua || ''}" placeholder="partes.accidente@mutua.es"></div>
        <div><label style="margin-bottom:4px;">Autoridad Laboral</label><input type="text" id="ecAutoridad_${e.id}" value="${e.email_autoridad_laboral || ''}" placeholder="accidentes.trabajo@caib.es"></div>
        <div><label style="margin-bottom:4px;">Comité de Seguridad y Salud</label><input type="text" id="ecComite_${e.id}" value="${e.email_comite_seguridad_salud || ''}" placeholder="comite.seguridadsalud@empresa.es"></div>
        <div><label style="margin-bottom:4px;">Servicio de Prevención (PRL)</label><input type="text" id="ecPrl_${e.id}" value="${e.email_servicio_prl || ''}" placeholder="prevencion@empresa.es"></div>
        <div style="grid-column:1/-1;"><button type="submit" class="btn btn-sm">💾 Guardar contactos</button></div>
      </form>
    </div>

    <div class="card card-pad" style="margin-top:16px;">
      <div class="aprob-section-title" style="padding:0 0 10px;border-bottom:none;">✉️ Comunicación de coordinación empresarial</div>
      <p class="sub-c" style="margin:0 0 10px;">Envío real de una comunicación puntual a esta empresa (CAE, documentación requerida, aviso, etc.), con copia automática a RR.HH. — equivalente al circuito C15 del prototipo.</p>
      <form onsubmit="enviarComunicacionEmpresa(event,'${e.id}')" class="grid g2" style="gap:10px;">
        <div><label style="margin-bottom:4px;">Destinatario</label><input type="text" id="comDestinatario_${e.id}" placeholder="contacto@empresa.es" required></div>
        <div><label style="margin-bottom:4px;">Categoría / asunto</label><input type="text" id="comCategoria_${e.id}" placeholder="p. ej. Documentación CAE requerida" required></div>
        <div style="grid-column:1/-1;"><label style="margin-bottom:4px;">Mensaje</label><textarea id="comCuerpo_${e.id}" rows="3" placeholder="Detalle de la comunicación..."></textarea></div>
        <div style="grid-column:1/-1;"><button type="submit" class="btn btn-sm">📧 Enviar comunicación</button></div>
      </form>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="aprob-section-title">📍 Centros de trabajo (${centrosDeEmpresa.length})</div>
      <table><thead><tr><th>Centro</th><th>Dirección</th><th>Personas trabajadoras</th></tr></thead>
      <tbody>${
        centrosDeEmpresa
          .map((c) => `<tr><td><b>${c.nombre}</b></td><td class="sub-c">${c.direccion || '—'}</td><td>${coordPersonalCache.filter((p) => p.centro_trabajo_id === c.id).length}</td></tr>`)
          .join('') || '<tr><td colspan="3" class="sub-c" style="text-align:center;padding:14px;">Sin centros de trabajo registrados.</td></tr>'
      }</tbody></table>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="aprob-section-title">👥 Personas trabajadoras (${trabajadores.length})</div>
      <table><thead><tr><th>Código</th><th>Nombre</th><th>Puesto</th><th>Centro</th><th>Estado</th><th></th></tr></thead>
      <tbody>${
        trabajadores
          .map((t) => `<tr><td>${t.codigo || '—'}</td><td><b>${t.nombre}</b></td><td>${t.puesto || '—'}</td><td class="sub-c">${(centrosCache.find((c) => c.id === t.centro_trabajo_id) || {}).nombre || '—'}</td><td>${badgeEstado(t.estado_laboral || 'Activo')}</td><td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirFichaEmpleado('${t.id}')">Ver ficha →</button></td></tr>`)
          .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin personas trabajadoras vinculadas todavía.</td></tr>'
      }</tbody></table>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="aprob-section-title">📄 Documentación de la empresa</div>
      <p class="sub-c" style="margin:8px 10px 0;">Cualquier archivo (CAE, seguros, certificados, CV, fotos, enlaces...) se puede adjuntar al registrar el documento.</p>
      <table><thead><tr><th>Documento</th><th>Categoría</th><th>Emisión</th><th>Caducidad</th><th>Estado</th><th>Responsable</th></tr></thead>
      <tbody>${
        (documentos || [])
          .map((d) => `<tr><td>${d.nombre}${d.adjunto_url ? `<br><a href="#" data-ver-adjunto-empresa="${d.adjunto_url}" style="font-size:11px;">📎 Ver adjunto</a>` : ''}</td><td class="sub-c">${d.categoria}</td><td>${d.fecha_emision ? fechaCorta(d.fecha_emision) : '—'}</td><td>${d.fecha_caducidad ? fechaCorta(d.fecha_caducidad) : '—'}</td><td>${badgeEstado(d.estado)}</td><td class="sub-c">${d.responsable || '—'}</td></tr>`)
          .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin documentos registrados.</td></tr>'
      }</tbody></table>
      <form onsubmit="guardarDocumentoEmpresa(event,'${e.id}')" style="padding:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <input type="text" id="deNombre_${e.id}" placeholder="Nombre del documento" required style="margin:0;flex:1;min-width:160px;">
        <select id="deCategoria_${e.id}" style="margin:0;"><option value="corporativa">Corporativa</option><option value="cae">CAE</option><option value="seguros">Seguros</option><option value="certificados">Certificados</option><option value="otros">Otros</option></select>
        <input type="date" id="deFechaCaducidad_${e.id}" title="Fecha de caducidad" style="margin:0;">
        <input type="file" id="deArchivo_${e.id}" title="Archivo adjunto (CV, imagen, PDF, etc. — opcional)" style="margin:0;">
        <button type="submit" class="btn btn-sm">+ Añadir documento</button>
      </form>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="aprob-section-title">☑️ Cumplimiento de obligaciones</div>
      <table><thead><tr><th>Obligación</th><th>Estado</th><th>Fecha</th><th>Observaciones</th></tr></thead>
      <tbody>${
        (cumplimiento || [])
          .map((c) => `<tr><td>${c.item}</td><td>${badgeEstado(c.estado)}</td><td>${c.fecha ? fechaCorta(c.fecha) : '—'}</td><td class="sub-c">${c.observaciones || '—'}</td></tr>`)
          .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin obligaciones registradas.</td></tr>'
      }</tbody></table>
      <form onsubmit="guardarCumplimientoEmpresa(event,'${e.id}')" style="padding:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <input type="text" id="ceItem_${e.id}" placeholder="Obligación / ítem" required style="margin:0;flex:1;min-width:160px;">
        <select id="ceEstado_${e.id}" style="margin:0;"><option value="pendiente">Pendiente</option><option value="cumplido">Cumplido</option><option value="no_aplica">No aplica</option></select>
        <button type="submit" class="btn btn-sm">+ Añadir obligación</button>
      </form>
    </div>

    <div class="card" style="margin-top:16px;">
      <div class="aprob-section-title">🔍 Auditorías — realizadas y programadas</div>
      <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Estado</th><th>Resultado</th><th>Observaciones</th><th></th></tr></thead>
      <tbody>${
        (auditorias || [])
          .map(
            (a) =>
              `<tr><td>${fechaCorta(a.fecha)}</td><td>${a.tipo}</td><td><span class="badge2 ${a.estado === 'realizada' ? 'b-emerald' : a.estado === 'cancelada' ? 'b-slate' : 'b-amber'}">${a.estado || 'programada'}</span></td><td class="sub-c">${a.resultado || '—'}</td><td class="sub-c">${a.observaciones || '—'}</td><td>${
                a.estado === 'programada' ? `<button type="button" class="btn btn-secondary btn-sm" onclick="marcarAuditoriaRealizada('${a.id}','${e.id}')">✓ Marcar realizada</button>` : ''
              }</td></tr>`
          )
          .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin auditorías registradas.</td></tr>'
      }</tbody></table>
      <form onsubmit="guardarAuditoriaEmpresa(event,'${e.id}')" style="padding:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
        <input type="text" id="aeTipo_${e.id}" placeholder="Tipo de auditoría" required style="margin:0;flex:1;min-width:160px;">
        <input type="date" id="aeFecha_${e.id}" title="Fecha (futura = se programa; hoy o pasada = se registra como realizada)" style="margin:0;">
        <button type="submit" class="btn btn-sm">+ Nueva / programar auditoría</button>
      </form>
    </div>
  `;
  el.querySelectorAll('[data-ver-adjunto-empresa]').forEach((a) =>
    a.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const { data: signed, error } = await sb.storage.from('formularios-adjuntos').createSignedUrl(a.dataset.verAdjuntoEmpresa, 3600);
      if (error) { mostrarToast('No se pudo abrir el adjunto: ' + error.message, false); return; }
      window.open(signed.signedUrl, '_blank');
    })
  );
}
async function guardarContactosEmpresa(e, empresaId) {
  e.preventDefault();
  const payload = {
    email_mutua: $('ecMutua_' + empresaId).value.trim() || null,
    email_autoridad_laboral: $('ecAutoridad_' + empresaId).value.trim() || null,
    email_comite_seguridad_salud: $('ecComite_' + empresaId).value.trim() || null,
    email_servicio_prl: $('ecPrl_' + empresaId).value.trim() || null
  };
  const { error } = await sb.from('empresas').update(payload).eq('id', empresaId);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Contactos guardados ✓', !error);
  if (!error) {
    await registrarAuditoria('Coordinación Empresarial', 'Contactos de Accidentes/PRL actualizados', empresaId);
    await cargarCoordinacionAdmin();
    await renderFichaEmpresa(empresaId);
  }
}
// Tarjeta "🏢 Datos generales" del prototipo (EMPRESAS[].formaJuridica/fechaConstitucion/cnae/
// actividad/convenio/domicilio/cp/municipio/provincia/telefono/email — migración 0077).
async function guardarDatosGeneralesEmpresa(e, empresaId) {
  e.preventDefault();
  const payload = {
    forma_juridica: $('edFormaJuridica_' + empresaId).value.trim() || null,
    fecha_constitucion: $('edFechaConstitucion_' + empresaId).value || null,
    cnae: $('edCnae_' + empresaId).value.trim() || null,
    actividad_principal: $('edActividad_' + empresaId).value.trim() || null,
    convenio_colectivo: $('edConvenio_' + empresaId).value.trim() || null,
    domicilio_social: $('edDomicilio_' + empresaId).value.trim() || null,
    cp: $('edCp_' + empresaId).value.trim() || null,
    municipio: $('edMunicipio_' + empresaId).value.trim() || null,
    provincia: $('edProvincia_' + empresaId).value.trim() || null,
    telefono: $('edTelefono_' + empresaId).value.trim() || null,
    email: $('edEmailGeneral_' + empresaId).value.trim() || null
  };
  const { error } = await sb.from('empresas').update(payload).eq('id', empresaId);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Datos generales guardados ✓', !error);
  if (!error) {
    await registrarAuditoria('Coordinación Empresarial', 'Datos generales de la empresa actualizados', empresaId);
    await cargarCoordinacionAdmin();
    await renderFichaEmpresa(empresaId);
  }
}
// Tarjeta "🧑‍💼 Organización · Responsables" del prototipo (EMPRESAS[].responsables — migración 0077).
async function guardarResponsablesEmpresa(e, empresaId) {
  e.preventDefault();
  const payload = {
    responsable_administrador: $('erAdministrador_' + empresaId).value.trim() || null,
    responsable_direccion_general: $('erDireccion_' + empresaId).value.trim() || null,
    responsable_rrhh: $('erRrhh_' + empresaId).value.trim() || null,
    responsable_financiero: $('erFinanciero_' + empresaId).value.trim() || null,
    responsable_prevencion: $('erPrevencion_' + empresaId).value.trim() || null,
    responsable_proteccion_datos: $('erProteccionDatos_' + empresaId).value.trim() || null,
    responsable_coordinacion: $('erCoordinacion_' + empresaId).value.trim() || null
  };
  const { error } = await sb.from('empresas').update(payload).eq('id', empresaId);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Organización y responsables guardados ✓', !error);
  if (!error) {
    await registrarAuditoria('Coordinación Empresarial', 'Organización/Responsables de la empresa actualizados', empresaId);
    await cargarCoordinacionAdmin();
    await renderFichaEmpresa(empresaId);
  }
}
// ---- C15 del prototipo — comunicación puntual de coordinación empresarial, con CC real a
// RR.HH. (migración 0072: enviar_correo_externo) ----
async function enviarComunicacionEmpresa(e, empresaId) {
  e.preventDefault();
  const empresa = empresasCache.find((x) => x.id === empresaId);
  const destinatario = $('comDestinatario_' + empresaId).value.trim();
  const categoria = $('comCategoria_' + empresaId).value.trim();
  const cuerpoExtra = $('comCuerpo_' + empresaId).value.trim();
  if (!empresa || !destinatario || !categoria) {
    mostrarToast('⚠️ Indica destinatario y categoría/asunto', false);
    return;
  }
  const { data: cc } = await sb.rpc('rrhh_emails_hotel');
  const cuerpo = `Comunicación de ${categoria} correspondiente a ${empresa.nombre}.\n\nEmpresa: ${empresa.nombre}${empresa.cif ? '\nCIF: ' + empresa.cif : ''}\n\n${cuerpoExtra || 'Saludos.'}`;
  const { error } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: destinatario,
    p_cc_email: cc || null,
    p_asunto: `${categoria} — ${empresa.nombre}`,
    p_cuerpo: cuerpo,
    p_referencia_tabla: 'empresas',
    p_referencia_id: empresaId
  });
  mostrarToast(error ? 'Error al enviar: ' + error.message : `Comunicación enviada ✓ Para: ${destinatario}${cc ? ' · CC: ' + cc : ''}`, !error);
  if (!error) {
    await registrarAuditoria('Coordinación Empresarial', `Comunicación enviada — ${categoria}`, `${empresa.nombre} → ${destinatario}`);
    await renderFichaEmpresa(empresaId);
  }
}
// Antes no existía ningún campo de archivo adjunto para la documentación de la empresa (César:
// "confírmame que todos los archivos que se tienen que adjuntar se puedan adjuntar... no quiero que
// pase lo mismo que con el otro módulo de los mensajes, que no puedes adjuntar ni enlace, ni CV, ni
// imágenes, ni fotos, ni nada"). Reutiliza el bucket formularios-adjuntos, con la carpeta por hotel
// (política de INSERT añadida en la migración 0085).
async function guardarDocumentoEmpresa(e, empresaId) {
  e.preventDefault();
  const nombre = $('deNombre_' + empresaId).value.trim();
  if (!nombre) return;
  const archivo = $('deArchivo_' + empresaId) ? $('deArchivo_' + empresaId).files[0] : null;
  let adjuntoUrl = null;
  if (archivo) {
    const ruta = `${usuarioActual.hotel_id}/empresa/${empresaId}/${Date.now()}-${archivo.name}`;
    const { error: errorSubida } = await sb.storage.from('formularios-adjuntos').upload(ruta, archivo);
    if (errorSubida) {
      mostrarToast('Error al subir el archivo: ' + errorSubida.message, false);
      return;
    }
    adjuntoUrl = ruta;
  }
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    empresa_id: empresaId,
    nombre,
    categoria: $('deCategoria_' + empresaId).value,
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_caducidad: $('deFechaCaducidad_' + empresaId).value || null,
    adjunto_url: adjuntoUrl
  };
  const { error } = await sb.from('documentos_empresa').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Documento añadido ✓', !error);
  if (!error) {
    await registrarAuditoria('Coordinación Empresarial', 'Documento de empresa añadido', nombre);
    await renderFichaEmpresa(empresaId);
  }
}
async function guardarCumplimientoEmpresa(e, empresaId) {
  e.preventDefault();
  const item = $('ceItem_' + empresaId).value.trim();
  if (!item) return;
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    empresa_id: empresaId,
    item,
    estado: $('ceEstado_' + empresaId).value,
    fecha: new Date().toISOString().slice(0, 10)
  };
  const { error } = await sb.from('cumplimiento_empresa').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Obligación añadida ✓', !error);
  if (!error) {
    await registrarAuditoria('Coordinación Empresarial', 'Obligación de cumplimiento añadida', item);
    await renderFichaEmpresa(empresaId);
  }
}
async function guardarAuditoriaEmpresa(e, empresaId) {
  e.preventDefault();
  const tipo = $('aeTipo_' + empresaId).value.trim();
  if (!tipo) return;
  const fecha = $('aeFecha_' + empresaId).value || new Date().toISOString().slice(0, 10);
  const hoy = new Date().toISOString().slice(0, 10);
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    empresa_id: empresaId,
    tipo,
    fecha,
    estado: fecha > hoy ? 'programada' : 'realizada'
  };
  const { error } = await sb.from('auditorias_empresa').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : (payload.estado === 'programada' ? 'Auditoría programada ✓' : 'Auditoría registrada ✓'), !error);
  if (!error) {
    await registrarAuditoria('Coordinación Empresarial', payload.estado === 'programada' ? 'Auditoría de empresa programada' : 'Auditoría de empresa registrada', tipo);
    await renderFichaEmpresa(empresaId);
  }
}
async function marcarAuditoriaRealizada(id, empresaId) {
  const { error } = await sb.from('auditorias_empresa').update({ estado: 'realizada' }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Auditoría marcada como realizada ✓', !error);
  if (!error) {
    await registrarAuditoria('Coordinación Empresarial', 'Auditoría programada marcada como realizada', id);
    await renderFichaEmpresa(empresaId);
  }
}

// ---------- Exportar expediente completo de una empresa (multi-hoja: Empresa, Trabajadores,
// Documentos, Cumplimiento, Auditorías, Formación PRL, Vigilancia de la Salud) ----------
async function exportarExpedienteEmpresa(empresaId) {
  if (typeof XLSX === 'undefined') { mostrarToast('No se ha podido cargar el motor de Excel (xlsx.min.js)', false); return; }
  const e = empresasCache.find((x) => x.id === empresaId);
  if (!e) return;
  const centrosDeEmpresa = centrosCache.filter((c) => c.empresa_id === empresaId);
  const idsCentros = centrosDeEmpresa.map((c) => c.id);

  const [{ data: trabajadores }, { data: documentos }, { data: cumplimiento }, { data: auditorias }] = await Promise.all([
    sb.from('personas_trabajadoras').select('*').in('centro_trabajo_id', idsCentros.length ? idsCentros : ['00000000-0000-0000-0000-000000000000']),
    sb.from('documentos_empresa').select('*').eq('empresa_id', empresaId),
    sb.from('cumplimiento_empresa').select('*').eq('empresa_id', empresaId),
    sb.from('auditorias_empresa').select('*').eq('empresa_id', empresaId)
  ]);
  const idsTrabajadores = (trabajadores || []).map((t) => t.id);
  const formacionPrl = idsTrabajadores.length ? formacionPRLCache.filter((f) => idsTrabajadores.includes(f.trabajador_id)) : [];
  const vigilancia = idsTrabajadores.length ? vigilanciaCache.filter((v) => idsTrabajadores.includes(v.trabajador_id)) : [];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Empresa', 'CIF', 'Sector', 'Estado', 'Centros de trabajo', 'Personas trabajadoras'],
    [e.nombre, e.cif || '—', e.sector || '—', e.estado, centrosDeEmpresa.length, (trabajadores || []).length],
    [],
    ['Forma jurídica', 'Fecha constitución', 'CNAE', 'Actividad principal', 'Convenio colectivo', 'Domicilio social', 'Teléfono', 'Email'],
    [e.forma_juridica || '—', e.fecha_constitucion || '—', e.cnae || '—', e.actividad_principal || '—', e.convenio_colectivo || '—', [e.domicilio_social, e.cp, e.municipio, e.provincia].filter(Boolean).join(', ') || '—', e.telefono || '—', e.email || '—'],
    [],
    ['Administrador', 'Dirección General', 'Resp. RR.HH.', 'Resp. financiero', 'Resp. prevención', 'Resp. protección datos', 'Resp. coordinación'],
    [e.responsable_administrador || '—', e.responsable_direccion_general || '—', e.responsable_rrhh || '—', e.responsable_financiero || '—', e.responsable_prevencion || '—', e.responsable_proteccion_datos || '—', e.responsable_coordinacion || '—']
  ]), 'EMPRESA');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Nombre', 'Código', 'Centro', 'Puesto', 'Departamento', 'Estado laboral', 'Fecha incorporación', 'Email'],
    ...(trabajadores || []).map((t) => [t.nombre, t.codigo || '—', (centrosCache.find((c) => c.id === t.centro_trabajo_id) || {}).nombre || '—', t.puesto || '—', t.departamento || '—', t.estado_laboral || '—', t.fecha_incorporacion || '—', t.email || '—'])
  ]), 'TRABAJADORES');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Documento', 'Categoría', 'Fecha emisión', 'Fecha caducidad', 'Estado', 'Responsable'],
    ...(documentos || []).map((d) => [d.nombre, d.categoria, d.fecha_emision || '—', d.fecha_caducidad || '—', d.estado, d.responsable || '—'])
  ]), 'DOCUMENTOS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Obligación', 'Estado', 'Fecha', 'Observaciones'],
    ...(cumplimiento || []).map((c) => [c.item, c.estado, c.fecha || '—', c.observaciones || '—'])
  ]), 'CUMPLIMIENTO');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Fecha', 'Tipo', 'Estado', 'Resultado', 'Observaciones'],
    ...(auditorias || []).map((a) => [a.fecha, a.tipo, a.estado || '—', a.resultado || '—', a.observaciones || '—'])
  ]), 'AUDITORIAS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Persona trabajadora', 'Fecha propuesta', 'Estado', 'Certificado Prevenlia'],
    ...formacionPrl.map((f) => [(f.personas_trabajadoras || {}).nombre || idsTrabajadores.find((id) => id === f.trabajador_id) || '—', f.fecha_propuesta || '—', f.estado || '—', f.certificado_prevenlia || '—'])
  ]), 'FORMACION_PRL');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Persona trabajadora', 'Tipo', 'Próxima fecha', 'Resultado'],
    ...vigilancia.map((v) => [(v.personas_trabajadoras || {}).nombre || '—', v.tipo || '—', v.proxima_fecha || '—', v.resultado || v.estado || '—'])
  ]), 'VIGILANCIA_SALUD');

  XLSX.writeFile(wb, `Expediente_${e.nombre.replace(/[^a-z0-9]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  await registrarAuditoria('Coordinación Empresarial', 'Exportación de expediente completo', e.nombre);
  mostrarToast('Expediente exportado ✓', true);
}

async function cargarCoordExportaciones() {
  const { data } = await sb.from('auditoria_log').select('*').eq('modulo', 'Coordinación Empresarial').order('created_at', { ascending: false }).limit(20);
  $('coordExportacionesBody').innerHTML =
    (data || [])
      .map((a) => {
        const partes = (a.detalle || a.accion || '').split(' · motivo: ');
        const datos = partes[0] || '—';
        const motivoYId = (partes[1] || '').split(' · id: ');
        return `<tr><td>${fechaHoraCorta(a.created_at)}</td><td>${a.actor || '—'}</td><td>Todas las empresas</td><td>${datos}</td><td>${motivoYId[0] || '—'}</td><td class="sub-c">${motivoYId[1] || '—'}</td></tr>`;
      })
      .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Todavía no se ha realizado ninguna exportación.</td></tr>';
}

async function exportarCoordinacionCSV() {
  const motivo = ($('coordExportMotivo') ? $('coordExportMotivo').value.trim() : '') || 'No especificado';
  const idExportacion = 'EXP-' + Date.now().toString(36).toUpperCase();
  descargarCSV(
    'coordinacion_empresarial.csv',
    ['Empresa', 'CIF', 'Sector', 'Centros', 'Personas trabajadoras', 'Estado'],
    empresasCache.map((e) => {
      const centrosDeEmpresa = centrosCache.filter((c) => c.empresa_id === e.id);
      const idsCentros = centrosDeEmpresa.map((c) => c.id);
      const trabajadores = coordPersonalCache.filter((p) => idsCentros.includes(p.centro_trabajo_id)).length;
      return [e.nombre, e.cif || '—', e.sector || '—', centrosDeEmpresa.length, trabajadores, e.estado];
    })
  );
  await registrarAuditoria('Coordinación Empresarial', 'Exportación a Excel/CSV', `${empresasCache.length} empresa(s) exportadas · motivo: ${motivo} · id: ${idExportacion}`);
  if ($('coordExportMotivo')) $('coordExportMotivo').value = '';
  await cargarCoordExportaciones();
}

// ---------- Importar información (documentos de empresa desde Excel) ----------
function abrirModalImportarCoordinacion() {
  $('importCoordEmpresaId').innerHTML = empresasCache.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join('') || '<option value="">Crea una empresa primero</option>';
  $('importCoordArchivo').value = '';
  $('importCoordResultado').textContent = '';
  $('modalImportarCoordinacion').classList.remove('hidden');
}
function cerrarModalImportarCoordinacion() {
  $('modalImportarCoordinacion').classList.add('hidden');
}
async function confirmarImportarCoordinacion() {
  const empresaId = $('importCoordEmpresaId').value;
  const file = $('importCoordArchivo').files[0];
  const resultEl = $('importCoordResultado');
  if (!empresaId) return (resultEl.textContent = 'Selecciona primero una empresa destino.');
  if (!file) return (resultEl.textContent = 'Selecciona un archivo .xlsx.');
  if (typeof XLSX === 'undefined') return (resultEl.textContent = 'No se ha podido cargar el motor de Excel (xlsx.min.js).');
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
    if (!filas.length) {
      resultEl.textContent = 'El archivo no contiene filas de datos.';
      return;
    }
    const payloads = filas
      .filter((f) => f.nombre)
      .map((f) => ({
        hotel_id: usuarioActual.hotel_id,
        empresa_id: empresaId,
        nombre: String(f.nombre),
        categoria: f.categoria ? String(f.categoria).toLowerCase() : 'corporativa',
        fecha_caducidad: f.fecha_caducidad ? String(f.fecha_caducidad) : null,
        fecha_emision: new Date().toISOString().slice(0, 10)
      }));
    if (!payloads.length) {
      resultEl.textContent = 'Ninguna fila tiene la columna "nombre" rellenada.';
      return;
    }
    const { error } = await sb.from('documentos_empresa').insert(payloads);
    if (error) {
      resultEl.textContent = 'Error al importar: ' + error.message;
      return;
    }
    mostrarToast(`${payloads.length} documento(s) importado(s) ✓`, true);
    await registrarAuditoria('Coordinación Empresarial', 'Importación de documentos desde Excel', `${payloads.length} documento(s)`);
    cerrarModalImportarCoordinacion();
    if ($('screen-admin-empresa-ficha').classList.contains('active')) await renderFichaEmpresa(empresaId);
  } catch (err) {
    resultEl.textContent = 'No se ha podido leer el archivo: ' + err.message;
  }
}

// ---------- Importar empresas y centros de trabajo vinculados (carga masiva) ----------
function abrirModalImportarEmpresasCentros() {
  $('importEmpresasCentrosArchivo').value = '';
  $('importEmpresasCentrosResultado').innerHTML = '';
  $('modalImportarEmpresasCentros').classList.remove('hidden');
}
function cerrarModalImportarEmpresasCentros() {
  $('modalImportarEmpresasCentros').classList.add('hidden');
}
async function confirmarImportarEmpresasCentros() {
  const file = $('importEmpresasCentrosArchivo').files[0];
  const resultEl = $('importEmpresasCentrosResultado');
  if (!file) { resultEl.textContent = 'Selecciona un archivo .xlsx o .csv.'; return; }
  if (typeof XLSX === 'undefined') { resultEl.textContent = 'No se ha podido cargar el motor de Excel (xlsx.min.js).'; return; }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const filasObj = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' });
    const filasDatos = filasObj.slice(1).filter((f) => f && f.some((c) => String(c ?? '').trim() !== ''));
    if (!filasDatos.length) { resultEl.textContent = 'El archivo no contiene filas de datos bajo la cabecera.'; return; }

    const errores = [];
    let empresasCreadas = 0;
    let centrosCreados = 0;
    let trabajadoresEnlazados = 0;

    for (let idx = 0; idx < filasDatos.length; idx++) {
      const campos = filasDatos[idx];
      const nFila = idx + 2;
      const nombreEmpresa = String(campos[0] ?? '').trim();
      const cif = String(campos[1] ?? '').trim() || null;
      const sector = String(campos[2] ?? '').trim() || null;
      const nombreCentro = String(campos[3] ?? '').trim();
      const direccion = String(campos[4] ?? '').trim() || null;
      if (!nombreEmpresa || !nombreCentro) {
        errores.push(`Fila ${nFila}: descartada — falta Empresa o Centro.`);
        continue;
      }

      let empresa = empresasCache.find((e) => (cif && e.cif === cif) || (!cif && e.nombre.toLowerCase() === nombreEmpresa.toLowerCase()));
      if (!empresa) {
        const { data, error } = await sb
          .from('empresas')
          .insert({ hotel_id: usuarioActual.hotel_id, nombre: nombreEmpresa, cif, sector, estado: 'activa' })
          .select()
          .single();
        if (error) { errores.push(`Fila ${nFila}: error al crear la empresa — ${error.message}`); continue; }
        empresa = data;
        empresasCache.push(empresa);
        empresasCreadas++;
      }

      let centro = centrosCache.find((c) => c.empresa_id === empresa.id && c.nombre.toLowerCase() === nombreCentro.toLowerCase());
      if (!centro) {
        const { data, error } = await sb
          .from('centros_trabajo')
          .insert({ hotel_id: usuarioActual.hotel_id, empresa_id: empresa.id, nombre: nombreCentro, direccion })
          .select()
          .single();
        if (error) { errores.push(`Fila ${nFila}: error al crear el centro — ${error.message}`); continue; }
        centro = data;
        centrosCache.push(centro);
        centrosCreados++;
      }

      // Enlaza automáticamente a este centro cualquier persona trabajadora cuyo campo "Centro" (texto
      // libre de su ficha) coincida con el nombre del centro importado y que todavía no esté enlazada —
      // cierra el hueco real de que la importación masiva de empleados (Centro, texto libre) y
      // Coordinación Empresarial (centro_trabajo_id, FK) vivían desconectadas entre sí.
      const { data: enlazados, error: errorEnlace } = await sb
        .from('personas_trabajadoras')
        .update({ centro_trabajo_id: centro.id })
        .eq('hotel_id', usuarioActual.hotel_id)
        .is('centro_trabajo_id', null)
        .ilike('centro', nombreCentro)
        .select('id');
      if (!errorEnlace && enlazados) trabajadoresEnlazados += enlazados.length;
    }

    const resumen = `${empresasCreadas} empresa(s) nueva(s), ${centrosCreados} centro(s) nuevo(s), ${trabajadoresEnlazados} persona(s) trabajadora(s) enlazada(s)` + (errores.length ? `, ${errores.length} fila(s) descartada(s)` : '');
    mostrarToast(`Importación completada ✓ ${resumen}`, true);
    await registrarAuditoria('Coordinación Empresarial', 'Importación masiva de empresas y centros', resumen);
    if (errores.length) {
      resultEl.innerHTML = `${resumen}.<br>` + errores.join('<br>');
    } else {
      cerrarModalImportarEmpresasCentros();
    }
    await cargarCoordinacionAdmin();
  } catch (err) {
    resultEl.textContent = 'No se ha podido leer el archivo: ' + err.message;
  }
}

function abrirModalEmpresa() {
  $('formEmpresa').reset();
  $('empSector').value = 'Hostelería';
  $('modalEmpresa').classList.remove('hidden');
}
function cerrarModalEmpresa() {
  $('modalEmpresa').classList.add('hidden');
}
async function guardarEmpresa(e) {
  e.preventDefault();
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    nombre: $('empNombre').value.trim(),
    cif: $('empCif').value.trim() || null,
    sector: $('empSector').value.trim() || null,
    forma_juridica: $('empFormaJuridica').value.trim() || null,
    cnae: $('empCnae').value.trim() || null,
    actividad_principal: $('empActividad').value.trim() || null,
    convenio_colectivo: $('empConvenio').value.trim() || null,
    domicilio_social: $('empDomicilio').value.trim() || null,
    cp: $('empCp').value.trim() || null,
    municipio: $('empMunicipio').value.trim() || null,
    provincia: $('empProvincia').value.trim() || null,
    telefono: $('empTelefono').value.trim() || null,
    email: $('empEmail').value.trim() || null
  };
  const { error } = await sb.from('empresas').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Empresa creada ✓', !error);
  if (!error) {
    cerrarModalEmpresa();
    await cargarCoordinacionAdmin();
  }
}

function abrirModalCentro() {
  $('formCentro').reset();
  $('centroEmpresaId').innerHTML = empresasCache.map((e) => `<option value="${e.id}">${e.nombre}</option>`).join('') || '<option value="">Crea una empresa primero</option>';
  $('modalCentro').classList.remove('hidden');
}
function cerrarModalCentro() {
  $('modalCentro').classList.add('hidden');
}
async function guardarCentro(e) {
  e.preventDefault();
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    empresa_id: $('centroEmpresaId').value,
    nombre: $('centroNombre').value.trim(),
    direccion: $('centroDireccion').value.trim() || null
  };
  if (!payload.empresa_id) {
    mostrarToast('Crea primero una empresa', false);
    return;
  }
  const { error } = await sb.from('centros_trabajo').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Centro creado ✓', !error);
  if (!error) {
    cerrarModalCentro();
    await cargarCoordinacionAdmin();
  }
}

// ---------- Accidentes de Trabajo ----------
let accidentesCache = [];
const ACC_SIGUIENTE_ESTADO = { parte_pendiente: 'parte_enviado', parte_enviado: 'investigacion_pendiente', investigacion_pendiente: 'cerrado' };
const ACC_ESTADO_LABEL = { parte_pendiente: 'Parte pendiente', parte_enviado: 'Parte enviado', investigacion_pendiente: 'Investigación pendiente', cerrado: 'Cerrado' };
const ACC_ESTADO_BOTON = { parte_pendiente: '✉ Enviar parte', parte_enviado: '🔍 Abrir investigación', investigacion_pendiente: '✓ Cerrar expediente' };

// Resuelve la "empresa" (y sus contactos de Mutua/Autoridad Laboral/Comité/PRL, migración 0073)
// de un accidente a partir de su centro — mismo criterio que empresaDeCentro() del prototipo:
// el centro del accidente (texto libre) se compara contra centros_trabajo.nombre para localizar
// su empresa_id. Si no hay coincidencia (centro en texto libre sin correspondencia exacta), se usa
// la primera empresa del hotel como mejor aproximación, igual que hacía el fallback del prototipo.
function empresaDeAccidente(a) {
  const centro = centrosCache.find((c) => c.nombre === a.centro);
  const empresaId = centro ? centro.empresa_id : null;
  return (empresaId && empresasCache.find((e) => e.id === empresaId)) || empresasCache[0] || null;
}

// Nota de nomenclatura (auditoría final): esta bandera se llama "mutua" en el esquema (migración
// 0030) pero en realidad modela la comunicación URGENTE a la AUTORIDAD LABORAL (24 h, Art. 6 RD
// 1299/2006) en accidentes graves/muy graves/mortales — distinta del Parte a la Mutua (Delt@, 5
// días hábiles, _plazoParteLabel/enviado_parte_mutua, ya existente). No se renombra la columna
// (riesgo de romper datos ya sembrados); se corrige aquí solo el texto visible, que antes decía
// "Mutua" y confundía ambos plazos legales.
function _esGraveOMas(a) {
  return a.gravedad === 'Grave' || a.gravedad === 'Muy grave' || a.gravedad === 'Mortal';
}
function _plazoMutuaEnAlerta(a) {
  if (!_esGraveOMas(a) || a.enviado_mutua) return false;
  const horasTranscurridas = (new Date() - new Date(a.fecha + 'T00:00:00')) / 3600000;
  return a.plazo_mutua_horas - horasTranscurridas <= 48;
}
function _plazoMutuaLabel(a) {
  if (!_esGraveOMas(a)) return '<span class="sub-c">— (sin comunicación urgente requerida)</span>';
  if (a.enviado_mutua) return '<span class="badge2 b-emerald">🟢 Comunicado a la Autoridad Laboral</span>';
  const horasRestantes = a.plazo_mutua_horas - (new Date() - new Date(a.fecha + 'T00:00:00')) / 3600000;
  const diasRestantes = Math.round(horasRestantes / 24);
  if (horasRestantes < 0) return `<span class="badge2 b-rose">🔴 Autoridad Laboral: plazo vencido (${Math.abs(diasRestantes)} d.)</span>`;
  if (diasRestantes === 0) return '<span class="badge2 b-rose">🔴 Autoridad Laboral: vence hoy</span>';
  if (diasRestantes <= 2) return `<span class="badge2 b-amber">🟡 Autoridad Laboral: vence en ${diasRestantes} día(s)</span>`;
  return `<span class="badge2 b-emerald">🟢 Autoridad Laboral: ${diasRestantes} días restantes</span>`;
}
const MATRIZ_RIESGO = {
  baja: { baja: 'Trivial', media: 'Tolerable', alta: 'Moderado' },
  media: { baja: 'Tolerable', media: 'Moderado', alta: 'Importante' },
  alta: { baja: 'Moderado', media: 'Importante', alta: 'Intolerable' }
};
function calcularGradoRiesgo(severidad, probabilidad) {
  return (MATRIZ_RIESGO[severidad] && MATRIZ_RIESGO[severidad][probabilidad]) || '—';
}
let informesInvestigacionCache = [];
async function cargarAccidentesAdmin() {
  const [{ data }, { data: informes }] = await Promise.all([
    sb.from('accidentes_trabajo').select('*, personas_trabajadoras(nombre)').order('fecha', { ascending: false }),
    sb.from('informes_investigacion').select('*')
  ]);
  accidentesCache = data || [];
  informesInvestigacionCache = informes || [];
  const pendientesAutoridad = accidentesCache.filter((a) => _esGraveOMas(a) && !a.enviado_mutua).length;
  const enAlerta = accidentesCache.filter((a) => a.estado !== 'cerrado' && _plazoMutuaEnAlerta(a)).length;
  const investigacionesEnCurso = accidentesCache.filter((a) => a.estado === 'investigacion_pendiente').length;
  $('accidentesKpis').innerHTML = `
    <div class="card kpi"><div class="ic">🚑</div><div><div class="t">Accidentes registrados</div><div class="v">${accidentesCache.length}</div></div></div>
    <div class="card kpi"><div class="ic">🚨</div><div><div class="t">Comunicaciones urgentes pendientes (Autoridad Laboral, 24h)</div><div class="v">${pendientesAutoridad}</div></div></div>
    <div class="card kpi"><div class="ic">⏱</div><div><div class="t">Plazos en alerta (≤2 días o vencidos)</div><div class="v">${enAlerta}</div></div></div>
    <div class="card kpi"><div class="ic">🔍</div><div><div class="t">Informes de investigación en curso</div><div class="v">${investigacionesEnCurso}</div></div></div>`;

  $('accidentesBody').innerHTML =
    accidentesCache
      .map((a) => {
        // Comunicación urgente a la Autoridad Laboral (24h, solo grave+) tiene su propio botón con
        // envío de correo real — el avance genérico de estado (avanzarAccidente) ya no se usa para
        // "parte_pendiente" cuando el accidente es grave+; para Leve sigue siendo un simple avance
        // administrativo de estado sin obligación legal de comunicación urgente.
        const boton =
          a.estado === 'parte_pendiente' && _esGraveOMas(a)
            ? a.enviado_mutua
              ? `<button type="button" class="btn btn-sm" onclick="avanzarAccidente('${a.id}')">🔍 Abrir investigación</button>`
              : `<button type="button" class="btn btn-sm" onclick="abrirAccCorreo('${a.id}','autoridad')">🚨 Comunicar a Autoridad Laboral</button>`
            : ACC_ESTADO_BOTON[a.estado]
              ? `<button type="button" class="btn btn-sm" onclick="avanzarAccidente('${a.id}')">${ACC_ESTADO_BOTON[a.estado]}</button>`
              : '';
        const botonInforme = `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirModalInformeAccidente('${a.id}')">🔍 Informe</button>`;
        const botonVerInforme = informesInvestigacionCache.some((i) => i.accidente_id === a.id) ? `<button type="button" class="btn btn-secondary btn-sm" onclick="verDocumentoInformeAccidente('${a.id}')">👁 Ver informe</button>` : '';
        const botonFirmaTrabajador = a.firma_trabajador_en ? '' : `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirAccCorreo('${a.id}','firma_trabajador')">✍️ Solicitar/registrar firma del/de la trabajador/a</button>`;
        const botonFirmaRRHH = a.firma_rrhh_en ? '' : `<button type="button" class="btn btn-secondary btn-sm" onclick="firmarAccidenteRRHH('${a.id}')" ${a.firma_trabajador_en ? '' : 'disabled title="El Parte debe volver firmado por la persona trabajadora antes de que RR.HH. pueda firmarlo"'}>✍️ Firmar (RR.HH.)</button>`;
        const botonEnviarParte = a.baja_medica && !a.enviado_parte_mutua ? `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirAccCorreo('${a.id}','mutua')">📤 Enviar Parte a la Mutua</button>` : '';
        const botonEnviarPrl = `<button type="button" class="btn btn-secondary btn-sm" onclick="abrirAccCorreo('${a.id}','prl')">⛑️ Enviar a empresa colaboradora de PRL</button>`;
        const botonVerDoc = `<button type="button" class="btn btn-secondary btn-sm" onclick="verDocumentoPAT('${a.id}')">👁 Ver</button>`;
        const botonDoc = `<button type="button" class="btn btn-secondary btn-sm" onclick="descargarDocumentoPAT('${a.id}')">⬇ Descargar</button>`;
        return `<tr>
          <td><b>${a.ref}</b></td>
          <td>${a.personas_trabajadoras ? a.personas_trabajadoras.nombre : '—'}</td>
          <td>${a.centro || '—'}</td>
          <td>${fechaCorta(a.fecha)}</td>
          <td><span class="badge2 ${a.gravedad === 'Leve' ? 'b-amber' : 'b-rose'}">${a.gravedad}</span></td>
          <td>${_plazoMutuaLabel(a)}<br>${_plazoParteLabel(a)}</td>
          <td>${_firmaPATLabel(a)}</td>
          <td><span class="badge2 ${a.estado === 'cerrado' ? 'b-emerald' : 'b-amber'}">${ACC_ESTADO_LABEL[a.estado] || a.estado}</span></td>
          <td style="white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap;">${boton} ${botonInforme} ${botonVerInforme} ${botonFirmaTrabajador} ${botonFirmaRRHH} ${botonEnviarParte} ${botonEnviarPrl} ${botonVerDoc} ${botonDoc}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="9" class="sub-c" style="text-align:center;padding:14px;">Sin partes registrados.</td></tr>';
}
function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
let medidasCorrectorasInformeActual = [];
function renderMedidasCorrectorasInforme() {
  $('infMedidasBody').innerHTML =
    medidasCorrectorasInformeActual
      .map(
        (m, i) => `<tr>
          <td><input type="text" value="${m.descripcion || ''}" onchange="medidasCorrectorasInformeActual[${i}].descripcion=this.value" style="margin:0;"></td>
          <td><input type="text" value="${m.prioridad || ''}" onchange="medidasCorrectorasInformeActual[${i}].prioridad=this.value" style="margin:0;width:70px;"></td>
          <td><input type="text" value="${m.responsable || ''}" onchange="medidasCorrectorasInformeActual[${i}].responsable=this.value" style="margin:0;"></td>
          <td><input type="date" value="${m.plazo || ''}" onchange="medidasCorrectorasInformeActual[${i}].plazo=this.value" style="margin:0;"></td>
          <td><input type="text" value="${m.coste || ''}" onchange="medidasCorrectorasInformeActual[${i}].coste=this.value" style="margin:0;width:70px;"></td>
          <td><button type="button" class="btn btn-secondary btn-sm" onclick="eliminarMedidaCorrectoraInforme(${i})">🗑</button></td>
        </tr>`
      )
      .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:10px;">Sin medidas correctoras todavía.</td></tr>';
}
function anadirMedidaCorrectoraInforme() {
  medidasCorrectorasInformeActual.push({ descripcion: '', prioridad: '', responsable: '', plazo: '', coste: '' });
  renderMedidasCorrectorasInforme();
}
function eliminarMedidaCorrectoraInforme(i) {
  medidasCorrectorasInformeActual.splice(i, 1);
  renderMedidasCorrectorasInforme();
}
function actualizarGradoRiesgoInforme() {
  $('infGradoRiesgo').textContent = calcularGradoRiesgo($('infSeveridad').value, $('infProbabilidad').value);
}
function abrirModalInformeAccidente(id) {
  const a = accidentesCache.find((x) => x.id === id);
  if (!a) return;
  const inf = informesInvestigacionCache.find((x) => x.accidente_id === id) || {};
  $('informeAccId').value = a.id;
  $('informeAccRef').textContent = a.ref;
  $('infCronologia').value = inf.cronologia || '';
  $('infTestigos').value = inf.testigos || '';
  $('infLugarConservado').value = inf.lugar_conservado || 'si';
  $('infCondicionesInseguras').value = inf.condiciones_inseguras || '';
  $('infActosInseguros').value = inf.actos_inseguros || '';
  $('infCausasBasicas').value = inf.causas_basicas || '';
  $('infSeveridad').value = inf.severidad || 'media';
  $('infProbabilidad').value = inf.probabilidad || 'media';
  actualizarGradoRiesgoInforme();
  medidasCorrectorasInformeActual = Array.isArray(inf.medidas_correctoras) ? JSON.parse(JSON.stringify(inf.medidas_correctoras)) : [];
  renderMedidasCorrectorasInforme();
  $('infResponsableSeguimiento').value = inf.responsable_seguimiento || '';
  $('infRecursos').value = inf.recursos || '';
  $('infFechaPrevistaEjecucion').value = inf.fecha_prevista_ejecucion || '';
  $('infFechaRealEjecucion').value = inf.fecha_real_ejecucion || '';
  $('infFirmaEncargadoNombre').value = inf.firma_encargado_nombre || '';
  $('infFirmaEncargadoFecha').value = toDatetimeLocalValue(inf.firma_encargado_fecha);
  $('infFirmaTecnicoPrlNombre').value = inf.firma_tecnico_prl_nombre || '';
  $('infFirmaTecnicoPrlFecha').value = toDatetimeLocalValue(inf.firma_tecnico_prl_fecha);
  $('infFirmaDelegadoNombre').value = inf.firma_delegado_nombre || '';
  $('infFirmaDelegadoFecha').value = toDatetimeLocalValue(inf.firma_delegado_fecha);
  $('infDelegadoOmitido').checked = !!inf.delegado_omitido;
  $('infFirmaDirectorNombre').value = inf.firma_director_nombre || '';
  $('infFirmaDirectorFecha').value = toDatetimeLocalValue(inf.firma_director_fecha);
  $('infEstadoEnvioComite').value = inf.estado_envio_comite || 'pendiente';
  $('infFechaEnvioComite').value = toDatetimeLocalValue(inf.fecha_envio_comite);
  $('infCcComite').value = inf.cc_comite || '';
  $('infFechaRevisionEficacia').value = inf.fecha_revision_eficacia || '';
  $('infVerificado').value = inf.verificado || '';
  $('infObservacionesFinales').value = inf.observaciones_finales || '';
  $('infEstado').value = inf.estado || 'en_curso';
  $('modalInformeAccidente').classList.remove('hidden');
}
function cerrarModalInformeAccidente() {
  $('modalInformeAccidente').classList.add('hidden');
}
async function guardarInformeAccidente(e) {
  e.preventDefault();
  const accidenteId = $('informeAccId').value;
  const informePrevio = informesInvestigacionCache.find((x) => x.accidente_id === accidenteId) || {};
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    accidente_id: accidenteId,
    cronologia: $('infCronologia').value.trim() || null,
    testigos: $('infTestigos').value.trim() || null,
    lugar_conservado: $('infLugarConservado').value,
    condiciones_inseguras: $('infCondicionesInseguras').value.trim() || null,
    actos_inseguros: $('infActosInseguros').value.trim() || null,
    causas_basicas: $('infCausasBasicas').value.trim() || null,
    severidad: $('infSeveridad').value,
    probabilidad: $('infProbabilidad').value,
    medidas_correctoras: medidasCorrectorasInformeActual,
    responsable_seguimiento: $('infResponsableSeguimiento').value.trim() || null,
    fecha_prevista_ejecucion: $('infFechaPrevistaEjecucion').value || null,
    fecha_real_ejecucion: $('infFechaRealEjecucion').value || null,
    recursos: $('infRecursos').value.trim() || null,
    firma_encargado_nombre: $('infFirmaEncargadoNombre').value.trim() || null,
    firma_encargado_fecha: $('infFirmaEncargadoFecha').value ? new Date($('infFirmaEncargadoFecha').value).toISOString() : null,
    firma_tecnico_prl_nombre: $('infFirmaTecnicoPrlNombre').value.trim() || null,
    firma_tecnico_prl_fecha: $('infFirmaTecnicoPrlFecha').value ? new Date($('infFirmaTecnicoPrlFecha').value).toISOString() : null,
    firma_delegado_nombre: $('infFirmaDelegadoNombre').value.trim() || null,
    firma_delegado_fecha: $('infFirmaDelegadoFecha').value ? new Date($('infFirmaDelegadoFecha').value).toISOString() : null,
    delegado_omitido: $('infDelegadoOmitido').checked,
    firma_director_nombre: $('infFirmaDirectorNombre').value.trim() || null,
    firma_director_fecha: $('infFirmaDirectorFecha').value ? new Date($('infFirmaDirectorFecha').value).toISOString() : null,
    estado_envio_comite: $('infEstadoEnvioComite').value,
    fecha_envio_comite: $('infFechaEnvioComite').value ? new Date($('infFechaEnvioComite').value).toISOString() : null,
    cc_comite: $('infCcComite').value.trim() || null,
    fecha_revision_eficacia: $('infFechaRevisionEficacia').value || null,
    verificado: $('infVerificado').value || null,
    observaciones_finales: $('infObservacionesFinales').value.trim() || null,
    estado: $('infEstado').value,
    updated_at: new Date().toISOString()
  };

  // Circuito de firmas (mismo orden que el prototipo, directorHabilitada en el original:
  // Técnico/a PRL -> Delegado/a de Prevención (u omitido) -> Director/a) — sin esto, el Informe
  // podía cerrarse y "enviarse" al Comité sin que nadie lo hubiera firmado de verdad.
  if (payload.firma_delegado_nombre && !payload.firma_tecnico_prl_nombre) {
    mostrarToast('⚠️ El/la Técnico/a de PRL debe firmar antes que el/la Delegado/a de Prevención.', false);
    return;
  }
  if (payload.firma_director_nombre && !(payload.firma_tecnico_prl_nombre && (payload.firma_delegado_nombre || payload.delegado_omitido))) {
    mostrarToast('⚠️ El/la Director/a solo puede firmar después del Técnico/a de PRL y del Delegado/a de Prevención (o su omisión justificada).', false);
    return;
  }
  if (payload.estado === 'cerrado' && !payload.firma_director_nombre) {
    mostrarToast('⚠️ No se puede cerrar el informe sin la firma del Director/a · Responsable PRL.', false);
    return;
  }

  const { error } = await sb.from('informes_investigacion').upsert(payload, { onConflict: 'accidente_id' });
  if (error) {
    mostrarToast('Error al guardar: ' + error.message, false);
    return;
  }

  // Envío real al Comité de Seguridad y Salud (C12 del prototipo, migración 0073): se dispara una
  // sola vez, cuando el informe queda cerrado y firmado por Director/a y todavía no se había enviado.
  const a = accidentesCache.find((x) => x.id === accidenteId);
  let avisoComite = '';
  if (payload.estado === 'cerrado' && payload.firma_director_nombre && informePrevio.estado_envio_comite !== 'enviado' && a) {
    const empresa = empresaDeAccidente(a);
    if (empresa && empresa.email_comite_seguridad_salud) {
      const cc = payload.cc_comite || empresa.email_servicio_prl || null;
      const asunto = `Informe de Investigación de Accidente — ${a.ref} — ${a.personas_trabajadoras ? a.personas_trabajadoras.nombre : ''}`;
      const cuerpo =
        `Adjunto el Informe de Investigación de Accidente ${a.ref}.\n\n` +
        `Grado de riesgo: ${calcularGradoRiesgo(payload.severidad, payload.probabilidad)}\n` +
        `Medidas correctoras: ${medidasCorrectorasInformeActual.length}\n\n` +
        `Firmado por ${payload.firma_director_nombre} (Director/a · Responsable PRL).`;
      const { error: errorComite } = await sb.rpc('enviar_correo_externo', {
        p_destinatario_email: empresa.email_comite_seguridad_salud,
        p_cc_email: cc,
        p_asunto: asunto,
        p_cuerpo: cuerpo,
        p_referencia_tabla: 'informes_investigacion',
        p_referencia_id: accidenteId
      });
      if (!errorComite) {
        await sb
          .from('informes_investigacion')
          .update({ estado_envio_comite: 'enviado', fecha_envio_comite: new Date().toISOString(), cc_comite: cc })
          .eq('accidente_id', accidenteId);
        if (a.trabajador_id) {
          await sb.from('documentos').insert({
            hotel_id: usuarioActual.hotel_id,
            trabajador_id: a.trabajador_id,
            tipo: 'accidente_informe',
            nombre: `Informe de Investigación de Accidente — ${a.ref}`,
            meta: 'Cerrado · Comité de Seguridad y Salud'
          });
        }
        avisoComite = ` · Enviado al Comité (${empresa.email_comite_seguridad_salud})`;
      } else {
        avisoComite = ' · Guardado, pero no se pudo enviar al Comité: ' + errorComite.message;
      }
    } else {
      avisoComite = ' · Falta configurar el email del Comité de Seguridad y Salud (Coordinación Empresarial → Ficha de empresa → Contactos).';
    }
  }

  mostrarToast('Informe de investigación guardado ✓' + avisoComite, true);
  cerrarModalInformeAccidente();
  await cargarAccidentesAdmin();
  await registrarAuditoria('Accidentes de Trabajo', 'Informe de investigación guardado' + avisoComite, (a && a.ref) || accidenteId);
}

async function avanzarAccidente(id) {
  const a = accidentesCache.find((x) => x.id === id);
  if (!a) return;
  const siguiente = ACC_SIGUIENTE_ESTADO[a.estado];
  if (!siguiente) return;
  const payload = { estado: siguiente };
  if (siguiente === 'parte_enviado') payload.enviado_mutua = true;
  const { error } = await sb.from('accidentes_trabajo').update(payload).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Actualizado ✓', !error);
  if (!error) await cargarAccidentesAdmin();
}

// ---- Ventana de revisión antes de enviar (migración 0085) — reutilizada por las 4 comunicaciones
// externas del circuito de Accidentes: Autoridad Laboral (24h), Mutua (Parte, 5 días hábiles),
// empresa colaboradora de PRL (aviso del accidente/investigación) y solicitud de firma del Parte a
// la persona trabajadora. Antes cada una enviaba el correo directamente con direcciones fijas sin
// poder revisarlas ni añadir una copia — ahora todas pasan por esta misma ventana de Para/CC/Asunto/
// Cuerpo editable, igual que ya hacen "✉️ Correo a empresa de formación" y "Enviar solicitud a
// Prevenlia".
let accCorreoContext = null; // { id, accion }
function _datosAccidenteParaCorreo(a) {
  const t = a.personas_trabajadoras || empleadosCache.find((p) => p.id === a.trabajador_id) || {};
  const empresa = empresaDeAccidente(a);
  return { t, empresa };
}
async function abrirAccCorreo(id, accion) {
  const a = accidentesCache.find((x) => x.id === id);
  if (!a) return;
  const { t, empresa } = _datosAccidenteParaCorreo(a);
  accCorreoContext = { id, accion };
  $('accCorreoId').value = id;
  $('accCorreoAccion').value = accion;
  $('accCorreoFirmaExtra').classList.toggle('hidden', accion !== 'firma_trabajador');
  $('btnRegistrarFirmaAccCorreo').classList.toggle('hidden', accion !== 'firma_trabajador');
  $('btnEnviarAccCorreo').classList.remove('hidden');

  const detalle =
    `Referencia: ${a.ref}\n` +
    `Persona trabajadora: ${t.nombre || '—'}\n` +
    `Centro: ${a.centro || '—'}\n` +
    `Fecha y hora: ${fechaCorta(a.fecha)}${a.hora_accidente ? ', ' + a.hora_accidente + ' h' : ''}\n` +
    `Gravedad: ${a.gravedad || '—'}\n` +
    `Lugar: ${a.lugar_accidente || '—'}\n` +
    `Forma/contacto: ${a.forma || '—'}\n` +
    `Agente material: ${a.agente_material || '—'}\n` +
    `Naturaleza de la lesión: ${a.naturaleza_lesion || '—'}\n` +
    `Parte del cuerpo: ${a.partes_cuerpo || '—'}\n`;

  if (accion === 'autoridad') {
    $('accCorreoTitulo').textContent = '🚨 Comunicar a la Autoridad Laboral (24h)';
    $('accCorreoPara').value = (empresa && empresa.email_autoridad_laboral) || '';
    $('accCorreoCC').value = [empresa && empresa.email_servicio_prl].filter(Boolean).join(', ');
    $('accCorreoAsunto').value = `Comunicación urgente de accidente de trabajo (${a.gravedad}) — ${a.ref}`;
    $('accCorreoCuerpo').value =
      `Se comunica, en cumplimiento del Art. 6 del RD 1299/2006 (plazo de 24 horas para accidentes graves, muy graves o mortales), el siguiente accidente de trabajo:\n\n${detalle}\n` +
      `Descripción de los hechos:\n${a.descripcion || '—'}\n\n` +
      `Este correo se envía desde Personal4Pax en nombre de ${(usuarioActual && usuarioActual.hotel_nombre) || 'la empresa'}.`;
    const { data: ccRrhh } = await sb.rpc('rrhh_emails_hotel');
    if (accCorreoContext && accCorreoContext.id === id && ccRrhh) {
      const actuales = $('accCorreoCC').value;
      $('accCorreoCC').value = [actuales, ccRrhh].filter(Boolean).join(', ');
    }
  } else if (accion === 'mutua') {
    $('accCorreoTitulo').textContent = '📤 Enviar Parte de Accidente a la Mutua (Delt@)';
    $('accCorreoPara').value = (empresa && empresa.email_mutua) || '';
    $('accCorreoCC').value = '';
    $('accCorreoAsunto').value = `Parte de Accidente de Trabajo — ${a.ref}`;
    $('accCorreoCuerpo').value =
      `Se adjunta/comunica el Parte de Accidente de Trabajo correspondiente a:\n\n${detalle}` +
      `Baja médica desde: ${a.fecha_baja ? fechaCorta(a.fecha_baja) : '—'}\n\n` +
      `Puede descargar el documento completo del Parte desde el panel de Personal4Pax.\n\n` +
      `Este correo se envía desde Personal4Pax en nombre de ${(usuarioActual && usuarioActual.hotel_nombre) || 'la empresa'}.`;
    const { data: ccRrhh } = await sb.rpc('rrhh_emails_hotel');
    if (accCorreoContext && accCorreoContext.id === id && ccRrhh) $('accCorreoCC').value = ccRrhh;
  } else if (accion === 'prl') {
    $('accCorreoTitulo').textContent = '⛑️ Enviar a la empresa colaboradora de PRL';
    $('accCorreoPara').value = (empresa && empresa.email_servicio_prl) || '';
    $('accCorreoCC').value = '';
    $('accCorreoAsunto').value = `Aviso de accidente de trabajo — ${a.ref}`;
    $('accCorreoCuerpo').value =
      `Buenos días,\n\nSe comunica el siguiente accidente de trabajo para su valoración/investigación por el servicio de prevención:\n\n${detalle}\n` +
      `Descripción de los hechos:\n${a.descripcion || '—'}\n\n` +
      `Quedamos a la espera de su informe técnico.\n\nUn saludo,\nDepartamento de RR.HH.`;
  } else if (accion === 'firma_trabajador') {
    $('accCorreoTitulo').textContent = '✍️ Firma del Parte por la persona trabajadora';
    $('accCorreoPara').value = t.email || '';
    $('accCorreoCC').value = '';
    $('accCorreoAsunto').value = `Firma del Parte de Accidente de Trabajo — ${a.ref}`;
    $('accCorreoCuerpo').value =
      `Hola ${t.nombre || ''},\n\nAdjuntamos el Parte de Accidente de Trabajo ${a.ref} para tu firma. Por favor, revísalo y confírmanos tu conformidad respondiendo a este correo, o fírmalo en persona con RR.HH.\n\n${detalle}\n` +
      `Un saludo,\nDepartamento de RR.HH.`;
    $('accCorreoFirmaNombre').value = a.firma_trabajador_nombre || t.nombre || '';
  }
  $('modalAccCorreo').classList.remove('hidden');
}
function cerrarAccCorreo() {
  $('modalAccCorreo').classList.add('hidden');
  accCorreoContext = null;
}
async function enviarAccCorreo() {
  if (!accCorreoContext) return;
  const { id, accion } = accCorreoContext;
  const para = $('accCorreoPara').value.trim();
  const cc = $('accCorreoCC').value.trim();
  const asunto = $('accCorreoAsunto').value.trim();
  const cuerpo = $('accCorreoCuerpo').value.trim();
  if (!para) {
    mostrarToast('⚠️ Indica la dirección de correo del destinatario', false);
    return;
  }
  if (!asunto || !cuerpo) {
    mostrarToast('⚠️ Completa el asunto y el cuerpo del correo', false);
    return;
  }
  const { error } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: para,
    p_cc_email: cc || null,
    p_asunto: asunto,
    p_cuerpo: cuerpo,
    p_referencia_tabla: 'accidentes_trabajo',
    p_referencia_id: id
  });
  if (error) {
    mostrarToast('Error al enviar: ' + error.message, false);
    return;
  }
  const a = accidentesCache.find((x) => x.id === id);
  if (accion === 'autoridad') {
    await sb.from('accidentes_trabajo').update({ enviado_mutua: true }).eq('id', id);
    await registrarAuditoria('Accidentes de Trabajo', 'Comunicación urgente enviada a la Autoridad Laboral', `Para: ${para}${cc ? ' · CC: ' + cc : ''}`);
  } else if (accion === 'mutua') {
    await sb.from('accidentes_trabajo').update({ enviado_parte_mutua: true, fecha_envio_parte_mutua: new Date().toISOString() }).eq('id', id);
    if (a && a.trabajador_id) {
      await sb.from('documentos').insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: a.trabajador_id,
        tipo: 'accidente_pat',
        nombre: `Parte de Accidente de Trabajo — ${a.ref}`,
        meta: `Enviado a la Mutua (${para})`
      });
    }
    await registrarAuditoria('Accidentes de Trabajo', 'Parte de Accidente enviado a la Mutua (Delt@)', `Para: ${para}${cc ? ' · CC: ' + cc : ''}`);
  } else if (accion === 'prl') {
    await registrarAuditoria('Accidentes de Trabajo', 'Aviso enviado a la empresa colaboradora de PRL', `Para: ${para}${cc ? ' · CC: ' + cc : ''}`);
  } else if (accion === 'firma_trabajador') {
    await registrarAuditoria('Accidentes de Trabajo', 'Correo de solicitud de firma enviado a la persona trabajadora', `Para: ${para}`);
  }
  mostrarToast(`Correo enviado ✓ Para: ${para}${cc ? ' · CC: ' + cc : ''}`, true);
  cerrarAccCorreo();
  await cargarAccidentesAdmin();
}
// Registra la firma del Parte por la persona trabajadora — presencial (sin correo) o tras recibir
// su conformidad por correo; desbloquea el botón "Firmar (RR.HH.)", pendiente hasta este punto.
async function registrarFirmaTrabajadorAccidente() {
  if (!accCorreoContext || accCorreoContext.accion !== 'firma_trabajador') return;
  const nombre = $('accCorreoFirmaNombre').value.trim();
  if (!nombre) {
    mostrarToast('⚠️ Indica el nombre de quien firma', false);
    return;
  }
  const { error } = await sb
    .from('accidentes_trabajo')
    .update({ firma_trabajador_nombre: nombre, firma_trabajador_en: new Date().toISOString() })
    .eq('id', accCorreoContext.id);
  mostrarToast(error ? 'Error al registrar la firma: ' + error.message : 'Firma de la persona trabajadora registrada ✓', !error);
  if (!error) {
    const a = accidentesCache.find((x) => x.id === accCorreoContext.id);
    await registrarAuditoria('Accidentes de Trabajo', 'Parte firmado por la persona trabajadora', `${(a && a.ref) || accCorreoContext.id} — ${nombre}`);
    cerrarAccCorreo();
    await cargarAccidentesAdmin();
  }
}

function abrirModalAccidente() {
  $('formAccidente').reset();
  $('accTrabajadorId').innerHTML = empleadosCache.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');
  $('accFecha').value = new Date().toISOString().slice(0, 10);
  $('accPlazoHoras').value = 24;
  $('accCentro').value = 'Hotel Demo';
  $('modalAccidente').classList.remove('hidden');
}
function cerrarModalAccidente() {
  $('modalAccidente').classList.add('hidden');
}
async function guardarAccidente(e) {
  e.preventDefault();
  const anio = new Date().getFullYear();
  const numExistentes = accidentesCache.filter((a) => a.ref.startsWith('AT-' + anio)).length;
  const ref = `AT-${anio}-${String(numExistentes + 1).padStart(4, '0')}`;
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: $('accTrabajadorId').value,
    ref,
    centro: $('accCentro').value.trim() || null,
    fecha: $('accFecha').value,
    hora_accidente: $('accHora').value || null,
    gravedad: $('accGravedad').value,
    descripcion: $('accDescripcion').value.trim() || null,
    plazo_mutua_horas: parseInt($('accPlazoHoras').value, 10) || 24,
    lugar_accidente: $('accLugar').value.trim() || null,
    forma: $('accForma').value.trim() || null,
    agente_material: $('accAgenteMaterial').value.trim() || null,
    naturaleza_lesion: $('accNaturalezaLesion').value.trim() || null,
    partes_cuerpo: $('accPartesCuerpo').value.trim() || null,
    baja_medica: $('accBajaMedica').checked,
    fecha_baja: $('accBajaMedica').checked ? $('accFechaBaja').value || null : null
  };
  const { error } = await sb.from('accidentes_trabajo').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : `Parte ${ref} creado ✓`, !error);
  if (!error) {
    cerrarModalAccidente();
    await cargarAccidentesAdmin();
  }
}

// ---- Plazo legal del Parte (5 días hábiles, Delt@/Mutua) — distinto del plazo en horas de la
// comunicación urgente a la Autoridad Laboral (_plazoMutuaLabel, ya existente) ----
function _plazoParteLabel(a) {
  if (!a.baja_medica) return '<span class="sub-c">— (sin baja)</span>';
  if (a.enviado_parte_mutua) return '<span class="badge2 b-emerald">🟢 Parte enviado</span>';
  if (!a.fecha_limite_parte) return '<span class="sub-c">—</span>';
  const hoy = new Date().toISOString().slice(0, 10);
  const diasRestantes = Math.round((new Date(a.fecha_limite_parte) - new Date(hoy)) / 86400000);
  if (diasRestantes < 0) return `<span class="badge2 b-rose">🔴 Parte (5 d. hábiles) vencido (${Math.abs(diasRestantes)} d.)</span>`;
  if (diasRestantes === 0) return '<span class="badge2 b-rose">🔴 Parte (5 d. hábiles) vence hoy</span>';
  if (diasRestantes <= 2) return `<span class="badge2 b-amber">🟡 Parte (5 d. hábiles) en ${diasRestantes} día(s)</span>`;
  return `<span class="badge2 b-emerald">🟢 Parte: ${diasRestantes} días restantes</span>`;
}
function _firmaPATLabel(a) {
  const t = a.firma_trabajador_en ? `<span class="badge2 b-emerald">✍️ ${a.firma_trabajador_nombre || 'Trabajador/a'}</span>` : '<span class="badge2 b-amber">Pdte. firma trabajador/a</span>';
  const r = a.firma_rrhh_en ? `<span class="badge2 b-emerald">✍️ ${a.firma_rrhh_nombre || 'RR.HH.'}</span>` : '<span class="badge2 b-amber">Pdte. firma RR.HH.</span>';
  return `${t}<br>${r}`;
}
async function firmarAccidenteRRHH(id) {
  const { error } = await sb
    .from('accidentes_trabajo')
    .update({ firma_rrhh_nombre: usuarioActual.nombre || 'RR.HH.', firma_rrhh_en: new Date().toISOString() })
    .eq('id', id);
  mostrarToast(error ? 'Error al firmar: ' + error.message : 'Parte firmado por RR.HH. ✓', !error);
  if (!error) {
    const a = accidentesCache.find((x) => x.id === id);
    await registrarAuditoria('Accidentes de Trabajo', 'Parte firmado por RR.HH.', a ? a.ref : id);
    await cargarAccidentesAdmin();
  }
}
// (el envío del Parte a la Mutua se hace ahora desde la ventana de revisión — ver abrirAccCorreo/
// enviarAccCorreo, accion 'mutua' — en vez de una función de envío directo sin revisión.)

// ---- Documento oficial del Parte de Accidente de Trabajo (PAT) — mismo formato (letterhead +
// meta-grid + bloque de firma) que generarDocumentoFormularioHTML(), con la firma doble del parte ----
function generarDocumentoPATHTML(a) {
  const t = a.personas_trabajadoras || empleadosCache.find((p) => p.id === a.trabajador_id) || {};
  const hotelNombre = (usuarioActual && usuarioActual.hotel_nombre) || 'V4Pax';
  const bloqueFirma = (nombre, fechaIso, etiqueta) =>
    fechaIso
      ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:10px 12px;margin-top:8px;">
          <p style="margin:0 0 4px;"><b>${etiqueta}:</b> ${nombre || '—'}</p>
          <p style="margin:0;font-size:12px;color:#065f46;">Firmado el ${new Date(fechaIso).toLocaleString('es-ES')}.</p>
        </div>`
      : `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-top:8px;">
          <p style="margin:0;font-size:12px;color:#92400e;">${etiqueta}: todavía pendiente de firma.</p>
        </div>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Parte de Accidente de Trabajo — ${a.ref}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:760px;margin:32px auto;padding:0 20px;color:#1e293b;}
h1{font-size:19px;margin:0 0 2px;}.sub{color:#64748b;font-size:12.5px;margin:0 0 18px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;font-size:13px;margin:10px 0;}
.grid p{margin:2px 0;}.lbl{color:#64748b;font-size:11px;text-transform:uppercase;}
.block{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:14px 0;}
footer{margin-top:24px;font-size:11px;color:#94a3b8;}</style></head><body>
<h1>🚑 Parte de Accidente de Trabajo — ${a.ref}</h1>
<p class="sub">${hotelNombre} · Generado el ${new Date().toLocaleDateString('es-ES')}</p>
<div class="block">
  <p class="lbl">Persona trabajadora</p><p><b>${t.nombre || '—'}</b>${t.dni_nie ? ' · DNI/NIE ' + t.dni_nie : ''}</p>
  <div class="grid">
    <p><span class="lbl">Puesto</span><br>${t.puesto || '—'}</p>
    <p><span class="lbl">Departamento</span><br>${t.departamento || '—'}</p>
    <p><span class="lbl">Centro</span><br>${a.centro || '—'}</p>
    <p><span class="lbl">Fecha y hora del accidente</span><br>${fechaCorta(a.fecha)}${a.hora_accidente ? ', ' + a.hora_accidente + ' h' : ''}</p>
    <p><span class="lbl">Gravedad</span><br>${a.gravedad || '—'}</p>
    <p><span class="lbl">Lugar</span><br>${a.lugar_accidente || '—'}</p>
    <p><span class="lbl">Forma / contacto</span><br>${a.forma || '—'}</p>
    <p><span class="lbl">Agente material</span><br>${a.agente_material || '—'}</p>
    <p><span class="lbl">Naturaleza de la lesión</span><br>${a.naturaleza_lesion || '—'}</p>
    <p><span class="lbl">Parte del cuerpo</span><br>${a.partes_cuerpo || '—'}</p>
    <p><span class="lbl">Baja médica</span><br>${a.baja_medica ? 'Sí, desde ' + fechaCorta(a.fecha_baja) : 'No'}</p>
    <p><span class="lbl">Plazo legal del Parte (5 días hábiles)</span><br>${a.fecha_limite_parte ? fechaCorta(a.fecha_limite_parte) : '—'}</p>
  </div>
</div>
<div class="block"><p class="lbl">Descripción de los hechos</p><p>${(a.descripcion || '—').replace(/\n/g, '<br>')}</p></div>
<div class="block">
  <p class="lbl" style="margin-bottom:6px;">Firmas</p>
  ${bloqueFirma(a.firma_trabajador_nombre, a.firma_trabajador_en, 'Firmado por la persona trabajadora')}
  ${bloqueFirma(a.firma_rrhh_nombre, a.firma_rrhh_en, 'Firmado por RR.HH.')}
</div>
<footer>Documento generado por Personal4Pax a partir del Parte de Accidente de Trabajo registrado en la aplicación. La firma de la persona trabajadora usa su firma electrónica simple interna (huella SHA-256), con validez conforme al Reglamento (UE) 910/2014 (eIDAS) y la Ley 6/2020.</footer>
</body></html>`;
}
// "👁 Ver" (migración 0085): abre el documento en una pestaña nueva sin forzar la descarga, mismo
// mecanismo que el resto de "Ver" de la app (blob HTML + window.open). "⬇ Descargar" sigue aparte.
function verDocumentoPAT(id) {
  const a = accidentesCache.find((x) => x.id === id);
  if (!a) return;
  const html = generarDocumentoPATHTML(a);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  registrarAuditoria('Accidentes de Trabajo', 'Visualización del documento del Parte', a.ref);
}
function descargarDocumentoPAT(id) {
  const a = accidentesCache.find((x) => x.id === id);
  if (!a) return;
  const html = generarDocumentoPATHTML(a);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = `Parte_Accidente_${a.ref}.html`;
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
  URL.revokeObjectURL(url);
  registrarAuditoria('Accidentes de Trabajo', 'Documento del Parte descargado', a.ref);
}

// ---- Documento del Informe de Investigación de Accidente (migración 0085) — mismo criterio que
// generarDocumentoPATHTML: ver en pestaña nueva sin forzar descarga, con los 7 bloques reales del
// formulario (Identificación, Descripción, Análisis de causas, Valoración del riesgo + medidas
// correctoras, Planificación y seguimiento, Firmas secuenciales, Cierre y seguimiento). ----
function generarDocumentoInformeHTML(a, inf) {
  const t = a.personas_trabajadoras || empleadosCache.find((p) => p.id === a.trabajador_id) || {};
  const hotelNombre = (usuarioActual && usuarioActual.hotel_nombre) || 'V4Pax';
  const firma = (etiqueta, nombre, fechaIso) =>
    fechaIso
      ? `<div class="firma ok"><b>✓ ${etiqueta}</b><div>${nombre || '—'}</div><div class="sub">${new Date(fechaIso).toLocaleString('es-ES')}</div></div>`
      : `<div class="firma pend"><b>${etiqueta}</b><div class="sub">Pendiente de firma</div></div>`;
  const medidas = (inf.medidas_correctoras || [])
    .map((m) => `<tr><td>${m.descripcion || '—'}</td><td>${m.prioridad || '—'}</td><td>${m.responsable || '—'}</td><td>${m.plazo ? fechaCorta(m.plazo) : '—'}</td><td>${m.coste || '—'}</td></tr>`)
    .join('') || '<tr><td colspan="5" class="sub">Sin medidas correctoras registradas.</td></tr>';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de Investigación de Accidente — ${a.ref}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:32px auto;padding:0 20px;color:#1e293b;}
h1{font-size:19px;margin:0 0 2px;}.subtitle{color:#64748b;font-size:12.5px;margin:0 0 18px;}
.paso{font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#0f766e;font-weight:700;margin:18px 0 6px;}
.block{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:6px 0 14px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px;font-size:13px;}.grid p{margin:2px 0;}
.lbl{color:#64748b;font-size:11px;text-transform:uppercase;}
table{border-collapse:collapse;width:100%;font-size:12.5px;}th,td{border:1px solid #e2e8f0;padding:5px 7px;text-align:left;}
.firma{border-radius:8px;padding:8px 10px;margin:6px 0;font-size:12.5px;}
.firma.ok{background:#ecfdf5;border:1px solid #a7f3d0;}.firma.pend{background:#fef3c7;border:1px solid #fde68a;}
.sub{color:#64748b;font-size:11.5px;}footer{margin-top:24px;font-size:11px;color:#94a3b8;}</style></head><body>
<h1>🔍 Informe de Investigación de Accidente — ${a.ref}</h1>
<p class="subtitle">${hotelNombre} · ${t.nombre || '—'} · Generado el ${new Date().toLocaleDateString('es-ES')} · Base legal: Ley 31/1995 Art. 16.3 y 36.2 · RD 39/1997 Art. 6</p>

<p class="paso">Paso 1 · Identificación</p>
<div class="block grid">
  <p><span class="lbl">Referencia</span><br>${a.ref}</p><p><span class="lbl">Persona trabajadora</span><br>${t.nombre || '—'}</p>
  <p><span class="lbl">Centro</span><br>${a.centro || '—'}</p><p><span class="lbl">Fecha del accidente</span><br>${fechaCorta(a.fecha)}</p>
</div>

<p class="paso">Paso 2 · Descripción detallada</p>
<div class="block">
  <p class="lbl">Cronología</p><p>${(inf.cronologia || '—').replace(/\n/g, '<br>')}</p>
  <p class="lbl">Testigos</p><p>${inf.testigos || '—'}</p>
  <p class="lbl">¿Lugar conservado?</p><p>${inf.lugar_conservado === 'si' ? 'Sí' : inf.lugar_conservado === 'no' ? 'No' : '—'}</p>
</div>

<p class="paso">Paso 3 · Análisis de causas</p>
<div class="block">
  <p class="lbl">Condiciones inseguras</p><p>${inf.condiciones_inseguras || '—'}</p>
  <p class="lbl">Actos inseguros</p><p>${inf.actos_inseguros || '—'}</p>
  <p class="lbl">Causas básicas</p><p>${inf.causas_basicas || '—'}</p>
</div>

<p class="paso">Paso 4 · Valoración del riesgo</p>
<div class="block">
  <p>Severidad: <b>${inf.severidad || '—'}</b> · Probabilidad: <b>${inf.probabilidad || '—'}</b> · Grado de riesgo: <b>${calcularGradoRiesgo(inf.severidad, inf.probabilidad)}</b></p>
  <table style="margin-top:8px;"><thead><tr><th>Medida correctora</th><th>Prioridad</th><th>Responsable</th><th>Plazo</th><th>Coste</th></tr></thead><tbody>${medidas}</tbody></table>
</div>

<p class="paso">Paso 5 · Planificación y seguimiento</p>
<div class="block grid">
  <p><span class="lbl">Responsable de seguimiento</span><br>${inf.responsable_seguimiento || '—'}</p>
  <p><span class="lbl">Recursos</span><br>${inf.recursos || '—'}</p>
  <p><span class="lbl">Fecha prevista de ejecución</span><br>${inf.fecha_prevista_ejecucion ? fechaCorta(inf.fecha_prevista_ejecucion) : '—'}</p>
  <p><span class="lbl">Fecha real de ejecución</span><br>${inf.fecha_real_ejecucion ? fechaCorta(inf.fecha_real_ejecucion) : '—'}</p>
</div>

<p class="paso">Paso 6 · Firmas digitales secuenciales</p>
<div class="block">
  ${firma('Encargado/a directo', inf.firma_encargado_nombre, inf.firma_encargado_fecha)}
  ${firma('Técnico/a de Prevención (Servicio PRL)', inf.firma_tecnico_prl_nombre, inf.firma_tecnico_prl_fecha)}
  ${inf.delegado_omitido ? '<div class="firma sub">Firma del/de la Delegado/a de Prevención — omitida (justificado)</div>' : firma('Delegado/a de Prevención', inf.firma_delegado_nombre, inf.firma_delegado_fecha)}
  ${firma('Director/a · Responsable PRL', inf.firma_director_nombre, inf.firma_director_fecha)}
  <p class="sub" style="margin-top:6px;">Envío al Comité de Seguridad y Salud: ${inf.estado_envio_comite === 'enviado' ? `enviado el ${inf.fecha_envio_comite ? new Date(inf.fecha_envio_comite).toLocaleString('es-ES') : '—'}${inf.cc_comite ? ' · CC: ' + inf.cc_comite : ''}` : 'pendiente'}</p>
</div>

<p class="paso">Paso 7 · Cierre y seguimiento</p>
<div class="block grid">
  <p><span class="lbl">Fecha de revisión de eficacia</span><br>${inf.fecha_revision_eficacia ? fechaCorta(inf.fecha_revision_eficacia) : '—'}</p>
  <p><span class="lbl">Verificado por</span><br>${inf.verificado || '—'}</p>
  <p style="grid-column:1/-1;"><span class="lbl">Observaciones finales</span><br>${inf.observaciones_finales || '—'}</p>
  <p><span class="lbl">Estado del informe</span><br>${inf.estado === 'cerrado' ? 'Cerrado' : 'En curso'}</p>
</div>
<footer>Documento generado por Personal4Pax a partir del Informe de Investigación de Accidente registrado en la aplicación.</footer>
</body></html>`;
}
function verDocumentoInformeAccidente(id) {
  const a = accidentesCache.find((x) => x.id === id);
  const inf = informesInvestigacionCache.find((x) => x.accidente_id === id);
  if (!a || !inf) return;
  const html = generarDocumentoInformeHTML(a, inf);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  registrarAuditoria('Accidentes de Trabajo', 'Visualización del Informe de Investigación', a.ref);
}

// =====================================================================
// LOTE 5 — Canales éticos y disciplina (Sugerencias, Denuncias, Disciplina, Auditoría)
// =====================================================================

// ---------- Auditoría ----------
let auditoriaCache = [];
async function registrarAuditoria(modulo, accion, detalle) {
  try {
    await sb.from('auditoria_log').insert({
      hotel_id: usuarioActual.hotel_id,
      modulo,
      accion,
      detalle,
      actor: usuarioActual ? usuarioActual.nombre : '—'
    });
  } catch (e) {
    /* la trazabilidad nunca debe bloquear la acción principal */
  }
  if ($('auditoriaBody')) await cargarAuditoriaAdmin();
}

// César: "necesito... un archivo o repositorio en que se pueda garantizar el guardado y archivo
// de todos los fichajes, así como todas las acciones relacionadas con la gestión documental...
// que sea de fácil acceso para las auditorías". El .limit(300) de antes hacía que un hecho de
// hace meses/años (p.ej. la baja de alguien que ya no está en la empresa) fuera, en la práctica,
// inaccesible aunque el dato siguiera guardado (nunca se borra nada — ver migración 0090). Ahora
// la consulta se filtra en servidor por fecha/tipo/texto en vez de traer siempre "los últimos
// 300" — así un filtro de fecha concreto SÍ llega hasta donde haga falta.
let auditoriaFiltro = { desde: '', hasta: '', modulo: '', texto: '' };
async function cargarAuditoriaAdmin() {
  let q = sb.from('auditoria_log').select('*').order('created_at', { ascending: false });
  if (auditoriaFiltro.desde) q = q.gte('created_at', auditoriaFiltro.desde + 'T00:00:00');
  if (auditoriaFiltro.hasta) q = q.lte('created_at', auditoriaFiltro.hasta + 'T23:59:59');
  if (auditoriaFiltro.modulo) q = q.eq('modulo', auditoriaFiltro.modulo);
  if (auditoriaFiltro.texto) {
    // Saneado: una coma o un paréntesis en el texto libre rompería la sintaxis del filtro .or() de PostgREST.
    const t = auditoriaFiltro.texto.replace(/[,()]/g, ' ').trim();
    if (t) q = q.or(`actor.ilike.%${t}%,detalle.ilike.%${t}%,accion.ilike.%${t}%`);
  }
  const hayFiltro = auditoriaFiltro.desde || auditoriaFiltro.hasta || auditoriaFiltro.modulo || auditoriaFiltro.texto;
  const { data } = await q.limit(hayFiltro ? 2000 : 300);
  auditoriaCache = data || [];
  const hoyIso = new Date().toISOString().slice(0, 10);
  const hoy = auditoriaCache.filter((a) => (a.created_at || '').slice(0, 10) === hoyIso).length;
  const porModulo = {};
  auditoriaCache.forEach((a) => (porModulo[a.modulo] = (porModulo[a.modulo] || 0) + 1));
  const moduloTop = Object.entries(porModulo).sort((a, b) => b[1] - a[1])[0];
  $('auditoriaKpis').innerHTML = `
    <div class="card kpi"><div class="ic">🔍</div><div><div class="t">${hayFiltro ? 'Registros del filtro' : 'Registros recientes'}</div><div class="v">${auditoriaCache.length}</div></div></div>
    <div class="card kpi"><div class="ic">📅</div><div><div class="t">Acciones hoy</div><div class="v">${hoy}</div></div></div>
    <div class="card kpi"><div class="ic">📌</div><div><div class="t">Tipo con más actividad</div><div class="v" style="font-size:14px;">${moduloTop ? moduloTop[0] : '—'}</div></div></div>`;
  // El desplegable de "Tipo de operación" se rellena solo con los módulos que existen de verdad en
  // el log (no una lista a mano que se quedaría corta — registrarAuditoria() se llama desde ~50
  // puntos distintos de la app) — se recalcula a partir de una carga sin filtrar la primera vez.
  const selModulo = $('arcFiltroModulo');
  if (selModulo && selModulo.options.length <= 1) {
    const { data: todos } = await sb.from('auditoria_log').select('modulo');
    const modulos = [...new Set((todos || []).map((m) => m.modulo))].sort();
    selModulo.innerHTML = '<option value="">Todos</option>' + modulos.map((m) => `<option value="${m}">${m}</option>`).join('');
    if (auditoriaFiltro.modulo) selModulo.value = auditoriaFiltro.modulo;
  }
  $('auditoriaBody').innerHTML =
    auditoriaCache
      .map(
        (a) => `<tr>
          <td>${new Date(a.created_at).toLocaleString('es-ES')}</td>
          <td><span class="badge2 b-slate">${a.modulo}</span></td>
          <td>${a.accion}</td>
          <td class="sub-c">${a.detalle || '—'}</td>
          <td>${a.actor || '—'}</td>
        </tr>`
      )
      .join('') || '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin actividad registrada para este filtro.</td></tr>';
  if ($('notificacionesFallidasBody')) {
    const { data: fallidas } = await sb
      .from('notificaciones_cola')
      .select('*')
      .in('estado', ['error', 'parcial'])
      .order('creado_en', { ascending: false })
      .limit(100);
    $('notificacionesFallidasBody').innerHTML =
      (fallidas || [])
        .map(
          (n) => `<tr>
            <td class="td-fecha">${new Date(n.creado_en).toLocaleString('es-ES')}</td>
            <td>${n.destinatario_email || '(trabajador)'}</td>
            <td>${n.titulo}</td>
            <td class="sub-c">${n.error || '—'}</td>
          </tr>`
        )
        .join('') || '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin correos ni avisos fallidos — todo se está entregando.</td></tr>';
  }
}

function aplicarFiltroArchivo() {
  auditoriaFiltro = {
    desde: $('arcFiltroDesde').value,
    hasta: $('arcFiltroHasta').value,
    modulo: $('arcFiltroModulo').value,
    texto: $('arcFiltroTexto').value.trim()
  };
  cargarAuditoriaAdmin();
}
function limpiarFiltroArchivo() {
  $('arcFiltroDesde').value = '';
  $('arcFiltroHasta').value = '';
  $('arcFiltroModulo').value = '';
  $('arcFiltroTexto').value = '';
  auditoriaFiltro = { desde: '', hasta: '', modulo: '', texto: '' };
  cargarAuditoriaAdmin();
}
function exportarArchivoAuditoriaCSV() {
  if (!auditoriaCache.length) return mostrarToast('No hay registros que exportar con el filtro actual', false);
  descargarCSV(
    `Archivo_Auditoria_${new Date().toISOString().slice(0, 10)}.csv`,
    ['Fecha', 'Tipo de operación', 'Acción', 'Detalle', 'Actor'],
    auditoriaCache.map((a) => [new Date(a.created_at).toLocaleString('es-ES'), a.modulo, a.accion, a.detalle || '', a.actor || ''])
  );
  registrarAuditoria('Auditoría', 'Exportación del Archivo (CSV)', `${auditoriaCache.length} registro(s)`);
}

// ---------- Ficha histórica de una persona trabajadora ----------
// César: "...busca la información... que se pueda reflejar... Si buscamos el día de mañana las
// bajas relacionadas con un trabajador que no está en la empresa desde hace 2 años, que podamos
// accederla filtrando bien por nombre". A diferencia del Archivo (auditoria_log, texto libre),
// esto consulta las tablas REALES de cada circuito documental (bajas_medicas, disciplina,
// accidentes, vigilancia de la salud...) directamente por trabajador_id — incluye personas ya de
// baja/cese a propósito: su documentación sigue protegida (migración 0090) y debe seguir siendo
// consultable durante el plazo legal.
const ARCHIVO_TABLAS_FICHA = [
  { tabla: 'bajas_medicas', tipo: '🩺 Baja médica', fecha: 'fecha_inicio', resumen: (r) => `${r.motivo || 'Baja médica'} — ${r.fecha_alta ? 'alta ' + fechaCorta(r.fecha_alta) : 'en curso'}` },
  { tabla: 'expedientes_disciplinarios', tipo: '⚖️ Expediente disciplinario', fecha: 'fecha_hecho', resumen: (r) => `${r.ref} · ${r.tipo} · estado: ${r.estado}${r.sancion ? ' · ' + r.sancion : ''}` },
  { tabla: 'disciplina_formularios_firmados', tipo: '✍ Formulario disciplinario firmado', fecha: 'created_at', resumen: (r) => `${r.formulario_nombre}${r.firmado_por ? ' — firmado por ' + r.firmado_por : ''}` },
  { tabla: 'accidentes_trabajo', tipo: '🚑 Accidente de trabajo', fecha: 'fecha', resumen: (r) => `${r.ref} · gravedad: ${r.gravedad} · estado: ${r.estado}` },
  { tabla: 'vigilancia_salud', tipo: '🩻 Vigilancia de la salud', fecha: 'cita_fecha', resumen: (r) => `${r.tipo} — ${r.estado}${r.aptitud ? ' · ' + r.aptitud : ''}` },
  { tabla: 'puesto_evaluaciones', tipo: '📊 Evaluación de desempeño', fecha: 'created_at', resumen: (r) => `${r.puesto_key} — ${Number(r.total_ponderado).toFixed(1)}% · evaluador/a: ${r.evaluador || '—'}` },
  { tabla: 'seguimiento_contrato', tipo: '📄 Seguimiento del contrato', fecha: 'created_at', resumen: (r) => `${r.tipo_contrato || 'Contrato'} — estado: ${r.estado}` },
  { tabla: 'incidencias', tipo: '⚠️ Incidencia', fecha: 'created_at', resumen: (r) => `${r.tipo} — estado: ${r.estado}` },
  { tabla: 'formularios_solicitudes', tipo: '📝 Formulario / trámite', fecha: 'fecha_solicitud', resumen: (r) => `${(formulariosPlantillasCache.find((p) => p.id === r.plantilla_id) || {}).nombre || r.plantilla_id} — estado: ${r.estado}` },
  { tabla: 'vacaciones_solicitudes', tipo: '🏖 Vacaciones', fecha: 'fecha_inicio', resumen: (r) => `${fechaCorta(r.fecha_inicio)} a ${fechaCorta(r.fecha_fin)} (${r.dias} días) — ${r.estado}` },
  { tabla: 'ausencias_solicitudes', tipo: '🚪 Ausencia', fecha: 'created_at', resumen: (r) => `${r.motivo} — ${r.estado}` },
  { tabla: 'documentos', tipo: '📁 Documento', fecha: 'fecha', resumen: (r) => `${r.nombre} (${r.tipo})${r.firma_trabajador_en ? ' · firmado ' + fechaCorta(r.firma_trabajador_en) : ''}` }
];
let arcFichaTrabajadorCache = null; // { trabajador, eventos: [...] }

async function buscarFichaHistorica() {
  const texto = $('arcFichaBuscarNombre').value.trim();
  const el = $('arcFichaResultados');
  $('arcFichaDetalle').innerHTML = '';
  arcFichaTrabajadorCache = null;
  if (!texto) {
    el.innerHTML = '';
    return;
  }
  // A propósito SIN filtrar por estado_laboral: el objetivo explícito es poder encontrar también
  // a quien ya no está en la empresa.
  const { data, error } = await sb.from('personas_trabajadoras').select('id, nombre, puesto, estado_laboral, fecha_cese').ilike('nombre', `%${texto}%`).order('nombre');
  if (error) {
    el.innerHTML = `<p class="sub-c">Error al buscar: ${error.message}</p>`;
    return;
  }
  const filas = data || [];
  el.innerHTML = filas.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;">${filas
        .map((p) => {
          const activo = (p.estado_laboral || 'Activo') === 'Activo';
          return `<button type="button" class="btn btn-secondary btn-sm" onclick="cargarFichaHistoricaTrabajador('${p.id}')">${p.nombre} — ${p.puesto || '—'} ${activo ? '' : `<span class="badge2 b-amber">${p.estado_laboral}${p.fecha_cese ? ' ' + fechaCorta(p.fecha_cese) : ''}</span>`}</button>`;
        })
        .join('')}</div>`
    : '<p class="sub-c">Sin coincidencias.</p>';
}

async function cargarFichaHistoricaTrabajador(trabajadorId) {
  const { data: trabajador } = await sb.from('personas_trabajadoras').select('*').eq('id', trabajadorId).single();
  if (!trabajador) return;
  const resultados = await Promise.all(
    ARCHIVO_TABLAS_FICHA.map((def) => sb.from(def.tabla).select('*').eq('trabajador_id', trabajadorId).order(def.fecha, { ascending: false }))
  );
  const eventos = [];
  resultados.forEach(({ data }, i) => {
    const def = ARCHIVO_TABLAS_FICHA[i];
    (data || []).forEach((r) => eventos.push({ tipo: def.tipo, tabla: def.tabla, fecha: r[def.fecha], resumen: def.resumen(r) }));
  });
  eventos.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  arcFichaTrabajadorCache = { trabajador, eventos };
  renderFichaHistorica();
  registrarAuditoria('Auditoría', 'Consulta de ficha histórica', `${trabajador.nombre} — ${eventos.length} registro(s) encontrados`);
}

function renderFichaHistorica(filtroTipo = '') {
  if (!arcFichaTrabajadorCache) return;
  const { trabajador, eventos } = arcFichaTrabajadorCache;
  const tipos = [...new Set(eventos.map((e) => e.tipo))];
  const filtrados = filtroTipo ? eventos.filter((e) => e.tipo === filtroTipo) : eventos;
  const activo = (trabajador.estado_laboral || 'Activo') === 'Activo';
  $('arcFichaDetalle').innerHTML = `
    <div class="card card-pad">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div><b style="font-size:14px;">${trabajador.nombre}</b><p class="sub-c" style="margin:2px 0 0;">${trabajador.puesto || '—'} ${activo ? '· Activo' : `· ${trabajador.estado_laboral || 'Baja'}${trabajador.fecha_cese ? ' desde ' + fechaCorta(trabajador.fecha_cese) : ''}`}</p></div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${tipos.length ? `<select class="form-select" style="margin:0;" onchange="renderFichaHistorica(this.value)"><option value="">Todos los tipos (${eventos.length})</option>${tipos.map((t) => `<option value="${t}" ${t === filtroTipo ? 'selected' : ''}>${t} (${eventos.filter((e) => e.tipo === t).length})</option>`).join('')}</select>` : ''}
          <button type="button" class="btn btn-secondary btn-sm" onclick="exportarFichaHistoricaCSV()">⬇ CSV</button>
        </div>
      </div>
      <div style="overflow-x:auto;margin-top:10px;"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Resumen</th></tr></thead>
      <tbody>${
        filtrados.length
          ? filtrados.map((e) => `<tr><td>${e.fecha ? fechaCorta(e.fecha) : '—'}</td><td><span class="badge2 b-slate">${e.tipo}</span></td><td class="sub-c">${e.resumen}</td></tr>`).join('')
          : '<tr><td colspan="3" class="sub-c" style="text-align:center;padding:14px;">Sin registros documentales guardados para esta persona.</td></tr>'
      }</tbody></table></div>
    </div>`;
}
function exportarFichaHistoricaCSV() {
  if (!arcFichaTrabajadorCache || !arcFichaTrabajadorCache.eventos.length) return mostrarToast('No hay nada que exportar', false);
  const { trabajador, eventos } = arcFichaTrabajadorCache;
  descargarCSV(
    `Ficha_${trabajador.nombre.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`,
    ['Fecha', 'Tipo', 'Resumen'],
    eventos.map((e) => [e.fecha ? fechaCorta(e.fecha) : '', e.tipo, e.resumen])
  );
  registrarAuditoria('Auditoría', 'Exportación de ficha histórica', `${trabajador.nombre} — ${eventos.length} registro(s)`);
}

// Reintento manual masivo de la cola de notificaciones — para cuando RR.HH. acaba de configurar
// los secretos de Resend/Firebase y quiere reprocesar ahora mismo lo que había quedado en error,
// en vez de esperar al siguiente disparo de pg_cron (cada 5 minutos, migración 0061/0075).
async function reintentarNotificacionesFallidas() {
  const { data: n, error } = await sb.rpc('reintentar_notificaciones_fallidas');
  mostrarToast(error ? 'Error: ' + error.message : `${n || 0} notificación(es) reencolada(s) — se reintentarán en el próximo envío automático`, !error);
  if (!error) await cargarAuditoriaAdmin();
}

// ---------- Buzón de Sugerencias (admin) ----------
const SUGERENCIA_ESTADOS = {
  nueva: ['🆕 Nueva', 'b-amber'],
  revision: ['👀 En revisión', 'b-amber'],
  aprobada: ['✔️ Aprobada', 'b-emerald'],
  rechazada: ['✖ Rechazada', 'b-rose'],
  implementacion: ['🚧 En implementación', 'b-brand'],
  implementada: ['🏆 Implementada', 'b-emerald']
};
let sugerenciasCache = [];
let proyectosMejoraCache = [];
async function cargarSugerenciasAdmin() {
  const [{ data }, { data: proyectos }] = await Promise.all([
    sb.from('sugerencias').select('*, personas_trabajadoras(nombre)').order('created_at', { ascending: false }),
    sb.from('proyectos_mejora').select('*').order('created_at', { ascending: false })
  ]);
  sugerenciasCache = data || [];
  proyectosMejoraCache = proyectos || [];
  const nuevas = sugerenciasCache.filter((s) => s.estado === 'nueva').length;
  const implementadas = sugerenciasCache.filter((s) => s.estado === 'implementada').length;
  $('sugerenciasKpis').innerHTML = `
    <div class="card kpi"><div class="ic">💡</div><div><div class="t">Sugerencias recibidas</div><div class="v">${sugerenciasCache.length}</div></div></div>
    <div class="card kpi"><div class="ic">🆕</div><div><div class="t">Pendientes de revisar</div><div class="v">${nuevas}</div></div></div>
    <div class="card kpi"><div class="ic">🏆</div><div><div class="t">Implementadas</div><div class="v">${implementadas}</div></div></div>`;
  // Tarjeta "🚀 Banco de ideas — proyectos de mejora" del prototipo (líneas 1334-1337).
  $('proyectosMejoraBody').innerHTML =
    proyectosMejoraCache
      .map((p) => {
        const origen = sugerenciasCache.find((s) => s.id === p.sugerencia_id);
        return `<tr>
          <td><b>${p.titulo}</b></td>
          <td class="sub-c">${origen ? origen.titulo : '—'}</td>
          <td>${p.responsable || '—'}</td>
          <td>${p.departamento || '—'}</td>
          <td class="sub-c">${p.kpi || '—'}</td>
          <td><span class="badge2 ${p.resultado === 'En curso' ? 'b-amber' : 'b-emerald'}">${p.resultado}</span></td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin proyectos de mejora todavía.</td></tr>';
  $('sugerenciasBody').innerHTML =
    sugerenciasCache
      .map((s) => {
        const est = SUGERENCIA_ESTADOS[s.estado] || ['—', 'b-slate'];
        const autor = s.confidencial ? 'Confidencial' : s.personas_trabajadoras ? s.personas_trabajadoras.nombre : '—';
        // Indicador de la acción llevada a cabo — antes "Ver / gestionar" no dejaba claro si ya
        // se había respondido o solo cambiado el estado. Ahora se ve de un vistazo si RR.HH. ya
        // escribió una respuesta para la persona trabajadora, y si esa persona puede recibirla
        // (confidencial = sin trabajador_id = nadie a quien notificar).
        const respondida = s.respuesta_rrhh ? '<span class="badge2 b-emerald" style="margin-left:4px;">💬 Respondida</span>' : '<span class="badge2 b-slate" style="margin-left:4px;">Sin respuesta</span>';
        return `<tr>
          <td><b>${s.titulo}</b><p class="sub-c" style="margin:2px 0 0;">${s.categoria || '—'} · ${s.departamento || '—'}</p></td>
          <td>${autor}</td>
          <td>${fechaCorta((s.created_at || '').slice(0, 10))}</td>
          <td><span class="badge2 ${est[1]}">${est[0]}</span>${respondida}</td>
          <td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirSugerenciaModal('${s.id}')">👁️ Ver / responder</button></td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin sugerencias recibidas todavía.</td></tr>';
}
function abrirSugerenciaModal(id) {
  const s = sugerenciasCache.find((x) => x.id === id);
  if (!s) return;
  $('sugModalId').value = s.id;
  $('sugModalTitulo').textContent = s.titulo;
  $('sugModalMeta').textContent = `${s.categoria || '—'} · ${s.departamento || '—'} · ${s.confidencial ? 'Confidencial' : s.personas_trabajadoras ? s.personas_trabajadoras.nombre : '—'}`;
  $('sugModalDescripcion').textContent = [s.descripcion, s.propuesta, s.beneficio].filter(Boolean).join(' — ') || '—';
  $('sugModalAdjunto').innerHTML = s.adjunto_url ? `📎 <a href="${s.adjunto_url}" target="_blank" rel="noopener">Archivo adjunto</a>` : 'Sin archivo adjunto.';
  $('sugModalValoracion').value = s.valoracion || '';
  $('sugModalViabilidad').value = s.viabilidad || '';
  $('sugModalEstado').value = s.estado;
  $('sugModalMotivo').value = s.motivo_rechazo || '';
  $('sugModalRespuesta').value = s.respuesta_rrhh || '';
  $('modalSugerencia').classList.remove('hidden');
}
function cerrarSugerenciaModal() {
  $('modalSugerencia').classList.add('hidden');
}
async function guardarRespuestaSugerencia(e) {
  e.preventDefault();
  const id = $('sugModalId').value;
  const estado = $('sugModalEstado').value;
  const motivo = $('sugModalMotivo').value.trim();
  if (estado === 'rechazada' && !motivo) {
    mostrarToast('Indica el motivo del rechazo antes de guardar', false);
    return;
  }
  const payload = {
    estado,
    motivo_rechazo: motivo || null,
    respuesta_rrhh: $('sugModalRespuesta').value.trim() || null,
    valoracion: $('sugModalValoracion').value || null,
    viabilidad: $('sugModalViabilidad').value || null
  };
  const { error } = await sb.from('sugerencias').update(payload).eq('id', id);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Sugerencia actualizada ✓', !error);
  if (!error) {
    const s = sugerenciasCache.find((x) => x.id === id);
    cerrarSugerenciaModal();
    // La comunicación con la persona trabajadora, antes ausente por completo: guardar el cambio
    // de estado y la respuesta de RR.HH. solo se veía la próxima vez que esa persona abriera su
    // propia app. Ahora se encola una notificación real (RPC 0039, mismo circuito que vacaciones/
    // ausencias/formularios) — salvo que la sugerencia sea confidencial, donde no hay a quién
    // avisar porque trabajador_id es null a propósito.
    if (s && s.trabajador_id && !s.confidencial) {
      const estLabel = (SUGERENCIA_ESTADOS[estado] || ['—'])[0];
      await sb.rpc('encolar_notificacion', {
        p_trabajador_id: s.trabajador_id,
        p_hotel_id: s.hotel_id,
        p_tipo: 'sugerencia_' + estado,
        p_titulo: `💡 Tu sugerencia ha sido actualizada — ${estLabel}`,
        p_cuerpo: payload.respuesta_rrhh
          ? `RR.HH. ha respondido a tu sugerencia "${s.titulo}": ${payload.respuesta_rrhh}`
          : `El estado de tu sugerencia "${s.titulo}" ha cambiado a ${estLabel}.`,
        p_referencia_tabla: 'sugerencias',
        p_referencia_id: id
      });
    }
    await cargarSugerenciasAdmin();
    await registrarAuditoria('Sugerencias', 'Cambio de estado', `${s ? s.titulo : id} → ${SUGERENCIA_ESTADOS[estado][0]}`);
  }
}
// "🚀 Banco de ideas" del prototipo (convertirEnProyecto(), líneas 11566-11580) — solo se puede
// convertir una sugerencia aprobada/en implementación/implementada, y solo una vez.
async function convertirSugerenciaEnProyecto() {
  const id = $('sugModalId').value;
  const s = sugerenciasCache.find((x) => x.id === id);
  if (!s) return;
  const estadoActual = $('sugModalEstado').value;
  if (!['aprobada', 'implementacion', 'implementada'].includes(estadoActual)) {
    mostrarToast('⚠️ Solo puedes convertir en proyecto sugerencias aprobadas o en implementación', false);
    return;
  }
  if (proyectosMejoraCache.some((p) => p.sugerencia_id === id)) {
    mostrarToast('Esta sugerencia ya tiene un proyecto de mejora asociado', false);
    return;
  }
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    sugerencia_id: id,
    titulo: s.titulo,
    responsable: usuarioActual ? usuarioActual.nombre : null,
    departamento: s.departamento || null,
    kpi: (s.categoria || 'General') + ' — KPI por definir',
    resultado: 'En curso'
  };
  const { error } = await sb.from('proyectos_mejora').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Sugerencia convertida en proyecto de mejora 🚀 (Banco de ideas)', !error);
  if (!error) {
    await registrarAuditoria('Sugerencias', 'Convertida en proyecto de mejora', s.titulo);
    await cargarSugerenciasAdmin();
  }
}

// ---------- Canal de Denuncias (admin) ----------
const DENUNCIA_CATEGORIAS = {
  acoso_laboral: 'Acoso laboral / moral (mobbing)',
  acoso_sexual: 'Acoso sexual y acoso por razón de sexo',
  discriminacion: 'Discriminación (sexo, origen, discapacidad, orientación sexual, edad, religión, etc.)',
  abuso_poder: 'Abuso de poder / abuso de autoridad',
  violencia: 'Violencia en el trabajo (agresiones verbales o físicas)',
  corrupcion_fraude: 'Fraude, corrupción o incumplimiento normativo grave'
};
// Tabla legal exacta del prototipo — "Tipos de comunicación más frecuentes y su base legal"
const DENUNCIA_BASE_LEGAL = [
  ['Acoso laboral / moral (mobbing)', 'Art. 4.2.e) del Estatuto de los Trabajadores (derecho a la integridad física y a una adecuada política de prevención de riesgos); Arts. 14 y 15 de la Ley 31/1995 de PRL (deber de protección); Art. 173.1 del Código Penal (delito contra la integridad moral).'],
  ['Acoso sexual y acoso por razón de sexo', 'Arts. 7 y 48 de la Ley Orgánica 3/2007 para la igualdad efectiva de mujeres y hombres; Art. 184 del Código Penal.'],
  ['Discriminación (sexo, origen, discapacidad, orientación sexual, edad, religión, etc.)', 'Art. 14 de la Constitución Española; Art. 4.2.c) y 17.1 del Estatuto de los Trabajadores; Ley 15/2022 integral para la igualdad de trato y la no discriminación.'],
  ['Abuso de poder / abuso de autoridad', 'Art. 4.2.e) y Art. 20.3 del Estatuto de los Trabajadores (buena fe y respeto a la dignidad); Art. 54.2.b) ET (transgresión de la buena fe contractual y abuso de confianza).'],
  ['Violencia en el trabajo (agresiones verbales o físicas)', 'Art. 54.2.c) del Estatuto de los Trabajadores (ofensas verbales o físicas); Art. 4.2.e) ET.'],
  ['Fraude, corrupción o incumplimiento normativo grave', 'Ley 2/2023 reguladora de la protección de las personas que informen sobre infracciones normativas y de lucha contra la corrupción, Arts. 2, 5 y 7 (Sistema Interno de Información).']
];
const DENUNCIA_ESTADOS = {
  recibida: ['📥 Recibida', 'b-amber'],
  investigacion: ['🔍 En investigación', 'b-amber'],
  resuelta: ['✔️ Resuelta', 'b-emerald'],
  archivada: ['📁 Archivada', 'b-slate'],
  derivada: ['⚖️ Derivada a Disciplina', 'b-rose']
};
let denunciasCache = [];
function renderDenunciasBaseLegal() {
  const el = $('denunciasBaseLegal');
  if (!el) return;
  el.innerHTML = DENUNCIA_BASE_LEGAL.map((r) => `<tr><td><b>${r[0]}</b></td><td class="sub-c">${r[1]}</td></tr>`).join('');
}
async function cargarDenunciasAdmin() {
  const { data } = await sb.from('denuncias').select('*, personas_trabajadoras(nombre)').order('created_at', { ascending: false });
  denunciasCache = data || [];
  const abiertas = denunciasCache.filter((d) => d.estado === 'recibida' || d.estado === 'investigacion').length;
  const anonimas = denunciasCache.filter((d) => d.anonimo).length;
  $('denunciasKpis').innerHTML = `
    <div class="card kpi"><div class="ic">🚨</div><div><div class="t">Denuncias totales</div><div class="v">${denunciasCache.length}</div></div></div>
    <div class="card kpi"><div class="ic">🔍</div><div><div class="t">Abiertas / en investigación</div><div class="v">${abiertas}</div></div></div>
    <div class="card kpi"><div class="ic">🕶️</div><div><div class="t">Anónimas</div><div class="v">${anonimas}</div></div></div>`;
  renderDenunciasBaseLegal();
  $('denunciasBody').innerHTML =
    denunciasCache
      .map((d) => {
        const est = DENUNCIA_ESTADOS[d.estado] || ['—', 'b-slate'];
        return `<tr>
          <td>${fechaCorta(d.fecha)}</td>
          <td>${DENUNCIA_CATEGORIAS[d.categoria] || d.categoria || '—'}</td>
          <td>${d.departamento || '—'}</td>
          <td>${d.anonimo ? '🔒 Anónima' : 'Identidad conocida'}</td>
          <td><span class="badge2 ${est[1]}">${est[0]}</span></td>
          <td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirDenunciaModal('${d.id}')">Gestionar</button></td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin denuncias recibidas todavía.</td></tr>';
}
function abrirDenunciaModal(id) {
  const d = denunciasCache.find((x) => x.id === id);
  if (!d) return;
  $('denModalId').value = d.id;
  $('denModalCategoria').textContent = DENUNCIA_CATEGORIAS[d.categoria] || d.categoria;
  $('denModalMeta').textContent = `${d.anonimo ? '🕶️ Denuncia anónima — identidad protegida (Art. 36 Ley 2/2023)' : 'Denunciante: ' + (d.personas_trabajadoras ? d.personas_trabajadoras.nombre : '—')} · recibida ${fechaCorta(d.fecha)}`;
  // Antes solo se veía la descripción, sin el campo "Relación con los hechos" que la persona
  // trabajadora sí rellena al enviar la comunicación (persona afectada / testigo / otro) — RR.HH.
  // debe verlo con el mismo detalle, en el mismo formato que la trabajadora lo envió.
  $('denModalRelacion').textContent = `Relación de quien comunica con los hechos: ${d.relacion || '—'} · Departamento: ${d.departamento || '—'}`;
  $('denModalDescripcion').textContent = d.descripcion;
  $('denModalEstado').value = d.estado;
  $('denModalInvestigador').value = d.investigador || '';
  $('denModalResolucion').value = d.resolucion || '';
  $('modalDenuncia').classList.remove('hidden');
}
function cerrarDenunciaModal() {
  $('modalDenuncia').classList.add('hidden');
}
async function guardarGestionDenuncia(e) {
  e.preventDefault();
  const id = $('denModalId').value;
  const payload = {
    estado: $('denModalEstado').value,
    investigador: $('denModalInvestigador').value.trim() || null,
    resolucion: $('denModalResolucion').value.trim() || null
  };
  const { error } = await sb.from('denuncias').update(payload).eq('id', id);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Denuncia actualizada ✓', !error);
  if (!error) {
    cerrarDenunciaModal();
    await cargarDenunciasAdmin();
    await registrarAuditoria('Denuncias', 'Cambio de estado', `${id} → ${DENUNCIA_ESTADOS[payload.estado][0]}`);
  }
}

// ---------- Disciplina (admin) ----------
const FALTAS_CATALOGO = {
  leve: {
    nombre: 'Falta leve',
    dias: 10,
    base: 'Art. 58 ET + graduación del convenio colectivo aplicable',
    ejemplos: ['Retrasos o incumplimientos menores de horario', 'Descuidos menores en el desempeño', 'Incumplimientos formales de procedimientos', 'Uso inadecuado no grave de recursos'],
    consecuencias: 'Amonestación verbal o escrita, u otras medidas previstas por el convenio.'
  },
  grave: {
    nombre: 'Falta grave',
    dias: 20,
    base: 'Art. 58 ET + graduación del convenio colectivo aplicable',
    ejemplos: ['Reiteración de faltas leves', 'Incumplimiento relevante de instrucciones', 'Negligencia relevante', 'Incumplimiento de obligaciones de confidencialidad'],
    consecuencias: 'Suspensión de empleo y sueldo u otras sanciones previstas por convenio. Comunicación escrita obligatoria (Art. 58.2 ET).'
  },
  muy_grave: {
    nombre: 'Falta muy grave',
    dias: 60,
    base: 'Art. 54 ET (indisciplina, ofensas, transgresión de la buena fe, abuso de confianza, acoso) + convenio',
    ejemplos: ['Indisciplina o desobediencia grave', 'Ofensas verbales o físicas', 'Transgresión de la buena fe contractual', 'Acoso o conductas discriminatorias'],
    consecuencias: 'Suspensión de empleo y sueldo, otras sanciones, o despido disciplinario cuando concurran los requisitos legales (Arts. 54-55 ET).'
  }
};
const FORMULARIOS_DISCIPLINARIOS = [
  { id: 1, nombre: 'Comunicación de incumplimiento / apertura de actuaciones', base: 'Art. 58 ET + convenio colectivo aplicable' },
  { id: 2, nombre: 'Amonestación escrita por falta leve', base: 'Art. 58 ET + convenio colectivo aplicable' },
  { id: 3, nombre: 'Comunicación de sanción por falta grave', base: 'Art. 58.2 ET + convenio colectivo aplicable' },
  { id: 4, nombre: 'Comunicación de sanción por falta muy grave', base: 'Art. 58.2 ET + convenio colectivo aplicable' },
  { id: 5, nombre: 'Comunicación de despido disciplinario', base: 'Arts. 54 y 55 ET' },
  { id: 6, nombre: 'Acta de audiencia / alegaciones de la persona trabajadora', base: 'Art. 58 ET + convenio + garantías procedimentales' },
  { id: 7, nombre: 'Recepción de comunicación del Canal Ético', base: 'Arts. 5, 7, 33 y 36 Ley 2/2023' },
  { id: 8, nombre: 'Protección frente a represalias', base: 'Art. 36 Ley 2/2023' },
  { id: 9, nombre: 'Comunicación de cierre de expediente', base: 'Art. 58 ET / convenio / normativa específica según el procedimiento' }
];
const EXP_ESTADOS = {
  abierto: ['📂 Abierto · en actuaciones', 'b-brand'],
  alegaciones: ['🗣 En trámite de alegaciones', 'b-amber'],
  archivado: ['✔️ Cerrado · sin sanción', 'b-emerald'],
  sancion: ['⚠️ Cerrado · con sanción', 'b-rose'],
  derivado: ['⚖️ Derivado al Canal de Denuncias', 'b-rose']
};
let expedientesCache = [];
let discFormulariosFirmadosCache = [];
function diasEntre(a, b) {
  return Math.round((b - a) / 86400000);
}
function computePrescripcionDias(exp) {
  const cat = FALTAS_CATALOGO[exp.tipo];
  const hoy = new Date();
  const diasDesdeConocimiento = diasEntre(new Date(exp.fecha_conocimiento + 'T00:00:00'), hoy);
  const diasDesdeHecho = diasEntre(new Date(exp.fecha_hecho + 'T00:00:00'), hoy);
  const restanteCorto = cat.dias - diasDesdeConocimiento;
  const restanteLargo = 183 - diasDesdeHecho;
  return Math.min(restanteCorto, restanteLargo);
}
function renderCatalogoFaltas() {
  const grid = $('faltasCatalogoGrid');
  if (!grid) return;
  grid.innerHTML = Object.values(FALTAS_CATALOGO)
    .map(
      (f) => `<div class="card card-pad">
        <div class="cb-title">${f.nombre} <span class="sub-c">(${f.dias} días de prescripción)</span></div>
        <p class="sub-c" style="margin:6px 0;">${f.ejemplos.map((e) => '• ' + e).join('<br>')}</p>
        <p class="sub-c" style="margin:6px 0;"><b>Consecuencias:</b> ${f.consecuencias}</p>
        <p class="sub-c" style="margin:0;color:var(--slate-400);"><b>Base:</b> ${f.base}</p>
      </div>`
    )
    .join('');
  const formBody = $('formulariosDisciplinariosBody');
  if (formBody) {
    formBody.innerHTML = FORMULARIOS_DISCIPLINARIOS.map(
      (f) =>
        `<tr><td><b>Formulario ${String(f.id).padStart(2, '0')}</b> — ${f.nombre}</td><td class="sub-c">${f.base}</td><td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirFormularioDiscModal(${f.id})">✍️ Rellenar</button></td></tr>`
    ).join('');
  }
}
async function cargarDisciplinaAdmin() {
  renderCatalogoFaltas();
  const { data } = await sb.from('expedientes_disciplinarios').select('*, personas_trabajadoras(nombre)').order('created_at', { ascending: false });
  expedientesCache = data || [];
  await cargarDiscFormulariosFirmados();
  const abiertos = expedientesCache.filter((e) => e.estado === 'abierto' || e.estado === 'alegaciones').length;
  const porPrescribir = expedientesCache.filter((e) => e.estado === 'abierto' || e.estado === 'alegaciones').filter((e) => computePrescripcionDias(e) <= 15).length;
  $('disciplinaKpis').innerHTML = `
    <div class="card kpi"><div class="ic">⚖️</div><div><div class="t">Expedientes totales</div><div class="v">${expedientesCache.length}</div></div></div>
    <div class="card kpi"><div class="ic">📂</div><div><div class="t">Abiertos / en alegaciones</div><div class="v">${abiertos}</div></div></div>
    <div class="card kpi"><div class="ic">⏳</div><div><div class="t">A punto de prescribir (≤15 días)</div><div class="v">${porPrescribir}</div></div></div>`;
  $('expedientesDisciplinariosBody').innerHTML =
    expedientesCache
      .map((e) => {
        const cat = FALTAS_CATALOGO[e.tipo];
        const est = EXP_ESTADOS[e.estado] || ['—', 'b-slate'];
        const restante = computePrescripcionDias(e);
        let presc;
        if (restante <= 0) presc = '<span class="badge2 b-rose">🔴 Prescrito</span>';
        else if (restante <= 5) presc = `<span class="badge2 b-rose">🔴 ${restante} días</span>`;
        else if (restante <= 15) presc = `<span class="badge2 b-amber">🟠 ${restante} días</span>`;
        else presc = `<span class="badge2 b-emerald">${restante} días</span>`;
        return `<tr>
          <td><b>${e.ref}</b></td>
          <td>${cat ? cat.nombre : e.tipo}</td>
          <td>${e.personas_trabajadoras ? e.personas_trabajadoras.nombre : e.departamento || '—'}</td>
          <td>${fechaCorta(e.fecha_hecho)}</td>
          <td>${fechaCorta(e.fecha_conocimiento)}</td>
          <td>${presc}</td>
          <td><span class="badge2 ${est[1]}">${est[0]}</span></td>
          <td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirExpedienteModal('${e.id}')">Ver / gestionar</button></td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="8" class="sub-c" style="text-align:center;padding:14px;">Sin expedientes abiertos.</td></tr>';
}
async function cargarDiscFormulariosFirmados() {
  const { data } = await sb
    .from('disciplina_formularios_firmados')
    // documentos(...) — se lee aquí el acuse de recibo real de la persona trabajadora
    // (firma_trabajador_en/firma_trabajador_nombre, RPC firmar_documento) en vez de dar siempre
    // por firmado el formulario (bug real corregido — ver migración 0078).
    .select('*, personas_trabajadoras(nombre), expedientes_disciplinarios(ref, fecha_hecho), documentos(firma_trabajador_en, firma_trabajador_nombre)')
    .order('created_at', { ascending: false });
  discFormulariosFirmadosCache = data || [];
  const body = $('discFormulariosFirmadosBody');
  if (!body) return;
  body.innerHTML =
    discFormulariosFirmadosCache
      .map((f) => {
        const exp = f.expedientes_disciplinarios;
        // La persona a la que se sanciona es trabajador_id (0062) — antes solo se sabía si había
        // expediente vinculado, y si no, se mostraba por error el nombre de quien firmaba.
        const persona = (f.personas_trabajadoras && f.personas_trabajadoras.nombre) || '—';
        const fechaHechos = exp ? fechaCorta(exp.fecha_hecho) : '—';
        const firmaTrabajador = f.documentos ? f.documentos.firma_trabajador_en : null;
        // 3 estados reales del circuito (prototipo, líneas 6806-6808):
        let estadoHtml, accionHtml;
        if (f.reenviado_gestoria) {
          estadoHtml = '<span class="badge2 b-emerald">📧 Reenviado a gestoría</span>';
          accionHtml = '<span class="badge2 b-emerald">Enviado ✓</span>';
        } else if (firmaTrabajador) {
          estadoHtml = '<span class="badge2 b-brand">✅ Firmado · listo para enviar a gestoría</span>';
          accionHtml = `<button type="button" class="btn btn-sm" onclick="reenviarFormularioDiscGestoria('${f.id}')">📤 Reenviar a gestoría</button>`;
        } else {
          estadoHtml = '<span class="badge2 b-amber">📤 Enviado · pendiente de firma de la persona trabajadora</span>';
          accionHtml = '<span class="sub-c">Esperando firma de la persona trabajadora…</span>';
        }
        return `<tr>
          <td>${persona}</td>
          <td>${f.formulario_nombre}</td>
          <td>${fechaHechos}</td>
          <td>${estadoHtml}</td>
          <td style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"><button type="button" class="btn btn-secondary btn-sm" onclick="verFormDiscFirmado('${f.id}')">👁 Ver</button> ${accionHtml}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Todavía no se han emitido comunicaciones disciplinarias.</td></tr>';
}
// Último paso del circuito (prototipo: estado "gestoria") — reutiliza el mismo destinatario de
// gestoría predeterminado que ya usa Formularios (enviarFormularioGestoria) en vez de inventar
// uno nuevo, y el mismo RPC real de envío (enviar_correo_externo) que Coordinación Empresarial.
async function reenviarFormularioDiscGestoria(id) {
  const f = discFormulariosFirmadosCache.find((x) => x.id === id);
  if (!f) return;
  const predeterminado = formulariosDestinatariosCache.find((d) => d.predeterminado_gestoria);
  if (!predeterminado) {
    mostrarToast('⚠️ No hay destinatario de gestoría predeterminado — configúralo en Formularios → Destinatarios', false);
    return;
  }
  const persona = (f.personas_trabajadoras && f.personas_trabajadoras.nombre) || '—';
  const { data: cc } = await sb.rpc('rrhh_emails_hotel');
  const { error } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: predeterminado.email,
    p_cc_email: cc || null,
    p_asunto: `Formulario disciplinario firmado: ${f.formulario_nombre} — ${persona}`,
    p_cuerpo: `Adjunto el formulario "${f.formulario_nombre}" firmado por ${persona}, con acuse de recibo ya confirmado.\n\n${f.contenido || ''}`,
    p_referencia_tabla: 'disciplina_formularios_firmados',
    p_referencia_id: id
  });
  if (!error) {
    const { error: errorUpdate } = await sb.from('disciplina_formularios_firmados').update({ reenviado_gestoria: true, reenviado_gestoria_en: new Date().toISOString() }).eq('id', id);
    mostrarToast(errorUpdate ? 'Error al guardar: ' + errorUpdate.message : `Reenviado a gestoría ✓${cc ? ' · CC: ' + cc : ''}`, !errorUpdate);
    if (!errorUpdate) {
      await registrarAuditoria('Disciplina', 'Reenviado a gestoría', `${f.formulario_nombre} — ${persona}`);
      await cargarDiscFormulariosFirmados();
    }
  } else {
    mostrarToast('Error al enviar: ' + error.message, false);
  }
}
function verFormDiscFirmado(id) {
  const f = discFormulariosFirmadosCache.find((x) => x.id === id);
  if (!f) return;
  const exp = f.expedientes_disciplinarios;
  $('verFormDiscTitulo').textContent = f.formulario_nombre;
  $('verFormDiscSub').textContent = `${exp ? 'Expediente ' + exp.ref + ' · ' : ''}Base legal: ${f.base_legal || '—'} · Firmado por: ${f.firmado_por || '—'} el ${fechaCorta(f.created_at)}`;
  $('verFormDiscBody').textContent = f.contenido || 'Sin contenido adicional registrado.';
  $('modalVerFormDisc').classList.remove('hidden');
}
function cerrarModalVerFormDisc() {
  $('modalVerFormDisc').classList.add('hidden');
}
function abrirNuevoExpedienteModal() {
  $('formNuevoExpediente').reset();
  $('nExpTrabajadorId').innerHTML = '<option value="">— Sin vincular a una ficha —</option>' + empleadosCache.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');
  $('nExpFechaHecho').value = new Date().toISOString().slice(0, 10);
  $('nExpFechaConocimiento').value = new Date().toISOString().slice(0, 10);
  $('modalNuevoExpediente').classList.remove('hidden');
}
function cerrarNuevoExpedienteModal() {
  $('modalNuevoExpediente').classList.add('hidden');
}
async function guardarNuevoExpediente(e) {
  e.preventDefault();
  const anio = new Date().getFullYear();
  const numExistentes = expedientesCache.filter((x) => x.ref.startsWith('DISC-' + anio)).length;
  const ref = `DISC-${anio}-${String(numExistentes + 1).padStart(2, '0')}`;
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: $('nExpTrabajadorId').value || null,
    ref,
    tipo: $('nExpTipo').value,
    departamento: $('nExpDepartamento').value.trim() || null,
    fecha_hecho: $('nExpFechaHecho').value,
    fecha_conocimiento: $('nExpFechaConocimiento').value,
    hechos: $('nExpHechos').value.trim()
  };
  const { error } = await sb.from('expedientes_disciplinarios').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : `Expediente ${ref} abierto ✓`, !error);
  if (!error) {
    cerrarNuevoExpedienteModal();
    await cargarDisciplinaAdmin();
    await registrarAuditoria('Disciplina', 'Apertura de expediente', ref);
  }
}
let currentExpedienteId = null;
function abrirExpedienteModal(id) {
  const e = expedientesCache.find((x) => x.id === id);
  if (!e) return;
  currentExpedienteId = id;
  const cat = FALTAS_CATALOGO[e.tipo];
  $('expModalTitle').textContent = `${e.ref} — ${cat ? cat.nombre : e.tipo}`;
  $('expModalMeta').textContent = `${e.personas_trabajadoras ? e.personas_trabajadoras.nombre : e.departamento || '—'} · hecho: ${fechaCorta(e.fecha_hecho)} · conocimiento: ${fechaCorta(e.fecha_conocimiento)}${cat ? ' · base: ' + cat.base : ''}`;
  $('expModalHechos').textContent = e.hechos;
  $('expModalEstado').value = e.estado;
  $('expModalSancion').value = e.sancion || '';
  $('modalExpediente').classList.remove('hidden');
}
function cerrarExpedienteModal() {
  $('modalExpediente').classList.add('hidden');
}
async function guardarEstadoExpediente(e) {
  e.preventDefault();
  const payload = { estado: $('expModalEstado').value, sancion: $('expModalSancion').value.trim() || null };
  const { error } = await sb.from('expedientes_disciplinarios').update(payload).eq('id', currentExpedienteId);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Expediente actualizado ✓', !error);
  if (!error) {
    const exp = expedientesCache.find((x) => x.id === currentExpedienteId);
    cerrarExpedienteModal();
    await cargarDisciplinaAdmin();
    await registrarAuditoria('Disciplina', 'Actualización de expediente', `${exp ? exp.ref : ''} → ${EXP_ESTADOS[payload.estado][0]}`);
  }
}
let formDiscSeleccionado = null;
function abrirFormularioDiscModal(formId) {
  const f = FORMULARIOS_DISCIPLINARIOS.find((x) => x.id === formId);
  if (!f) return;
  formDiscSeleccionado = f;
  $('fdModalTitulo').textContent = `Formulario ${String(f.id).padStart(2, '0')} — ${f.nombre}`;
  $('fdModalBase').textContent = f.base;
  $('fdTrabajadorId').innerHTML = '<option value="">— Selecciona —</option>' + empleadosCache.map((p) => `<option value="${p.id}">${p.nombre}</option>`).join('');
  $('fdExpedienteId').innerHTML = '<option value="">— No vinculado a un expediente —</option>' + expedientesCache.map((x) => `<option value="${x.id}">${x.ref}</option>`).join('');
  $('fdContenido').value = '';
  $('fdFirmadoPor').value = usuarioActual ? usuarioActual.nombre : '';
  $('modalFormularioDisc').classList.remove('hidden');
}
function cerrarFormularioDiscModal() {
  $('modalFormularioDisc').classList.add('hidden');
}
// Si se vincula a un expediente que ya tiene persona trabajadora, se autoselecciona (se puede cambiar).
function sincronizarTrabajadorDesdeExpedienteDisc() {
  const expId = $('fdExpedienteId').value;
  if (!expId) return;
  const exp = expedientesCache.find((x) => x.id === expId);
  if (exp && exp.trabajador_id) $('fdTrabajadorId').value = exp.trabajador_id;
}
async function guardarFormularioDisc(e) {
  e.preventDefault();
  const trabajadorId = $('fdTrabajadorId').value;
  if (!trabajadorId) {
    mostrarToast('⚠️ Indica a qué persona trabajadora se sanciona', false);
    return;
  }
  const expedienteId = $('fdExpedienteId').value || null;
  const exp = expedientesCache.find((x) => x.id === expedienteId);
  const firmadoPor = $('fdFirmadoPor').value.trim() || null;
  // Circuito real del prototipo (líneas 6806-6808): RR.HH. firma y envía → la persona trabajadora
  // da su acuse de recibo (firmar_documento(), migración 0074, ya usado desde "Mis Documentos") →
  // RR.HH. reenvía a gestoría. Por eso el documento de "Mis Documentos" se crea PRIMERO: su id se
  // enlaza en disciplina_formularios_firmados.documento_id (migración 0078) para que el admin
  // pueda leer el estado real del acuse en vez de darlo siempre por firmado.
  const { data: doc, error: errorDoc } = await sb
    .from('documentos')
    .insert({
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: trabajadorId,
      tipo: 'disciplina',
      nombre: formDiscSeleccionado.nombre,
      meta: `Comunicación disciplinaria${exp ? ' · Expediente ' + exp.ref : ''} · Firmado por ${firmadoPor || 'RR.HH.'}`
    })
    .select()
    .single();
  if (errorDoc) {
    mostrarToast('Error al guardar: ' + errorDoc.message, false);
    return;
  }
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    trabajador_id: trabajadorId,
    expediente_id: expedienteId,
    documento_id: doc.id,
    formulario_nombre: formDiscSeleccionado.nombre,
    base_legal: formDiscSeleccionado.base,
    contenido: $('fdContenido').value.trim() || null,
    firmado_por: firmadoPor
  };
  const { error } = await sb.from('disciplina_formularios_firmados').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Firmado por RR.HH. ✓ Enviado a la persona trabajadora para su acuse de recibo', !error);
  if (!error) {
    cerrarFormularioDiscModal();
    await cargarDiscFormulariosFirmados();
    await registrarAuditoria('Disciplina', 'Formulario firmado y enviado a la persona trabajadora', payload.formulario_nombre);
  }
}

// =====================================================================
// LOTE 6 — Dirección y candidaturas (Formulario del Candidato, Informes, Panel de Dirección)
// =====================================================================

// ---------- Formulario del Candidato (admin) ----------
// Nota sobre 'recepcion' vs 'administracion': son dos puesto_key distintos a propósito (migración
// 0042: 'recepcion' = recepción del hotel con cobertura 24h M+T+N; 'administracion' = back-office,
// sin turnos). Que el título de 'recepcion' incluya la palabra "Administración" es solo el nombre
// literal de esa tarjeta en el prototipo (gestiona también tareas administrativas de front-desk) —
// no significa que comparta catálogo ni coeficientes con el puesto_key 'administracion', que sigue
// siendo independiente más abajo en este mismo array.
// César (07/11/2026, séptima vuelta): "así tenemos más coherencia en toda la producción" — el área
// de cada departamento es ahora un campo explícito (`area`), no algo deducido del texto entre
// paréntesis del label. Hacía falta: en "Obra / Reformas (Oficial, Peón)" el paréntesis NO es un
// área, son ejemplos de categoría de puesto (lo mismo que ahora RR.HH. rellena a mano en
// "Categoría:"/"Puesto:" del correo a gestoría) — deducirlo con una regex genérica daba
// "Departamento: Oficial, Peón", que está mal. `label` sigue siendo el único texto que se muestra en
// desplegables/tablas de toda la app; `area` es solo para ese correo.
const CANDIDATO_DEPARTAMENTOS = [
  { puestoKey: 'sala', label: 'Sala (Alimentos y Bebidas)', area: 'Alimentos y Bebidas' },
  { puestoKey: 'cocina', label: 'Cocina (Alimentos y Bebidas)', area: 'Alimentos y Bebidas' },
  { puestoKey: 'mantenimiento', label: 'Mantenimiento', area: 'Mantenimiento' },
  { puestoKey: 'pisos', label: 'Pisos, Limpieza y Lavandería', area: 'Pisos, Limpieza y Lavandería' },
  { puestoKey: 'recepcion', label: 'Recepción / Administración', area: 'Recepción / Administración' },
  { puestoKey: 'reformas', label: 'Obra / Reformas (Oficial, Peón)', area: 'Obra / Reformas' },
  { puestoKey: 'administracion', label: 'Administración, RR.HH., Facturación y Compras', area: 'Administración, RR.HH., Facturación y Compras' }
];
// Busca el área por puesto_key (fuente fiable) y solo si el candidato no tiene puesto_key de
// catálogo (registro antiguo o departamento libre) cae al texto de puesto_label como respaldo.
function _areaParaCorreoGestoria(puestoKey, labelRespaldo) {
  const dept = CANDIDATO_DEPARTAMENTOS.find((d) => d.puestoKey === puestoKey);
  if (dept) return dept.area;
  if (!labelRespaldo) return '—';
  const m = /^(.*?)\s*\((.*)\)\s*$/.exec(labelRespaldo.trim());
  return m ? m[2] : labelRespaldo;
}
// César (07/11/2026): "en la ficha también pone supervisor y no has puesto nada [...] esto también
// es absurdo que salga vacío" — al dar de alta se intenta primero el responsable REAL asignado en
// el Organigrama para ese departamento (dato real de este hotel); solo si ese departamento no tiene
// responsable asignado todavía se usa un cargo genérico por puesto, para no dejarlo en blanco.
const SUPERVISOR_PUESTO_POR_DEFECTO = {
  sala: 'Metre',
  cocina: 'Jefe/a de cocina',
  mantenimiento: 'Jefe/a de Mantenimiento',
  pisos: 'Gobernanta/e',
  recepcion: 'Jefe/a de Recepción',
  reformas: 'Encargado/a de Obra',
  administracion: 'Jefe/a de Administración'
};
function _supervisorPorDefecto(departamentoLabel, puestoKey) {
  const enOrganigrama = (organigramaCache || []).find((n) => n.dept === departamentoLabel);
  if (enOrganigrama && enOrganigrama.responsable_nombre) return enOrganigrama.responsable_nombre;
  return SUPERVISOR_PUESTO_POR_DEFECTO[puestoKey] || null;
}
const CANDIDATO_ESTADOS = {
  recibida: ['📥 Recibida', 'b-amber'],
  formulario_enviado: ['✉️ Formulario Fase 1 enviado', 'b-amber'],
  formulario_recibido: ['📨 Formulario Fase 1 recibido', 'b-amber'],
  entrevista_programada: ['📅 Entrevista programada', 'b-amber'],
  entrevista_realizada: ['🗣 Entrevista realizada', 'b-amber'],
  aprobado: ['✔️ Aprobado', 'b-emerald'],
  rechazado: ['✖ Rechazado', 'b-rose'],
  caducado_rgpd: ['🔒 Caducado (RGPD)', 'b-slate'],
  fusionado_duplicado: ['🔗 Fusionado (duplicado)', 'b-slate'],
  alta_realizada: ['🏁 Alta de ficha realizada', 'b-slate']
};
// César (02/11/2026, cuarta vuelta): "si cambias el estado, yo puedo cambiar aprobado y después me
// deja cambiar hacia atrás entrevista realizada y no debería volver atrás nunca [...] si hoy hay un
// técnico de recursos humanos y ese técnico mañana se da de baja [...] el técnico que sustituya
// pueda ver todo sin tener que preguntar nada" — mismo ranking que ya usa el servidor para decidir
// qué ficha "pesa más" al fusionar duplicados (_rango_estado_candidato, migración 0102), reutilizado
// aquí para bloquear cualquier retroceso accidental en el desplegable de Estado. "Rechazado" es la
// única excepción: se puede rechazar desde cualquier punto del proceso (es una decisión, no un paso
// atrás), aunque su rango numérico sea menor que el de pasos más avanzados como "Aprobado".
const CANDIDATO_ESTADO_RANGO = {
  recibida: 0,
  formulario_enviado: 1,
  entrevista_programada: 2,
  formulario_recibido: 3,
  entrevista_realizada: 4,
  rechazado: 5,
  aprobado: 6,
  alta_realizada: 7
};
function _candidatoPuedeAvanzarEstado(actual, nuevo) {
  if (!actual || actual === nuevo) return true;
  if (nuevo === 'rechazado') return true;
  const rangoActual = CANDIDATO_ESTADO_RANGO[actual] ?? 0;
  const rangoNuevo = CANDIDATO_ESTADO_RANGO[nuevo] ?? 0;
  return rangoNuevo >= rangoActual;
}

// Documentos oficiales reales (bytes idénticos a los del sistema original del cliente) — se
// descargan tal cual y se leen con SheetJS al recibir el formulario/la entrevista cumplimentados.
const CANDIDATO_FORM_XLSX_NOMBRE = 'RRHH_Cesar_Manccini_Formulario_del_Candidato_PROTEGIDO.xlsx';
const CANDIDATO_FORM_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CANDIDATO_FORM_XLSX_B64 = "UEsDBBQAAAAIAHNSE11Gx01IlQAAAM0AAAAQAAAAZG9jUHJvcHMvYXBwLnhtbE3PTQvCMAwG4L9SdreZih6kDkQ9ip68zy51hbYpbYT67+0EP255ecgboi6JIia2mEXxLuRtMzLHDUDWI/o+y8qhiqHke64x3YGMsRoPpB8eA8OibdeAhTEMOMzit7Dp1C5GZ3XPlkJ3sjpRJsPiWDQ6sScfq9wcChDneiU+ixNLOZcrBf+LU8sVU57mym/8ZAW/B7oXUEsDBBQAAAAIAHNSE10+Ujk2FQEAAGgCAAARAAAAZG9jUHJvcHMvY29yZS54bWzFkkFuwyAQRa8SsbcBu4kS5HjRVF3VUqVaatUdgkmCamwEVE6O1HP0YsXUcRol+y4ZPm/eiCmEYaKz8Gw7A9YrcLODblrHhFmjvfeGYezEHjR3aUi04XLbWc19ONodNlx88B3gjJAF1uC55J7jAZiYiYjKQgomLHDf2REvxYQ3n7aJMCkwNKCh9Q7TlGJUbr6/HLezirdCqFYV+MwZmB6sdr8FkBM4Vm/S4w1GY/Lg1JTq+z7t85gLo1D8Vj29xKkT1Tof2kN45RTzRwNrdOr8mm8e6kdUZoTOE7JIyLymS0ZXLL97H1wv/M7CupNqq/7ZOAu6y4Suakqi8eqP8UmwLMJ2NNz5aizcH6+/5DoSa5dLVf4AUEsDBBQAAAAIAHNSE11NP4As2wUAAIAaAAATAAAAeGwvdGhlbWUvdGhlbWUxLnhtbO1ZS4/bNhC+F+h/IHR39JasRbyBLdtJm90kyG5S5EjLtMUsJRoivbtGEKDXXgoUSIteCvTWQ1EgQHvqpf8mQZv+iFKUH5RN5dF4gRSNDdjk8JvhxxlySErXb1xmBJyjgmGadwz7mmUAlCd0jPNpx3hwOmy1DcA4zMeQ0Bx1jAVixo3DTz+5Dg94ijIEhH7ODmDHSDmfHZgmS4QYsmt0hnLRNqFFBrmoFlNzXMALYTcjpmNZgZlBnBsgh5kwe3cywQkCp6VJ43BlfEDET85ZKUhIcZLIHlUNiR2f2eUfW7CYFOAcko4h+hnTi1N0yQ1AIOOioWNY8mOYh9fNtRLhDbqK3lB+lnpLhfGZI/WK6Wit6Hm+F3TX9p3K/i5uEA6CQbC2JwEwScRI7R2s34t6fX+JVUBVUWO7H/Zdu4ZX7Ls7+K5ffmt4d4P3dvDDYbzxoQKqir7GJ6ETezW8v8EHO/jQ6va9sIaXoJTg/GwHbfmBG69Gu4ZMKLmlhUe+NwydJXyDMpXZVennvGmuZfAxLYYCIIMLOc4BX8zQBCYCF0OCRwUGR3iaiok3gzllQmw51tByxW/59WRJegQeIKhoV6KE7YhKPoAlBZ7xjvG5sGookEdzcJPyFCfLXnc1bsF8qmq8+umbv3/4Evz164+vnn2rxzMV//KXr17+/sfrzHMV/uK75y9/e/7i+6///PmZBt4t4EiFn+IMMXAHXYD7NBND03SARsW7aZymENc0YCqQGuBAOE4F3llAosP1UN2FDwuRI3TAm/PHNa4naTHnWAO8nWY14DGlpEcL7XBul32pw5nnU33nxVzF3YfwXNd3vBXgwXwmJjvWmYxTVKN5j4howynKEQdlGz1DSKP2COOaX49xUlBGJxw8wqAHsdYlp3jE9Uq3cCbistARFKGu+eb4IehRojPfR+d1pFgWkOhMIlJz40045zDTMoYZUZFHkKc6kieLIqk5nHER6SkiFAzGiDGdzt1iUaN7W+QWfdiPySKrIwuOz3TII0ipiuzTsziF2UzLGeepiv2MnYkpCsE9yrUkaH2FlHURB5g3hvshRvzdlvUDkYH0E6RsmRe6JYFofT0uyASifLkF1JJ5hvM3ZvatnO5fdU6/smy+/zzeLbB2NW1n7ybcfzBn9+E8v4fEMvmYsj+m7P9jym5ay/tP1JvcbKrnc2kmazysTzAhJ3xB0BGTWZ2J4Y2HQigrUml9N5ilorjsroabFlCWQUH5F5inJymciW5s2cOULU1PGZhRJvYFo9G23Ffm2TEdV1LbXl1HhQLkG7nYV1ZysQvxShqEm3vX2rysTZlKwJdG356E0lmdhKshEbpvR8K29sUi0rBo269jYSpREesPwPJJhu9VjMR8gwSNyzhV+qvo7j3STc6sD9vRDC/y9hbpGgllutVJKNMwhWO0Ld5zrKNIH2pHSyNsX0Wszd3cQPJ6DVyINef6wkwCZx1jIk6EopjNhD1W5k1IpnnHSPjS0f8ms8wKxvuQpRVMNlXjzzBHBSA4E3NdDQPJN9xsJ7Q+XHKR9eF5ztwOMppMUMIbJJuqaKuMaFvfE1xW6FyQPknHF2BE5sV9KBzlh3bpwDFmfO3NMS6Uyb3x4la6Wi7F2mOyzRKFZJbC5Y6iJvMKLstrOso4JNPtUZk6F46mw33sum9W2kqaDRtI2JjFrm6TV1i5ela+NtdFbev1u8T7bwgKtbaemqun1rR37PFAoHQXNPjNaYzme+4G27PWVM6VsrbzPoKOHouZ3xfH1TnhrLr5X4o7Qrx6klxlAildZZdLDuYF7hhPLL/rxY4ft6y2P2h5rme12n7XbXV937UHvm31e85T4RSeZrZf9T0U9xmyWL5ukfKdVy7Z6ph9LaGZSeU52JTK8pWL7TS/cgFYeOZJ4AwjN+oFrcjtDltev9duRXHQa/WDOOwP+7HfjoZPDXAuwV7Xjb1g0G4Fdhy3vMAq6bejVug5TtcLu+2B13269LUY+ep/5V7J6/AfUEsDBBQAAAAIAHNSE13KWM+1CA0AAE81AAAYAAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1szVtrb9u4Ev0rRBZYtEBhWy9LctoAqeO2AdIkSNK9d+9iP9ASnbCVRVePpOmvvzOkZCqxTCp7n/2Q2iLFIedx5sxIfvsgim/lHWMV+bHO8vLdwV1VbWbjcZncsTUtR2LDchhZiWJNK/ha3I7LTcFoKm9aZ2N3MpmO15TnB0dv5bXL4uitqKuM5+yyIGW9XtPi8T3LxMO7A+egvXDFb+8qvDA+eruht+yaVV82lwV8G29XSfma5SUXOSnY6t3BsTNbOBMP75BTfuPsoex8JuWdePhY8PQMRMNJJgekostrlrGkYqkUjqddCvENp5+mOAXulxNQCoX/7tmcZRkKg61+b+QebLeFN3Y/t/I/SP3AeZe0ZHOR/Y2n1R2IhD2kbEXrrLoSD59Yc+gAF0xEVsq/5EFN9g9IUpeVWLc3ww6qx4y9O5gekDXP5ZU1/dForXOn547cKHCCqRtY13CbNdxna/jhKHQmsRfal/CaJbznSwxewW9W8J+t4Dgj3w3CyBlwkKBVxtSL5DpjpVFpjxNa0aO3hXggBd4Lg/B5ewF0IO0QjfRet8aByQlOeg+zSpwEbvTugOfo0NdVAcMcpFRHaPI6owUXYOKMJDRPeUor8XZcgTicM06eyfUGyfWU3FjKxbDaWcdv1gmM6/hyHXfSv3+M91m5oQmoFAK6ZMU9Ozj6/Osvru8dpnWGpyJXV58+EcOBgkEbCbob6T3QdNA6079woF9/iVx3cnjDCH2sU7oWJaEkKVjCCjnkHJrOFw7aV6j25ew/XzRonUit4w5xOCJhK+HKXjle2bCiFDnNDOeJn0eCM9lKd/bo9WjeeHZdULKh8Ae8PWXwqaKAz5Ugs6cS5XJzXK6Ult2nFEef3HH2nZkld3SPAMcqwN05rjfIEI4KQdd7iac5IwAdcK/WDKwkvdtu1vYN+/b1TpogDvbo51yslwXboyDfqqBACwrMgo43kBZ5CufrlxVYZU21rKlZljI6eHROE77mBh+bWqWGWmpolnpW39JikNTQKjXSUiOz1EVZ0VSQhN/zbI+4yCou1uJii7/A2dA5IZ7TPeJimzhXY4Y7MYs74UUXpHoFulagcDs52bEYUSSmw7lWzHBdLcs1y5qLomCCSPpYNEfkiegX7FoFe1qwZxZ8wzIQ53mHK5Hv8dFmCZM8f4cVDcvmbmAExyO3wUGa0FRtcw1aKXt3GVix0NWw4VpgwyGShdvczYoZrsYM14IZ7jCRVsBwNWC4FsDwhom0goa7wwW8ySD7exOz/b3RacoF1I59+2pvNljc64iyRLtDzqFg24ObnjXWPR3rniXWXaMka3B7Org9S3B7RknWsPZ2wtobFtaeJaz90eIHUBvIiwmnvXuzB7Ong9mzBPMc8m8hiW5V0CX9ugfnPGs0ezqaPUs033C23kiZKXDdLreG8k7Afug+SuBZI9zTEe5ZInxOK3YrMKN44SFQ7kKsWCmz9h7h1lj3NEHwLAThQ50jQ2B7eJ5nZQf+5LkD+s6wctUxO2DQdUDi9u2uXcLggr6Oed+W34e5oG+Nfl9Hv29L7X/ZBX0rNPi6rPAtZcVLXdC3lhq+LjV8S6lhcUHfWmr40x0XHFbI+6HZBaejC/CIkmCbpze9tQuYHFADgW8BghvpdhT7kjXNsNbeU+n5VgTwNQL4FgQ44eVG5HzJFY++EwUt+J4a3LfCQaCLhcBSLPzG7pTDJdh96pUXWGuFoNN2srCH4xU3+Vlg5Q/BTn8hGNZfCMz9haM58ns3OKzLOpOF8GXB7wEN0B6PZC7yEnyhrVFlS6bt0YBzvrr6eHkC084uLk8+npy87j2bvQkRaLQIGrQwqUKHd9CEd7jncKfnHy6uPh/PT+GMjnN4Tt7/+osTe4fXp/Njcn3x/mpBLq8ubhZzPeNkQU6Oby6uTZ1ITS2ChlpEhu02eOCGo9hkpyac4z1HuWIYKiVdZkwiNARsRZVZZuSPpjcD5gMjLtbYKaJkTK5FwhlaEu/4JCqWvSFw+Yr+bMEeZ9BMj/9pOndkOcnT2fGwc8fmc3/gTQthRj6yEp+d0IJk2PsqRMJKREhTg5LIphmgWQluuqqrGjD1DaGlin7Ic2uoqu9pVlN8frTtrG/7j5sahIIQCAkqV6GJKFL8H6eDlBXPujlrZNDfdPIS/U2dQfqbOmb9nbFbDvGr8/vseVCj7TmcDX0mFeTVcVGNyHTkjCjB8H4NiqObjCdPKAJZM1QUmoEpsiATByhG379U9xtV4r5IJd4wlXhmlZygH+UQPgUX5YycC/AfkrAU2/QIhblKumBiUErCpMeUNLsXRCwzftvRQ8ZuweTNCgUDR/1Jc6RwebkCfSJ7LJVu86YZxqS/yvWNevFfpJdgmF4Cm17AlneokssatEHYV3l8cHTctBrD3dMEA+8NHDip+KrrGKCnGgNOf8/Ay6ruhI0oKtom/EciNqLkHcfiBb/lqpWTpwK0Sskfe5pfuBV0PfA8+RmisHqGAsqOChWZQsU/jWqfvkjtw5B9akF2GY7FfTdCz1riJz2zGdfeCeiE/KzOySajPwVZq5EffC0V8Qf7OiMOobiccwheS9ztl/JPhWsNFBpQ9A36cYkPYBIIbBjcymdo1Jym6i75uB6Gb2FXRt22D6bikUlZUVdZbUJVTKJ/7KmQYUlnGptJ0clifnZ81eENv5P5xfn14vzm9PMp/L0AmnBG5sfnJ6dIFvpoTyvCQHvCtgkWGZ73Tax8KByWKEKVKLx9j94W2fgM+L8sPlccbIoulrIkQ3f5XjOZdJVTrsBXM15JD2C5zJt1UWwJdb0m9zDKILxhFG9bbR8nlphyNxnDCkN9hzRN7hnkDwYwy35gNGOuBscH/KyxLqZ5U5YAuqZCzpK5C5IV7US2xAOY9b3mAFpFy5caqAEAA16b0gYNVjQrJTMSgM9SKq/qVA6C+DUv12aADpvE5dthItQleeiZbXBccin6jXQ39LQFWfz98mpxffxZfoForDTxk0Fbt1bpPAwEkMUwr1pGiNkeDytDH0/fkioYL5MCjIUTbzEvdjnUIIZl1NJOhzBsUhV2F/d6qspT3p4Htf2PRD+gyz59O2JMZ72PRUNrVR9qhh/aGX6o235haNx6+wz1kWyfcfbWg6G1xxfq0j6M7DvUJXkYm3coH4jOSPMP7Gz+BxPcSe8RrOV6tNO9i4Z17yJL9+5cVJC4ALjumcIEAJyW7Oby5SkOXO5VGwwNfLzutURkb/NFus0XuVa0jhoOO41GrumMFg7rjLBQB4K54W3bMIeYUJxzRvBRL2jgaWm/REitCuCsRcl06lYITzuBg7ANgSShiKyFevMCrmEWoJLA9WE+TFCv7kH+UNdLZGmwPaB0Faz/iuI27xW7k6gCDCa5Y8m3pfihiCXbdMhiQ7crgT2hZvU2izywpbGwiBoCHbpmV/LNanZBzUixyoZsPidqi7KzSUwlUgPFU222fC2pGwYF1yrVfL2FujNtmV03l2lYf3UHOUw35aQFgd09dkldY7ASCDIg/x0W8lC2KLivWM6KTM1ZikzlSYY5WLwekWvelZqjL5WMtvvC2+qcQn7+2eQMzMAoqskNeFD0CgF2e6NcDBaoiprLe3mOZSJVL+8g7G0Lbw7KSVCA0YjBDkIMe3srmr6M3715Tu9+J8dfbi6uTv9x/KQzNL/4/OX8dA4XL84X1714MbXjRbhzKg3mUfQ/YGndwOrQMbTXv8y7kIqA6A7JMlp850lxrJu68Utok7bgEwY1MwiPtQPFjhXI44YBeoERyGPXbFAA8sX/B6kz2SVuOy8T82E9u9oaYJ4aCGDsm3UGqAxBgC9Wbp5QUigt6lz2I2SrXWJxhmVFLtpGhRwAv77nqIOCZaovk8rCJO8i2y7p3UlfCG4YXM8aEyAQMnNWP8pQkU/T+hsYOkKxVMpIrcSCLaGur6hKz232FKp1kvUate128m1tlcr5nTA1mle31OPAbkLNjuPpf5aqx9Zn7rEm33FoJcKxRto4+rdQ9dj6PCzW5DuOrTt0Jt3XZCf/HbLeCjK9+DfZKWydye5Lr5OBb71OnjyWetrn2Q72JdFx55375tcb2PaTP6pQP684E8k3luJPK9QPM9TVL3n2/DreLd/2F8uvMENd5cjx8BcU3a+fHiHCQPnf1EVaV+IDzypWqIUSlsvkKb8pDjwXkGBzdQU8nVWse0Wt2r2ygZKkusGnO917tttoFt3uXX3fDpeADGoZWpYPokghk35wF/hLhTUrbuXvTBDg6rySLyZ3Lqvfu0Cams1j98kNzcjUmc2nvSNRNJsDX+kZCWK4Z9K7WggjYd9I6M3mod8rxwc5vSMxjMS9I9MA5Ex7R0DOtPeeAPYW9J4ngnsir3fXoJ1QamesNa1+ZvSZFrdgaJKxFRpnBOhUqDiQnyuxkZ8gSpaigihpv90xmkrPGnloaFG1X1DI9jdUR/8EUEsDBBQAAAAIAHNSE10mQg+FvQMAAHIiAAANAAAAeGwvc3R5bGVzLnhtbOVabW+bMBD+K4gfMBJIaJiSSG20SJO2qVL7YV+dYBJrBjPjdEl//XyYkLT1pU1LXtoSVdg+7u65584GTPuFWnF6M6dUOcuUZ8XAnSuVf/W8YjqnKSm+iJxmWpIImRKlu3LmFbmkJC5AKeWe32qFXkpY5g772SIdp6pwpmKRqYHbcr1hPxHZZqTnmgF9KUmpc0f4wB0RziaSldeSlPGVGfZhYCq4kI7SUOjAbcNIcW/EbdMDlJWdlGVCwqBnPOzjZ1IZfcan36TPY/l5GpucTQbueOx/u+hcdR847pyA1AMnsgo2bF12W63jBHuYPL6csPJUaBOM83rqBa4ZGPZzohSV2Vh3Sp1y8InIqdq3q1ynbCbJqu133RcrFIKzGFzORtupj1xHsXJt+NKN9BH0otCPeu1Wp1eyWF3NspguaTxwwzJJ3pabGkB50lFOhIyprONsu+uhYZ/TRGl1yWZzOCuRgw+hlEh1I2ZkJjJSkrDWqBra7JRyfgOr4+/kge1l4phl7nsMK5wDXK+bGlDVNGZMB+xvWzO2t8wG/qvsOjm7E+pqocPJyv7fhVD0WtKELcv+MqkBYNa7uHWS53x1LbXJqWLgof1yj7owakWHi+kfamzOWRzTbE3KMsGBBecKrH2uwPxzBfYcY5eczbKUmgn2RqxkbcuZC8nuNQJYIGEdcJ07KhWbQn+qL6DlivnW2HbMztOSHm6A+ccj/RQUv59ILp7JycmK5TQUv2CGlg8Cxm0D/Hc+R5jnn03/Y2fznyT5LV1+/LJtONDzLdxPk9FGZ+inyeeOt6gG3tF2vAo1YH3H03kD1ne8lBwWu6XADvcW0eCTeFPPqq99EG0gK/tN+6MEfHhIez/lNXiDOD3e8+LXfyf8ProLvQOG90F8Hhw/rQmv2n3d2uJ9sMFbjzqwLz9wf8GnL75B4EwWjCuW1evgZnNX21RkwulDo1olpglZcHVbCwfupv2TxmyR+vVV10BFddWm/QM2sdth/WFD+6p2yUdVV84mo80nj1Z1gMJjybg87BJMx8jsEpBhfjAEmI7Rwvx8pHh6aDxGhmHrWSU9VKeH6hgtm2RU/jA/dh34nmOPNIqCIAwxRkcjK4IRxlsYwp/dGoYNNDA/4Gk/rvFs4xWyuw6wnO6qECxSvBKxSHGuQWLnDTSiyJ5tzA9oYFnAagf82/1ATdl1ggCyimHDZjAuiSJMArVor9EwRNgJ4WfPDzZLgiCK7BKQ2REEASaB2YhLMASAAZMEQXkffHQ/8tb3KW/zXybD/1BLAwQUAAAACABzUhNdl4q7HMAAAAATAgAACwAAAF9yZWxzLy5yZWxznZK5bsMwDEB/xdCeMAfQIYgzZfEWBPkBVqIP2BIFikWdv6/apXGQCxl5PTwS3B5pQO04pLaLqRj9EFJpWtW4AUi2JY9pzpFCrtQsHjWH0kBE22NDsFosPkAuGWa3vWQWp3OkV4hc152lPdsvT0FvgK86THFCaUhLMw7wzdJ/MvfzDDVF5UojlVsaeNPl/nbgSdGhIlgWmkXJ06IdpX8dx/aQ0+mvYyK0elvo+XFoVAqO3GMljHFitP41gskP7H4AUEsDBBQAAAAIAHNSE10gs2N5WwEAAFoCAAAPAAAAeGwvd29ya2Jvb2sueG1sjZFBT+MwEIX/SuQ7JO0usK2aXqhYkBAgQHB240kzqu2JxhMC/PqdJAqLtJc92e9N8ubly6YnPu6Jjtl78DGVphFp13meqgaCTafUQtRJTRysqORDnloG61IDIMHny6I4z4PFaLabOeuB8+1muLwg9OmvP8jsDRPu0aN8lGa8ezBZwIgBP8GVpjBZaqi/JsZPimL9U8XkfWkW0+AFWLD6x34a+jzbfRqd91eMjvrSLIsfF5r4MeuTxVJlP6pXdNLoI6vi55d3DXhoRDPOfg2m2P2jFaTSnBcqa+Qk46axp60E30CXTqoTukIvwDsr8JupazEehjpKI/+GY0Q3nxP3Nf8PeaprrGBHVRcgyoSewQ8FY2qwTSaLNkBprvSlzltGGuDolhs3gRJt9g07r1EHfOOmjnMxBzVGcHealdRX2NUDZ8Mx5qwWxXKlMDrvL9W7j7dk3fyd87/e/gFQSwMEFAAAAAgAc1ITXSQem6KtAAAA+AEAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc7WRPQ6DMAyFrxLlADVQqUMFTF1YKy4QBfMjEhLFrgq3L4UBkDp0YbKeLX/vyU6faBR3bqC28yRGawbKZMvs7wCkW7SKLs7jME9qF6ziWYYGvNK9ahCSKLpB2DNknu6Zopw8/kN0dd1pfDj9sjjwDzC8XeipRWQpShUa5EzCaLY2wVLiy0yWoqgyGYoqlnBaIOLJIG1pVn2wT06053kXN/dFrs3jCa7fDHB4dP4BUEsDBBQAAAAIAHNSE11lkHmSGQEAAM8DAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbK2TTU7DMBCFrxJlWyUuLFigphtgC11wAWNPGqv+k2da0tszTtpKoBIVhU2seN68z56XrN6PEbDonfXYlB1RfBQCVQdOYh0ieK60ITlJ/Jq2Ikq1k1sQ98vlg1DBE3iqKHuU69UztHJvqXjpeRtN8E2ZwGJZPI3CzGpKGaM1ShLXxcHrH5TqRKi5c9BgZyIuWFCKq4Rc+R1w6ns7QEpGQ7GRiV6lY5XorUA6WsB62uLKGUPbGgU6qL3jlhpjAqmxAyBn69F0MU0mnjCMz7vZ/MFmCsjKTQoRObEEf8edI8ndVWQjSGSmr3ghsvXs+0FOW4O+kc3j/QxpN+SBYljmz/h7xhf/G87xEcLuvz+xvNZOGn/mi+E/Xn8BUEsBAhQDFAAAAAgAc1ITXUbHTUiVAAAAzQAAABAAAAAAAAAAAAAAAIABAAAAAGRvY1Byb3BzL2FwcC54bWxQSwECFAMUAAAACABzUhNdPlI5NhUBAABoAgAAEQAAAAAAAAAAAAAAgAHDAAAAZG9jUHJvcHMvY29yZS54bWxQSwECFAMUAAAACABzUhNdTT+ALNsFAACAGgAAEwAAAAAAAAAAAAAAgAEHAgAAeGwvdGhlbWUvdGhlbWUxLnhtbFBLAQIUAxQAAAAIAHNSE13KWM+1CA0AAE81AAAYAAAAAAAAAAAAAACAgRMIAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwECFAMUAAAACABzUhNdJkIPhb0DAAByIgAADQAAAAAAAAAAAAAAgAFRFQAAeGwvc3R5bGVzLnhtbFBLAQIUAxQAAAAIAHNSE12XirscwAAAABMCAAALAAAAAAAAAAAAAACAATkZAABfcmVscy8ucmVsc1BLAQIUAxQAAAAIAHNSE10gs2N5WwEAAFoCAAAPAAAAAAAAAAAAAACAASIaAAB4bC93b3JrYm9vay54bWxQSwECFAMUAAAACABzUhNdJB6boq0AAAD4AQAAGgAAAAAAAAAAAAAAgAGqGwAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAMUAAAACABzUhNdZZB5khkBAADPAwAAEwAAAAAAAAAAAAAAgAGPHAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLBQYAAAAACQAJAD4CAADZHQAAAAA=";
const ENTREVISTA_XLSX_NOMBRE = 'RRHH_Cesar_Manccini_Entrevista_Estructurada_PLANTILLA_PROTEGIDA.xlsx';
const ENTREVISTA_XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ENTREVISTA_XLSX_B64 = "UEsDBBQAAAAIAHZlE11Gx01IlQAAAM0AAAAQAAAAZG9jUHJvcHMvYXBwLnhtbE3PTQvCMAwG4L9SdreZih6kDkQ9ip68zy51hbYpbYT67+0EP255ecgboi6JIia2mEXxLuRtMzLHDUDWI/o+y8qhiqHke64x3YGMsRoPpB8eA8OibdeAhTEMOMzit7Dp1C5GZ3XPlkJ3sjpRJsPiWDQ6sScfq9wcChDneiU+ixNLOZcrBf+LU8sVU57mym/8ZAW/B7oXUEsDBBQAAAAIAHZlE11DmAHkFwEAAGgCAAARAAAAZG9jUHJvcHMvY29yZS54bWzFkk1OwzAQha9SeZ84zk/VWmkWFLEiEhKRQOwse9paxI5lG6U9EufgYjghTanKnqXfPH/zRjMlN5R3Fp5sZ8B6CW5xVK12lJsNOnhvKMaOH0AxFweHDsVdZxXz4Wn32DD+zvaA0yRZYgWeCeYZHoCRmYmoKgWn3ALznZ3wgs9482HbESY4hhYUaO8wiQlG1fbr0zG7qJnmXGpZ4gtnYHqwyv0IIGbwqP5JHysYTc6jk7Or7/u4z0ZfGIXg1/rxeZw6ktr50B7CLyepPxnYoHPnl2x73zygKk1IESXLKCkasqJkTbP8bch6le8SWHVC7uQ/J05D3FVE1g1JaZ7RvPiV+BywKsN1tMz5ehLuTrcrubWM2vVRVd9QSwMEFAAAAAgAdmUTXU0/gCzbBQAAgBoAABMAAAB4bC90aGVtZS90aGVtZTEueG1s7VlLj9s2EL4X6H8gdHf0lqxFvIEt20mb3STIblLkSMu0xSwlGiK9u0YQoNdeChRIi14K9NZDUSBAe+ql/yZBm/6IUpQflE3l0XiBFI0N2OTwm+HHGXJIStdvXGYEnKOCYZp3DPuaZQCUJ3SM82nHeHA6bLUNwDjMx5DQHHWMBWLGjcNPP7kOD3iKMgSEfs4OYMdIOZ8dmCZLhBiya3SGctE2oUUGuagWU3NcwAthNyOmY1mBmUGcGyCHmTB7dzLBCQKnpUnjcGV8QMRPzlkpSEhxksgeVQ2JHZ/Z5R9bsJgU4BySjiH6GdOLU3TJDUAg46KhY1jyY5iH1821EuENuoreUH6WekuF8Zkj9YrpaK3oeb4XdNf2ncr+Lm4QDoJBsLYnATBJxEjtHazfi3p9f4lVQFVRY7sf9l27hlfsuzv4rl9+a3h3g/d28MNhvPGhAqqKvsYnoRN7Nby/wQc7+NDq9r2whpeglOD8bAdt+YEbr0a7hkwouaWFR743DJ0lfIMyldlV6ee8aa5l8DEthgIggws5zgFfzNAEJgIXQ4JHBQZHeJqKiTeDOWVCbDnW0HLFb/n1ZEl6BB4gqGhXooTtiEo+gCUFnvGO8bmwaiiQR3Nwk/IUJ8tedzVuwXyqarz66Zu/f/gS/PXrj6+efavHMxX/8pevXv7+x+vMcxX+4rvnL397/uL7r//8+ZkG3i3gSIWf4gwxcAddgPs0E0PTdIBGxbtpnKYQ1zRgKpAa4EA4TgXeWUCiw/VQ3YUPC5EjdMCb88c1ridpMedYA7ydZjXgMaWkRwvtcG6XfanDmedTfefFXMXdh/Bc13e8FeDBfCYmO9aZjFNUo3mPiGjDKcoRB2UbPUNIo/YI45pfj3FSUEYnHDzCoAex1iWneMT1SrdwJuKy0BEUoa755vgh6FGiM99H53WkWBaQ6EwiUnPjTTjnMNMyhhlRkUeQpzqSJ4siqTmccRHpKSIUDMaIMZ3O3WJRo3tb5BZ92I/JIqsjC47PdMgjSKmK7NOzOIXZTMsZ56mK/YydiSkKwT3KtSRofYWUdREHmDeG+yFG/N2W9QORgfQTpGyZF7olgWh9PS7IBKJ8uQXUknmG8zdm9q2c7l91Tr+ybL7/PN4tsHY1bWfvJtx/MGf34Ty/h8Qy+ZiyP6bs/2PKblrL+0/Um9xsqudzaSZrPKxPMCEnfEHQEZNZnYnhjYdCKCtSaX03mKWiuOyuhpsWUJZBQfkXmKcnKZyJbmzZw5QtTU8ZmFEm9gWj0bbcV+bZMR1XUtteXUeFAuQbudhXVnKxC/FKGoSbe9favKxNmUrAl0bfnoTSWZ2EqyERum9Hwrb2xSLSsGjbr2NhKlER6w/A8kmG71WMxHyDBI3LOFX6q+juPdJNzqwP29EML/L2FukaCWW61Uko0zCFY7Qt3nOso0gfakdLI2xfRazN3dxA8noNXIg15/rCTAJnHWMiToSimM2EPVbmTUimecdI+NLR/yazzArG+5ClFUw2VePPMEcFIDgTc10NA8k33GwntD5ccpH14XnO3A4ymkxQwhskm6poq4xoW98TXFboXJA+SccXYETmxX0oHOWHdunAMWZ87c0xLpTJvfHiVrpaLsXaY7LNEoVklsLljqIm8wouy2s6yjgk0+1RmToXjqbDfey6b1baSpoNG0jYmMWubpNXWLl6Vr4210Vt6/W7xPtvCAq1tp6aq6fWtHfs8UCgdBc0+M1pjOZ77gbbs9ZUzpWytvM+go4ei5nfF8fVOeGsuvlfijtCvHqSXGUCKV1ll0sO5gXuGE8sv+vFjh+3rLY/aHmuZ7XaftdtdX3ftQe+bfV7zlPhFJ5mtl/1PRT3GbJYvm6R8p1XLtnqmH0toZlJ5TnYlMrylYvtNL9yAVh45kngDCM36gWtyO0OW16/125FcdBr9YM47A/7sd+Ohk8NcC7BXteNvWDQbgV2HLe8wCrpt6NW6DlO1wu77YHXfbr0tRj56n/lXsnr8B9QSwMEFAAAAAgAdmUTXbRcoNcmLgAAYC8BABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWzNfW2TGzeS5l9haCM25i4UaibqnZa1YXV3gbz1zOnsmb2PF9XskkSbZPXwRbb86w9Zr6hiIhNiuyf2g9utfipRQBaQSCQSeN7+Vh1+PX4uy9Ps9912f/z+1efT6Wlxc3Ncfy53xfFN9VTuDfKxOuyKk/nn4dPN8elQFo+10G57o+bz+GZXbPav3r2t//bh8O5tdT5tN/vyw2F2PO92xeHr+3Jb/fb9K3jV/eGnzafPJ/zDzbu3T8Wn8ufy9I+nDwfzr5u+lMfNrtwfN9V+dig/fv/qB1j8p4pjlKgf+a9N+dvR+n12/Fz9pg+bxx/Nq01L5q9mp+Lh53Jbrk/lY/3yP6pq9/O62JZ/w/Zszd/m5inUwUNV/YqFrB5R0JRai+G7C/O/L+Vtud1iFUwD/tnW5lVfWRS0f+9qlddaM1p4KI7lbbX9v5vH02d86avZY/mxOG9Pwx+zNxDOYxX10E/Vb8uy1VKE71pX22P9c/ZbIxK8SaMojNPECK3Px1O1617warbb7Jv/F7+3WrYEozcqjSCq3zYVPJ6+bsvvX6VtEaotQk2KiKM3UTIPgCqiFgxawWAiCFHfUFIubOWyWr1Nm2tl3hWn4t3bQ/Xb7IBPG9D83v/B1LPR1JtBG736zMNrfOjWPGU6RmieMH/e7LGP/nw6GHhj3nJ697dzeTwdilm5M138WLy9OZm3IHSznrwu6IsM6iKhLhHHwMWjYf9oaD16+fIP+PJqVpjKPxw2h8Xsf5UfS9MZZj+V6/Jpvfn3f1Nh8N2eqVTUvylq2hk6XnW/Px3KL5vjyTTVNPi8Pp0PxeOkvXVJd01JgaMkNBqL41OxNj0GVVYevpSv3v2AVYXvqhlR4D1f4Lu/lkdCKhek7p5O1WLGaqouRwvlDIph1Bz3ao55NZseWx3xC26Nnh0lN1puC4odBamY0qQgNE8pRUpCitKaJASMtpJOW3lSl6LGQ6V5gRtauqEVCY1envafKm2akHxLP/5btXs4lDPTsahvll4xMm6L/ePm0XSL2d500mj+3a48mI5Lfd22wullu/P+ze/efnz3/37ffty/uf3ff7v94e9/uYsXOv4fb28+vnv7xUh8IVSS9SrJmmJcxvB//ryZldvZuq9yeZytK9ONjR1+rGancv94MI1Q0Xf4mNWeWXHcfNrjM0+FMaajzm9K2I0aj8PDFPlQ/GIEDgtK0W09Xb3v7730SKmUTpuSwozQaf8S1GmesiqEea9DnMqNXDS/LPKuw4iue99hiqgKXea4BsOUBtDUPKFq0GBEH7p3QzkJjV+vhtcrvhf98HTanM6P5jPbXanuGF1nOmzNEDhVp2I7ezpUu/JxYx44lJ/O+1NBTQZ37TtVMwBWcPG12iYqdxMpaNzEYYaH4E9sYllPCE+mbRXdtsBum4b0ZulsX+BuHwWN2ze4JdD4JcrRPscc79no/os2H5hscusXqbrJP/zX/U8/6Pu/mK+8MNq4MGZt20N32ylo3PZo6j1CP6e/h1hy6CAZHm6mIIgv63HbYoGj14x9lbEeSS3ZxU3GshPK3ZBuIeW0q/jBiJosvQRnf23mht83O6o5K79CPrS9h/EvIB2+Rjr9Gl/ewbjj3LbPuL7Kv/8bZPDd/RFnraeDWX+a/vyl/GP2z7OZpjblvpyd95P5bD/bV8fqdKiO/0F+t9T93ZxQ7oZ0C6lmqvr5H3/9i1ZqoVUM9FhZXgosjcDSKbDqBJLRgFwpeL1Skfkv4z0MyJq1WDB3L8SgmW+jwD3M1PxijWct5Jo56pucrx/L/adz8UtpvtnhqTqY7uXw7PjC332o1pURBcrDEETfF6bP7E/oU1KOdi6Irx5bc1FiBQLKVRdKcA5qHzlpTLdlTAz5ynS2lQr5PqMGj0IpflX1VB1xuTorHjblgV5OdUUQPtE9g+UMpodqdaPIvGZhRByjbtyMxhgFk4HWPlN7c2ayV+rGiPF6GtwSFbB6oscAzs3F2szUxnqdHfNxVzCpPTeWM5geKjtoLzDac8zvy3HjHNoLxtoLjPYCXnuD06NCvpcdq/1hcyxmn8r9ebOne1nI6MmN5Qymh2oNegqNni6HT6un0ENP4VhPodFTyOtpiCSp6NsN7Q/rxjd0mVe2SN688qKieeXFfcwrX4LbvHrIieY1os1rbMxrKpjXIWalhKCV8W3Ox03hCFR10mSfd2M5g+mhRkOfj02fvwxktLqMPfp8PO7zsenzMa+iZFBRwqtoY7oYxofpiGknTarIjeUMpocaDSpKjIoSl4oSDxUlYxUlRkUJr6IhnKZSYZI+VPW+Ca2hlNGQG8sZTA8VGjSUGg1dDoxWQ6mHhtKxhsxaXPGRITVE11T27YZzhR3LGIEg+O5oFhkYV3tqdgXIGOEd/w7ekvKioiXlxX0sKV+C25J6yImWNCMtaTBfrIJLf2688TPE/oK5NAaaGNbsWGEYeevYV2o+ZVcYNSYYLGcwPVSwHxOmiUbEMSbGDaLHRPtMNyaC+Y0R4zU2rNoCuMJlnahxGBOkGoFRoxvLGUwPtR7UCEaNrvX2uJUONcJYjWDUCLwahxVSIK2Qph3vODPafKr2R7Nm2m4ei0dyk+0uYJZNDJYzmA4ul02BWTYRw6xVnseyKRgvmwKzbAr4ZVPQL5veB+2qgQgd3gbUZm77zjYIzATlg3B4SXgZiVKTSFT7DB+J+j/nZjqYbcvZ52K2q3BOfax3iZuVXHGQQ1Dtm4i9hns3lLsh7YaWbmjVQfOJ1U1er8K5+U8IEWD8XQorBZEYVgp6V3gVxPI3HbzCIHnBkBNfODuTC6LSTC6Ie8zkQgnOmdxHTprJ2zIuZvLUzORCmDIYvNlA8GZ3RoF18BeD9OMICvkxGf+WwXIG08Glf2saaURcdtTDvw3G/m1g/NuA92+Dwb8NMl5nn8wcvVmft22IvMCYXT33kBrLGI25sZzB9FDBQWOZ0dhlt2g1lnloLBtrLDMay1iNhYO/GM7/9FAKXyRrNgRRyWwI4h5mQyjBaTZ85CSz0ZYxNRshLFbhZUhy/EGH2Sbk3VmMVG9ca+CQcVQZLGcwHV46qqZFRsTR40MPRzUcO6qhcVRD3lENB0c1FBzVQ/lxW/7u0hDjjTJYzmA6vPRGQ+ONhi5vNPTwRsOxNxoabzTkvdFwCOKHfBD/3WO5a3MSjRWt1pudmYZOVZdT5l5OhkwMn8FyBtPhZQw/DIzyXDH80COGH45j+GFglMfH8EMrnzJ8+RAL/w7ewvKiooXlxX0sLF+C28J6yIkWlkzqWIWRYF2HnYdQSGLdlfv1ptoXs+L4VK4x07LEX/DbJt993Kzr1Mv+6+IGvllDFWYolVRm6F33OnLEuLGcwfTQhGHERGbEXCqhVXzkMWKi8YiJzIiJeJ0OK55QXvGEQ3ZL2DjXRLrcbcgnt3zA8YZ+spXfIlmsxLlIdUO5G9JuaOmGVi0EIaOhYeEQpuJ6M0SXeZymPbiEUeuHUMl7DHbPYDmDaQZbMtiKxsat6v2i9xFcRj8m3fi2fYaPftzinFfO9u0UWB0+FfvNH0Ovem261dH0rPW5MUb7x2r2dWYW2ma4t3GTOn2IDou0VaB6nBvK3ZB2Q0s3tOqgSVgkCl+vouT1isjSGeu9PfkQMsceIiV202jwSSJ3FCySo2DRMD9HV8zP3hETvnB2YhZEpYlZEPeYmIUSnBOzj5w0MUf0xBxFi1UkpI5H1gETYXIujuiolvXaH0MAxUP5B32+hJl2GSxnMB1dTrumeUbEMe1GHtNuNJ52IzPtRvy0Gw177pGw5975+BvbOW0yT8hc0IjZhWewnMF0dLkLH8VGaa5d+MhjFz4a78JHsVEavwsfDfHW6Ip4qxAu4YvkbcbzoqyCuI/NuDLK6iMn2gw6yhqli1V8uZk4/qCDsxQJUdbihC4j+d2YgCqD5Qymo8uAqmmPEXH1d4+AajQOqEap6e98QDUaAqqREFB9OB/XZrGze9puioMxFfWRXO6w213ERFUZLGcwHV1GVaPMqM0VVY08oqrROKoaZUZtfFQ1HlzoWNiFP2CevSsKFzO77gyWM5iOL3fd4/kiJwZKo6HYY9c9Hu+6x/MbI8ZraPD+4itypb81TMK/g7WsgqhkWQVxD8sqlOC0rD5ykmWN6ZTpWBnLKgSi4yHOGn9rQoBZKWzrJGpxWR4zUVgGyxlMx5dRWNNgI+IaIR5R2HgchY2VGSF8FDYeVjyxEIUlEioqszg5nfdNMgWqcW0MTRueJfXIBGQZLGcwHV8GZOPA6NEVkI09ArLxOCAbB0aPfEA27hd8qzgUl4dxv4Z4H0fTMMEQHmgxV3hgOSSyNE7zU3k4Vns8XkcqP3Ku9N1Q7oa0G1q6oVXXYCa2FA8H0eL4MooSTqIo7TNCFKWxgLsKV2PHzSOeacJw6GP5UM6MvZ8dz7NDubWCdbhqW1e7p6I5yF8emmPszTldDLEMNoOMrLTVIvXthHI3pN3Q0g2tOmgSWYmz16skMP9dZs+Ov0UiJ5zEiRhZidNhfKTy+BgcwviKDFLv8AlfOD9hPy91VBD3mbCvTB31kRMnbDp1NJkvVomQOpoMTmsiOK1dpPORnEsSxmtlsJzBdHLptZo2GRHHXJJ4eK3J2GtNjNea8F5rMoysRNhcX2+LA60dZmedwXIG08nlznoCRjuunfXEY2c9Ge+sJ2C0w++sJ4PHlwgenzHV++Nuc0ID/+l8cOXdJIx3x2A5g+nk0rtLjHdHjI5WVx7eXTL27hLj3SW8d5cM3l0S/OmBJL5I1noKopL1FMQ9rKdQgtN6+shJ1rMt48J6hsZ6CsHnZNhXSEK+89dJJQ/bkvxyIdPj3VjOYHqoz9DjQ9PjXYf2xvV39Phw3OND0+P5Q3vJEJ1PpOj8Y/F0KlwaYiLyDJYzmE4uI/JJZDTkisgnHhH5ZByRTyKjIT4inwwR+USIyPfnl5orLerYm3GUq+0Zcw7oVUbCROUZLGcwnVxG5ZPYKM4VlU88ovLJOCqfxEZxfFQ+GaLyyRVR+W8NJvHv4K3r88L0griPdb0yTO8jJ1pXOkyfpMa6CsnQyRCmT4QwvZ2StsPrXTZH2g9jgvYMljOYTi6D9qZ1RsQ1HDyC9sk4aJ+kZjjwQftkWKMlQtD+cXPELNBhad3ckHPGKH5zcmNr1tafzUrtsKEvBEqYID6D5Qymk8sgfpIZNbqC+IlHED8ZB/GTzKiRD+Kn/Xpolc7FhXE65JekRH5JNImMpHx+ybIZSWYK3NV3LB7Ps/pT7TdtYKn9JsUb8uo3d+aIG8rdkHZDSze06vTAxJNSJcYw3qetc02diErlzJF0OFuVMmerUndWSSpnlaTD2ao0tL/+5aeN3lAzw20rxofK/l6f8ii2n/CWHzOBfSwPmGVY/MeswT9YqUVk5Ct1Hn+6d0O5G9JuaOmGVh00iXylyetVBuY/IQsz9ThqlcpHrdIh8TCVEw/TwclIX/KoFV84610IopJ3IYh7eBdCCU7vwkdO8i5S2rtIjXeRCUkAqXUPp+BddEcCSJciZVwKBssZTKeXLoVpkhFxzIWph0uRjl2K1LgUKe9SpINLkQouxRDEb/ah3AuSlHEdGCxnMJ1eug6pcR1Sl+uQergO6dh1SI3rkPKuQzaEUjMhlHpEi7A77zfrerdzV+xRdcayO6+nyJjwKoPlDKazy/BqNl/kxMBp1JZ5hFezcXg1m98YMV5tg/nOrkgKEIJifJGsYRVEJcMqiHsYVqEEp2H1kZMMa0bnAGTKGFbhTHQ2RIQzISLMXJeWMVFgBssZTGeXUWDTICPi6vAeUeBsHAXOlOnwfBQ4G6LAmbDHv662xYPxG5xWgdnAZ7CcwXR2uYGfBUZJrg38zGMDPxtv4GeBURK/gZ8NkdVMiKw2OWjldvZg/OSPZllbzXbn05mcrLuySIUxkVYG00P9BoWFRmGuSOu4PQ6FjSOtWWgUxkdasyHSml1xPdq3hsP4d/B29Xn3pQniPnb1yvvSfOREu0rfl5bFxq4KW//ZECnO+Egx/YlnXYis2YpoQwrkx2WCxgyWM5jOLoPGptFGxDVKPILG2ThonMVmlPBB42xYz2XJNVGyZpfiYBy4xtXdl+vyOCRcbYkDQWS0pns7qWI3ljOYHlo0qDgxKnZdyDbWgEPFyVjFiVExfyFb1q+rdJa6witLN7TqIGZZnvUrk/dZdhl3iydxt/YZV5glHyUtoyd5i5cpY07R2nzzdWsZk+/w8oji+Ga2etxUO/Pxv872my/llv7AmTPo4oZyN6Td0NINrTr1MOG4mm4I4yhp9ka5D2y9r59zRdI6MGJfZBcGXGHg7B0dxkVtYK6sFyk+NBfToblOTkhjaw/54RX6x2o/O56PZJ+Z7Zrn8NKrbfkF57fOXoxT5uskuM3+0QjRN3e31aL6FYPlDKYZbMlgqx6bRPRgHr02PzLzg7grf/KlgvakYMj1vdv6OSGyB/Mh6RN/l3tJZJV/hc/kHd0TSme9JUlWcpckeQ9/SSrCfSm/j6B4Kf+cdplgbnwmmAuXzJqnrI8sbLDXaUk00cGccYk4MOdAbdWon7KxXSjlujh/7uEYdQ9107b59w1KCqpKLFUJ3hF/I28vTquL8W84UFu1stSVoLpcPs6kIS51JRN1Jagu3s8xXc9S1zfsT4+uTNnOTuXOoUMmsMyBOQdqq6qWDlPUoSu6PGmdS4fpRIfIEjOXSIsyS4dXpBYL0T+hTMHwPi+lWJL3MrxXJhV7CcqGl04rBpgbwwtCYjHYhFQg3krL3MzcS5MDgQFzDtRWpYaBYJqGUq6BAB4R8O6hfiDA/AYlBW3Z5FlCljF7Q1UvTWuLyTXmQG1VytIWoLacFC/gkXDcPTRoC1BbfM4x2FxfIMSY18VT8Qf62s1xkmpfHAi3G7Ne+pgXrVcmIM2BOQdqq/qWXhXq1RWVnrTYpVc10atCvfKRabAJxuCKDOVvjSIKL+HtsyAr2mdB3sc+C0W47bOPoGifgU5cBgjRPgupy2CTrbX0ZE42uUfzDYu1cV76U1uXI6i5DPipPOw2p80j+jbH4nCotlsz3j5bR+OsBXAdUUMXqDnDRfeQpmpRRA47N5hzoO7AcG4PuxCHnSv91xLhhl37UD/sQhx2fOgewFqIQpvCQpI3MuA9B+YcqDlwyYErBzhpnbUCA2EFhj3oULU2Y1f+YlbVQzdp/zwc+iMDb/07aEPNLdUYUFtVt3oMLtWIkdapzmepBpOlGuBSDYSl2kD3t4KOTo/9BhYhHcVIl0wipuBFSfdzaZ3erLPTmhOvdRALQ+R1sBwj5RWGxXYPeOuVb9ZaVwUy0uXGcgbTDLZksFWPTSNdSD8HyD8HIgFdx0AnRbo8WOhADVmq+Lv4+S2SOnhRljqhdH5CfyZPnSTvM6Ffy1TnJShO6A6uOkCyOpDY6sCiqwOJr449bAMcVR0H5hyogWCrw6ahlMuC+hDWwYSxDpCyDgTOOrBI60BgrWPPbgHHTMeBOQdqIMjpANnpwElPBz78dDAhqANkqAOBog4sjjqQSOq6QFdhJoOGExHvSvxi5nEzT7i4k5m0DA7MOVADQVwHyFxHjaVOhx7JGTAhrwNkrwOBvg4s/jp4AQI7oUzB8j5zj+H5HHZSEYzl/TP2GBw0doA8diAR2YHFZAcSlR13/zpwTHYcmHOgBoLMDluGUs5x4OO6TgjtABntQKC0A4vTDgRSOxf3UncMktYht/XAcd1xoAaC7Q6Q7g6cfHfgQ3gHE8Y7QMo7EDjvwCK9A4n1ro9/FR8PSBNysL3xOu6FnvsOr7lrMoLke4OAI8vjwJwDNRB8eYCEedQI7HTsszUx4cwDJM0DgTUPLNo8+Ffw5gkvEQz4M/cqnk+dJxXBGPA/Y6/CwZ4HSJ8HBCva+FtbBHrQkskxsbDOw3FkiJkusDcr4tnXy2Sxxg8a54z13eKrf/ZYV8mIuKbqngNzDtQdOIqKITsfOOn5LBFmAHYPdQMQGfpAoOgDi6MPWmo6OirGgPccmHOg5sAlB64c4KR1/WptBS13HLuEt9jioKOEsyM46TSC05HDsRGcH8vZp7OxDW1EzUwOaKn+ed48Vf6BmvZNZKDGjeUMphlsyWCrHpsGaoL49QqQ0Q0ktgdASjjpoCG0vHFslCaIrE8ceXxiy41saeBeKErDl85PNYKsONUI8j5TjVCEe6rxERSnmraQy6kmwalGCgNa5H0Q8O6vffyD9sMCztdlwJwDtVUvaxpAXzdw+rqBj68bTHzdAH3dQPB1LUo8kDjxunt1HdrivFaOA48DNRAseIA0eODkwQMfIjyYMOEBUuGBwIUHFhkeSGx4zcGZbXvFe7Ee74Zv6/sVu7xVWqHMWU4OzDlQA0GSB8iSRw2uTqEeJzphQpQHyJQHAlUeWFx58AJkeUKZvCl+Jl2eJO9jiq8lzPMSFE2xgzIPkDMPJO5WsFjz4Dm0ecDx5nVgRI4DBtRAUOdhy1DKNQ582PNgQp8HyJ8HAoEeWAx6IFHo8elcHIceB+YcqIGg0QPk0QMnkR74MOnBhEoPkEsPBDI9sNj0oKWTcy4ohwANXt9sXPAvxdb43Kb7N464WRj23vlwWNyY6F/q65+bRed2Xez/MA9UD7+UOAEemwPm9Bn8rkp0UgUD5hyoO3C0fEQ2Pmoodp+gF+E+QTBePiIjHwiUfBBaexYt8Ru9fGTAew7MOVBz4JIDVw5w0jprNyG8Yjfhm6NT/EuEeeqZ2wuCvNc8de32go+gPE85thdCKUkrtJaEHU+elKSFDt2uNiV4S1CTY95ekt0v7vucmqYL/L5pk9HZUBTdL2LOlLjBnAN1B45NCW5ZhM4lyCDCmZJ4YkpwyyIUtixCa83WcvE5TIkbvOfAnAM1By45cOUAJ60b7gKHUL4MHMLh8CX+fhGJyqaRqJA/fmnfcjXJKTT99cNPP9JRp9B9wJLBcgbTDLZksFWPTaNOkXptfmDoSWLMg2jeUea9Sbj0oJb1kA08DbSHK4g8jktGlm/X0vK9UOCJL52fRQRZcRYR5H1mEaEI9yziIyjOIm0hF7NIFJjVDkEkN/nIlksaCQkvzEG4iEt3YcCcA7VVo8HeR+g6Rs50l8gn3SWapLtE6DpGguto0UVCR2/oDjnhDY1HZy5VJ0/ri0ttYUBtVcvSF6a2RE5Xe9wSl74mqS0RprZEQmqLxcEIEgkjSx6+R/Nfb+1/xdsvLTeG1i1zKzQH5hyogaBqBORqpMZYp1uPu6FhQtcIyNcIAmEjWIyNEF2xKSDFn/gyBYv8zK0AQd7LIl+7FeAjKFtkx1ZAhFsBEgshWLySECX8sGHjT50wPQ64bQAG1FadrHGA2wCR0wcfN8M1DibbABFuA0TCNoDF2QgSaSMff+KIGzkw50ANBHcjIHkjONkbwYe+ESb8jYAEjiAwOIJF4Qgtk+F/p/hTWyV60ciAOQfqDhwtGpEIkhqK3SfoRbhPkI0XjUgGCQIbJFh0kNBSJdKLRga858CcAzUHLjlw5QAnrbOWJP8KLkfhJfw89Uw2R0neZ566ls/RS1CcpxyMjkCwG04+s7UyjBVvR6S0qO2mpqs4H0ee37Fd5LeX0Ff702HzcN4Y+zM772eYpVhzdltMb8zipK0ibVcYMOdA3YEju4LkkOBkNbREGLvSPdTZFSSIBIEhEiyKSGiJER12xQ3ec2DOgZoDlxy4coCT1rXJN8CeklqBB6sjWLSOcMnr+OUdnskfR6p4hkfakt3//lQeNvWN7Hh28WN5xDPmWzNrVqeao7A4NUyFNpH661n5S7l7wj12l71z00MyWM5gmsGWDLbqsWl4K05fryDBGJdEWwhIe9iEt5jYVsuNyMa2YuvkY+xx8jG2/MaW6vCFYlt86cIMxcvKMxQv7zVD8UUwM5SHoDxDpY4ZKjMrKYLSbvKRLXc3FrJeuOmDy2dhwJwDtVUja/qo3VJnPkvsk88ST/JZYnRLY8EttQgfQWJ8lGJbHOcjB+YcqIGgfQTkfQQn8SP4MD/ChPoRkPsRBPJHsNgfQaJ/ZGJbxtCbyWFdHis755vWKpdNwpFFcqAGgi4SkC+SGl2dVn2ySSaUkYCckSCQRoLFGgnJFTsOUlSLL5O3xYKsaIsFeR9bLBThtsU+gqItThz7DAnuMxD0eJNPa/mnibDPwEa1Em6ngQFzDtRWnaxxgDsNidOZT3x2GpLJTkOCOw2JsNNgEUiCxCDJR7U4DkkOzDlQA0EjCcgjCU4iSfBhkoQJlSQglyQIZJJgsUlCy7T43ymq1VaJPpTDgDkH6g4crT6RqJIait0n6EW4TxCNV59IVgkCWyVYdJXQcjbSq08GvOfAnAM1By45cOUAJ62zIvL/ClJJ4SXCPMXLyvMUL+81T/FFMPOUh6A8TyWOeSo181Qq7b5Y7JIg0Usey9mxiUP1N2A9VuMPPASo6A/NbTpwzJMcqIHgnsTmo5TTNvhsOkz4JwEJKEFgoASLghISYdPh2mAhGSV8OJdkqJD+EtzeAwPmHKg7cGylcZFHdMTuS/jsPSSTvQfksASBxBJSa5GXcnsPDHjPgTkHag5ccuDKAU5aZ8UBU4/0prRfbLyHjldyFAeEaRww/aa732d4+ft5tqvQOZv0ZNPL++5I57GlzIXubixnMM1gSwZb9dg00JfiDVcpXuhO0ABNlB14nJ5MPW5zH9g1V9DxZLJf2XIO0xe9zZ0vnZ+0BVlx0hbkfSZtoQj3pO0jKE7aqSMVOsWbVgiCw8lHttzPVLhpRbiivBMnZ2QGzDlQW7Ua5oEUE5dT510r44Y45oF0ctdKionLqZC4bNGXQke36VKXWS/VOxeP9LTZidPq4nJMGFBbtbLUhTkmqTPHZNwQl7omOSYp5pikQo6JRQkKEifoEOszDgjeWdkMvCNm0q+3hSPCzJGFcmDOgRoIvlBAwlBqQHVa9HEDJ5yhgKShILCGgkUbCh3T5p8Z2+PLFMzvM+9JEeS9zO+196T4CMrm13FPSob3pBBEiONPa1GcgsRxysb2ODpTDsw5UAPBaIotQynXOPAhNYUJqykgrSkIvKZgEZtCJh0vZWN7GbcjwIA5B2qrUpa2cEcgc+4IZD47AtlkRyDDHYFM2BGwWENBog0t9x+rdfFYtCvwbfXpUC/A+zAdrUXu3ClHKcqBGghSUUBWUWo0dVr0OXc6IRYFZBYFgVoULG5R6Ig5XzSAxb+EN8aCrGiMBXkfYywU4TbGPoKiMe5oUS+MsXRy3WJHBYketac9oNao3UUPdXC8REa7IdTtoDOkuwG3+8ARq3KgBoJaFZBbldJQ92F8dh8m9KqA/KogEKxCZl3nk3lc5zPwdb6HjqmSCPDfdqAr2vDhUH7CPQlkmHs41B/lkxmS/Tes7+tryOYarrmvs/L3p3J9qk9SHBf0B4vdUQc3ljOYZrAlg6165YScMhNLmQkRw1HTGE77lBDD6QkNapXiKMGL2kb6pMM2bfG0Ap1YzmCawZYMtuqxSdhGzeevzY8AfzhWU//Zy2ac8lO/q8tb5k42rDNQd66g4+VkRpFpQ1++ml9x/4p3WEconZ3KJFlpKpPkPaYyqQjnVOYlKE1lXSHTqUzNYWF+COsKNRCD3qq5yH7E3PHUS1MTEQfmHKitSvUTETYNpRwT0aQd9ETUPdRNRObfNygpaEtZ2pIuen/YlAfjvtXXAhzKk1lnbDf1Za/shN6XS+uRcZY5UFvVtfSoUI8uZ3nSQpce1USPCvXIO8vGMlp6vMJZFgIVQpmCQXmebyzJexmUK31jL0HZoNC+sZqHaFCEezPUQAV7q+aig8zQqfXS9EBgPFsO1FalrIEQ4kBwebaTdrgGQjgZCCEOBN6zVRYRruooW6+KVPTStLaYE7kcqK1KWdqKUFuuFJhJO1zaiibailBbfAqMshhllcQo21yx118JXC+pJu5ls0/YcB3hjjcSZ5W7pxIHKHznmOWYvQsOzDlQK4KNViEbLTXeOjV77F2oCRutQjZaJbDRKouNVnUkri8ZyhBeIpjr5+XiSPJe5vrKXBwvQdlc07k4SuJnVhaLrmopZK++ehtvrX/YHGYfy/LxoVj/WrNTnQ5ntFeY8Hc+bbabP4rDtr3/yAw266Z7+/QO3UHa5Q2VOcKBOQfqDrQzRxQS8qq563iAJcKNuvahftSlOOr4zRtlEfKqlv+VzBzhwHsOzDlQc+CSA1cOcNy6gZN2pVqaVnbxObCyvlcdUeko6jBR+m33lGfmCCaOVPs6zckO2cyOG6RP2+zbNeuszSNp7BcZj+heTMUjGCxnMM1gSwZb9dg0HgHha/MjNT8IxqeJ5lUTcuDuQlItxykXb1ADpelKtYSZ/Ce3PMeOzPFl4g186fx8I8iK840g7zPfCEW45xsfQXG+aQu5mG8gMssDEE4jKotwU4Hg8Do383tJ0gtjwJwDtVWhYT4AdHad1KSTNjjmA5g4u4DOLgjOrkXeqSTyTjPbrjdHh644j5Uj5eRArQhSToWknMpJyql8SDnVhJRTISmnEkg5FVgeKwjZNsaJ2R93GzNER4b/UBbbjRm75A5mXyitRCYHhwO1VVdLiQkq0ZWDM2meS4nJRIkJKpHPwVFg+YNwxXldKSjDlylY3eed0pXkvazulad0vQRlq0uf0lWQGaurhFO65inr0wqndLnskV6YHgfMOV0O1FadrHGQ4ThwOuLgcU63e2gYBxmOAz6FWylr30MJqTaY+r7eVEdaW4rJteHAnAO1ValBW2q+QCmXtpRHrk33UK8tNb9BSUFblleohA2ESfZIz1MuLwAVt7nAgDkHaqvCliZxc4EYUZ0mfTYX1GRzQeHmghI2FywWWdWxr75o2IV/CW+QBVnRIAvyPgZZKMJtkH0ERYPcUd9ODTJBEjv5zNbehxIuqC/wD8XlKrVOHjH/r/CE5XnfM5qNgipf2+jn5g9cFCExePURt/Bm7CH4rk50rIUBcw7UHTiKtSCrrnIywloi3FAb31CvkFVXCay6ymLVVS2lLB1rYcB7Dsw5UHPgkgNXDnDSuiFdRik5XUYNJKrvlbpIl/nyDsJprEWxeTMO9xDNARJeGvfibB/WOe/Nv3E2wFBLb8BcNsudPcNgOYNpBlsy2KrXFZM9owbO1feqIxxNLwu77cCIAFcdyH9Fy32XmEmL2YcNHtD+en50eC7unPdVB/K1sTxOJXicD7P39WbNsdqe+b3xtqQoI6vlkdNi0U2qQPDt1rNbPHK+aS72n/Ta+vDButo9Fc1uUemIVARuR27VgXyNLf8qkG5BEWss3CvTv4GurnziT1nkisqDXFFZ5IpqTK542TwI31DOyG0vmLGxX5tOcXYo/mgVQwd1GWZFBssZTDPYksFWysGsqJBZUQUY1A2FI9eqY1YU8siUB7missgVlQe5orLIFdWLkisKpfMO7TPJFSV5H4f2WnJFL0HRoXWQKyqCeXDyfa3gm8Sr2O3KV18r6+4PtErl6WyW0cZptagX6bmJo17kwJwDtSKoFxVSL1IK6PTuE4ubUC8qpF5UAvWisqgXVfACsTi+TGGkPDMWJ8h7jZRrY3E+gvJIccTiJAZSZVFEKokiss/2eT17sLyjal/Wi/v2uhyH08FF6Th2SA7UimCHVMgOSTW807dPlG7CDqmQHVIJ7JDKYodU17BDfnO05Bl0kZKsOGSeTxcpFeEeMn8GXaRy0EUqgk9x8pkt50RiirQvAdyZ8bPbHKs6VFJaV0/VybjySoMjluTAnAO1IoglFRJLUoro9O8TcJwQSyokllQCsaQKLV899PDVQ8tXDwkidNzRHMcJOgJG1i9v+KeK7ScMDjy1R25orzxkvHI3ljOYZrAlg616bOqVh+iVh+iVR5JXHobyjR2q5SSM2S9jueShh0tukdup8EVdcr50wWo+0yUX5L2s5rUuuY+gbDUdLjnBxDf5vpZLHgou+boNGTgPdoScv82AOQdqq16WKUR/28kzOGmKyxRO/O0Q/e1Q8LdDy98OX8Df5ssUhsEz/W1B3msYXOtv+wjKw8Dhb4eSvx1a/nb4nG3vkHOoGTDnQG3VyRoC6FATLesU6uNQhxOHOkSHOhQc6shyqKN/hUPNv4QfE4KsOCYEeZ8xIRThHhM+guKYiBwOdSQ51JHlWkSCQ92fer44il7fpP1YPhWHU4Fn2uiZI+KcaAbMOVBb1R6GTYRONNH4Tuc+TnQ0caIjdKIjwYmOLCc68nCiI8uJjignOp460ZFXdPvHcvYZj6djQO2x6tzp2eP5sU5hxpyL06H8gilutG8dMb61G8sZTDPYksFWPTb1rZHQVUXoW0sUbyry8a0jj3B3ZPnWkYdvbdEGqmtoA/1962cQCEqysgF9vm99LYGgl6BsQB2+NcGwN/m+lm8tcQeKvjXHH8iBOQdqRfAHKuQPpFrXKdXHt57wByrkD1QCf6Cy+ANV9AK+NV+mMAye6VsL8l7D4Frf2kdQHgYO3zqSfGuL51BFz/GtI863ZsCcA7VVJ2sIoG9NtKxTqI9vHU18a2QkVAIjobIYCVX8r/Ct+ZfwY0KQFceEIO8zJoQi3GPCR1AcE7HDt5aY5JVFzahi3remvzPjcNOfmXOwGTDnQG3VfRg7MTrYhAY6xfs42PHEwY7RwY4FBzu2HOzYw8GOrWNnscexs9jKBWy57YDyST1471Rs+Yqxh68Yx9bzsfv5m+PnsjzdFafi3dv61w+H6lSu8dqk2bHcmt9+rNa/lo+35XZrysD+W//1H/vt9O8oXbcQrxtbn5q/bvamA55+qn5rGt/8c/n1qTyYbvtr88fifKryzdYYovqfx3W5Lw6bqingY00fflttz7t987hZIJan0v5LU6r9lyfjFp3+jslItkxfjbbQpu79v3v4WB2aljwVx+Nv1eHx+1dpru5f3bx7uysPn8pa0HjR5715rL6er//z7FB+xGuT8PSE+TES6bAwXpgfCYWlarFKFYHUF8/Xd7sTUnGyWMVUeXfZ4h5Ikbp+VPWQGbcmuiawvMurJTBMjV0sacyoIzRNhoh8X4i3RJPqQELexZKuCy6xFitcZ1FlBnj1aQAkFqtFzVtJtWGeLuojyZcY8ggs7ukPoCEMFuYHVZc7bPsd3XbcgjFtIOWW2IYl3QakNq2ZSkldJ9Gi5nEh2xAt7mkMuWAXt3SZOX6jnP5GyDGz0HSZyEezWDnfh989prA71OcdrU+N+tSuvmSwFY3lyNtAD4U5cmDNSWWmpv4p+elgjl1sTpeYYokpVSJSYS/u6S5dp63f0UPoHj/BvcNqQIbsKFlKfrqGVohWc4Q2hR5e2N1v6e6OjEKLpauLmW57T3db5MFdLOkuplFO03J4OGBxT+sl765VoMpEOe0wV6jPpbNLZwtNtx3JO2omGvL7mbrc0XXB4wSLFV2XO2z7naPt2KXv6S5dExbfOcxAYHpuQA6EjsKE/rJocEkMyZYX9/Tb8GKKxcrxFbCXabqX4QUWC03L3UbGTkfUXHgLEY69iO63xnTc0qbjHrF7GstRz7nDTONIoNVlhJa0EDI/LzStrprr685lM0M0HmQlb7Gj3NIdRWOH1nSHzvET5K551HTMW8e8rQKcnwK605r33bkMUoQqo30IbENOtwFvi1ncOrqDAoXXANAdAusJZD3xFpfFvaPM0PTakELujAxtTkOkFXTM2AZbttjN4Ci+e/tUfCr/Whw+GT91ti0/Gqdx/sYsjw5N1Lj+/VQ91b8Z1/6hOp2qXfevz2XxiI7x/E2Afmp16v6BLzG+6a+13/3u/wNQSwMEFAAAAAgAdmUTXXskJiCaBAAANDMAAA0AAAB4bC9zdHlsZXMueG1s5Vtfj6M2EP8qiPceIeyxoUoitZFWqtRWK90+9JUEk7g1mBpnm9ynr8cQQlI7SwAT7ppoFfB4PL8Zzz8S7zznR4K+7BDi1iEhab6wd5xnPzpOvtmhJMw/0QylghJTloRc3LKtk2cMhVEOTAlxppOJ7yQhTu3lPN0nLwnPrQ3dp3xhT2xnOY9peh55sosBMTVMkPUekoW9CgleMyznhgkmx2J4CgMbSiizuICCFrYLI/nXguwWd4CyXCfBKWUw6BQS7pGzLhcdUubIdJt+JFN+5EIAJqTaUM8uBpbzLOQcsfRF3EgeOfgfklVevx0zgWDLwqM7/Ww3ZsgpwRGI3K7qmkxti2OA88Pk0yQIgueZ7z1PnjzP92dSy3U5H6cROqBoYftPUmhNUAVBfgg915RFiFWaCgOdxpZzgmIu+Bne7uCT0wyEUM5pIi4iHG5pGko7nDjqnJaMuoXNdzJqNkpoMLGU0Gi+nCmhNJou5p0QN5pfTP3mdHv8bjijMPPonPQeKJeRZsAFnNE440BIevXFlphNOqNjMPS6qtsZTHkhStQGEfIFVvsjruoUlKlDbBWt2C8RdGEWVG64FHUSils5WixT3DhXTEFDJqcOoQBUw+K7N8BMtOtaGX6n/Oe9MEEq7//eU45eGYrxQd4fYjXq2uqu0dVr2KdGsZtd/cIybt+WGXb1MMvI8SeCt2mCZL/WXOByHp74rB1l+KuQBh0wRLtt/cPC7A0deNkwO4d4LPg2YgCx1qAmJkFZ74hxvGkH89rrHw4z6DGxuLeSbefwubl659Bvhb13y7RLikNjb5bQH+7azWrmKLLrsPj6MKOh3e6StPoKnqdm0fN/KXsNvbmJ1YZvFhp0+x1KRLPec2wZZrhE3SF4W4Nyu0aXN9TzlaHYvTuFDtYhDBAY8luJ1gl0OkJM3ggxjfKhbyyZ9iFG6/RQOp4mokFW6hKj+tpwIx4aYOoSo60wPczdutmpCyZTdurP3/tIEiaj75wiOM16y2k99EQ3Oi5pjFcmltxwDBLuskZWMVqEbv5CxZo7HEUoLTH1+SDTDexHRbGVMnckimGt3ADYzGjD/Wx0dc/sjwJmn0Vcsz9pqHOcieBRdh2m3NWsWgMp8T0mNvO6VB1IV1U+elh+WI7+6Avq0QH7Bjd/LPnydp/YVEunPDFRO8txcZKjGrXgsOfC/h3O4ZIzRmu9x4TjtCoz1wyvlEEOCf9E50eEOtPny1McAggP1wRdIhFyIhSHe8LfKuLCPl//hiK8T6bVrFewcDnrfP0ruIDrV+dQhazy2MuqvGXbdXFOU1wIqeULGK4pL/Klpuh4CpqaAjSdHB0CHU/BpZPzPekz0+pT0HTYZkrKTMsz0/IUXCrKSr51ctQ8gXipNQ0COEyss+hqpUSw0tnN9+FPvZoOG3Do5ICk+2yt3229h9z2A92e3vIQnaZ6T9Rpqrc1UNR2A44gUO+2Tg5w6HZB5zsgXy0HfErN43mwqzpsugjWU4JARwFfVPuo72us48NbvT+6KPG8IFBTgKZG4Hk6CkSjnqJDABh0FM+TdfCqHjmnOuWc/09m+S9QSwMEFAAAAAgAdmUTXZeKuxzAAAAAEwIAAAsAAABfcmVscy8ucmVsc52SuW7DMAxAf8XQnjAH0CGIM2XxFgT5AVaiD9gSBYpFnb+v2qVxkAsZeT08EtweaUDtOKS2i6kY/RBSaVrVuAFItiWPac6RQq7ULB41h9JARNtjQ7BaLD5ALhlmt71kFqdzpFeIXNedpT3bL09Bb4CvOkxxQmlISzMO8M3SfzL38ww1ReVKI5VbGnjT5f524EnRoSJYFppFydOiHaV/Hcf2kNPpr2MitHpb6PlxaFQKjtxjJYxxYrT+NYLJD+x+AFBLAwQUAAAACAB2ZRNdE2QfdGQBAABpAgAADwAAAHhsL3dvcmtib29rLnhtbI2RQU/jMBCF/0rkOyQtC0urppdlF5DQgiiCsxtPmhG2JxpPCPDrmSQKIO1lT/Z7E715+bzpiZ/3RM/Za/AxlaYRadd5nqoGgk3H1ELUSU0crKjkQ55aButSAyDB58uiOMuDxWi2mznrjvPtZrg8IvTpyx9k9oIJ9+hR3koz3j2YLGDEgO/gSlOYLDXUXxHjO0WxflcxeV+axTR4BBas/rF3Q58Hu0+j8/qE0VFfmmVx8lMT32Z9tFiq7Ef1hE4a/WRV/Pj0rgAPjWjG6flgit3fW0EqzVmhskZOMm4ae9pK8AV06aQ6oT/oBfjCClwydS3Gw1BHaeTfcIzo5nPivub/IU91jRVcUNUFiDKhZ/BDwZgabJPJog1Qmt9RGBSu2KyimN1DajtQlQZWuvTaTdxEi357BV6jDvjaTZXnng5qjOD+anRSX9lXd5wNx5izWhTLlbLpvP+l3m28Ievm356ffvsBUEsDBBQAAAAIAHZlE10kHpuirQAAAPgBAAAaAAAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHO1kT0OgzAMha8S5QA1UKlDBUxdWCsuEAXzIxISxa4Kty+FAZA6dGGyni1/78lOn2gUd26gtvMkRmsGymTL7O8ApFu0ii7O4zBPahes4lmGBrzSvWoQkii6QdgzZJ7umaKcPP5DdHXdaXw4/bI48A8wvF3oqUVkKUoVGuRMwmi2NsFS4stMlqKoMhmKKpZwWiDiySBtaVZ9sE9OtOd5Fzf3Ra7N4wmu3wxweHT+AVBLAwQUAAAACAB2ZRNdZZB5khkBAADPAwAAEwAAAFtDb250ZW50X1R5cGVzXS54bWytk01OwzAQha8SZVslLixYoKYbYAtdcAFjTxqr/pNnWtLbM07aSqASFYVNrHjevM+el6zejxGw6J312JQdUXwUAlUHTmIdIniutCE5SfyatiJKtZNbEPfL5YNQwRN4qih7lOvVM7Ryb6l46XkbTfBNmcBiWTyNwsxqShmjNUoS18XB6x+U6kSouXPQYGciLlhQiquEXPkdcOp7O0BKRkOxkYlepWOV6K1AOlrAetriyhlD2xoFOqi945YaYwKpsQMgZ+vRdDFNJp4wjM+72fzBZgrIyk0KETmxBH/HnSPJ3VVkI0hkpq94IbL17PtBTluDvpHN4/0MaTfkgWJY5s/4e8YX/xvO8RHC7r8/sbzWThp/5ovhP15/AVBLAQIUAxQAAAAIAHZlE11Gx01IlQAAAM0AAAAQAAAAAAAAAAAAAACAAQAAAABkb2NQcm9wcy9hcHAueG1sUEsBAhQDFAAAAAgAdmUTXUOYAeQXAQAAaAIAABEAAAAAAAAAAAAAAIABwwAAAGRvY1Byb3BzL2NvcmUueG1sUEsBAhQDFAAAAAgAdmUTXU0/gCzbBQAAgBoAABMAAAAAAAAAAAAAAIABCQIAAHhsL3RoZW1lL3RoZW1lMS54bWxQSwECFAMUAAAACAB2ZRNdtFyg1yYuAABgLwEAGAAAAAAAAAAAAAAAgIEVCAAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsBAhQDFAAAAAgAdmUTXXskJiCaBAAANDMAAA0AAAAAAAAAAAAAAIABcTYAAHhsL3N0eWxlcy54bWxQSwECFAMUAAAACAB2ZRNdl4q7HMAAAAATAgAACwAAAAAAAAAAAAAAgAE2OwAAX3JlbHMvLnJlbHNQSwECFAMUAAAACAB2ZRNdE2QfdGQBAABpAgAADwAAAAAAAAAAAAAAgAEfPAAAeGwvd29ya2Jvb2sueG1sUEsBAhQDFAAAAAgAdmUTXSQem6KtAAAA+AEAABoAAAAAAAAAAAAAAIABsD0AAHhsL19yZWxzL3dvcmtib29rLnhtbC5yZWxzUEsBAhQDFAAAAAgAdmUTXWWQeZIZAQAAzwMAABMAAAAAAAAAAAAAAIABlT4AAFtDb250ZW50X1R5cGVzXS54bWxQSwUGAAAAAAkACQA+AgAA3z8AAAAA";

// ---------- Formulario del Candidato / Entrevista Estructurada (Excel oficiales) ----------
const _RE_DIACRITICOS_CAND = /[̀-ͯ]/g;
function _normalizarTextoCand(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(_RE_DIACRITICOS_CAND, '').trim();
}
function base64ToBlob(b64, mime) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
function descargarDocumentoCandidatura(b64, nombreArchivo, mime) {
  const blob = base64ToBlob(b64, mime);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function descargarFormularioCandidatoExcel() {
  descargarDocumentoCandidatura(CANDIDATO_FORM_XLSX_B64, CANDIDATO_FORM_XLSX_NOMBRE, CANDIDATO_FORM_XLSX_MIME);
  await registrarAuditoria('Formulario del Candidato', 'Descarga del formulario oficial (Excel protegido)', '—');
  mostrarToast('Formulario del Candidato descargado ✓ (Excel protegido)', true);
}
async function descargarEntrevistaEstructuradaExcel() {
  descargarDocumentoCandidatura(ENTREVISTA_XLSX_B64, ENTREVISTA_XLSX_NOMBRE, ENTREVISTA_XLSX_MIME);
  await registrarAuditoria('Formulario del Candidato', 'Descarga de la plantilla de Entrevista Estructurada (Excel protegido)', '—');
  mostrarToast('Plantilla de Entrevista Estructurada descargada ✓ (Excel protegido)', true);
}

// ---- Entrevista Estructurada — checklist real DENTRO de la app (fase 7) ----
// César: "todo se haga 100% dentro de la app web y NO dependa de descargar un Excel [...] la
// evaluación y el cálculo deben ocurrir en la base de datos de la aplicación" — las 16 preguntas y
// sus criterios por bloque (lenguaje corporal / actitud / interés en el puesto), extraídas y
// normalizadas del Excel oficial por el propio César; el Excel (botones ya existentes arriba) se
// conserva solo como alternativa/extra, nunca como paso obligatorio para calcular la puntuación.
const ENTREVISTA_PREGUNTAS = [
  { id: 1, pregunta: '¿Es la primera vez que tiene una entrevista con nosotros?', criterios: { lenguaje_corporal: ['postura abierta', 'contacto visual', 'sonrisa genuina'], actitud: ['entusiasta', 'interesada', 'proactiva'], interes_puesto: ['pregunta sobre la empresa', 'pregunta sobre el puesto', 'pregunta sobre las responsabilidades'] } },
  { id: 2, pregunta: '¿Qué le ha motivado a contactar con nosotros?', criterios: { lenguaje_corporal: ['mantiene el contacto visual', 'gesticula con naturalidad'], actitud: ['positiva', 'reflexiva', 'demuestra conocimiento de la empresa'], interes_puesto: ['menciona aspectos específicos del puesto que le atraen'] } },
  { id: 3, pregunta: '¿Conoce nuestra organización, desde cuándo y por qué medios?', criterios: { lenguaje_corporal: ['asiente con la cabeza', 'muestra interés genuino'], actitud: ['atenta', 'busca ampliar información', 'receptiva'], interes_puesto: ['pregunta sobre la cultura de la empresa', 'pregunta sobre las oportunidades de crecimiento'] } },
  { id: 4, pregunta: '¿Cómo considera que debe ser su relación con compañeros de trabajo y la empresa?', criterios: { lenguaje_corporal: ['organizado', 'claro', 'transmite seguridad'], actitud: ['flexible', 'adaptable', 'proactiva para buscar soluciones'], interes_puesto: ['demuestra compromiso', 'disposición para cumplir con los horarios'] } },
  { id: 5, pregunta: 'Hábleme de su disponibilidad horaria.', sub_pregunta: '5.1 ¿Tiene alguna preferencia? ¿Por qué?', criterios: { lenguaje_corporal: ['reflexivo', 'considera las opciones', 'se comunica de manera efectiva'], actitud: ['abierta', 'colaborativa', 'busca el beneficio mutuo'], interes_puesto: ['muestra flexibilidad', 'disposición para adaptarse a las necesidades de la organización'] } },
  { id: 6, pregunta: 'Formación: Centro y características. Idiomas y nivel.', sub_pregunta: '6.1 ¿Cuáles son sus características más relevantes de la formación que indica?', criterios: { lenguaje_corporal: ['seguro', 'entusiasta', 'demuestra conocimiento del tema'], actitud: ['proactiva', 'reflexiva', 'capaz de relacionar la formación con el puesto'], interes_puesto: ['destaca cómo la formación le ha permitido desarrollar habilidades relevantes para el trabajo', 'ha propuesto mejoras para el puesto de trabajo'] } },
  { id: 7, pregunta: '¿Se considera una persona que se adapta a los cambios? ¿Por qué?', criterios: { lenguaje_corporal: ['adaptable', 'flexible', 'muestra apertura a nuevas ideas'], actitud: ['positiva', 'proactiva', 'capaz de afrontar los cambios con una mentalidad de crecimiento'], interes_puesto: ['demuestra disposición para aprender y adaptarse a las nuevas necesidades del puesto y la organización'] } },
  { id: 8, pregunta: '¿Le gusta trabajar en equipo? ¿Por qué?', criterios: { lenguaje_corporal: ['colaborativo', 'receptivo', 'busca la interacción con los demás'], actitud: ['positiva', 'proactiva', 'capaz de aportar valor al equipo y trabajar de manera conjunta'], interes_puesto: ['destaca la importancia del trabajo en equipo para el éxito del puesto y la organización'] } },
  { id: 9, pregunta: '¿Tiene formación en PRL?', criterios: { lenguaje_corporal: ['seguro', 'responsable', 'demuestra conocimiento de la normativa y su importancia'], actitud: ['positiva', 'proactiva', 'capaz de aportar valor al equipo'], interes_puesto: ['muestra disposición para aplicar sus conocimientos en PRL para contribuir a un ambiente de trabajo seguro'] } },
  { id: 10, pregunta: 'Experiencia profesional y otros datos de interés, ejemplos:', criterios: { lenguaje_corporal: ['seguro', 'responsable', 'demuestra conocimiento de los procesos del puesto'], actitud: ['positiva', 'proactiva', 'capaz de aportar valor al equipo'], interes_puesto: ['se siente cómodo en el puesto de trabajo', 'muestra disposición para aplicar sus conocimientos para contribuir a un buen ambiente de trabajo'] } },
  { id: 11, pregunta: '¿Cuál es su motivación para este trabajo?', criterios: { lenguaje_corporal: ['entusiasta', 'apasionado', 'demuestra un propósito claro'], actitud: ['positiva', 'proactiva', 'enfocada en el logro de objetivos'], interes_puesto: ['relaciona su motivación con los valores y objetivos de la organización'] } },
  { id: 12, pregunta: '¿Cómo gestiona las críticas?', criterios: { lenguaje_corporal: ['receptivo', 'abierto a la retroalimentación'], actitud: ['reflexiva', 'proactiva', 'busca aprender de las críticas para mejorar su desempeño'], interes_puesto: ['demuestra disposición para recibir feedback constructivo y utilizarlo para su crecimiento profesional'] } },
  { id: 13, pregunta: '¿Cuáles son sus expectativas si se incorpora a este puesto?', criterios: { lenguaje_corporal: ['claro', 'conciso', 'transmite expectativas realistas'], actitud: ['positiva', 'ambiciosa', 'enfocada en el desarrollo profesional'], interes_puesto: ['alinea sus expectativas con las oportunidades de crecimiento y aprendizaje que ofrece el puesto'] } },
  { id: 14, pregunta: 'Ante una situación puntual de estrés:', opciones_respuesta: ['a) Pide ayuda', 'b) Busca solución', 'c) Comunica la situación a un compañero', 'd) Comunica la situación a un responsable'], sub_pregunta: '14.1 ¿Por qué razón?', criterios: { lenguaje_corporal: ['busca apoyo de manera respetuosa y colaborativa'], actitud: ['proactiva, busca soluciones en conjunto'], interes_puesto: ['demuestra compromiso con el equipo y la resolución'] } },
  { id: 15, pregunta: '¿Tiene alguna pregunta?', criterios: { lenguaje_corporal: ['comunicativo'], actitud: ['positiva'], interes_puesto: ['sobre la organización del departamento'] } },
  { id: 16, pregunta: '¿Le ha generado alguna duda esta entrevista?', criterios: { lenguaje_corporal: ['comunicativo'], actitud: ['positiva'], interes_puesto: ['sobre la organización'] } }
];
const ENTREVISTA_BLOQUES = [
  ['lenguaje_corporal', '🧍 Lenguaje corporal'],
  ['actitud', '😊 Actitud'],
  ['interes_puesto', '🎯 Interés en el puesto']
];
let entrevistaAppCandidatoId = null;
function abrirEntrevistaAppModal() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  entrevistaAppCandidatoId = c.id;
  $('entrevistaAppTitulo').textContent = `📝 Entrevista estructurada — ${c.nombre}`;
  // César: "las entrevistas en vivo pueden tener interrupciones" — si hay un borrador guardado, se
  // retoma exactamente donde se dejó (los criterios no puntuados se guardan como null, nunca se
  // fuerza a 1-3 solo por tener que guardar algo).
  if (c.entrevista_respuestas) {
    $('entrevistaAppEstadoPrevio').style.display = '';
    $('entrevistaAppEstadoPrevio').textContent = c.entrevista_completada
      ? `✅ Entrevista finalizada el ${c.entrevista_evaluado_en ? new Date(c.entrevista_evaluado_en).toLocaleString('es-ES') : '—'} por ${c.entrevista_evaluador || '—'}.`
      : `📝 Borrador guardado el ${c.entrevista_evaluado_en ? new Date(c.entrevista_evaluado_en).toLocaleString('es-ES') : '—'} por ${c.entrevista_evaluador || '—'} — puedes continuar donde lo dejaste.`;
  } else {
    $('entrevistaAppEstadoPrevio').style.display = 'none';
  }
  const previas = c.entrevista_respuestas || {};
  // César: "para evaluar en la entrevista presencial necesito leer las respuestas de Ana [...]
  // deberíamos poder ver las respuestas de cada candidato, no el formulario vacío" — las respuestas
  // de Fase 1 (c.entrevista_fase1_respuestas, mismo origen que el panel "Respuestas del Candidato
  // (Fase 1)" de la ficha) se insertan aquí, pregunta por pregunta, para no tener que cerrar el
  // checklist y buscarlas en otro sitio mientras se puntúa en vivo.
  const respuestasFase1 = c.entrevista_fase1_respuestas || {};
  $('entrevistaAppBody').innerHTML = ENTREVISTA_PREGUNTAS.map((p) => {
    const prev = previas[p.id] || {};
    const bloquesHtml = ENTREVISTA_BLOQUES.map(([key, label]) => {
      const items = p.criterios[key] || [];
      return `<div style="flex:1;min-width:220px;">
          <p class="sub-c" style="margin:0 0 4px;font-weight:700;">${label}</p>
          ${items.map((criterio, idx) => {
            const valorPrevio = prev[key] && prev[key][idx] != null ? prev[key][idx] : '';
            return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span class="sub-c" style="flex:1;">${criterio}</span>
                <select id="entCrit-${p.id}-${key}-${idx}" onchange="actualizarTotalesEntrevistaApp()" style="width:118px;margin:0;padding:4px 6px;font-size:11.5px;">
                  <option value="">—</option>
                  <option value="1" ${valorPrevio === 1 ? 'selected' : ''}>1 · Poco</option>
                  <option value="2" ${valorPrevio === 2 ? 'selected' : ''}>2 · Bastante</option>
                  <option value="3" ${valorPrevio === 3 ? 'selected' : ''}>3 · Idóneo</option>
                </select>
              </div>`;
          }).join('')}
        </div>`;
    }).join('');
    const respCandidato = respuestasFase1[String(p.id)];
    const subMatch = p.sub_pregunta ? p.sub_pregunta.match(/^(\d+\.\d+)/) : null;
    const respCandidatoSub = subMatch ? respuestasFase1[subMatch[1]] : null;
    const respuestaFase1Html = (respCandidato || respCandidatoSub)
      ? `<div style="background:#eff6ff;border-left:3px solid #3b82f6;padding:6px 10px;margin-bottom:8px;border-radius:4px;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#1d4ed8;">💬 Respuesta del candidato (Fase 1):</p>
          ${respCandidato ? `<p style="margin:2px 0 0;font-size:12.5px;white-space:pre-wrap;">${_escHtml(respCandidato)}</p>` : ''}
          ${respCandidatoSub ? `<p style="margin:4px 0 0;font-size:12.5px;white-space:pre-wrap;"><i>${_escHtml(p.sub_pregunta)}:</i> ${_escHtml(respCandidatoSub)}</p>` : ''}
        </div>`
      : '';
    return `<div class="card card-pad" style="margin-bottom:10px;">
        <p style="margin:0 0 2px;font-weight:700;font-size:12.5px;">${p.id}. ${p.pregunta}</p>
        ${p.sub_pregunta ? `<p class="sub-c" style="margin:0 0 6px;font-style:italic;">${p.sub_pregunta}</p>` : ''}
        ${p.opciones_respuesta ? `<p class="sub-c" style="margin:0 0 6px;">Opciones: ${p.opciones_respuesta.join(' · ')}</p>` : ''}
        ${respuestaFase1Html}
        <div style="display:flex;gap:14px;flex-wrap:wrap;">${bloquesHtml}</div>
      </div>`;
  }).join('');
  actualizarTotalesEntrevistaApp();
  $('modalEntrevistaApp').classList.remove('hidden');
}
function cerrarEntrevistaAppModal() {
  $('modalEntrevistaApp').classList.add('hidden');
  entrevistaAppCandidatoId = null;
}
function _recorrerCriteriosEntrevistaApp(cb) {
  ENTREVISTA_PREGUNTAS.forEach((p) => {
    ENTREVISTA_BLOQUES.forEach(([key]) => {
      (p.criterios[key] || []).forEach((criterio, idx) => cb(p, key, criterio, idx));
    });
  });
}
// César — fórmula exacta: "Puntos Obtenidos = suma de todas las notas de todos los criterios [...]
// Puntos Máximos Posibles = (número total de criterios evaluados en toda la entrevista) × 3 [...]
// % de Adaptabilidad = (Puntos Obtenidos / Puntos Máximos Posibles) × 100".
function actualizarTotalesEntrevistaApp() {
  let obtenidos = 0, maximos = 0, pendientes = 0;
  _recorrerCriteriosEntrevistaApp((p, key, criterio, idx) => {
    maximos += 3;
    const el = $(`entCrit-${p.id}-${key}-${idx}`);
    const val = el ? el.value : '';
    if (val) obtenidos += parseInt(val, 10);
    else pendientes++;
  });
  const porcentaje = maximos ? Math.round((obtenidos / maximos) * 1000) / 10 : 0;
  if ($('entrevistaAppTotales')) {
    $('entrevistaAppTotales').innerHTML =
      `Puntos: <b>${obtenidos} / ${maximos}</b> · % de adaptación: <b>${porcentaje}%</b>` +
      (pendientes ? ` · <span style="color:#e11d48;">⚠️ faltan ${pendientes} criterio(s) por puntuar</span>` : ' · ✅ entrevista completa');
  }
  return { obtenidos, maximos, pendientes, porcentaje };
}
// César: "las entrevistas en vivo pueden tener interrupciones [...] que permita al administrador
// salir de la pantalla sin exigir que los 104 criterios estén puntuados" — guarda tal cual está
// (criterios sin puntuar quedan como null) y NUNCA toca puntuacion_adaptacion/resultado_entrevista
// (las que usa el resto de la app para decidir "Apto"/dar de alta): un borrador a medias no puede
// calificar a nadie por error. entrevista_completada se queda en false.
function _respuestasEntrevistaAppDesdeFormulario() {
  const respuestas = {};
  ENTREVISTA_PREGUNTAS.forEach((p) => {
    respuestas[p.id] = {};
    ENTREVISTA_BLOQUES.forEach(([key]) => {
      respuestas[p.id][key] = (p.criterios[key] || []).map((_, idx) => {
        const v = $(`entCrit-${p.id}-${key}-${idx}`).value;
        return v ? parseInt(v, 10) : null;
      });
    });
  });
  return respuestas;
}
// César: "no permite guardar el borrador, sale un aviso, error al guardar, y además vuelve a
// salir un aviso en inglés [...] tampoco te permite finalizar la entrevista" — en una entrevista
// presencial real (104 criterios tardan bastante en rellenarse) la sesión de Supabase puede
// caducar entre que se abre el checklist y que se guarda; supabase-js normalmente la renueva solo
// en segundo plano, pero un móvil/tablet que pone la pestaña en segundo plano durante la entrevista
// puede llegar al momento de guardar con el token ya caducado, y ese fallo (en inglés, tipo "JWT
// expired") se mostraba tal cual, sin traducir. Esta función reintenta UNA vez tras refrescar la
// sesión antes de rendirse, y _mensajeErrorGuardadoEntrevista() traduce cualquier fallo a un aviso
// en español que no deja perder lo ya puntuado (el checklist nunca se cierra ni se limpia si falla
// el guardado — las 104 respuestas siguen ahí para reintentar sin tener que puntuar de nuevo).
async function _guardarCandidatoConReintentoSesion(id, payload) {
  let { error } = await sb.from('candidatos').update(payload).eq('id', id);
  if (error && /jwt|token is expired|invalid.*token|refresh_token/i.test(error.message || '')) {
    const { error: errorRefresh } = await sb.auth.refreshSession();
    if (!errorRefresh) {
      ({ error } = await sb.from('candidatos').update(payload).eq('id', id));
    }
  }
  return { error };
}
function _mensajeErrorGuardadoEntrevista(error) {
  const msg = (error && error.message) || '';
  // César: "vuelve a salir en inglés [...] no quiero cosas en inglés, quiero que esté todo en
  // español, y no quiero que salga más este aviso" — el detalle técnico en bruto (incluido en
  // inglés, como "Could not find the 'entrevista_evaluado_en' column [...] in the schema cache")
  // se registra SOLO en la consola del navegador (para poder diagnosticarlo), nunca en pantalla.
  if (msg) console.error('Entrevista estructurada — detalle técnico del error al guardar (no se muestra en pantalla):', msg);
  if (/jwt|token is expired|invalid.*token|refresh_token/i.test(msg)) {
    return 'Tu sesión había caducado (la entrevista ha durado bastante) y no se ha podido renovar sola. Tus respuestas siguen aquí en pantalla, sin perderse — recarga la página, vuelve a entrar y pulsa "Guardar borrador" otra vez sin tener que puntuar de nuevo.';
  }
  if (/row-level security|permission denied|rls/i.test(msg)) {
    return 'No tienes permiso para guardar esta entrevista ahora mismo. Tus respuestas siguen en pantalla — avisa al administrador del sistema antes de cerrar esta ventana.';
  }
  if (/failed to fetch|network|timeout|conexión/i.test(msg)) {
    return 'No se pudo conectar para guardar — comprueba tu conexión a internet e inténtalo de nuevo. Tus respuestas siguen en pantalla, no se han perdido.';
  }
  // Caso detectado por César en producción: la caché interna de columnas de la base de datos se
  // había quedado desactualizada (se corrige ejecutando una vez la migración 0108) y el fallo se
  // mostraba tal cual, en inglés. Se traduce igual aunque ya esté corregido, por si se repitiera.
  if (/schema cache|could not find|column .* of/i.test(msg)) {
    return 'El sistema no ha podido guardar por una desincronización interna de la base de datos. Tus respuestas siguen en pantalla, no se han perdido — avisa al administrador del sistema para que la sincronice, e inténtalo de nuevo en un par de minutos.';
  }
  return 'No se pudo guardar la entrevista. Tus respuestas siguen en pantalla — inténtalo de nuevo, y si el problema continúa avisa al administrador del sistema (el detalle técnico ha quedado registrado en la consola del navegador).';
}
async function guardarBorradorEntrevistaApp() {
  const c = candidatosCache.find((x) => x.id === entrevistaAppCandidatoId);
  if (!c) return;
  const { obtenidos, maximos, pendientes } = actualizarTotalesEntrevistaApp();
  const payload = {
    entrevista_respuestas: _respuestasEntrevistaAppDesdeFormulario(),
    entrevista_puntos_obtenidos: obtenidos,
    entrevista_puntos_maximos: maximos,
    entrevista_evaluado_en: new Date().toISOString(),
    entrevista_evaluador: usuarioActual.nombre,
    entrevista_completada: false
  };
  const { error } = await _guardarCandidatoConReintentoSesion(c.id, payload);
  if (error) {
    mostrarToast(_mensajeErrorGuardadoEntrevista(error), false);
    return;
  }
  await registrarAuditoria('Candidaturas', 'Entrevista estructurada — borrador guardado', `${c.nombre} — ${obtenidos}/${maximos} puntos · faltan ${pendientes} criterio(s) por puntuar`);
  await cargarCandidatosAdmin();
  cerrarEntrevistaAppModal();
  mostrarToast(`Borrador guardado ✓ (faltan ${pendientes} criterio(s) por puntuar) — puedes continuar más tarde desde el mismo sitio.`, true);
}
// "Finalizar Entrevista" — aquí sí se exige la validación estricta (los 104 criterios puntuados)
// antes de escribir puntuacion_adaptacion/resultado_entrevista, que es lo que el resto de la app
// usa para decidir "Apto" y habilitar el alta. Si la entrevista ya estaba finalizada antes (p. ej.
// una prueba previa), se pide confirmación explícita en vez de sobrescribirla en silencio o de
// bloquearla sin explicar por qué.
async function finalizarEntrevistaApp() {
  const c = candidatosCache.find((x) => x.id === entrevistaAppCandidatoId);
  if (!c) return;
  const { obtenidos, maximos, pendientes, porcentaje } = actualizarTotalesEntrevistaApp();
  if (pendientes) {
    mostrarToast(`⚠️ Faltan ${pendientes} criterio(s) por puntuar — puntúa todos antes de finalizar (o usa "Guardar borrador" si necesitas continuar más tarde).`, false);
    return;
  }
  if (c.entrevista_completada) {
    const fechaPrevia = c.entrevista_evaluado_en ? new Date(c.entrevista_evaluado_en).toLocaleString('es-ES') : 'una fecha anterior';
    if (!confirm(`Esta entrevista ya se había finalizado el ${fechaPrevia} (evaluador: ${c.entrevista_evaluador || '—'}). ¿Quieres sustituir esa evaluación por esta nueva puntuación (${porcentaje}%)?`)) {
      return;
    }
  }
  const payload = {
    entrevista_respuestas: _respuestasEntrevistaAppDesdeFormulario(),
    entrevista_puntos_obtenidos: obtenidos,
    entrevista_puntos_maximos: maximos,
    entrevista_evaluado_en: new Date().toISOString(),
    entrevista_evaluador: usuarioActual.nombre,
    entrevista_completada: true,
    puntuacion_adaptacion: Math.round(porcentaje),
    resultado_entrevista: `${porcentaje}% de adaptación (${obtenidos}/${maximos} puntos) — checklist estructurado en la app`,
    resultado_entrevista_categoria: categoriaResultadoEntrevista(Math.round(porcentaje), umbralAdaptacionCandidatoCache)
  };
  if (c.estado === 'recibida' || c.estado === 'entrevista_programada') payload.estado = 'entrevista_realizada';
  const { error } = await _guardarCandidatoConReintentoSesion(c.id, payload);
  if (error) {
    mostrarToast(_mensajeErrorGuardadoEntrevista(error), false);
    return;
  }
  const apto = porcentaje >= umbralAdaptacionCandidatoCache;
  await registrarAuditoria('Candidaturas', 'Entrevista estructurada finalizada (checklist en la app)', `${c.nombre} — ${porcentaje}% (${obtenidos}/${maximos}) — ${apto ? 'Apto' : 'No apto'} (umbral ${umbralAdaptacionCandidatoCache}%)`);
  await cargarCandidatosAdmin();
  cerrarEntrevistaAppModal();
  abrirCandidatoModal(c.id);
  mostrarToast(`Entrevista finalizada ✓ ${porcentaje}% de adaptación — ${apto ? '✅ Apto' : '⚠️ No apto'} (umbral ${umbralAdaptacionCandidatoCache}%)`, true);
}
// "Formulario 3 (Registro)": la evaluación y el cálculo YA ocurrieron en la app (candidatos.
// entrevista_*) — esto es solo el extra para descargar/imprimir, nunca el paso que calcula la nota.
function descargarFormulario3Registro(candidatoId) {
  const c = candidatosCache.find((x) => x.id === candidatoId);
  if (!c || !c.entrevista_respuestas) {
    mostrarToast('⚠️ Esta candidatura todavía no tiene una entrevista estructurada evaluada en la app.', false);
    return;
  }
  const filas = [];
  ENTREVISTA_PREGUNTAS.forEach((p) => {
    ENTREVISTA_BLOQUES.forEach(([key, label]) => {
      (p.criterios[key] || []).forEach((criterio, idx) => {
        const resp = c.entrevista_respuestas[p.id] || c.entrevista_respuestas[String(p.id)];
        const puntos = resp && resp[key] ? resp[key][idx] : '';
        filas.push([p.id, p.pregunta, label, criterio, puntos]);
      });
    });
  });
  filas.push(['', '', '', 'TOTAL', `${c.entrevista_puntos_obtenidos ?? ''} / ${c.entrevista_puntos_maximos ?? ''} (${c.puntuacion_adaptacion ?? ''}%)`]);
  descargarCSV(`formulario3-entrevista-${(c.nombre || 'candidato').replace(/[^a-z0-9]+/gi, '-')}.csv`, ['Pregunta #', 'Pregunta', 'Bloque', 'Criterio', 'Puntuación'], filas);
  registrarAuditoria('Candidaturas', 'Descarga del Formulario 3 (Registro) de entrevista', `${c.nombre} — ${c.puntuacion_adaptacion ?? '—'}%`);
}

// Lee celdas concretas de un .xlsx con SheetJS (ya vendorizado en xlsx.min.js) y devuelve su valor (.v).
function leerCeldasXlsxReal(arrayBuffer, refs) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const resultado = {};
  refs.forEach((ref) => {
    const celda = ws[ref];
    resultado[ref] = celda ? celda.v : undefined;
  });
  return resultado;
}
// Mismo prefijo que escribe la persona entrevistadora en la celda C8 de la Entrevista Estructurada
// ("Nombre : Juan Pérez") — se extrae el nombre quitando la etiqueta.
function extraerNombreEntrevistaCand(valorC8) {
  if (typeof valorC8 !== 'string') return '';
  return valorC8.replace(/^\s*nombre\s*:?\s*/i, '').trim();
}
// Botón "Cargar formulario cumplimentado": intenta detectar nombre/apellidos/email/teléfono/departamento
// de las celdas C14/C15/C22/C23/C10 (mismas celdas que el Formulario del Candidato oficial) y abre
// "Registrar candidatura" ya precumplimentado; si no se puede leer, abre el formulario en blanco.
async function onCandExcelFormularioChange(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) {
    mostrarToast('⚠️ El formulario debe ser el archivo Excel oficial (.xlsx)', false);
    return;
  }
  const buffer = await file.arrayBuffer();
  let datos = null;
  try {
    const celdas = leerCeldasXlsxReal(buffer, ['C10', 'C14', 'C15', 'C22', 'C23']);
    const nombre = [celdas.C14, celdas.C15]
      .filter((v) => typeof v === 'string' && v.trim())
      .map((v) => v.trim())
      .join(' ')
      .trim();
    const email = typeof celdas.C22 === 'string' ? celdas.C22.trim() : '';
    const telefono = celdas.C23 != null ? String(celdas.C23).trim() : '';
    const deptoTexto = typeof celdas.C10 === 'string' ? celdas.C10.trim() : '';
    if (nombre && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) datos = { nombre, email, telefono, deptoTexto };
  } catch (err) {
    datos = null;
  }
  if (datos) {
    // Detección correcta: se crea la candidatura directamente con los datos del formulario,
    // sin pasos manuales adicionales.
    let dept = null;
    if (datos.deptoTexto) {
      const objetivo = _normalizarTextoCand(datos.deptoTexto);
      dept = CANDIDATO_DEPARTAMENTOS.find((d) => _normalizarTextoCand(d.label).includes(objetivo) || objetivo.includes(_normalizarTextoCand(d.label))) || null;
    }
    const payload = {
      hotel_id: usuarioActual.hotel_id,
      nombre: datos.nombre,
      email: datos.email || null,
      telefono: datos.telefono || null,
      puesto_key: dept ? dept.puestoKey : null,
      puesto_label: dept ? dept.label : null
    };
    const { error } = await sb.from('candidatos').insert(payload);
    if (error) {
      mostrarToast('Error al crear la candidatura: ' + error.message, false);
      return;
    }
    await cargarCandidatosAdmin();
    await registrarAuditoria('Formulario del Candidato', 'Candidatura creada automáticamente desde el formulario cumplimentado', `${datos.nombre} — ${file.name}`);
    mostrarToast(`✅ Candidatura creada: ${datos.nombre} — ${datos.email}${dept ? ' — ' + dept.label : ''}`, true);
  } else {
    // No se pudo leer el formulario automáticamente: se abre "Registrar candidatura" en blanco
    // para que se complete a mano, en vez de perder el adjunto.
    abrirNuevoCandidatoModal();
    mostrarToast('⚠️ No se pudieron leer los datos del formulario automáticamente — compruébalos y complétalos a mano.', false);
  }
}
// Botón "Cargar entrevista cumplimentada" (card superior): no depende de tener ya abierta una
// candidatura — lee el archivo, detecta % (D14) y nombre (C8), y permite elegir a qué persona
// candidata corresponde antes de guardar el resultado directamente.
let reTopArrayBuffer = null;
let reTopPorcentajeDetectado = null;
async function onCandExcelEntrevistaTopChange(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) {
    mostrarToast('⚠️ La entrevista debe ser el archivo Excel oficial (.xlsx)', false);
    return;
  }
  if (!candidatosCache.length) {
    mostrarToast('⚠️ Todavía no hay ninguna candidatura registrada a la que asociar esta entrevista.', false);
    return;
  }
  reTopArrayBuffer = await file.arrayBuffer();
  reTopPorcentajeDetectado = null;
  $('reTopPorcentajeManual').value = '';
  let nombreDetectado = '';
  try {
    const celdas = leerCeldasXlsxReal(reTopArrayBuffer, ['D14', 'C8']);
    const val = celdas.D14;
    if (typeof val === 'number' && isFinite(val) && val >= 0 && val <= 1.5) {
      reTopPorcentajeDetectado = Math.round((val <= 1 ? val * 100 : val) * 10) / 10;
    }
    nombreDetectado = extraerNombreEntrevistaCand(celdas.C8);
  } catch (err) {
    reTopPorcentajeDetectado = null;
  }
  const elegibles = candidatosCache.filter((c) => c.estado !== 'alta_realizada');
  const select = $('reTopCandidatoSelect');
  select.innerHTML = elegibles.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('');
  if (nombreDetectado) {
    const objetivo = _normalizarTextoCand(nombreDetectado);
    const match = elegibles.find((c) => {
      const n = _normalizarTextoCand(c.nombre);
      return n === objetivo || n.includes(objetivo) || objetivo.includes(n);
    });
    if (match) select.value = match.id;
  }
  const deteccionEl = $('reTopDeteccion');
  const manualWrap = $('reTopManualWrap');
  if (reTopPorcentajeDetectado != null) {
    deteccionEl.textContent = `✅ % de adaptación detectado automáticamente en la celda D14: ${reTopPorcentajeDetectado}%${nombreDetectado ? ` — nombre leído: "${nombreDetectado}"` : ''}`;
    manualWrap.style.display = 'none';
  } else {
    deteccionEl.textContent = '⚠️ No se pudo leer la celda D14 automáticamente (la entrevista debe estar cumplimentada y guardada en Excel).';
    manualWrap.style.display = 'block';
  }
  $('modalResultadoEntrevistaTop').classList.remove('hidden');
}
function cerrarResultadoEntrevistaTopModal() {
  $('modalResultadoEntrevistaTop').classList.add('hidden');
  reTopArrayBuffer = null;
  reTopPorcentajeDetectado = null;
}
async function guardarResultadoEntrevistaTop(e) {
  e.preventDefault();
  const candidatoId = $('reTopCandidatoSelect').value;
  const c = candidatosCache.find((x) => String(x.id) === String(candidatoId));
  if (!c) {
    mostrarToast('⚠️ Selecciona la persona candidata', false);
    return;
  }
  let porcentaje, origen;
  if (reTopPorcentajeDetectado != null) {
    porcentaje = reTopPorcentajeDetectado;
    origen = 'automático — celda D14 del Excel de Entrevista Estructurada';
  } else {
    const manual = $('reTopPorcentajeManual').value;
    if (manual === '') {
      mostrarToast('⚠️ No se pudo leer la celda D14 automáticamente: indica el % manualmente', false);
      return;
    }
    porcentaje = Math.max(0, Math.min(100, parseFloat(manual) || 0));
    origen = 'manual (no se pudo leer la celda D14 automáticamente)';
  }
  const payload = {
    estado: 'entrevista_realizada',
    resultado_entrevista: `${porcentaje}% de adaptación — ${origen}`,
    puntuacion_adaptacion: porcentaje,
    resultado_entrevista_categoria: categoriaResultadoEntrevista(porcentaje, umbralAdaptacionCandidatoCache)
  };
  const { error } = await sb.from('candidatos').update(payload).eq('id', c.id);
  if (error) {
    mostrarToast('Error al guardar: ' + error.message, false);
    return;
  }
  await cargarCandidatosAdmin();
  cerrarResultadoEntrevistaTopModal();
  await registrarAuditoria('Formulario del Candidato', 'Resultado de entrevista registrado', `${c.nombre} — ${porcentaje}% de adaptación (${origen})`);
  mostrarToast(`Resultado de la entrevista guardado ✓ (${porcentaje}% de adaptación)`, true);
}
// Botón "Leer de Entrevista Estructurada (Excel)" dentro de "gestionar candidatura": lee el % de
// adaptación de la celda D14 (misma celda que el documento oficial) y lo precumplimenta.
async function onCandExcelEntrevistaChange(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  if (!/\.xlsx$/i.test(file.name)) {
    mostrarToast('⚠️ La entrevista debe ser el archivo Excel oficial (.xlsx)', false);
    return;
  }
  const deteccionEl = $('candEntrevistaDeteccion');
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  const buffer = await file.arrayBuffer();
  let porcentaje = null;
  let nombreDetectado = '';
  try {
    const celdas = leerCeldasXlsxReal(buffer, ['D14', 'C8']);
    const val = celdas.D14;
    if (typeof val === 'number' && isFinite(val) && val >= 0 && val <= 1.5) {
      porcentaje = Math.round((val <= 1 ? val * 100 : val) * 10) / 10;
    }
    nombreDetectado = extraerNombreEntrevistaCand(celdas.C8);
  } catch (err) {
    porcentaje = null;
  }
  deteccionEl.style.display = 'block';
  if (porcentaje != null) {
    $('candModalPuntuacion').value = porcentaje;
    if (!$('candModalResultado').value.trim()) $('candModalResultado').value = `Detectado automáticamente — celda D14 (${file.name})`;
    deteccionEl.textContent = `✅ % de adaptación detectado automáticamente en la celda D14 (Aptitud del candidato para contratarlo: promedio total): ${porcentaje}%`;
    if (nombreDetectado && c) {
      const objetivo = _normalizarTextoCand(nombreDetectado);
      const n = _normalizarTextoCand(c.nombre);
      if (!(n === objetivo || n.includes(objetivo) || objetivo.includes(n))) {
        deteccionEl.textContent += ` ⚠️ Atención: el nombre leído en el archivo ("${nombreDetectado}") no coincide con "${c.nombre}" — comprueba que sea el archivo correcto.`;
      }
    }
    // César: "si viene la entrevista física, ya ha pasado la entrevista [...] por el Excel" — si
    // este Excel se lee correctamente aquí, el formulario de entrevista se da por recibido al
    // guardar (guardarCandidato toma esta marca), sin necesidad de entrevista presencial.
    _candFormularioEntrevistaRecibidoPendiente = true;
    await registrarAuditoria('Formulario del Candidato', 'Resultado de entrevista leído automáticamente (celda D14)', `${c ? c.nombre : ''} — ${porcentaje}% — ${file.name}`);
  } else {
    deteccionEl.textContent = '⚠️ No se pudo leer la celda D14 automáticamente (la entrevista debe estar cumplimentada y guardada en Excel) — indica el % manualmente.';
  }
}

// César: "el resultado de la entrevista debe tener un desplegable que indique: Apto, Aptitud
// media, Aptitud baja, No apto [...] cumplir el 80% de ahí para arriba es el apto y de ahí para
// abajo los valores que te he indicado de 10 en 10" — usa el MISMO umbral configurable que ya
// decide "Apto" en el resto de la app (umbralAdaptacionCandidatoCache, por defecto 80%) como techo
// de la banda, y resta 10 puntos por cada categoría hacia abajo. César solo dio el límite superior
// (80%) y "de 10 en 10"; los cortes de "Aptitud media"/"Aptitud baja" (umbral-10/umbral-20) son la
// lectura más directa de esa instrucción — si no es la que quiere, es el único punto a ajustar.
function categoriaResultadoEntrevista(porcentaje, umbral) {
  if (porcentaje == null || porcentaje === '') return '';
  const u = umbral != null ? umbral : umbralAdaptacionCandidatoCache;
  if (porcentaje >= u) return 'Apto';
  if (porcentaje >= u - 10) return 'Aptitud media';
  if (porcentaje >= u - 20) return 'Aptitud baja';
  return 'No apto';
}
// César (02/11/2026): "quiero poder ver todo [...] el candidato es apto [...] eso se tiene que
// reflejar aquí en la ventana" — el resultado vivía solo dentro de la ficha (3 campos pequeños,
// había que abrir "Ver / gestionar" para verlo); esto lo saca también al propio listado, de un
// vistazo, sin tener que entrar candidato a candidato.
const CANDIDATO_RESULTADO_BADGE = {
  'Apto': ['✅ Apto', 'b-emerald'],
  'Aptitud media': ['🟡 Aptitud media', 'b-amber'],
  'Aptitud baja': ['🟠 Aptitud baja', 'b-amber'],
  'No apto': ['❌ No apto', 'b-rose']
};
function badgeResultadoCandidato(c) {
  const categoria = c.resultado_entrevista_categoria || categoriaResultadoEntrevista(c.puntuacion_adaptacion, umbralAdaptacionCandidatoCache);
  const pct = c.puntuacion_adaptacion != null ? `${c.puntuacion_adaptacion}%` : null;
  if (!categoria) return pct ? `<span class="badge2 b-slate">${pct}</span>` : '<span class="sub-c">—</span>';
  const b = CANDIDATO_RESULTADO_BADGE[categoria] || ['—', 'b-slate'];
  return `<span class="badge2 ${b[1]}">${b[0]}${pct ? ` · ${pct}` : ''}</span>`;
}

let candidatosCache = [];
let umbralAdaptacionCandidatoCache = 80;
// César: "No quiero tener que ir a Gmail/Outlook a leer si el candidato confirma o no [...] Ese
// control debe estar centralizado en la app" — cuántas respuestas sin leer tiene cada candidato
// (candidatos_correos_recibidos, migración 0107), para pintar el aviso 📥 en la propia lista.
let correosSinLeerCache = {};
async function cargarCandidatosAdmin() {
  const [{ data }, { data: params }, { data: sinLeer }] = await Promise.all([
    sb.from('candidatos').select('*').order('created_at', { ascending: false }),
    sb.from('coef_parametros').select('umbral_adaptacion_candidato').eq('hotel_id', usuarioActual.hotel_id).maybeSingle(),
    sb.rpc('correos_recibidos_sin_leer_por_candidato')
  ]);
  candidatosCache = data || [];
  correosSinLeerCache = {};
  (sinLeer || []).forEach((r) => { correosSinLeerCache[r.candidato_id] = r.sin_leer; });
  umbralAdaptacionCandidatoCache = params && params.umbral_adaptacion_candidato != null ? params.umbral_adaptacion_candidato : 80;
  if ($('candUmbralAdaptacion')) $('candUmbralAdaptacion').value = umbralAdaptacionCandidatoCache;
  if ($('candModalUmbralTexto')) $('candModalUmbralTexto').textContent = umbralAdaptacionCandidatoCache;
  const enProceso = candidatosCache.filter((c) => !['aprobado', 'rechazado', 'alta_realizada', 'caducado_rgpd'].includes(c.estado)).length;
  const altas = candidatosCache.filter((c) => c.estado === 'alta_realizada').length;
  // César: "un registro de candidatos que: no fueron seleccionados para ser entrevistados, y los
  // que no fueron seleccionados [tras entrevista]" — rechazado_fase distingue ambos sin tocar el
  // esquema de "estado" (lo fija guardarCandidato() en el momento del rechazo).
  const rechazadosSinEntrevista = candidatosCache.filter((c) => c.estado === 'rechazado' && c.rechazado_fase === 'sin_entrevista').length;
  const rechazadosTrasEntrevista = candidatosCache.filter((c) => c.estado === 'rechazado' && c.rechazado_fase === 'tras_entrevista').length;
  $('candidatosKpis').innerHTML = `
    <div class="card kpi"><div class="ic">🧑‍💼</div><div><div class="t">Candidaturas recibidas</div><div class="v">${candidatosCache.length}</div></div></div>
    <div class="card kpi"><div class="ic">⏳</div><div><div class="t">En proceso</div><div class="v">${enProceso}</div></div></div>
    <div class="card kpi"><div class="ic">🏁</div><div><div class="t">Altas realizadas</div><div class="v">${altas}</div></div></div>
    <div class="card kpi"><div class="ic">📭</div><div><div class="t">Rechazados sin entrevista</div><div class="v">${rechazadosSinEntrevista}</div></div></div>
    <div class="card kpi"><div class="ic">🗣</div><div><div class="t">Rechazados tras entrevista</div><div class="v">${rechazadosTrasEntrevista}</div></div></div>`;
  $('candidatosBody').innerHTML =
    candidatosCache
      .map((c) => {
        const est = CANDIDATO_ESTADOS[c.estado] || ['—', 'b-slate'];
        const fase = c.rechazado_fase ? `<p class="sub-c" style="margin:2px 0 0;">${c.rechazado_fase === 'tras_entrevista' ? 'Tras entrevista' : 'Sin entrevista'}</p>` : '';
        return `<tr>
          <td><b>${c.nombre}</b><p class="sub-c" style="margin:2px 0 0;">${c.email || '—'}</p></td>
          <td>${c.puesto_label || '—'}</td>
          <td>${fechaCorta(c.fecha_solicitud)}</td>
          <td><span class="badge2 ${est[1]}">${est[0]}</span>${fase}</td>
          <td>${badgeResultadoCandidato(c)}</td>
          <td>${c.origen === 'qr_publico' ? '📱 QR' : '🖊 Manual'}</td>
          <td style="font-size:15px;white-space:nowrap;">${resumenSeguimientoCandidatoCorto(c)}</td>
          <td style="white-space:nowrap;"><button type="button" class="btn btn-secondary btn-sm" onclick="abrirCandidatoModal('${c.id}')">Ver / gestionar</button>${botonCrearFichaListado(c)}</td>
        </tr>`;
      })
      .join('') || '<tr><td colspan="8" class="sub-c" style="text-align:center;padding:14px;">Todavía no se ha adjuntado ninguna candidatura cumplimentada.</td></tr>';
}
// César: "un cuadro de seguimiento correcto por candidato, pero en la misma línea" — resumen de un
// vistazo en el propio listado (antes solo visible dentro de "Ver / gestionar"), con el detalle
// completo (fechas) en el title de cada icono.
// César: "podemos llamar al menos una vez y deberíamos indicar no has llamado [...] cuando envías
// el correo diciéndole que lo vas a contratar, tienes que llamarle luego [...] también deberíamos
// llamar si no nos confirman la fecha para la entrevista" — dos disparadores de llamada obligatoria;
// se compara con la ÚLTIMA llamada registrada (no solo si existe alguna llamada antigua, de antes de
// que ocurriera el disparador) para saber si hace falta llamar AHORA, no si se llamó alguna vez.
function candidatoLlamadaPendiente(c) {
  const llamadas = Array.isArray(c.contacto_llamadas) && c.contacto_llamadas.length ? c.contacto_llamadas : (c.contacto_llamado_en ? [c.contacto_llamado_en] : []);
  const ultimaLlamada = llamadas.length ? llamadas[llamadas.length - 1] : null;
  const llamadaTras = (disparador) => !!ultimaLlamada && !!disparador && new Date(ultimaLlamada) >= new Date(disparador);
  if (c.confirmacion_contratacion_enviada_en && !c.trabajador_id && !llamadaTras(c.confirmacion_contratacion_enviada_en)) {
    return { pendiente: true, motivo: 'Se ha enviado el correo de confirmación de contratación — hay que llamarle para confirmarlo en persona.' };
  }
  if (c.estado === 'entrevista_programada' && c.cita_entrevista_enviada_en && !c.cita_confirmada_en && !llamadaTras(c.cita_entrevista_enviada_en)) {
    return { pendiente: true, motivo: 'No ha confirmado por correo la cita de entrevista — hay que llamarle para confirmar su asistencia.' };
  }
  return { pendiente: false, motivo: '' };
}
function resumenSeguimientoCandidatoCorto(c) {
  const items = [];
  const sinLeer = correosSinLeerCache[c.id];
  if (sinLeer) items.push(`<span title="${sinLeer} respuesta(s) del candidato sin leer" style="color:#dc2626;font-weight:700;">🔔 ${sinLeer}</span>`);
  const pendLlamada = candidatoLlamadaPendiente(c);
  const llamadas = Array.isArray(c.contacto_llamadas) && c.contacto_llamadas.length ? c.contacto_llamadas : (c.contacto_llamado_en ? [c.contacto_llamado_en] : []);
  if (pendLlamada.pendiente) {
    items.push(`<span title="${pendLlamada.motivo}" style="color:#dc2626;font-weight:700;">📞⚠️</span>`);
  } else {
    items.push(llamadas.length ? `<span title="${llamadas.length} llamada(s) — última el ${fechaHoraCorta(llamadas[llamadas.length - 1])}">📞${llamadas.length > 1 ? `×${llamadas.length}` : ''}</span>` : '<span title="Sin llamada registrada" style="opacity:.25;">📞</span>');
  }
  items.push(c.formulario_entrevista_enviado_en ? `<span title="Formulario Fase 1 enviado el ${fechaCorta(c.formulario_entrevista_enviado_en)}">📨</span>` : '<span title="Formulario Fase 1 no enviado" style="opacity:.25;">📨</span>');
  items.push(c.formulario_entrevista_recibido_en ? `<span title="Formulario Fase 1 recibido el ${fechaCorta(c.formulario_entrevista_recibido_en)}">📥</span>` : '<span title="Formulario Fase 1 sin recibir" style="opacity:.25;">📥</span>');
  if (c.fecha_entrevista) {
    items.push(c.cita_confirmada_en ? `<span title="Asistencia confirmada el ${fechaCorta(c.cita_confirmada_en)}">✅</span>` : `<span title="Cita enviada para ${fechaCorta(c.fecha_entrevista)} — asistencia sin confirmar">📅</span>`);
  }
  return items.join(' ');
}
async function actualizarUmbralAdaptacionCandidato(valor) {
  const nuevo = Math.max(0, Math.min(100, parseInt(valor, 10) || 0));
  const { error } = await sb.from('coef_parametros').upsert({ hotel_id: usuarioActual.hotel_id, umbral_adaptacion_candidato: nuevo }, { onConflict: 'hotel_id' });
  if (error) {
    mostrarToast('Error al guardar el umbral: ' + error.message, false);
    return;
  }
  umbralAdaptacionCandidatoCache = nuevo;
  if ($('candModalUmbralTexto')) $('candModalUmbralTexto').textContent = nuevo;
  mostrarToast('Umbral de adaptación actualizado ✓', true);
  await registrarAuditoria('Formulario del Candidato', 'Umbral de adaptación para crear ficha actualizado', `${nuevo}%`);
  if (currentCandidatoId != null) {
    const c = candidatosCache.find((x) => x.id === currentCandidatoId);
    if (c) {
      actualizarVisibilidadBotonesContratacionCandidato(c);
      if ($('candModalResultadoCategoria')) $('candModalResultadoCategoria').value = categoriaResultadoEntrevista($('candModalPuntuacion').value ? parseInt($('candModalPuntuacion').value, 10) : null, nuevo);
    }
  }
}
function abrirNuevoCandidatoModal() {
  $('formNuevoCandidato').reset();
  $('ncDepartamento').innerHTML = CANDIDATO_DEPARTAMENTOS.map((d) => `<option value="${d.puestoKey}">${d.label}</option>`).join('');
  $('modalNuevoCandidato').classList.remove('hidden');
}
function cerrarNuevoCandidatoModal() {
  $('modalNuevoCandidato').classList.add('hidden');
}
async function guardarNuevoCandidato(e) {
  e.preventDefault();
  const dept = CANDIDATO_DEPARTAMENTOS.find((d) => d.puestoKey === $('ncDepartamento').value);
  const payload = {
    hotel_id: usuarioActual.hotel_id,
    nombre: $('ncNombre').value.trim(),
    email: $('ncEmail').value.trim() || null,
    telefono: $('ncTelefono').value.trim() || null,
    puesto_key: dept ? dept.puestoKey : null,
    puesto_label: dept ? dept.label : null
  };
  const { error } = await sb.from('candidatos').insert(payload);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Candidatura registrada ✓', !error);
  if (!error) {
    cerrarNuevoCandidatoModal();
    await cargarCandidatosAdmin();
    await registrarAuditoria('Candidaturas', 'Nueva candidatura', payload.nombre);
  }
}
let currentCandidatoId = null;
let _candFormularioEntrevistaRecibidoPendiente = false;
// César: "antes de abrir la parte de la contratación hay que confirmarle al trabajador [...] la
// documentación que necesitamos. Esto tiene que ser con un correo" — centraliza aquí la condición
// de "elegible" (igual que ya usaba darAltaDesdeCanditado) y añade el nuevo paso obligatorio: el
// botón de alta solo aparece DESPUÉS de haber enviado el correo de confirmación/documentación.
function candidatoElegibleParaContratacion(c) {
  return c.estado === 'aprobado' || (c.puntuacion_adaptacion != null && c.puntuacion_adaptacion >= umbralAdaptacionCandidatoCache);
}
// César (06/11/2026): "el botón de crear ficha tiene que salir en la línea del trabajador [...]
// en la misma línea [...] si ya está aprobado, si el porcentaje es el idóneo" — antes solo vivía
// dentro de "Ver / gestionar" (candModalAltaBtn); se añade aquí, en la propia fila del listado,
// con la MISMA cadena de requisitos que ya exige el botón del modal (confirmación de contratación
// enviada + documentación recibida + enviada a gestoría) — no se salta ningún paso, solo se
// adelanta la visibilidad del botón final para no tener que entrar a "Ver / gestionar" a buscarlo.
function botonCrearFichaListado(c) {
  if (c.trabajador_id || c.estado === 'alta_realizada') return '';
  const listo = candidatoElegibleParaContratacion(c) && c.confirmacion_contratacion_enviada_en && c.documentacion_recibida_en && c.documentacion_enviada_gestoria_en;
  if (!listo) return '';
  return ` <button type="button" class="btn btn-sm" style="margin-left:6px;" onclick="crearFichaDesdeListado('${c.id}', this)">✅ Crear ficha</button>`;
}
async function crearFichaDesdeListado(id, btn) {
  currentCandidatoId = id;
  await darAltaDesdeCanditado(btn);
}
// César (sexta vuelta): "no se puede dar de alta si falta el DNI, si falta el certificado
// bancario y si falta el número de seguridad social [...] esos tres documentos son los que se
// tienen que enviar a la gestoría [...] cuando reúnes la documentación [...] enviar a gestoría,
// marcado como enviado a gestoría. Y ahí se crea la ficha" — la cadena de botones ahora exige,
// EN ORDEN: 4 confirmar contratación → documentación completa (recibida, no es un botón) → 5
// enviar a gestoría → 6 dar de alta. Cada botón solo aparece cuando el anterior ya se ha hecho.
function actualizarVisibilidadBotonesContratacionCandidato(c) {
  // César (06/11/2026, parte 8): "ya tenemos otros circuitos montados [...] hazlo bien" — los pasos
  // 4/5/6 vivían como botones sueltos en 2 sitios distintos del formulario; ahora son 3 filas más
  // de la tabla "📞 Seguimiento de contacto" (ver renderSeguimientoContactoCandidato), con el mismo
  // criterio 🤖 Automático / ✋ Manual / Detalle que ya usan los pasos 1-3. Los botones sueltos
  // originales se quedan ocultos para siempre.
  if ($('btnCandConfirmarContratacion')) $('btnCandConfirmarContratacion').style.display = 'none';
  if ($('btnCandEnviarDocumentacionGestoria')) $('btnCandEnviarDocumentacionGestoria').style.display = 'none';
  if ($('candModalAltaBtn')) $('candModalAltaBtn').style.display = 'none';
  renderSeguimientoContactoCandidato(c);
}
// César (02/11/2026): "el resultado ese [93,3%] tiene que salir reflejado en el panel [...] es
// como si no hubieses hecho un carajo" — el % y la categoría ya se guardaban, pero solo vivían
// dentro de 2 campos pequeños del formulario; esto los saca como un bloque grande, imposible de
// pasar por alto, nada más abrir la ficha, con quién evaluó y cuándo.
function renderResultadoBannerCandidato(c) {
  const el = $('candResultadoBanner');
  if (!el) return;
  if (c.puntuacion_adaptacion == null && !c.resultado_entrevista_categoria) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const categoria = c.resultado_entrevista_categoria || categoriaResultadoEntrevista(c.puntuacion_adaptacion, umbralAdaptacionCandidatoCache);
  const b = CANDIDATO_RESULTADO_BADGE[categoria] || ['— Sin calcular —', 'b-slate'];
  const evaluadoPor = c.entrevista_evaluador ? ` · evaluado por ${_escHtml(c.entrevista_evaluador)}` : '';
  const evaluadoCuando = c.entrevista_evaluado_en ? ` el ${fechaCorta(c.entrevista_evaluado_en)}` : '';
  const puntos = (c.entrevista_puntos_obtenidos != null && c.entrevista_puntos_maximos != null) ? ` (${c.entrevista_puntos_obtenidos}/${c.entrevista_puntos_maximos} puntos)` : '';
  el.style.display = '';
  el.innerHTML = `<div class="card card-pad" style="background:var(--slate-50);border:1px solid var(--slate-200);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <p class="sub-c" style="margin:0 0 2px;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.02em;">Resultado de la evaluación</p>
        <p style="margin:0;font-size:22px;font-weight:800;">${c.puntuacion_adaptacion != null ? `${c.puntuacion_adaptacion}%` : '—'} <span class="badge2 ${b[1]}" style="font-size:13px;vertical-align:middle;">${b[0]}</span></p>
        <p class="sub-c" style="margin:4px 0 0;">${puntos}${evaluadoPor}${evaluadoCuando}</p>
      </div>
    </div>`;
}
// César (02/11/2026, segunda vuelta): estado global de la documentación de incorporación, arriba
// de los 3 campos — para saber de un vistazo qué falta sin tener que leer los 3 por separado, igual
// de rápido tanto si lo ha subido el propio candidato desde su enlace como si lo ha registrado
// RR.HH. a mano (ambos caminos escriben en las mismas columnas).
// César (sexta vuelta): "no se puede dar de alta si falta el DNI, el certificado bancario o el
// número de Seguridad Social [...] esos tres documentos se tienen que enviar a la gestoría [...]
// y ahí se crea la ficha" — 3 estados posibles ahora, no 2: falta algo → completa pero sin enviar
// a gestoría (bloquea el alta) → completa y enviada a gestoría (ya se puede dar de alta).
function renderDocumentacionEstadoCandidato(c) {
  if (!$('candDocumentacionEstadoGlobal')) return;
  if (!c.documentacion_recibida_en) {
    const faltan = [];
    if (!c.numero_seguridad_social) faltan.push('Seguridad Social');
    if (!c.dni_nie_adjunto_nombre) faltan.push('DNI/NIE');
    if (!c.certificado_bancario_adjunto_nombre) faltan.push('certificado bancario');
    $('candDocumentacionEstadoGlobal').innerHTML = faltan.length === 3
      ? '<span class="badge2 b-slate">Sin empezar</span>'
      : `<span class="badge2 b-amber">🟡 Falta: ${faltan.join(', ')}</span>`;
    return;
  }
  if (!c.documentacion_enviada_gestoria_en) {
    $('candDocumentacionEstadoGlobal').innerHTML = `<span class="badge2 b-amber">📄 Documentación completa</span> (recibida el ${fechaCorta(c.documentacion_recibida_en)}) — pendiente de enviar a gestoría (paso 5). Sin esto no se puede dar de alta.`;
    return;
  }
  $('candDocumentacionEstadoGlobal').innerHTML = `<span class="badge2 b-emerald">✅ Documentación completa y enviada a gestoría</span> el ${fechaCorta(c.documentacion_enviada_gestoria_en)} — ya se puede dar de alta (paso 6).`;
}
// César (03/11/2026, novena vuelta): "no me gusta ni es manual ni es automático [...] quiero orden
// y limpieza [...] un cuadro de check real, automático y al lado otro manual que se vea qué ha sido
// manual y automático" — sustituye a renderBotonFormularioFase1() + renderSeguimientoLlamadaCandidato()
// + el párrafo corrido de candSeguimientoContacto (todo disperso, sin distinguir qué confirma el
// sistema solo de qué confirma RR.HH. a mano). Pinta la tabla #segF1*/#segAsist*/#segLlam* del HTML:
// una fila por paso, con su columna 🤖 Automático (lo que el sistema puede demostrar él solo) y su
// columna ✋ Manual (lo que RR.HH. tiene que confirmar a mano porque la app no puede verificarlo).
// No hay columna nueva en la base de datos para "fue manual o automático": para el Formulario Fase 1
// se deduce en _envioFormularioFase1EsReal() comparando con el historial de correos ya cargado.
function _envioFormularioFase1EsReal(c) {
  if (!c.formulario_entrevista_enviado_en) return null; // todavía no se ha enviado
  // Si el envío fue real (botón 1, vía enviar_correo_externo) queda un correo de "Fase 1" en el
  // historial encolado/enviado de verdad; si fue el botón manual "1 (alt)" no se encola nada.
  return (_candHistorialCorreosCache || []).some((n) => /fase\s*1/i.test(n.titulo || '') && n.estado !== 'error');
}
function renderSeguimientoContactoCandidato(c) {
  // --- 1. Formulario Fase 1 ---
  const f1Auto = $('segF1AutoCelda');
  const f1Manual = $('segF1ManualCelda');
  const f1Detalle = $('segF1Detalle');
  const esReal = _envioFormularioFase1EsReal(c);
  if (f1Auto) {
    const partes = [];
    if (esReal) partes.push('<span class="badge2 b-sky">📤 Enviado</span>');
    if (c.formulario_entrevista_recibido_en) partes.push('<span class="badge2 b-emerald">📥 Recibido</span>');
    f1Auto.innerHTML = partes.length ? partes.join(' ') : '<span style="color:var(--slate-400);">—</span>';
  }
  if (f1Manual) {
    if ($('btnCandFormularioFase1')) $('btnCandFormularioFase1').textContent = c.formulario_entrevista_enviado_en ? 'Reenviar' : 'Enviar';
    if ($('btnCandMarcarFormularioEnviado')) $('btnCandMarcarFormularioEnviado').style.display = c.formulario_entrevista_recibido_en ? 'none' : '';
    let badge = f1Manual.querySelector('.seg-manual-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'seg-manual-badge';
      badge.style.cssText = 'margin-top:4px;';
      f1Manual.appendChild(badge);
    }
    badge.innerHTML = (c.formulario_entrevista_enviado_en && esReal === false) ? '<span class="badge2 b-amber">✋ Marcado a mano</span>' : '';
  }
  if (f1Detalle) {
    f1Detalle.textContent = c.formulario_entrevista_recibido_en
      ? `Recibido el ${fechaCorta(c.formulario_entrevista_recibido_en)}`
      : (c.formulario_entrevista_enviado_en ? `Enviado el ${fechaCorta(c.formulario_entrevista_enviado_en)} — pendiente de recibir` : 'Pendiente de enviar');
  }

  // --- 2. Asistencia a entrevista ---
  const asistManual = $('segAsistManualCelda');
  const asistDetalle = $('segAsistDetalle');
  const btnAsist = $('btnCandMarcarAsistencia');
  if (asistManual && btnAsist) {
    const sinCita = asistManual.querySelector('.seg-sin-cita');
    let badge = asistManual.querySelector('.seg-asist-badge');
    if (!c.fecha_entrevista) {
      btnAsist.style.display = 'none';
      if (badge) badge.remove();
      if (!sinCita) {
        const span = document.createElement('span');
        span.className = 'seg-sin-cita';
        span.style.color = 'var(--slate-400)';
        span.textContent = 'Sin cita programada';
        asistManual.appendChild(span);
      }
    } else if (c.cita_confirmada_en) {
      if (sinCita) sinCita.remove();
      btnAsist.style.display = 'none';
      if (!badge) { badge = document.createElement('span'); badge.className = 'seg-asist-badge'; asistManual.appendChild(badge); }
      badge.innerHTML = '<span class="badge2 b-emerald">✅ Confirmada</span>';
    } else {
      if (sinCita) sinCita.remove();
      if (badge) badge.remove();
      btnAsist.style.display = '';
    }
  }
  if (asistDetalle) {
    asistDetalle.textContent = !c.fecha_entrevista
      ? '—'
      : (c.cita_confirmada_en ? `Confirmada el ${fechaCorta(c.cita_confirmada_en)}` : `Cita el ${fechaHoraCorta(c.fecha_entrevista)} — asistencia sin confirmar`);
  }

  // --- 3. Llamadas (mínimo 2) ---
  // César: "es necesario que el llamar sea imprescindible" — se marca en rojo el botón y aparece un
  // aviso explícito con el motivo cuando hay una llamada pendiente obligatoria.
  const llamadas = Array.isArray(c.contacto_llamadas) && c.contacto_llamadas.length ? c.contacto_llamadas : (c.contacto_llamado_en ? [c.contacto_llamado_en] : []);
  const pend = candidatoLlamadaPendiente(c);
  const llamManual = $('segLlamManualCelda');
  const llamDetalle = $('segLlamDetalle');
  const btnLlamado = $('btnCandMarcarLlamado');
  if (llamManual) {
    let contador = llamManual.querySelector('.seg-llam-contador');
    if (!contador) {
      contador = document.createElement('span');
      contador.className = 'seg-llam-contador';
      contador.style.marginRight = '6px';
      llamManual.insertBefore(contador, llamManual.firstChild);
    }
    const clase = llamadas.length >= 2 ? 'b-emerald' : (llamadas.length === 1 ? 'b-amber' : 'b-slate');
    const icono = llamadas.length >= 2 ? '✅' : (pend.pendiente ? '⚠️' : '⬜');
    contador.innerHTML = `<span class="badge2 ${clase}">${icono} ${llamadas.length}/2</span>`;
  }
  if (btnLlamado) {
    btnLlamado.classList.toggle('btn-amber', pend.pendiente);
    btnLlamado.textContent = pend.pendiente ? '⚠️ Registrar llamada (urgente)' : 'Registrar llamada';
  }
  if (llamDetalle) {
    llamDetalle.textContent = llamadas.length
      ? `${llamadas.length} llamada(s) — última el ${fechaHoraCorta(llamadas[llamadas.length - 1])}`
      : 'Sin llamada registrada';
  }
  if ($('candLlamadaPendienteAviso')) {
    $('candLlamadaPendienteAviso').style.display = pend.pendiente ? '' : 'none';
    // César (07/11/2026): "este aviso debería tener un botón [...] cuando hayas llamado puedas
    // apretar como llamado y ya está" — botón de acción rápida dentro del propio aviso, para no
    // tener que ir a buscar el control "Registrar llamada" en la fila 3 de la tabla.
    $('candLlamadaPendienteAviso').innerHTML = pend.pendiente
      ? `⚠️ Llamada pendiente — ${_escHtml(pend.motivo)} <button type="button" class="btn btn-sm btn-amber" style="margin-left:8px;padding:2px 8px;font-size:11px;white-space:nowrap;" onclick="marcarCandidatoLlamado(this)">📞 Ya he llamado</button>`
      : '';
  }

  // César (06/11/2026, parte 8): "ya tenemos otros circuitos montados [...] hazlo bien" — pasos
  // 4/5/6 (contratación → gestoría → alta), como 3 filas más de esta MISMA tabla, con el mismo
  // criterio 🤖 Automático / ✋ Manual / Detalle que los pasos 1-3.
  const elegible = candidatoElegibleParaContratacion(c);
  if ($('segContratacionFilas')) $('segContratacionFilas').style.display = elegible ? '' : 'none';
  if (elegible) {
    const confirmacionHecha = !!c.confirmacion_contratacion_enviada_en;
    const documentacionLista = !!c.documentacion_recibida_en;
    const enviadaGestoria = !!c.documentacion_enviada_gestoria_en;
    const altaHecha = !!c.trabajador_id;

    // --- 4. Confirmación de contratación ---
    if ($('seg4AutoCelda')) {
      $('seg4AutoCelda').innerHTML = documentacionLista
        ? '<span class="badge2 b-sky">📄 Ya tenemos su documentación</span>'
        : '<span style="color:var(--slate-400);">—</span>';
    }
    if ($('seg4ManualCelda')) {
      // César: "si ya tenemos la documentación, ¿no se la tenemos que volver a pedir? [...] eso se
      // tiene que marcar" — si los 3 documentos ya están (p. ej. registrados a mano antes de llegar
      // aquí), no tiene sentido mandar un correo pidiéndolos otra vez: se marca el paso directamente,
      // sin correo. Si todavía faltan, el botón sí envía el correo real pidiéndolos.
      $('seg4ManualCelda').innerHTML = confirmacionHecha ? ''
        : documentacionLista
          ? '<button type="button" class="btn btn-sm" style="padding:3px 8px;font-size:11px;white-space:nowrap;" onclick="marcarConfirmacionContratacionSinCorreo(this)">✅ Marcar hecho (ya la tenemos)</button>'
          : '<button type="button" class="btn btn-sm" style="padding:3px 8px;font-size:11px;white-space:nowrap;" onclick="confirmarContratacionYEnviar(this)">✉️ Enviar (pide los 3 documentos)</button>';
    }
    if ($('seg4Detalle')) {
      $('seg4Detalle').textContent = confirmacionHecha ? `Hecho el ${fechaHoraCorta(c.confirmacion_contratacion_enviada_en)}` : 'Pendiente';
    }

    // --- 5. Enviar documentación a gestoría ---
    if ($('seg5AutoCelda')) {
      $('seg5AutoCelda').innerHTML = documentacionLista
        ? '<span class="badge2 b-emerald">✅ Documentación completa</span>'
        : '<span class="badge2 b-amber">🟡 Falta documentación</span>';
    }
    if ($('seg5ManualCelda')) {
      $('seg5ManualCelda').innerHTML = (!enviadaGestoria && confirmacionHecha && documentacionLista)
        ? '<button type="button" class="btn btn-sm" style="padding:3px 8px;font-size:11px;white-space:nowrap;" onclick="abrirEnviarDocumentacionGestoriaModal()">📤 Enviar</button>'
        : (enviadaGestoria ? '' : '<span style="color:var(--slate-400);">Esperando paso 4 y documentación</span>');
    }
    if ($('seg5Detalle')) {
      $('seg5Detalle').textContent = enviadaGestoria ? `Hecho el ${fechaHoraCorta(c.documentacion_enviada_gestoria_en)}` : (documentacionLista && confirmacionHecha ? 'Pendiente de enviar' : 'Esperando pasos anteriores');
    }

    // --- 6. Dar de alta ---
    if ($('seg6AutoCelda')) $('seg6AutoCelda').innerHTML = '<span style="color:var(--slate-400);">—</span>';
    if ($('seg6ManualCelda')) {
      $('seg6ManualCelda').innerHTML = (!altaHecha && enviadaGestoria)
        ? '<button type="button" class="btn btn-sm" style="padding:3px 8px;font-size:11px;white-space:nowrap;" onclick="darAltaDesdeCanditado(this)">🏁 Dar de alta</button>'
        : (altaHecha ? '' : '<span style="color:var(--slate-400);">Esperando paso 5</span>');
    }
    if ($('seg6Detalle')) $('seg6Detalle').textContent = altaHecha ? 'Ficha creada ✓' : 'Pendiente';
  }
}
// Mismo patrón que copiarEnlaceCandidatura() — para cuando RR.HH. quiere reenviar el enlace por
// WhatsApp/SMS en vez de (o además de) por correo, o reenviárselo a sí mismo para comprobarlo.
function copiarEnlaceDocumentacionCandidato() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c || !c.documentacion_token) {
    mostrarToast('⚠️ Todavía no se ha enviado el correo de confirmación — el enlace se genera en ese momento.', false);
    return;
  }
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}documentacion-candidato.html?token=${c.documentacion_token}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => mostrarToast('Enlace copiado ✓', true)).catch(() => mostrarToast('No se ha podido copiar — selecciona y copia el enlace a mano.', false));
  } else {
    mostrarToast('No se ha podido copiar — selecciona y copia el enlace a mano.', false);
  }
}
// César (03/11/2026): "poner otro botón que te permita ver los documentos adjuntos [...] revisa que
// todos los documentos estén, que [...] deben ser visibles, legibles" — mismo patrón ya usado para
// el CV (abajo, cv_adjunto_url): enlace "ver" que genera una URL firmada de corta duración (1h, solo
// para previsualizar, no para compartir) y la abre en pestaña nueva. Reutilizado aquí para DNI/NIE y
// certificado bancario, y también desde el panel de revisión del modal de envío a gestoría.
// César (03/11/2026, séptima vuelta): abre el documento en el visor DENTRO de la app (ver
// modalVisorDocumento en el HTML y abrirVisorDocumento() más abajo) en vez de window.open() en
// pestaña nueva — eso era lo que hacía que "volver atrás" sacara de la ficha del candidato.
function _pintarAdjuntoCandidatoConVer(idSpan, nombreArchivo, storagePath, etiquetaError) {
  const span = $(idSpan);
  if (!span) return;
  span.textContent = '';
  span.append(nombreArchivo ? `📎 ${nombreArchivo}` : 'Sin adjuntar.');
  if (!storagePath) return;
  span.append(' — ');
  const enlace = document.createElement('a');
  enlace.href = '#';
  enlace.textContent = 'ver';
  enlace.onclick = async (ev) => {
    ev.preventDefault();
    const { data: signed, error } = await sb.storage.from('formularios-adjuntos').createSignedUrl(storagePath, 3600);
    if (error) { mostrarToast(`No se pudo abrir ${etiquetaError}: ` + error.message, false); return; }
    abrirVisorDocumento(signed.signedUrl, `📎 ${nombreArchivo || etiquetaError}`, _esImagenPorNombre(nombreArchivo || storagePath));
  };
  span.appendChild(enlace);
}
// Decide si el documento es una foto (se pinta como <img>) o no (PDF u otro — se pinta en <iframe>,
// que Chrome/Edge ya saben mostrar). Por nombre de archivo, no por el contenido real: basta para
// los tipos que se adjuntan aquí (DNI/NIE, certificado bancario, CV).
function _esImagenPorNombre(nombre) {
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(nombre || '');
}
// Visor genérico de documentos — ver el comentario junto a #modalVisorDocumento en index.html.
// César (03/11/2026, octava vuelta): panel flotante y arrastrable, NO un modal de pantalla
// completa — así el admin puede dejarlo abierto junto al campo IBAN (o DNI/NIE) y comparar el
// número del documento con la sugerencia de la IA sin que nada tape el formulario de debajo.
function abrirVisorDocumento(url, titulo, esImagen) {
  if ($('visorDocumentoTitulo')) $('visorDocumentoTitulo').textContent = titulo || '📎 Documento';
  if ($('visorDocumentoDescargar')) $('visorDocumentoDescargar').href = url;
  const cuerpo = $('visorDocumentoCuerpo');
  if (cuerpo) {
    cuerpo.innerHTML = '';
    if (esImagen) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = titulo || 'Documento';
      img.style.maxWidth = '100%';
      img.style.maxHeight = '56vh';
      img.style.borderRadius = '6px';
      cuerpo.appendChild(img);
    } else {
      const frame = document.createElement('iframe');
      frame.src = url;
      frame.style.cssText = 'width:100%;height:56vh;border:none;border-radius:6px;background:#fff;';
      cuerpo.appendChild(frame);
    }
  }
  const panel = $('modalVisorDocumento');
  if (panel) {
    panel.classList.remove('hidden');
    _posicionarVisorDocumentoPorDefecto();
  }
}
function cerrarVisorDocumento() {
  if ($('modalVisorDocumento')) $('modalVisorDocumento').classList.add('hidden');
  if ($('visorDocumentoCuerpo')) $('visorDocumentoCuerpo').innerHTML = '';
}
// Posición inicial: arriba a la derecha, dejando el resto de la pantalla (y el formulario) libre.
// Se recalcula cada vez que se abre un documento nuevo, para que no aparezca fuera de la pantalla
// si antes se arrastró a una esquina en una ventana más grande.
function _posicionarVisorDocumentoPorDefecto() {
  const panel = $('modalVisorDocumento');
  if (!panel) return;
  const ancho = panel.offsetWidth || 460;
  panel.style.left = Math.max(12, window.innerWidth - ancho - 24) + 'px';
  panel.style.top = '70px';
}
let _visorDocumentoArrastre = null;
function _iniciarArrastreVisorDocumento(ev) {
  const panel = $('modalVisorDocumento');
  if (!panel) return;
  const punto = ev.touches ? ev.touches[0] : ev;
  const rect = panel.getBoundingClientRect();
  _visorDocumentoArrastre = { dx: punto.clientX - rect.left, dy: punto.clientY - rect.top };
  ev.preventDefault();
}
function _moverVisorDocumento(ev) {
  if (!_visorDocumentoArrastre) return;
  const panel = $('modalVisorDocumento');
  if (!panel) return;
  const punto = ev.touches ? ev.touches[0] : ev;
  let left = punto.clientX - _visorDocumentoArrastre.dx;
  let top = punto.clientY - _visorDocumentoArrastre.dy;
  left = Math.min(Math.max(8, left), window.innerWidth - panel.offsetWidth - 8);
  top = Math.min(Math.max(8, top), window.innerHeight - 48);
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  ev.preventDefault();
}
function _soltarVisorDocumento() { _visorDocumentoArrastre = null; }
// César (03/11/2026): "Crea el OCR, hazlo tú, yo te autorizo" — lectura automática del DNI/NIE y
// del certificado bancario (Edge Function extraer-datos-documento, Claude Vision, migración 0115).
// El resultado se guarda SOLO como sugerencia (dni_nie_ocr_sugerido / iban_ocr_*) — nunca sustituye
// el campo real por sí sola. Aquí se pinta esa sugerencia, con un enlace "Usar" que es la única
// forma de copiarla al campo de verdad; la casilla de confirmación del IBAN nunca se marca sola.
function _renderSugerenciasOcrCandidato(c) {
  const pDni = $('candDniOcrSugerencia');
  if (pDni) {
    if (c.dni_nie_ocr_sugerido && c.dni_nie_ocr_sugerido !== (c.dni_nie || '')) {
      pDni.style.display = '';
      pDni.textContent = '';
      pDni.append(`🤖 IA sugiere (leído del DNI/NIE adjunto): ${c.dni_nie_ocr_sugerido} — `);
      const usar = document.createElement('a');
      usar.href = '#';
      usar.textContent = 'Usar';
      usar.onclick = (ev) => { ev.preventDefault(); $('candModalDni').value = c.dni_nie_ocr_sugerido; pDni.style.display = 'none'; };
      pDni.appendChild(usar);
    } else {
      pDni.style.display = 'none';
    }
  }
  const pIban = $('candIbanOcrSugerencia');
  if (pIban) {
    if (c.iban_ocr_sugerido && c.iban_ocr_sugerido !== (c.iban || '')) {
      pIban.style.display = '';
      pIban.textContent = '';
      let texto = `🤖 IA sugiere (leído del certificado bancario): ${c.iban_ocr_sugerido}`;
      if (c.iban_ocr_titular_nombre || c.iban_ocr_titular_dni) {
        texto += ` — titular leído: ${c.iban_ocr_titular_nombre || '—'} (${c.iban_ocr_titular_dni || 'DNI no leído'})`;
      }
      pIban.append(texto + ' — ');
      // Aviso si el titular leído no coincide con el candidato — RR.HH. decide, nunca se bloquea.
      const dniCandidatoNorm = (c.dni_nie || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
      const dniOcrNorm = (c.iban_ocr_titular_dni || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (dniCandidatoNorm && dniOcrNorm && dniCandidatoNorm !== dniOcrNorm) {
        const aviso = document.createElement('strong');
        aviso.style.color = 'var(--rose-700,#be123c)';
        aviso.textContent = '⚠️ el DNI del titular no coincide con el de este candidato — revísalo antes de usar. ';
        pIban.appendChild(aviso);
      }
      const usar = document.createElement('a');
      usar.href = '#';
      usar.textContent = 'Usar IBAN';
      usar.onclick = (ev) => { ev.preventDefault(); $('candModalIban').value = c.iban_ocr_sugerido; pIban.style.display = 'none'; };
      pIban.appendChild(usar);
    } else {
      pIban.style.display = 'none';
    }
  }
}
// Dispara la lectura automática tras un adjunto manual (RR.HH.) correcto — en segundo plano, sin
// bloquear el aviso de "adjuntado ✓": la IA puede tardar unos segundos y, si falla (p. ej. todavía
// no se ha configurado el secreto ANTHROPIC_API_KEY), no debe romper la subida, que ya se completó.
async function _dispararExtraccionOcrCandidato(candidatoId, tipo) {
  try {
    const { data, error } = await sb.functions.invoke('extraer-datos-documento', { body: { candidato_id: candidatoId, tipo } });
    if (error) { console.warn('OCR no disponible todavía:', error.message || error); return; }
    const idx = candidatosCache.findIndex((x) => x.id === candidatoId);
    if (idx >= 0) candidatosCache[idx] = { ...candidatosCache[idx], ...data };
    if (currentCandidatoId === candidatoId && idx >= 0) _renderSugerenciasOcrCandidato(candidatosCache[idx]);
  } catch (e) {
    console.warn('OCR no disponible todavía:', e);
  }
}
function abrirCandidatoModal(id) {
  const c = candidatosCache.find((x) => x.id === id);
  if (!c) return;
  currentCandidatoId = id;
  _candFormularioEntrevistaRecibidoPendiente = false;
  _candCorreoEsConfirmacionContratacion = false;
  $('candModalTitulo').textContent = c.nombre;
  $('candModalMeta').textContent = `${c.puesto_label || '—'} · ${c.email || '—'} · ${c.telefono || '—'} · solicitud ${fechaCorta(c.fecha_solicitud)} · origen: ${c.origen === 'qr_publico' ? '📱 QR' : '🖊 Manual'}`;
  $('candModalEstado').value = c.estado;
  $('candModalFechaEntrevista').value = c.fecha_entrevista ? c.fecha_entrevista.slice(0, 16) : '';
  $('candModalResultado').value = c.resultado_entrevista || '';
  $('candModalPuntuacion').value = c.puntuacion_adaptacion ?? '';
  // César: "el resultado en % se debe cargar automáticamente, el resultado de la entrevista debe
  // tener un desplegable" — se recalcula aquí mismo a partir del % guardado, no solo al finalizar.
  if ($('candModalResultadoCategoria')) $('candModalResultadoCategoria').value = c.resultado_entrevista_categoria || categoriaResultadoEntrevista(c.puntuacion_adaptacion, umbralAdaptacionCandidatoCache) || '';
  $('candModalNotas').value = c.notas || '';
  renderResultadoBannerCandidato(c);
  actualizarVisibilidadBotonesContratacionCandidato(c);
  $('candExcelEntrevistaInput').value = '';
  $('candEntrevistaDeteccion').style.display = 'none';
  $('candEntrevistaDeteccion').textContent = '';
  // César: domicilio, localidad y CV ya llegan del formulario público (obligatorios desde la
  // migración 0094/0095); DNI/NIE y código postal siguen siendo solo de RR.HH., si avanza.
  $('candModalDni').value = c.dni_nie || '';
  $('candModalCp').value = c.codigo_postal || '';
  $('candModalDireccion').value = c.direccion || '';
  $('candModalLocalidad').value = c.localidad || '';
  if ($('candModalSeguridadSocial')) $('candModalSeguridadSocial').value = c.numero_seguridad_social || '';
  if ($('candModalIban')) $('candModalIban').value = c.iban || '';
  if ($('candIbanConfirmado')) $('candIbanConfirmado').checked = !!c.iban_confirmado_en;
  _pintarAdjuntoCandidatoConVer('candDniNieEstado', c.dni_nie_adjunto_nombre, c.dni_nie_adjunto_url, 'el DNI/NIE');
  _pintarAdjuntoCandidatoConVer('candCertificadoBancarioEstado', c.certificado_bancario_adjunto_nombre, c.certificado_bancario_adjunto_url, 'el certificado bancario');
  _renderSugerenciasOcrCandidato(c);
  renderDocumentacionEstadoCandidato(c);
  renderSeguimientoContactoCandidato(c);
  $('candCvEstado').textContent = c.cv_nombre_archivo ? `📎 ${c.cv_nombre_archivo} — ` : 'Sin CV adjunto.';
  if (c.cv_adjunto_url) {
    const enlace = document.createElement('a');
    enlace.href = '#';
    enlace.textContent = 'ver';
    enlace.onclick = async (ev) => {
      ev.preventDefault();
      const { data: signed, error } = await sb.storage.from('formularios-adjuntos').createSignedUrl(c.cv_adjunto_url, 3600);
      if (error) { mostrarToast('No se pudo abrir el CV: ' + error.message, false); return; }
      abrirVisorDocumento(signed.signedUrl, `📎 CV — ${c.nombre}`, _esImagenPorNombre(c.cv_adjunto_url));
    };
    $('candCvEstado').appendChild(enlace);
  }
  // César: la trazabilidad de contacto (llamadas/formulario/cita) ahora vive en la tabla de
  // "Seguimiento de contacto" (renderSeguimientoContactoCandidato, más arriba) — ya no hace falta
  // este resumen en texto corrido aparte.
  renderRespuestasFase1Candidato(c);
  cargarHistorialCorreosCandidato(c);
  cargarBandejaEntradaCandidato(c);
  $('candCorreoDestinatario').value = c.email || '';
  $('candCorreoAsunto').value = '';
  $('candCorreoCuerpo').value = '';
  _candHistorialCorreosCache = [];
  if ($('candCorreoYaEnviadoAviso')) $('candCorreoYaEnviadoAviso').style.display = 'none';
  // César (03/11/2026, cuarta vuelta): al abrir la ficha, el desplegable de tipo de correo arranca
  // en el tipo más razonable por defecto — el que corresponde al Estado actual, si tiene plantilla
  // (si no, "Recibida") — pero queda libre para cambiarlo antes de generar.
  if ($('candCorreoTipo')) $('candCorreoTipo').value = CAND_PLANTILLAS_CORREO[c.estado] ? c.estado : 'recibida';
  $('modalCandidato').classList.remove('hidden');
}
// César: "si responde y nadie le dice nada ni nadie sabe que ha respondido, es bastante mediocre
// esta aplicación" — esto cubre el lado de ENVÍO (¿se llegó a mandar el correo automático de
// verdad, o se quedó pendiente/con error en la cola?), que hasta ahora no se podía ver desde el
// panel para nada: notificaciones_cola tiene RLS "solo lo tuyo" (destinatario_email = tu propio
// email, migración 0066), así que un admin no podía leer directamente las filas dirigidas al
// candidato — de ahí candidato_historial_correos(), función propia que sí comprueba el hotel.
// César (03/11/2026, séptima vuelta): "este correo ya lo he enviado [...] ¿por qué me vuelve a
// salir otra vez?" — se guarda aquí la última foto del historial para poder avisar en el propio
// generador de correos ("GENERAR Y ENVIAR CORREO", más abajo) si el asunto que está a punto de
// mandar ya se mandó antes, en vez de dejar que parezca una acción pendiente/sin hacer. Ver
// _actualizarAvisoCorreoYaEnviado().
let _candHistorialCorreosCache = [];
async function cargarHistorialCorreosCandidato(c) {
  const cont = $('candHistorialCorreosBody');
  if (!cont) return;
  cont.innerHTML = '<span class="sub-c">Cargando…</span>';
  const { data, error } = await sb.rpc('candidato_historial_correos', { p_candidato_id: c.id });
  if (error || !data || data.length === 0) {
    cont.innerHTML = '<span class="sub-c">Todavía no se ha encolado ningún correo automático para esta candidatura.</span>';
    if (currentCandidatoId === c.id) { _candHistorialCorreosCache = []; _actualizarAvisoCorreoYaEnviado(); renderSeguimientoContactoCandidato(c); }
    return;
  }
  if (currentCandidatoId === c.id) { _candHistorialCorreosCache = data; _actualizarAvisoCorreoYaEnviado(); renderSeguimientoContactoCandidato(c); }
  const ESTADO_ICONO = { enviado: '✅', pendiente: '⏳', parcial: '⚠️', error: '❌', omitido: '⏭️' };
  // César (quinta vuelta): "está bien que pongas la hora [...] pero necesito que pongas un número
  // [...] de menor a mayor, de arriba hacia abajo" — la función SQL devuelve lo más reciente
  // primero (para otros usos, como el badge de "sin leer"); aquí se invierte para numerar del
  // primer envío al último, igual que la cronología del expediente completo.
  const ordenCronologico = [...data].reverse();
  cont.innerHTML = ordenCronologico.map((n, i) => {
    const icono = ESTADO_ICONO[n.estado] || '•';
    const cuando = n.enviado_en ? `enviado el ${fechaHoraCorta(n.enviado_en)}` : `encolado el ${fechaHoraCorta(n.creado_en)}`;
    const detalleError = n.estado === 'error' && n.error ? `<br><span style="color:var(--rose-600,#dc2626);">${_escHtml(n.error)}</span>` : '';
    return `<div style="padding:6px 0;border-bottom:1px solid var(--slate-100);"><b>${i + 1}.</b> ${icono} <strong>${_escHtml(n.titulo)}</strong> — Para: ${_escHtml(n.destinatario_email) || '—'} · ${cuando}${detalleError}</div>`;
  }).join('');
}
// César (03/11/2026, séptima vuelta): compara el ASUNTO que hay ahora mismo en el generador de
// correos contra el historial ya cargado (más reciente primero, tal cual lo devuelve la RPC) — si
// coincide con el de un envío real (no solo "en cola"), lo dice aquí mismo, junto al propio botón
// de enviar, en vez de que RR.HH. tenga que bajar a comprobar el historial por su cuenta.
const _CORREO_ESTADO_TXT = { enviado: 'enviado', pendiente: 'en cola, pendiente de enviarse', parcial: 'enviado parcialmente', error: 'con error al enviar', omitido: 'omitido' };
function _actualizarAvisoCorreoYaEnviado() {
  const aviso = $('candCorreoYaEnviadoAviso');
  if (!aviso) return;
  const asuntoActual = ($('candCorreoAsunto').value || '').trim();
  const match = asuntoActual ? _candHistorialCorreosCache.find((n) => (n.titulo || '').trim() === asuntoActual) : null;
  if (!match) { aviso.style.display = 'none'; aviso.textContent = ''; return; }
  const cuando = match.enviado_en ? fechaHoraCorta(match.enviado_en) : fechaHoraCorta(match.creado_en);
  const estadoTxt = _CORREO_ESTADO_TXT[match.estado] || match.estado;
  aviso.textContent = `ℹ️ Ya hay un correo con este mismo asunto — ${estadoTxt} el ${cuando}. Puedes enviarlo otra vez si hace falta (no se bloquea), pero revisa que no sea sin querer.`;
  aviso.style.display = '';
}
// Texto libre que no hemos escrito nosotros (respuesta de un candidato, error de un proveedor
// externo...) nunca va directo a innerHTML sin escapar — evita que un "correo" con <script>/<img
// onerror=...> dentro se ejecute en el panel de admin de quien lo lea.
function _escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
// César: "No quiero tener que ir a Gmail/Outlook a leer si el candidato confirma o no [...]
// quiero que [...] haya una sección de 'Bandeja de entrada / Respuestas' donde se vean los
// correos que el candidato nos devuelve [...] Ese control debe estar centralizado en la app." —
// candidatos_correos_recibidos (migración 0107) la rellena sola la Edge Function
// recibir-correo-entrante cuando Resend Receiving recibe una respuesta real del candidato.
async function cargarBandejaEntradaCandidato(c) {
  const cont = $('candBandejaEntradaBody');
  if (!cont) return;
  cont.innerHTML = '<span class="sub-c">Cargando…</span>';
  const { data, error } = await sb.from('candidatos_correos_recibidos').select('*').eq('candidato_id', c.id).order('recibido_en', { ascending: false });
  if (error || !data || data.length === 0) {
    // César (03/11/2026): este mensaje genérico ("necesita tener montada la bandeja") confundía —
    // daba a entender que faltaba configuración incluso cuando ya estaba todo correcto (dominio
    // verificado, webhook activo, función desplegada) y sencillamente nadie había respondido aún.
    // Ya no presupone que falta nada: solo informa de que no ha llegado respuesta todavía.
    cont.innerHTML = '<span class="sub-c">Todavía no ha llegado aquí ninguna respuesta del candidato por email.</span>';
    return;
  }
  const puedeConfirmarCita = !!(c.fecha_entrevista && !c.cita_confirmada_en);
  const filas = data.map((r) => {
    const aviso = r.coincidencia === 'email_aproximado'
      ? '<p class="sub-c" style="color:#b45309;margin:2px 0 4px;">⚠️ Asignado por dirección de correo (sin hilo de confirmación) — comprueba que es de este candidato.</p>'
      : '';
    return `<div style="padding:8px 0;border-bottom:1px solid var(--slate-100);${r.leido ? '' : 'background:#fef2f2;'}">
        <p style="margin:0 0 2px;font-size:12.5px;"><strong>${_escHtml(r.remitente_email)}</strong> — ${fechaCorta(r.recibido_en)}${r.leido ? '' : ' · <span style="color:#dc2626;font-weight:700;">nuevo</span>'}</p>
        <p style="margin:0 0 4px;font-size:12px;font-weight:700;">${_escHtml(r.asunto) || '(sin asunto)'}</p>
        ${aviso}
        <p style="margin:0;font-size:12.5px;white-space:pre-wrap;">${_escHtml(r.cuerpo) || '(sin contenido)'}</p>
      </div>`;
  }).join('');
  const botonCita = puedeConfirmarCita
    ? `<button type="button" class="btn btn-sm" style="margin-top:8px;" onclick="marcarCitaConfirmadaCandidato()">✅ Esto confirma la cita — marcar asistencia confirmada</button>`
    : '';
  cont.innerHTML = filas + botonCita;
  const sinLeerIds = data.filter((r) => !r.leido).map((r) => r.id);
  if (sinLeerIds.length) {
    await Promise.all(sinLeerIds.map((id) => sb.rpc('marcar_correo_candidato_leido', { p_id: id })));
    delete correosSinLeerCache[c.id];
  }
}
function cerrarCandidatoModal() {
  $('modalCandidato').classList.add('hidden');
  // El visor de documentos ahora es un panel flotante independiente (no vive dentro de
  // modalCandidato) — si se deja abierto, se cierra también al salir de la ficha para que no
  // quede flotando sobre otra pantalla con el documento de un candidato distinto.
  cerrarVisorDocumento();
}
// César (02/11/2026): "necesito toda la puta información [...] quiero que con una sola consulta a
// esta ventana, el director de recursos humanos pueda ver toda la información [...] cómo han hecho
// las entrevistas, cuáles han sido los resultados, cómo y cuántas veces se han comunicado con el
// candidato [...] quiero poder visualizar la entrevista estructurada, quiero ver la puntuación" —
// informe único de solo lectura que reúne: datos, resultado final, cronología completa de
// contacto (llamadas/correos/formulario/cita/entrevista), historial de correos enviados,
// respuestas de Fase 1 y el desglose criterio a criterio (104) de la Entrevista Estructurada.
// Sustituye tener que abrir 5 secciones distintas de la ficha para reconstruir "qué pasó".
async function abrirExpedienteCompletoCandidato() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  $('expedienteCandidatoBody').innerHTML = '<p class="sub-c">Cargando expediente…</p>';
  $('modalExpedienteCandidato').classList.remove('hidden');
  const [{ data: correos }, { data: recibidos }] = await Promise.all([
    sb.rpc('candidato_historial_correos', { p_candidato_id: c.id }),
    sb.from('candidatos_correos_recibidos').select('*').eq('candidato_id', c.id).order('recibido_en', { ascending: false })
  ]);
  $('expedienteCandidatoBody').innerHTML = renderExpedienteCompletoHTML(c, correos || [], recibidos || []);
}
function cerrarExpedienteCompletoCandidato() {
  $('modalExpedienteCandidato').classList.add('hidden');
}
function renderExpedienteCompletoHTML(c, correos, recibidos) {
  const categoria = c.resultado_entrevista_categoria || categoriaResultadoEntrevista(c.puntuacion_adaptacion, umbralAdaptacionCandidatoCache);
  const b = CANDIDATO_RESULTADO_BADGE[categoria] || ['— Sin calcular —', 'b-slate'];
  const est = CANDIDATO_ESTADOS[c.estado] || ['—', 'b-slate'];

  // 1) Cabecera — quién es, para qué puesto, y el resultado final, todo en el mismo golpe de vista.
  const cabecera = `<div class="card card-pad" style="margin-bottom:12px;">
      <h4 style="margin:0 0 2px;font-size:16px;">${_escHtml(c.nombre)}</h4>
      <p class="sub-c" style="margin:0 0 10px;">${_escHtml(c.puesto_label) || '—'} · ${_escHtml(c.email) || '—'} · ${_escHtml(c.telefono) || '—'} · solicitud ${fechaCorta(c.fecha_solicitud)} · origen: ${c.origen === 'qr_publico' ? '📱 QR' : '🖊 Manual'}</p>
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;">
        <div><span class="sub-c" style="display:block;font-weight:700;text-transform:uppercase;font-size:10.5px;">Estado actual</span><span class="badge2 ${est[1]}">${est[0]}</span></div>
        <div><span class="sub-c" style="display:block;font-weight:700;text-transform:uppercase;font-size:10.5px;">Resultado de la evaluación</span><span style="font-size:18px;font-weight:800;">${c.puntuacion_adaptacion != null ? `${c.puntuacion_adaptacion}%` : '—'}</span> <span class="badge2 ${b[1]}">${b[0]}</span></div>
        ${c.entrevista_evaluador ? `<div><span class="sub-c" style="display:block;font-weight:700;text-transform:uppercase;font-size:10.5px;">Entrevistador/a</span>${_escHtml(c.entrevista_evaluador)} — ${fechaCorta(c.entrevista_evaluado_en)}</div>` : ''}
      </div>
    </div>`;

  // 2) Cronología — un candidato puede tener decenas de contactos; esto los ordena todos en una
  // sola línea de tiempo (hitos del propio registro + cada correo enviado + cada respuesta
  // recibida), en vez de que RR.HH. tenga que cruzar 3 paneles distintos a mano.
  const hitos = [];
  if (c.fecha_solicitud) hitos.push({ fecha: c.fecha_solicitud, texto: '🧑‍💼 Candidatura recibida' });
  if (c.contacto_llamado_en) hitos.push({ fecha: c.contacto_llamado_en, texto: '📞 Contactado/a por teléfono' });
  if (c.formulario_entrevista_enviado_en) hitos.push({ fecha: c.formulario_entrevista_enviado_en, texto: '✉️ Formulario de Entrevista (Fase 1) enviado' });
  if (c.formulario_entrevista_recibido_en) hitos.push({ fecha: c.formulario_entrevista_recibido_en, texto: '📥 Formulario de Entrevista (Fase 1) recibido' });
  if (c.fecha_entrevista) hitos.push({ fecha: c.fecha_entrevista, texto: `📅 Entrevista citada para el ${new Date(c.fecha_entrevista).toLocaleString('es-ES')}` });
  if (c.cita_confirmada_en) hitos.push({ fecha: c.cita_confirmada_en, texto: '✅ Candidato/a confirmó asistencia a la entrevista' });
  if (c.entrevista_evaluado_en) hitos.push({ fecha: c.entrevista_evaluado_en, texto: `📝 Entrevista estructurada ${c.entrevista_completada ? 'finalizada' : 'guardada como borrador'} por ${c.entrevista_evaluador || '—'} — resultado ${c.puntuacion_adaptacion ?? '—'}%` });
  if (c.confirmacion_contratacion_enviada_en) hitos.push({ fecha: c.confirmacion_contratacion_enviada_en, texto: '✉️ Correo de confirmación de contratación y solicitud de documentación enviado' });
  if (c.documentacion_recibida_en) hitos.push({ fecha: c.documentacion_recibida_en, texto: '📄 Documentación de incorporación completa (DNI/NIE + Seguridad Social + certificado bancario)' });
  if (c.documentacion_enviada_gestoria_en) hitos.push({ fecha: c.documentacion_enviada_gestoria_en, texto: '📤 Documentación de incorporación enviada a gestoría' });
  if (c.trabajador_id) hitos.push({ fecha: c.created_at, texto: '🏁 Ficha de persona trabajadora creada' });
  (correos || []).forEach((n) => hitos.push({ fecha: n.enviado_en || n.creado_en, texto: `📧 Correo "${n.titulo}" → ${n.destinatario_email || '—'} (${n.estado === 'enviado' ? 'entregado' : n.estado})` }));
  (recibidos || []).forEach((r) => hitos.push({ fecha: r.recibido_en, texto: `📩 Respuesta del candidato recibida: "${r.asunto || '(sin asunto)'}"` }));
  hitos.sort((a, b2) => new Date(a.fecha || 0) - new Date(b2.fecha || 0));
  // César (quinta vuelta): "tiene que tener un orden, un criterio [...] deberías asignar un número
  // a cada una de las acciones [...] que lo enumeres [...] de menor a mayor, de arriba hacia abajo"
  // — ya estaba ordenada por fecha (hitos.sort ascendente, arriba); esto solo añade el número de
  // paso visible, para que "1, 2, 3..." se lea igual de claro que las fechas.
  const cronologia = `<div class="card card-pad" style="margin-bottom:12px;">
      <h4 style="margin:0 0 8px;font-size:13px;">🕒 Cronología completa de contacto (${hitos.length})</h4>
      ${hitos.length ? hitos.map((h, i) => `<p style="margin:0 0 6px;font-size:12.5px;"><b>${i + 1}.</b> <b>${fechaCorta(h.fecha)}</b> — ${h.texto}</p>`).join('') : '<p class="sub-c">Sin contactos registrados todavía.</p>'}
    </div>`;

  // 3) Respuestas de Fase 1 (lo que el candidato escribió sobre sí mismo, sin rúbricas).
  const fase1 = c.entrevista_fase1_respuestas || {};
  const fase1Html = Object.keys(fase1).length
    ? `<div class="card card-pad" style="margin-bottom:12px;">
        <h4 style="margin:0 0 8px;font-size:13px;">📨 Respuestas del candidato — Fase 1 ${c.entrevista_fase1_fecha ? `(respondido el ${fechaCorta(c.entrevista_fase1_fecha)})` : ''}</h4>
        ${ENTREVISTA_PREGUNTAS.map((p) => `<p style="margin:0 0 8px;font-size:12.5px;"><b>${p.id}. ${_escHtml(p.pregunta)}</b><br>${_escHtml(fase1[String(p.id)]) || '—'}</p>`).join('')}
      </div>`
    : '';

  // 4) Entrevista estructurada — los 104 criterios con la nota puesta por quien entrevistó, igual
  // que se verían en el checklist en vivo pero en modo lectura (sin desplegables editables).
  const respuestas = c.entrevista_respuestas || null;
  const NOTA_TXT = { 1: '1 · Poco', 2: '2 · Bastante', 3: '3 · Idóneo' };
  const entrevistaHtml = respuestas
    ? `<div class="card card-pad" style="margin-bottom:12px;">
        <h4 style="margin:0 0 4px;font-size:13px;">📝 Entrevista estructurada — detalle de los 104 criterios</h4>
        <p class="sub-c" style="margin:0 0 10px;">${c.entrevista_puntos_obtenidos ?? '—'} / ${c.entrevista_puntos_maximos ?? '—'} puntos · ${c.puntuacion_adaptacion ?? '—'}% de adaptación · ${c.entrevista_completada ? '✅ entrevista finalizada' : '📝 borrador'}</p>
        ${ENTREVISTA_PREGUNTAS.map((p) => {
          const prev = respuestas[p.id] || respuestas[String(p.id)] || {};
          const bloques = ENTREVISTA_BLOQUES.map(([key, label]) => {
            const items = p.criterios[key] || [];
            if (!items.length) return '';
            return `<div style="flex:1;min-width:200px;">
                <p class="sub-c" style="margin:0 0 3px;font-weight:700;">${label}</p>
                ${items.map((criterio, idx) => {
                  const v = prev[key] && prev[key][idx] != null ? prev[key][idx] : null;
                  return `<p style="margin:0 0 2px;font-size:12px;display:flex;justify-content:space-between;gap:8px;"><span>${_escHtml(criterio)}</span><b style="white-space:nowrap;${v ? '' : 'color:var(--slate-400);'}">${v ? NOTA_TXT[v] : '— sin puntuar —'}</b></p>`;
                }).join('')}
              </div>`;
          }).join('');
          // César: "si soy el director tengo que ir arriba a buscar la pregunta [...] en el detalle
          // de los 104 criterios, aquí debe salir la respuesta también" — se repite aquí la misma
          // respuesta de Fase 1 que ya se ve en la sección de arriba, para no tener que subir y
          // bajar entre las dos secciones mientras se revisa criterio a criterio.
          const respuestaFase1Texto = fase1[String(p.id)];
          let respuestaFase1Html = respuestaFase1Texto
            ? `<p style="margin:0 0 8px;font-size:12.5px;background:var(--slate-50);border-radius:6px;padding:6px 8px;"><b>Respuesta del candidato (Fase 1):</b> ${_escHtml(respuestaFase1Texto)}</p>`
            : '';
          if (p.sub_pregunta) {
            const subId = p.sub_pregunta.match(/^(\d+\.\d+)/);
            const subKey = subId ? subId[1] : null;
            const subTexto = subKey ? fase1[subKey] : null;
            if (subTexto) {
              respuestaFase1Html += `<p style="margin:0 0 8px 14px;font-size:12px;background:var(--slate-50);border-radius:6px;padding:6px 8px;"><b>${_escHtml(p.sub_pregunta)}:</b> ${_escHtml(subTexto)}</p>`;
            }
          }
          return `<div style="border-top:1px solid var(--slate-100);padding:8px 0;">
              <p style="margin:0 0 6px;font-weight:700;font-size:12.5px;">${p.id}. ${_escHtml(p.pregunta)}</p>
              ${respuestaFase1Html}
              <div style="display:flex;gap:14px;flex-wrap:wrap;">${bloques}</div>
            </div>`;
        }).join('')}
      </div>`
    : `<div class="card card-pad" style="margin-bottom:12px;"><h4 style="margin:0 0 4px;font-size:13px;">📝 Entrevista estructurada</h4><p class="sub-c" style="margin:0;">Todavía no se ha realizado la entrevista estructurada a este candidato/a.</p></div>`;

  // 5) Documentación recibida (CV + documentación de incorporación).
  const docs = [];
  if (c.cv_nombre_archivo) docs.push(`📎 CV — ${_escHtml(c.cv_nombre_archivo)}`);
  if (c.dni_nie_adjunto_nombre) docs.push(`📎 DNI/NIE — ${_escHtml(c.dni_nie_adjunto_nombre)}`);
  if (c.numero_seguridad_social) docs.push(`🪪 Número de Seguridad Social registrado`);
  if (c.certificado_bancario_adjunto_nombre) docs.push(`📎 Certificado bancario — ${_escHtml(c.certificado_bancario_adjunto_nombre)}`);
  const docsHtml = `<div class="card card-pad" style="margin-bottom:12px;">
      <h4 style="margin:0 0 8px;font-size:13px;">📄 Documentación</h4>
      ${docs.length ? docs.map((d) => `<p style="margin:0 0 4px;font-size:12.5px;">${d}</p>`).join('') : '<p class="sub-c">Sin documentación adjunta todavía.</p>'}
    </div>`;

  // 6) Notas internas de RR.HH.
  const notasHtml = c.notas ? `<div class="card card-pad"><h4 style="margin:0 0 6px;font-size:13px;">🗒️ Notas internas</h4><p style="margin:0;font-size:12.5px;white-space:pre-wrap;">${_escHtml(c.notas)}</p></div>` : '';

  return cabecera + cronologia + fase1Html + entrevistaHtml + docsHtml + notasHtml;
}
function imprimirExpedienteCandidato() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  const w = window.open('', '_blank');
  if (!w) {
    mostrarToast('El navegador ha bloqueado la ventana de impresión — permite las ventanas emergentes para este sitio.', false);
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Expediente — ${c ? _escHtml(c.nombre) : 'Candidatura'}</title>
    <style>body{font-family:sans-serif;padding:24px;color:#1e293b;} .card{border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;} .sub-c{color:#64748b;font-size:12px;} .badge2{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;} .b-emerald{background:#d1fae5;color:#047857;} .b-amber{background:#fef3c7;color:#b45309;} .b-rose{background:#ffe4e6;color:#be123c;} .b-slate{background:#f1f5f9;color:#475569;}</style>
    </head><body>${$('expedienteCandidatoBody').innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
// César (03/11/2026): "ya está subido y se tiene que dejar que descargues un PDF [...] aquí
// deberías añadir un botón que diga enviar informe [...] que te salga todo lo que tenemos
// preparado para toda la generación de correos [...] para enviar a una dirección [...] en copia a
// responsable de RR.HH., director de administración, director general" — versión en texto plano
// del expediente (mismo criterio que _resumenEntrevistaEstructuradaTexto: nunca se manda el HTML
// interno de la app por correo, se redacta como documento legible). public.rol_tipo solo tiene
// rrhh_direccion/jefe_departamento/trabajador — no existe un rol distinto para "director de
// administración" o "director general" — así que el CC se precarga con rrhh_emails_hotel() (mismo
// origen que en «Enviar documentación a gestoría») y queda editable para que RR.HH. añada a mano
// esas otras direcciones antes de enviar.
function _resumenExpedienteCandidatoTexto(c, correos, recibidos) {
  const categoria = c.resultado_entrevista_categoria || categoriaResultadoEntrevista(c.puntuacion_adaptacion, umbralAdaptacionCandidatoCache);
  const badge = CANDIDATO_RESULTADO_BADGE[categoria] || ['— Sin calcular —'];
  const hitos = [];
  if (c.fecha_solicitud) hitos.push({ fecha: c.fecha_solicitud, texto: 'Candidatura recibida' });
  if (c.contacto_llamado_en) hitos.push({ fecha: c.contacto_llamado_en, texto: 'Contactado/a por teléfono' });
  if (c.formulario_entrevista_enviado_en) hitos.push({ fecha: c.formulario_entrevista_enviado_en, texto: 'Formulario de Entrevista (Fase 1) enviado' });
  if (c.formulario_entrevista_recibido_en) hitos.push({ fecha: c.formulario_entrevista_recibido_en, texto: 'Formulario de Entrevista (Fase 1) recibido' });
  if (c.fecha_entrevista) hitos.push({ fecha: c.fecha_entrevista, texto: `Entrevista citada para el ${new Date(c.fecha_entrevista).toLocaleString('es-ES')}` });
  if (c.cita_confirmada_en) hitos.push({ fecha: c.cita_confirmada_en, texto: 'Candidato/a confirmó asistencia a la entrevista' });
  if (c.entrevista_evaluado_en) hitos.push({ fecha: c.entrevista_evaluado_en, texto: `Entrevista estructurada ${c.entrevista_completada ? 'finalizada' : 'guardada como borrador'} por ${c.entrevista_evaluador || '—'} — resultado ${c.puntuacion_adaptacion ?? '—'}%` });
  if (c.confirmacion_contratacion_enviada_en) hitos.push({ fecha: c.confirmacion_contratacion_enviada_en, texto: 'Correo de confirmación de contratación y solicitud de documentación enviado' });
  if (c.documentacion_recibida_en) hitos.push({ fecha: c.documentacion_recibida_en, texto: 'Documentación de incorporación completa (DNI/NIE + Seguridad Social + certificado bancario)' });
  if (c.documentacion_enviada_gestoria_en) hitos.push({ fecha: c.documentacion_enviada_gestoria_en, texto: 'Documentación de incorporación enviada a gestoría' });
  if (c.trabajador_id) hitos.push({ fecha: c.created_at, texto: 'Ficha de persona trabajadora creada' });
  (correos || []).forEach((n) => hitos.push({ fecha: n.enviado_en || n.creado_en, texto: `Correo "${n.titulo}" → ${n.destinatario_email || '—'} (${n.estado === 'enviado' ? 'entregado' : n.estado})` }));
  (recibidos || []).forEach((r) => hitos.push({ fecha: r.recibido_en, texto: `Respuesta del candidato recibida: "${r.asunto || '(sin asunto)'}"` }));
  hitos.sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));

  const docs = [];
  if (c.cv_nombre_archivo) docs.push(`CV — ${c.cv_nombre_archivo}`);
  if (c.dni_nie_adjunto_nombre) docs.push(`DNI/NIE — ${c.dni_nie_adjunto_nombre}`);
  if (c.numero_seguridad_social) docs.push('Número de Seguridad Social registrado');
  if (c.certificado_bancario_adjunto_nombre) docs.push(`Certificado bancario — ${c.certificado_bancario_adjunto_nombre}`);

  const lineas = [
    `EXPEDIENTE COMPLETO DE CANDIDATURA — ${c.nombre}`,
    `${c.puesto_label || '—'} · ${c.email || '—'} · ${c.telefono || '—'} · solicitud ${fechaCorta(c.fecha_solicitud)}`,
    `Resultado de la evaluación: ${c.puntuacion_adaptacion != null ? c.puntuacion_adaptacion + '%' : '—'} (${badge[0]})`,
    '',
    `CRONOLOGÍA COMPLETA DE CONTACTO (${hitos.length})`,
    ...hitos.map((h, i) => `${i + 1}. ${fechaCorta(h.fecha)} — ${h.texto}`),
    '',
    'DOCUMENTACIÓN',
    docs.length ? docs.join('\n') : 'Sin documentación adjunta todavía.'
  ];
  if (c.entrevista_respuestas) lineas.push('', 'ENTREVISTA ESTRUCTURADA — DETALLE DE LOS 104 CRITERIOS', _resumenEntrevistaEstructuradaTexto(c));
  if (c.notas) lineas.push('', 'NOTAS INTERNAS DE RR.HH.', c.notas);
  return lineas.join('\n');
}
async function abrirEnviarInformeExpedienteModal() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  $('candInformeDestinatario').value = '';
  $('candInformeCC').value = '';
  sb.rpc('rrhh_emails_hotel').then(({ data }) => {
    if (data) {
      if (!$('candInformeDestinatario').value) $('candInformeDestinatario').value = data;
      if (!$('candInformeCC').value) $('candInformeCC').value = data;
    }
  });
  $('candInformeAsunto').value = `Expediente completo de candidatura — ${c.nombre}`;
  $('candInformeCuerpo').value = 'Generando el informe…';
  $('modalEnviarInformeExpediente').classList.remove('hidden');
  const [{ data: correos }, { data: recibidos }] = await Promise.all([
    sb.rpc('candidato_historial_correos', { p_candidato_id: c.id }),
    sb.from('candidatos_correos_recibidos').select('*').eq('candidato_id', c.id).order('recibido_en', { ascending: false })
  ]);
  $('candInformeCuerpo').value = _resumenExpedienteCandidatoTexto(c, correos || [], recibidos || []);
}
function cerrarEnviarInformeExpedienteModal() {
  $('modalEnviarInformeExpediente').classList.add('hidden');
}
async function enviarInformeExpedienteCandidato(btn) {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  if (btn && btn.disabled) return;
  const destinatario = $('candInformeDestinatario').value.trim();
  const cc = $('candInformeCC').value.trim() || null;
  const asunto = $('candInformeAsunto').value.trim();
  const cuerpo = $('candInformeCuerpo').value.trim();
  if (!destinatario || !asunto || !cuerpo) {
    mostrarToast('⚠️ Completa destinatario, asunto y cuerpo antes de enviar', false);
    return;
  }
  const textoBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const { error } = await sb.rpc('enviar_correo_externo', {
      p_destinatario_email: destinatario,
      p_cc_email: cc,
      p_asunto: asunto,
      p_cuerpo: cuerpo,
      p_referencia_tabla: 'candidatos',
      p_referencia_id: c.id
    });
    if (error) {
      mostrarToast('Error al enviar el informe: ' + error.message, false);
      return;
    }
    mostrarToast(`Informe enviado ✓ Para: ${destinatario}${cc ? ' · CC: ' + cc : ''}`, true);
    await registrarAuditoria('Candidaturas', 'Expediente completo enviado por correo', `${c.nombre} — ${destinatario}`);
    cerrarEnviarInformeExpedienteModal();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
  }
}
// ---------- Documentación de incorporación (DNI/NIE y certificado bancario) ----------
// César: "le solicitamos los documentos para darlo de alta, que es el DNI o NIE, el número de la
// seguridad social y un certificado bancario con el número de cuenta española" — mismo patrón ya
// usado para el CV (Storage 'formularios-adjuntos', ruta con hotel_id primero por RLS).
async function subirDniNieCandidato() {
  const archivo = $('candDniNieInput').files[0];
  if (!archivo || !currentCandidatoId) return;
  const ruta = `${usuarioActual.hotel_id}/candidatos/${currentCandidatoId}/dni-nie/${Date.now()}-${sanitizarNombreArchivo(archivo.name)}`;
  const { error: errorSubida } = await sb.storage.from('formularios-adjuntos').upload(ruta, archivo);
  if (errorSubida) { mostrarToast('Error al subir el DNI/NIE: ' + errorSubida.message, false); return; }
  const { error } = await sb.from('candidatos').update({ dni_nie_adjunto_url: ruta, dni_nie_adjunto_nombre: archivo.name }).eq('id', currentCandidatoId);
  if (error) { mostrarToast('Error al guardar el DNI/NIE: ' + error.message, false); return; }
  mostrarToast('DNI/NIE adjuntado ✓', true);
  await registrarAuditoria('Candidaturas', 'DNI/NIE adjuntado', archivo.name);
  // César (quinta vuelta, supervisión): este adjunto manual (RR.HH., no el portal del candidato)
  // no pasaba por _completar_documentacion_candidato_si_procede — solo la llamaban las funciones
  // públicas del candidato (0110) — así que "documentacion_recibida_en" y el Correo 4 a RR.HH.
  // nunca se disparaban si los 3 datos se registraban a mano. Se llama aquí también, ahora que
  // 0111 le da permiso de ejecución al rol authenticated.
  await sb.rpc('_completar_documentacion_candidato_si_procede', { p_id: currentCandidatoId }).then(() => {}, () => {});
  await cargarCandidatosAdmin();
  abrirCandidatoModal(currentCandidatoId);
  _dispararExtraccionOcrCandidato(currentCandidatoId, 'dni_nie'); // en segundo plano, ver comentario arriba
}
async function subirCertificadoBancarioCandidato() {
  const archivo = $('candCertificadoBancarioInput').files[0];
  if (!archivo || !currentCandidatoId) return;
  const ruta = `${usuarioActual.hotel_id}/candidatos/${currentCandidatoId}/certificado-bancario/${Date.now()}-${sanitizarNombreArchivo(archivo.name)}`;
  const { error: errorSubida } = await sb.storage.from('formularios-adjuntos').upload(ruta, archivo);
  if (errorSubida) { mostrarToast('Error al subir el certificado bancario: ' + errorSubida.message, false); return; }
  const { error } = await sb.from('candidatos').update({ certificado_bancario_adjunto_url: ruta, certificado_bancario_adjunto_nombre: archivo.name }).eq('id', currentCandidatoId);
  if (error) { mostrarToast('Error al guardar el certificado bancario: ' + error.message, false); return; }
  mostrarToast('Certificado bancario adjuntado ✓', true);
  await registrarAuditoria('Candidaturas', 'Certificado bancario adjuntado', archivo.name);
  // Mismo motivo que en subirDniNieCandidato — ver comentario allí.
  await sb.rpc('_completar_documentacion_candidato_si_procede', { p_id: currentCandidatoId }).then(() => {}, () => {});
  await cargarCandidatosAdmin();
  abrirCandidatoModal(currentCandidatoId);
  _dispararExtraccionOcrCandidato(currentCandidatoId, 'certificado_bancario'); // en segundo plano, ver comentario en subirDniNieCandidato
}
// ---- C1 del prototipo — confirmación real por correo de la cita de entrevista (migración 0072:
// enviar_correo_externo) — antes la fecha solo se guardaba, sin avisar al candidato/a. César:
// "necesito poder comprobar qué tipo de correo se envía [...] que se abra la ventana, ver qué es
// lo que está incluido en el correo y luego poder adjuntar la entrevista que tenemos en Excel" —
// el botón ya no envía directamente: abre una ventana de revisión con destinatario/CC/asunto/
// cuerpo editables y la opción de adjuntar la Entrevista Estructurada (el envío automático de
// correo, migración 0072, no admite adjuntos reales — se descarga aquí para adjuntarla a mano).
let _candCitaValorFecha = null;
function abrirConfirmarCitaCandidatoModal() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  const valor = $('candModalFechaEntrevista').value;
  if (!valor) {
    mostrarToast('⚠️ Indica la fecha y hora de la entrevista antes de confirmar por correo', false);
    return;
  }
  // César: "no tiene que pedirte el email [...] ya tienes los datos de ese candidato [...] no
  // tienes por qué volver a poner el correo electrónico" — si falta, se deja escribir aquí mismo
  // (el campo Destinatario ya es editable) en vez de cortar el paso y obligar a salir del modal,
  // ir a otro sitio a añadirlo y volver a intentarlo.
  _candCitaValorFecha = valor;
  const d = new Date(valor);
  const fecha = d.toLocaleDateString('es-ES');
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  $('candCitaDestinatario').value = c.email || '';
  $('candCitaCC').value = '';
  sb.rpc('rrhh_emails_hotel').then(({ data }) => {
    if (data && !$('candCitaCC').value) $('candCitaCC').value = data;
  });
  $('candCitaAsunto').value = `Entrevista — ${fecha} a las ${hora} h`;
  $('candCitaCuerpo').value = `Hola ${c.nombre},\n\nTu entrevista está confirmada para el ${fecha} a las ${hora} h.\n\nPor favor, confirma tu asistencia respondiendo a este correo.\n\nUn saludo,\nPersonal4Pax`;
  $('candCitaAdjuntarExcel').checked = false;
  $('modalConfirmarCitaCandidato').classList.remove('hidden');
}
function cerrarConfirmarCitaCandidatoModal() {
  $('modalConfirmarCitaCandidato').classList.add('hidden');
}
async function enviarCitaEntrevistaCandidato(btn) {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c || !_candCitaValorFecha) return;
  // César: "cuando confirmas se envían dos correos" — sin bloqueo del botón, un doble clic (muy
  // fácil en móvil/con red lenta) dispara dos llamadas a enviar_correo_externo y el candidato
  // recibe el mismo correo duplicado. Mismo arreglo en los otros dos botones de envío de abajo.
  if (btn && btn.disabled) return;
  const destinatario = $('candCitaDestinatario').value.trim();
  const cc = $('candCitaCC').value.trim() || null;
  const asunto = $('candCitaAsunto').value.trim();
  const cuerpo = $('candCitaCuerpo').value.trim();
  if (!destinatario || !asunto || !cuerpo) {
    mostrarToast('⚠️ Completa destinatario, asunto y cuerpo antes de enviar', false);
    return;
  }
  const adjuntarExcel = $('candCitaAdjuntarExcel').checked;
  const textoBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const { error } = await sb.rpc('enviar_correo_externo', {
      p_destinatario_email: destinatario,
      p_cc_email: cc,
      p_asunto: asunto,
      p_cuerpo: cuerpo,
      p_referencia_tabla: 'candidatos',
      p_referencia_id: c.id
    });
    if (error) {
      mostrarToast('Error al enviar la cita: ' + error.message, false);
      return;
    }
    // César: "también deberíamos llamar si no nos confirman la fecha para la entrevista" —
    // cita_entrevista_enviada_en (cuándo se envió ESTE correo) es distinto de fecha_entrevista (la
    // fecha/hora DE la entrevista, normalmente futura); sin esta columna, comparar la última llamada
    // contra fecha_entrevista daría siempre "pendiente" hasta que la entrevista ya hubiese pasado.
    await sb.from('candidatos').update({ estado: 'entrevista_programada', fecha_entrevista: _candCitaValorFecha, cita_entrevista_enviada_en: new Date().toISOString() }).eq('id', c.id);
    if (adjuntarExcel) {
      await descargarEntrevistaEstructuradaExcel();
      mostrarToast(`Cita enviada ✓ Para: ${destinatario}${cc ? ' · CC: ' + cc : ''} — se ha descargado la Entrevista Estructurada: adjúntala a mano en tu cliente de correo (el envío automático no admite adjuntos).`, true);
    } else {
      mostrarToast(`Cita de entrevista enviada ✓ Para: ${destinatario}${cc ? ' · CC: ' + cc : ''}`, true);
    }
    await registrarAuditoria('Candidaturas', 'Cita de entrevista enviada', `${c.nombre} — ${destinatario}${cc ? ' · CC: ' + cc : ''} — ${asunto}${adjuntarExcel ? ' · Entrevista Estructurada descargada para adjuntar a mano' : ''}`);
    cerrarConfirmarCitaCandidatoModal();
    await cargarCandidatosAdmin();
    abrirCandidatoModal(c.id);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
  }
}
// César: "si cambias el estado, yo puedo cambiar aprobado y después me deja cambiar hacia atrás
// entrevista realizada y no debería volver atrás nunca" — misma validación en los dos sitios desde
// los que se puede cambiar el estado: el botón "💾 Guardar estado" (guardarEstadoCandidato) y el
// "Guardar" general de la ficha (aquí). Si el cambio retrocede, se bloquea TODO el guardado (no solo
// el estado) y se repone el desplegable, para que no quede nada a medio guardar de forma confusa.
function _bloquearRetrocesoEstadoCandidato(c0, estadoNuevo) {
  if (!c0 || _candidatoPuedeAvanzarEstado(c0.estado, estadoNuevo)) return false;
  $('candModalEstado').value = c0.estado;
  const actualLbl = (CANDIDATO_ESTADOS[c0.estado] || ['—'])[0];
  const nuevoLbl = (CANDIDATO_ESTADOS[estadoNuevo] || ['—'])[0];
  mostrarToast(`⚠️ No se puede retroceder de "${actualLbl}" a "${nuevoLbl}" — el estado de una candidatura nunca retrocede (salvo marcar como rechazado).`, false);
  return true;
}
async function guardarCandidato(e) {
  e.preventDefault();
  const c0 = candidatosCache.find((x) => x.id === currentCandidatoId);
  const estadoNuevo = $('candModalEstado').value;
  if (_bloquearRetrocesoEstadoCandidato(c0, estadoNuevo)) return;
  const fechaEntrevistaNueva = $('candModalFechaEntrevista').value || null;
  const payload = {
    estado: estadoNuevo,
    fecha_entrevista: fechaEntrevistaNueva,
    resultado_entrevista: $('candModalResultado').value.trim() || null,
    puntuacion_adaptacion: $('candModalPuntuacion').value ? parseInt($('candModalPuntuacion').value, 10) : null,
    resultado_entrevista_categoria: $('candModalResultadoCategoria').value || null,
    notas: $('candModalNotas').value.trim() || null,
    // César: distinguir, en el momento del rechazo, si llegó a tener entrevista citada o no —
    // registro que pide para poder reconocer en el futuro a quien ya se presentó antes.
    rechazado_fase: estadoNuevo === 'rechazado' ? ((c0 && c0.fecha_entrevista) || fechaEntrevistaNueva ? 'tras_entrevista' : 'sin_entrevista') : null,
    dni_nie: $('candModalDni').value.trim() || null,
    codigo_postal: $('candModalCp').value.trim() || null,
    direccion: $('candModalDireccion').value.trim() || null,
    localidad: $('candModalLocalidad').value.trim() || null,
    numero_seguridad_social: $('candModalSeguridadSocial') ? ($('candModalSeguridadSocial').value.trim() || null) : undefined,
    iban: $('candModalIban') ? ($('candModalIban').value.trim() || null) : undefined,
    // César (03/11/2026): confirmación manual (no hay OCR que lo verifique solo) de que el IBAN
    // transcrito pertenece de verdad al candidato — timestamp = confirmado, igual que
    // cita_confirmada_en (migración 0104); se vuelve a pedir si se desmarca y se vuelve a marcar.
    iban_confirmado_en: $('candIbanConfirmado') ? ($('candIbanConfirmado').checked ? (c0?.iban_confirmado_en || new Date().toISOString()) : null) : undefined
  };
  if (payload.numero_seguridad_social === undefined) delete payload.numero_seguridad_social;
  if (payload.iban === undefined) delete payload.iban;
  if (payload.iban_confirmado_en === undefined) delete payload.iban_confirmado_en;
  if (_candFormularioEntrevistaRecibidoPendiente) {
    payload.formulario_entrevista_recibido_en = new Date().toISOString();
  }
  const { error } = await sb.from('candidatos').update(payload).eq('id', currentCandidatoId);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Candidatura actualizada ✓', !error);
  if (!error) {
    const c = candidatosCache.find((x) => x.id === currentCandidatoId);
    _candFormularioEntrevistaRecibidoPendiente = false;
    // Mismo motivo que en subirDniNieCandidato — si el número de Seguridad Social se escribe aquí
    // (RR.HH., a mano) en vez de desde el portal del candidato, también debe poder completar la
    // documentación si ya estaban los otros 2 datos.
    await sb.rpc('_completar_documentacion_candidato_si_procede', { p_id: currentCandidatoId }).then(() => {}, () => {});
    cerrarCandidatoModal();
    await cargarCandidatosAdmin();
    await registrarAuditoria('Candidaturas', 'Actualización', `${c ? c.nombre : ''} → ${CANDIDATO_ESTADOS[payload.estado][0]}`);
  }
}
// César: "echo en falta también un botón que diga guardar" — el único "Guardar" real estaba al
// fondo de una ficha larga, lejos del desplegable de Estado; este guarda solo el estado (con la
// misma validación de "no retroceder"), con confirmación inmediata, sin tocar ni tener que revisar
// el resto de la ficha.
async function guardarEstadoCandidato() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  const estadoNuevo = $('candModalEstado').value;
  if (estadoNuevo === c.estado) {
    mostrarToast('El estado no ha cambiado.', true);
    return;
  }
  if (_bloquearRetrocesoEstadoCandidato(c, estadoNuevo)) return;
  const payload = {
    estado: estadoNuevo,
    rechazado_fase: estadoNuevo === 'rechazado' ? (c.fecha_entrevista ? 'tras_entrevista' : 'sin_entrevista') : c.rechazado_fase
  };
  const { error } = await sb.from('candidatos').update(payload).eq('id', c.id);
  mostrarToast(error ? 'Error al guardar: ' + error.message : 'Estado actualizado ✓', !error);
  if (!error) {
    await registrarAuditoria('Candidaturas', 'Cambio de estado', `${c.nombre} → ${CANDIDATO_ESTADOS[estadoNuevo][0]}`);
    await cargarCandidatosAdmin();
    abrirCandidatoModal(c.id);
  }
}

// ---------- CV, seguimiento de contacto y correo ad hoc del candidato ----------
// César (captura del móvil, formulario público): "Invalid key" al subir el CV — Supabase Storage
// rechaza claves de objeto con espacios/acentos/ciertos símbolos. El nombre real (con espacios,
// tildes, etc.) se conserva en cv_nombre_archivo; esto solo sanea la RUTA de almacenamiento. Se
// aplica aquí también (subida desde el panel) por el mismo motivo, aunque no se había reportado.
function sanitizarNombreArchivo(nombre) {
  const partes = nombre.split('.');
  const ext = partes.length > 1 ? partes.pop() : '';
  const base = partes.join('.')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'archivo';
  return ext ? `${base}.${ext.toLowerCase().replace(/[^a-z0-9]/g, '')}` : base;
}
async function subirCvCandidato() {
  const archivo = $('candCvInput').files[0];
  if (!archivo || !currentCandidatoId) return;
  // Ruta con el hotel_id como primer segmento — es la carpeta que cubre la política de Storage de
  // RR.HH./Admin (migración 0085 para insert, 0094 para select); "candidatos/<id>/..." (versión
  // anterior) no estaba cubierta por ninguna política y la subida fallaba por RLS.
  const ruta = `${usuarioActual.hotel_id}/candidatos/${currentCandidatoId}/cv/${Date.now()}-${sanitizarNombreArchivo(archivo.name)}`;
  const { error: errorSubida } = await sb.storage.from('formularios-adjuntos').upload(ruta, archivo);
  if (errorSubida) {
    mostrarToast('Error al subir el CV: ' + errorSubida.message, false);
    return;
  }
  const { error } = await sb.from('candidatos').update({ cv_adjunto_url: ruta, cv_nombre_archivo: archivo.name }).eq('id', currentCandidatoId);
  if (error) {
    mostrarToast('Error al guardar el CV: ' + error.message, false);
    return;
  }
  mostrarToast('CV adjuntado ✓', true);
  await registrarAuditoria('Candidaturas', 'CV adjuntado', archivo.name);
  await cargarCandidatosAdmin();
  abrirCandidatoModal(currentCandidatoId);
}
// César (cuarta vuelta): "podemos llamar al menos una vez" — contacto_llamado_en (un único
// timestamp, que cada llamada sobrescribía) no permitía saber si se había llamado 1 o 5 veces;
// ahora se añade a contacto_llamadas (historial completo, jsonb) y contacto_llamado_en se sigue
// guardando igual (como "última llamada") por compatibilidad con el resto de la app.
async function marcarCandidatoLlamado(btn) {
  if (!currentCandidatoId) return;
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  // César (07/11/2026, mismo bloqueo que el paso 4 y "Dar de alta"): confirm() nativo bloqueado por
  // Chrome tras uso repetido en la misma pestaña — confirmación con un segundo clic sobre el propio
  // botón, igual que confirmarContratacionYEnviar()/darAltaDesdeCanditado().
  if (btn && btn.dataset.confirmando !== '1') {
    const textoOriginal = btn.textContent;
    btn._textoOriginal = textoOriginal;
    btn.dataset.confirmando = '1';
    btn.textContent = '¿Seguro? Pulsa otra vez';
    mostrarToast('Vuelve a pulsar para registrar la llamada.');
    clearTimeout(btn._confirmTimeout);
    btn._confirmTimeout = setTimeout(() => {
      if (btn.dataset.confirmando === '1') { btn.dataset.confirmando = '0'; btn.textContent = textoOriginal; }
    }, 6000);
    return;
  }
  if (btn) { clearTimeout(btn._confirmTimeout); btn.dataset.confirmando = '0'; }
  const ahora = new Date().toISOString();
  const llamadas = [...(Array.isArray(c.contacto_llamadas) ? c.contacto_llamadas : (c.contacto_llamado_en ? [c.contacto_llamado_en] : [])), ahora];
  const { error } = await sb.from('candidatos').update({ contacto_llamado_en: ahora, contacto_llamadas: llamadas }).eq('id', currentCandidatoId);
  mostrarToast(error ? 'Error: ' + error.message : `Llamada nº ${llamadas.length} registrada ✓`, !error);
  if (!error) {
    await registrarAuditoria('Candidaturas', 'Llamada telefónica registrada', `${c.nombre} — llamada nº ${llamadas.length}`);
    await cargarCandidatosAdmin();
    abrirCandidatoModal(currentCandidatoId);
  }
}
// César: "ella sí que ha respondido por correo [confirmando la cita] [...] no sé a dónde la podemos
// ver" — el correo de "Confirmar cita por correo" le pide que responda confirmando asistencia; esa
// respuesta es un email normal (llega a la bandeja de RR.HH., no a la app), así que se marca aquí a
// mano en cuanto se lee — mismo patrón que marcarCandidatoLlamado().
async function marcarCitaConfirmadaCandidato() {
  if (!currentCandidatoId) return;
  if (!confirm('¿Marcar que esta persona ha confirmado su asistencia a la entrevista presencial?')) return;
  const { error } = await sb.from('candidatos').update({ cita_confirmada_en: new Date().toISOString() }).eq('id', currentCandidatoId);
  mostrarToast(error ? 'Error: ' + error.message : 'Asistencia confirmada ✓', !error);
  if (!error) {
    const c = candidatosCache.find((x) => x.id === currentCandidatoId);
    await registrarAuditoria('Candidaturas', 'Asistencia a entrevista presencial confirmada', c ? c.nombre : '');
    await cargarCandidatosAdmin();
    abrirCandidatoModal(currentCandidatoId);
  }
}
// César: "enviado el formulario de entrevista, que es ese que tenemos creado, que para algunos
// puestos nos convendría enviarlo, que nos lo devuelvan y ya nos ahorramos todo lo de la
// entrevista [física]" — el envío en sí se hace con el Excel real (⬇ Descargar arriba, o
// descargarEntrevistaEstructuradaExcel) adjuntado a mano: enviar_correo_externo (migración 0072)
// no admite adjuntos, así que este botón solo deja constancia de la fecha de envío.
async function marcarFormularioEntrevistaEnviado() {
  if (!currentCandidatoId) return;
  const { error } = await sb.from('candidatos').update({ formulario_entrevista_enviado_en: new Date().toISOString() }).eq('id', currentCandidatoId);
  mostrarToast(error ? 'Error: ' + error.message : 'Formulario marcado como enviado ✓ — adjunta el Excel al correo manualmente (el envío automático no admite adjuntos).', !error);
  if (!error) {
    const c = candidatosCache.find((x) => x.id === currentCandidatoId);
    await registrarAuditoria('Candidaturas', 'Formulario de Entrevista Estructurada marcado como enviado', c ? c.nombre : '');
    await cargarCandidatosAdmin();
    abrirCandidatoModal(currentCandidatoId);
  }
}

// ---------- FASE 1 — Formulario público del candidato (ticket de desarrollo) ----------
// César (ticket): botón "✉️ Enviar Formulario de Entrevista (Fase 1)" → genera un enlace público
// de un solo uso (entrevista-publica.html?token=...) y envía el Correo 2. El token se genera aquí
// (no en el servidor) para poder mostrarlo ya escrito en el cuerpo del correo de revisión, igual
// que hace abrirConfirmarCitaCandidatoModal() con la fecha de la cita; solo se guarda en la ficha
// (y el estado solo avanza a formulario_enviado) si el envío del correo tiene éxito.
let _candFase1Token = null;
function abrirEnviarFormularioFase1Modal() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  // César: "no tiene que pedirte el email [...] ya tienes los datos de ese candidato [...] no
  // tienes por qué volver a poner el correo electrónico" — si la ficha no tiene email, se deja
  // escribirlo aquí mismo (el campo Destinatario ya es editable) en vez de bloquear la apertura del
  // modal y obligar a salir, editarlo en otro sitio y volver a intentarlo.
  // César (captura real): abrió un correo de Fase 1 ya enviado y salió "Enlace no válido"; lo
  // reenvió y el siguiente intento salió "caducado". Causa: aquí se generaba SIEMPRE un token
  // nuevo al abrir este modal, así que reenviar el formulario (recordatorio, "no me llegó", etc.)
  // sobrescribía en la ficha el token del correo YA enviado — ese correo anterior, el que la
  // persona pueda tener abierto en el móvil, en el ordenador o en los dos, se quedaba apuntando a
  // un token que ya no existe en la base de datos. Se reutiliza el token existente mientras no se
  // haya respondido todavía, para que cualquier copia del enlace ya enviada se mantenga válida.
  _candFase1Token = (c.entrevista_fase1_token && !c.formulario_entrevista_recibido_en) ? c.entrevista_fase1_token : crypto.randomUUID();
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}entrevista-publica.html?token=${_candFase1Token}`;
  const fechaLimite = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('es-ES');
  $('candFase1Destinatario').value = c.email || '';
  $('candFase1CC').value = '';
  sb.rpc('rrhh_emails_hotel').then(({ data }) => {
    if (data && !$('candFase1CC').value) $('candFase1CC').value = data;
  });
  // César: "cuando pones siguiente fase de tu candidatura, deberías poner alguna palabra clave [...]
  // la siguiente, que se llame como la respuesta que hemos dado" — texto genérico, idéntico en cada
  // envío/reenvío, imposible de distinguir en el historial de correos (📬) sin abrir cada uno.
  $('candFase1Asunto').value = 'Formulario de entrevista — Fase 1 de tu candidatura';
  $('candFase1FechaLimite').value = fechaLimite;
  $('candFase1Url').value = url;
  $('candFase1Cuerpo').value = `Hola ${c.nombre},\n\nTe adjuntamos el enlace para realizar la primera fase de la entrevista. Por favor, complétalo antes de ${fechaLimite}.\n\nEnlace: ${url}\n\nUn saludo,\nPersonal4Pax`;
  $('modalEnviarFormularioFase1').classList.remove('hidden');
}
function cerrarEnviarFormularioFase1Modal() {
  $('modalEnviarFormularioFase1').classList.add('hidden');
  _candFase1Token = null;
}
// Actualiza el cuerpo propuesto si el admin cambia la fecha límite, sin pisar un cuerpo que ya haya
// editado a mano (solo mientras el cuerpo siga siendo el que se generó automáticamente).
function actualizarFechaLimiteFase1() {
  const fecha = $('candFase1FechaLimite').value.trim();
  const cuerpo = $('candFase1Cuerpo').value;
  const actualizado = cuerpo.replace(/complétalo antes de .*?\./, `complétalo antes de ${fecha}.`);
  $('candFase1Cuerpo').value = actualizado;
}
async function enviarFormularioFase1Candidato(btn) {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c || !_candFase1Token) return;
  if (btn && btn.disabled) return;
  const destinatario = $('candFase1Destinatario').value.trim();
  const cc = $('candFase1CC').value.trim() || null;
  const asunto = $('candFase1Asunto').value.trim();
  const cuerpo = $('candFase1Cuerpo').value.trim();
  if (!destinatario || !asunto || !cuerpo) {
    mostrarToast('⚠️ Completa destinatario, asunto y cuerpo antes de enviar', false);
    return;
  }
  // César (ticket): "Implementa el sistema de envío (SMTP/SendGrid/etc.)" — se reutiliza el que ya
  // existe y funciona en producción (enviar_correo_externo, migración 0072, sobre la misma cola/
  // Resend que el resto de correos del panel) en vez de levantar uno nuevo.
  const textoBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const { error } = await sb.rpc('enviar_correo_externo', {
      p_destinatario_email: destinatario,
      p_cc_email: cc,
      p_asunto: asunto,
      p_cuerpo: cuerpo,
      p_referencia_tabla: 'candidatos',
      p_referencia_id: c.id
    });
    if (error) {
      mostrarToast('Error al enviar el formulario: ' + error.message, false);
      return;
    }
    await sb.from('candidatos').update({
      entrevista_fase1_token: _candFase1Token,
      entrevista_fase1_token_generado_en: new Date().toISOString(),
      estado: c.estado === 'recibida' ? 'formulario_enviado' : c.estado,
      formulario_entrevista_enviado_en: new Date().toISOString()
    }).eq('id', c.id);
    mostrarToast(`Formulario de Fase 1 enviado ✓ Para: ${destinatario}${cc ? ' · CC: ' + cc : ''}`, true);
    await registrarAuditoria('Candidaturas', 'Formulario de Entrevista Fase 1 enviado (enlace público)', `${c.nombre} — ${destinatario}`);
    cerrarEnviarFormularioFase1Modal();
    await cargarCandidatosAdmin();
    abrirCandidatoModal(c.id);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
  }
}

// ---------- Envío de la documentación de incorporación a gestoría (sexta vuelta; reordenado
// 03/11/2026) ----------
// César: "esos tres documentos son los que se tienen que enviar a la gestoría de manera
// automática también [...] botón en ver correo, generar correo, enviar a gestoría, marcado como
// enviado a gestoría. Y ahí se crea la ficha" — mismo patrón ya usado en otros módulos para
// "enviar a gestoría" (enviarGestoriaDevolucion — EPI/uniformidad, migración 0084;
// formularios_destinatarios.predeterminado_gestoria — migración 0006, un único destinatario de
// gestoría por hotel, en vez de teclearlo cada vez). Los 2 adjuntos van como enlace de descarga
// firmado (caduca en 7 días): enviar_correo_externo no admite adjuntos, igual que ya ocurre con
// la Entrevista Estructurada/el Formulario del Candidato en Excel.
//
// César (03/11/2026, corrección sobre lo anterior): "este enlace gigante no lo tienes que enviar
// [...] pon otro botón que te permita ver los documentos adjuntos [...] revisa que todos los
// documentos estén, que deben ser tres y deben ser visibles, legibles [...] en el cuerpo debe
// figurar el DNI claramente y el número de cuenta con el OK de que sí pertenece al trabajador" —
// los 2 enlaces firmados ya NO se escriben dentro del cuerpo editable (un técnico sustituto podría
// borrarlos o estropearlos sin querer, y se veían como un bloque de texto gigante); el panel de
// arriba del modal deja revisar los 3 documentos (DNI/NIE, certificado bancario, nº de Seguridad
// Social) con un enlace "ver" real antes de enviar, y los 2 enlaces de descarga se generan y se
// añaden solos al cuerpo en el momento de pulsar "Enviar a gestoría", en un bloque aparte al final.
// El IBAN no se extrae solo (no hay OCR en este proyecto) — es el campo que RR.HH. transcribe a
// mano en la ficha tras revisar el certificado (candModalIban/candIbanConfirmado, migración 0114);
// si falta o no está confirmado, se avisa aquí sin bloquear el envío (no es uno de los "tres
// documentos" obligatorios ya fijados en el resto del circuito).
function _renderDocsPanelGestoria(c) {
  const cont = $('candGestoriaDocsPanel');
  if (!cont) return;
  const fila = (ok, etiqueta, nombreArchivo, storagePath, etiquetaError) => {
    const estado = ok ? '✅' : '⚠️';
    let html = `<div style="display:flex;align-items:center;gap:6px;">${estado} <b>${etiqueta}</b>${nombreArchivo ? ` — ${_escHtml(nombreArchivo)}` : ok ? '' : ' — falta'}</div>`;
    return { html, storagePath, etiquetaError, nombreArchivo };
  };
  const filas = [
    fila(!!c.dni_nie_adjunto_url, 'DNI/NIE', c.dni_nie_adjunto_nombre, c.dni_nie_adjunto_url, 'el DNI/NIE'),
    fila(!!c.certificado_bancario_adjunto_url, 'Certificado bancario', c.certificado_bancario_adjunto_nombre, c.certificado_bancario_adjunto_url, 'el certificado bancario'),
    fila(!!c.numero_seguridad_social, 'Nº afiliación Seguridad Social', c.numero_seguridad_social, null, '')
  ];
  cont.innerHTML = '';
  filas.forEach((f) => {
    const div = document.createElement('div');
    div.innerHTML = f.html;
    if (f.storagePath) {
      const enlace = document.createElement('a');
      enlace.href = '#';
      enlace.textContent = 'ver';
      enlace.style.marginLeft = '4px';
      // César (07/11/2026, octava vuelta): "no puedes volver para atrás porque te saca de la
      // aplicación [...] que no ocupe toda la pantalla [...] que sí se pueda cerrar sin que te mande
      // fuera" — mismo problema que ya se arregló para el "ver" de la propia ficha (DNI/NIE,
      // certificado bancario, CV): un window.open(url,'_blank') saca a una pestaña nueva sin más
      // contexto que "atrás" del navegador, que cierra la app. Se usa aquí el mismo visor flotante y
      // arrastrable (abrirVisorDocumento, línea ~9715) que ya tiene su propio botón de cerrar.
      enlace.onclick = async (ev) => {
        ev.preventDefault();
        const { data: signed, error } = await sb.storage.from('formularios-adjuntos').createSignedUrl(f.storagePath, 3600);
        if (error) { mostrarToast(`No se pudo abrir ${f.etiquetaError}: ` + error.message, false); return; }
        abrirVisorDocumento(signed.signedUrl, `📎 ${f.nombreArchivo || f.etiquetaError}`, _esImagenPorNombre(f.nombreArchivo || f.storagePath));
      };
      div.firstElementChild.appendChild(enlace);
    }
    cont.appendChild(div);
  });
  const avisoIban = $('candGestoriaAvisoIban');
  if (avisoIban) {
    // César (07/11/2026): "ya está marcada la casilla... pero sale este aviso" — el aviso comparaba
    // solo contra c.iban_confirmado_en (lo ya guardado en servidor), así que si acabas de marcar la
    // casilla en la ficha pero no has pulsado "Guardar" todavía, seguía saliendo el aviso de "sin
    // confirmar" aunque se vea marcada. Se distingue ahora ese caso del de "aún sin marcar".
    const marcadoSinGuardar = !c.iban_confirmado_en && $('candIbanConfirmado') && $('candIbanConfirmado').checked;
    if (!c.iban) {
      avisoIban.textContent = '⚠️ Esta persona no tiene IBAN registrado en la ficha — ábrela, revisa el certificado bancario y transcríbelo antes de enviar si quieres incluirlo.';
      avisoIban.style.display = '';
    } else if (marcadoSinGuardar) {
      avisoIban.textContent = '⚠️ Has marcado la confirmación del IBAN pero todavía no has guardado la ficha — pulsa "💾 Guardar" en la ficha y vuelve a abrir este envío.';
      avisoIban.style.display = '';
    } else if (!c.iban_confirmado_en) {
      avisoIban.textContent = '⚠️ El IBAN está escrito pero sin confirmar en la ficha — marca la casilla de confirmación antes de enviar.';
      avisoIban.style.display = '';
    } else {
      avisoIban.style.display = 'none';
    }
  }
}
function abrirEnviarDocumentacionGestoriaModal() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c || !c.documentacion_recibida_en) return;
  const predeterminado = formulariosDestinatariosCache.find((d) => d.predeterminado_gestoria);
  $('candGestoriaDestinatario').value = predeterminado ? predeterminado.email : '';
  if (!predeterminado) mostrarToast('⚠️ No hay un destinatario de gestoría predeterminado (Formularios → Destinatarios) — escríbelo a mano antes de enviar.', false);
  $('candGestoriaCC').value = '';
  sb.rpc('rrhh_emails_hotel').then(({ data }) => {
    if (data && !$('candGestoriaCC').value) $('candGestoriaCC').value = data;
  });
  _renderDocsPanelGestoria(c);
  $('candGestoriaAsunto').value = `Documentación de incorporación — ${c.nombre}`;
  const ibanMarcadoSinGuardar = !c.iban_confirmado_en && $('candIbanConfirmado') && $('candIbanConfirmado').checked;
  const ibanConfirmadoEfectivo = !!(c.iban_confirmado_en || ibanMarcadoSinGuardar);
  const ibanLinea = c.iban ? `Número de cuenta (IBAN): ${c.iban}${ibanConfirmadoEfectivo ? ' — confirmado, coincide con el titular' : ' — ⚠️ sin confirmar en la ficha, verifícalo antes de usarlo'}\n` : '';
  // César (07/11/2026, tercera vuelta): "falta indicar que también le envías el certificado
  // bancario (para que no se pueda olvidar a RRHH)" — el enlace de descarga del certificado ya se
  // añadía solo al final del correo, al pulsar "Enviar a gestoría" (más abajo, en
  // enviarDocumentacionGestoriaCandidato), pero eso no se ve mientras se edita el cuerpo ni deja
  // constancia expresa junto al resto de datos; se añade aquí, en el bloque de datos, para que quede
  // explícito que se envía también ese documento y no solo el IBAN transcrito a mano.
  // César (07/11/2026, quinta vuelta): "todos los archivos... deberían verlos adjuntos en el mismo
  // correo" — ahora el DNI/NIE y el certificado bancario se adjuntan de verdad al correo (no un
  // enlace), así que el texto ya no dice "enlace al final" salvo que haga falta el respaldo.
  const certificadoBancarioLinea = c.certificado_bancario_adjunto_url ? `Certificado bancario: se adjunta a este correo\n` : '';
  // César (07/11/2026, cuarta vuelta): "también debemos añadir la dirección del trabajador, eso lo
  // tenemos del CV o de los datos del formulario" — domicilio/CP/localidad ya llegan del formulario
  // público de candidatura y se guardan en la ficha (candModalDireccion/Cp/Localidad, ver más abajo
  // en guardarCandidato); se combinan aquí en una sola línea para gestoría.
  const direccionPartes = [c.direccion, [c.codigo_postal, c.localidad].filter((v) => v && v.trim()).join(' ')].filter((v) => v && v.trim());
  const direccionLinea = `Dirección: ${direccionPartes.length ? direccionPartes.join(', ') : '— no consta en la ficha, pídesela al trabajador —'}\n`;
  // César (07/11/2026): "en el correo para la gestoría debes indicar 'Tipo de contrato:' y RRHH
  // deberá apuntar qué tipo de contrato hay que hacer" — no se infiere solo (no hay dato en la ficha
  // para ello); se deja la etiqueta en blanco en el cuerpo editable para que RR.HH. lo rellene antes
  // de enviar, igual que ya hace con destinatario/asunto si faltan.
  //
  // César (07/11/2026, segunda vuelta): reestructura el cuerpo — "no quiero que estén entre
  // paréntesis esto porque es un dato relevante [...] departamento, dos puntos, alimentos y bebida,
  // coma, sala" — el puesto_label del catálogo es "Sala (Alimentos y Bebidas)" (puesto + área entre
  // paréntesis); se invierte a "Área, Puesto" en una línea "Departamento:" propia, sin paréntesis.
  const departamentoLinea = _areaParaCorreoGestoria(c.puesto_key, c.puesto_label);
  // César (07/11/2026, sexta vuelta): "departamento, categoría, y puesto" — tres líneas separadas;
  // Categoría y Puesto (Camarero, Ayudante de Camarero...) no existen como dato en la ficha, así que
  // van en blanco para que RR.HH. las rellene a mano, igual que Tipo de contrato.
  $('candGestoriaCuerpo').value = `Buenos días,\n\nOs remitimos la documentación de incorporación de ${c.nombre} para tramitar su alta.\n\nDepartamento: ${departamentoLinea}\nCategoría: \nPuesto: \nTipo de contrato: \n\nDNI/NIE: ${c.dni_nie || '—'}\n${direccionLinea}Número de afiliación a la Seguridad Social: ${c.numero_seguridad_social || '—'}\n${ibanLinea}${certificadoBancarioLinea}\nUn saludo,\nDepartamento de RR.HH.`;
  $('modalEnviarDocumentacionGestoria').classList.remove('hidden');
}
function cerrarEnviarDocumentacionGestoriaModal() {
  $('modalEnviarDocumentacionGestoria').classList.add('hidden');
}
async function enviarDocumentacionGestoriaCandidato(btn) {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  if (btn && btn.disabled) return;
  const destinatario = $('candGestoriaDestinatario').value.trim();
  const cc = $('candGestoriaCC').value.trim() || null;
  const asunto = $('candGestoriaAsunto').value.trim();
  let cuerpo = $('candGestoriaCuerpo').value.trim();
  if (!destinatario || !asunto || !cuerpo) {
    mostrarToast('⚠️ Completa destinatario, asunto y cuerpo antes de enviar', false);
    return;
  }
  const textoBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Adjuntando documentos y enviando…'; }
  try {
    // César (07/11/2026): "todos los archivos son para que los reciba la gestoría y debería verlos
    // adjuntos en el mismo correo" — antes solo se mandaba un enlace de descarga de 7 días; ahora se
    // descarga cada documento aquí mismo, en el momento de enviar, y se manda como adjunto real
    // (migración 0120: notificaciones_cola.adjuntos + enviar_correo_externo p_adjuntos, reenviados
    // por la Edge Function enviar-notificaciones a Resend). Si un archivo pesa demasiado o falla la
    // descarga, no se bloquea el envío: se cae al enlace de 7 días de siempre, solo para ese archivo.
    const MAX_ADJUNTO_BYTES = 8 * 1024 * 1024; // 8 MB por archivo — margen amplio para fotos/PDF de DNI o certificado
    const siete_dias = 7 * 24 * 60 * 60;
    const adjuntos = [];
    const enlacesFallback = [];
    const prepararAdjunto = async (storagePath, nombreArchivo, etiqueta) => {
      if (!storagePath) return;
      try {
        const { data: blob, error: errorDescarga } = await sb.storage.from('formularios-adjuntos').download(storagePath);
        if (errorDescarga || !blob) throw errorDescarga || new Error('descarga vacía');
        if (blob.size > MAX_ADJUNTO_BYTES) throw new Error('demasiado grande para adjuntar (máx. 8 MB)');
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binario = '';
        const TROZO = 0x8000;
        for (let i = 0; i < bytes.length; i += TROZO) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + TROZO));
        adjuntos.push({ nombre: nombreArchivo || storagePath.split('/').pop(), base64: btoa(binario) });
      } catch (err) {
        const { data: signed } = await sb.storage.from('formularios-adjuntos').createSignedUrl(storagePath, siete_dias);
        enlacesFallback.push(`${etiqueta}: ${signed ? signed.signedUrl : '— no se ha podido generar el enlace, adjúntalo a mano —'} (no se pudo adjuntar directamente: ${err && err.message ? err.message : err})`);
      }
    };
    await prepararAdjunto(c.dni_nie_adjunto_url, c.dni_nie_adjunto_nombre, 'DNI/NIE');
    await prepararAdjunto(c.certificado_bancario_adjunto_url, c.certificado_bancario_adjunto_nombre, 'Certificado bancario');
    if (enlacesFallback.length) {
      cuerpo += `\n\n— Enlaces de descarga (caducan en 7 días por seguridad) —\n${enlacesFallback.join('\n')}`;
    }
    const { error } = await sb.rpc('enviar_correo_externo', {
      p_destinatario_email: destinatario,
      p_cc_email: cc,
      p_asunto: asunto,
      p_cuerpo: cuerpo,
      p_referencia_tabla: 'candidatos',
      p_referencia_id: c.id,
      p_adjuntos: adjuntos.length ? adjuntos : null
    });
    if (error) {
      mostrarToast('Error al enviar a gestoría: ' + error.message, false);
      return;
    }
    await sb.from('candidatos').update({ documentacion_enviada_gestoria_en: new Date().toISOString() }).eq('id', c.id);
    const avisoAdjuntos = adjuntos.length ? ` · ${adjuntos.length} archivo${adjuntos.length > 1 ? 's' : ''} adjunto${adjuntos.length > 1 ? 's' : ''}` : (enlacesFallback.length ? ' · ⚠️ algún archivo no se pudo adjuntar, revisa el correo (se envió como enlace)' : '');
    mostrarToast(`Documentación enviada a gestoría ✓ Para: ${destinatario}${cc ? ' · CC: ' + cc : ''}${avisoAdjuntos}`, true);
    await registrarAuditoria('Candidaturas', 'Documentación de incorporación enviada a gestoría', `${c.nombre} — ${destinatario}`);
    cerrarEnviarDocumentacionGestoriaModal();
    await cargarCandidatosAdmin();
    abrirCandidatoModal(c.id);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
  }
}

// Panel de solo lectura "Respuestas del Candidato (Fase 1)" dentro de la ficha — usa las mismas 16
// preguntas que la Entrevista Estructurada (ENTREVISTA_PREGUNTAS) solo para mostrar el texto de la
// pregunta junto a lo que escribió el candidato; nunca muestra "criterios" (eso sigue siendo
// exclusivo del checklist interno, migración 0100).
function renderRespuestasFase1Candidato(c) {
  if (!$('candFase1RespuestasPanel')) return;
  if (!c.entrevista_fase1_respuestas) {
    $('candFase1RespuestasPanel').style.display = 'none';
    return;
  }
  const r = c.entrevista_fase1_respuestas;
  const filas = [];
  ENTREVISTA_PREGUNTAS.forEach((p) => {
    filas.push(`<div style="margin-bottom:10px;"><p style="margin:0 0 2px;font-size:12px;font-weight:700;color:var(--slate-600);">${p.id}. ${p.pregunta}</p><p style="margin:0;font-size:13px;white-space:pre-wrap;">${(r[String(p.id)] || '—')}</p></div>`);
    if (p.sub_pregunta) {
      const subId = p.sub_pregunta.match(/^(\d+\.\d+)/);
      const key = subId ? subId[1] : null;
      if (key) {
        filas.push(`<div style="margin:0 0 10px 14px;"><p style="margin:0 0 2px;font-size:11.5px;font-weight:700;color:var(--slate-500);">${p.sub_pregunta}</p><p style="margin:0;font-size:13px;white-space:pre-wrap;">${(r[key] || '—')}</p></div>`);
      }
    }
  });
  $('candFase1RespuestasPanel').style.display = '';
  $('candFase1RespuestasFecha').textContent = c.entrevista_fase1_fecha ? `Respondido el ${fechaCorta(c.entrevista_fase1_fecha)}.` : '';
  $('candFase1RespuestasBody').innerHTML = filas.join('');
}
const CAND_PLANTILLAS_CORREO = {
  recibida: (c) => ({ asunto: 'Hemos recibido tu candidatura', cuerpo: `Hola ${c.nombre},\n\nHemos recibido tu candidatura para el puesto de ${c.puesto_label || '—'}. La estamos revisando y te contactaremos en cuanto haya novedades.\n\nUn saludo,\nPersonal4Pax` }),
  entrevista_programada: (c) => ({ asunto: 'Tu entrevista', cuerpo: `Hola ${c.nombre},\n\nTe escribimos para confirmar los detalles de tu entrevista${c.fecha_entrevista ? ` del ${fechaCorta(c.fecha_entrevista)}` : ''}. Si tienes cualquier duda, respóndenos a este correo.\n\nUn saludo,\nPersonal4Pax` }),
  entrevista_realizada: (c) => ({ asunto: 'Gracias por tu entrevista', cuerpo: `Hola ${c.nombre},\n\nGracias por el tiempo dedicado a la entrevista. Estamos valorando tu candidatura y te avisaremos en cuanto tengamos una decisión.\n\nUn saludo,\nPersonal4Pax` }),
  aprobado: (c) => ({ asunto: '¡Buenas noticias sobre tu candidatura!', cuerpo: `Hola ${c.nombre},\n\nTu candidatura para el puesto de ${c.puesto_label || '—'} ha sido aprobada. Nos pondremos en contacto contigo para los siguientes pasos.\n\nUn saludo,\nPersonal4Pax` }),
  rechazado: (c) => ({ asunto: 'Sobre tu candidatura', cuerpo: `Hola ${c.nombre},\n\nGracias por tu interés y por el tiempo dedicado al proceso de selección. En esta ocasión hemos decidido continuar con otro perfil, pero conservamos tu candidatura por si surge una oportunidad más adelante acorde a tu perfil.\n\nTe deseamos mucho éxito.\n\nUn saludo,\nPersonal4Pax` })
};
function rellenarPlantillaCorreoCandidato() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  _candCorreoEsConfirmacionContratacion = false;
  // César (03/11/2026, cuarta vuelta): el tipo lo elige RR.HH. en el desplegable de la propia
  // sección (candCorreoTipo) — ya no se deduce del Estado de la ficha, que puede ir por delante o
  // por detrás de lo que de verdad se quiere comunicar en este correo concreto.
  const tipo = $('candCorreoTipo') ? $('candCorreoTipo').value : c.estado;
  const plantilla = (CAND_PLANTILLAS_CORREO[tipo] || CAND_PLANTILLAS_CORREO.recibida)(c);
  $('candCorreoAsunto').value = plantilla.asunto;
  $('candCorreoCuerpo').value = plantilla.cuerpo;
  _actualizarAvisoCorreoYaEnviado();
}
// César: "antes de abrir la parte de la contratación hay que confirmarle al trabajador que ha
// sido seleccionado, que vamos a contratarlo y la documentación que necesitamos. Esto tiene que
// ser con un correo. Solicitud de documentación para incorporarte [...] el asunto sería Bienvenido"
// — reutiliza el MISMO bloque "Generar y enviar correo" ya existente (destinatario/asunto/cuerpo
// editables antes de enviar) en vez de crear un modal nuevo; _candCorreoEsConfirmacionContratacion
// marca que, si SE ENVÍA este correo en concreto, hay que registrar confirmacion_contratacion_
// enviada_en (lo que destapa el botón "🏁 Dar de alta").
let _candCorreoEsConfirmacionContratacion = false;
// César (02/11/2026, segunda vuelta): "crea el circuito [...] lo tienes que redactar, que sea
// humano y bonito [...] en ese mismo correo le solicitamos los documentos" + portal de autoservicio
// (migración 0110, sección 2) — el token se genera aquí, igual que _candFase1Token en
// abrirEnviarFormularioFase1Modal(), para poder mostrarlo ya escrito en el cuerpo del correo antes
// de enviar. A diferencia del token de Fase 1, este SIEMPRE se reutiliza mientras no esté completa
// la documentación (nunca es de un solo uso — el candidato puede volver tantas veces como necesite),
// así que reenviar este correo (recordatorio) nunca invalida una copia del enlace ya enviada antes.
let _candDocumentacionToken = null;
// César (02/11/2026, tercera vuelta): "tienes que incluir la normativa, protección de datos, el
// compromiso con el RGPD [...] que sea profesional, elegante y perfecto" — copia local de respaldo
// de _texto_clausula_rgpd_documentacion_incorporacion() (migración 0111), mismo principio que
// TEXTO_CLAUSULA_RESPALDO en candidatura.html: si el RPC fallase (sin red, migración no aplicada
// todavía…) el correo se sigue pudiendo generar y enviar, nunca sin la cláusula.
const CLAUSULA_RGPD_DOCUMENTACION_RESPALDO = 'INFORMACIÓN SOBRE PROTECCIÓN DE DATOS — DOCUMENTACIÓN DE INCORPORACIÓN\n' +
  'Responsable: el hotel/empresa que te ha seleccionado para este puesto. Finalidad: tramitar tu alta como persona trabajadora — afiliación a la Seguridad Social, contrato de trabajo y pago de la nómina. ' +
  'Base legal: necesidad contractual y cumplimiento de obligaciones legales (art. 6.1.b y 6.1.c RGPD; Ley General de la Seguridad Social; Estatuto de los Trabajadores). ' +
  'Datos solicitados: solo los estrictamente necesarios para tramitar tu alta (principio de minimización, art. 5.1.c RGPD). ' +
  'Destinatarios: la Tesorería General de la Seguridad Social y la Agencia Tributaria, por obligación legal — nunca se ceden a terceros con fines comerciales. ' +
  'Conservación: mientras dure tu relación laboral y, después, el plazo legal de prescripción de obligaciones laborales y de Seguridad Social (hasta 4 años). ' +
  'Seguridad: la subida se realiza mediante un enlace personal y cifrado, accesible solo con tu identificador único. ' +
  'Derechos: acceso, rectificación, supresión, oposición, limitación y portabilidad, dirigiéndote al responsable del proceso.';
function plantillaCorreoConfirmacionContratacion(c, urlDocumentacion, clausulaRgpd) {
  const pct = c.puntuacion_adaptacion != null ? `${c.puntuacion_adaptacion}%` : null;
  const separador = '────────────────────────────────────────';
  return {
    asunto: 'Bienvenido — queremos contar contigo',
    cuerpo: `Hola ${c.nombre},\n\n¡Enhorabuena! Ha sido un placer conocerte durante el proceso de selección para el puesto de ${c.puesto_label || '—'}, y nos alegra mucho poder darte esta noticia: tu candidatura ha superado nuestro proceso de evaluación${pct ? ` con un ${pct} de adaptación a los valores y la forma de trabajar de nuestro equipo` : ''}, y queremos contar contigo.\n\nA partir de aquí, nos gustaría empezar cuanto antes con tu incorporación. Para poder tramitar tu alta necesitamos estos tres documentos:\n\n1. DNI o NIE (ambas caras)\n2. Número de afiliación a la Seguridad Social\n3. Certificado bancario de titularidad, en el que figure tu número de cuenta (IBAN español) junto con tu nombre y tu DNI o NIE\n\nPara que sea rápido y seguro, puedes subirlos directamente (o entregarlos en persona, si lo prefieres) desde este enlace personal:\n${urlDocumentacion}\n\nNo hace falta hacerlo todo de una vez — puedes volver al mismo enlace cuando quieras hasta completarlo. En cuanto los tengamos, seguimos con los siguientes pasos de tu incorporación.\n\n¡Bienvenido/a al equipo! Estamos deseando empezar a trabajar contigo.\n\nUn saludo,\nPersonal4Pax\n\n${separador}\n${clausulaRgpd || CLAUSULA_RGPD_DOCUMENTACION_RESPALDO}\n${separador}`
  };
}
async function prepararConfirmacionContratacionCandidato(silencioso) {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  _candCorreoEsConfirmacionContratacion = true;
  _candDocumentacionToken = (c.documentacion_token && !c.documentacion_recibida_en) ? c.documentacion_token : crypto.randomUUID();
  const urlDocumentacion = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}documentacion-candidato.html?token=${_candDocumentacionToken}`;
  // César (07/11/2026, cuarta vuelta): CAUSA REAL encontrada — sb.rpc(...) de supabase-js no
  // devuelve una Promise de verdad, sino un "thenable" que solo implementa .then(), no .catch().
  // Llamar a .catch() directamente sobre eso explota con "sb.rpc(...).catch is not a function" —
  // y como nada capturaba esa excepción, el envío se paraba en seco sin avisar nada, exactamente
  // "no hace un carajo". Se usa la forma de dos argumentos de .then(), que sí existe siempre.
  const { data: clausulaRgpd } = await sb.rpc('_texto_clausula_rgpd_documentacion_incorporacion').then((r) => r, () => ({ data: null }));
  const plantilla = plantillaCorreoConfirmacionContratacion(c, urlDocumentacion, clausulaRgpd);
  $('candCorreoAsunto').value = plantilla.asunto;
  $('candCorreoCuerpo').value = plantilla.cuerpo;
  if (silencioso) return; // viene de confirmarContratacionYEnviar(): rellena y envía en el mismo clic, sin este aviso intermedio
  $('candCorreoCuerpo').scrollIntoView({ behavior: 'smooth', block: 'center' });
  const campoCorreo = $('candCorreoCuerpo');
  campoCorreo.style.transition = 'box-shadow .3s';
  campoCorreo.style.boxShadow = '0 0 0 3px #16a34a';
  setTimeout(() => { campoCorreo.style.boxShadow = ''; }, 1500);
  mostrarToast('✅ Correo de confirmación/documentación preparado más abajo — revísalo y pulsa "✉️ Enviar correo" para mandarlo (todavía no se ha enviado).', true);
}
// César (06/11/2026): "el botón confirmar contratación y solicitar documentación no funciona" —
// no estaba roto: rellenaba la plantilla pero exigía pulsar DESPUÉS "✉️ Enviar correo", un segundo
// clic en otro botón más abajo que pasaba desapercibido. Ahora el botón hace las dos cosas en un
// único clic (con confirmación antes de enviar). César (misma fecha, parte 7): "le di a enviar y
// como no hace nada, le di a enviar otra vez [...] debería avisar que ya está hecho" — el toast se
// perdía; ahora hay un aviso bloqueante (alert) imposible de pasar por alto, y el botón se
// deshabilita mientras envía para que un segundo clic no pueda duplicar el correo.
// César (06/11/2026): "le das a enviar y no hace nada [...] qué cojones pasa" — causa: tras muchas
// pruebas repetidas en la misma pestaña, Chrome empieza a bloquear en silencio los confirm()/alert()
// de esta página ("Evitar que esta página cree más cuadros de diálogo"); un confirm() bloqueado
// devuelve false al instante, sin mostrar nada, y la función se para en el "if (!confirm(...)) return;"
// de arriba — exactamente "le das a enviar y no hace nada". Se quita la dependencia de diálogos
// nativos (confirm/alert) en estos dos botones y se usa el mismo mostrarToast() de siempre, que es
// un aviso propio de la página y no puede ser silenciado por el navegador. Para no perder la
// confirmación antes de mandar un correo real, el primer clic deja el botón en modo "¿Seguro?" y
// solo al segundo clic (en los 6 segundos siguientes) se envía.
// César (07/11/2026, cuarta vuelta): "no quiero un puto aviso [...] quiero apretar el botón,
// enviarlo y ya está" — se quita del todo la confirmación en 2 clics (fue la fuente de todos los
// fallos de las vueltas anteriores: armado guardado en el botón, repintado que lo borraba, ventana
// de 6s demasiado corta…). Ahora un único clic envía directamente. Si algo falla de verdad (sin
// conexión, error de Supabase, lo que sea), SÍ se ve un aviso rojo explicando el motivo — pero ya
// no hay ningún paso intermedio de "¿Seguro?".
async function confirmarContratacionYEnviar(btn) {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  const textoOriginal = (btn && btn.tagName) ? btn.textContent : null;
  if (btn && btn.tagName) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  // César (07/11/2026, segunda vuelta): enviarCorreoGenericoCandidato() comprueba el OTRO botón, el
  // genérico "✉️ Enviar correo" de la caja de abajo (btnCandEnviarCorreo) — si ese está disabled por
  // cualquier motivo, se paraba en silencio. Este botón no pasa por esa caja, así que se fuerza a
  // que no esté bloqueado antes de llamar.
  if ($('btnCandEnviarCorreo')) $('btnCandEnviarCorreo').disabled = false;
  try {
    await prepararConfirmacionContratacionCandidato(true);
    await enviarCorreoGenericoCandidato();
    const actualizado = candidatosCache.find((x) => x.id === c.id);
    if (!actualizado || !actualizado.confirmacion_contratacion_enviada_en) {
      mostrarToast(`❌ El correo NO se ha enviado — revisa el aviso rojo para ver el motivo exacto.`, false);
    }
  } catch (err) {
    mostrarToast(`❌ Error inesperado al enviar: ${err && err.message ? err.message : err}`, false);
  } finally {
    if (btn && btn.tagName) { btn.disabled = false; btn.textContent = textoOriginal; }
  }
}
// César: "si ya tenemos la documentación, ¿no se la tenemos que volver a pedir? [...] eso se tiene
// que marcar" — alternativa al envío de correo, para cuando los 3 documentos ya constan en la ficha
// (p. ej. registrados a mano por RR.HH. antes de llegar a este paso): marca el paso 4 como hecho
// directamente, sin mandar un correo pidiendo documentación que ya está. Mismo cambio que arriba:
// confirmación en 2 clics con mostrarToast(), sin confirm()/alert() nativos.
async function marcarConfirmacionContratacionSinCorreo(btn) {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  const textoOriginal = (btn && btn.tagName) ? btn.textContent : null;
  if (btn && btn.tagName) { btn.disabled = true; btn.textContent = 'Marcando…'; }
  try {
    const { error } = await sb.from('candidatos').update({ confirmacion_contratacion_enviada_en: new Date().toISOString() }).eq('id', c.id);
    if (error) {
      mostrarToast('❌ Error al marcar el paso: ' + error.message, false);
      return;
    }
    await registrarAuditoria('Candidaturas', 'Confirmación de contratación marcada sin correo (documentación ya recibida)', c.nombre);
    await cargarCandidatosAdmin();
    abrirCandidatoModal(c.id);
    mostrarToast(`✅ Paso 4 marcado para ${c.nombre} — ya puedes enviar la documentación a gestoría (paso 5).`);
  } catch (err) {
    mostrarToast(`❌ Error inesperado al marcar: ${err && err.message ? err.message : err}`, false);
  } finally {
    if (btn && btn.tagName) { btn.disabled = false; btn.textContent = textoOriginal; }
  }
}
async function enviarCorreoGenericoCandidato() {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  const btn = $('btnCandEnviarCorreo');
  if (btn && btn.disabled) { mostrarToast('⏳ Espera a que termine el envío en curso e inténtalo otra vez.', false); return; }
  // César: "no tiene por qué volver a poner el correo electrónico" — el destinatario ya viene
  // relleno desde la ficha (abrirCandidatoModal) pero es editable aquí mismo; si falta, se escribe
  // directamente en este campo en vez de cortar el envío con un aviso que no deja hacer nada.
  const destinatario = $('candCorreoDestinatario').value.trim();
  const asunto = $('candCorreoAsunto').value.trim();
  const cuerpo = $('candCorreoCuerpo').value.trim();
  const esConfirmacionContratacion = _candCorreoEsConfirmacionContratacion;
  if (!destinatario || !asunto || !cuerpo) {
    mostrarToast('⚠️ Completa destinatario, asunto y cuerpo antes de enviar (o usa "Rellenar plantilla según estado")', false);
    return;
  }
  const textoBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    const { data: cc } = await sb.rpc('rrhh_emails_hotel');
    const { error } = await sb.rpc('enviar_correo_externo', {
      p_destinatario_email: destinatario,
      p_cc_email: cc || null,
      p_asunto: asunto,
      p_cuerpo: cuerpo,
      p_referencia_tabla: 'candidatos',
      p_referencia_id: c.id
    });
    if (error) {
      mostrarToast('Error al enviar el correo: ' + error.message, false);
      return;
    }
    const payloadSeguimiento = { contacto_email_enviado_en: new Date().toISOString() };
    // César (03/11/2026, cuarta vuelta): "no está siendo auto, es decir, no te pasa a la siguiente
    // fase" — al enviar un correo del tipo elegido en candCorreoTipo (📥/📅/🗣/✔️/✖, arriba), la
    // candidatura avanza sola a ese Estado, con la MISMA validación de "nunca retrocede" que ya usan
    // el desplegable de Estado y "💾 Guardar estado" (_candidatoPuedeAvanzarEstado) — si el tipo
    // elegido iría hacia atrás, el correo se envía igualmente pero el Estado se deja tal cual, sin
    // bloquear el envío por eso. El correo de confirmación de contratación (4.) sigue su propio
    // camino aparte (confirmacion_contratacion_enviada_en), no toca el Estado.
    let faseAvanzadaLbl = null;
    if (esConfirmacionContratacion) {
      payloadSeguimiento.confirmacion_contratacion_enviada_en = new Date().toISOString();
      // Solo se persiste el token si el envío del correo (el paso que de verdad falla o tiene
      // éxito) ha funcionado — igual que _candFase1Token en enviarFormularioFase1Candidato().
      if (_candDocumentacionToken) {
        payloadSeguimiento.documentacion_token = _candDocumentacionToken;
        payloadSeguimiento.documentacion_token_generado_en = new Date().toISOString();
      }
    } else {
      const tipoCorreo = $('candCorreoTipo') ? $('candCorreoTipo').value : null;
      if (tipoCorreo && CAND_PLANTILLAS_CORREO[tipoCorreo] && tipoCorreo !== c.estado && _candidatoPuedeAvanzarEstado(c.estado, tipoCorreo)) {
        payloadSeguimiento.estado = tipoCorreo;
        if (tipoCorreo === 'rechazado') {
          payloadSeguimiento.rechazado_fase = c.fecha_entrevista ? 'tras_entrevista' : 'sin_entrevista';
        }
        faseAvanzadaLbl = (CANDIDATO_ESTADOS[tipoCorreo] || ['—'])[0];
      }
    }
    await sb.from('candidatos').update(payloadSeguimiento).eq('id', c.id);
    _candCorreoEsConfirmacionContratacion = false;
    _candDocumentacionToken = null;
    mostrarToast(
      esConfirmacionContratacion
        ? 'Correo de confirmación y solicitud de documentación enviado ✓ — ya puedes dar de alta a la persona.'
        : (faseAvanzadaLbl ? `Correo enviado ✓ — candidatura avanzada a "${faseAvanzadaLbl}"` : 'Correo enviado ✓'),
      true
    );
    await registrarAuditoria('Candidaturas', esConfirmacionContratacion ? 'Correo de confirmación de contratación enviado' : 'Correo enviado', `${c.nombre} — ${asunto}`);
    await cargarCandidatosAdmin();
    abrirCandidatoModal(c.id);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
  }
}
async function darAltaDesdeCanditado(btn) {
  const c = candidatosCache.find((x) => x.id === currentCandidatoId);
  if (!c) return;
  const elegible = candidatoElegibleParaContratacion(c);
  if (!elegible) {
    mostrarToast(`⚠️ La entrevista debe alcanzar el umbral de adaptación (${umbralAdaptacionCandidatoCache}%) para poder crear la ficha.`, false);
    return;
  }
  if (!c.confirmacion_contratacion_enviada_en) {
    mostrarToast('⚠️ Antes de dar de alta hay que enviarle el correo de confirmación y solicitud de documentación («✉️ Confirmar contratación y solicitar documentación»).', false);
    return;
  }
  // César (sexta vuelta): "no se puede dar de alta si falta el DNI, si falta el certificado
  // bancario y si falta el número de seguridad social [...] esos tres documentos son los que se
  // tienen que enviar a la gestoría de manera automática también [...] Y ahí se crea la ficha" —
  // dos bloqueos nuevos, en el mismo orden en el que el proceso los exige ahora.
  if (!c.documentacion_recibida_en) {
    mostrarToast('⚠️ Antes de dar de alta hace falta recibir los 3 documentos de incorporación (DNI/NIE, nº de Seguridad Social y certificado bancario).', false);
    return;
  }
  if (!c.documentacion_enviada_gestoria_en) {
    mostrarToast('⚠️ Antes de dar de alta hay que enviar la documentación a gestoría («📤 Enviar documentación a gestoría»).', false);
    return;
  }
  // César (07/11/2026, mismo bloqueo ya resuelto en el paso 4 — commit "Quitar confirm()/alert()
  // nativos del paso 4 de contratación"): tras muchas pruebas seguidas en la misma pestaña, Chrome
  // bloquea en silencio los confirm()/alert() de la página; un confirm() bloqueado devuelve false
  // al instante sin mostrar nada, y la función se paraba justo aquí — exactamente el síntoma
  // reportado ("le doy al botón y no funciona"). Confirmación con un segundo clic sobre el propio
  // botón (mostrarToast(), que no puede ser silenciado por el navegador), igual que
  // confirmarContratacionYEnviar()/marcarConfirmacionContratacionSinCorreo().
  if (btn && btn.dataset.confirmando !== '1') {
    const textoOriginal = btn.textContent;
    btn._textoOriginal = textoOriginal;
    btn.dataset.confirmando = '1';
    btn.textContent = '¿Seguro? Pulsa otra vez';
    mostrarToast(`Vuelve a pulsar para dar de alta a ${c.nombre} como persona trabajadora.`);
    clearTimeout(btn._confirmTimeout);
    btn._confirmTimeout = setTimeout(() => {
      if (btn.dataset.confirmando === '1') { btn.dataset.confirmando = '0'; btn.textContent = textoOriginal; }
    }, 6000);
    return;
  }
  if (btn && btn.disabled) return;
  const textoBtnOriginal = btn ? (btn._textoOriginal || btn.textContent) : null;
  if (btn) { clearTimeout(btn._confirmTimeout); btn.dataset.confirmando = '0'; btn.disabled = true; btn.textContent = 'Dando de alta…'; }
  try {
    const dept = CANDIDATO_DEPARTAMENTOS.find((d) => d.puestoKey === c.puesto_key);
    // César (03/11/2026): "el código de empleado tiene que ser AAMMDD + nº de ese día, empieza en el
    // 00" (migración 0112, generar_codigo_empleado) — se calcula ANTES del insert porque la propia
    // fecha_primera_incorporacion que se está a punto de guardar (hoy) es la que la función usa.
    const fechaAlta = new Date().toISOString().slice(0, 10);
    const { data: codigoGenerado } = await sb.rpc('generar_codigo_empleado', { p_fecha: fechaAlta }).then((r) => r, () => ({ data: null }));
    const { data: nuevo, error } = await sb
      .from('personas_trabajadoras')
      .insert({
        hotel_id: usuarioActual.hotel_id,
        codigo: codigoGenerado || null,
        nombre: c.nombre,
        email: c.email,
        puesto: dept ? dept.label : c.puesto_label,
        puesto_key: c.puesto_key,
        departamento: dept ? dept.label.split(' (')[0] : null,
        estado_laboral: 'Activo',
        fecha_incorporacion: fechaAlta,
        fecha_primera_incorporacion: fechaAlta,
        dni_nie: c.dni_nie || null,
        direccion: c.direccion || null,
        seguridad_social: c.numero_seguridad_social || null,
        supervisor_nombre: _supervisorPorDefecto(dept ? dept.label.split(' (')[0] : null, c.puesto_key)
      })
      .select()
      .single();
    if (error) {
      mostrarToast('Error al dar de alta: ' + error.message, false);
      return;
    }
    await sb.from('candidatos').update({ estado: 'alta_realizada', trabajador_id: nuevo.id }).eq('id', currentCandidatoId);
    // César (07/11/2026): "en Mi Uniformidad y EPIs pone 'sin calzado asignado' [...] debería poner
    // qué le vamos a entregar a este trabajador, y son las dotaciones que salen en la previsión del
    // gasto [...] por trabajador" — epi_catalogo_puesto ya define qué le corresponde a cada
    // puesto_key (es la misma fuente que calcula el coste previsto); se generan aquí las entregas
    // pendientes de firma (la firma se registra cuando se entrega físicamente) para que la ficha
    // nueva no aparezca vacía.
    if (c.puesto_key) {
      const { data: catalogoPuesto } = await sb.from('epi_catalogo_puesto').select('*').eq('puesto_key', c.puesto_key);
      if (catalogoPuesto && catalogoPuesto.length) {
        await sb.from('epi_entregas').insert(
          catalogoPuesto.map((item) => ({
            hotel_id: usuarioActual.hotel_id,
            trabajador_id: nuevo.id,
            item: item.item,
            tipo: item.tipo,
            cantidad: item.cantidad || 1,
            fecha_entrega: fechaAlta,
            conformidad_firmada: false
          }))
        );
      }
    }
    // César: "este documento debería ser parte de la ficha del trabajador" — el consentimiento RGPD
    // que firmó como candidato/a se traslada a su ficha de documentos al darle de alta, para que
    // quede junto al resto de su expediente (y protegido por el mismo bloqueo de borrado de la
    // migración 0090, al ser ya un registro de "documentos").
    if (c.consentimiento_rgpd_texto || c.consentimiento_rgpd_en) {
      await sb.from('documentos').insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: nuevo.id,
        tipo: 'consentimiento_rgpd_candidatura',
        nombre: 'Consentimiento RGPD — proceso de selección',
        meta: JSON.stringify({
          origen: c.origen,
          aceptado_en: c.consentimiento_rgpd_en,
          version_clausula: c.consentimiento_rgpd_version,
          bolsa_empleo: c.consentimiento_bolsa_empleo,
          texto: c.consentimiento_rgpd_texto
        }),
        fecha: (c.consentimiento_rgpd_en || new Date().toISOString()).slice(0, 10)
      });
    }
    // César: "darle la posibilidad de adjuntar un cv [...] debería ser parte de la ficha del
    // trabajador" — igual que el consentimiento RGPD, el CV adjuntado durante la candidatura se
    // traslada a Mis Documentos de la nueva ficha.
    if (c.cv_adjunto_url) {
      await sb.from('documentos').insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: nuevo.id,
        tipo: 'cv',
        nombre: `CV — ${c.cv_nombre_archivo || 'candidatura'}`,
        meta: 'Adjuntado durante el proceso de selección',
        adjunto_url: c.cv_adjunto_url
      });
    }
    // César (02/11/2026): "toda la información relevante, correspondiente y archivos de este
    // empleado se tienen que volcar en su ficha de manera automática" — el DNI/NIE y el certificado
    // bancario solicitados en el correo de confirmación (si ya se habían registrado en la
    // candidatura) se trasladan igual que el CV, para no tener que volver a pedirlos ni adjuntarlos
    // a mano una segunda vez.
    if (c.dni_nie_adjunto_url) {
      await sb.from('documentos').insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: nuevo.id,
        tipo: 'dni_nie',
        nombre: `DNI/NIE — ${c.dni_nie_adjunto_nombre || 'candidatura'}`,
        meta: 'Adjuntado durante el proceso de selección',
        adjunto_url: c.dni_nie_adjunto_url
      });
    }
    if (c.certificado_bancario_adjunto_url) {
      await sb.from('documentos').insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: nuevo.id,
        tipo: 'certificado_bancario',
        nombre: `Certificado bancario — ${c.certificado_bancario_adjunto_nombre || 'candidatura'}`,
        meta: 'Adjuntado durante el proceso de selección',
        adjunto_url: c.certificado_bancario_adjunto_url
      });
    }
    // César: "necesito que el director de RR.HH. sepa [...] cómo han hecho las entrevistas, cuáles
    // han sido los resultados [...] cómo han llegado a la conclusión de contratar a las personas" —
    // el desglose completo de los 104 criterios se guarda como documento legible de la nueva ficha,
    // para no perder el rastro de cómo se decidió la contratación una vez cerrada la candidatura.
    if (c.entrevista_respuestas) {
      await sb.from('documentos').insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: nuevo.id,
        tipo: 'entrevista_estructurada',
        nombre: `Entrevista estructurada — resultado ${c.puntuacion_adaptacion ?? '—'}% (${c.resultado_entrevista_categoria || categoriaResultadoEntrevista(c.puntuacion_adaptacion, umbralAdaptacionCandidatoCache) || '—'})`,
        meta: _resumenEntrevistaEstructuradaTexto(c),
        fecha: (c.entrevista_evaluado_en || new Date().toISOString()).slice(0, 10)
      });
    }
    mostrarToast(`${c.nombre} dado de alta ✓ — expediente completo trasladado a su ficha.`, true);
    cerrarCandidatoModal();
    await Promise.all([cargarCandidatosAdmin(), cargarEmpleados()]);
    await registrarAuditoria('Candidaturas', 'Alta automática de ficha', c.nombre);
    // César (03/11/2026, B: "automatizar con Edge Function"): hasta ahora, crear el acceso
    // (usuario/clave) de la persona trabajadora nueva era un paso manual en el Dashboard de Supabase
    // — ya no. crear-cuenta-trabajador() crea la cuenta, la enlaza a esta ficha, prepara el
    // consentimiento inicial (se firma en el primer acceso con firmar_documento(), migración 0074) y
    // encola el correo de bienvenida con la clave provisional. Si falla, la ficha YA está creada y
    // completa — esto es un paso adicional, nunca bloquea el alta en sí (igual que el envío a Mis
    // Documentos del evaluador, migración 0089).
    const { error: errorCuenta } = await sb.functions.invoke('crear-cuenta-trabajador', { body: { trabajador_id: nuevo.id } });
    if (errorCuenta) {
      mostrarToast(`⚠️ Ficha creada, pero no se pudo crear el acceso automáticamente: ${errorCuenta.message || errorCuenta}. Créalo a mano desde Supabase → Authentication y enlaza el user_id en la ficha.`, false);
    } else {
      mostrarToast('Acceso creado ✓ Correo de bienvenida con la clave en camino.', true);
    }
  } catch (e) {
    mostrarToast('❌ Error inesperado al dar de alta: ' + (e && e.message ? e.message : e), false);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoBtnOriginal; }
  }
}
// Texto legible (no JSON) del resultado de la Entrevista Estructurada, para el documento que se
// archiva en la ficha de la persona trabajadora al darla de alta — reutiliza ENTREVISTA_PREGUNTAS/
// ENTREVISTA_BLOQUES, igual que el expediente completo y el checklist en vivo.
function _resumenEntrevistaEstructuradaTexto(c) {
  const respuestas = c.entrevista_respuestas || {};
  const NOTA_TXT = { 1: '1 · Poco', 2: '2 · Bastante', 3: '3 · Idóneo' };
  const lineas = [`Resultado: ${c.puntuacion_adaptacion ?? '—'}% de adaptación (${c.entrevista_puntos_obtenidos ?? '—'}/${c.entrevista_puntos_maximos ?? '—'} puntos) — ${c.resultado_entrevista_categoria || '—'}`,
    `Evaluado por ${c.entrevista_evaluador || '—'} el ${c.entrevista_evaluado_en ? new Date(c.entrevista_evaluado_en).toLocaleString('es-ES') : '—'}`, ''];
  ENTREVISTA_PREGUNTAS.forEach((p) => {
    lineas.push(`${p.id}. ${p.pregunta}`);
    const prev = respuestas[p.id] || respuestas[String(p.id)] || {};
    ENTREVISTA_BLOQUES.forEach(([key, label]) => {
      (p.criterios[key] || []).forEach((criterio, idx) => {
        const v = prev[key] && prev[key][idx] != null ? prev[key][idx] : null;
        lineas.push(`  - [${label}] ${criterio}: ${v ? NOTA_TXT[v] : '— sin puntuar —'}`);
      });
    });
  });
  return lineas.join('\n');
}

// ---------- QR de candidatura pública ----------
// César: "Al haber un candidato: documento de gestión de datos, debería acceder por medio de un
// QR para rellenarlo [...] que sea un formulario que se guarde en este módulo de la APP." El QR
// apunta a candidatura.html (misma carpeta que index.html en el despliegue de Cloudflare Pages,
// página pública sin login) con el hotel_id de este hotel — así el formulario de autoservicio
// inserta directamente en "candidatos" (migración 0091) sin tocar el alta manual existente.
function abrirQrCandidaturaModal() {
  const url = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}candidatura.html?hotel=${usuarioActual.hotel_id}`;
  $('qrCandidaturaUrl').value = url;
  if (typeof qrcode === 'function') {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    $('qrCandidaturaCanvas').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 8 });
  } else {
    $('qrCandidaturaCanvas').innerHTML = '<p class="sub-c">No se ha podido generar el QR (librería no cargada) — usa el enlace de abajo.</p>';
  }
  $('modalQrCandidatura').classList.remove('hidden');
}
function cerrarQrCandidaturaModal() {
  $('modalQrCandidatura').classList.add('hidden');
}
function copiarEnlaceCandidatura() {
  const url = $('qrCandidaturaUrl').value;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => mostrarToast('Enlace copiado ✓', true)).catch(() => mostrarToast('No se ha podido copiar — selecciona y copia el enlace a mano.', false));
  } else {
    $('qrCandidaturaUrl').select();
    mostrarToast('Enlace seleccionado — copia con Ctrl/Cmd+C.', true);
  }
}
function imprimirQrCandidatura() {
  const w = window.open('', '_blank');
  if (!w) {
    mostrarToast('El navegador ha bloqueado la ventana de impresión — permite las ventanas emergentes para este sitio.', false);
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>QR — Candidatura</title></head>
    <body style="text-align:center;font-family:sans-serif;padding:40px;">
    <h2 style="margin-bottom:4px;">Candidatura — escanea para aplicar</h2>
    <p style="color:#64748b;font-size:13px;margin-bottom:20px;">${(usuarioActual && usuarioActual.hotel_nombre) || ''}</p>
    ${$('qrCandidaturaCanvas').innerHTML}
    <p style="font-size:11px;color:#64748b;word-break:break-all;margin-top:16px;">${$('qrCandidaturaUrl').value}</p>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ---------- Búsqueda de candidaturas anteriores por correo ----------
// César: "para que en un futuro, si vuelven a contactar, ya tener ese registro" — localiza
// cualquier candidatura previa (incluidas las ya resueltas) de ese correo, sin esperar a abrir
// cada ficha una por una.
async function buscarCandidatoPorEmailAdmin() {
  const termino = ($('candBuscarEmailInput').value || '').trim();
  if (!termino) {
    $('candBuscarEmailResultados').innerHTML = '<p class="sub-c" style="padding:10px 2px;">Escribe un correo electrónico (o parte de él) para buscar candidaturas anteriores.</p>';
    return;
  }
  const { data, error } = await sb.from('candidatos').select('*').ilike('email', `%${termino}%`).order('created_at', { ascending: false }).limit(20);
  if (error) {
    $('candBuscarEmailResultados').innerHTML = `<p class="sub-c" style="padding:10px 2px;color:var(--rose-600);">Error: ${error.message}</p>`;
    return;
  }
  if (!data || !data.length) {
    $('candBuscarEmailResultados').innerHTML = '<p class="sub-c" style="padding:10px 2px;">Sin candidaturas anteriores con ese correo (o ya caducaron y se anonimizaron — RGPD).</p>';
    return;
  }
  $('candBuscarEmailResultados').innerHTML = data
    .map((c) => {
      const est = CANDIDATO_ESTADOS[c.estado] || ['—', 'b-slate'];
      return `<div style="padding:9px 0;border-bottom:1px solid var(--slate-100);display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <div><b style="font-size:12.5px;">${c.nombre}</b><p class="sub-c" style="margin:2px 0 0;">${c.puesto_label || '—'} · ${fechaCorta(c.fecha_solicitud)}</p></div>
        <span class="badge2 ${est[1]}">${est[0]}</span>
      </div>`;
    })
    .join('');
}

// ---------- Llamamientos y Fin de Llamamiento (fijos discontinuos) ----------
// César: módulo nuevo a partir del "Prompt Maestro" pegado — ver migración 0092 y el bloque
// "📖 Memoria breve de la normativa aplicada" en la propia pantalla para el detalle de las 2
// correcciones legales hechas sobre el prompt original (art. 16.3→16.6 ET, e interpretación
// invertida de la STS 255/2025) antes de construir este motor. El orden de llamamiento/cese por
// antigüedad es aquí un CRITERIO POR DEFECTO (configurable vía "salta orden" + justificación),
// no un mandato legal cerrado — el art. 16 ET delega esa decisión en convenio/acuerdo de empresa.
const LLAMAMIENTO_ESTADOS = {
  borrador: ['📝 Borrador', 'b-slate'],
  enviado: ['✉️ Enviado', 'b-amber'],
  pendiente_firma: ['✍️ Pendiente de firma', 'b-indigo'],
  firmado: ['✔️ Firmado', 'b-sky'],
  enviado_gestoria: ['📤 Enviado a gestoría', 'b-amber'],
  cerrado: ['🏁 Cerrado', 'b-emerald'],
  declinado: ['🚫 Declinado', 'b-rose']
};
let llamamientosCache = [];
let escalafonCache = [];
let llamamientosParametrosCache = {};
let currentLlamamientoId = null;

async function cargarLlamamientosAdmin() {
  const [{ data: expedientes }, { data: escalafon }, { data: params }] = await Promise.all([
    sb.from('llamamientos').select('*, personas_trabajadoras(nombre, puesto, puesto_key)').order('created_at', { ascending: false }),
    sb.from('escalafon_fijos_discontinuos').select('*').order('departamento').order('posicion_escalafon'),
    sb.from('coef_parametros').select('dias_preaviso_llamamiento, dias_preaviso_fin_llamamiento, email_auditoria_llamamientos, dias_duracion_temporada_defecto').eq('hotel_id', usuarioActual.hotel_id).maybeSingle()
  ]);
  llamamientosCache = expedientes || [];
  escalafonCache = escalafon || [];
  llamamientosParametrosCache = params || {};
  if ($('llamParamPreavisoLlamamiento')) $('llamParamPreavisoLlamamiento').value = params && params.dias_preaviso_llamamiento != null ? params.dias_preaviso_llamamiento : 7;
  if ($('llamParamPreavisoFin')) $('llamParamPreavisoFin').value = params && params.dias_preaviso_fin_llamamiento != null ? params.dias_preaviso_fin_llamamiento : 7;
  if ($('llamParamEmailAuditoria')) $('llamParamEmailAuditoria').value = (params && params.email_auditoria_llamamientos) || '';
  if ($('llamParamDuracionTemporada')) $('llamParamDuracionTemporada').value = params && params.dias_duracion_temporada_defecto != null ? params.dias_duracion_temporada_defecto : '';

  const abiertos = llamamientosCache.filter((l) => l.estado !== 'cerrado' && l.estado !== 'declinado').length;
  const pendientesFirma = llamamientosCache.filter((l) => l.estado === 'pendiente_firma').length;
  $('llamamientosKpis').innerHTML = `
    <div class="card kpi"><div class="ic">📣</div><div><div class="t">Expedientes abiertos</div><div class="v">${abiertos}</div></div></div>
    <div class="card kpi"><div class="ic">✍️</div><div><div class="t">Pendientes de firma</div><div class="v">${pendientesFirma}</div></div></div>
    <div class="card kpi"><div class="ic">👥</div><div><div class="t">Fijos discontinuos en escalafón</div><div class="v">${escalafonCache.length}</div></div></div>`;

  $('escalafonBody').innerHTML = escalafonCache.map((e) => `<tr>
      <td>${e.posicion_escalafon}</td>
      <td>${e.nombre}</td>
      <td>${e.departamento || '—'}</td>
      <td>${e.puesto || e.puesto_key || '—'}</td>
      <td>${e.antiguedad_anos != null ? e.antiguedad_anos : '—'}</td>
      <td>${fechaCorta(e.fecha_primera_incorporacion)}</td>
    </tr>`).join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">No se ha detectado personal fijo discontinuo (revisa "Tipo de contrato" en Seguimiento del contrato).</td></tr>';

  $('llamamientosBody').innerHTML = llamamientosCache.map((l) => {
    const est = LLAMAMIENTO_ESTADOS[l.estado] || ['—', 'b-slate'];
    // César (captura 5, fase 5): fila con el nombre en blanco ("—") — si ocurre, es que la persona
    // trabajadora de trabajador_id ya no es visible para esta consulta (posible dato de prueba
    // huérfano); se deja el id a la vista en el title para poder localizarla en Supabase.
    const nombre = l.personas_trabajadoras ? l.personas_trabajadoras.nombre : `<span title="trabajador_id: ${l.trabajador_id}">— (sin datos)</span>`;
    return `<tr>
      <td><b>${nombre}</b>${l.salta_orden ? ' <span class="badge2 b-rose" title="Fuera de orden de antigüedad">⚠️ Fuera de orden</span>' : ''}</td>
      <td>${l.tipo === 'fin_llamamiento' ? '🔚 Fin de llamamiento' : '📣 Llamamiento'}</td>
      <td>${l.bloque || l.puesto_key || '—'}</td>
      <td>${fechaCorta(l.fecha_prevista)}</td>
      <td><span class="badge2 ${est[1]}">${est[0]}</span></td>
      <td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirLlamamientoGestionModal('${l.id}')">Ver / gestionar</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Todavía no se ha creado ningún expediente de llamamiento.</td></tr>';

  // César (fase 7): "debería ser un listado de expediente aparte, en expedientes firmados" — solo
  // entran aquí los que de verdad firmó/respondió la propia persona desde su app (respuesta_
  // trabajador_en real, migración 0099), nunca los marcados a mano por RR.HH. como atajo.
  const firmadosDigitalmente = llamamientosCache.filter((l) => l.respuesta_trabajador_en);
  $('llamFirmadosBody').innerHTML = firmadosDigitalmente.map((l) => {
    const nombre = l.personas_trabajadoras ? l.personas_trabajadoras.nombre : '—';
    const acepta = l.respuesta_trabajador_tipo === 'acepta';
    const est = LLAMAMIENTO_ESTADOS[l.estado] || ['—', 'b-slate'];
    return `<tr>
      <td><b>${nombre}</b></td>
      <td>${l.tipo === 'fin_llamamiento' ? '🔚 Fin de llamamiento' : '📣 Llamamiento'}</td>
      <td><span class="badge2 ${acepta ? 'b-emerald' : 'b-rose'}">${acepta ? '✅ Aceptó' : '🚫 Declinó'}</span></td>
      <td>${new Date(l.respuesta_trabajador_en).toLocaleString('es-ES')}</td>
      <td><span class="badge2 ${est[1]}">${est[0]}</span></td>
      <td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirLlamamientoGestionModal('${l.id}')">Ver</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Todavía no ha firmado nadie desde su propia app.</td></tr>';
}

async function actualizarParametrosLlamamiento() {
  const preLlam = Math.max(1, parseInt($('llamParamPreavisoLlamamiento').value, 10) || 7);
  const preFin = Math.max(1, parseInt($('llamParamPreavisoFin').value, 10) || 7);
  const email = $('llamParamEmailAuditoria').value.trim() || null;
  // César: "¿qué diferencia hay que lo pongas la fecha del fin de llamamiento a mano? O si lo
  // puedes echar predeterminado por el tiempo de duración" — opcional, sin forzar nada; vacío =
  // sigue habiendo que escribir la fecha a mano, como hasta ahora.
  const duracionRaw = $('llamParamDuracionTemporada').value.trim();
  const duracion = duracionRaw ? Math.max(1, parseInt(duracionRaw, 10) || 1) : null;
  // La STS 255/2025 anuló un preaviso de 48h (2 días) por insuficiente — el sistema avisa, pero no
  // lo impide (puede haber causas de urgencia que el convenio/acuerdo de empresa sí amparen).
  if (preLlam < 5) mostrarToast('⚠️ Ojo: la STS 255/2025 consideró insuficiente un preaviso de 48h (2 días) — se guarda igualmente, pero se recomienda no bajar de 5 días naturales.', true);
  const { error } = await sb.from('coef_parametros').upsert({ hotel_id: usuarioActual.hotel_id, dias_preaviso_llamamiento: preLlam, dias_preaviso_fin_llamamiento: preFin, email_auditoria_llamamientos: email, dias_duracion_temporada_defecto: duracion }, { onConflict: 'hotel_id' });
  if (error) {
    mostrarToast('Error al guardar: ' + error.message, false);
    return;
  }
  mostrarToast('Parámetros de llamamiento actualizados ✓', true);
  await registrarAuditoria('Llamamientos', 'Parámetros de preaviso/auditoría actualizados', `Llamamiento: ${preLlam}d · Fin: ${preFin}d · CC auditoría: ${email || '—'} · Duración temporada: ${duracion != null ? duracion + 'd' : '—'}`);
  await cargarLlamamientosAdmin();
}

// ---- Creación de expediente(s) ----
function abrirLlamamientoNuevoModal(tipo) {
  $('formLlamamientoNuevo').reset();
  $('llamNuevoTipo').value = tipo;
  $('llamNuevoTitulo').textContent = tipo === 'fin_llamamiento' ? 'Nuevo fin de llamamiento' : 'Nuevo llamamiento';
  $('llamNuevoFechaLabelExtra').textContent = tipo === 'fin_llamamiento' ? '(fecha de cese)' : '(fecha de inicio)';
  // César (captura 4, fase 6): "en donde pone puesto debería ser departamento [...] no es coherente
  // que ponga puesto, cocinera, y salgan los otros trabajadores del departamento" — el selector
  // agrupa por departamento (campo real de personas_trabajadoras), no por puesto/categoría; el
  // escalafón (migración 0097) ya calcula el orden de antigüedad a ese mismo nivel.
  const departamentos = [...new Set(escalafonCache.map((e) => e.departamento).filter(Boolean))].sort();
  $('llamNuevoPuesto').innerHTML = departamentos.length
    ? departamentos.map((d) => `<option value="${d}">${d}</option>`).join('')
    : '<option value="">— Sin fijos discontinuos detectados —</option>';
  // César: "no debería permitir que pongas una fecha pasada, y sí que lo permite" — min=hoy en el
  // selector de fecha por defecto (el de cada persona se fija en renderEscalafonSelectorModal, que
  // se ejecuta justo después); guardarLlamamientoNuevo valida igual por si se evita el atributo.
  const hoyIso = new Date().toISOString().slice(0, 10);
  $('llamNuevoFecha').min = hoyIso;
  renderEscalafonSelectorModal();
  $('modalLlamamientoNuevo').classList.remove('hidden');
}
function cerrarLlamamientoNuevoModal() {
  $('modalLlamamientoNuevo').classList.add('hidden');
}
let _llamEscalafonOrdenado = [];
// César (captura 5, fase 5): "si ya has hecho el llamamiento del asterisco 1, debería poder hacer
// el llamamiento al asterisco 2 [...] ya no debería salir si las personas que ya has hecho
// llamamiento" — busca si esta persona ya tiene un expediente NO declinado de este MISMO tipo
// (llamamiento Y fin de llamamiento se controlan por separado). "Declinado" no cuenta como "ya
// hecho": si declinó, puede volver a necesitarse un nuevo expediente.
function personaLlamamientoExistente(trabajadorId, tipo) {
  const existentes = llamamientosCache.filter((l) => l.trabajador_id === trabajadorId && l.tipo === tipo && l.estado !== 'declinado');
  if (!existentes.length) return null;
  return existentes.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
}
// César (captura 5, fase 6): "para hacer el fin de llamamiento que figuren los que hemos
// convocado" — solo tiene sentido cesar a quien de verdad está activo por un llamamiento previo
// (convocado y todavía no declinado ni cerrado); si nunca se le llamó, no puede aparecer en el
// selector de "Nuevo fin de llamamiento".
function personaTieneLlamamientoActivo(trabajadorId) {
  return llamamientosCache.some((l) => l.trabajador_id === trabajadorId && l.tipo === 'llamamiento' && l.estado !== 'declinado' && l.estado !== 'cerrado');
}
function renderEscalafonSelectorModal() {
  const departamento = $('llamNuevoPuesto').value;
  const tipo = $('llamNuevoTipo').value;
  // César (fase 7): "¿qué diferencia hay que lo pongas la fecha del fin de llamamiento a mano? O si
  // lo puedes echar predeterminado por el tiempo de duración" — si hay una duración configurada
  // (parámetro opcional) se SUGIERE la fecha de cese de cada persona (fecha de su llamamiento activo
  // + esos días); nunca sustituye la edición manual, solo precarga el campo.
  const duracionTemporada = llamamientosParametrosCache.dias_duracion_temporada_defecto;
  let lista = escalafonCache.filter((e) => e.departamento === departamento);
  if (tipo === 'fin_llamamiento') lista = lista.filter((e) => personaTieneLlamamientoActivo(e.trabajador_id));
  // Llamamiento: se llama de más antiguo a más reciente (posicion_escalafon asc). Fin de
  // llamamiento: se cesa en orden inverso de antigüedad — el más reciente primero (art. 16 ET).
  const ordenados = tipo === 'fin_llamamiento' ? [...lista].sort((a, b) => b.posicion_escalafon - a.posicion_escalafon) : [...lista].sort((a, b) => a.posicion_escalafon - b.posicion_escalafon);
  _llamEscalafonOrdenado = ordenados;
  const fechaDefecto = $('llamNuevoFecha').value || '';
  const hoyIso = new Date().toISOString().slice(0, 10);
  // César: "poder marcar uno a uno y luego marcar cuáles queremos, para qué fechas" — cada persona
  // tiene su propia fecha (no una única compartida); "Fecha prevista por defecto" solo la
  // precarga, y "Aplicar a todas" la copia a las ya marcadas si se quiere. Ahora también se muestra
  // la fecha de inicio (fecha_primera_incorporacion) junto a la antigüedad calculada a partir de
  // ella, para poder comprobarla de un vistazo (captura 4: "hace falta la fecha de inicio").
  //
  // Quien ya tiene un expediente de este tipo (no declinado) se muestra como YA GESTIONADO, sin
  // casilla ni fecha: no se puede volver a marcar por error y, al no tener casilla, tampoco cuenta
  // como "falta" para bloquear a los siguientes en comprobarSaltaOrdenModal/guardarLlamamientoNuevo
  // (que solo recorren las casillas realmente presentes en el DOM) — así el circuito avanza sin el
  // falso aviso de "fuera de orden" contra alguien a quien ya se le hizo el llamamiento. Si ESE
  // expediente ya existente se creó a su vez fuera de orden, se señala con el mismo badge que usa
  // la tabla principal — para poder auditarlo de un vistazo ("¿cumple la normativa?").
  $('llamNuevoPersonasSelector').innerHTML = ordenados.length
    ? ordenados.map((e, i) => {
        const cabecera = `${i === 0 ? '🔝 ' : ''}#${i + 1} — ${e.nombre} — ${e.puesto || '—'} · antigüedad ${e.antiguedad_anos != null ? e.antiguedad_anos + ' años' : '—'} · desde ${fechaCorta(e.fecha_primera_incorporacion)}`;
        const existente = personaLlamamientoExistente(e.trabajador_id, tipo);
        if (existente) {
          const est = LLAMAMIENTO_ESTADOS[existente.estado] || ['—', 'b-slate'];
          return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;flex-wrap:wrap;opacity:.8;">
              <span style="flex:1;min-width:260px;">✅ ${cabecera} — <span class="badge2 ${est[1]}">Ya gestionado · ${est[0]} · ${fechaCorta(existente.fecha_prevista)}</span>${existente.salta_orden ? ' <span class="badge2 b-rose" title="Ese expediente se creó fuera de orden de antigüedad">⚠️ Fuera de orden</span>' : ''}</span>
              <button type="button" class="btn btn-secondary btn-sm" onclick="cerrarLlamamientoNuevoModal();abrirLlamamientoGestionModal('${existente.id}')">Ver expediente</button>
            </div>`;
        }
        let filaFecha = fechaDefecto;
        let esSugerida = false;
        if (!filaFecha && tipo === 'fin_llamamiento' && duracionTemporada) {
          const llamActivo = personaLlamamientoExistente(e.trabajador_id, 'llamamiento');
          if (llamActivo && llamActivo.fecha_prevista) {
            const d = new Date(llamActivo.fecha_prevista);
            d.setDate(d.getDate() + duracionTemporada);
            const sugerida = d.toISOString().slice(0, 10);
            filaFecha = sugerida < hoyIso ? hoyIso : sugerida;
            esSugerida = true;
          }
        }
        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:8px;font-weight:400;flex:1;min-width:260px;margin:0;">
              <input type="checkbox" class="llam-persona-check" value="${e.trabajador_id}" data-indice="${i}" onchange="comprobarSaltaOrdenModal()">
              <span>${cabecera}${esSugerida ? ' <span class="badge2 b-slate" title="Sugerida: inicio del llamamiento + duración de temporada configurada — editable">💡 sugerida</span>' : ''}</span>
            </label>
            <input type="date" class="llam-persona-fecha" data-trabajador="${e.trabajador_id}" min="${hoyIso}" value="${filaFecha}" style="margin:0;width:150px;">
          </div>`;
      }).join('')
    : `<p class="sub-c" style="margin:0;">${tipo === 'fin_llamamiento' ? 'No hay nadie convocado (con llamamiento activo) en este departamento.' : 'No hay personas fijas discontinuas en este departamento.'}</p>`;
  $('llamNuevoSaltaOrdenWrap').style.display = 'none';
}
// César: "explica mejor por qué, criterio y normativa [...] que la app te sugiera qué es lo que
// tienes que hacer [...] que puedas pinchar en estas opciones y ya se pueda cargar esa
// información" — una persona está "fuera de orden" si hay alguien con más antigüedad en el mismo
// puesto (posición anterior en el escalafón) que todavía NO está marcado; se explica exactamente
// a quién le tocaría antes, por qué (criterio por defecto + base legal) y se ofrece un botón para
// añadirla directamente a la selección, en vez de solo avisar del error.
function comprobarSaltaOrdenModal() {
  const filas = Array.from(document.querySelectorAll('.llam-persona-check')); // orden = orden del escalafón
  const marcadas = filas.filter((f) => f.checked);
  if (!marcadas.length) {
    $('llamNuevoSaltaOrdenWrap').style.display = 'none';
    return;
  }
  const ultimoIndiceMarcado = Math.max(...marcadas.map((f) => parseInt(f.dataset.indice, 10)));
  const faltantes = filas.filter((f) => parseInt(f.dataset.indice, 10) < ultimoIndiceMarcado && !f.checked);
  if (!faltantes.length) {
    $('llamNuevoSaltaOrdenWrap').style.display = 'none';
    return;
  }
  const tipo = $('llamNuevoTipo').value;
  const criterioTexto = tipo === 'fin_llamamiento' ? 'menos antigüedad (se cesa primero a quien se incorporó más tarde)' : 'más antigüedad (se llama primero a quien se incorporó antes)';
  const nombres = faltantes.map((f) => {
    const e = _llamEscalafonOrdenado[parseInt(f.dataset.indice, 10)];
    return `${e.nombre} (#${parseInt(f.dataset.indice, 10) + 1}, antigüedad ${e.antiguedad_anos != null ? e.antiguedad_anos + ' años' : '—'})`;
  });
  $('llamNuevoSaltaOrdenExplicacion').innerHTML =
    `⚠️ Según el escalafón, antes que alguna de las personas marcadas debería ir: <b>${nombres.join(', ')}</b> — tiene${faltantes.length > 1 ? 'n' : ''} ${criterioTexto}. ` +
    'Este orden es el criterio POR DEFECTO (el art. 16 ET remite el criterio exacto al convenio colectivo o, en su defecto, al acuerdo de empresa — no es un mandato cerrado), así que puedes saltarlo, pero debes justificarlo y quedará en auditoría.';
  $('llamNuevoSugerencias').innerHTML =
    faltantes
      .map((f) => {
        const idx = parseInt(f.dataset.indice, 10);
        const e = _llamEscalafonOrdenado[idx];
        return `<button type="button" class="btn btn-secondary btn-sm" style="text-align:left;" onclick="añadirFaltanteEscalafonModal('${e.trabajador_id}')">✅ Opción: marcar también a ${e.nombre} (#${idx + 1}) — respeta el orden</button>`;
      })
      .join('') + '<span class="sub-c">— o deja la selección así y escribe la justificación del salto de orden más abajo.</span>';
  $('llamNuevoSaltaOrdenWrap').style.display = '';
}
function añadirFaltanteEscalafonModal(trabajadorId) {
  const check = document.querySelector(`.llam-persona-check[value="${trabajadorId}"]`);
  if (!check) return;
  check.checked = true;
  const fechaDefecto = $('llamNuevoFecha').value;
  const fechaInput = document.querySelector(`.llam-persona-fecha[data-trabajador="${trabajadorId}"]`);
  if (fechaInput && !fechaInput.value && fechaDefecto) fechaInput.value = fechaDefecto;
  comprobarSaltaOrdenModal();
}
function aplicarFechaATodasLlamamiento() {
  const fechaDefecto = $('llamNuevoFecha').value;
  if (!fechaDefecto) {
    mostrarToast('⚠️ Indica primero la fecha prevista por defecto', false);
    return;
  }
  const marcados = Array.from(document.querySelectorAll('.llam-persona-check')).filter((c) => c.checked);
  if (!marcados.length) {
    mostrarToast('⚠️ Marca antes a las personas a las que quieras aplicar la fecha', false);
    return;
  }
  marcados.forEach((c) => {
    const fechaInput = document.querySelector(`.llam-persona-fecha[data-trabajador="${c.value}"]`);
    if (fechaInput) fechaInput.value = fechaDefecto;
  });
  mostrarToast(`Fecha aplicada a ${marcados.length} persona(s) marcada(s) ✓`, true);
}
// César (captura 5, fase 5): "se crea dos veces [...] no necesitamos que se estén duplicando las
// cosas" — guarda de reentrada: si el envío anterior todavía está en vuelo (por doble pulsación/
// doble toque en móvil, o por el evento "submit" ya encolado antes de que el botón se deshabilite),
// esta nueva llamada se ignora en vez de disparar un segundo insert.
let _guardandoLlamamientoNuevo = false;
async function guardarLlamamientoNuevo(e) {
  e.preventDefault();
  if (_guardandoLlamamientoNuevo) return;
  _guardandoLlamamientoNuevo = true;
  try {
    const tipo = $('llamNuevoTipo').value;
    const departamento = $('llamNuevoPuesto').value;
    const filas = Array.from(document.querySelectorAll('.llam-persona-check'));
    const marcados = filas.filter((c) => c.checked);
    if (!marcados.length) {
      mostrarToast('⚠️ Selecciona al menos una persona', false);
      return;
    }
    const sinFecha = marcados.filter((c) => {
      const f = document.querySelector(`.llam-persona-fecha[data-trabajador="${c.value}"]`);
      return !f || !f.value;
    });
    if (sinFecha.length) {
      mostrarToast('⚠️ Indica la fecha prevista de cada persona marcada (o usa "Aplicar a todas las marcadas")', false);
      return;
    }
    // César: "no debería permitir que pongas una fecha pasada, y sí que lo permite" — el atributo
    // min=hoy de los inputs es un primer freno, pero no basta (se puede sortear); se valida también
    // aquí antes de insertar nada.
    const hoyIso = new Date().toISOString().slice(0, 10);
    const conFechaPasada = marcados.filter((c) => {
      const f = document.querySelector(`.llam-persona-fecha[data-trabajador="${c.value}"]`);
      return f && f.value < hoyIso;
    });
    if (conFechaPasada.length) {
      mostrarToast('⚠️ La fecha prevista no puede ser anterior a hoy — revisa la fecha de cada persona marcada.', false);
      return;
    }
    // Una fila está "fuera de orden" si, en el escalafón, hay alguien con más antigüedad (índice
    // ANTERIOR, no posición anterior en la lista de casillas) que todavía no está marcado — igual
    // que comprobarSaltaOrdenModal(). Comparar por data-indice (y no por posición dentro de "filas")
    // es necesario porque quien ya tiene expediente ("Ya gestionado") ya no tiene casilla: deja un
    // hueco en los índices que "filas.slice(0, idx)" interpretaba mal y que causaba el aviso de
    // "fuera de orden" contra alguien al que ya se le había hecho el llamamiento.
    const rowSaltaOrden = (fila) => {
      const idx = parseInt(fila.dataset.indice, 10);
      return filas.some((f) => parseInt(f.dataset.indice, 10) < idx && !f.checked);
    };
    const saltaOrden = marcados.some(rowSaltaOrden);
    const justificacion = $('llamNuevoJustificacion').value.trim();
    if (saltaOrden && !justificacion) {
      mostrarToast('⚠️ Este llamamiento no respeta el orden de antigüedad — indica la justificación (o usa uno de los botones de arriba para añadir a quien falta).', false);
      return;
    }
    const btn = $('btnGuardarLlamamientoNuevo');
    btn.disabled = true;
    btn.textContent = 'Creando…';
    const payloads = marcados.map((c) => {
      const e2 = escalafonCache.find((x) => x.trabajador_id === c.value);
      const fechaInput = document.querySelector(`.llam-persona-fecha[data-trabajador="${c.value}"]`);
      return {
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: c.value,
        tipo,
        puesto_key: departamento,
        bloque: departamento,
        fecha_prevista: fechaInput.value,
        antiguedad_anos_calculada: e2 ? e2.antiguedad_anos : null,
        posicion_escalafon: e2 ? e2.posicion_escalafon : null,
        salta_orden: rowSaltaOrden(c),
        justificacion_salto: rowSaltaOrden(c) ? justificacion : null,
        creado_por: usuarioActual.nombre,
        _nombre: e2 ? e2.nombre : c.value // solo para el mensaje/auditoría, no se envía a la tabla
      };
    });
    // César: "¿por qué los otros no se han creado? Se tienen que cargar en expedientes todos los
    // que se generen" — el insert se verifica con .select() devolviendo las filas realmente
    // creadas, y el mensaje final confirma persona a persona (con su fecha) en vez de un contador.
    const { data: creados, error } = await sb
      .from('llamamientos')
      .insert(payloads.map(({ _nombre, ...p }) => p))
      .select('id, trabajador_id, fecha_prevista');
    btn.disabled = false;
    btn.textContent = 'Crear expediente(s) en borrador';
    if (error) {
      mostrarToast('Error al crear: ' + error.message, false);
      return;
    }
    const detalle = payloads
      .map((p) => {
        const ok = (creados || []).some((c) => c.trabajador_id === p.trabajador_id && c.fecha_prevista === p.fecha_prevista);
        return `${ok ? '✓' : '✗ NO creado'} ${p._nombre} (${fechaCorta(p.fecha_prevista)})`;
      })
      .join(' · ');
    const todosCreados = (creados || []).length === payloads.length;
    mostrarToast(
      todosCreados ? `${creados.length} expediente(s) creado(s) en borrador ✓ — ${detalle}` : `⚠️ Solo se crearon ${(creados || []).length} de ${payloads.length}: ${detalle}`,
      todosCreados
    );
    cerrarLlamamientoNuevoModal();
    await cargarLlamamientosAdmin();
    await registrarAuditoria(
      'Llamamientos',
      tipo === 'fin_llamamiento' ? 'Fin de llamamiento creado (borrador)' : 'Llamamiento creado (borrador)',
      `${detalle}${saltaOrden ? ' — ⚠️ fuera de orden: ' + justificacion : ''}`
    );
  } finally {
    _guardandoLlamamientoNuevo = false;
  }
}

// ---- Gestión del expediente — correo, firma, gestoría, cierre ----
function abrirLlamamientoGestionModal(id) {
  const l = llamamientosCache.find((x) => x.id === id);
  if (!l) return;
  currentLlamamientoId = id;
  const nombre = l.personas_trabajadoras ? l.personas_trabajadoras.nombre : '—';
  $('llamGestionTitulo').textContent = `${l.tipo === 'fin_llamamiento' ? '🔚 Fin de llamamiento' : '📣 Llamamiento'} — ${nombre}`;
  $('llamGestionMeta').textContent = `${l.bloque || l.puesto_key || '—'} · Fecha prevista: ${fechaCorta(l.fecha_prevista)} · Antigüedad: ${l.antiguedad_anos_calculada != null ? l.antiguedad_anos_calculada + ' años' : '—'} · Posición en escalafón: ${l.posicion_escalafon ?? '—'}`;
  if (l.salta_orden) {
    $('llamGestionSaltaOrden').style.display = '';
    $('llamGestionSaltaOrden').innerHTML = `⚠️ Fuera de orden de antigüedad — justificación: ${l.justificacion_salto || '—'}`;
  } else {
    $('llamGestionSaltaOrden').style.display = 'none';
  }
  const pasos = ['borrador', 'enviado', 'pendiente_firma', 'firmado', 'enviado_gestoria', 'cerrado'];
  const idxActual = l.estado === 'declinado' ? -1 : pasos.indexOf(l.estado);
  $('llamGestionPasos').innerHTML =
    l.estado === 'declinado'
      ? '<span class="badge2 b-rose">🚫 Declinado por silencio tras preaviso</span>'
      : pasos.map((p, i) => `<span class="badge2 ${i <= idxActual ? LLAMAMIENTO_ESTADOS[p][1] : 'b-slate'}" style="margin-right:4px;">${i <= idxActual ? '✓ ' : ''}${LLAMAMIENTO_ESTADOS[p][0]}</span>`).join('');
  // César (fase 7): "no podemos ver cuando la persona ha respondido para luego poder marcar [...]
  // confirmado o [...] declinado, silencio tras preaviso" — nunca se da por hecho: se lee el estado
  // REAL (respuesta_trabajador_tipo/_en, migración 0099). Si todavía no ha respondido pero ya se
  // envió el correo, se muestra cuántos días lleva esperando frente al preaviso configurado, que es
  // justo el dato que faltaba para decidir con criterio entre esperar y marcar "declinado por
  // silencio" (ese botón manual sigue existiendo para ese caso exacto).
  if (l.respuesta_trabajador_en) {
    $('llamGestionRespuestaWrap').style.display = '';
    const esAcepta = l.respuesta_trabajador_tipo === 'acepta';
    $('llamGestionRespuesta').innerHTML =
      `<span class="badge2 ${esAcepta ? 'b-emerald' : 'b-rose'}">${esAcepta ? '✅ Respondió "acepta"' : '🚫 Respondió "declina"'} desde su app el ${new Date(l.respuesta_trabajador_en).toLocaleString('es-ES')}</span>` +
      (l.respuesta_trabajador ? `<br>💬 "${l.respuesta_trabajador}"` : '');
  } else if (l.estado === 'enviado' && l.correo_enviado_en) {
    const diasPreaviso = l.tipo === 'fin_llamamiento' ? llamamientosParametrosCache.dias_preaviso_fin_llamamiento || 7 : llamamientosParametrosCache.dias_preaviso_llamamiento || 7;
    const diasTranscurridos = Math.floor((Date.now() - new Date(l.correo_enviado_en).getTime()) / 86400000);
    $('llamGestionRespuestaWrap').style.display = '';
    $('llamGestionRespuesta').innerHTML =
      diasTranscurridos >= diasPreaviso
        ? `<span class="badge2 b-amber">⏳ Sin respuesta desde su app todavía — ${diasTranscurridos} días desde el envío (preaviso configurado: ${diasPreaviso} días). Ya se puede valorar "declinado por silencio tras preaviso".</span>`
        : `<span class="badge2 b-slate">⏳ Sin respuesta desde su app todavía — ${diasTranscurridos} de ${diasPreaviso} días de preaviso transcurridos.</span>`;
  } else {
    $('llamGestionRespuestaWrap').style.display = 'none';
  }
  // César: "necesitaría poder comprobar qué dirección es la correcta [...] si tiene que ser por
  // defecto del lote de trabajadores" — destinatario y CC quedan siempre visibles y editables
  // antes de enviar (prefijados: destinatario = email de la ficha, CC = RR.HH. + email de
  // auditoría configurado arriba), en vez de calcularse en silencio como antes.
  const p0 = empleadosCache.find((x) => x.id === l.trabajador_id);
  if (l.estado === 'borrador') {
    $('llamCorreoDestinatario').value = p0 ? p0.email || '' : '';
    $('llamCorreoCC').value = '';
    const ccAuditoria = llamamientosParametrosCache.email_auditoria_llamamientos;
    sb.rpc('rrhh_emails_hotel').then(({ data }) => {
      if ($('llamCorreoCC').value) return;
      $('llamCorreoCC').value = [data, ccAuditoria].filter(Boolean).join(', ');
    });
  } else {
    $('llamCorreoDestinatario').value = p0 ? p0.email || '' : '';
    $('llamCorreoCC').value = (l.correo_cc || []).join(', ');
  }
  $('llamCorreoAsunto').value = l.correo_asunto || '';
  $('llamCorreoCuerpo').value = l.correo_cuerpo || '';
  $('llamGestionCorreoWrap').style.display = l.estado === 'borrador' || l.estado === 'enviado' ? '' : 'none';
  $('btnLlamEnviarCorreo').style.display = l.estado === 'borrador' ? '' : 'none';
  $('btnLlamPendienteFirma').style.display = l.estado === 'enviado' ? '' : 'none';
  $('btnLlamDeclinado').style.display = l.estado === 'enviado' ? '' : 'none';
  $('formLlamFirma').style.display = l.estado === 'pendiente_firma' ? '' : 'none';
  $('btnLlamEnviarGestoria').style.display = l.estado === 'firmado' ? '' : 'none';
  $('btnLlamCerrar').style.display = l.estado === 'enviado_gestoria' ? '' : 'none';
  if ($('llamRespuestaManualNota')) $('llamRespuestaManualNota').value = '';
  $('modalLlamamientoGestion').classList.remove('hidden');
}
function cerrarLlamamientoGestionModal() {
  $('modalLlamamientoGestion').classList.add('hidden');
}
function generarCorreoLlamamiento() {
  const l = llamamientosCache.find((x) => x.id === currentLlamamientoId);
  if (!l) return;
  const nombre = l.personas_trabajadoras ? l.personas_trabajadoras.nombre : '';
  const diasPreaviso = l.tipo === 'fin_llamamiento' ? llamamientosParametrosCache.dias_preaviso_fin_llamamiento || 7 : llamamientosParametrosCache.dias_preaviso_llamamiento || 7;
  // César (fase 7): "debería recibir el correo con el aviso [...] un enlace para que pueda acceder
  // al formulario para firmar dentro de la aplicación a la que tiene que acceder con su usuario y
  // contraseña, que lo firme y lo devuelva" — ya no se pide "responder a este correo": se pide
  // entrar en la app (usuario/contraseña ya existentes) y responder desde "Mis Documentos", que es
  // lo único que queda de verdad registrado y visible para RR.HH. (RPC responder_llamamiento).
  const instruccionApp = 'Accede a la app Personal4Pax con tu usuario y contraseña habituales y entra en "Mis Documentos": ahí encontrarás este expediente para responder. Tu respuesta queda registrada automáticamente y la podremos ver desde aquí.';
  if (l.tipo === 'fin_llamamiento') {
    $('llamCorreoAsunto').value = 'Comunicación de fin de llamamiento';
    $('llamCorreoCuerpo').value = `Hola ${nombre},\n\nPor la presente te comunicamos el fin de llamamiento con efectos a partir del ${fechaCorta(l.fecha_prevista)}, con un preaviso de ${diasPreaviso} días naturales, conforme al art. 16 ET y al orden establecido.\n\n${instruccionApp}\n\nQuedamos a tu disposición para cualquier aclaración.\n\nUn saludo,\nPersonal4Pax — RR.HH.`;
  } else {
    $('llamCorreoAsunto').value = 'Llamamiento — reincorporación';
    $('llamCorreoCuerpo').value = `Hola ${nombre},\n\nTe comunicamos tu llamamiento para la reincorporación a partir del ${fechaCorta(l.fecha_prevista)}, con un preaviso de ${diasPreaviso} días naturales.\n\n${instruccionApp} La falta de respuesta dentro de ese plazo podrá valorarse como declinación del llamamiento.\n\nUn saludo,\nPersonal4Pax — RR.HH.`;
  }
}
let _enviandoCorreoLlamamiento = false;
async function enviarCorreoLlamamiento() {
  // Guarda de reentrada: un doble clic (o un segundo clic mientras la primera llamada todavía no
  // ha respondido) no debe poder disparar dos sb.rpc('enviar_correo_externo') y mandar el mismo
  // correo real dos veces — mismo patrón que guardarLlamamientoNuevo (_guardandoLlamamientoNuevo).
  if (_enviandoCorreoLlamamiento) return;
  const l = llamamientosCache.find((x) => x.id === currentLlamamientoId);
  if (!l) return;
  const destinatario = $('llamCorreoDestinatario').value.trim();
  const cc = $('llamCorreoCC').value.trim() || null;
  const asunto = $('llamCorreoAsunto').value.trim();
  const cuerpo = $('llamCorreoCuerpo').value.trim();
  if (!destinatario || !asunto || !cuerpo) {
    mostrarToast('⚠️ Comprueba el destinatario y genera o escribe el correo antes de enviarlo', false);
    return;
  }
  _enviandoCorreoLlamamiento = true;
  const btnEnviar = $('btnLlamEnviarCorreo');
  if (btnEnviar) btnEnviar.disabled = true;
  try {
  const p = empleadosCache.find((x) => x.id === l.trabajador_id);
  // César (fase 7): "debería recibir el correo [...] un enlace para que pueda acceder al formulario
  // para firmar dentro de la aplicación [...] que lo firme y lo devuelva [...] en la parte de
  // llamamientos de administración debería poder verse que ese formulario ya está firmado" — el
  // circuito real empieza aquí: el "documentos" del expediente se crea AL ENVIAR el correo (no al
  // cerrar, como antes), mismo patrón que Disciplina (migración 0078) — documento primero, para que
  // ya exista algo real que la persona pueda ver y firmar desde su app en cuanto le llegue el
  // correo. Si ya existe (p. ej. se reenvía el correo), se reutiliza en vez de duplicarlo.
  let documentoId = l.documento_id || null;
  if (!documentoId) {
    const { data: nuevoDoc, error: errorDoc } = await sb
      .from('documentos')
      .insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: l.trabajador_id,
        tipo: l.tipo === 'fin_llamamiento' ? 'fin_llamamiento' : 'llamamiento',
        nombre: `${l.tipo === 'fin_llamamiento' ? 'Fin de llamamiento' : 'Llamamiento'} — ${p ? p.nombre : ''} — ${fechaCorta(l.fecha_prevista)}`,
        meta: JSON.stringify({ bloque: l.bloque, antiguedad_anos: l.antiguedad_anos_calculada, posicion_escalafon: l.posicion_escalafon, salta_orden: l.salta_orden, justificacion_salto: l.justificacion_salto })
      })
      .select()
      .single();
    if (errorDoc) {
      mostrarToast('Error al preparar el expediente para firma: ' + errorDoc.message, false);
      return;
    }
    documentoId = nuevoDoc.id;
  }
  const { error } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: destinatario,
    p_cc_email: cc,
    p_asunto: asunto,
    p_cuerpo: cuerpo,
    p_referencia_tabla: 'llamamientos',
    p_referencia_id: l.id
  });
  if (error) {
    mostrarToast('Error al enviar: ' + error.message, false);
    return;
  }
  const { error: errorUpd } = await sb
    .from('llamamientos')
    .update({ estado: 'enviado', correo_asunto: asunto, correo_cuerpo: cuerpo, correo_cc: cc ? cc.split(',').map((x) => x.trim()).filter(Boolean) : null, correo_enviado_en: new Date().toISOString(), documento_id: documentoId })
    .eq('id', l.id);
  mostrarToast(errorUpd ? 'Error: ' + errorUpd.message : `Correo enviado ✓ (${destinatario}${cc ? ' · CC: ' + cc : ''})`, !errorUpd);
  if (!errorUpd) {
    await registrarAuditoria('Llamamientos', 'Correo de llamamiento enviado', `${p ? p.nombre : destinatario} — ${destinatario}${cc ? ' · CC: ' + cc : ''} — ${asunto}`);
    await cargarLlamamientosAdmin();
    abrirLlamamientoGestionModal(l.id);
  }
  } finally {
    _enviandoCorreoLlamamiento = false;
    if (btnEnviar) btnEnviar.disabled = false;
  }
}
async function marcarPendienteFirmaLlamamiento() {
  if (!currentLlamamientoId) return;
  // César: "si César Manccini responde [por un canal que la app no captura, p. ej. respondiendo al
  // correo en vez de entrar en 'Mis Documentos'], tiene que poder reflejarse [...] de modo que si
  // el técnico que se dedica a esto mañana no viene, lo pueda hacer otro sin preguntar a nadie" —
  // la nota de "qué ha dicho y por qué canal" queda en Auditoría (igual que el resto de pasos de
  // este expediente — ver comment de la tabla llamamientos), visible para cualquiera que abra el
  // registro después, sin depender de que quede memoria de quién gestionó el caso.
  const nota = ($('llamRespuestaManualNota') ? $('llamRespuestaManualNota').value.trim() : '') || '(sin nota — canal no especificado)';
  const { error } = await sb.from('llamamientos').update({ estado: 'pendiente_firma' }).eq('id', currentLlamamientoId);
  mostrarToast(error ? 'Error: ' + error.message : 'Pasa a pendiente de firma ✓', !error);
  if (!error) {
    const l = llamamientosCache.find((x) => x.id === currentLlamamientoId);
    const p = l ? empleadosCache.find((x) => x.id === l.trabajador_id) : null;
    await registrarAuditoria('Llamamientos', 'Respuesta registrada a mano (acepta) — pendiente de firma', `${p ? p.nombre : currentLlamamientoId} — ${nota}`);
    await cargarLlamamientosAdmin();
    abrirLlamamientoGestionModal(currentLlamamientoId);
  }
}
// César/prompt: "silencio = declina" tras el preaviso — no se ha podido verificar esta regla
// concreta contra el texto del convenio (ver memoria legal), así que NUNCA se aplica sola: es un
// botón que RR.HH. pulsa a mano cuando decide que corresponde, y queda igualmente en auditoría.
// También cubre el caso de que la persona SÍ haya respondido, pero declinando, por un canal que la
// app no captura sola (p. ej. respondiendo al correo en vez de entrar en su app) — el motivo que
// se escriba en la nota (abajo del botón) deja claro cuál de los dos casos es.
async function marcarDeclinadoLlamamiento() {
  if (!currentLlamamientoId) return;
  const nota = ($('llamRespuestaManualNota') ? $('llamRespuestaManualNota').value.trim() : '') || '(sin nota — se marca por silencio tras preaviso, sin respuesta registrada)';
  if (!confirm('¿Marcar este expediente como declinado (respuesta registrada a mano, o silencio tras el preaviso)? Esta acción es manual (no se marca sola) y queda en auditoría con la nota que hayas escrito.')) return;
  const { error } = await sb.from('llamamientos').update({ estado: 'declinado', declinado_en: new Date().toISOString() }).eq('id', currentLlamamientoId);
  mostrarToast(error ? 'Error: ' + error.message : 'Marcado como declinado ✓', !error);
  if (!error) {
    const l = llamamientosCache.find((x) => x.id === currentLlamamientoId);
    const p = l ? empleadosCache.find((x) => x.id === l.trabajador_id) : null;
    await registrarAuditoria('Llamamientos', 'Expediente declinado (a mano)', `${p ? p.nombre : currentLlamamientoId} — ${nota}`);
    cerrarLlamamientoGestionModal();
    await cargarLlamamientosAdmin();
  }
}
async function registrarFirmaLlamamiento(e) {
  e.preventDefault();
  if (!currentLlamamientoId) return;
  const nombreFirma = $('llamFirmaNombre').value.trim();
  const { error } = await sb.from('llamamientos').update({ estado: 'firmado', firma_nombre: nombreFirma, firma_en: new Date().toISOString() }).eq('id', currentLlamamientoId);
  mostrarToast(error ? 'Error: ' + error.message : 'Firma registrada ✓', !error);
  if (!error) {
    const l = llamamientosCache.find((x) => x.id === currentLlamamientoId);
    const p = l ? empleadosCache.find((x) => x.id === l.trabajador_id) : null;
    await registrarAuditoria('Llamamientos', 'Firma registrada', `${p ? p.nombre : currentLlamamientoId} — firmado por ${nombreFirma}`);
    await cargarLlamamientosAdmin();
    abrirLlamamientoGestionModal(currentLlamamientoId);
  }
}
async function enviarGestoriaLlamamiento() {
  if (!currentLlamamientoId) return;
  const l = llamamientosCache.find((x) => x.id === currentLlamamientoId);
  if (!l) return;
  const p = empleadosCache.find((x) => x.id === l.trabajador_id);
  const { data: destinatario } = await sb.rpc('rrhh_emails_hotel');
  const ccAuditoria = llamamientosParametrosCache.email_auditoria_llamamientos;
  const { error: errorEnvio } = await sb.rpc('enviar_correo_externo', {
    p_destinatario_email: destinatario || 'rrhh@empresa.es',
    p_cc_email: ccAuditoria || null,
    p_asunto: `${l.tipo === 'fin_llamamiento' ? 'Fin de llamamiento' : 'Llamamiento'} firmado — ${p ? p.nombre : ''}`,
    p_cuerpo: `Se adjunta/comunica el expediente de ${l.tipo === 'fin_llamamiento' ? 'fin de llamamiento' : 'llamamiento'} firmado por ${p ? p.nombre : ''} (firmado por ${l.firma_nombre || '—'} el ${fechaCorta(l.firma_en)}).`,
    p_referencia_tabla: 'llamamientos',
    p_referencia_id: l.id
  });
  if (errorEnvio) {
    mostrarToast('Error al enviar: ' + errorEnvio.message, false);
    return;
  }
  const { error } = await sb.from('llamamientos').update({ estado: 'enviado_gestoria', enviado_gestoria_en: new Date().toISOString() }).eq('id', l.id);
  mostrarToast(error ? 'Error: ' + error.message : 'Enviado a gestoría ✓', !error);
  if (!error) {
    await registrarAuditoria('Llamamientos', 'Expediente enviado a gestoría', p ? p.nombre : l.id);
    await cargarLlamamientosAdmin();
    abrirLlamamientoGestionModal(l.id);
  }
}
async function cerrarExpedienteLlamamiento() {
  if (!currentLlamamientoId) return;
  const l = llamamientosCache.find((x) => x.id === currentLlamamientoId);
  if (!l) return;
  const p = empleadosCache.find((x) => x.id === l.trabajador_id);
  if (!confirm(`¿Cerrar el expediente de ${l.tipo === 'fin_llamamiento' ? 'fin de llamamiento' : 'llamamiento'} de ${p ? p.nombre : ''}?`)) return;
  // César (fase 7): el justificante ya se creó AL ENVIAR el correo (enviarCorreoLlamamiento), para
  // que la persona pudiera verlo y firmarlo desde su app — aquí solo se ACTUALIZA con el desenlace
  // final, nunca se duplica. Solo se crea de cero si, por venir de antes de este circuito, el
  // expediente nunca llegó a tener un documento enlazado (defensivo).
  const metaCierre = JSON.stringify({
    bloque: l.bloque,
    antiguedad_anos: l.antiguedad_anos_calculada,
    posicion_escalafon: l.posicion_escalafon,
    salta_orden: l.salta_orden,
    justificacion_salto: l.justificacion_salto,
    firma_nombre: l.firma_nombre,
    firma_en: l.firma_en,
    respuesta_trabajador_tipo: l.respuesta_trabajador_tipo,
    respuesta_trabajador: l.respuesta_trabajador,
    respuesta_trabajador_en: l.respuesta_trabajador_en,
    enviado_gestoria_en: l.enviado_gestoria_en
  });
  let documentoId = l.documento_id || null;
  if (documentoId) {
    const { error: errorDoc } = await sb.from('documentos').update({ meta: metaCierre }).eq('id', documentoId);
    if (errorDoc) {
      mostrarToast('Error al actualizar el justificante: ' + errorDoc.message, false);
      return;
    }
  } else {
    const { data: nuevoDoc, error: errorDoc } = await sb
      .from('documentos')
      .insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: l.trabajador_id,
        tipo: l.tipo === 'fin_llamamiento' ? 'fin_llamamiento' : 'llamamiento',
        nombre: `${l.tipo === 'fin_llamamiento' ? 'Fin de llamamiento' : 'Llamamiento'} — ${p ? p.nombre : ''} — ${fechaCorta(l.fecha_prevista)}`,
        meta: metaCierre
      })
      .select()
      .single();
    if (errorDoc) {
      mostrarToast('Error al generar el justificante: ' + errorDoc.message, false);
      return;
    }
    documentoId = nuevoDoc.id;
  }
  const { error } = await sb.from('llamamientos').update({ estado: 'cerrado', cerrado_en: new Date().toISOString(), documento_id: documentoId }).eq('id', l.id);
  mostrarToast(error ? 'Error: ' + error.message : 'Expediente cerrado ✓ Justificante en Mis Documentos.', !error);
  if (!error) {
    await registrarAuditoria('Llamamientos', 'Expediente cerrado', p ? p.nombre : l.id);
    cerrarLlamamientoGestionModal();
    await cargarLlamamientosAdmin();
  }
}

// ---------- Incidencias de Nómina (admin) ----------
// César (06/11/2026): módulo independiente (nav propio, debajo de Cuadrantes) — libro de TODA la
// plantilla, nunca dentro de la ficha de una sola persona. Calcado del mismo patrón ya usado en
// Llamamientos (caché + render + modales) y en el informe de expediente de Candidato (modal de
// envío con destinatario/CC/asunto/cuerpo editable). Backend: migraciones 0116 (tablas +
// responder_turno_extra) y 0117 (documento_id, para que el trabajador firme desde "Mis
// Documentos" sin tener que construirle una pantalla nueva).
let incidenciasNominaCache = [];
let turnosExtraCache = [];
let currentTurnoExtraId = null;
const INOM_TIPO_LABEL = {
  horas_extra: ['⏱ Horas extra', 'b-amber'],
  cambio_turno: ['🔁 Cambio de turno', 'b-slate'],
  dia_libre_trabajado: ['📅 Día libre trabajado', 'b-emerald'],
  absentismo: ['🚫 Absentismo', 'b-rose'],
  plus_personal: ['🔒 Plus personal', 'b-rose']
};
const TE_ESTADOS = { enviado: ['⏳ Enviado — pendiente de firma', 'b-amber'], firmado: ['✅ Firmado', 'b-emerald'], declinado: ['🚫 Declinado', 'b-rose'] };
// César (06/11/2026, triple firma): "deberías poder haber un desplegable para estandarizar unos
// 4,5,6 líneas bastante breves explicando los posibles motivos" — un motivo estándar por tipo,
// editable aquí mismo en código (no se crea tabla nueva para esto — es una lista corta y estable,
// cambiarla es una línea, no merece su propio CRUD).
const INOM_MOTIVOS_ESTANDAR = {
  horas_extra: ['Cobertura por ausencia de un compañero/a', 'Pico de ocupación/carga de trabajo', 'Cierre de turno sin relevo', 'Tarea extraordinaria puntual', 'Otro (detállalo en Observaciones)'],
  cambio_turno: ['Intercambio voluntario entre compañeros', 'Necesidad personal del trabajador', 'Cobertura de turno por ausencia imprevista', 'Reorganización de cuadrante', 'Otro (detállalo en Observaciones)'],
  dia_libre_trabajado: ['Cobertura por baja o ausencia', 'Pico de actividad excepcional', 'Sustitución urgente', 'Otro (detállalo en Observaciones)'],
  absentismo: ['Falta injustificada', 'Retraso reiterado', 'Abandono de puesto', 'Ausencia sin aviso previo', 'Otro (detállalo en Observaciones)'],
  plus_personal: ['Plus de responsabilidad', 'Plus de disponibilidad/flexibilidad', 'Plus de idiomas', 'Compensación específica pactada', 'Otro (detállalo en Observaciones)']
};
// César: "Tiene que haber una firma del responsable del trabajador, del jefe de departamento, y
// luego la firma de la parte de administración de recursos humanos [...] si han firmado
// 'firmado' y si no 'Pendiente de firma'" — EXCEPCIÓN: el plus personal confidencial no pasa por
// el jefe de departamento (ver migración 0118, cabecera) — se marca "No aplica" en vez de dejarlo
// eternamente pendiente.
function _firmaBadge(fechaIso, noAplica) {
  if (noAplica) return '<span class="badge2 b-slate">— No aplica</span>';
  return fechaIso ? `<span class="badge2 b-emerald" title="${new Date(fechaIso).toLocaleString('es-ES')}">✅ Firmado</span>` : '<span class="badge2 b-amber">⏳ Pendiente de firma</span>';
}
function _firmasCompletas(i) {
  const jefeNoAplica = !!i.confidencial;
  return !!i.firma_trabajador_en && (jefeNoAplica || !!i.firma_jefe_departamento_en) && !!i.firma_rrhh_en;
}

// Periodo de nómina 20↔20 (César: "el objetivo de esto es que RR.HH. el día 20 [...] pueda
// exportar [...] periodos comprendidos entre 20 y 20"). Se genera una lista de los últimos 12
// periodos (el actual primero) para poder consultar meses cerrados anteriores sin perder nada.
function _periodoNominaDesdeFecha(d) {
  const anio = d.getFullYear();
  const mes = d.getMonth();
  if (d.getDate() >= 20) {
    const desde = new Date(anio, mes, 20);
    const hasta = new Date(anio, mes + 1, 19);
    return { desde, hasta };
  }
  const desde = new Date(anio, mes - 1, 20);
  const hasta = new Date(anio, mes, 19);
  return { desde, hasta };
}
function _isoSoloFecha(d) { return d.toISOString().slice(0, 10); }
function _etiquetaPeriodoNomina(desde, hasta) {
  return `${desde.getDate()} ${MESES[desde.getMonth()].slice(0, 3)} – ${hasta.getDate()} ${MESES[hasta.getMonth()].slice(0, 3)} ${hasta.getFullYear()}`;
}
let _inomPeriodos = [];
function _construirPeriodosNomina() {
  const hoy = new Date();
  let cursor = _periodoNominaDesdeFecha(hoy).desde;
  _inomPeriodos = [];
  for (let i = 0; i < 12; i++) {
    const desde = new Date(cursor);
    const hasta = new Date(desde.getFullYear(), desde.getMonth() + 1, 19);
    _inomPeriodos.push({ desde: _isoSoloFecha(desde), hasta: _isoSoloFecha(hasta), etiqueta: _etiquetaPeriodoNomina(desde, hasta) });
    cursor = new Date(desde.getFullYear(), desde.getMonth() - 1, 20);
  }
}
function periodoNominaSeleccionado() {
  if (!_inomPeriodos.length) _construirPeriodosNomina();
  const idx = $('inomPeriodoSelect') ? parseInt($('inomPeriodoSelect').value, 10) || 0 : 0;
  return _inomPeriodos[idx] || _inomPeriodos[0];
}
function cambiarPeriodoIncidenciasNomina() { renderIncidenciasNominaTabla(); }

async function cargarIncidenciasNominaAdmin() {
  _construirPeriodosNomina();
  if ($('inomPeriodoSelect')) {
    const actual = $('inomPeriodoSelect').value || '0';
    $('inomPeriodoSelect').innerHTML = _inomPeriodos.map((p, i) => `<option value="${i}">${p.etiqueta}${i === 0 ? ' (periodo actual)' : ''}</option>`).join('');
    $('inomPeriodoSelect').value = actual;
  }
  const [{ data: incidencias }, { data: turnosExtra }] = await Promise.all([
    sb.from('incidencias_nomina').select('*, personas_trabajadoras(nombre, departamento)').order('fecha', { ascending: false }),
    sb.from('turnos_extra_solicitudes').select('*, personas_trabajadoras(nombre, departamento, email), turnos_catalogo(codigo, nombre)').order('created_at', { ascending: false })
  ]);
  incidenciasNominaCache = incidencias || [];
  turnosExtraCache = turnosExtra || [];
  if ($('inomFiltroPersona')) {
    const actual = $('inomFiltroPersona').value;
    const personas = [...new Map(incidenciasNominaCache.map((i) => [i.trabajador_id, i.personas_trabajadoras ? i.personas_trabajadoras.nombre : i.trabajador_id])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    $('inomFiltroPersona').innerHTML = '<option value="">Toda la plantilla</option>' + personas.map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('');
    $('inomFiltroPersona').value = actual;
  }
  renderIncidenciasNominaTabla();
}

function incidenciasNominaDelPeriodo() {
  const p = periodoNominaSeleccionado();
  if (!p) return [];
  return incidenciasNominaCache.filter((i) => i.fecha >= p.desde && i.fecha <= p.hasta);
}

function renderIncidenciasNominaTabla() {
  const periodo = periodoNominaSeleccionado();
  let filas = incidenciasNominaDelPeriodo();
  const tipoFiltro = $('inomFiltroTipo') ? $('inomFiltroTipo').value : '';
  const personaFiltro = $('inomFiltroPersona') ? $('inomFiltroPersona').value : '';
  if (tipoFiltro) filas = filas.filter((i) => i.tipo === tipoFiltro);
  if (personaFiltro) filas = filas.filter((i) => i.trabajador_id === personaFiltro);

  // César: "solamente salgan los trabajadores que sí han generado incidencias de nómina" — las
  // KPI y la tabla trabajan siempre sobre el subconjunto de personas con, al menos, una fila en
  // el periodo (nunca sobre la plantilla completa).
  const personasAfectadas = new Set(incidenciasNominaDelPeriodo().map((i) => i.trabajador_id));
  const pendientesFirma = turnosExtraCache.filter((t) => t.estado === 'enviado').length;
  $('inomKpis').innerHTML = `
    <div class="card kpi"><div class="ic">💶</div><div><div class="t">Incidencias — ${periodo ? periodo.etiqueta : '—'}</div><div class="v">${incidenciasNominaDelPeriodo().length}</div></div></div>
    <div class="card kpi"><div class="ic">👥</div><div><div class="t">Personas afectadas en el periodo</div><div class="v">${personasAfectadas.size}</div></div></div>
    <div class="card kpi"><div class="ic">📣</div><div><div class="t">Turnos extra pendientes de firma</div><div class="v">${pendientesFirma}</div></div></div>`;
  if ($('countIncidenciasNomina')) {
    $('countIncidenciasNomina').textContent = pendientesFirma;
    $('countIncidenciasNomina').classList.toggle('hidden', !pendientesFirma);
  }

  $('inomBody').innerHTML = filas.map((i) => {
    const nombre = i.personas_trabajadoras ? i.personas_trabajadoras.nombre : `<span title="trabajador_id: ${i.trabajador_id}">— (sin datos)</span>`;
    const tl = INOM_TIPO_LABEL[i.tipo] || ['—', 'b-slate'];
    let detalle = i.descripcion || '—';
    if (i.horas != null) detalle = `${i.horas} h${i.descripcion ? ' — ' + i.descripcion : ''}`;
    if (i.importe_euros != null) detalle = `${Number(i.importe_euros).toFixed(2)} €${i.descripcion ? ' — ' + i.descripcion : ''}`;
    if (i.confidencial) detalle = `🔒 ${detalle}`;
    const firmas = `<div style="display:flex;flex-direction:column;gap:2px;">
        <span>👤 ${_firmaBadge(i.firma_trabajador_en)}</span>
        <span>🧑‍💼 ${_firmaBadge(i.firma_jefe_departamento_en, i.confidencial)}</span>
        <span>🏢 ${_firmaBadge(i.firma_rrhh_en)}${!i.firma_rrhh_en ? ` <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 6px;font-size:10.5px;" onclick="firmarIncidenciaNominaRRHH('${i.id}')">Firmar</button>` : ''}</span>
      </div>`;
    return `<tr>
      <td><b>${nombre}</b></td>
      <td><span class="badge2 ${tl[1]}">${tl[0]}</span></td>
      <td>${fechaCorta(i.fecha)}</td>
      <td>${detalle}</td>
      <td>${firmas}</td>
      <td>${i.origen === 'circuito_turno_extra' ? '🔁 Automático (firma)' : '✍️ Manual'}</td>
      <td>${i.origen === 'manual' ? `<button type="button" class="btn btn-secondary btn-sm" onclick="eliminarIncidenciaNominaManual('${i.id}')">🗑</button>` : ''}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="sub-c" style="text-align:center;padding:14px;">Sin incidencias de nómina en este periodo con los filtros actuales.</td></tr>';

  $('turnosExtraBody').innerHTML = turnosExtraCache.map((t) => {
    const nombre = t.personas_trabajadoras ? t.personas_trabajadoras.nombre : '—';
    const est = TE_ESTADOS[t.estado] || ['—', 'b-slate'];
    const respuesta = t.respuesta_trabajador_en
      ? `${t.respuesta_trabajador_tipo === 'acepta' ? '✅' : '🚫'} ${new Date(t.respuesta_trabajador_en).toLocaleString('es-ES')}`
      : '⏳ Sin responder';
    return `<tr>
      <td><b>${nombre}</b></td>
      <td>${fechaCorta(t.fecha)}</td>
      <td>${t.turnos_catalogo ? t.turnos_catalogo.nombre : '—'}</td>
      <td><span class="badge2 ${est[1]}">${est[0]}</span></td>
      <td>${respuesta}</td>
      <td><button type="button" class="btn btn-secondary btn-sm" onclick="abrirTurnoExtraGestionModal('${t.id}')">Ver</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Todavía no se ha solicitado ningún turno extra.</td></tr>';
}

// ---- Registrar incidencia manual ----
function abrirIncidenciaNominaManualModal() {
  $('formIncidenciaNominaManual').reset();
  $('inomManualPersona').innerHTML = empleadosCache.map((p) => `<option value="${p.id}">${p.nombre}${p.departamento ? ' — ' + p.departamento : ''}</option>`).join('');
  $('inomManualFecha').value = new Date().toISOString().slice(0, 10);
  actualizarCamposIncidenciaNominaManual();
  $('modalIncidenciaNominaManual').classList.remove('hidden');
}
function cerrarIncidenciaNominaManualModal() { $('modalIncidenciaNominaManual').classList.add('hidden'); }
function actualizarCamposIncidenciaNominaManual() {
  const tipo = $('inomManualTipo').value;
  $('inomManualHorasWrap').style.display = tipo === 'horas_extra' ? '' : 'none';
  // César: "haz una tabla para exportar [...] coste (si procede)" — el coste ya no es exclusivo
  // del plus personal: se deja disponible y opcional para cualquier tipo (p. ej. valorizar unas
  // horas extra), siempre "si procede".
  $('inomManualDescripcion').innerHTML = (INOM_MOTIVOS_ESTANDAR[tipo] || []).map((m) => `<option value="${m}">${m}</option>`).join('');
  // César: "aquellos trabajadores que tengan pactado un plus de manera personal, libre y
  // privada" — nace confidencial siempre, sin que nadie tenga que acordarse de marcarlo.
  $('inomManualConfidencial').checked = tipo === 'plus_personal';
  $('inomManualConfidencial').disabled = tipo === 'plus_personal';
  $('inomManualConfidencialNota').style.display = tipo === 'plus_personal' ? '' : 'none';
}
async function guardarIncidenciaNominaManual(e) {
  e.preventDefault();
  const btn = $('btnGuardarIncidenciaNominaManual');
  btn.disabled = true;
  try {
    const trabajadorId = $('inomManualPersona').value;
    const fecha = $('inomManualFecha').value;
    const tipo = $('inomManualTipo').value;
    if (!trabajadorId || !fecha) {
      mostrarToast('⚠️ Indica persona y fecha', false);
      return;
    }
    const p = empleadosCache.find((x) => x.id === trabajadorId);
    // César (triple firma, migración 0118): toda incidencia manual necesita un "documentos"
    // enlazado para que el trabajador (y, si procede, su jefe/a de departamento) la vean en Mis
    // Documentos y puedan firmarla — mismo patrón que turno extra (migración 0117).
    const { data: nuevoDoc, error: errorDoc } = await sb
      .from('documentos')
      .insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: trabajadorId,
        tipo: 'incidencia_nomina',
        nombre: `${INOM_TIPO_LABEL[tipo][0].replace(/^\p{Emoji}\s*/u, '')} — ${p ? p.nombre : ''} — ${fechaCorta(fecha)}`,
        meta: $('inomManualObservaciones').value.trim() || null
      })
      .select()
      .single();
    if (errorDoc) {
      mostrarToast('Error al preparar la incidencia: ' + errorDoc.message, false);
      return;
    }
    const payload = {
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: trabajadorId,
      tipo,
      fecha,
      descripcion: $('inomManualDescripcion').value || null,
      observaciones: $('inomManualObservaciones').value.trim() || null,
      horas: tipo === 'horas_extra' && $('inomManualHoras').value ? parseFloat($('inomManualHoras').value) : null,
      importe_euros: $('inomManualImporte').value ? parseFloat($('inomManualImporte').value) : null,
      confidencial: $('inomManualConfidencial').checked,
      origen: 'manual',
      documento_id: nuevoDoc.id,
      creado_por: usuarioActual.nombre
    };
    const { error } = await sb.from('incidencias_nomina').insert(payload);
    if (error) {
      mostrarToast('Error al guardar: ' + error.message, false);
      return;
    }
    // César (parte 5, tras probar en producción): "todas las incidencias que se crean[,] se tiene
    // que actualizar el cuadrante para poder hacer un doble check [...] si consultas el cuadrante,
    // veas que ese día no tenías todos los trabajadores que habías convocado" — se marca el día en
    // cuadrante_asignaciones sin tocar el turno_id si ya había uno (upsert solo toca
    // estado_especial). 'absentismo' usa el estado ya existente 'ausente' (semántica exacta); el
    // resto usa el aviso genérico reutilizado del circuito de turno extra. El plus personal queda
    // fuera — es confidencial y el cuadrante lo vería cualquiera con acceso a Cuadrantes.
    if (!payload.confidencial) {
      const estadoCuadrante = tipo === 'absentismo' ? 'ausente' : 'incidencia_nomina';
      const { error: errorCuadrante } = await sb
        .from('cuadrante_asignaciones')
        .upsert({ hotel_id: usuarioActual.hotel_id, trabajador_id: trabajadorId, fecha, estado_especial: estadoCuadrante }, { onConflict: 'trabajador_id,fecha' });
      if (errorCuadrante) console.error('No se pudo marcar el cuadrante:', errorCuadrante.message);
    }
    // César: "también se tiene que registrar [...] en el listado de mis incidencias que tienen los
    // usuarios que son trabajadores" — además de Mis Documentos (para firmar), se refleja en Mis
    // Incidencias (el chat de incidencias ya existente) para que quede visible ahí también.
    const { error: errorIncidenciaChat } = await sb.from('incidencias').insert({
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: trabajadorId,
      tipo: `💶 ${INOM_TIPO_LABEL[tipo][0].replace(/^\p{Emoji}\s*/u, '')}`,
      descripcion: `Incidencia de nómina registrada por ${usuarioActual.nombre} el ${fechaCorta(new Date().toISOString().slice(0, 10))} para el ${fechaCorta(fecha)}${payload.descripcion ? ': ' + payload.descripcion : ''}${payload.observaciones ? ' — ' + payload.observaciones : ''}`,
      estado: 'abierta',
      origen: 'admin'
    });
    if (errorIncidenciaChat) console.error('No se pudo registrar en Mis Incidencias:', errorIncidenciaChat.message);
    mostrarToast('Incidencia de nómina registrada ✓ — recuerda firmarla tú primero como RR.HH. (es la firma que desbloquea que trabajador y jefe/a de departamento puedan firmar la suya)', true);
    await registrarAuditoria('Incidencias de Nómina', 'Incidencia manual registrada', `${p ? p.nombre : trabajadorId} — ${INOM_TIPO_LABEL[tipo][0]} — ${fechaCorta(fecha)}`);
    cerrarIncidenciaNominaManualModal();
    await cargarIncidenciasNominaAdmin();
  } finally {
    btn.disabled = false;
  }
}
// RR.HH. firma desde el propio panel admin — acceso directo (misma política RLS que ya usa el
// resto del módulo, "for all" para el tenant), sin necesitar un RPC como el trabajador/jefe/a.
async function firmarIncidenciaNominaRRHH(id) {
  const i = incidenciasNominaCache.find((x) => x.id === id);
  if (!i) return;
  const { error } = await sb.from('incidencias_nomina').update({ firma_rrhh_en: new Date().toISOString(), firma_rrhh_nombre: usuarioActual.nombre }).eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Firmado como RR.HH. ✓', !error);
  if (!error) {
    await registrarAuditoria('Incidencias de Nómina', 'Firma de RR.HH. registrada', i.personas_trabajadoras ? i.personas_trabajadoras.nombre : i.trabajador_id);
    await cargarIncidenciasNominaAdmin();
  }
}
async function eliminarIncidenciaNominaManual(id) {
  const i = incidenciasNominaCache.find((x) => x.id === id);
  if (!i || i.origen !== 'manual') return;
  if (!confirm('¿Eliminar esta incidencia registrada a mano? Las generadas automáticamente por firma de turno extra no se pueden borrar desde aquí.')) return;
  const { error } = await sb.from('incidencias_nomina').delete().eq('id', id);
  mostrarToast(error ? 'Error: ' + error.message : 'Incidencia eliminada ✓', !error);
  if (!error) {
    // El "documentos" enlazado (migración 0118) deja de tener sentido sin su incidencia — se
    // limpia para que no quede una firma pendiente huérfana en Mis Documentos.
    if (i.documento_id) await sb.from('documentos').delete().eq('id', i.documento_id);
    await registrarAuditoria('Incidencias de Nómina', 'Incidencia manual eliminada', i.personas_trabajadoras ? i.personas_trabajadoras.nombre : i.trabajador_id);
    await cargarIncidenciasNominaAdmin();
  }
}

// ---- Circuito de turno extra: RRHH detecta la necesidad → envía → el trabajador firma desde su
// app ("Mis Documentos") → se refleja solo en Cuadrantes y en el libro de arriba (RPC
// responder_turno_extra, migración 0116). Calcado de enviarCorreoLlamamiento: el "documentos" se
// crea AL ENVIAR, no antes, para que ya exista algo real que la persona pueda ver y firmar en
// cuanto le llegue el correo. ----
function abrirTurnoExtraNuevoModal() {
  $('teNuevoPersona').innerHTML = empleadosCache.map((p) => `<option value="${p.id}">${p.nombre}${p.departamento ? ' — ' + p.departamento : ''}</option>`).join('');
  $('teNuevoTurno').innerHTML = cuadrantesCatalogoCache.map((t) => `<option value="${t.id}">${t.codigo} — ${t.nombre}</option>`).join('');
  $('teNuevoFecha').value = '';
  $('teNuevoFecha').min = new Date().toISOString().slice(0, 10);
  $('teNuevoMotivo').value = '';
  generarCorreoTurnoExtra();
  $('modalTurnoExtraNuevo').classList.remove('hidden');
}
function cerrarTurnoExtraNuevoModal() { $('modalTurnoExtraNuevo').classList.add('hidden'); }
function generarCorreoTurnoExtra() {
  const p = empleadosCache.find((x) => x.id === $('teNuevoPersona').value);
  const t = cuadrantesCatalogoCache.find((x) => x.id === $('teNuevoTurno').value);
  $('teNuevoDestinatario').value = p ? p.email || '' : '';
  if (!$('teNuevoCC').value) {
    sb.rpc('rrhh_emails_hotel').then(({ data }) => { if (!$('teNuevoCC').value) $('teNuevoCC').value = data || ''; });
  }
  const fecha = $('teNuevoFecha').value ? fechaCorta($('teNuevoFecha').value) : '(indica la fecha)';
  const turnoTxt = t ? `${t.nombre} (${t.codigo})` : '(indica el turno)';
  $('teNuevoAsunto').value = 'Solicitud de turno extra — necesitamos que trabajes un día sin turno asignado';
  $('teNuevoCuerpo').value = `Hola ${p ? p.nombre : ''},\n\nNecesitamos que trabajes el día ${fecha} en el turno ${turnoTxt}, día en el que no tienes turno asignado.\n\nAccede a la app Personal4Pax con tu usuario y contraseña habituales y entra en "Mis Documentos": ahí encontrarás esta solicitud para aceptarla o declinarla. Tu respuesta queda registrada automáticamente y, si la aceptas, se refleja sola en tu cuadrante — no hace falta que avises por ningún otro medio.\n\nUn saludo,\nPersonal4Pax — RR.HH.`;
}
let _enviandoTurnoExtraNuevo = false;
async function enviarTurnoExtraNuevo() {
  if (_enviandoTurnoExtraNuevo) return;
  const trabajadorId = $('teNuevoPersona').value;
  const fecha = $('teNuevoFecha').value;
  const turnoId = $('teNuevoTurno').value;
  const destinatario = $('teNuevoDestinatario').value.trim();
  const asunto = $('teNuevoAsunto').value.trim();
  const cuerpo = $('teNuevoCuerpo').value.trim();
  const cc = $('teNuevoCC').value.trim() || null;
  if (!trabajadorId || !fecha || !turnoId || !destinatario || !asunto || !cuerpo) {
    mostrarToast('⚠️ Completa persona, fecha, turno y el correo antes de enviar', false);
    return;
  }
  _enviandoTurnoExtraNuevo = true;
  const btn = $('btnEnviarTurnoExtraNuevo');
  btn.disabled = true;
  try {
    const p = empleadosCache.find((x) => x.id === trabajadorId);
    const t = cuadrantesCatalogoCache.find((x) => x.id === turnoId);
    // 1) "documentos" primero (igual que llamamientos) — es lo que la persona verá y abrirá desde
    // "Mis Documentos" en cuanto le llegue el correo.
    const { data: nuevoDoc, error: errorDoc } = await sb
      .from('documentos')
      .insert({
        hotel_id: usuarioActual.hotel_id,
        trabajador_id: trabajadorId,
        tipo: 'turno_extra',
        nombre: `Turno extra — ${p ? p.nombre : ''} — ${fechaCorta(fecha)}`,
        meta: JSON.stringify({ motivo: $('teNuevoMotivo').value.trim() || null })
      })
      .select()
      .single();
    if (errorDoc) {
      mostrarToast('Error al preparar la solicitud: ' + errorDoc.message, false);
      return;
    }
    // 2) El expediente real (turnos_extra_solicitudes) — lo que responde el RPC responder_turno_extra.
    const { error: errorTe } = await sb.from('turnos_extra_solicitudes').insert({
      hotel_id: usuarioActual.hotel_id,
      trabajador_id: trabajadorId,
      fecha,
      turno_id: turnoId,
      motivo: $('teNuevoMotivo').value.trim() || null,
      documento_id: nuevoDoc.id,
      creado_por: usuarioActual.nombre
    });
    if (errorTe) {
      mostrarToast('Error al crear la solicitud: ' + errorTe.message, false);
      return;
    }
    // 3) Correo real — mismo RPC de siempre (enviar_correo_externo), un solo punto de salida.
    const { error: errorCorreo } = await sb.rpc('enviar_correo_externo', {
      p_destinatario_email: destinatario,
      p_cc_email: cc,
      p_asunto: asunto,
      p_cuerpo: cuerpo,
      p_referencia_tabla: 'turnos_extra_solicitudes',
      p_referencia_id: nuevoDoc.id
    });
    mostrarToast(errorCorreo ? 'La solicitud se creó, pero el correo falló: ' + errorCorreo.message : `Solicitud enviada ✓ (${destinatario}${cc ? ' · CC: ' + cc : ''})` , !errorCorreo);
    await registrarAuditoria('Incidencias de Nómina', 'Turno extra solicitado', `${p ? p.nombre : trabajadorId} — ${fechaCorta(fecha)} — ${t ? t.nombre : turnoId}`);
    cerrarTurnoExtraNuevoModal();
    await cargarIncidenciasNominaAdmin();
  } finally {
    _enviandoTurnoExtraNuevo = false;
    btn.disabled = false;
  }
}
function abrirTurnoExtraGestionModal(id) {
  const t = turnosExtraCache.find((x) => x.id === id);
  if (!t) return;
  currentTurnoExtraId = id;
  const nombre = t.personas_trabajadoras ? t.personas_trabajadoras.nombre : '—';
  $('teGestionTitulo').textContent = `📣 Turno extra — ${nombre}`;
  $('teGestionMeta').textContent = `${t.turnos_catalogo ? t.turnos_catalogo.nombre : '—'} · Fecha: ${fechaCorta(t.fecha)}${t.motivo ? ' · Motivo: ' + t.motivo : ''}`;
  const est = TE_ESTADOS[t.estado] || ['—', 'b-slate'];
  $('teGestionRespuesta').innerHTML = t.respuesta_trabajador_en
    ? `<span class="badge2 ${est[1]}">${est[0]}</span><br><span class="sub-c">Respondió el ${new Date(t.respuesta_trabajador_en).toLocaleString('es-ES')}${t.respuesta_trabajador ? ' — 💬 "' + t.respuesta_trabajador + '"' : ''}</span>`
    : `<span class="badge2 ${est[1]}">${est[0]}</span><br><span class="sub-c">Todavía no ha respondido desde su app.</span>`;
  $('btnTeGestionDeclinarManual').style.display = t.estado === 'enviado' ? '' : 'none';
  $('modalTurnoExtraGestion').classList.remove('hidden');
}
function cerrarTurnoExtraGestionModal() { $('modalTurnoExtraGestion').classList.add('hidden'); }
// César (mismo criterio que Llamamientos): si la persona responde por un canal que la app no
// captura (p. ej. por teléfono), RR.HH. necesita poder dejarlo reflejado igualmente.
async function marcarTurnoExtraDeclinadoManual() {
  if (!currentTurnoExtraId) return;
  const t = turnosExtraCache.find((x) => x.id === currentTurnoExtraId);
  if (!t) return;
  if (!confirm(`¿Marcar como declinado el turno extra de ${t.personas_trabajadoras ? t.personas_trabajadoras.nombre : ''}? Úsalo solo si respondió por un canal que la app no registra (p. ej. por teléfono).`)) return;
  const { error } = await sb.from('turnos_extra_solicitudes').update({ estado: 'declinado', respuesta_trabajador_tipo: 'declina', respuesta_trabajador: 'Registrado a mano por RR.HH. (respuesta fuera de la app)', respuesta_trabajador_en: new Date().toISOString() }).eq('id', currentTurnoExtraId);
  mostrarToast(error ? 'Error: ' + error.message : 'Marcado como declinado ✓', !error);
  if (!error) {
    await registrarAuditoria('Incidencias de Nómina', 'Turno extra marcado declinado a mano', t.personas_trabajadoras ? t.personas_trabajadoras.nombre : t.trabajador_id);
    cerrarTurnoExtraGestionModal();
    await cargarIncidenciasNominaAdmin();
  }
}

// ---- Informe del periodo (vista/Excel bajo demanda, ad hoc) + informe DIARIO (el que de verdad
// se envía cada mañana: César — "el día lunes envías el informe del día anterior [...] se tiene
// que enviar así, tal cual [...] quiero en el correo un texto corporativo [...] las incidencias
// del día vencido, y el archivo del acumulado"). Mismo patrón de base que el informe de
// expediente de Candidato (ver/Excel/enviar editable), con el añadido del adjunto real
// (migración 0119) y el aviso de firmas pendientes antes de enviar. ----
const INOM_EXCEL_CABECERA = ['Fecha', 'Departamento', 'Persona', 'Tipo', 'Descripción', 'Observaciones', 'Coste (€)', 'Firma trabajador', 'Firma jefe/a de departamento', 'Firma RR.HH.'];
function _filaExcelIncidencia(i) {
  return [
    i.fecha,
    i.personas_trabajadoras ? i.personas_trabajadoras.departamento || '—' : '—',
    i.personas_trabajadoras ? i.personas_trabajadoras.nombre : i.trabajador_id,
    (INOM_TIPO_LABEL[i.tipo] || ['—'])[0].replace(/^\p{Emoji}\s*/u, ''),
    (i.descripcion || '') + (i.confidencial ? ' (CONFIDENCIAL)' : ''),
    i.observaciones || '',
    i.importe_euros != null ? Number(i.importe_euros).toFixed(2) : (i.horas != null ? `${i.horas} h` : ''),
    i.firma_trabajador_en ? `Firmado (${new Date(i.firma_trabajador_en).toLocaleDateString('es-ES')})` : 'Pendiente de firma',
    i.confidencial ? 'No aplica' : i.firma_jefe_departamento_en ? `Firmado (${new Date(i.firma_jefe_departamento_en).toLocaleDateString('es-ES')})` : 'Pendiente de firma',
    i.firma_rrhh_en ? `Firmado (${new Date(i.firma_rrhh_en).toLocaleDateString('es-ES')})` : 'Pendiente de firma'
  ];
}
function _textoInformeIncidenciasNomina() {
  const periodo = periodoNominaSeleccionado();
  const filas = incidenciasNominaDelPeriodo();
  const porPersona = new Map();
  filas.forEach((i) => {
    const nombre = i.personas_trabajadoras ? i.personas_trabajadoras.nombre : i.trabajador_id;
    if (!porPersona.has(nombre)) porPersona.set(nombre, []);
    porPersona.get(nombre).push(i);
  });
  const lineas = [
    `INFORME DE INCIDENCIAS DE NÓMINA — PERIODO ${periodo.etiqueta}`,
    `Personas con incidencias: ${porPersona.size} · Incidencias totales: ${filas.length}`,
    ''
  ];
  [...porPersona.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([nombre, items]) => {
    lineas.push(`— ${nombre}`);
    items.forEach((i) => {
      const tl = INOM_TIPO_LABEL[i.tipo] || ['—'];
      let detalle = i.descripcion || '';
      if (i.horas != null) detalle = `${i.horas} h` + (detalle ? ' — ' + detalle : '');
      if (i.importe_euros != null) detalle = `${Number(i.importe_euros).toFixed(2)} €` + (detalle ? ' — ' + detalle : '');
      lineas.push(`   ${fechaCorta(i.fecha)} · ${tl[0]}${i.confidencial ? ' 🔒 CONFIDENCIAL' : ''}${detalle ? ' — ' + detalle : ''}`);
    });
    lineas.push('');
  });
  return lineas.join('\n');
}
// César: "Ver es ver, que se abra en una ventana para ver. Luego, si lo quiero imprimir, que salga
// el botón de imprimir y ya lo imprimiré" — la ventana ya NO dispara la impresión sola; el botón
// "🖨 Imprimir" se queda fijo arriba y solo actúa si el usuario lo pulsa (se omite del propio
// print con @media print, para no imprimir el botón).
function verInformeIncidenciasNomina() {
  const periodo = periodoNominaSeleccionado();
  const w = window.open('', '_blank');
  if (!w) { mostrarToast('El navegador ha bloqueado la ventana — permite las ventanas emergentes para este sitio.', false); return; }
  w.document.write(`<!doctype html><html><head><meta charset="UTF-8"><title>Incidencias de Nómina — ${periodo.etiqueta}</title>
    <style>
      body{font-family:sans-serif;padding:24px;color:#1e293b;white-space:pre-wrap;font-size:13px;}
      .barra-imprimir{position:sticky;top:0;background:#fff;padding:0 0 14px;margin:-24px -24px 14px;padding:14px 24px;border-bottom:1px solid #e2e8f0;}
      .barra-imprimir button{font:inherit;padding:7px 14px;border-radius:6px;border:1px solid #16a34a;background:#16a34a;color:#fff;cursor:pointer;}
      @media print{.barra-imprimir{display:none;}}
    </style>
    </head><body>
    <div class="barra-imprimir"><button type="button" onclick="window.print()">🖨 Imprimir</button></div>
    ${_escHtml(_textoInformeIncidenciasNomina())}</body></html>`);
  w.document.close();
  w.focus();
}
function _libroExcel(filas) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([INOM_EXCEL_CABECERA, ...filas.map(_filaExcelIncidencia)]), 'Incidencias');
  return wb;
}
function exportarIncidenciasNominaExcel() {
  const periodo = periodoNominaSeleccionado();
  const filas = incidenciasNominaDelPeriodo();
  XLSX.writeFile(_libroExcel(filas), `Incidencias_Nomina_${periodo.desde}_a_${periodo.hasta}.xlsx`);
  registrarAuditoria('Incidencias de Nómina', 'Exportación a Excel', periodo.etiqueta);
  mostrarToast('Informe exportado a Excel ✓', true);
}

// ---- Informe DIARIO — "el día vencido" (ayer) en el cuerpo, el acumulado del periodo en el
// adjunto. Es la tarea real de cada mañana: se avisa si a alguna incidencia de ayer le falta
// cualquiera de las 3 firmas, pero no se bloquea el envío — la decisión de esperar o enviar
// igualmente es de RR.HH. ----
function _ayerIso() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return _isoSoloFecha(d);
}
function _textoCorporativoInformeDiario(filasDia, fechaIso) {
  const fechaTxt = new Date(fechaIso + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const lineas = [
    'Buenos días,',
    '',
    `Les remitimos el informe de Incidencias de Nómina correspondiente al día ${fechaTxt}, dentro del periodo de nómina ${periodoNominaSeleccionado().etiqueta}.`,
    ''
  ];
  if (!filasDia.length) {
    lineas.push('No se ha registrado ninguna incidencia de nómina en la fecha indicada.');
  } else {
    lineas.push(`Incidencias del día (${filasDia.length}):`, '');
    filasDia.forEach((i) => {
      const tl = INOM_TIPO_LABEL[i.tipo] || ['—'];
      const nombre = i.personas_trabajadoras ? i.personas_trabajadoras.nombre : i.trabajador_id;
      const depto = i.personas_trabajadoras ? i.personas_trabajadoras.departamento || '—' : '—';
      let detalle = i.descripcion || '';
      if (i.importe_euros != null) detalle += (detalle ? ' — ' : '') + `${Number(i.importe_euros).toFixed(2)} €`;
      if (i.horas != null) detalle += (detalle ? ' — ' : '') + `${i.horas} h`;
      const firmaTrab = i.firma_trabajador_en ? 'Firmado' : 'Pendiente de firma';
      const firmaJefe = i.confidencial ? 'No aplica' : i.firma_jefe_departamento_en ? 'Firmado' : 'Pendiente de firma';
      const firmaRrhh = i.firma_rrhh_en ? 'Firmado' : 'Pendiente de firma';
      lineas.push(`• ${nombre} (${depto}) — ${tl[0].replace(/^\p{Emoji}\s*/u, '')}${i.confidencial ? ' [CONFIDENCIAL]' : ''}${detalle ? ' — ' + detalle : ''}`);
      lineas.push(`   Firmas — Trabajador: ${firmaTrab} · Jefe/a de departamento: ${firmaJefe} · RR.HH.: ${firmaRrhh}`);
    });
  }
  lineas.push(
    '',
    'Se adjunta el Excel con el acumulado completo del periodo de nómina en curso.',
    '',
    'Quedamos a su disposición para cualquier aclaración.',
    '',
    'Un saludo,',
    'Personal4Pax — Recursos Humanos'
  );
  return lineas.join('\n');
}
function abrirEnviarInformeIncidenciasNominaModal() {
  const fechaIso = _ayerIso();
  const filasDia = incidenciasNominaCache.filter((i) => i.fecha === fechaIso);
  const sinFirmar = filasDia.filter((i) => !_firmasCompletas(i));
  $('inomInformeAvisoFirmas').style.display = sinFirmar.length ? '' : 'none';
  $('inomInformeAvisoFirmas').innerHTML = sinFirmar.length
    ? `⚠️ ${sinFirmar.length} de las ${filasDia.length} incidencias de ayer todavía no tienen las 3 firmas completas: ${sinFirmar.map((i) => i.personas_trabajadoras ? i.personas_trabajadoras.nombre : i.trabajador_id).join(', ')}. Puedes esperar a que firmen o enviar igualmente.`
    : '';
  $('inomInformeDestinatario').value = '';
  $('inomInformeCC').value = '';
  sb.rpc('rrhh_emails_hotel').then(({ data }) => {
    if (data) {
      if (!$('inomInformeDestinatario').value) $('inomInformeDestinatario').value = data;
      if (!$('inomInformeCC').value) $('inomInformeCC').value = data;
    }
  });
  $('inomInformeAsunto').value = `Informe diario de Incidencias de Nómina — ${fechaCorta(fechaIso)}`;
  $('inomInformeCuerpo').value = _textoCorporativoInformeDiario(filasDia, fechaIso);
  $('modalEnviarInformeIncidenciasNomina').classList.remove('hidden');
}
function cerrarEnviarInformeIncidenciasNominaModal() { $('modalEnviarInformeIncidenciasNomina').classList.add('hidden'); }
async function enviarInformeIncidenciasNomina(btn) {
  const destinatario = $('inomInformeDestinatario').value.trim();
  const cc = $('inomInformeCC').value.trim() || null;
  const asunto = $('inomInformeAsunto').value.trim();
  const cuerpo = $('inomInformeCuerpo').value.trim();
  if (!destinatario || !asunto || !cuerpo) {
    mostrarToast('⚠️ Completa destinatario, asunto y cuerpo antes de enviar', false);
    return;
  }
  const textoBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
  try {
    // Adjunto: el acumulado COMPLETO del periodo en curso (no solo el día) — "el archivo adjunto
    // sí, con todo el acumulado desde el inicio del periodo".
    const periodo = periodoNominaSeleccionado();
    const base64 = XLSX.write(_libroExcel(incidenciasNominaDelPeriodo()), { type: 'base64', bookType: 'xlsx' });
    const { error } = await sb.rpc('enviar_correo_externo', {
      p_destinatario_email: destinatario,
      p_cc_email: cc,
      p_asunto: asunto,
      p_cuerpo: cuerpo,
      p_referencia_tabla: 'incidencias_nomina',
      p_referencia_id: null,
      p_adjunto_nombre: `Incidencias_Nomina_Acumulado_${periodo.desde}_a_${periodo.hasta}.xlsx`,
      p_adjunto_base64: base64
    });
    if (error) {
      mostrarToast('Error al enviar el informe: ' + error.message, false);
      return;
    }
    mostrarToast(`Informe diario enviado ✓ Para: ${destinatario}${cc ? ' · CC: ' + cc : ''}`, true);
    await registrarAuditoria('Incidencias de Nómina', 'Informe diario enviado por correo', `${destinatario} — adjunto acumulado del periodo ${periodo.etiqueta}`);
    cerrarEnviarInformeIncidenciasNominaModal();
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
  }
}

// ---------- Informes (admin) ----------
// Caches propias de Informes — independientes de las de otras pantallas (cargarInformesAdmin
// corre en paralelo con el resto de cargar*Admin() dentro de cargarTodo(); leer una caché
// rellenada por OTRA función en ese mismo Promise.all reproduciría la misma carrera que se
// corrigió en Cuadrantes, así que cada fetch de Informes es independiente).
let informesBajasMedicasCache = [];
let informesCesesCache = [];
let informesFormacionCatCache = [];

async function cargarInformesAdmin() {
  const [{ data: personal }, { data: accidentes }, { data: bajas }, { data: candidatos }, { data: expedientes }, { data: formacionCat }] = await Promise.all([
    sb.from('personas_trabajadoras').select('*'),
    sb.from('accidentes_trabajo').select('*'),
    sb.from('bajas_medicas').select('*, personas_trabajadoras(nombre, puesto, puesto_key)').order('fecha_inicio', { ascending: false }),
    sb.from('candidatos').select('*'),
    sb.from('expedientes_disciplinarios').select('*'),
    sb.from('formacion_cursos_catalogo').select('*')
  ]);
  const plantilla = personal || [];
  const activos = plantilla.filter((p) => (p.estado_laboral || 'Activo') === 'Activo').length;
  const bajasVoluntarias = plantilla.filter((p) => p.estado_laboral === 'Baja voluntaria').length;
  informesBajasMedicasCache = bajas || [];
  // Bug corregido en auditoría: comprobaba b.fecha_fin, columna que no existe en bajas_medicas
  // (la real es fecha_alta) — por eso "Bajas médicas abiertas" contaba siempre el total, nunca
  // solo las abiertas.
  const bajasMedicasAbiertas = informesBajasMedicasCache.filter((b) => !b.fecha_alta).length;
  const rotacionAnual = plantilla.length ? ((bajasVoluntarias / plantilla.length) * 100).toFixed(1) : '0.0';
  const altasDesdeProceso = (candidatos || []).filter((c) => c.estado === 'alta_realizada').length;
  informesCesesCache = plantilla.filter((p) => p.motivo_cese);
  informesFormacionCatCache = formacionCat || [];

  if ($('informesKpis')) {
    $('informesKpis').innerHTML = `
      <div class="card kpi"><div class="ic">👥</div><div><div class="t">Plantilla activa</div><div class="v">${activos}</div></div></div>
      <div class="card kpi"><div class="ic">🔁</div><div><div class="t">Rotación (bajas voluntarias / plantilla)</div><div class="v">${rotacionAnual}%</div></div></div>
      <div class="card kpi"><div class="ic">🩺</div><div><div class="t">Bajas médicas abiertas</div><div class="v">${bajasMedicasAbiertas}</div></div></div>
      <div class="card kpi"><div class="ic">🧑‍💼</div><div><div class="t">Altas vía candidatura</div><div class="v">${altasDesdeProceso}</div></div></div>
      <div class="card kpi"><div class="ic">🚑</div><div><div class="t">Accidentes de trabajo (total)</div><div class="v">${(accidentes || []).length}</div></div></div>
      <div class="card kpi"><div class="ic">⚖️</div><div><div class="t">Expedientes disciplinarios (total)</div><div class="v">${(expedientes || []).length}</div></div></div>`;
  }

  if ($('informesBajasMedicas')) {
    $('informesBajasMedicas').innerHTML = `
      <h2 class="pg-title" style="margin:0 0 4px;">🩺 Bajas médicas</h2>
      <div style="overflow-x:auto;"><table><thead><tr><th>Persona trabajadora</th><th>Motivo</th><th>Fecha de la baja</th><th>Duración prevista</th><th>Fecha del alta</th></tr></thead>
      <tbody>${
        informesBajasMedicasCache.length
          ? informesBajasMedicasCache
              .map(
                (b) =>
                  `<tr><td>${b.personas_trabajadoras ? b.personas_trabajadoras.nombre : '—'}</td><td>${b.motivo || '—'}</td><td>${b.fecha_inicio ? new Date(b.fecha_inicio).toLocaleDateString('es-ES') : '—'}</td><td>${b.dias ? b.dias + ' días' : '—'}</td><td>${b.fecha_alta ? new Date(b.fecha_alta).toLocaleDateString('es-ES') : 'En curso'}</td></tr>`
              )
              .join('')
          : '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin bajas médicas registradas.</td></tr>'
      }</tbody></table></div>`;
  }

  if ($('informesFormacionCatalogo')) {
    const totalHoras = informesFormacionCatCache.reduce((s, c) => s + Number(c.horas || 0), 0);
    const totalCoste = informesFormacionCatCache.reduce((s, c) => s + Number(c.coste || 0), 0);
    $('informesFormacionCatalogo').innerHTML = `
      <h2 class="pg-title" style="margin:0 0 4px;">🎓 Formación obligatoria — catálogo de cursos</h2>
      <p class="pg-sub" style="margin:0 0 10px;">Mismo catálogo y coste que el módulo de Formación (coste y horas por persona, editables en esa pantalla).</p>
      <div style="overflow-x:auto;"><table><thead><tr><th>Curso</th><th>Etiqueta</th><th>Horas/persona</th><th>Coste/persona</th></tr></thead>
      <tbody>${
        informesFormacionCatCache.length
          ? informesFormacionCatCache
              .map((c) => `<tr><td>${c.nombre}</td><td>${c.etiqueta || '—'}</td><td>${Number(c.horas || 0).toFixed(1)} h</td><td>${fmtEur(c.coste)}</td></tr>`)
              .join('') + `<tr style="font-weight:700;"><td colspan="2">Total catálogo (${informesFormacionCatCache.length} cursos)</td><td>${totalHoras.toFixed(1)} h</td><td>${fmtEur(totalCoste)}</td></tr>`
          : '<tr><td colspan="4" class="sub-c" style="text-align:center;padding:14px;">Sin catálogo de formación todavía.</td></tr>'
      }</tbody></table></div>`;
  }
  // El desglose de coste de cobertura (EPI+Formación+Entrevista+Vigilancia), las Escalas según
  // Ocupación y la tabla de Bajas por cese (necesita el coste medio por puesto ya calculado)
  // se renderizan en informesCosteCobertura/informesBajasCese desde renderInformeEjecutivoCompleto(),
  // una vez cargarDireccionEjecutivaAdmin() ha calculado los datos reales — ver cargarTodo().
}

// César: "revisa el circuito... y cómo se registra en informe" — puesto_evaluaciones (Descripción
// de puesto → Evaluación de desempeño) no aparecía en ningún informe, solo en esa misma pantalla.
// Consulta propia, independiente de cargarInformesAdmin() (ambas corren en paralelo dentro de
// cargarTodo(), así que no puede depender de un caché que otra función todavía no haya llenado),
// con el estado real de firma y envío de cada evaluación (migración 0089: firmado_en/documento_id).
async function cargarInformesEvaluacionesDesempeno() {
  const { data } = await sb.from('puesto_evaluaciones').select('*, personas_trabajadoras(nombre)').order('created_at', { ascending: false });
  const filas = data || [];
  const el = $('informesEvaluacionesDesempeno');
  if (!el) return;
  el.innerHTML = `
    <h2 class="pg-title" style="margin:0 0 4px;">📊 Evaluaciones de desempeño por puesto</h2>
    <p class="pg-sub" style="margin:0 0 10px;">Cada evaluación se firma con el nombre de quien la realiza y se envía a Mis Documentos de la persona evaluada — circuito completo en Organigrama → Descripción de puesto.</p>
    <div style="overflow-x:auto;"><table><thead><tr><th>Persona trabajadora</th><th>Puesto</th><th>Evaluador/a</th><th>Fecha</th><th>Puntuación</th><th>Firma</th><th>Envío</th></tr></thead>
    <tbody>${
      filas.length
        ? filas
            .map((f) => {
              const badge = `<span class="badge2 ${f.total_ponderado >= 70 ? 'b-emerald' : f.total_ponderado >= 50 ? 'b-amber' : 'b-rose'}">${Number(f.total_ponderado).toFixed(1)}%</span>`;
              const firma = f.firmado_en ? `✍ ${fechaCorta(f.firmado_en)}` : '<span class="sub-c">Sin firmar</span>';
              const envio = f.documento_id ? '<span class="badge2 b-emerald">Enviada</span>' : '<span class="badge2 b-amber">Sin enviar</span>';
              return `<tr><td>${f.personas_trabajadoras ? f.personas_trabajadoras.nombre : '—'}</td><td>${f.puesto_key}</td><td>${f.evaluador || '—'}</td><td>${fechaCorta(f.created_at)}</td><td>${badge}</td><td>${firma}</td><td>${envio}</td></tr>`;
            })
            .join('')
        : '<tr><td colspan="7" class="sub-c" style="text-align:center;padding:14px;">Sin evaluaciones de desempeño registradas todavía.</td></tr>'
    }</tbody></table></div>`;
}

// ---------- Panel de Dirección (general, admin) ----------
async function cargarPanelDireccionGeneralAdmin() {
  const [{ data: personal }, { data: vacPend }, { data: incAbiertas }, { data: accidentes }, { data: denuncias }, { data: expedientes }, { data: sugerencias }, { data: candidatos }] = await Promise.all([
    sb.from('personas_trabajadoras').select('*'),
    sb.from('vacaciones_solicitudes').select('*').eq('estado', 'pendiente'),
    sb.from('incidencias').select('*').eq('estado', 'abierta'),
    sb.from('accidentes_trabajo').select('*').neq('estado', 'cerrado'),
    sb.from('denuncias').select('*').in('estado', ['recibida', 'investigacion']),
    sb.from('expedientes_disciplinarios').select('*').in('estado', ['abierto', 'alegaciones']),
    sb.from('sugerencias').select('*').eq('estado', 'nueva'),
    sb.from('candidatos').select('*').not('estado', 'in', '("aprobado","rechazado","alta_realizada")')
  ]);
  if (!$('panelDireccionGeneralKpis')) return;
  $('panelDireccionGeneralKpis').innerHTML = `
    <div class="card kpi"><div class="ic">👥</div><div><div class="t">Plantilla total</div><div class="v">${(personal || []).length}</div></div></div>
    <div class="card kpi"><div class="ic">🌴</div><div><div class="t">Vacaciones pendientes</div><div class="v">${(vacPend || []).length}</div></div></div>
    <div class="card kpi"><div class="ic">⚠</div><div><div class="t">Incidencias abiertas</div><div class="v">${(incAbiertas || []).length}</div></div></div>
    <div class="card kpi"><div class="ic">🚑</div><div><div class="t">Accidentes sin cerrar</div><div class="v">${(accidentes || []).length}</div></div></div>
    <div class="card kpi"><div class="ic">🚨</div><div><div class="t">Denuncias abiertas</div><div class="v">${(denuncias || []).length}</div></div></div>
    <div class="card kpi"><div class="ic">⚖️</div><div><div class="t">Expedientes disciplinarios abiertos</div><div class="v">${(expedientes || []).length}</div></div></div>
    <div class="card kpi"><div class="ic">💡</div><div><div class="t">Sugerencias sin revisar</div><div class="v">${(sugerencias || []).length}</div></div></div>
    <div class="card kpi"><div class="ic">🧑‍💼</div><div><div class="t">Candidaturas en proceso</div><div class="v">${(candidatos || []).length}</div></div></div>`;
}

// =====================================================================
// Comunidad (admin) — muro de publicaciones, reacciones y moderación.
// Reutiliza comunidad_posts / comunidad_reacciones de la Fase 2 (0016_comunidad.sql).
// =====================================================================
let comunidadAdminCache = [];
let comunidadReaccionesAdminCache = [];
let comunidadRespuestasCountCache = {};
let comunidadVistasAdminCache = {};
let comunidadRespuestaAdminContext = null; // { postId }

async function cargarComunidadAdmin() {
  const [{ data: posts }, { data: reacciones }, { data: respuestas }, { data: vistas }] = await Promise.all([
    sb.from('comunidad_posts').select('*').order('created_at', { ascending: false }),
    sb.from('comunidad_reacciones').select('*'),
    sb.from('comunidad_respuestas').select('post_id'),
    sb.from('comunidad_vistas').select('post_id')
  ]);
  comunidadAdminCache = posts || [];
  comunidadReaccionesAdminCache = reacciones || [];
  comunidadRespuestasCountCache = {};
  (respuestas || []).forEach((r) => (comunidadRespuestasCountCache[r.post_id] = (comunidadRespuestasCountCache[r.post_id] || 0) + 1));
  comunidadVistasAdminCache = {};
  (vistas || []).forEach((v) => (comunidadVistasAdminCache[v.post_id] = (comunidadVistasAdminCache[v.post_id] || 0) + 1));
  const EMOJIS = ['👍', '❤️', '🎉'];
  $('comunidadAdminMuro').innerHTML =
    comunidadAdminCache
      .map((p) => {
        const propias = comunidadReaccionesAdminCache.filter((r) => r.post_id === p.id);
        const botones = EMOJIS.map((em) => {
          const deEsteEmoji = propias.filter((r) => r.emoji === em);
          const yoReaccione = deEsteEmoji.some((r) => r.admin_id === usuarioActual.id);
          return `<button type="button" class="btn btn-secondary btn-sm" style="padding:3px 8px;${yoReaccione ? 'background:var(--brand-50);border-color:var(--brand-400);' : ''}" onclick="toggleReaccionComunidadAdmin('${p.id}','${em}')">${em}${deEsteEmoji.length ? ' ' + deEsteEmoji.length : ''}</button>`;
        }).join(' ');
        const nRespuestas = comunidadRespuestasCountCache[p.id] || 0;
        const nVistas = comunidadVistasAdminCache[p.id] || 0;
        return `<div class="card card-pad" style="margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
            <div><b style="font-size:12.5px;">${p.autor_nombre}</b> ${p.pinned ? '<span class="badge2 b-brand">📌 Fijado</span>' : ''}<p class="sub-c" style="margin:2px 0 6px;">${new Date(p.created_at).toLocaleString('es-ES')} · ${p.kind} · 👁 Visto por ${nVistas}</p></div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="togglePinComunidad('${p.id}', ${!p.pinned})">${p.pinned ? 'Desfijar' : '📌 Fijar'}</button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="borrarComunicado('${p.id}')">🗑 Eliminar</button>
            </div>
          </div>
          <p style="margin:0 0 6px;">${p.texto}</p>
          ${p.imagen_url ? `<img src="${p.imagen_url}" alt="" style="max-width:100%;border-radius:8px;margin-bottom:8px;display:block;">` : ''}
          ${p.enlace_url ? `<p style="margin:0 0 8px;"><a href="${p.enlace_url}" target="_blank" rel="noopener noreferrer">🔗 ${p.enlace_url}</a></p>` : ''}
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">${botones}<button type="button" class="btn btn-secondary btn-sm" onclick="abrirRespuestasComunidadAdmin('${p.id}')">💬 Respuestas${nRespuestas ? ' (' + nRespuestas + ')' : ''}</button></div>
        </div>`;
      })
      .join('') || '<p class="sub-c">Sin publicaciones todavía.</p>';
}

async function toggleReaccionComunidadAdmin(postId, emoji) {
  const existente = comunidadReaccionesAdminCache.find((r) => r.post_id === postId && r.admin_id === usuarioActual.id && r.emoji === emoji);
  if (existente) await sb.from('comunidad_reacciones').delete().eq('id', existente.id);
  else await sb.from('comunidad_reacciones').insert({ post_id: postId, admin_id: usuarioActual.id, emoji });
  await cargarComunidadAdmin();
}

async function abrirRespuestasComunidadAdmin(postId) {
  comunidadRespuestaAdminContext = { postId };
  $('textoRespuestaComunidadAdmin').value = '';
  await cargarRespuestasComunidadAdmin();
  $('modalComunidadRespuestas').classList.remove('hidden');
}
function cerrarRespuestasComunidadAdmin() {
  $('modalComunidadRespuestas').classList.add('hidden');
  comunidadRespuestaAdminContext = null;
}
async function cargarRespuestasComunidadAdmin() {
  if (!comunidadRespuestaAdminContext) return;
  const { data } = await sb.from('comunidad_respuestas').select('*').eq('post_id', comunidadRespuestaAdminContext.postId).order('created_at');
  $('listaRespuestasComunidadAdmin').innerHTML =
    (data || [])
      .map(
        (r) => `<div style="padding:6px 0;border-bottom:1px solid var(--slate-100);">
          <b style="font-size:12px;color:var(--ink-900);">${r.autor_nombre}</b>
          <span class="sub-c" style="margin-left:4px;">${new Date(r.created_at).toLocaleString('es-ES')}</span>
          <p style="margin:2px 0 0;font-size:12.5px;">${r.texto}</p>
        </div>`
      )
      .join('') || '<p class="sub-c">Sin respuestas todavía.</p>';
  const { data: vistas } = await sb.from('comunidad_vistas').select('trabajador_id, personas_trabajadoras(nombre)').eq('post_id', comunidadRespuestaAdminContext.postId);
  const nombres = (vistas || []).map((v) => (v.personas_trabajadoras ? v.personas_trabajadoras.nombre : null)).filter(Boolean);
  $('comunidadVistoPorAdmin').textContent = nombres.length ? `👁 Visto por: ${nombres.join(', ')}` : '👁 Todavía no la ha visto nadie.';
}
async function enviarRespuestaComunidadAdmin() {
  if (!comunidadRespuestaAdminContext) return;
  const texto = $('textoRespuestaComunidadAdmin').value.trim();
  if (!texto) return;
  const { error } = await sb.from('comunidad_respuestas').insert({
    post_id: comunidadRespuestaAdminContext.postId,
    hotel_id: usuarioActual.hotel_id,
    autor_admin_id: usuarioActual.id,
    autor_nombre: usuarioActual.nombre,
    texto
  });
  if (error) {
    mostrarToast('Error al responder: ' + error.message, false);
    return;
  }
  $('textoRespuestaComunidadAdmin').value = '';
  await cargarRespuestasComunidadAdmin();
  await cargarComunidadAdmin();
}
// Antes "Imagen adjunta" era una URL a pegar a mano (no una subida real — nunca se veía si la
// persona no tenía ya la imagen alojada en algún sitio) y no existía ningún campo de "enlace"
// independiente (César: "si adjuntas una imagen no te deja ni se ve, si adjuntas un enlace tampoco
// se ve... estos dos campos no se ven"). Ahora la imagen se sube de verdad al bucket público
// comunidad-imagenes (migración 0085) y el enlace es un campo propio que se muestra como link.
async function publicarComunicadoAdmin(e) {
  e.preventDefault();
  const texto = $('comAdminTexto').value.trim();
  if (!texto) return;
  const archivo = $('comAdminImagenArchivo') ? $('comAdminImagenArchivo').files[0] : null;
  const enlaceUrl = $('comAdminEnlace') ? $('comAdminEnlace').value.trim() : '';
  const fijar = $('comAdminFijar').checked;
  let imagenUrl = null;
  if (archivo) {
    const ruta = `${usuarioActual.hotel_id}/comunidad/${Date.now()}-${archivo.name}`;
    const { error: errorSubida } = await sb.storage.from('comunidad-imagenes').upload(ruta, archivo);
    if (errorSubida) {
      mostrarToast('Error al subir la imagen: ' + errorSubida.message, false);
      return;
    }
    imagenUrl = sb.storage.from('comunidad-imagenes').getPublicUrl(ruta).data.publicUrl;
  }
  if (fijar) await sb.from('comunidad_posts').update({ pinned: false }).eq('pinned', true).eq('hotel_id', usuarioActual.hotel_id);
  const { error } = await sb.from('comunidad_posts').insert({
    hotel_id: usuarioActual.hotel_id,
    autor_trabajador_id: null,
    autor_nombre: usuarioActual.nombre,
    kind: 'Comunicado',
    texto,
    imagen_url: imagenUrl,
    enlace_url: enlaceUrl || null,
    pinned: fijar
  });
  mostrarToast(error ? 'Error al publicar: ' + error.message : 'Comunicado publicado ✓', !error);
  if (!error) {
    $('formComunicadoAdmin').reset();
    await cargarComunidadAdmin();
    await registrarAuditoria('Comunidad', 'Comunicado publicado', texto.slice(0, 60));
  }
}
async function togglePinComunidad(id, pinned) {
  if (pinned) await sb.from('comunidad_posts').update({ pinned: false }).eq('pinned', true).eq('hotel_id', usuarioActual.hotel_id);
  await sb.from('comunidad_posts').update({ pinned }).eq('id', id);
  await cargarComunidadAdmin();
}
async function borrarComunicado(id) {
  if (!confirm('¿Eliminar esta publicación del muro? Esta acción no se puede deshacer.')) return;
  const { error } = await sb.from('comunidad_posts').delete().eq('id', id);
  mostrarToast(error ? 'Error al eliminar: ' + error.message : 'Publicación eliminada ✓', !error);
  if (!error) {
    await cargarComunidadAdmin();
    await registrarAuditoria('Comunidad', 'Publicación eliminada', id);
  }
}

// =====================================================================
// Panel de Dirección — motor real de Coste de Cobertura de Plantilla
// (EPI/Uniformidad + Formación obligatoria + Entrevista + Vigilancia de la Salud)
// y Escalas según Ocupación (ajuste de turnos/personal a la ocupación real de
// habitaciones). Réplica fiel del motor de cálculo del prototipo, pero sobre datos
// reales de Supabase (coef_departamentos, coef_parametros, epi_catalogo_puesto,
// formacion_catalogo_modulos, vigilancia_salud, candidatos, ocupacion_habitaciones).
// Fuente única de verdad: todo lo que lee Panel de Dirección e Informes sale de aquí.
// =====================================================================
const ESCALAS_SALARIO_CONVENIO = {
  fuente: 'Convenio Colectivo de Hostelería de las Illes Balears — tablas salariales vigentes (categoría de establecimiento B, de referencia)',
  pagasAnuales: 14,
  niveles: [
    { nivel: 'Nivel III — Recepcionista', brutoMensual: 1961.35 },
    { nivel: 'Nivel IV — Camarero/a, Camarero/a de pisos, Cocinero/a', brutoMensual: 1819.9 },
    { nivel: 'Nivel V — Ayudante de cocina/camarero', brutoMensual: 1702.69 },
    { nivel: 'Nivel VI — Personal sin cualificación / Mantenimiento', brutoMensual: 1613.71 }
  ]
};
const ESCALAS_SALARIO_DIRECCION = {
  fuente: 'Convenio Colectivo de Hostelería de las Illes Balears (jefaturas). Dirección General fuera de convenio: cifra estimada de referencia.',
  pagasAnuales: 14,
  nivelI: 2278.01,
  nivelII: 2119.59
};
function salarioBrutoMensualPromedioConvenio() {
  const n = ESCALAS_SALARIO_CONVENIO.niveles;
  return n.reduce((s, x) => s + x.brutoMensual, 0) / n.length;
}
function costeSalarialPorTurnoDesde(salarioBrutoMensual, pagasAnuales, p) {
  const salarioAnual = salarioBrutoMensual * pagasAnuales;
  const costeHora = salarioAnual / Number(p.horas_convenio_anuales || 1776);
  return costeHora * Number(p.horas_turno_estandar || 8);
}
// Formato de Euro exigido explícitamente por César para toda cifra económica: "00.000,00 €"
// (separador de miles ".", 2 decimales siempre con coma, símbolo final) — antes maximumFractionDigits
// sin minimumFractionDigits dejaba caer los decimales en números redondos (p.ej. "1.234 €" en vez
// de "1.234,00 €"), inconsistente con el resto de cifras que sí llevaban céntimos.
function fmtEur(n) {
  return (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

let direccionData = null;

async function cargarDireccionEjecutivaAdmin() {
  const [{ data: paramsRows }, { data: deptos }, { data: deptosDir }, { data: epi }, { data: formacionCat }, { data: formacionReq }, { data: vigilancia }, { data: ocupacion }, { data: personal }, { data: ceses }, { data: bajasAbiertas }] = await Promise.all([
    sb.from('coef_parametros').select('*').eq('hotel_id', usuarioActual.hotel_id).maybeSingle(),
    sb.from('coef_departamentos').select('*'),
    sb.from('coef_departamentos_direccion').select('*'),
    sb.from('epi_catalogo_puesto').select('*'),
    sb.from('formacion_cursos_catalogo').select('*'),
    sb.from('formacion_requisitos_puesto').select('*'),
    sb.from('vigilancia_salud').select('trabajador_id'),
    sb.from('ocupacion_habitaciones').select('*'),
    sb.from('personas_trabajadoras').select('id, puesto_key'),
    // Rotación (12 meses) y bajas médicas abiertas — para la Lectura para Dirección. Consultas propias
    // de este loader (no caches de otro módulo) para no repetir la condición de carrera entre
    // cargadores concurrentes que ya se corrigió una vez en Cuadrantes/Empleados.
    sb.from('personas_trabajadoras').select('id, fecha_cese').not('motivo_cese', 'is', null),
    sb.from('bajas_medicas').select('id').is('fecha_alta', null)
  ]);
  const p = paramsRows || { horas_convenio_anuales: 1776, tasa_absentismo_pct: 2.4, horas_turno_estandar: 8, coef_pct: 60.8, tarifa_hora_neta: 23, coste_revision_medica: 60, horas_revision_medica: 2, entrevista_minutos: 45, ss_porcentaje_empresa: 28, ocupacion_ref_pct: 80 };

  const personalPorPuesto = {};
  (personal || []).forEach((e) => {
    const k = e.puesto_key || '_sin_puesto_key';
    personalPorPuesto[k] = (personalPorPuesto[k] || 0) + 1;
  });

  // EPI/Uniformidad y Formación obligatoria por puesto — motor compartido con "Uniformidad y
  // EPIs" (calcularCosteEpiPuesto/calcularFormacionPuesto, definidos junto a esa pantalla), para
  // no duplicar la fórmula. Formación ya no usa una media plana del catálogo para todos los
  // puestos: formacion_requisitos_puesto (migración 0076) dice qué cursos aplican a cada uno.
  function epiPorPuesto(puestoKey) {
    return calcularCosteEpiPuesto(epi, puestoKey);
  }
  function formacionPorPuesto(puestoKey) {
    return calcularFormacionPuesto(formacionReq, formacionCat, puestoKey).coste;
  }
  function formacionHorasPorPuesto(puestoKey) {
    return calcularFormacionPuesto(formacionReq, formacionCat, puestoKey).horas;
  }

  const entrevistaCoste = (Number(p.entrevista_minutos) / 60) * Number(p.tarifa_hora_neta);
  const vigilanciaCosteUnit = Number(p.coste_revision_medica) + Number(p.horas_revision_medica) * Number(p.tarifa_hora_neta);
  const vigilanciaCandidatos = new Set((vigilancia || []).map((v) => v.trabajador_id)).size;
  const vigilanciaTotal = vigilanciaCandidatos * vigilanciaCosteUnit;
  const entrevistasTotal = (candidatosCache.length || 0) * entrevistaCoste;

  const deptosFilas = (deptos || []).map((d) => {
    const costeEpi = epiPorPuesto(d.puesto_key);
    const costeFormacion = formacionPorPuesto(d.puesto_key);
    const horasFormacion = formacionHorasPorPuesto(d.puesto_key);
    const costeUnit = costeEpi + costeFormacion;
    const headcount = personalPorPuesto[d.puesto_key] || 0;
    return { ...d, costeEpi, costeFormacion, horasFormacion, costeUnit, headcount, costeTotal: costeUnit * headcount };
  });
  const coberturaBaseTotal = deptosFilas.reduce((s, d) => s + d.costeTotal, 0);
  const coberturaConVigilancia = coberturaBaseTotal + vigilanciaTotal;
  const costeMedioEpi = deptosFilas.length ? deptosFilas.reduce((s, d) => s + d.costeEpi, 0) / deptosFilas.length : 0;
  const costeMedioFormacion = deptosFilas.length ? deptosFilas.reduce((s, d) => s + d.costeFormacion, 0) / deptosFilas.length : 0;
  // Antes era la media plana de horas del catálogo (igual para todos los puestos); ahora es la
  // media real de horas de formación obligatoria por puesto, con el mismo criterio que
  // costeMedioEpi/costeMedioFormacion (media simple entre departamentos, no ponderada por plantilla).
  const avgFormacionHorasPlano = deptosFilas.length ? deptosFilas.reduce((s, d) => s + d.horasFormacion, 0) / deptosFilas.length : 0;
  // "Coste promedio por persona trabajadora" — mismo criterio que computeAverageCostBreakdown()
  // del prototipo (v4pax-index-CORREGIDO.html:7300-7311): total ponderado por plantilla real
  // (EPI+Uniformidad y Formación sumados por headcount de cada puesto, Entrevista y Vigilancia
  // como coste por persona) dividido por el nº total de personas trabajadoras — no la media
  // simple entre departamentos (eso es costeMedioEpi/costeMedioFormacion, una métrica distinta,
  // usada en otro sitio). Antes esta pieza no existía en ningún cuadro del Informe Ejecutivo.
  const totalEmpleados = (personal || []).length;
  const epiTotalPonderado = deptosFilas.reduce((s, d) => s + d.costeEpi * d.headcount, 0);
  const formacionTotalPonderado = deptosFilas.reduce((s, d) => s + d.costeFormacion * d.headcount, 0);
  const entrevistaTotalPonderado = totalEmpleados * entrevistaCoste;
  const avgCoste = {
    n: totalEmpleados,
    epiTotal: epiTotalPonderado,
    epiAvg: totalEmpleados ? epiTotalPonderado / totalEmpleados : 0,
    formacionTotal: formacionTotalPonderado,
    formacionAvg: totalEmpleados ? formacionTotalPonderado / totalEmpleados : 0,
    entrevistaTotal: entrevistaTotalPonderado,
    entrevistaAvg: entrevistaCoste,
    vigilanciaTotal: vigilanciaTotal,
    vigilanciaAvg: totalEmpleados ? vigilanciaTotal / totalEmpleados : 0,
    total: epiTotalPonderado + formacionTotalPonderado + entrevistaTotalPonderado + vigilanciaTotal,
    totalAvg: totalEmpleados ? (epiTotalPonderado + formacionTotalPonderado + entrevistaTotalPonderado + vigilanciaTotal) / totalEmpleados : 0
  };

  const multiplicador = Number(p.coef_pct) ? 100 / Number(p.coef_pct) : 100 / 60.8;
  const salarioTurno = costeSalarialPorTurnoDesde(salarioBrutoMensualPromedioConvenio(), ESCALAS_SALARIO_CONVENIO.pagasAnuales, p);
  const ssFrac = Number(p.ss_porcentaje_empresa) / 100;

  const hoy = new Date();
  function fechasSemana(offsetSemanas) {
    const lunes = new Date(hoy);
    const diaSemana = (lunes.getDay() + 6) % 7;
    lunes.setDate(lunes.getDate() - diaSemana + offsetSemanas * 7);
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(lunes);
      d.setDate(lunes.getDate() + i);
      dias.push(d.toISOString().slice(0, 10));
    }
    return dias;
  }
  function ocupacionMediaSemana(offsetSemanas) {
    const dias = fechasSemana(offsetSemanas);
    const filas = (ocupacion || []).filter((o) => dias.includes(o.fecha));
    if (!filas.length) return null;
    const pcts = filas.map((o) => {
      const disp = Math.max(0, o.habitaciones_totales - o.habitaciones_bloqueadas);
      return disp > 0 ? Math.min(100, (o.habitaciones_vendidas / disp) * 100) : 0;
    });
    return pcts.reduce((s, x) => s + x, 0) / pcts.length;
  }
  const pctAnterior = ocupacionMediaSemana(-1);
  const pctActual = ocupacionMediaSemana(0);
  const pctProxima = ocupacionMediaSemana(1);
  const pctActivo = pctActual != null ? pctActual : Number(p.ocupacion_ref_pct);
  const factorOcupacion = pctActivo / Number(p.ocupacion_ref_pct);

  const escalasFilas = deptosFilas.map((d) => {
    const turnosBase = d.turnos_dia * (d.dias_cobertura / 365) * 7;
    const personalBase = d.turnos_dia * (d.dias_cobertura / 365) * multiplicador;
    const turnosAjustado = d.depende_ocupacion ? turnosBase * factorOcupacion : turnosBase;
    const personalAjustado = d.depende_ocupacion ? personalBase * factorOcupacion : personalBase;
    const costePersonalBase = turnosBase * salarioTurno;
    const costePersonalAjustado = turnosAjustado * salarioTurno;
    // Coste EPI+Formación+Entrevista ajustado a la ocupación real — mismo criterio que
    // computeEscalasOcupacion() del prototipo (v4pax-index-CORREGIDO.html:9972-9973): el coste de
    // cobertura por puesto (EPI/Uniformidad + Formación + Entrevista) escala con el personal
    // redondeado, no solo el coste salarial — antes esta pieza no se calculaba en ningún sitio.
    const costeEpiFormBase = d.costeUnit * Math.ceil(personalBase);
    const costeEpiFormAjustado = d.costeUnit * Math.ceil(personalAjustado);
    return {
      ...d,
      turnosBase,
      turnosAjustado,
      personalBase,
      personalAjustado,
      costePersonalBase,
      costePersonalAjustado,
      costeSSBase: costePersonalBase * ssFrac,
      costeSSAjustado: costePersonalAjustado * ssFrac,
      costeEpiFormBase,
      costeEpiFormAjustado
    };
  });
  // Alimentos & Bebidas (A&B) = Cocina + Sala/Restaurante — único centro de costo crítico que Dirección
  // sigue aparte (es el más sensible a ocupación y el de mayor variabilidad turno a turno).
  const abFilas = escalasFilas.filter((f) => f.puesto_key === 'cocina' || f.puesto_key === 'sala');
  const abSum = (campo) => abFilas.reduce((s, f) => s + f[campo], 0);
  const abCosteBase = abSum('costePersonalBase') + abSum('costeSSBase');
  const abCosteAjustado = abSum('costePersonalAjustado') + abSum('costeSSAjustado');
  const abResumen = {
    filas: abFilas,
    turnosBaseTotal: abSum('turnosBase'),
    turnosAjustadoTotal: abSum('turnosAjustado'),
    personalBaseTotal: abFilas.reduce((s, f) => s + Math.ceil(f.personalBase), 0),
    personalAjustadoTotal: abFilas.reduce((s, f) => s + Math.ceil(f.personalAjustado), 0),
    costePersonalBaseTotal: abSum('costePersonalBase'),
    costePersonalAjustadoTotal: abSum('costePersonalAjustado'),
    costeTotalBaseTotal: abCosteBase,
    costeTotalAjustadoTotal: abCosteAjustado,
    deltaCosteTotal: abCosteAjustado - abCosteBase,
    deltaCosteTotalPct: abCosteBase ? ((abCosteAjustado - abCosteBase) / abCosteBase) * 100 : 0
  };

  // Rotación (12 meses) y bajas médicas abiertas, para la Lectura para Dirección.
  const hace12Meses = new Date();
  hace12Meses.setFullYear(hace12Meses.getFullYear() - 1);
  const cesesUltimos12Meses = (ceses || []).filter((c) => c.fecha_cese && new Date(c.fecha_cese) >= hace12Meses).length;
  const tasaRotacion12m = ((personal || []).length ? (cesesUltimos12Meses / personal.length) * 100 : 0);
  const bajasMedicasAbiertasCount = (bajasAbiertas || []).length;

  const sumaE = (campo) => escalasFilas.reduce((s, f) => s + f[campo], 0);
  const turnosBaseTotal = sumaE('turnosBase');
  const turnosAjustadoTotal = sumaE('turnosAjustado');
  const personalBaseTotal = escalasFilas.reduce((s, f) => s + Math.ceil(f.personalBase), 0);
  const personalAjustadoTotal = escalasFilas.reduce((s, f) => s + Math.ceil(f.personalAjustado), 0);
  const costePersonalBaseTotal = sumaE('costePersonalBase');
  const costePersonalAjustadoTotal = sumaE('costePersonalAjustado');
  const costeSSBaseTotal = sumaE('costeSSBase');
  const costeSSAjustadoTotal = sumaE('costeSSAjustado');
  const costeTotalBaseTotal = costePersonalBaseTotal + costeSSBaseTotal;
  const costeTotalAjustadoTotal = costePersonalAjustadoTotal + costeSSAjustadoTotal;
  const costeEpiFormBaseTotal = sumaE('costeEpiFormBase');
  const costeEpiFormAjustadoTotal = sumaE('costeEpiFormAjustado');
  const deltaCosteEpiForm = costeEpiFormAjustadoTotal - costeEpiFormBaseTotal;
  const deltaCosteEpiFormPct = costeEpiFormBaseTotal ? (deltaCosteEpiForm / costeEpiFormBaseTotal) * 100 : 0;

  const direccionFilas = (deptosDir || []).map((d) => {
    const salarioBase = d.salario_bruto_mensual_override || (d.nivel === 'II' ? ESCALAS_SALARIO_DIRECCION.nivelII : ESCALAS_SALARIO_DIRECCION.nivelI);
    const costeTurnoDept = costeSalarialPorTurnoDesde(salarioBase, ESCALAS_SALARIO_DIRECCION.pagasAnuales, p);
    const turnos = d.personal * d.turnos_semana_por_persona;
    const costePersonal = turnos * costeTurnoDept;
    const costeSS = costePersonal * ssFrac;
    return { ...d, turnos, costePersonal, costeSS, costeTotal: costePersonal + costeSS };
  });
  const direccionTotal = direccionFilas.reduce((s, f) => s + f.costeTotal, 0);
  const direccionPersonalTotal = direccionFilas.reduce((s, f) => s + f.personal, 0);

  const granTotalBaseSemanal = costeTotalBaseTotal + direccionTotal;
  const granTotalAjustadoSemanal = costeTotalAjustadoTotal + direccionTotal;

  direccionData = {
    p, deptosFilas, escalasFilas, direccionFilas,
    entrevistaCoste, vigilanciaCosteUnit, vigilanciaCandidatos, vigilanciaTotal, entrevistasTotal,
    coberturaBaseTotal, coberturaConVigilancia, costeMedioEpi, costeMedioFormacion, avgFormacionHorasPlano, avgCoste, totalEmpleados,
    multiplicador, pctAnterior, pctActual, pctProxima, pctActivo, factorOcupacion,
    turnosBaseTotal, turnosAjustadoTotal, personalBaseTotal, personalAjustadoTotal,
    costePersonalBaseTotal, costePersonalAjustadoTotal, costeSSBaseTotal, costeSSAjustadoTotal,
    costeTotalBaseTotal, costeTotalAjustadoTotal,
    costeEpiFormBaseTotal, costeEpiFormAjustadoTotal, deltaCosteEpiForm, deltaCosteEpiFormPct,
    direccionTotal, direccionPersonalTotal, granTotalBaseSemanal, granTotalAjustadoSemanal,
    sinPuestoKey: personalPorPuesto['_sin_puesto_key'] || 0,
    abResumen, cesesUltimos12Meses, tasaRotacion12m, bajasMedicasAbiertasCount
  };

  renderPanelKpisCoste();
  renderPanelDireccionCostes();
  renderPanelDireccionExtendido();
  renderInformeEjecutivoCompleto();
  renderCoefPlantillaCuadrante();
  await cargarEscalasOcupacionSemana(escalasOcupacionOffsetActivo);
  renderEscalasOcupacionCuadrante();
}

function renderPanelDireccionCostes() {
  const el = $('panelDireccionCostes');
  if (!el || !direccionData) return;
  const d = direccionData;
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px;">
      <div>
        <b style="font-size:13.5px;">🏢 Coste de Cobertura de Plantilla — Resumen Ejecutivo</b>
        <p class="sub-c" style="margin:2px 0 0;">EPI/Uniformidad + Formación obligatoria + Entrevista + Vigilancia de la Salud, calculado sobre datos reales. El desglose completo por puesto y las Escalas según Ocupación están en el Informe Ejecutivo.</p>
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick="showScreen('admin-informes')">📊 Ver Informe Ejecutivo completo</button>
    </div>
    <div class="grid g4">
      <div class="card kpi"><div class="ic">🗣</div><div><div class="t">Coste medio entrevista de trabajo (${d.p.entrevista_minutos} min · ${d.p.tarifa_hora_neta} €/h neto)</div><div class="v">${fmtEur(d.entrevistaCoste)}</div></div></div>
      <div class="card kpi"><div class="ic">🦺</div><div><div class="t">Coste medio EPI/uniformidad por puesto</div><div class="v">${fmtEur(d.costeMedioEpi)}</div></div></div>
      <div class="card kpi"><div class="ic">🎓</div><div><div class="t">Coste medio formación obligatoria</div><div class="v">${fmtEur(d.costeMedioFormacion)}</div></div></div>
      <div class="card kpi"><div class="ic">⏱</div><div><div class="t">Horas medias formación obligatoria</div><div class="v">${d.avgFormacionHorasPlano.toFixed(1)} h</div></div></div>
      <div class="card kpi"><div class="ic">🩺</div><div><div class="t">Coste vigilancia de la salud (revisión + ${d.p.horas_revision_medica}h · ${d.p.tarifa_hora_neta} €/h)</div><div class="v">${fmtEur(d.vigilanciaCosteUnit)}</div></div></div>
    </div>
    <div class="grid g3" style="margin-top:12px;">
      <div class="card kpi"><div class="ic">💰</div><div><div class="t">Coste de cobertura de plantilla (EPI+Formación, todos los puestos)</div><div class="v">${fmtEur(d.coberturaBaseTotal)}</div></div></div>
      <div class="card kpi"><div class="ic">🏨</div><div><div class="t">Ocupación activa (referencia ${d.p.ocupacion_ref_pct}%)</div><div class="v">${d.pctActual != null ? d.pctActual.toFixed(1) + '%' : 'sin datos'}</div></div></div>
      <div class="card kpi"><div class="ic">👔</div><div><div class="t">Coste jefaturas/Administración/Dirección (semanal)</div><div class="v">${fmtEur(d.direccionTotal)}</div></div></div>
    </div>
    ${d.sinPuestoKey ? `<p class="sub-c" style="margin:10px 0 0;">⚠️ ${d.sinPuestoKey} persona(s) trabajadora(s) sin puesto_key asignado — no entran en el desglose por puesto hasta que se les asigne uno desde su ficha.</p>` : ''}`;
}

function barraComposicion(partes) {
  const total = partes.reduce((s, p) => s + p.valor, 0) || 1;
  const colores = ['#1b8b6b', '#f59e0b', '#0284c7', '#c026d3', '#e11d48'];
  const segmentos = partes
    .map((p, i) => `<div style="flex:${Math.max(p.valor, 0.0001)};background:${colores[i % colores.length]};" title="${p.label}: ${fmtEur(p.valor)}"></div>`)
    .join('');
  const leyenda = partes
    .map((p, i) => `<span class="badge2 b-slate" style="border-left:3px solid ${colores[i % colores.length]};">${p.label} — ${fmtEur(p.valor)} (${((p.valor / total) * 100).toFixed(0)}%)</span>`)
    .join(' ');
  return `<div style="display:flex;height:22px;border-radius:6px;overflow:hidden;margin:8px 0;">${segmentos}</div><div style="display:flex;gap:8px;flex-wrap:wrap;">${leyenda}</div>`;
}
function barraHorizontal(filas) {
  const max = Math.max(...filas.map((f) => f.valor), 0.0001);
  return filas
    .map(
      (f) => `<div style="margin:6px 0;">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;"><span>${f.label}</span><b>${fmtEur(f.valor)}</b></div>
      <div style="background:var(--slate-100);border-radius:6px;height:10px;overflow:hidden;"><div style="width:${(f.valor / max) * 100}%;background:var(--brand-500);height:100%;"></div></div>
    </div>`
    )
    .join('');
}

// Desglose de coste medio de cobertura por concepto (EPI/Formación/Entrevista/Vigilancia) — una sola
// fuente de verdad, usada tanto por el Panel de Dirección (gráfico de composición + Lectura) como por
// el Informe Ejecutivo, para que ambas pantallas muestren siempre los mismos números.
function direccionComposicionPartes(d) {
  return [
    { label: 'EPI + Uniformidad', valor: d.deptosFilas.reduce((s, f) => s + f.costeEpi * f.headcount, 0) },
    { label: 'Formación obligatoria', valor: d.deptosFilas.reduce((s, f) => s + f.costeFormacion * f.headcount, 0) },
    { label: 'Entrevista de contratación', valor: d.entrevistasTotal },
    { label: 'Vigilancia de la salud', valor: d.vigilanciaTotal }
  ];
}
function direccionPorPuestoPartes(d) {
  return [...d.deptosFilas].sort((a, b) => b.costeTotal - a.costeTotal).map((f) => ({ label: f.nombre, valor: f.costeTotal }));
}

// Lectura ejecutiva — redactada como la explicaría un/a Director/a de Operaciones, generada siempre a
// partir de datos reales (nunca cifras fijas): identifica el puesto de mayor coste, el concepto de
// coste dominante en el promedio por persona, y contextualiza la rotación frente a las bajas médicas.
function lecturaDireccionHTML(d) {
  const porPuesto = direccionPorPuestoPartes(d);
  if (!porPuesto.length) return '<p class="sub-c" style="margin:0;">Sin departamentos configurados todavía en Panel de Dirección → Plantilla de establecimiento.</p>';
  const puestoTop = porPuesto[0];
  const totalPorPuesto = porPuesto.reduce((s, p) => s + p.valor, 0);
  const composicion = direccionComposicionPartes(d);
  const totalComposicion = composicion.reduce((s, c) => s + c.valor, 0) || 1;
  const conceptoTop = [...composicion].sort((a, b) => b.valor - a.valor)[0];
  const pctConceptoTop = ((conceptoTop.valor / totalComposicion) * 100).toFixed(0);
  return `
    <p style="margin:0 0 8px;">📍 <b>${puestoTop.label}</b> concentra el mayor coste de cobertura de plantilla (${fmtEur(puestoTop.valor)} de un total de ${fmtEur(totalPorPuesto)}) — es el puesto a priorizar si se busca reducir el coste total por optimización de plantilla o de proceso.</p>
    <p style="margin:0 0 8px;">📍 Dentro del coste de cobertura de plantilla, <b>${conceptoTop.label}</b> es el concepto que más pesa (${fmtEur(conceptoTop.valor)} — ${pctConceptoTop}% del total). Es la palanca con mayor recorrido si se quiere reducir el coste de cobertura.</p>
    <p style="margin:0;">📍 La tasa de rotación (12 meses) es del <b>${d.tasaRotacion12m.toFixed(1)}%</b>, con <b>${d.bajasMedicasAbiertasCount}</b> baja(s) médica(s) abierta(s) actualmente. Conviene cruzar ambos indicadores con el motivo de cese predominante (ver "Rotación y bajas por cese" en Informes) antes de decidir si se trata de una tendencia estructural o estacional (alta ocupación en temporada).</p>
  `;
}

// Versión condensada (4 KPI + 1 recuadro destacado) de las Escalas según Ocupación para el Panel de
// Dirección — el detalle fila a fila por departamento sigue viviendo solo en Cuadrantes/Informe Ejecutivo.
function escalasResumenCondensadoHTML(d) {
  const deltaCosteTotal = d.costeTotalAjustadoTotal - d.costeTotalBaseTotal;
  const deltaCosteTotalPct = d.costeTotalBaseTotal ? (deltaCosteTotal / d.costeTotalBaseTotal) * 100 : 0;
  const colorDelta = deltaCosteTotal >= 0 ? '#e11d48' : '#059669';
  const colorDeltaEpiForm = d.deltaCosteEpiForm >= 0 ? '#e11d48' : '#059669';
  return `
    <div class="grid g4">
      <div class="card kpi"><div class="ic">🏨</div><div><div class="t">Ocupación activa (referencia ${d.p.ocupacion_ref_pct}%)</div><div class="v">${d.pctActual != null ? d.pctActual.toFixed(1) + '%' : 'sin datos'}</div></div></div>
      <div class="card kpi"><div class="ic">🧑‍🤝‍🧑</div><div><div class="t">Personal necesario: coeficiente → ocupación</div><div class="v" style="font-size:15px;">${d.personalBaseTotal} → ${d.personalAjustadoTotal}</div></div></div>
      <div class="card kpi"><div class="ic">🔁</div><div><div class="t">Turnos/semana: coeficiente → ocupación</div><div class="v" style="font-size:15px;">${d.turnosBaseTotal.toFixed(1)} → ${d.turnosAjustadoTotal.toFixed(1)}</div></div></div>
      <div class="card kpi"><div class="ic">🥽</div><div><div class="t">Coste EPI+Formación+Entrevista — ajuste a la ocupación real</div><div class="v" style="color:${colorDeltaEpiForm};font-size:15px;">${d.deltaCosteEpiForm >= 0 ? '+' : ''}${fmtEur(d.deltaCosteEpiForm)} (${d.deltaCosteEpiFormPct >= 0 ? '+' : ''}${d.deltaCosteEpiFormPct.toFixed(1)}%)</div></div></div>
      <div class="card kpi"><div class="ic">💶</div><div><div class="t">Coste de personal (salario convenio) — impacto/semana</div><div class="v">${d.costePersonalAjustadoTotal - d.costePersonalBaseTotal >= 0 ? '+' : ''}${fmtEur(d.costePersonalAjustadoTotal - d.costePersonalBaseTotal)}</div></div></div>
      <div class="card kpi"><div class="ic">🏛</div><div><div class="t">Coste total c/SS — ajuste a la ocupación real</div><div class="v" style="color:${colorDelta};">${deltaCosteTotal >= 0 ? '+' : ''}${fmtEur(deltaCosteTotal)} (${deltaCosteTotalPct >= 0 ? '+' : ''}${deltaCosteTotalPct.toFixed(1)}%)</div></div></div>
    </div>
    <div style="margin-top:12px;padding:14px 16px;border-radius:10px;background:linear-gradient(135deg,var(--brand-50,#f0fdf9),#eef2ff);border:1px solid var(--slate-200);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div>
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--slate-500);">💶 Coste de personal (salario, convenio hostelería Illes Balears — solo personal base)</div>
        <div style="font-size:20px;font-weight:800;color:var(--ink-900);margin-top:4px;">${fmtEur(d.costePersonalBaseTotal)} → ${fmtEur(d.costePersonalAjustadoTotal)} / semana</div>
      </div>
    </div>`;
}

function direccionABHTML(d) {
  const ab = d.abResumen;
  if (!ab || !ab.filas.length) return '<p class="sub-c" style="margin:0;">Sin departamentos de Cocina o Sala configurados en Plantilla de establecimiento.</p>';
  const dTurnos = ab.turnosAjustadoTotal - ab.turnosBaseTotal;
  const dPersonal = ab.personalAjustadoTotal - ab.personalBaseTotal;
  const colorDelta = ab.deltaCosteTotal >= 0 ? '#e11d48' : '#059669';
  return `
    <div class="grid g4">
      <div class="card kpi"><div class="ic">🔁</div><div><div class="t">Turnos/semana A&amp;B: coeficiente → ocupación</div><div class="v" style="font-size:15px;">${ab.turnosBaseTotal.toFixed(1)} → ${ab.turnosAjustadoTotal.toFixed(1)} <span style="color:${dTurnos >= 0 ? '#e11d48' : '#059669'};">(${dTurnos >= 0 ? '+' : ''}${dTurnos.toFixed(1)})</span></div></div></div>
      <div class="card kpi"><div class="ic">🧑‍🤝‍🧑</div><div><div class="t">Personal A&amp;B: coeficiente → ocupación</div><div class="v" style="font-size:15px;">${ab.personalBaseTotal} → ${ab.personalAjustadoTotal} <span style="color:${dPersonal >= 0 ? '#e11d48' : '#059669'};">(${dPersonal >= 0 ? '+' : ''}${dPersonal})</span></div></div></div>
      <div class="card kpi"><div class="ic">💶</div><div><div class="t">Coste de personal A&amp;B (salario, /semana)</div><div class="v" style="font-size:15px;">${fmtEur(ab.costePersonalBaseTotal)} → ${fmtEur(ab.costePersonalAjustadoTotal)}</div></div></div>
      <div class="card kpi"><div class="ic">🏛</div><div><div class="t">Coste total A&amp;B (salario + SS) — impacto</div><div class="v" style="color:${colorDelta};">${ab.deltaCosteTotal >= 0 ? '+' : ''}${fmtEur(ab.deltaCosteTotal)} (${ab.deltaCosteTotalPct >= 0 ? '+' : ''}${ab.deltaCosteTotalPct.toFixed(1)}%)</div></div></div>
    </div>
    <div class="card" style="overflow-x:auto;margin-top:10px;">
      <table><thead><tr><th>Departamento</th><th>Turnos/sem. (coef.→ocup.)</th><th>Personal (coef.→ocup.)</th><th>Coste personal/sem.</th><th>Total c/SS</th></tr></thead>
      <tbody>${ab.filas.map((f) => `<tr><td>${f.nombre}</td><td>${f.turnosBase.toFixed(1)} → ${f.turnosAjustado.toFixed(1)}</td><td>${Math.ceil(f.personalBase)} → ${Math.ceil(f.personalAjustado)}</td><td>${fmtEur(f.costePersonalAjustado)}</td><td>${fmtEur(f.costePersonalAjustado + f.costeSSAjustado)}</td></tr>`).join('')}</tbody></table>
    </div>`;
}

function granTotalResumenHTML(d) {
  return `
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin:4px 0;"><span>Personal base (operativo)</span><b>${fmtEur(d.costeTotalBaseTotal)} → ${fmtEur(d.costeTotalAjustadoTotal)}</b></div>
    <div style="display:flex;justify-content:space-between;font-size:12.5px;margin:4px 0;"><span>Jefaturas / Administración / Dirección</span><b>${fmtEur(d.direccionTotal)}</b></div>
    <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:800;margin-top:8px;padding-top:8px;border-top:1px solid var(--slate-200);"><span>Coste total combinado /semana</span><span>${fmtEur(d.granTotalBaseSemanal)} → ${fmtEur(d.granTotalAjustadoSemanal)}</span></div>`;
}

// Rellena los 6 bloques ampliados del Panel de Dirección (composición, magnitud por puesto, lectura
// ejecutiva, escalas según ocupación, A&B y coste total combinado) — antes solo vivían en el Informe
// Ejecutivo, obligando a salir de Dirección para verlos.
function renderPanelDireccionExtendido() {
  if (!direccionData) return;
  const d = direccionData;
  const composicionEl = $('direccionComposicionChart');
  if (composicionEl) composicionEl.innerHTML = barraComposicion(direccionComposicionPartes(d));
  const magnitudEl = $('direccionMagnitudChart');
  if (magnitudEl) magnitudEl.innerHTML = barraHorizontal(direccionPorPuestoPartes(d));
  const insightEl = $('direccionInsight');
  if (insightEl) insightEl.innerHTML = lecturaDireccionHTML(d);
  const escalasEl = $('direccionEscalasOcupacion');
  if (escalasEl) escalasEl.innerHTML = escalasResumenCondensadoHTML(d);
  const abEl = $('direccionAB');
  if (abEl) abEl.innerHTML = direccionABHTML(d);
  const granTotalEl = $('direccionGranTotal');
  if (granTotalEl) granTotalEl.innerHTML = granTotalResumenHTML(d);
}

function renderInformeEjecutivoCompleto() {
  const el = $('informesCosteCobertura');
  if (!el || !direccionData) return;
  const d = direccionData;
  const composicion = direccionComposicionPartes(d);
  const porPuesto = direccionPorPuestoPartes(d);
  const tendencia = d.pctProxima != null && d.pctActual != null ? (d.pctProxima < d.pctActual ? 'a la baja' : d.pctProxima > d.pctActual ? 'al alza' : 'estable') : 'sin datos suficientes';

  const avg = d.avgCoste || { n: 0, epiAvg: 0, formacionAvg: 0, entrevistaAvg: 0, vigilanciaAvg: 0, totalAvg: 0, epiTotal: 0, formacionTotal: 0, entrevistaTotal: 0, vigilanciaTotal: 0, total: 0 };

  el.innerHTML = `
    <div style="margin:0 0 18px;padding:18px 20px;border-radius:12px;background:linear-gradient(135deg,var(--brand-50,#ecfdf5),#fff);border:1px solid var(--brand-200,#a7f3d0);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
      <div>
        <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--slate-500);">📐 Coste medio de cobertura de puesto de trabajo</div>
        <div style="font-size:30px;font-weight:900;color:var(--brand-700,#065f46);margin-top:4px;line-height:1;">${fmtEur(avg.totalAvg)}</div>
        <div style="font-size:12px;color:var(--slate-500);margin-top:6px;">Promedio por persona trabajadora (${avg.n} personas) — suma de EPI/Uniformidad + Formación obligatoria + Entrevista de contratación + Vigilancia de la salud</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <span class="badge2 b-slate">🥽 EPI ${fmtEur(avg.epiAvg)}</span>
        <span class="badge2 b-slate">🎓 Formación ${fmtEur(avg.formacionAvg)}</span>
        <span class="badge2 b-slate">🗣 Entrevista ${fmtEur(avg.entrevistaAvg)}</span>
        <span class="badge2 b-slate">🩺 Vigilancia ${fmtEur(avg.vigilanciaAvg)}</span>
      </div>
    </div>

    <b style="font-size:13.5px;">📊 Composición del coste medio de cobertura de puesto de trabajo</b>
    ${barraComposicion(composicion)}

    <b style="font-size:13.5px;display:block;margin-top:18px;">📊 Coste de cobertura de plantilla — por puesto de trabajo</b>
    <div style="margin-top:8px;">${barraHorizontal(porPuesto)}</div>

    <b style="font-size:13.5px;display:block;margin-top:18px;">🥽 Coste de EPIs por cobertura de plantilla — por puesto de trabajo</b>
    <p class="sub-c" style="margin:6px 0 10px;">Coste de EPIs y uniformidad por puesto, en columna independiente de Formación obligatoria y Entrevista — cada concepto con su propio desglose.</p>
    <div class="card" style="overflow-x:auto;">
      <table><thead><tr><th>Puesto</th><th style="text-align:center;">Activos</th><th style="text-align:right;">EPI + Uniformidad</th><th style="text-align:right;">Formación obligatoria</th><th style="text-align:right;">Entrevista</th><th style="text-align:right;">Coste por puesto</th><th style="text-align:right;">Subtotal</th></tr></thead>
      <tbody>${d.deptosFilas
        .map(
          (f) => `<tr><td>${f.nombre}</td><td style="text-align:center;">${f.headcount}</td><td style="text-align:right;">${fmtEur(f.costeEpi)}</td><td style="text-align:right;">${fmtEur(f.costeFormacion)}</td><td style="text-align:right;">${fmtEur(d.entrevistaCoste)}</td><td style="text-align:right;">${fmtEur(f.costeUnit + d.entrevistaCoste)}</td><td style="text-align:right;"><b>${fmtEur((f.costeUnit + d.entrevistaCoste) * f.headcount)}</b></td></tr>`
        )
        .join('')}</tbody>
      <tfoot>
        <tr><td colspan="6" style="text-align:right;">Subtotal por puesto</td><td style="text-align:right;">${fmtEur(d.coberturaBaseTotal + d.entrevistasTotal)}</td></tr>
        <tr><td colspan="6" style="text-align:right;">+ Vigilancia de la salud (${d.vigilanciaCandidatos} personas)</td><td style="text-align:right;">${fmtEur(d.vigilanciaTotal)}</td></tr>
        <tr style="font-weight:800;"><td colspan="6" style="text-align:right;">TOTAL coste de cobertura de plantilla</td><td style="text-align:right;">${fmtEur(d.coberturaBaseTotal + d.entrevistasTotal + d.vigilanciaTotal)}</td></tr>
      </tfoot></table>
    </div>

    <b style="font-size:13.5px;display:block;margin-top:18px;">📐 Coste promedio por persona trabajadora (${avg.n} personas)</b>
    <div class="card" style="overflow-x:auto;">
      <table><thead><tr><th>Concepto</th><th style="text-align:right;">Total plantilla</th><th style="text-align:right;">Promedio por persona</th></tr></thead>
      <tbody>
        <tr><td>EPI + Uniformidad</td><td style="text-align:right;">${fmtEur(avg.epiTotal)}</td><td style="text-align:right;">${fmtEur(avg.epiAvg)}</td></tr>
        <tr><td>Formación obligatoria</td><td style="text-align:right;">${fmtEur(avg.formacionTotal)}</td><td style="text-align:right;">${fmtEur(avg.formacionAvg)}</td></tr>
        <tr><td>Entrevista de contratación</td><td style="text-align:right;">${fmtEur(avg.entrevistaTotal)}</td><td style="text-align:right;">${fmtEur(avg.entrevistaAvg)}</td></tr>
        <tr><td>Vigilancia de la salud</td><td style="text-align:right;">${fmtEur(avg.vigilanciaTotal)}</td><td style="text-align:right;">${fmtEur(avg.vigilanciaAvg)}</td></tr>
      </tbody>
      <tfoot><tr style="font-weight:800;"><td>TOTAL</td><td style="text-align:right;">${fmtEur(avg.total)}</td><td style="text-align:right;">${fmtEur(avg.totalAvg)}</td></tr></tfoot></table>
    </div>

    <b style="font-size:13.5px;display:block;margin-top:18px;">🏨 Escalas según ocupación — ajuste de turnos y personal</b>
    <p style="margin:6px 0 10px;">Con una ocupación del <b>${d.pctActivo.toFixed(1)}%</b> (frente al <b>${d.p.ocupacion_ref_pct}%</b> de referencia), la cobertura óptima de turnos se ajusta de <b>${d.turnosBaseTotal.toFixed(1)}</b> a <b>${d.turnosAjustadoTotal.toFixed(1)}</b> turnos/semana y el personal necesario de <b>${d.personalBaseTotal}</b> a <b>${d.personalAjustadoTotal}</b> personas. Coste de personal (convenio hostelería Illes Balears, solo personal base): <b>${fmtEur(d.costePersonalBaseTotal)}</b> → <b>${fmtEur(d.costePersonalAjustadoTotal)} /semana</b>. Incluyendo la Seguridad Social a cargo de la empresa (<b>${d.p.ss_porcentaje_empresa}%</b> estimado), el coste total pasa de <b>${fmtEur(d.costeTotalBaseTotal)}</b> a <b>${fmtEur(d.costeTotalAjustadoTotal)} /semana</b>.</p>
    <div class="legend" style="margin:0 0 10px;gap:8px;">
      <span class="badge2 b-slate">Semana anterior: ${d.pctAnterior != null ? d.pctAnterior.toFixed(1) + '%' : 'sin datos'}</span>
      <span class="badge2 b-brand">Semana en curso: ${d.pctActual != null ? d.pctActual.toFixed(1) + '%' : 'sin datos'}</span>
      <span class="badge2 ${d.pctProxima != null && d.pctActual != null && d.pctProxima < d.pctActual ? 'b-emerald' : 'b-amber'}">Próxima (teórica): ${d.pctProxima != null ? d.pctProxima.toFixed(1) + '%' : 'sin datos'} — tendencia ${tendencia}</span>
    </div>
    <div class="card" style="overflow-x:auto;">
      <table><thead><tr><th>Departamento</th><th>Turnos/sem. (coef.→ocup.)</th><th>Personal (coef.→ocup.)</th><th>Coste EPI+Form.+Entrevista (coef.→ocup.)</th><th>Coste personal/sem.</th><th>Total c/SS</th></tr></thead>
      <tbody>${d.escalasFilas
        .map(
          (f) => `<tr><td>${f.nombre}</td><td>${f.turnosBase.toFixed(1)} → ${f.turnosAjustado.toFixed(1)}</td><td>${Math.ceil(f.personalBase)} → ${Math.ceil(f.personalAjustado)}</td><td>${fmtEur(f.costeEpiFormBase)} → ${fmtEur(f.costeEpiFormAjustado)}</td><td>${fmtEur(f.costePersonalAjustado)}</td><td>${fmtEur(f.costePersonalAjustado + f.costeSSAjustado)}</td></tr>`
        )
        .join('')}</tbody>
      <tfoot><tr style="font-weight:800;"><td colspan="3" style="text-align:right;">TOTALES</td><td>${fmtEur(d.costeEpiFormBaseTotal)} → ${fmtEur(d.costeEpiFormAjustadoTotal)}</td><td>${fmtEur(d.costePersonalAjustadoTotal)}</td><td>${fmtEur(d.costeTotalAjustadoTotal)}</td></tr></tfoot></table>
    </div>

    <b style="font-size:13.5px;display:block;margin-top:18px;">👔 Jefes de Departamento, Administración y Dirección</b>
    <p class="sub-c" style="margin:6px 0 10px;">Puestos nominales — no rotan 24/7/365, su coste es el mismo cada semana. Dirección General, fuera de convenio, se muestra como cifra estimada de referencia.</p>
    <div class="card" style="overflow-x:auto;">
      <table><thead><tr><th>Puesto</th><th>Nivel</th><th>Personal</th><th>Turnos/sem.</th><th>Coste personal/sem.</th><th>Total c/SS</th></tr></thead>
      <tbody>${d.direccionFilas
        .map(
          (f) => `<tr><td>${f.nombre}${f.es_estimado ? ' <span class="badge2 b-amber">estimado</span>' : ''}</td><td>${f.nivel}</td><td>${f.personal}</td><td>${f.turnos}</td><td>${fmtEur(f.costePersonal)}</td><td>${fmtEur(f.costeTotal)}</td></tr>`
        )
        .join('')}</tbody></table>
    </div>
    <p style="margin:10px 0 0;">💼 <b>Coste total de la plantilla completa</b> (personal base + jefaturas/Administración/Dirección): <b>${fmtEur(d.granTotalBaseSemanal)}</b> → <b>${fmtEur(d.granTotalAjustadoSemanal)} /semana</b> al ajustar a la ocupación activa.</p>
    <p class="sub-c" style="margin:6px 0 0;">Fuente salarial: ${ESCALAS_SALARIO_CONVENIO.fuente}. ${ESCALAS_SALARIO_DIRECCION.fuente}</p>`;

  renderInformesBajasCese();
}

// Coste invertido perdido por persona de baja por cese: EPI/Uniformidad + Formación obligatoria
// del puesto (mismo cálculo que "Coste de cobertura por puesto" de arriba) + entrevista de
// contratación + entrevista de salida (15 min, mitad de los 45 min de la de contratación) —
// requiere direccionData, por eso se renderiza aquí y no en cargarInformesAdmin().
function renderInformesBajasCese() {
  const el = $('informesBajasCese');
  if (!el || !direccionData) return;
  const d = direccionData;
  const entrevistaSalidaCoste = (15 / 60) * Number(d.p.tarifa_hora_neta);
  const filas = informesCesesCache.map((p) => {
    const depto = d.deptosFilas.find((f) => f.puesto_key === p.puesto_key);
    const costeInvertido = (depto ? depto.costeUnit : d.costeMedioEpi + d.costeMedioFormacion) + d.entrevistaCoste + entrevistaSalidaCoste;
    return { ...p, costeInvertido };
  });
  const totalPerdido = filas.reduce((s, f) => s + f.costeInvertido, 0);
  const bajasCeseTotal = filas.length;
  const tasaRotacionCese = empleadosCache.length ? ((bajasCeseTotal / (empleadosCache.length + bajasCeseTotal)) * 100).toFixed(1) : '0.0';
  el.innerHTML = `
    <h2 class="pg-title" style="margin:0 0 4px;">🚪 Bajas por cese de relación contractual</h2>
    <p class="pg-sub" style="margin:0 0 10px;">Incluye el coste ya invertido en cada persona que se marcha (EPI/uniformidad, formación obligatoria y entrevista de contratación) más la entrevista de salida (15 min).</p>
    <div class="grid g3" style="margin-bottom:10px;">
      <div class="card kpi"><div class="ic">🚪</div><div><div class="t">Bajas por cese registradas</div><div class="v">${bajasCeseTotal}</div></div></div>
      <div class="card kpi"><div class="ic">🔄</div><div><div class="t">Tasa de rotación (sobre plantilla + ceses)</div><div class="v">${tasaRotacionCese}%</div></div></div>
      <div class="card kpi"><div class="ic">💸</div><div><div class="t">Coste invertido perdido (total)</div><div class="v">${fmtEur(totalPerdido)}</div></div></div>
    </div>
    <div style="overflow-x:auto;"><table><thead><tr><th>Persona trabajadora</th><th>Puesto</th><th>Motivo</th><th>Fecha</th><th>Coste invertido perdido</th></tr></thead>
    <tbody>${
      filas.length
        ? filas
            .map((f) => `<tr><td>${f.nombre}</td><td>${f.puesto || '—'}</td><td>${f.motivo_cese}</td><td>${f.fecha_cese ? new Date(f.fecha_cese).toLocaleDateString('es-ES') : '—'}</td><td>${fmtEur(f.costeInvertido)}</td></tr>`)
            .join('')
        : '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin bajas por cese registradas.</td></tr>'
    }</tbody></table></div>`;
}

// ---------- Panel de Dirección: plantilla de establecimiento (Excel) ----------
// Exporta/importa coef_parametros + coef_departamentos + coef_departamentos_direccion de este
// hotel en un único .xlsx (3 hojas), para editar la configuración de coste/ocupación fuera de la
// app y sustituirla de una sola vez. NUNCA toca personas_trabajadoras, cuadrante_asignaciones,
// cuadrante_secuencias ni turnos_catalogo — solo estos 3 bloques de configuración, siempre
// acotado por hotel_id = usuarioActual.hotel_id.
const PLANTILLA_ESTABLECIMIENTO_PARAMS = [
  ['coef_pct', 'Coeficiente de plantilla (%)'],
  ['horas_convenio_anuales', 'Horas anuales según convenio'],
  ['tasa_absentismo_pct', 'Tasa de absentismo estimada (%)'],
  ['horas_turno_estandar', 'Horas de un turno estándar'],
  ['tarifa_hora_neta', 'Tarifa neta de referencia (€/hora)'],
  ['coste_revision_medica', 'Coste fijo de la revisión médica (€)'],
  ['horas_revision_medica', 'Horas de proceso de la revisión médica'],
  ['entrevista_minutos', 'Minutos medios por entrevista de contratación'],
  ['ss_porcentaje_empresa', 'Seguridad Social a cargo de la empresa (%)'],
  ['ocupacion_ref_pct', 'Ocupación de referencia (%)']
];

function descargarPlantillaEstablecimiento() {
  if (!direccionData) return mostrarToast('Espera a que termine de cargar el Panel de Dirección', false);
  if (typeof XLSX === 'undefined') return mostrarToast('No se ha podido cargar el motor de Excel (xlsx.min.js)', false);
  const d = direccionData;
  const p = d.p;

  const wsParams = XLSX.utils.aoa_to_sheet([
    ['parametro', 'valor', 'descripcion'],
    ...PLANTILLA_ESTABLECIMIENTO_PARAMS.map(([campo, desc]) => [campo, Number(p[campo] ?? 0), desc])
  ]);

  const deptos = [...d.deptosFilas].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const wsDeptos = XLSX.utils.aoa_to_sheet([
    ['nombre', 'puesto_key', 'turnos_dia', 'dias_cobertura', 'es_critico_ab', 'incluir_en_escalas_operativas', 'depende_ocupacion'],
    ...deptos.map((f) => [
      f.nombre,
      f.puesto_key || '',
      f.turnos_dia,
      f.dias_cobertura,
      f.es_critico_ab ? 'Sí' : 'No',
      f.incluir_en_escalas_operativas ? 'Sí' : 'No',
      f.depende_ocupacion ? 'Sí' : 'No'
    ])
  ]);

  const dir = [...d.direccionFilas].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const wsDireccion = XLSX.utils.aoa_to_sheet([
    ['nombre', 'nivel', 'personal', 'turnos_semana_por_persona', 'es_critico_ab', 'es_estimado', 'salario_bruto_mensual_override'],
    ...dir.map((f) => [
      f.nombre,
      f.nivel,
      f.personal,
      f.turnos_semana_por_persona,
      f.es_critico_ab ? 'Sí' : 'No',
      f.es_estimado ? 'Sí' : 'No',
      f.salario_bruto_mensual_override != null ? Number(f.salario_bruto_mensual_override) : ''
    ])
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsParams, 'PARAMETROS');
  XLSX.utils.book_append_sheet(wb, wsDeptos, 'DEPARTAMENTOS');
  XLSX.utils.book_append_sheet(wb, wsDireccion, 'DIRECCION');
  XLSX.writeFile(wb, `plantilla_establecimiento_${new Date().toISOString().slice(0, 10)}.xlsx`);
  mostrarToast('Plantilla descargada');
}

async function cargarPlantillaEstablecimiento(file) {
  // Dos pantallas comparten el mismo flujo de subida (Panel de Dirección y Cuadrantes) — el
  // mensaje de resultado se escribe en el div presente de cada una (solo existe el de la
  // pantalla activa en el DOM a la vez que el otro, pero ambos reciben el mismo objeto).
  const resultElsReales = [$('plantillaEstablecimientoResultado'), $('cuadPlantillaEstablecimientoResultado')].filter(Boolean);
  const resultEl = resultElsReales.length ? { set innerHTML(html) { resultElsReales.forEach((el) => (el.innerHTML = html)); } } : null;
  if (!file) return;
  if (!direccionData) {
    mostrarToast('Espera a que termine de cargar el Panel de Dirección', false);
    return;
  }
  if (typeof XLSX === 'undefined') {
    mostrarToast('No se ha podido cargar el motor de Excel (xlsx.min.js)', false);
    return;
  }
  const bool = (v) => /^(s[ií]|yes|true|1)$/i.test(String(v ?? '').trim());
  const errores = [];
  const avisos = [];

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const hojaParams = wb.Sheets['PARAMETROS'];
    const hojaDeptos = wb.Sheets['DEPARTAMENTOS'];
    const hojaDireccion = wb.Sheets['DIRECCION'];
    if (!hojaParams || !hojaDeptos || !hojaDireccion) {
      if (resultEl) resultEl.innerHTML = '<p class="sub-c" style="color:#be123c;">⚠️ El archivo debe contener las 3 hojas: PARAMETROS, DEPARTAMENTOS y DIRECCION.</p>';
      return;
    }

    // --- PARAMETROS (una fila por parámetro) ---
    const mapaParams = {};
    XLSX.utils.sheet_to_json(hojaParams, { header: 1 }).slice(1).forEach((r) => {
      if (r && r[0]) mapaParams[String(r[0]).trim()] = r[1];
    });
    const payloadParams = {};
    PLANTILLA_ESTABLECIMIENTO_PARAMS.forEach(([campo]) => {
      const v = mapaParams[campo];
      if (v === undefined || v === '' || v === null) {
        errores.push(`PARAMETROS: falta el valor de "${campo}".`);
        return;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) {
        errores.push(`PARAMETROS: "${campo}" debe ser un número ≥ 0 (valor recibido: "${v}").`);
        return;
      }
      payloadParams[campo] = n;
    });

    // --- DEPARTAMENTOS ---
    const payloadDeptos = [];
    XLSX.utils.sheet_to_json(hojaDeptos, { defval: '' }).forEach((r, i) => {
      const fila = i + 2;
      const nombre = String(r.nombre || '').trim();
      if (!nombre) {
        errores.push(`DEPARTAMENTOS fila ${fila}: falta "nombre".`);
        return;
      }
      const turnosDia = Number(r.turnos_dia);
      const diasCobertura = Number(r.dias_cobertura);
      if (!Number.isFinite(turnosDia) || turnosDia <= 0) {
        errores.push(`DEPARTAMENTOS fila ${fila} (${nombre}): "turnos_dia" debe ser un número > 0.`);
        return;
      }
      if (!Number.isFinite(diasCobertura) || diasCobertura <= 0) {
        errores.push(`DEPARTAMENTOS fila ${fila} (${nombre}): "dias_cobertura" debe ser un número > 0.`);
        return;
      }
      const puestoKey = String(r.puesto_key || '').trim();
      if (!puestoKey) avisos.push(`DEPARTAMENTOS fila ${fila} (${nombre}): sin "puesto_key" — no se podrá calcular su coste de EPI/Formación hasta asignarle uno.`);
      payloadDeptos.push({
        hotel_id: usuarioActual.hotel_id,
        nombre,
        puesto_key: puestoKey || null,
        turnos_dia: turnosDia,
        dias_cobertura: diasCobertura,
        es_critico_ab: bool(r.es_critico_ab),
        incluir_en_escalas_operativas: bool(r.incluir_en_escalas_operativas),
        depende_ocupacion: bool(r.depende_ocupacion)
      });
    });
    if (!payloadDeptos.length) errores.push('DEPARTAMENTOS: la hoja no contiene ninguna fila válida.');
    {
      const nombresVistos = new Set();
      payloadDeptos.forEach((f) => {
        const clave = f.nombre.toLowerCase();
        if (nombresVistos.has(clave)) errores.push(`DEPARTAMENTOS: el nombre "${f.nombre}" aparece más de una vez — debe ser único.`);
        nombresVistos.add(clave);
      });
    }

    // --- DIRECCION ---
    const payloadDireccion = [];
    XLSX.utils.sheet_to_json(hojaDireccion, { defval: '' }).forEach((r, i) => {
      const fila = i + 2;
      const nombre = String(r.nombre || '').trim();
      if (!nombre) {
        errores.push(`DIRECCION fila ${fila}: falta "nombre".`);
        return;
      }
      const nivel = String(r.nivel || '').trim().toUpperCase();
      if (nivel !== 'I' && nivel !== 'II') {
        errores.push(`DIRECCION fila ${fila} (${nombre}): "nivel" debe ser "I" o "II" (recibido: "${r.nivel}").`);
        return;
      }
      const personal = Number(r.personal);
      const turnosSemana = Number(r.turnos_semana_por_persona);
      if (!Number.isFinite(personal) || personal <= 0) {
        errores.push(`DIRECCION fila ${fila} (${nombre}): "personal" debe ser un número > 0.`);
        return;
      }
      if (!Number.isFinite(turnosSemana) || turnosSemana <= 0) {
        errores.push(`DIRECCION fila ${fila} (${nombre}): "turnos_semana_por_persona" debe ser un número > 0.`);
        return;
      }
      let salarioOverride = null;
      const overrideVal = r.salario_bruto_mensual_override;
      if (overrideVal !== '' && overrideVal !== undefined && overrideVal !== null) {
        const n = Number(overrideVal);
        if (!Number.isFinite(n) || n < 0) {
          errores.push(`DIRECCION fila ${fila} (${nombre}): "salario_bruto_mensual_override" debe estar vacío o ser un número ≥ 0.`);
          return;
        }
        salarioOverride = n;
      }
      payloadDireccion.push({
        hotel_id: usuarioActual.hotel_id,
        nombre,
        nivel,
        personal,
        turnos_semana_por_persona: turnosSemana,
        es_critico_ab: bool(r.es_critico_ab),
        es_estimado: bool(r.es_estimado),
        salario_bruto_mensual_override: salarioOverride
      });
    });
    if (!payloadDireccion.length) errores.push('DIRECCION: la hoja no contiene ninguna fila válida.');
    {
      const nombresVistos = new Set();
      payloadDireccion.forEach((f) => {
        const clave = f.nombre.toLowerCase();
        if (nombresVistos.has(clave)) errores.push(`DIRECCION: el nombre "${f.nombre}" aparece más de una vez — debe ser único (hay un índice único por hotel+nombre).`);
        nombresVistos.add(clave);
      });
    }

    if (errores.length) {
      if (resultEl) {
        resultEl.innerHTML = `<p class="sub-c" style="color:#be123c;">⚠️ No se ha cargado nada — corrige estos errores y vuelve a intentarlo:</p><ul style="margin:4px 0 0 18px;font-size:12.5px;">${errores
          .map((e) => `<li>${e}</li>`)
          .join('')}</ul>`;
      }
      mostrarToast('La plantilla tiene errores — revisa el detalle', false);
      return;
    }

    const resumen = `Se sustituirán por completo:\n• Los parámetros de coste/ocupación del hotel.\n• Los departamentos (${direccionData.deptosFilas.length} → ${payloadDeptos.length}).\n• Las jefaturas/Administración/Dirección (${direccionData.direccionFilas.length} → ${payloadDireccion.length}).\n\nNo se modifica el personal, los cuadrantes ni las secuencias ya asignadas.\n\n¿Confirmas la sustitución completa?`;
    if (!confirm(resumen)) {
      if (resultEl) resultEl.innerHTML = '<p class="sub-c">Carga cancelada — no se ha modificado nada.</p>';
      return;
    }

    const { error: errP } = await sb.from('coef_parametros').update(payloadParams).eq('hotel_id', usuarioActual.hotel_id);
    if (errP) throw errP;

    const { error: errDelD } = await sb.from('coef_departamentos').delete().eq('hotel_id', usuarioActual.hotel_id);
    if (errDelD) throw errDelD;
    const { error: errInsD } = await sb.from('coef_departamentos').insert(payloadDeptos);
    if (errInsD) throw errInsD;

    const { error: errDelDir } = await sb.from('coef_departamentos_direccion').delete().eq('hotel_id', usuarioActual.hotel_id);
    if (errDelDir) throw errDelDir;
    const { error: errInsDir } = await sb.from('coef_departamentos_direccion').insert(payloadDireccion);
    if (errInsDir) throw errInsDir;

    await registrarAuditoria('Panel de Dirección', 'Plantilla de establecimiento cargada', `${payloadDeptos.length} departamento(s), ${payloadDireccion.length} jefatura(s)`);
    await cargarDireccionEjecutivaAdmin();

    if (resultEl) {
      resultEl.innerHTML = `<p class="sub-c" style="color:#059669;">✅ Plantilla cargada correctamente — ${payloadDeptos.length} departamento(s) y ${payloadDireccion.length} jefatura(s)/Dirección actualizados.</p>${
        avisos.length ? `<ul style="margin:4px 0 0 18px;font-size:12.5px;">${avisos.map((a) => `<li>⚠️ ${a}</li>`).join('')}</ul>` : ''
      }`;
    }
    mostrarToast('Plantilla de establecimiento cargada');
  } catch (err) {
    console.error(err);
    if (resultEl) resultEl.innerHTML = `<p class="sub-c" style="color:#be123c;">⚠️ Error al cargar la plantilla: ${err.message || err}</p>`;
    mostrarToast('Error al cargar la plantilla', false);
  }
}

// =====================================================================
// Cuadrantes — Coeficiente de plantilla (editable) y Escalas según ocupación
// (editable). Réplica fiel de las dos secciones del prototipo, pero con todo
// persistido en Supabase en vez de en una variable de memoria de la demo:
// coef_pct/horas_convenio_anuales/tasa_absentismo_pct/horas_turno_estandar viven
// en coef_parametros (ya leído por cargarDireccionEjecutivaAdmin), y la ocupación
// diaria editable vive en ocupacion_habitaciones. Los datos derivados (multiplicador,
// filas por departamento, % de ocupación activo, A&B, Jefes de Departamento, Gran
// Total) reutilizan directamente direccionData — una sola fuente de verdad para
// Cuadrantes, Panel de Dirección e Informe Ejecutivo.
// =====================================================================
function coefPctDerivadoDeParametros(p) {
  const horasEfectivas = Number(p.horas_convenio_anuales) * (1 - Number(p.tasa_absentismo_pct) / 100);
  const horasAnioCompleto = 365 * Number(p.horas_turno_estandar);
  return horasAnioCompleto ? (horasEfectivas / horasAnioCompleto) * 100 : 0;
}
async function actualizarCoefParametro(campo, valor) {
  const { error } = await sb.from('coef_parametros').upsert({ hotel_id: usuarioActual.hotel_id, [campo]: valor }, { onConflict: 'hotel_id' });
  if (error) {
    mostrarToast('Error al guardar: ' + error.message, false);
    return;
  }
  await cargarDireccionEjecutivaAdmin();
}
async function actualizarCoefParametroBase(campo, valor) {
  const nuevoP = { ...direccionData.p, [campo]: valor };
  const nuevoCoefPct = coefPctDerivadoDeParametros(nuevoP);
  const { error } = await sb.from('coef_parametros').upsert({ hotel_id: usuarioActual.hotel_id, [campo]: valor, coef_pct: nuevoCoefPct }, { onConflict: 'hotel_id' });
  if (error) {
    mostrarToast('Error al guardar: ' + error.message, false);
    return;
  }
  await cargarDireccionEjecutivaAdmin();
}
function renderCoefPlantillaCuadrante() {
  if (!direccionData || !$('coefPctDisplay')) return;
  const d = direccionData;
  const p = d.p;
  const pct = Number(p.coef_pct);
  $('coefPctDisplay').textContent = pct.toFixed(1) + '%';
  if (document.activeElement !== $('coefPctSlider')) $('coefPctSlider').value = pct;
  if (document.activeElement !== $('coefPctNumber')) $('coefPctNumber').value = pct.toFixed(1);
  if (document.activeElement !== $('coefParamHorasConvenio')) $('coefParamHorasConvenio').value = p.horas_convenio_anuales;
  if (document.activeElement !== $('coefParamAbsentismo')) $('coefParamAbsentismo').value = p.tasa_absentismo_pct;
  if (document.activeElement !== $('coefParamHorasTurno')) $('coefParamHorasTurno').value = p.horas_turno_estandar;
  const horasEfectivas = Number(p.horas_convenio_anuales) * (1 - Number(p.tasa_absentismo_pct) / 100);
  $('coefHorasEfectivas').textContent = `Horas efectivas por persona/año (tras absentismo): ${horasEfectivas.toFixed(1)} h · Multiplicador de cobertura actual: ${d.multiplicador.toFixed(2)}× por turno diario cubierto 365 días/año.`;
  const body = $('coefPlantillaBody');
  body.innerHTML = d.escalasFilas.length
    ? d.escalasFilas
        .map((f) => {
          const horasAnuales = f.turnos_dia * Number(p.horas_turno_estandar) * f.dias_cobertura;
          const recomendadoExacto = f.personalBase;
          const recomendadoRedondeado = Math.ceil(recomendadoExacto);
          const diferencia = recomendadoRedondeado - f.headcount;
          const difCls = diferencia > 0 ? 'b-rose' : diferencia < 0 ? 'b-emerald' : 'b-slate';
          const difTxt = diferencia > 0 ? `+${diferencia} (déficit)` : diferencia < 0 ? `${diferencia} (superávit)` : '0 (ajustado)';
          return `<tr><td>${f.nombre}</td><td>${f.turnos_dia}</td><td>${f.dias_cobertura}</td><td>${horasAnuales.toLocaleString('es-ES')} h</td><td>${d.multiplicador.toFixed(2)}×</td><td><b>${recomendadoExacto.toFixed(2)}</b> → ${recomendadoRedondeado}</td><td>${f.headcount}</td><td><span class="badge2 ${difCls}">${difTxt}</span></td></tr>`;
        })
        .join('')
    : '<tr><td colspan="8" class="sub-c" style="text-align:center;padding:14px;">Sin departamentos configurados — cárgalos desde "Plantilla de establecimiento" en Panel de Dirección o aquí abajo.</td></tr>';
}

// ---- Escalas según ocupación: tabla semanal editable (ocupacion_habitaciones) ----
let escalasOcupacionOffsetActivo = 0; // -1 anterior, 0 en curso, 1 próxima (teórica)
let escalasOcupacionRowsCache = [];
let escalasFiltroSoloAB = false;
function fechasSemanaOffsetEscalas(offsetSemanas) {
  const hoy = new Date();
  const lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7) + offsetSemanas * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return d;
  });
}
async function cargarEscalasOcupacionSemana(offsetSemanas) {
  escalasOcupacionOffsetActivo = offsetSemanas;
  const dias = fechasSemanaOffsetEscalas(offsetSemanas);
  const desde = isoFecha(dias[0]);
  const hasta = isoFecha(dias[6]);
  const { data } = await sb.from('ocupacion_habitaciones').select('*').gte('fecha', desde).lte('fecha', hasta);
  escalasOcupacionRowsCache = dias.map((d) => {
    const fecha = isoFecha(d);
    return (data || []).find((x) => x.fecha === fecha) || { fecha, habitaciones_totales: 0, habitaciones_bloqueadas: 0, habitaciones_vendidas: 0 };
  });
  renderEscalasOcupacionSemanaTabla();
}
async function actualizarOcupacionDia(fecha, campo, valor) {
  const n = Math.max(0, parseInt(valor, 10) || 0);
  const { error } = await sb.from('ocupacion_habitaciones').upsert({ hotel_id: usuarioActual.hotel_id, fecha, [campo]: n }, { onConflict: 'hotel_id,fecha' });
  if (error) {
    mostrarToast('Error al guardar: ' + error.message, false);
    return;
  }
  await cargarEscalasOcupacionSemana(escalasOcupacionOffsetActivo);
  await cargarDireccionEjecutivaAdmin();
}
function usarPromedioComoOcupacionActiva() {
  mostrarToast('El % de ocupación activo se calcula siempre en vivo desde la semana en curso — guarda los datos de esa semana arriba para que se refleje aquí.');
  cargarEscalasOcupacionSemana(0);
}
function renderEscalasOcupacionSemanaTabla() {
  const tabsEl = $('escalasOcupacionSemanaTabs');
  if (!tabsEl) return;
  const opciones = [
    [-1, 'Semana anterior'],
    [0, 'Semana en curso'],
    [1, 'Próxima (teórica)']
  ];
  tabsEl.innerHTML = opciones
    .map(([v, l]) => `<button type="button" class="btn btn-sm ${Number(v) === escalasOcupacionOffsetActivo ? '' : 'btn-secondary'}" onclick="cargarEscalasOcupacionSemana(${v})">${l}</button>`)
    .join('');
  const body = $('escalasOcupacionSemanaBody');
  if (!body) return;
  const DIAS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  let sumaPct = 0;
  body.innerHTML = escalasOcupacionRowsCache
    .map((r, i) => {
      const disp = Math.max(0, r.habitaciones_totales - r.habitaciones_bloqueadas);
      const pct = disp > 0 ? Math.min(100, (r.habitaciones_vendidas / disp) * 100) : 0;
      sumaPct += pct;
      return `<tr><td>${DIAS_LABEL[i]} · ${r.fecha}</td>
        <td><input type="number" min="0" style="width:80px;margin:0;" value="${r.habitaciones_totales}" onchange="actualizarOcupacionDia('${r.fecha}','habitaciones_totales',this.value)"></td>
        <td><input type="number" min="0" style="width:80px;margin:0;" value="${r.habitaciones_bloqueadas}" onchange="actualizarOcupacionDia('${r.fecha}','habitaciones_bloqueadas',this.value)"></td>
        <td><input type="number" min="0" style="width:80px;margin:0;" value="${r.habitaciones_vendidas}" onchange="actualizarOcupacionDia('${r.fecha}','habitaciones_vendidas',this.value)"></td>
        <td>${pct.toFixed(1)}%</td></tr>`;
    })
    .join('');
  const prom = escalasOcupacionRowsCache.length ? sumaPct / escalasOcupacionRowsCache.length : 0;
  if ($('escalasOcupacionSemanaPromedio')) {
    $('escalasOcupacionSemanaPromedio').innerHTML = `Promedio de ocupación de esta semana: <b>${prom.toFixed(1)}%</b>${
      escalasOcupacionOffsetActivo === 0 ? ' · <button type="button" class="btn btn-secondary btn-sm" onclick="usarPromedioComoOcupacionActiva()">↺ Actualizar % de ocupación activo</button>' : ''
    }`;
  }
  renderEscalasOcupacionComparativa();
}
function renderEscalasOcupacionComparativa() {
  const body = $('escalasOcupacionComparativaBody');
  if (!body || !direccionData) return;
  const d = direccionData;
  const filas = [
    ['Semana anterior', d.pctAnterior],
    ['Semana en curso', d.pctActual],
    ['Próxima (teórica)', d.pctProxima]
  ];
  body.innerHTML = filas.map(([label, pct]) => `<tr><td>${label}</td><td>${pct != null ? pct.toFixed(1) + '%' : 'sin datos'}</td></tr>`).join('');
}
function renderEscalasOcupacionCuadrante() {
  if (!direccionData || !$('escalasOcupacionPctDisplay')) return;
  const d = direccionData;
  $('escalasOcupacionPctDisplay').textContent = d.pctActivo.toFixed(1) + '%';
  $('escalasOcupacionResumenCuadro').innerHTML = escalasResumenCondensadoHTML(d);
  $('escalasOcupacionAB').innerHTML = direccionABHTML(d);
  $('escalasGranTotal').innerHTML = granTotalResumenHTML(d);
  renderEscalasOcupacionComparativa();

  const filasVisibles = escalasFiltroSoloAB ? d.escalasFilas.filter((f) => f.puesto_key === 'cocina' || f.puesto_key === 'sala') : d.escalasFilas;
  $('escalasOcupacionDeptoBody').innerHTML = filasVisibles.length
    ? filasVisibles
        .map(
          (f) =>
            `<tr><td>${f.nombre}${f.es_critico_ab ? ' <span class="badge2 b-slate">CCC</span>' : ''}</td><td>${f.turnosBase.toFixed(1)} → ${f.turnosAjustado.toFixed(1)}</td><td>${Math.ceil(f.personalBase)} → ${Math.ceil(f.personalAjustado)}</td><td>${fmtEur(f.costePersonalAjustado)}</td><td>${fmtEur(f.costePersonalAjustado + f.costeSSAjustado)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="sub-c" style="text-align:center;padding:14px;">Sin departamentos configurados.</td></tr>';

  $('escalasDireccionDeptoBody').innerHTML = d.direccionFilas.length
    ? d.direccionFilas
        .map(
          (f) =>
            `<tr><td>${f.nombre}${f.es_estimado ? ' <span class="badge2 b-amber">estimado</span>' : ''}</td><td>${f.nivel}</td><td>${f.personal}</td><td>${f.turnos}</td><td>${fmtEur(f.costePersonal)}</td><td>${fmtEur(f.costeTotal)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="6" class="sub-c" style="text-align:center;padding:14px;">Sin jefaturas/Dirección configuradas.</td></tr>';
}

// ---------- Informes: exportables CSV ----------
// Descarga un CSV (punto y coma, BOM UTF-8 para que Excel en español lo abra con acentos
// correctos) generado enteramente en el navegador — no hay backend de informes.
function descargarCSV(nombreArchivo, headers, filas) {
  const escapar = (v) => {
    const s = String(v ?? '');
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const csv = '﻿' + [headers, ...filas].map((fila) => fila.map(escapar).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Informe Ejecutivo / Panel de Dirección — "Ver" y "Descargar", formato profesional ----------
// Antes "Ver informe" solo hacía scrollIntoView() dentro del propio panel de RR.HH. — nunca
// producía nada que se pudiera enseñar o enviar a Dirección General/CEOs (que no tienen acceso a
// este panel), y la descarga era una copia manual y recortada del mismo contenido, con sus propias
// fórmulas duplicadas (riesgo de quedar desincronizada). Ahora "Ver" y "Descargar" generan el
// MISMO documento: una instantánea en vivo de las secciones que ya están calculadas y renderizadas
// en pantalla —"todos los datos más relevantes que se ven a continuación", tal cual pidió César—,
// reutilizando el mismo CSS de tarjetas/tablas de la propia app (así el aspecto es idéntico al que
// ya se ve en pantalla) y sin mantener una segunda copia de ninguna fórmula: si algo cambia en la
// app, el informe cambia solo la próxima vez que se genere.
function _snapshotSeccionInforme(id, titulo) {
  const el = document.getElementById(id);
  if (!el || !el.innerHTML.trim()) return '';
  // Los controles interactivos (botones, inputs de archivo) no tienen función en un documento
  // estático pensado para enseñarse o enviarse fuera de la app — se quitan de la instantánea.
  const limpio = el.innerHTML.replace(/<button[\s\S]*?<\/button>/g, '').replace(/<input[^>]*>/g, '');
  return `<section class="rep-bloque">${titulo ? `<h2>${titulo}</h2>` : ''}${limpio}</section>`;
}
function _generarReporteEjecutivoHTML(titulo, subtitulo, secciones) {
  const estilos = (document.querySelector('style') || {}).textContent || '';
  const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }) + ' · ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const hotel = usuarioActual && usuarioActual.hotel_nombre ? usuarioActual.hotel_nombre : 'V4Pax';
  const cuerpo = secciones.map(([id, t]) => _snapshotSeccionInforme(id, t)).filter(Boolean).join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${titulo} — ${hotel}</title>
<style>${estilos}
body{max-width:980px;margin:0 auto;padding:32px 24px 60px;background:#fff;}
.rep-portada{margin-bottom:26px;padding-bottom:18px;border-bottom:2px solid var(--brand-200,#a3edd8);display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;}
.rep-portada h1{font-size:22px;margin:0 0 4px;color:var(--ink-900,#0b1410);}
.rep-portada p{margin:0;color:var(--slate-500,#64748b);font-size:12.5px;}
.rep-portada .rep-sello{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:var(--brand-700,#146950);background:var(--brand-50,#edfbf7);border:1px solid var(--brand-200,#a3edd8);border-radius:999px;padding:5px 12px;white-space:nowrap;}
.rep-bloque{margin-bottom:28px;}
.rep-bloque h2{font-size:14.5px;margin:0 0 12px;color:var(--ink-900,#0b1410);padding-bottom:8px;border-bottom:1px solid var(--slate-200,#e2e8f0);}
.rep-footer{margin-top:34px;padding-top:14px;border-top:1px solid var(--slate-200,#e2e8f0);font-size:11px;color:var(--slate-400,#94a3b8);}
.rep-print-btn{position:fixed;top:16px;right:16px;background:var(--brand-600,#0f9d78);color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.15);}
@media print{ body{padding:0;} .rep-bloque{page-break-inside:avoid;} .rep-print-btn{display:none;} }
</style></head><body>
<button type="button" class="rep-print-btn" onclick="window.print()">🖨 Imprimir / Guardar como PDF</button>
<div class="rep-portada"><div><h1>${titulo}</h1><p>${subtitulo}</p></div><span class="rep-sello">${hotel} · ${fecha}</span></div>
${cuerpo}
<p class="rep-footer">Generado automáticamente desde Personal4Pax · X10 THINK — instantánea de los datos reales registrados en la app en el momento de la generación. Todas las cifras económicas se muestran en formato euro (00.000,00 €).</p>
</body></html>`;
}
const INFORME_EJECUTIVO_SECCIONES = [
  ['informesKpis', '📊 Indicadores generales'],
  ['informesCosteCobertura', null],
  ['informesBajasMedicas', null],
  ['informesBajasCese', null],
  ['informesFormacionCatalogo', null],
  ['informesEvaluacionesDesempeno', null]
];
function verInformeEjecutivo() {
  if (!direccionData) return mostrarToast('Espera a que termine de cargar el Panel de Dirección', false);
  const html = _generarReporteEjecutivoHTML('📄 Informe Ejecutivo — Dashboard de RR.HH.', 'Totales del dashboard y desglose por cada concepto de coste, listo para enseñar o enviar a Dirección General.', INFORME_EJECUTIVO_SECCIONES);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  registrarAuditoria('Informes', 'Visualización del Informe Ejecutivo', new Date().toLocaleString('es-ES'));
}
function exportarInformeEjecutivoHtml() {
  if (!direccionData) return mostrarToast('Espera a que termine de cargar el Panel de Dirección', false);
  const html = _generarReporteEjecutivoHTML('📄 Informe Ejecutivo — Dashboard de RR.HH.', 'Totales del dashboard y desglose por cada concepto de coste, listo para enseñar o enviar a Dirección General.', INFORME_EJECUTIVO_SECCIONES);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Informe_Ejecutivo_RRHH_${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  registrarAuditoria('Informes', 'Descarga del Informe Ejecutivo (.html)', new Date().toLocaleString('es-ES'));
  mostrarToast('Informe Ejecutivo descargado ✓', true);
}
// Panel de Dirección — "descargar todo el dashboard" pedido explícitamente para no tener que
// hacer capturas de pantalla para enviar al CEO. Mismo generador que el Informe Ejecutivo, pero
// con las secciones propias de Dirección (KPIs globales, composición, magnitud por puesto,
// lectura ejecutiva, escalas, A&B y coste total combinado).
const PANEL_DIRECCION_SECCIONES = [
  ['panelDireccionGeneralKpis', '📊 KPIs globales de empresa'],
  ['panelDireccionCostes', '🏢 Coste de Cobertura de Plantilla — Resumen Ejecutivo'],
  ['direccionComposicionChart', '📊 Composición del coste medio de cobertura de puesto de trabajo'],
  ['direccionMagnitudChart', '📊 Coste de cobertura de plantilla — por puesto de trabajo'],
  ['direccionInsight', '🧭 Lectura para Dirección'],
  ['direccionEscalasOcupacion', '🏨 Escalas según ocupación — resumen'],
  ['direccionAB', '🔴 Alimentos & Bebidas (A&B) — centro de costo crítico'],
  ['direccionGranTotal', '💼 Coste total de la plantilla (personal base + jefaturas/Administración/Dirección)']
];
function verPanelDireccionCompleto() {
  if (!direccionData) return mostrarToast('Espera a que termine de cargar el Panel de Dirección', false);
  const html = _generarReporteEjecutivoHTML('🏢 Panel de Dirección — Informe completo', 'Foto consolidada de empresa, lista para enseñar o enviar al CEO sin depender de capturas de pantalla.', PANEL_DIRECCION_SECCIONES);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  registrarAuditoria('Dirección', 'Visualización del Panel de Dirección completo', new Date().toLocaleString('es-ES'));
}
function descargarPanelDireccionCompleto() {
  if (!direccionData) return mostrarToast('Espera a que termine de cargar el Panel de Dirección', false);
  const html = _generarReporteEjecutivoHTML('🏢 Panel de Dirección — Informe completo', 'Foto consolidada de empresa, lista para enseñar o enviar al CEO sin depender de capturas de pantalla.', PANEL_DIRECCION_SECCIONES);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Panel_Direccion_${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  registrarAuditoria('Dirección', 'Descarga del Panel de Dirección completo (.html)', new Date().toLocaleString('es-ES'));
  mostrarToast('Panel de Dirección descargado ✓', true);
}

// Exportables rápidos — antes solo tenían un concepto y un número suelto en formato técnico
// (".toFixed(2)", sin separador de miles ni coma decimal), sin ninguna explicación de qué incluye
// cada cifra. Ahora cada CSV lleva una cabecera de contexto (hotel + fecha de generación), una
// columna "Explicación" y los importes en el mismo formato de Euro "00.000,00 €" que el resto de
// la app (fmtEur), para que se puedan enseñar o enviar tal cual, no solo importar en una hoja de cálculo.
function _cabeceraExportable(titulo) {
  const hotel = usuarioActual && usuarioActual.hotel_nombre ? usuarioActual.hotel_nombre : 'V4Pax';
  const fecha = new Date().toLocaleString('es-ES');
  return [[titulo], [`${hotel} · generado el ${fecha}`], []];
}
function exportarResumenEjecutivoCSV() {
  if (!direccionData) return mostrarToast('Espera a que termine de cargar el Panel de Dirección', false);
  const d = direccionData;
  const porPersona = d.avgCoste ? d.avgCoste.totalAvg : 0;
  const filas = [
    ['EPI + Uniformidad (total plantilla)', fmtEur(d.deptosFilas.reduce((s, f) => s + f.costeEpi * f.headcount, 0)), 'Coste de equipos de protección individual y uniformidad de toda la plantilla activa, por puesto.'],
    ['Formación obligatoria (total plantilla)', fmtEur(d.deptosFilas.reduce((s, f) => s + f.costeFormacion * f.headcount, 0)), 'Coste del catálogo de formación obligatoria aplicado a toda la plantilla activa, por puesto.'],
    ['Entrevistas de contratación (total)', fmtEur(d.entrevistasTotal), 'Coste estimado de las entrevistas de contratación realizadas (minutos × tarifa/hora neta).'],
    ['Vigilancia de la salud (total)', fmtEur(d.vigilanciaTotal), 'Coste de las revisiones médicas de vigilancia de la salud ya registradas.'],
    ['Coste de cobertura de plantilla (total)', fmtEur(d.coberturaConVigilancia), 'Suma de EPI/Uniformidad + Formación obligatoria + Entrevista + Vigilancia de la salud.'],
    ['Coste medio por persona trabajadora', fmtEur(porPersona), 'Coste de cobertura de plantilla dividido entre el número de personas trabajadoras activas.'],
    ['Coste de personal base (ocupación activa, /semana)', fmtEur(d.costeTotalAjustadoTotal), 'Coste salarial + Seguridad Social del personal operativo, ajustado a la ocupación real de la semana en curso.'],
    ['Coste jefaturas/Administración/Dirección (/semana)', fmtEur(d.direccionTotal), 'Coste salarial + Seguridad Social de jefaturas de departamento, Administración y Dirección (no rotan con la ocupación).'],
    ['Coste TOTAL de plantilla completa (/semana)', fmtEur(d.granTotalAjustadoSemanal), 'Coste de personal base + jefaturas/Administración/Dirección — coste semanal combinado de toda la plantilla.']
  ];
  descargarCSV('resumen_ejecutivo_costes.csv', ['Concepto', 'Importe', 'Explicación'], [..._cabeceraExportable('Resumen Ejecutivo de Costes — Personal4Pax'), ...filas]);
}

function exportarCoberturaPorPuestoCSV() {
  if (!direccionData) return mostrarToast('Espera a que termine de cargar el Panel de Dirección', false);
  const filas = [...direccionData.deptosFilas].sort((a, b) => b.costeTotal - a.costeTotal);
  descargarCSV(
    'cobertura_plantilla_por_puesto.csv',
    ['Puesto', 'Activos', 'EPI + Uniformidad (unit.)', 'Formación obligatoria (unit.)', 'Coste por puesto (unit.)', 'Subtotal (puesto × activos)'],
    [
      ..._cabeceraExportable('Cobertura de Plantilla por Puesto — Personal4Pax'),
      ...filas.map((f) => [f.nombre, f.headcount, fmtEur(f.costeEpi), fmtEur(f.costeFormacion), fmtEur(f.costeUnit), fmtEur(f.costeTotal)])
    ]
  );
}

function exportarRotacionBajasCSV() {
  const entrevistaSalidaCoste = direccionData ? (15 / 60) * Number(direccionData.p.tarifa_hora_neta) : 0;
  const filasCese = informesCesesCache.map((p) => {
    let coste = 0;
    if (direccionData) {
      const depto = direccionData.deptosFilas.find((f) => f.puesto_key === p.puesto_key);
      coste = (depto ? depto.costeUnit : direccionData.costeMedioEpi + direccionData.costeMedioFormacion) + direccionData.entrevistaCoste + entrevistaSalidaCoste;
    }
    return ['Cese', p.nombre, p.puesto || '—', p.motivo_cese, p.fecha_cese || '—', '—', fmtEur(coste)];
  });
  const filasMedicas = informesBajasMedicasCache.map((b) => [
    'Médica',
    b.personas_trabajadoras ? b.personas_trabajadoras.nombre : '—',
    b.personas_trabajadoras ? b.personas_trabajadoras.puesto || '—' : '—',
    b.motivo || '—',
    b.fecha_inicio || '—',
    b.fecha_alta || 'En curso',
    '—'
  ]);
  descargarCSV('rotacion_y_bajas.csv', ['Tipo', 'Persona trabajadora', 'Puesto', 'Motivo', 'Fecha inicio/cese', 'Fecha alta', 'Coste invertido perdido'], [
    ..._cabeceraExportable('Rotación y Bajas (médicas + cese) — Personal4Pax'),
    ...filasCese,
    ...filasMedicas
  ]);
}

async function exportarVigilanciaCSV() {
  const { data, error } = await sb.from('vigilancia_salud').select('*, personas_trabajadoras(nombre, puesto)').order('created_at', { ascending: false });
  if (error) return mostrarToast('Error al exportar: ' + error.message, false);
  descargarCSV(
    'vigilancia_salud.csv',
    ['Persona trabajadora', 'Puesto', 'Estado', 'Fecha cita', 'Aptitud'],
    [
      ..._cabeceraExportable('Vigilancia de la Salud — Personal4Pax'),
      ...(data || []).map((v) => [v.personas_trabajadoras ? v.personas_trabajadoras.nombre : '—', v.personas_trabajadoras ? v.personas_trabajadoras.puesto || '—' : '—', v.estado || '—', v.cita_fecha || '—', v.aptitud || '—'])
    ]
  );
}

async function exportarCuadrantesTotalesCSV() {
  const mes = parseInt($('cuadMes').value, 10);
  const anio = parseInt($('cuadAnio').value, 10);
  if (Number.isNaN(mes) || Number.isNaN(anio)) return mostrarToast('Abre primero Cuadrantes para elegir mes/año', false);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const desde = `${anio}-${String(mes + 1).padStart(2, '0')}-01`;
  const hasta = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(diasEnMes).padStart(2, '0')}`;
  const { data: asignaciones, error } = await sb.from('cuadrante_asignaciones').select('*, turnos_catalogo(codigo)').gte('fecha', desde).lte('fecha', hasta);
  if (error) return mostrarToast('Error al exportar: ' + error.message, false);
  const trabajando = (asignaciones || []).filter((a) => a.turno_id).length;
  const porEstado = {};
  (asignaciones || []).forEach((a) => {
    if (a.estado_especial) porEstado[a.estado_especial] = (porEstado[a.estado_especial] || 0) + 1;
  });
  const nombresEstado = { descanso: 'Descanso', permiso: 'Permiso', baja: 'Baja', ausente: 'Ausente sin justificar', ausencia_autorizada: 'Ausencia autorizada', ausencia_parcial: 'Ausencia parcial' };
  const filas = [['Trabajando (persona/día)', trabajando]];
  Object.keys(nombresEstado).forEach((k) => filas.push([nombresEstado[k], porEstado[k] || 0]));
  const nombreMes = new Date(anio, mes, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  descargarCSV(`cuadrantes_totales_${anio}-${String(mes + 1).padStart(2, '0')}.csv`, ['Concepto', 'Total (persona/día)'], [
    ..._cabeceraExportable(`Cuadrantes — Totales de ${nombreMes} — Personal4Pax`),
    ...filas
  ]);
}

async function exportarFormulariosEstadoCSV() {
  const { data, error } = await sb
    .from('formularios_solicitudes')
    .select('*, personas_trabajadoras(nombre), formularios_plantillas(nombre)')
    .order('created_at', { ascending: false });
  if (error) return mostrarToast('Error al exportar: ' + error.message, false);
  descargarCSV(
    'formularios_estado.csv',
    ['Persona trabajadora', 'Formulario', 'Estado', 'Fecha de solicitud'],
    [
      ..._cabeceraExportable('Formularios — Estado de Solicitudes — Personal4Pax'),
      ...(data || []).map((f) => [f.personas_trabajadoras ? f.personas_trabajadoras.nombre : '—', f.formularios_plantillas ? f.formularios_plantillas.nombre : '—', f.estado || '—', f.fecha_solicitud ? new Date(f.fecha_solicitud).toLocaleDateString('es-ES') : '—'])
    ]
  );
}

// ---------- Arranque ----------
// Red de seguridad: clic en el fondo oscuro de cualquier modal lo cierra, además del botón
// "Cancelar"/"Cerrar" de cada uno — cubre cualquier modal cuyo botón de cierre no responda.
document.addEventListener('click', (ev) => {
  if (ev.target.classList && ev.target.classList.contains('modal-overlay')) {
    ev.target.classList.add('hidden');
  }
  const notifItem = ev.target.closest && ev.target.closest('.notif-item');
  if (notifItem) {
    marcarNotificacionLeida(notifItem.dataset.notifId);
  } else if (!ev.target.closest || !ev.target.closest('.notif-wrap')) {
    const panel = $('notifPanel');
    if (panel && !panel.classList.contains('hidden')) panel.classList.add('hidden');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  $('loginForm').addEventListener('submit', login);
  $('btnLogout').addEventListener('click', logout);
  $('btnNotifBell').addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleNotifPanel();
  });
  $('btnNotifMarcarTodas').addEventListener('click', marcarTodasNotificacionesLeidas);
  document.querySelectorAll('.sb-item').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.screen));
  });
  $('btnNuevoEmpleado').addEventListener('click', () => abrirFichaEmpleado(null));
  $('empBuscador').addEventListener('input', renderListaEmpleados);
  $('empFiltroDepartamento').addEventListener('change', renderListaEmpleados);
  $('btnExportarEmpleados').addEventListener('click', exportarEmpleadosCSV);
  $('btnImportarEmpleados').addEventListener('click', abrirModalImportarEmpleados);
  $('btnCerrarImportarEmpleados').addEventListener('click', cerrarModalImportarEmpleados);
  $('btnConfirmarImportarEmpleados').addEventListener('click', confirmarImportarEmpleados);
  $('btnArcFiltrar').addEventListener('click', aplicarFiltroArchivo);
  $('btnArcLimpiarFiltro').addEventListener('click', limpiarFiltroArchivo);
  $('btnArcFichaBuscar').addEventListener('click', buscarFichaHistorica);
  $('arcFichaBuscarNombre').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscarFichaHistorica();
  });
  $('btnVerInformeEjecutivo').addEventListener('click', verInformeEjecutivo);
  $('btnDescargarInformeEjecutivoHtml').addEventListener('click', exportarInformeEjecutivoHtml);
  $('btnVerPanelDireccionCompleto').addEventListener('click', verPanelDireccionCompleto);
  $('btnDescargarPanelDireccionCompleto').addEventListener('click', descargarPanelDireccionCompleto);
  $('formulariosSoloCierres').addEventListener('change', renderBandejaFirmas);
  $('btnVerCatalogoFormularios').addEventListener('click', verCatalogoFormularios);
  $('btnDescargarCatalogoFormulariosDocx').addEventListener('click', exportarCatalogoFormulariosDocx);
  $('btnCerrarVerFormulario').addEventListener('click', () => $('modalVerFormulario').classList.add('hidden'));
  $('btnCerrarCorreoTrabajador').addEventListener('click', cerrarCorreoTrabajadorModal);
  $('btnEnviarCorreoTrabajador').addEventListener('click', enviarCorreoTrabajador);
  $('btnCerrarGenerarCorreoFormacion').addEventListener('click', cerrarGenerarCorreoFormacion);
  $('btnEnviarCorreoFormacion').addEventListener('click', enviarCorreoFormacion);
  $('btnCerrarVerSolicitudFormacion').addEventListener('click', cerrarVerSolicitudFormacion);
  $('btnGuardarSolicitudFormacionDetalle').addEventListener('click', guardarSolicitudFormacionDetalle);
  $('btnCerrarProgramarFormacion').addEventListener('click', cerrarProgramarFormacion);
  $('btnConfirmarProgramarFormacion').addEventListener('click', confirmarProgramarFormacion);
  $('btnCerrarFicha').addEventListener('click', cerrarModalFicha);
  $('formFichaEmpleado').addEventListener('submit', guardarFichaEmpleado);
  $('btnCerrarTurno').addEventListener('click', cerrarModalTurno);
  $('btnGuardarTurno').addEventListener('click', guardarTurno);
  $('cuadMes').addEventListener('change', cargarCuadrantes);
  $('cuadAnio').addEventListener('change', cargarCuadrantes);
  $('cuadFiltroDepto').addEventListener('change', cargarCuadrantes);
  $('btnImportarCuadrante').addEventListener('click', abrirModalImportarCuadrante);
  $('btnCerrarImportarCuadrante').addEventListener('click', cerrarModalImportarCuadrante);
  $('btnConfirmarImportarCuadrante').addEventListener('click', confirmarImportarCuadrante);
  $('btnPublicarCuadrante').addEventListener('click', publicarCuadranteActual);
  $('btnNuevaSecuencia').addEventListener('click', () => abrirModalSecuencia(null));
  $('btnCerrarSecuencia').addEventListener('click', cerrarModalSecuencia);
  $('formSecuencia').addEventListener('submit', guardarSecuencia);
  $('btnCerrarAsignarSecuencia').addEventListener('click', cerrarModalAsignarSecuencia);
  $('btnConfirmarAsignarSecuencia').addEventListener('click', confirmarAsignarSecuencia);
  $('btnQuitarFiltrosCuadrante').addEventListener('click', () => {
    Array.from($('cuadFiltroDepto').options).forEach((o) => (o.selected = false));
    const hoy = new Date();
    $('cuadMes').value = hoy.getMonth();
    $('cuadAnio').value = hoy.getFullYear();
    cargarCuadrantes();
  });
  $('btnCerrarSecuenciaIndividual').addEventListener('click', cerrarModalSecuenciaIndividual);
  $('btnGuardarSecuenciaIndividual').addEventListener('click', guardarSecuenciaIndividual);

  const clampPct = (v) => Math.max(10, Math.min(100, parseFloat(v) || 0));
  $('coefPctSlider').addEventListener('input', (e) => {
    $('coefPctDisplay').textContent = clampPct(e.target.value).toFixed(1) + '%';
    $('coefPctNumber').value = e.target.value;
  });
  $('coefPctSlider').addEventListener('change', (e) => actualizarCoefParametro('coef_pct', clampPct(e.target.value)));
  $('coefPctNumber').addEventListener('change', (e) => actualizarCoefParametro('coef_pct', clampPct(e.target.value)));
  $('btnCoefMenos5').addEventListener('click', () => actualizarCoefParametro('coef_pct', clampPct(Number(direccionData.p.coef_pct) - 5)));
  $('btnCoefMas5').addEventListener('click', () => actualizarCoefParametro('coef_pct', clampPct(Number(direccionData.p.coef_pct) + 5)));
  $('btnCoefRecalcular').addEventListener('click', async () => {
    await actualizarCoefParametro('coef_pct', coefPctDerivadoDeParametros(direccionData.p));
    mostrarToast('Coeficiente recalculado desde los parámetros base ✓');
  });
  $('coefParamHorasConvenio').addEventListener('change', (e) => actualizarCoefParametroBase('horas_convenio_anuales', parseFloat(e.target.value) || 0));
  $('coefParamAbsentismo').addEventListener('change', (e) => actualizarCoefParametroBase('tasa_absentismo_pct', parseFloat(e.target.value) || 0));
  $('coefParamHorasTurno').addEventListener('change', (e) => actualizarCoefParametroBase('horas_turno_estandar', parseFloat(e.target.value) || 0));
  $('escalasFiltroSoloABCheckbox').addEventListener('change', (e) => {
    escalasFiltroSoloAB = e.target.checked;
    renderEscalasOcupacionCuadrante();
  });

  $('btnLevantarIncidencia').addEventListener('click', abrirModalLevantarIncidencia);
  $('btnCerrarLevantarIncidencia').addEventListener('click', cerrarModalLevantarIncidencia);
  $('formLevantarIncidencia').addEventListener('submit', guardarLevantarIncidencia);

  $('btnNuevoDepartamento').addEventListener('click', () => abrirModalDepartamento(null));
  $('btnCerrarDepartamento').addEventListener('click', cerrarModalDepartamento);
  $('formDepartamento').addEventListener('submit', guardarDepartamento);

  $('btnNuevaDescPuesto').addEventListener('click', () => abrirModalDescPuesto(null));
  $('btnCerrarDescPuesto').addEventListener('click', cerrarModalDescPuesto);
  $('formDescPuesto').addEventListener('submit', guardarDescPuesto);
  $('btnCerrarVerDescPuesto').addEventListener('click', cerrarModalVerDescPuesto);
  $('btnCerrarEvaluacionPuesto').addEventListener('click', cerrarEvaluacionPuestoModal);
  $('btnGuardarEvaluacionPuesto').addEventListener('click', guardarEvaluacionPuesto);

  $('btnNuevoArticuloEpi').addEventListener('click', () => abrirModalArticuloEpi());
  $('btnCerrarArticuloEpi').addEventListener('click', cerrarModalArticuloEpi);
  $('formArticuloEpi').addEventListener('submit', guardarArticuloEpi);
  $('btnCerrarEditarPuestoLabel').addEventListener('click', cerrarEditarPuestoLabel);
  $('formEditarPuestoLabel').addEventListener('submit', guardarPuestoLabel);

  $('btnNuevaDevolucion').addEventListener('click', abrirModalDevolucion);
  $('btnCerrarDevolucion').addEventListener('click', cerrarModalDevolucion);
  $('formDevolucion').addEventListener('submit', guardarDevolucion);
  $('btnCerrarClonarPuesto').addEventListener('click', cerrarModalClonarPuesto);
  $('formClonarPuesto').addEventListener('submit', guardarClonarPuesto);
  $('btnCerrarPrlEnviarSolicitud').addEventListener('click', cerrarEnviarSolicitudPrevenlia);
  $('btnConfirmarPrlEnviarSolicitud').addEventListener('click', confirmarEnviarSolicitudPrevenlia);
  $('btnCerrarVigEnviarSolicitud').addEventListener('click', cerrarEnviarSolicitudMutua);
  $('btnConfirmarVigEnviarSolicitud').addEventListener('click', confirmarEnviarSolicitudMutua);
  $('btnCerrarAccCorreo').addEventListener('click', cerrarAccCorreo);
  $('btnEnviarAccCorreo').addEventListener('click', enviarAccCorreo);
  $('btnRegistrarFirmaAccCorreo').addEventListener('click', registrarFirmaTrabajadorAccidente);

  $('matrizFiltroDepto').addEventListener('change', renderMatrizCumplimientoFormacionAdmin);
  $('matrizFiltroEstado').addEventListener('change', renderMatrizCumplimientoFormacionAdmin);
  $('matrizFiltroBloque').addEventListener('change', renderMatrizCumplimientoFormacionAdmin);
  $('btnCerrarEvalPractica').addEventListener('click', cerrarModalEvalPractica);
  $('btnEvalApto').addEventListener('click', () => guardarEvalPractica(true));
  $('btnEvalNoApto').addEventListener('click', () => guardarEvalPractica(false));
  $('btnVerManualDesdeCompliance').addEventListener('click', () => showScreen('admin-manual'));
  $('btnVerManualCompleto').addEventListener('click', verManualEmpresaCompleto);
  $('btnDescargarManualDocx').addEventListener('click', exportarManualEmpresaDocx);
  $('linkManualVigilancia').addEventListener('click', (e) => { e.preventDefault(); showScreen('admin-vigilancia-salud'); });
  $('normativaBuscador').addEventListener('input', renderNormativaAdmin);
  $('btnNormativaConsultarAdmin').addEventListener('click', buscarNormativaAdmin);
  $('normativaQueryAdmin').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscarNormativaAdmin();
    }
  });
  // Delegado en el contenedor (igual que en la app de la persona trabajadora): los chips se
  // generan dinámicamente tras cargar normativa_faq, así que no existen todavía aquí.
  $('normativaSugerenciasAdmin').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sugerencia-admin]');
    if (!btn) return;
    $('normativaQueryAdmin').value = btn.dataset.sugerenciaAdmin;
    buscarNormativaAdmin();
  });

  $('vigFiltroEstado').addEventListener('change', renderVigilanciaMatriz);
  $('vigFiltroTipo').addEventListener('change', renderVigilanciaMatriz);
  $('btnCerrarVigCita').addEventListener('click', cerrarModalVigCita);
  $('btnGuardarVigCita').addEventListener('click', guardarVigCita);
  $('btnCerrarVigResultado').addEventListener('click', cerrarModalVigResultado);
  $('btnGuardarVigResultado').addEventListener('click', guardarVigResultado);
  $('prlFiltroEstado').addEventListener('change', renderFormacionPRLMatriz);
  $('prlFiltroTipo').addEventListener('change', renderFormacionPRLMatriz);
  $('btnCerrarPrlCita').addEventListener('click', cerrarModalPrlCita);
  $('btnGuardarPrlCita').addEventListener('click', guardarPrlCita);
  $('btnCerrarPrlResultado').addEventListener('click', cerrarModalPrlResultado);
  $('btnGuardarPrlResultado').addEventListener('click', guardarPrlResultado);
  $('btnCerrarRespuestasComunidadAdmin').addEventListener('click', cerrarRespuestasComunidadAdmin);
  $('btnEnviarRespuestaComunidadAdmin').addEventListener('click', enviarRespuestaComunidadAdmin);

  $('btnNuevaEmpresa').addEventListener('click', abrirModalEmpresa);
  $('btnCerrarEmpresa').addEventListener('click', cerrarModalEmpresa);
  $('formEmpresa').addEventListener('submit', guardarEmpresa);
  $('btnNuevoCentro').addEventListener('click', abrirModalCentro);
  $('btnCerrarCentro').addEventListener('click', cerrarModalCentro);
  $('formCentro').addEventListener('submit', guardarCentro);
  $('coordBuscador').addEventListener('input', renderCoordEmpresasBody);
  $('btnExportarCoordinacion').addEventListener('click', exportarCoordinacionCSV);
  $('btnImportarCoordinacion').addEventListener('click', abrirModalImportarCoordinacion);
  $('btnCerrarImportarCoordinacion').addEventListener('click', cerrarModalImportarCoordinacion);
  $('btnConfirmarImportarCoordinacion').addEventListener('click', confirmarImportarCoordinacion);
  $('btnImportarEmpresasCentros').addEventListener('click', abrirModalImportarEmpresasCentros);
  $('btnCerrarImportarEmpresasCentros').addEventListener('click', cerrarModalImportarEmpresasCentros);
  $('btnConfirmarImportarEmpresasCentros').addEventListener('click', confirmarImportarEmpresasCentros);

  $('btnNuevoAccidente').addEventListener('click', abrirModalAccidente);
  $('btnCerrarAccidente').addEventListener('click', cerrarModalAccidente);
  $('formAccidente').addEventListener('submit', guardarAccidente);
  $('btnCerrarInformeAccidente').addEventListener('click', cerrarModalInformeAccidente);
  $('formInformeAccidente').addEventListener('submit', guardarInformeAccidente);

  $('btnCerrarSugerencia').addEventListener('click', cerrarSugerenciaModal);
  $('formSugerencia').addEventListener('submit', guardarRespuestaSugerencia);

  $('btnCerrarDenuncia').addEventListener('click', cerrarDenunciaModal);
  $('formDenuncia').addEventListener('submit', guardarGestionDenuncia);

  $('btnNuevoExpediente').addEventListener('click', abrirNuevoExpedienteModal);
  $('btnCerrarNuevoExpediente').addEventListener('click', cerrarNuevoExpedienteModal);
  $('formNuevoExpediente').addEventListener('submit', guardarNuevoExpediente);
  $('btnCerrarExpediente').addEventListener('click', cerrarExpedienteModal);
  $('formExpediente').addEventListener('submit', guardarEstadoExpediente);
  $('btnCerrarFormularioDisc').addEventListener('click', cerrarFormularioDiscModal);
  $('fdExpedienteId').addEventListener('change', sincronizarTrabajadorDesdeExpedienteDisc);
  $('formFormularioDisc').addEventListener('submit', guardarFormularioDisc);
  $('btnCerrarVerFormDisc').addEventListener('click', cerrarModalVerFormDisc);

  $('btnNuevoCandidato').addEventListener('click', abrirNuevoCandidatoModal);
  $('btnCerrarNuevoCandidato').addEventListener('click', cerrarNuevoCandidatoModal);
  $('formNuevoCandidato').addEventListener('submit', guardarNuevoCandidato);
  $('btnCerrarCandidato').addEventListener('click', cerrarCandidatoModal);
  if ($('btnCerrarVisorDocumento')) $('btnCerrarVisorDocumento').addEventListener('click', cerrarVisorDocumento);
  if ($('visorDocumentoCabecera')) {
    $('visorDocumentoCabecera').addEventListener('mousedown', _iniciarArrastreVisorDocumento);
    $('visorDocumentoCabecera').addEventListener('touchstart', _iniciarArrastreVisorDocumento, { passive: false });
  }
  document.addEventListener('mousemove', _moverVisorDocumento);
  document.addEventListener('touchmove', _moverVisorDocumento, { passive: false });
  document.addEventListener('mouseup', _soltarVisorDocumento);
  document.addEventListener('touchend', _soltarVisorDocumento);
  $('formCandidato').addEventListener('submit', guardarCandidato);
  $('candModalAltaBtn').addEventListener('click', darAltaDesdeCanditado);
  $('btnCandConfirmarContratacion').addEventListener('click', confirmarContratacionYEnviar);
  // César: "el resultado en % se debe cargar automáticamente, el resultado de la entrevista debe
  // tener un desplegable" — se recalcula en vivo al tocar el % a mano (p. ej. tras leer el Excel).
  $('candModalPuntuacion').addEventListener('input', () => {
    const v = $('candModalPuntuacion').value ? parseInt($('candModalPuntuacion').value, 10) : null;
    if ($('candModalResultadoCategoria')) $('candModalResultadoCategoria').value = categoriaResultadoEntrevista(v, umbralAdaptacionCandidatoCache) || '';
  });
  $('btnSubirCvCandidato').addEventListener('click', () => $('candCvInput').click());
  $('candCvInput').addEventListener('change', subirCvCandidato);
  $('btnSubirDniNieCandidato').addEventListener('click', () => $('candDniNieInput').click());
  $('candDniNieInput').addEventListener('change', subirDniNieCandidato);
  $('btnSubirCertificadoBancarioCandidato').addEventListener('click', () => $('candCertificadoBancarioInput').click());
  $('candCertificadoBancarioInput').addEventListener('change', subirCertificadoBancarioCandidato);
  $('btnCerrarExpedienteCandidato').addEventListener('click', cerrarExpedienteCompletoCandidato);
  if ($('btnCopiarEnlaceDocumentacion')) $('btnCopiarEnlaceDocumentacion').addEventListener('click', copiarEnlaceDocumentacionCandidato);
  if ($('btnGuardarEstadoCandidato')) $('btnGuardarEstadoCandidato').addEventListener('click', guardarEstadoCandidato);
  $('btnCandMarcarLlamado').addEventListener('click', (e) => marcarCandidatoLlamado(e.currentTarget));
  $('btnCandMarcarFormularioEnviado').addEventListener('click', marcarFormularioEntrevistaEnviado);
  $('btnCandPlantillaCorreo').addEventListener('click', rellenarPlantillaCorreoCandidato);
  $('btnCandEnviarCorreo').addEventListener('click', enviarCorreoGenericoCandidato);
  // César (03/11/2026, cuarta vuelta): cambiar el tipo refresca la plantilla al momento — no hace
  // falta acordarse de pulsar "Rellenar plantilla" aparte después de elegir el tipo.
  if ($('candCorreoTipo')) $('candCorreoTipo').addEventListener('change', rellenarPlantillaCorreoCandidato);
  $('btnDescargarFormularioCandidato').addEventListener('click', descargarFormularioCandidatoExcel);
  $('btnDescargarEntrevistaEstructurada').addEventListener('click', descargarEntrevistaEstructuradaExcel);
  $('btnCargarFormularioCandidato').addEventListener('click', () => $('candExcelFormularioInput').click());
  $('candExcelFormularioInput').addEventListener('change', (e) => onCandExcelFormularioChange(e.target));
  $('btnCargarEntrevistaCandidato').addEventListener('click', () => $('candExcelEntrevistaInput').click());
  $('candExcelEntrevistaInput').addEventListener('change', (e) => onCandExcelEntrevistaChange(e.target));
  $('btnCargarEntrevistaTop').addEventListener('click', () => $('candExcelEntrevistaTopInput').click());
  $('candExcelEntrevistaTopInput').addEventListener('change', (e) => onCandExcelEntrevistaTopChange(e.target));
  $('btnCerrarResultadoEntrevistaTop').addEventListener('click', cerrarResultadoEntrevistaTopModal);
  $('formResultadoEntrevistaTop').addEventListener('submit', guardarResultadoEntrevistaTop);
  $('candUmbralAdaptacion').addEventListener('change', (e) => actualizarUmbralAdaptacionCandidato(e.target.value));
  $('btnGenerarQrCandidatura').addEventListener('click', abrirQrCandidaturaModal);
  $('btnCerrarQrCandidatura').addEventListener('click', cerrarQrCandidaturaModal);
  $('btnCopiarEnlaceCandidatura').addEventListener('click', copiarEnlaceCandidatura);
  $('btnImprimirQrCandidatura').addEventListener('click', imprimirQrCandidatura);
  $('btnBuscarCandidatoEmail').addEventListener('click', buscarCandidatoPorEmailAdmin);
  $('candBuscarEmailInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      buscarCandidatoPorEmailAdmin();
    }
  });

  $('formComunicadoAdmin').addEventListener('submit', publicarComunicadoAdmin);

  // Restaura sesión si ya había una activa (p.ej. al recargar la página)
  sb.auth.getSession().then(async ({ data }) => {
    if (data && data.session) {
      const { data: usr } = await sb.from('usuarios').select('*').eq('id', data.session.user.id).maybeSingle();
      if (usr) {
        usuarioActual = usr;
        const { data: hotel } = await sb.from('hoteles').select('*').eq('id', usr.hotel_id).maybeSingle();
        hotelActual = hotel;
        $('sbHotelNombre').textContent = hotel ? hotel.nombre : '—';
        $('sbNombre').textContent = usr.nombre;
        $('sbRol').textContent = usr.rol === 'rrhh_direccion' ? 'RR.HH. / Dirección' : 'Jefe de Departamento';
        $('sbAvatar').textContent = iniciales(usr.nombre);
        $('viewLogin').classList.add('hidden');
        $('viewApp').classList.add('active');
        await cargarTodo();
        iniciarVigilanciaSesion();
      }
    }
  });
});

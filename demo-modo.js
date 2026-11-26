/* Personal4Pax — Modalidad demo (migración 0116, función demo-acceso).
 * Mismo archivo en el panel de Administración y en la app de la persona trabajadora.
 * Se configura con atributos en la etiqueta <script>:
 *   data-form, data-email, data-password  → ids del formulario de acceso de cada app
 *   data-app="admin" | "trabajador"
 * Qué hace: si la URL trae #demo=<token>, canjea el enlace (un solo uso), entra con las
 * credenciales de un solo uso que devuelve el servidor, muestra la cuenta atrás y, al terminar,
 * cierra la sesión. No toca el resto de la aplicación. */
(function () {
  var cfg = document.currentScript.dataset;
  var FN = 'https://uybljgcimvnfbgumucwo.supabase.co/functions/v1/demo-acceso';
  var ANON = 'sb_publishable_ndBnIFRxI4TB5YYJiBxdXQ_o_qVnb-i';
  var CLAVE_EXPIRA = 'p4p_demo_expira';
  var CONTACTO = 'comercial@personal4pax.com';

  function llamar(cuerpo, jwt) {
    return fetch(FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + (jwt || ANON) },
      body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Error'); return d; }); });
  }

  function limpiarSesionLocal() {
    try {
      Object.keys(localStorage).forEach(function (k) { if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k); });
      sessionStorage.removeItem(CLAVE_EXPIRA);
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function aviso(titulo, texto) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(15,27,36,.88);display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;';
    el.innerHTML = '<div style="background:#fff;border-radius:14px;max-width:420px;padding:24px;text-align:center;">' +
      '<p style="font-size:18px;font-weight:800;margin:0 0 8px;color:#0f1b24;">' + titulo + '</p>' +
      '<p style="margin:0 0 14px;color:#475569;font-size:14px;line-height:1.5;">' + texto + '</p>' +
      '<a href="mailto:' + CONTACTO + '" style="display:inline-block;background:#157A37;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700;">' + CONTACTO + '</a></div>';
    document.body.appendChild(el);
  }

  function terminar() {
    limpiarSesionLocal();
    location.replace(location.pathname + location.search + '#demo-fin');
    location.reload();
  }

  function cuentaAtras(expiraIso) {
    var fin = new Date(expiraIso).getTime();
    var barra = document.createElement('div');
    barra.id = 'p4pDemoBarra';
    barra.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:99999;background:#0f1b24;color:#fff;border-radius:999px;padding:8px 16px;font-size:13px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25);font-family:inherit;';
    document.body.appendChild(barra);
    function pintar() {
      var s = Math.max(0, Math.round((fin - Date.now()) / 1000));
      barra.textContent = 'Modo demostración · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (s <= 0) { clearInterval(t); terminar(); }
    }
    var t = setInterval(pintar, 1000);
    pintar();
    window.__p4pDemoActiva = true;
  }

  function entrar(cred) {
    var form = document.getElementById(cfg.form);
    if (!form) return;
    document.getElementById(cfg.email).value = cred.email;
    document.getElementById(cfg.password).value = cred.password;
    if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  // Panel de Administración: abrir la app de una persona creada durante la demo.
  window.abrirAppTrabajadorDemo = function (trabajadorId, btn) {
    var jwt = null;
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (/^sb-.*-auth-token/.test(k)) { var v = JSON.parse(localStorage.getItem(k)); jwt = v && (v.access_token || (v.currentSession && v.currentSession.access_token)); }
      });
    } catch (e) { /* sin sesión */ }
    if (btn) btn.disabled = true;
    llamar({ accion: 'acceso-trabajador', trabajador_id: trabajadorId }, jwt)
      .then(function (d) { window.open(d.enlace_trabajador, '_blank', 'noopener'); })
      .catch(function (e) { alert(e.message); })
      .finally(function () { if (btn) btn.disabled = false; });
  };

  function iniciar() {
    var hash = location.hash || '';
    if (hash === '#demo-fin') {
      history.replaceState(null, '', location.pathname + location.search);
      aviso('La demostración ha terminado', 'Gracias por probar Personal4Pax. Si quiere verlo con más calma o con los datos de su empresa, escríbanos.');
      return;
    }
    var m = hash.match(/^#demo=([A-Za-z0-9_-]{20,})$/);
    if (m) {
      history.replaceState(null, '', location.pathname + location.search); // el token no queda en el historial
      limpiarSesionLocal();
      llamar({ accion: 'canjear', token: m[1] })
        .then(function (cred) {
          try { sessionStorage.setItem(CLAVE_EXPIRA, cred.expira_en); } catch (e) { /* sin almacenamiento */ }
          entrar(cred);
          cuentaAtras(cred.expira_en);
        })
        .catch(function (e) { aviso('Enlace no disponible', e.message); });
      return;
    }
    var expira = null;
    try { expira = sessionStorage.getItem(CLAVE_EXPIRA); } catch (e) { /* sin almacenamiento */ }
    if (expira) {
      if (new Date(expira).getTime() <= Date.now()) terminar();
      else cuentaAtras(expira);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();

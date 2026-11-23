"use strict";
/* App móvil de TeleRehab IA (PWA). Sin dependencias: HTML + CSS + JS.
   La cámara se usa en el móvil y el análisis lo hace el servidor Python con los mismos
   módulos de ejercicio que la app de escritorio. */

// ─── Estado y utilidades ──────────────────────────────────────────────────────
const S = { token: null, usuario: null, ejercicios: null };
const app = document.getElementById("app");

const NOMBRES = { Propiocepcion: "Propiocepción", Bulgaras: "Búlgaras" };
const NIVELES = [["principiante", "Principiante"], ["intermedio", "Intermedio"], ["avanzado", "Avanzado"]];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const nombreVisible = (n) => NOMBRES[n] || n;
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fechaCorta = (iso) => { const [a, m, d] = iso.slice(0, 10).split("-"); return `${+d} ${MESES[+m - 1]} ${a}`; };
const esPorTiempo = (ej) => ej === "Plancha" || ej === "Propiocepcion";
const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// Zona del cuerpo de cada ejercicio (filtro de la biblioteca del fisio)
const ZONAS = [["todos", "Todos"], ["pierna", "Rodilla y cadera"], ["hombro", "Hombro"], ["tronco", "Tronco"], ["equilibrio", "Equilibrio"]];
const ZONA_EJ = {
  Sentadilla: "pierna", "Peso Muerto": "pierna", "Hip Thrust": "pierna", Zancadas: "pierna", Bulgaras: "pierna",
  "Press Militar": "hombro", "Press Banca": "hombro", "Hombros Laterales": "hombro", Plancha: "tronco", Propiocepcion: "equilibrio",
};
// Plantillas de plan por patología: [ejercicio, nivel, series al día, días por semana]. Son un punto de partida.
const PLANTILLAS = [
  { nombre: "Prótesis de rodilla · semanas 1-4", desc: "Fuerza suave de cuádriceps y glúteo, y equilibrio",
    plan: [["Sentadilla", "principiante", 2, 5], ["Propiocepcion", "principiante", 2, 5], ["Hip Thrust", "principiante", 2, 3]] },
  { nombre: "Prótesis de rodilla · semanas 5-8", desc: "Más carga y trabajo unilateral",
    plan: [["Sentadilla", "intermedio", 3, 4], ["Zancadas", "principiante", 2, 3], ["Propiocepcion", "intermedio", 2, 5], ["Hip Thrust", "intermedio", 3, 3]] },
  { nombre: "Hombro · manguito rotador", desc: "Elevaciones controladas y estabilidad escapular",
    plan: [["Hombros Laterales", "principiante", 3, 5], ["Press Militar", "principiante", 2, 3], ["Plancha", "principiante", 2, 3]] },
  { nombre: "Lumbalgia · core y cadena posterior", desc: "Estabilidad del tronco y glúteo",
    plan: [["Plancha", "principiante", 3, 5], ["Hip Thrust", "principiante", 3, 4], ["Peso Muerto", "principiante", 2, 3]] },
  { nombre: "Ligamento cruzado · fase intermedia", desc: "Fuerza unilateral y control de rodilla",
    plan: [["Bulgaras", "principiante", 3, 3], ["Zancadas", "intermedio", 3, 3], ["Propiocepcion", "intermedio", 3, 5], ["Sentadilla", "intermedio", 3, 3]] },
  { nombre: "Esguince de tobillo", desc: "Propiocepción y carga progresiva",
    plan: [["Propiocepcion", "principiante", 3, 6], ["Sentadilla", "principiante", 2, 3]] },
];

// Icono de línea del sprite de index.html
const ic = (nombre, clase = "") => `<svg class="ic ${clase}" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
// Miniatura del ejercicio (fotograma del vídeo explicativo), con sello de "hecho"
function miniatura(nombreEj, hecho = false) {
  const ej = (S.ejercicios || []).find((e) => e.nombre === nombreEj);
  return `<span class="miniatura">${ej && ej.portada ? `<img src="${ej.portada}" alt="" loading="lazy">` : ic("actividad")}
    ${hecho ? `<span class="sello-ok">${ic("check")}</span>` : ""}</span>`;
}
// Avatar con la inicial y un color estable por nombre
const COLORES_AV = ["#0E8A7E", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#0891B2", "#4D7C0F", "#9333EA"];
function avatar(nombre) {
  let h = 0; for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `<span class="av" style="background:${COLORES_AV[h % COLORES_AV.length]}">${esc(nombre.slice(0, 1).toUpperCase())}</span>`;
}
const vacioHtml = (icono, texto) => `<div class="vacio"><span class="ic-vacio">${ic(icono, "gr")}</span>${texto}</div>`;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const hoyLargo = () => { const d = new Date(); return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES_L[d.getMonth()]}`; };

function guardar(clave, valor) { try { valor == null ? localStorage.removeItem(clave) : localStorage.setItem(clave, JSON.stringify(valor)); } catch (_) { } }
function leer(clave) { try { return JSON.parse(localStorage.getItem(clave)); } catch (_) { return null; } }

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, {
    ...opciones,
    headers: { "Content-Type": "application/json", ...(S.token ? { Authorization: "Bearer " + S.token } : {}) },
  });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token) { cerrarSesion(); throw new Error(datos.detalle || "Sesión caducada"); }
  if (!r.ok) throw new Error(datos.detalle || "Error de conexión");
  return datos;
}

function aviso(texto) {
  const el = document.getElementById("aviso");
  el.textContent = texto; el.hidden = false;
  clearTimeout(aviso.t); aviso.t = setTimeout(() => (el.hidden = true), 2600);
}

function hablar(texto) {
  try {
    const u = new SpeechSynthesisUtterance(texto); u.lang = "es-ES";
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (_) { }
}

// ─── Navegación (con soporte del botón "atrás" del móvil) ─────────────────────
const pila = [];
function ir(vista, { reemplazar = false } = {}) {
  if (reemplazar) pila.pop(); else history.pushState({ n: pila.length + 1 }, "");
  pila.push(vista);
  cerrarHoja(); window.scrollTo(0, 0);
  vista();
}
function volver() { history.back(); }
window.addEventListener("popstate", () => {
  if (limpiezaDirecto) { limpiezaDirecto(); }
  if (!document.getElementById("hoja").hidden) { cerrarHoja(); history.pushState({}, ""); return; }
  if (pila.length > 1) { pila.pop(); window.scrollTo(0, 0); pila[pila.length - 1](); }
  else history.pushState({}, "");
});
function inicio(vista) { pila.length = 0; pila.push(vista); history.replaceState({ n: 1 }, ""); vista(); }

function cabecera(titulo, { atras = true, derecha = "" } = {}) {
  return `<header class="cabecera">
    ${atras ? `<button class="btn-icono" data-atras aria-label="Volver">${ic("atras")}</button>` : ""}
    ${titulo === null ? `<span class="marca-mini"><img src="/static/icono.svg" alt="">TeleRehab</span>` : `<h1>${esc(titulo)}</h1>`}${derecha}</header>`;
}
function pintar(html, alPintar) {
  app.innerHTML = html;
  app.querySelectorAll(".cabecera").forEach(ponerBotonActualizar);
  app.querySelectorAll("[data-atras]").forEach((b) => (b.onclick = volver));
  alPintar && alPintar();
}

// ─── Tema claro / oscuro ──────────────────────────────────────────────────────
const TEMAS = [["auto", "auto", "Automático"], ["claro", "sol", "Claro"], ["oscuro", "luna", "Oscuro"]];
function aplicarTema(tema) {
  const raiz = document.documentElement;
  if (tema === "claro" || tema === "oscuro") raiz.dataset.tema = tema; else delete raiz.dataset.tema;
  // Color de la barra del sistema (iOS/Android) acorde al tema elegido
  const oscuro = tema === "oscuro" || (tema !== "claro" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => (m.content = oscuro ? "#0B1015" : "#F4F6F9"));
}
function selectorTema() {
  const actual = leer("tema") || "auto";
  return `<h3 class="ajuste-tit">Apariencia</h3>
    <div class="segmentado tema" role="group" aria-label="Apariencia">${TEMAS.map(([id, icono, txt]) =>
    `<button type="button" data-tema="${id}" aria-pressed="${id === actual}">${ic(icono, "mini")} ${txt}</button>`).join("")}</div>`;
}
function activarSelectorTema(raiz) {
  raiz.querySelectorAll("[data-tema]").forEach((b) => (b.onclick = () => {
    guardar("tema", b.dataset.tema === "auto" ? null : b.dataset.tema);
    aplicarTema(b.dataset.tema);
    raiz.querySelectorAll("[data-tema]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));
}
aplicarTema(leer("tema"));
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => aplicarTema(leer("tema")));

// ─── Hoja inferior ────────────────────────────────────────────────────────────
function abrirHoja(html, alPintar) {
  const hoja = document.getElementById("hoja");
  document.getElementById("hoja-contenido").innerHTML = html;
  hoja.hidden = false;
  hoja.querySelectorAll("[data-cerrar]").forEach((b) => (b.onclick = cerrarHoja));
  alPintar && alPintar(hoja);
}
function cerrarHoja() {
  const hoja = document.getElementById("hoja");
  hoja.querySelectorAll("video").forEach((v) => v.pause());
  hoja.hidden = true;
  document.getElementById("hoja-contenido").innerHTML = "";
}

// ─── Login ────────────────────────────────────────────────────────────────────
function pantallaLogin() {
  pintar(`<main class="pantalla login">
    <div class="marca">
      <img src="/static/icono-192.png" alt="">
      <h1>TeleRehab IA</h1>
      <p>Tu rehabilitación en casa, guiada por tu fisioterapeuta y corregida en tiempo real.</p>
    </div>
    <form id="f-login" autocomplete="on" novalidate>
      <div class="campo"><label for="u">Usuario</label>
        <input id="u" name="username" autocomplete="username" autocapitalize="words" placeholder="Tu nombre" required></div>
      <div class="campo"><label for="p">Contraseña</label>
        <input id="p" name="password" type="password" autocomplete="current-password" placeholder="••••••" required></div>
      <p class="error" id="err"></p>
      <button class="btn" type="submit">Entrar</button>
    </form>
    <p class="sello">${ic("escudo", "mini")} Tus datos de salud solo los ve tu fisioterapeuta</p>
  </main>`, () => {
    document.getElementById("f-login").onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button"); btn.disabled = true;
      try {
        const r = await api("/api/login", { method: "POST", body: JSON.stringify({ usuario: document.getElementById("u").value, password: document.getElementById("p").value }) });
        S.token = r.token; S.usuario = r; guardar("sesion", r);
        if (r.rol === "paciente" && !r.consentimiento) inicio(pantallaConsentimiento);
        else entrar();
      } catch (err) { document.getElementById("err").textContent = err.message; btn.disabled = false; }
    };
  });
}

function cerrarSesion() {
  if (S.token) fetch("/api/logout", { method: "POST", headers: { Authorization: "Bearer " + S.token } }).catch(() => { });
  S.token = null; S.usuario = null; guardar("sesion", null);
  S.pacientes = null; S.guiada = null; document.body.classList.remove("modo-fisio");
  inicio(pantallaLogin);
}

function entrar() {
  document.body.classList.toggle("modo-fisio", S.usuario.rol === "fisio");
  if (S.usuario.rol === "fisio") inicio(() => fisioInicio());
  else if (!leer("bienvenida:" + S.usuario.nombre)) inicio(pantallaBienvenida);
  else inicio(() => pacienteInicio("hoy"));
}

// ─── Bienvenida (3 pantallas, solo la primera vez) ────────────────────────────
const PASOS_BIENVENIDA = [
  { icono: "actividad", titulo: "Así funciona", texto: "Tu fisioterapeuta te pauta los ejercicios. Tú los haces en casa delante del móvil y la app te corrige en directo.",
    puntos: [["play-circulo", "Mira el vídeo del ejercicio"], ["camara", "Hazlo delante de la cámara"], ["check-circulo", "La app cuenta y te corrige"]] },
  { icono: "movil", titulo: "Coloca bien el móvil", texto: "Para que la app te vea entero y pueda medir tus ángulos:",
    puntos: [["movil", "Apóyalo de pie a 2-3 metros, a la altura de la cadera"], ["usuario", "Que se te vea de la cabeza a los pies"], ["sol", "Buena luz y ropa ajustada"]] },
  { icono: "escudo", titulo: "Tu privacidad", texto: "Tus datos de salud son tuyos.",
    puntos: [["usuario", "Solo tu fisioterapeuta ve tus vídeos e informes"], ["descargar", "Puedes descargar tus datos cuando quieras"], ["escudo", "Nada se usa para publicidad"]] },
];
function pantallaBienvenida(paso = 0) {
  const p = PASOS_BIENVENIDA[paso], ultimo = paso === PASOS_BIENVENIDA.length - 1;
  const terminar = () => { guardar("bienvenida:" + S.usuario.nombre, true); inicio(() => pacienteInicio("hoy")); };
  pintar(`<main class="pantalla bienvenida">
    <div class="bv-cab">${ultimo ? "" : `<button class="btn-texto" id="bv-saltar">Saltar</button>`}</div>
    <div class="bv-cuerpo">
      <div class="bv-ilustracion">${ic(p.icono)}</div>
      <h2>${p.titulo}</h2><p>${p.texto}</p>
      <ul class="bv-puntos">${p.puntos.map(([i, t]) => `<li><span class="ic-caja">${ic(i, "peq")}</span>${t}</li>`).join("")}</ul>
    </div>
    <div class="bv-pie">
      <div class="bv-puntitos" aria-label="Paso ${paso + 1} de ${PASOS_BIENVENIDA.length}">${PASOS_BIENVENIDA.map((_, i) => `<i class="${i === paso ? "on" : ""}"></i>`).join("")}</div>
      <button class="btn" id="bv-seguir">${ultimo ? "Empezar" : "Siguiente"}</button>
    </div></main>`, () => {
    document.getElementById("bv-seguir").onclick = () => (ultimo ? terminar() : pantallaBienvenida(paso + 1));
    const saltar = document.getElementById("bv-saltar");
    if (saltar) saltar.onclick = terminar;
  });
}

// ─── Consentimiento (RGPD) ────────────────────────────────────────────────────
const TEXTO_PRIVACIDAD = `
  <p>Para corregir tus ejercicios, TeleRehab IA trata estos datos:</p>
  <ul>
    <li><b>Imagen de tu cámara</b> mientras haces una serie. Se analiza la postura y se guarda un vídeo de la serie.</li>
    <li><b>Resultados de cada serie</b>: repeticiones, errores, ángulos e informe.</li>
    <li><b>Tus datos de paciente</b>: nombre, edad y notas de tu fisioterapeuta.</li>
  </ul>
  <p><b>Para qué:</b> solo para tu rehabilitación y para que tu fisioterapeuta siga tu evolución. No se venden ni se usan para publicidad.</p>
  <p><b>Quién los ve:</b> tú y tu fisioterapeuta. Los vídeos solo los ve tu fisioterapeuta.</p>
  <p><b>Tus derechos:</b> desde <i>Mi cuenta</i> puedes descargar tus datos o retirar este consentimiento. Para borrarlos, pídeselo a tu fisioterapeuta.</p>
  <p><a class="enlace" href="/privacidad" target="_blank" rel="noopener">Leer la política de privacidad completa</a></p>`;

async function pantallaConsentimiento() {
  let version;
  try { version = (await api("/api/consentimiento")).version_actual; } catch (e) { return; }
  pintar(`<main class="pantalla">${cabecera("Tu privacidad", { atras: false })}
    <div class="contenido sin-tabs">
      <div class="saludo"><h2>Antes de empezar</h2><p>Tus datos de salud son tuyos. Así es como los cuidamos.</p></div>
      <div class="tarjeta privacidad-txt">${TEXTO_PRIVACIDAD}</div>
      <label class="check"><input type="checkbox" id="acepto">
        <span>He leído la información y doy mi consentimiento para que se traten mis datos de salud con esta finalidad.</span></label>
      <div class="fila-btns">
        <button class="btn" id="aceptar" disabled>Aceptar y continuar</button>
        <button class="btn fantasma" id="no">Ahora no (cerrar sesión)</button>
      </div>
    </div></main>`, () => {
    const check = document.getElementById("acepto"), boton = document.getElementById("aceptar");
    check.onchange = () => (boton.disabled = !check.checked);
    boton.onclick = async () => {
      boton.disabled = true;
      try { await api("/api/consentimiento", { method: "POST", body: JSON.stringify({ version, acepto: true }) }); entrar(); }
      catch (e) { aviso(e.message); boton.disabled = false; }
    };
    document.getElementById("no").onclick = cerrarSesion;
  });
}

function hojaCuentaPaciente() {
  abrirHoja(`<h2>Mi cuenta</h2>
    <div class="lista">
      <button class="item" id="c-pass"><span class="emoji">${ic("llave")}</span><span class="txt"><b>Cambiar contraseña</b></span><span class="flecha">${ic("flecha")}</span></button>
      <button class="item" id="c-priv"><span class="emoji">${ic("escudo")}</span><span class="txt"><b>Privacidad y mis datos</b><small>Descargar, retirar consentimiento</small></span><span class="flecha">${ic("flecha")}</span></button>
    </div>
    ${selectorTema()}
    <div class="fila-btns" style="margin-top:18px"><button class="btn secundario" id="c-salir">${ic("salir", "peq")} Cerrar sesión</button></div>`, (hoja) => {
    activarSelectorTema(hoja);
    hoja.querySelector("#c-salir").onclick = () => { cerrarHoja(); cerrarSesion(); };
    hoja.querySelector("#c-pass").onclick = hojaPasswordPaciente;
    hoja.querySelector("#c-priv").onclick = hojaPrivacidadPaciente;
  });
}

function hojaPasswordPaciente() {
  abrirHoja(`<h2>Cambiar contraseña</h2>
    <form id="f-pass" novalidate>
      <div class="campo"><label for="a-act">Contraseña actual</label><input id="a-act" type="password" autocomplete="current-password"></div>
      <div class="dos-col">
        <div class="campo"><label for="a-n1">Nueva</label><input id="a-n1" type="password" autocomplete="new-password"></div>
        <div class="campo"><label for="a-n2">Repetir</label><input id="a-n2" type="password" autocomplete="new-password"></div>
      </div>
      <p class="error" id="a-err"></p>
      <div class="fila-btns"><button class="btn" type="submit">Guardar</button>
        <button class="btn fantasma" type="button" data-cerrar>Cancelar</button></div>
    </form>`, (hoja) => {
    hoja.querySelector("#f-pass").onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => hoja.querySelector(id).value;
      try {
        await api("/api/mi-password", { method: "POST", body: JSON.stringify({ actual: v("#a-act"), nueva: v("#a-n1"), nueva2: v("#a-n2") }) });
        cerrarHoja(); aviso("Contraseña cambiada");
      } catch (err) { hoja.querySelector("#a-err").textContent = err.message; }
    };
  });
}

async function hojaPrivacidadPaciente() {
  let c = {};
  try { c = await api("/api/consentimiento"); } catch (_) { }
  abrirHoja(`<h2>Privacidad y mis datos</h2>
    <div class="privacidad-txt">${TEXTO_PRIVACIDAD}</div>
    <p class="receta">${c.fecha ? `Consentimiento aceptado el ${fechaCorta(c.fecha)}.` : ""}</p>
    <div class="fila-btns" style="margin-top:12px">
      <button class="btn secundario" id="p-descargar">${ic("descargar", "peq")} Descargar mis datos</button>
    </div>
    <div class="zona-peligro">
      <p>Si retiras el consentimiento no se grabarán más series hasta que lo vuelvas a aceptar. Para borrar todos tus datos, pídeselo a tu fisioterapeuta.</p>
      <button class="btn borde-rojo" id="p-retirar">Retirar consentimiento</button>
    </div>`, (hoja) => {
    hoja.querySelector("#p-descargar").onclick = async () => {
      try {
        const r = await fetch("/api/mis-datos", { headers: { Authorization: "Bearer " + S.token } });
        if (!r.ok) throw new Error("No se han podido descargar los datos");
        const url = URL.createObjectURL(await r.blob());
        const a = Object.assign(document.createElement("a"), { href: url, download: "mis_datos_telerehab.json" });
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) { aviso(e.message); }
    };
    hoja.querySelector("#p-retirar").onclick = async () => {
      if (!confirm("¿Seguro que quieres retirar tu consentimiento?")) return;
      try { await api("/api/consentimiento", { method: "DELETE" }); cerrarHoja(); inicio(pantallaConsentimiento); }
      catch (e) { aviso(e.message); }
    };
  });
}

// ─── Paciente ─────────────────────────────────────────────────────────────────
async function cargarEjercicios() {
  if (!S.ejercicios) S.ejercicios = await api("/api/ejercicios");
  return S.ejercicios;
}

function resumen(historial) {
  const dias = new Set(historial.map((s) => s.fecha.slice(0, 10)));
  const hace7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const reps = historial.reduce((a, s) => a + s.repeticiones, 0);
  const errs = historial.reduce((a, s) => a + Math.min(s.errores, s.repeticiones), 0);
  return {
    series: historial.length,
    dias: dias.size,
    semana: historial.filter((s) => s.fecha.slice(0, 10) >= hace7).length,
    dias30: [...dias].filter((d) => d >= hace30).length,
    correcto: reps ? Math.round((100 * (reps - errs)) / reps) : null,
  };
}

function calcularRacha(historial) {
  // Días seguidos entrenando (hoy o ayer cuentan para no romper la racha por la mañana)
  const diasHechos = new Set(historial.map((s) => s.fecha.slice(0, 10)));
  let racha = 0;
  for (let d = new Date(), i = 0; i < 400; i++, d.setDate(d.getDate() - 1)) {
    if (diasHechos.has(isoLocal(d))) racha++; else if (i > 0) break;
  }
  return racha;
}
function mejorRacha(historial) {
  const dias = [...new Set(historial.map((s) => s.fecha.slice(0, 10)))].sort();
  let mejor = 0, actual = 0, previo = null;
  for (const d of dias) {
    actual = previo && (new Date(d) - new Date(previo)) / 864e5 === 1 ? actual + 1 : 1;
    mejor = Math.max(mejor, actual); previo = d;
  }
  return mejor;
}

/* Semana actual (lunes a domingo) con los días entrenados */
function semanaHtml(historial) {
  const hechos = new Set(historial.map((s) => s.fecha.slice(0, 10)));
  const hoy = new Date(), lunes = new Date(hoy);
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
  const hoyIso = isoLocal(hoy);
  let n = 0;
  const dias = DIAS_CORTOS.map((letra, i) => {
    const d = new Date(lunes); d.setDate(lunes.getDate() + i);
    const iso = isoLocal(d), hecho = hechos.has(iso);
    if (hecho) n++;
    return `<div class="dia-sem ${hecho ? "hecho" : ""} ${iso === hoyIso ? "hoy" : ""} ${iso > hoyIso ? "futuro" : ""}">
      <span>${letra}</span><i>${hecho ? ic("check", "mini") : d.getDate()}</i></div>`;
  }).join("");
  return `<div class="tarjeta semana-tira"><div class="semana-cab"><b>Esta semana</b><small>${n} ${n === 1 ? "día" : "días"} entrenados</small></div>
    <div class="dias-sem">${dias}</div></div>`;
}

/* Logros: medallas por constancia y volumen (se calculan del historial, no se guardan) */
function logros(historial) {
  const series = historial.length, racha = mejorRacha(historial);
  const perfectas = historial.filter((s) => !s.errores && s.repeticiones > 0).length;
  const lista = [
    ["llama", "Primer paso", "Tu primera serie", series >= 1],
    ["llama", "3 días seguidos", "Racha de 3 días", racha >= 3],
    ["llama", "Una semana entera", "Racha de 7 días", racha >= 7],
    ["medalla", "Constancia", "Racha de 14 días", racha >= 14],
    ["check-circulo", "Técnica perfecta", "Una serie sin errores", perfectas >= 1],
    ["diana", "10 series", "10 series hechas", series >= 10],
    ["diana", "50 series", "50 series hechas", series >= 50],
    ["medalla", "100 series", "100 series hechas", series >= 100],
  ];
  const conseguidos = lista.filter((l) => l[3]).length;
  return `<h3 class="seccion-tit">Logros <small>${conseguidos}/${lista.length}</small></h3>
    <div class="logros">${lista.map(([i, t, d, ok]) => `<div class="logro ${ok ? "ok" : ""}" title="${esc(d)}">
      <span class="medalla">${ic(i)}</span><b>${t}</b><small>${ok ? "Conseguido" : d}</small></div>`).join("")}</div>`;
}

function tabs(actual, opciones) {
  return `<nav class="tabs" style="--n:${opciones.length}">${opciones.map(([id, icono, texto]) =>
    `<button data-tab="${id}" ${id === actual ? 'aria-current="page"' : ""}>${ic(icono)}${texto}</button>`).join("")}</nav>`;
}

async function pacienteInicio(tab) {
  S.guiada = null;
  pintar(`<div class="cargando">Cargando…</div>`);
  let lista, historial, plan;
  try { [lista, historial, plan] = await Promise.all([cargarEjercicios(), api("/api/mi-historial"), api("/api/mi-plan")]); }
  catch (e) { return pintar(`<div class="vacio">${esc(e.message)}</div>`); }
  S.plan = plan.plan;

  const r = resumen(historial);
  const cuenta = `<button class="btn-icono avatar" id="cuenta" aria-label="Mi cuenta" title="Mi cuenta">${esc((S.usuario.nombre || "?").slice(0, 1).toUpperCase())}</button>`;
  const pestañas = tabs(tab, [["hoy", "actividad", "Hoy"], ["progreso", "tendencia", "Mi progreso"]]);
  const racha = calcularRacha(historial);

  if (tab === "hoy") {
    const ultima = {};
    historial.forEach((s) => { ultima[s.ejercicio] ||= s.fecha; });
    const enPlan = new Set(plan.plan.map((p) => p.ejercicio));
    const pendientesLista = plan.plan.filter((p) => !p.completado_hoy);
    const pendientes = pendientesLista.length;
    const itemEjercicio = (e) => `
          <button class="item" data-ej="${esc(e.nombre)}">
            ${miniatura(e.nombre)}
            <span class="txt"><b>${esc(nombreVisible(e.nombre))}</b>
              <small>${pautaSerie(e)} · ${ultima[e.nombre] ? "último: " + fechaCorta(ultima[e.nombre]) : "sin hacer aún"}</small></span>
            <span class="flecha">${ic("flecha")}</span>
          </button>`;
    const itemPlan = (p) => {
      const pct = Math.min(100, Math.round((100 * p.hechas_hoy) / p.series));
      return `<button class="item ${p.completado_hoy ? "hecho" : ""}" data-ej="${esc(p.ejercicio)}">
        ${miniatura(p.ejercicio, p.completado_hoy)}
        <span class="txt"><b>${esc(nombreVisible(p.ejercicio))}</b>
          <small>${Math.min(p.hechas_hoy, p.series)} de ${p.series} ${p.series === 1 ? "serie" : "series"} hoy · ${esc(p.nivel)}</small>
          <span class="progreso" aria-hidden="true"><i style="width:${pct}%"></i></span></span>
        <span class="flecha">${ic("flecha")}</span></button>`;
    };
    const seriesHoy = plan.plan.reduce((a, p) => a + Math.min(p.hechas_hoy, p.series), 0);
    const seriesObjetivo = plan.plan.reduce((a, p) => a + p.series, 0);
    const pctHoy = seriesObjetivo ? Math.round((100 * seriesHoy) / seriesObjetivo) : 0;
    // ~1 min por serie de 10 reps o 20-60 s, más el descanso
    const minutos = Math.max(1, Math.round(pendientesLista.reduce((a, p) => a + (p.series - Math.min(p.hechas_hoy, p.series)) * 1.5, 0)));

    const heroe = plan.plan.length ? `
        <section class="heroe">
          <div class="sup">
            <div><small>Sesión de hoy</small>
              <h3>${pendientes ? `${pendientes} ${pendientes === 1 ? "ejercicio pendiente" : "ejercicios pendientes"}` : "¡Plan de hoy completado!"}</h3>
              <p>${pendientes ? `${seriesObjetivo - seriesHoy} series · unos ${minutos} min` : "Buen trabajo. Tu fisioterapeuta ya puede ver tus series."}</p></div>
            <div class="anillo" style="--p:${pctHoy}" aria-label="${pctHoy}% del plan de hoy"><b>${pctHoy}%</b></div>
          </div>
          ${pendientes ? `<button class="btn claro" id="empezar-hoy">${ic("play", "peq")} ${seriesHoy ? "Continuar sesión" : "Empezar sesión de hoy"}</button>`
        : `<div class="hecho">${ic("medalla")} Vuelve mañana para seguir con tu plan</div>`}
        </section>
        <div class="stats">
          <div class="stat"><span class="ic-caja">${ic("diana", "peq")}</span><div><b>${plan.adherencia ?? 0}%</b><span>de tu plan esta semana</span></div></div>
          <div class="stat"><span class="ic-caja ambar">${ic("llama", "peq")}</span><div><b>${racha} ${racha === 1 ? "día" : "días"}</b><span>seguidos entrenando</span></div></div>
        </div>`
      : `<section class="heroe">
          <div class="sup"><div><small>Empieza cuando quieras</small><h3>Elige un ejercicio</h3>
            <p>Mira el vídeo, colócate delante de la cámara y la app te corrige en directo.</p></div></div>
        </section>
        <div class="stats">
          <div class="stat"><span class="ic-caja">${ic("actividad", "peq")}</span><div><b>${r.semana}</b><span>series esta semana</span></div></div>
          <div class="stat"><span class="ic-caja ambar">${ic("llama", "peq")}</span><div><b>${racha} ${racha === 1 ? "día" : "días"}</b><span>seguidos entrenando</span></div></div>
        </div>`;

    const bloqueListas = plan.plan.length ? `
        <h3 class="seccion-tit">Tu plan de hoy <small>${seriesHoy}/${seriesObjetivo} series</small></h3>
        <div class="lista">${plan.plan.map(itemPlan).join("")}</div>
        <h3 class="seccion-tit">Otros ejercicios</h3>
        <div class="lista">${lista.filter((e) => !enPlan.has(e.nombre)).map(itemEjercicio).join("")}</div>`
      : `<h3 class="seccion-tit">Tus ejercicios</h3>
        <div class="lista">${lista.map(itemEjercicio).join("")}</div>`;

    pintar(`<main class="pantalla">${cabecera(null, { atras: false, derecha: cuenta })}
      <div class="contenido">
        <div class="saludo"><p class="fecha">${hoyLargo()}</p><h2>Hola, ${esc(S.usuario.nombre)}</h2></div>
        ${plan.nota ? `<div class="nota-fisio"><span class="ic-caja">${ic("enviar", "peq")}</span><div>
          <small>Mensaje de tu fisioterapeuta · ${fechaCorta(plan.nota.fecha)}</small><p>${esc(plan.nota.texto)}</p></div></div>` : ""}
        ${heroe}
        ${semanaHtml(historial)}
        ${bloqueListas}
      </div>${pestañas}</main>`, () => {
      app.querySelectorAll("[data-ej]").forEach((b) => (b.onclick = () => ir(() => detalleEjercicio(b.dataset.ej))));
      const empezar = document.getElementById("empezar-hoy");
      if (empezar) empezar.onclick = () => empezarSesionGuiada(pendientesLista);
    });
  } else {
    const hechos = lista.filter((e) => historial.some((s) => s.ejercicio === e.nombre));
    pintar(`<main class="pantalla">${cabecera("Mi progreso", { atras: false, derecha: cuenta })}
      <div class="contenido">
        <div class="kpis" style="margin-top:6px">
          <div class="kpi">${ic("actividad", "peq")}<b>${r.series}</b><span>series totales</span></div>
          <div class="kpi">${ic("calendario", "peq")}<b>${r.dias30}</b><span>días (últimos 30)</span></div>
          <div class="kpi">${ic("check-circulo", "peq")}<b>${r.correcto ?? "–"}${r.correcto != null ? "%" : ""}</b><span>ejecución correcta</span></div>
        </div>
        ${hechos.length ? bloqueProgreso(hechos.map((e) => e.nombre), historial)
        : vacioHtml("tendencia", "Cuando completes tu primera serie verás aquí tu evolución.")}
        ${logros(historial)}
      </div>${pestañas}</main>`, () => activarProgreso());
  }
  document.getElementById("cuenta").onclick = hojaCuentaPaciente;
  app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => ir(() => pacienteInicio(b.dataset.tab), { reemplazar: true })));
}

/* Gráfica + lista por días de un ejercicio, con chips para cambiar de ejercicio. */
function bloqueProgreso(nombres, historial) {
  const html = `<h3 class="seccion-tit">Evolución por ejercicio</h3>
    <div class="chips" role="group" aria-label="Ejercicio">${nombres.map((n, i) =>
    `<button class="chip" data-chip="${esc(n)}" aria-pressed="${i === 0}">${esc(nombreVisible(n))}</button>`).join("")}</div>
    <div id="zona-progreso"></div>`;
  bloqueProgreso.ctx = { historial };
  return html;
}

/* Gráfica SVG: total diario (parte correcta y con error) y % de ejecución correcta.
   Se dibuja en el navegador para que siga el tema claro/oscuro y se vea nítida en cualquier pantalla. */
function graficaEvolucion(series, ej) {
  const porDia = {};
  series.forEach((s) => { const d = (porDia[s.fecha.slice(0, 10)] ||= [0, 0]); d[0] += s.repeticiones; d[1] += Math.min(s.errores, s.repeticiones); });
  const dias = Object.keys(porDia).sort().slice(-14);
  const W = 340, H = 190, iz = 30, de = 30, ar = 12, ab = 26;
  const ancho = W - iz - de, alto = H - ar - ab;
  const max = Math.max(1, ...dias.map((d) => porDia[d][0]));
  const paso = ancho / dias.length, barra = Math.min(22, paso * 0.62);
  const y = (v) => ar + alto - (alto * v) / max;
  const yp = (p) => ar + alto - (alto * p) / 100;
  const marcas = [0, Math.round(max / 2), max];
  let svg = marcas.map((m) => `<line class="eje" x1="${iz}" x2="${W - de}" y1="${y(m)}" y2="${y(m)}" ${m ? 'stroke-dasharray="3 4"' : ""}/>
    <text x="${iz - 6}" y="${y(m) + 3}" text-anchor="end">${m}</text>`).join("");
  svg += [0, 50, 100].map((p) => `<text x="${W - de + 6}" y="${yp(p) + 3}">${p}%</text>`).join("");
  const puntos = [];
  dias.forEach((d, i) => {
    const [tot, err] = porDia[d], ok = tot - err, cx = iz + paso * i + paso / 2;
    if (ok) svg += `<rect class="b-ok" x="${cx - barra / 2}" y="${y(tot)}" width="${barra}" height="${y(err) - y(tot)}" rx="3"/>`;
    if (err) svg += `<rect class="b-mal" x="${cx - barra / 2}" y="${y(err)}" width="${barra}" height="${ar + alto - y(err)}" rx="3"/>`;
    if (i % Math.ceil(dias.length / 7) === 0 || i === dias.length - 1)
      svg += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${+d.slice(8, 10)} ${MESES[+d.slice(5, 7) - 1]}</text>`;
    if (tot) puntos.push([cx, yp((100 * ok) / tot)]);  // un día sin repeticiones no es un 0 % de técnica
  });
  if (puntos.length > 1) svg += `<polyline class="linea" points="${puntos.map((p) => p.join(",")).join(" ")}"/>`;
  svg += puntos.map(([cx, cy]) => `<circle class="punto" cx="${cx}" cy="${cy}" r="3.2"/>`).join("");
  return `<div class="tarjeta grafica-svg">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de ${esc(nombreVisible(ej))} en los últimos ${dias.length} días entrenados">${svg}</svg>
    <div class="leyenda"><span><i class="l-ok"></i>Correctas</span><span><i class="l-mal"></i>Con error</span><span><i class="l-pct"></i>% correcto</span>
      <span style="margin-left:auto">${esPorTiempo(ej) ? "segundos" : "repeticiones"} por día</span></div></div>`;
}

function activarProgreso() {
  const chips = app.querySelectorAll("[data-chip]");
  if (!chips.length) return;
  const mostrar = (ej) => {
    chips.forEach((c) => c.setAttribute("aria-pressed", c.dataset.chip === ej));
    const { historial } = bloqueProgreso.ctx;
    const series = historial.filter((s) => s.ejercicio === ej);
    const porDia = {};
    series.forEach((s) => (porDia[s.fecha.slice(0, 10)] ||= []).unshift(s));
    const unidad = (n) => esPorTiempo(ej) ? "s" : (n === 1 ? " rep" : " reps");
    document.getElementById("zona-progreso").innerHTML = `
      ${graficaEvolucion(series, ej)}
      <h3 class="seccion-tit">Historial</h3>
      <div class="lista">${Object.keys(porDia).sort().reverse().slice(0, 30).map((d) => `
        <div class="tarjeta dia"><h3>${fechaCorta(d)} <span class="etiqueta">${porDia[d].length} ${porDia[d].length === 1 ? "serie" : "series"}</span></h3>
          ${porDia[d].map((s, i) => `<div class="serie"><span>Serie ${i + 1} · ${esc(s.nivel)}</span>
            <span class="etiqueta ${s.errores ? "mal" : "ok"}">${s.repeticiones}${unidad(s.repeticiones)} · ${s.errores} ${s.errores === 1 ? "error" : "errores"}</span></div>`).join("")}
        </div>`).join("")}</div>`;
  };
  chips.forEach((c) => (c.onclick = () => mostrar(c.dataset.chip)));
  mostrar(chips[0].dataset.chip);
}

async function detalleEjercicio(nombre, mensajeError) {
  const ej = (await cargarEjercicios()).find((e) => e.nombre === nombre);
  const recetado = (S.plan || []).find((p) => p.ejercicio === nombre);
  // Si el fisio lo ha recetado, se empieza en su nivel; si no, en el último que eligió el paciente
  let nivel = (recetado && recetado.nivel) || leer("nivel:" + nombre) || "principiante";
  pintar(`<main class="pantalla">${cabecera(nombreVisible(nombre))}
    <div class="contenido sin-tabs">
      ${mensajeError ? `<div class="alerta">${ic("alerta")}<span>${esc(mensajeError)}</span></div>` : ""}
      ${recetado ? `<div class="tarjeta receta-fisio"><span class="ic-caja">${ic("plan", "peq")}</span><div><b>Pautado por tu fisioterapeuta</b>
        <p class="receta" style="margin-top:2px">${recetado.series} ${recetado.series === 1 ? "serie" : "series"} al día · ${recetado.dias_semana} ${recetado.dias_semana === 1 ? "día" : "días"} por semana.
        Hoy llevas ${Math.min(recetado.hechas_hoy, recetado.series)} de ${recetado.series}.</p></div></div>` : ""}
      <div class="marco-video">
        ${videoConVoz(ej)}
        <span class="marca-agua">${ic("play-circulo", "mini")} Cómo se hace</span>
      </div>
      <div class="pauta">
        <span>${ic(ej.por_tiempo ? "reloj" : "repeticiones", "mini")} ${pautaSerie(ej, recetado && recetado.nivel)}</span>
        <span>${ic("camara", "mini")} Te corrige en directo</span>
        <span>${ic("alerta", "mini")} Para tras 3 errores</span>
      </div>
      <h3 class="seccion-tit">Antes de empezar</h3>
      <ul class="consejos">${ej.consejos.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      <h3 class="seccion-tit">Nivel</h3>
      <div class="segmentado" role="group" aria-label="Nivel">${NIVELES.map(([id, txt]) =>
    `<button data-nivel="${id}" aria-pressed="${id === nivel}">${txt}</button>`).join("")}</div>
      <div class="pie-fijo"><button class="btn" id="empezar">${ic("play", "peq")} Empezar serie</button></div>
    </div></main>`, () => {
    activarVoz(app, leer("voz-videos") !== false);
    app.querySelectorAll("[data-nivel]").forEach((b) => (b.onclick = () => {
      nivel = b.dataset.nivel; guardar("nivel:" + nombre, nivel);
      app.querySelectorAll("[data-nivel]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    }));
    document.getElementById("empezar").onclick = () => elegirFuente(ej, nivel);
  });
}

function elegirFuente(ej, nivel, { guiada = false } = {}) {
  const hayCamara = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  abrirHoja(`<h2>${guiada ? "¿Cómo quieres hacer la sesión?" : "¿Cómo quieres hacer la serie?"}</h2>
    <div class="lista">
      ${hayCamara ? `
      <button class="item" data-fuente="user"><span class="emoji">${ic("selfie")}</span><span class="txt"><b>Cámara frontal</b><small>Apoya el móvil y ponte delante</small></span><span class="flecha">${ic("flecha")}</span></button>
      <button class="item" data-fuente="environment"><span class="emoji">${ic("camara")}</span><span class="txt"><b>Cámara trasera</b><small>Si otra persona te graba</small></span><span class="flecha">${ic("flecha")}</span></button>`
      : `<div class="alerta">Para usar la cámara abre la app con <b>https</b> o desde este mismo ordenador (localhost).</div>`}
      ${guiada ? "" : `<button class="item" data-fuente="archivo"><span class="emoji">${ic("subir")}</span><span class="txt"><b>Analizar un vídeo</b><small>Un vídeo grabado de tu ejercicio</small></span><span class="flecha">${ic("flecha")}</span></button>`}
      <button class="item" data-fuente="ejemplo"><span class="emoji">${ic("play-circulo")}</span><span class="txt"><b>Probar con el vídeo de ejemplo</b><small>Demostración: analiza el vídeo explicativo</small></span><span class="flecha">${ic("flecha")}</span></button>
    </div>
    <input type="file" id="archivo" accept="video/*" hidden>
    <button class="btn fantasma" data-cerrar style="margin-top:8px">Cancelar</button>`, (hoja) => {
    const input = hoja.querySelector("#archivo");
    input.onchange = () => input.files[0] && ir(() => serieDirecto(ej, nivel, { tipo: "video", url: URL.createObjectURL(input.files[0]) }));
    hoja.querySelectorAll("[data-fuente]").forEach((b) => (b.onclick = () => {
      const f = b.dataset.fuente;
      if (guiada) { S.guiada.fuente = f; return ir(() => pasoGuiado()); }
      if (f === "archivo") return input.click();
      if (f === "ejemplo") return ir(() => serieDirecto(ej, nivel, { tipo: "video", url: ej.video_analisis || ej.video, ejemplo: true }));
      ir(() => serieDirecto(ej, nivel, { tipo: "camara", modo: f }));
    }));
  });
}

// ─── Sesión guiada: encadena todas las series pendientes de hoy ───────────────
const ejDe = (nombre) => S.ejercicios.find((e) => e.nombre === nombre);
function empezarSesionGuiada(pendientes) {
  const cola = [];
  pendientes.forEach((p) => {
    for (let i = Math.min(p.hechas_hoy, p.series); i < p.series; i++) cola.push({ ejercicio: p.ejercicio, nivel: p.nivel, serie: i + 1, de: p.series });
  });
  if (!cola.length) return;
  S.guiada = { cola, i: 0, fuente: null, inicio: Date.now(), hechas: 0 };
  elegirFuente(ejDe(cola[0].ejercicio), cola[0].nivel, { guiada: true });
}
function fuenteGuiada(ej) {
  const f = S.guiada.fuente;
  return f === "ejemplo" ? { tipo: "video", url: ej.video_analisis || ej.video, ejemplo: true } : { tipo: "camara", modo: f };
}
// Lo que hay que hacer en una serie: 10 repeticiones, o los segundos del nivel en plancha y propiocepción
const segundosNivel = (ej, nivel) => (ej.segundos && ej.segundos[nivel]) || null;
/* Vídeo explicativo con la voz que lo narra. Los móviles solo dejan arrancar solo un vídeo si va en silencio,
   así que se intenta con voz (si el paciente no la quitó) y, si el navegador no deja, sale el botón «Activar voz». */
function videoConVoz(ej) {
  return `<video class="video-explicativo" src="${ej.video}${ej.video.includes("?") ? "&" : "?"}v=alvaro" ${ej.portada ? `poster="${ej.portada}"` : ""} controls playsinline muted loop autoplay preload="auto"></video>
    <button type="button" class="btn-voz" data-voz></button>`;
}
function activarVoz(raiz, conVoz) {
  raiz.querySelectorAll("[data-voz]").forEach((b) => {
    const v = b.parentElement.querySelector("video");
    const pintarBoton = () => {
      b.setAttribute("aria-pressed", String(!v.muted));
      b.innerHTML = v.muted ? `${ic("silencio", "mini")}<span>Activar voz</span>` : `${ic("voz", "mini")}<span>Voz</span>`;
      b.classList.toggle("activa", !v.muted);
    };
    b.onclick = () => {
      const activar = v.muted;
      v.muted = !activar;
      guardar("voz-videos", activar);
      if (activar) { v.currentTime = 0; v.play().catch(() => { }); }
      pintarBoton();
    };
    v.addEventListener("volumechange", pintarBoton);
    pintarBoton();
    if (conVoz) {
      v.muted = false;
      v.play().then(pintarBoton).catch(() => { v.muted = true; v.play().catch(() => { }); pintarBoton(); });
    }
  });
}

function pautaSerie(ej, nivel) {
  if (!ej.por_tiempo) return "10 repeticiones";
  if (segundosNivel(ej, nivel)) return `${segundosNivel(ej, nivel)} segundos`;
  const v = Object.values(ej.segundos || {});
  return v.length ? `${Math.min(...v)}–${Math.max(...v)} segundos según el nivel` : "30 segundos";
}
const barraSesion = () => S.guiada
  ? `<div class="progreso-sesion" aria-label="Serie ${S.guiada.i + 1} de ${S.guiada.cola.length}"><i style="width:${Math.round(100 * S.guiada.i / S.guiada.cola.length)}%"></i></div>` : "";
function salirGuiada() { S.guiada = null; inicio(() => pacienteInicio("hoy")); }

/* Pantalla entre series: descanso con cuenta atrás y lo que viene después */
function pasoGuiado({ descanso = 0 } = {}) {
  const g = S.guiada, paso = g.cola[g.i], ej = ejDe(paso.ejercicio);
  let quedan = descanso;
  const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
  pintar(`<main class="pantalla guiada">
    <header class="cabecera"><button class="btn-icono" id="g-salir" aria-label="Salir de la sesión">${ic("cerrar")}</button>
      <h1>Sesión de hoy</h1><span class="etiqueta">${g.i + 1}/${g.cola.length}</span></header>
    ${barraSesion()}
    <div class="contenido sin-tabs">
      ${descanso ? `<div class="descanso"><small>Descanso</small><b id="g-reloj">${mmss(quedan)}</b>
        <span class="progreso"><i id="g-barra" style="width:100%"></i></span></div>` : ""}
      <p class="g-sig">${descanso ? "A continuación" : "Primera serie"}</p>
      <div class="g-tarjeta">
        ${ej.portada ? `<img src="${ej.portada}" alt="">` : ""}
        <div><h2>${esc(nombreVisible(ej.nombre))}</h2><p>Serie ${paso.serie} de ${paso.de} · ${esc(paso.nivel)} · ${pautaSerie(ej, paso.nivel)}</p></div>
      </div>
      <ul class="consejos">${ej.consejos.slice(0, 2).map((c) => `<li>${esc(c)}</li>`).join("")}</ul>
      <div class="pie-fijo"><button class="btn" id="g-empezar">${ic("play", "peq")} ${descanso ? "Saltar descanso" : "Empezar"}</button>
        <button class="btn fantasma" id="g-ver">Ver cómo se hace</button></div>
    </div></main>`, () => {
    const lanzar = () => { clearInterval(t); ir(() => serieDirecto(ej, paso.nivel, fuenteGuiada(ej)), { reemplazar: true }); };
    const t = descanso ? setInterval(() => {
      const reloj = document.getElementById("g-reloj");
      if (!reloj) return clearInterval(t);
      quedan--;
      reloj.textContent = mmss(Math.max(0, quedan));
      document.getElementById("g-barra").style.width = `${100 * Math.max(0, quedan) / descanso}%`;
      if (quedan === 3) hablar(`Siguiente: ${nombreVisible(ej.nombre)}`);
      if (quedan <= 0) lanzar();
    }, 1000) : null;
    document.getElementById("g-empezar").onclick = lanzar;
    document.getElementById("g-salir").onclick = () => { clearInterval(t); salirGuiada(); };
    document.getElementById("g-ver").onclick = () => { clearInterval(t); abrirHoja(`<h2>${esc(nombreVisible(ej.nombre))}</h2>
      <div class="marco-video en-hoja">${videoConVoz(ej)}</div>
      <button class="btn secundario" data-cerrar>Cerrar</button>`, (hoja) => activarVoz(hoja, leer("voz-videos") !== false)); };
  });
}

/* Final de la sesión guiada: resumen y celebración discreta */
async function sesionCompletada() {
  const g = S.guiada; S.guiada = null;
  const minutos = Math.max(1, Math.round((Date.now() - g.inicio) / 6e4));
  let racha = 0;
  try { racha = calcularRacha(await api("/api/mi-historial")); } catch (_) { }
  hablar("¡Sesión completada! Buen trabajo.");
  pintar(`<main class="pantalla resultado celebracion">
    <div class="confeti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
    <div class="grande">${ic("medalla")}</div><h2>¡Sesión completada!</h2>
    <p>Has hecho todo lo de hoy. Tu fisioterapeuta ya puede ver tus series.</p>
    <div class="resumen-serie">
      <div><b>${g.hechas}</b><span>series</span></div>
      <div><b>${minutos}</b><span>minutos</span></div>
      <div><b>${racha}</b><span>${racha === 1 ? "día seguido" : "días seguidos"}</span></div>
    </div>
    <div class="fila-btns"><button class="btn" id="b2">Volver al inicio</button></div></main>`, () => {
    document.getElementById("b2").onclick = () => inicio(() => pacienteInicio("hoy"));
  });
}

// ─── Serie en directo ─────────────────────────────────────────────────────────
let limpiezaDirecto = null;

async function serieDirecto(ej, nivel, fuente) {
  pintar(`<div class="directo">
    <div class="barra-sup">
      <button class="btn-icono" id="cerrar" aria-label="Detener y salir">${ic("cerrar")}</button>
      <h2>${esc(nombreVisible(ej.nombre))} · ${esc(nivel)}</h2>
      <button class="btn-icono" id="voz" aria-label="Voz" aria-pressed="${leer("voz") !== false}" title="Correcciones por voz">${ic("voz")}</button>
      <span class="fallos" id="errores" role="img" aria-label="0 de 3 errores permitidos" title="Errores (a los 3 se para la serie)"><i></i><i></i><i></i></span>
    </div>
    ${barraSesion()}
    <div class="lienzo">
      <video id="entrada" class="oculto" playsinline muted></video>
      <img id="salida" alt="Vista de la cámara con el análisis de tu postura">
      <div class="cuenta-grande" id="cuenta" hidden></div>
      <div class="marcador" id="contador" hidden aria-live="polite">
        <svg viewBox="0 0 100 100" aria-hidden="true"><circle class="pista" cx="50" cy="50" r="44"/><circle class="arco" id="arco" cx="50" cy="50" r="44" pathLength="100"/></svg>
        <div class="cifra"><b id="hechas">0</b><span id="objetivo">/${ej.por_tiempo ? segundosNivel(ej, nivel) || 30 : 10}</span></div>
        <small>${ej.por_tiempo ? "segundos" : "repeticiones"}</small>
      </div>
      ${ej.por_tiempo ? "" : `<div class="recorrido" id="recorrido" hidden aria-hidden="true"><span>Recorrido</span><div class="tubo"><i id="recorrido-nivel"></i></div></div>`}
      <div class="consejo" id="consejo" hidden></div>
      <div class="mensaje" id="mensaje">Preparando la cámara…</div>
    </div>
    <div class="barra-inf">
      <button class="btn peligro" id="detener">${ic("parar", "peq")} Terminar serie</button>
    </div></div>`);

  const video = document.getElementById("entrada");
  const salida = document.getElementById("salida");
  const mensaje = document.getElementById("mensaje");
  const pildora = document.getElementById("errores");
  const cuentaEl = document.getElementById("cuenta"), contadorEl = document.getElementById("contador"), consejoEl = document.getElementById("consejo");
  const botonVoz = document.getElementById("voz");
  let consejoPrevio = "", ultimaVoz = 0, inicioSerie = null, cuentaPrevia = 0, hechasPrevias = 0, erroresPrevios = 0;
  const recorridoEl = document.getElementById("recorrido"), nivelEl = document.getElementById("recorrido-nivel");
  const hechasEl = document.getElementById("hechas"), objetivoEl = document.getElementById("objetivo"), arcoEl = document.getElementById("arco");
  botonVoz.onclick = () => {
    const on = botonVoz.getAttribute("aria-pressed") !== "true";
    botonVoz.setAttribute("aria-pressed", on); guardar("voz", on);
    if (!on) try { speechSynthesis.cancel(); } catch (_) { }
  };
  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext("2d");
  // Hasta 2 fotogramas en vuelo: el móvil prepara el siguiente mientras el servidor analiza el anterior
  const MAX_EN_VUELO = 2;
  let stream = null, ws = null, enVuelo = 0, terminado = false, urlPrevia = null, vivo = true;

  const limpiar = () => {
    vivo = false;
    stream && stream.getTracks().forEach((t) => t.stop());
    video.pause();
    if (ws && ws.readyState === 1 && !terminado) ws.send("stop");
    urlPrevia && URL.revokeObjectURL(urlPrevia);
    limpiezaDirecto = null;
  };
  limpiezaDirecto = limpiar;

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    mensaje.textContent = "Guardando la serie…";
    if (ws && ws.readyState === 1) ws.send("stop");
  };
  document.getElementById("detener").onclick = terminar;
  document.getElementById("cerrar").onclick = terminar;

  try {
    if (fuente.tipo === "camara") {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: fuente.modo, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      video.srcObject = stream;
    } else {
      video.src = fuente.url;
      video.onended = terminar;
    }
    await video.play();
  } catch (e) {
    limpiar();
    mensaje.textContent = fuente.tipo === "camara"
      ? "No se ha podido abrir la cámara. Revisa que la app tenga permiso para usarla."
      : "No se ha podido reproducir el vídeo.";
    document.getElementById("detener").textContent = "Volver";
    document.getElementById("detener").onclick = volver;
    document.getElementById("cerrar").onclick = volver;
    return;
  }
  if (!vivo) return;

  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}/ws/serie?token=${encodeURIComponent(S.token)}&ejercicio=${encodeURIComponent(ej.nombre)}&nivel=${nivel}${fuente.ejemplo ? "&ejemplo=1" : ""}`);
  ws.binaryType = "arraybuffer";

  const enviar = () => {
    if (!vivo || terminado || enVuelo >= MAX_EN_VUELO || !ws || ws.readyState !== 1) return;
    if (!video.videoWidth) { setTimeout(enviar, 100); return; }  // la cámara aún no da imagen
    // 720 px de ancho (como una webcam HD): el marcador que dibuja cada módulo cabe también en vertical
    const escala = Math.min(1, 720 / video.videoWidth);
    lienzo.width = Math.round(video.videoWidth * escala);
    lienzo.height = Math.round(video.videoHeight * escala);
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    // toDataURL es síncrono (~20 ms); toBlob puede retrasarse mucho si el navegador está en segundo plano
    const datos = lienzo.toDataURL("image/jpeg", 0.72);
    const bin = atob(datos.slice(datos.indexOf(",") + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    ws.send(bytes);
    enVuelo++;
    queueMicrotask(enviar);
  };

  // Marcador grande encima del vídeo: cuenta atrás, repeticiones y la corrección del motor (texto y voz)
  function pintarMarcador(d) {
    const prep = d.preparacion || 0;
    cuentaEl.hidden = !prep;
    if (prep) {
      cuentaEl.textContent = prep;
      if (prep !== cuentaPrevia && prep <= 3 && botonVoz.getAttribute("aria-pressed") === "true") hablar(String(prep));
    }
    cuentaPrevia = prep;
    if (!prep && (d.hechas != null || d.contador != null)) {
      contadorEl.hidden = false;
      // Servidor antiguo (sin «hechas»): se enseña su contador tal cual
      const hechas = d.hechas ?? (parseInt(d.contador, 10) || 0), objetivo = d.objetivo || (ej.por_tiempo ? segundosNivel(ej, nivel) || 30 : 10);
      hechasEl.textContent = hechas;
      objetivoEl.textContent = `/${objetivo}`;
      // Anillo: series de repeticiones → repeticiones hechas; por tiempo → tiempo transcurrido
      const pct = d.por_tiempo ? (d.progreso ?? 0) : Math.min(100, (100 * hechas) / objetivo);
      arcoEl.style.strokeDashoffset = 100 - pct;
      if (!d.por_tiempo && hechas > hechasPrevias) {
        // Repetición nueva: salto del marcador, verde si ha salido bien y rojo si ha sumado un error
        const mal = d.errores > erroresPrevios;
        contadorEl.classList.remove("rep-ok", "rep-mal"); void contadorEl.offsetWidth;
        contadorEl.classList.add(mal ? "rep-mal" : "rep-ok");
        try { navigator.vibrate && navigator.vibrate(mal ? [60, 60, 60] : 40); } catch (_) { }
      }
      hechasPrevias = hechas; erroresPrevios = d.errores;
      if (recorridoEl && d.progreso != null) {
        recorridoEl.hidden = false;
        nivelEl.style.height = `${d.progreso}%`;
        recorridoEl.classList.toggle("llega", d.progreso >= 100);
      }
    }
    if (recorridoEl) recorridoEl.classList.toggle("apagado", !d.persona_detectada);
    const consejo = (d.consejo || "").trim();
    consejoEl.hidden = !consejo || !!prep;
    consejoEl.textContent = consejo;
    consejoEl.className = "consejo " + (d.estado_esqueleto || "neutro");
    if (consejo && consejo !== consejoPrevio && !prep && botonVoz.getAttribute("aria-pressed") === "true" && Date.now() - ultimaVoz > 1800) {
      hablar(consejo.replace(/[¡!]/g, "")); ultimaVoz = Date.now();
    }
    if (consejo) consejoPrevio = consejo;
  }

  ws.onopen = () => { mensaje.textContent = ""; inicioSerie = Date.now(); enviar(); };
  ws.onerror = () => { mensaje.textContent = "Se ha perdido la conexión con el servidor."; };
  ws.onmessage = (ev) => {
    if (!vivo) return;
    if (typeof ev.data !== "string") {
      const url = URL.createObjectURL(new Blob([ev.data], { type: "image/jpeg" }));
      salida.src = url; urlPrevia && URL.revokeObjectURL(urlPrevia); urlPrevia = url;
      return;
    }
    const d = JSON.parse(ev.data);
    if (d.estado === "guardado") {
      limpiar();
      const duracion = inicioSerie ? Math.round((Date.now() - inicioSerie) / 1000) : null;
      return ir(() => resultadoSerie(ej, nivel, d.resultado, { duracion }), { reemplazar: true });
    }
    if (d.estado === "error") {
      terminado = true; limpiar(); mensaje.textContent = d.mensaje;
      const b = document.getElementById("detener");
      b.textContent = "Volver"; b.onclick = volver; document.getElementById("cerrar").onclick = volver;
      return;
    }
    pildora.querySelectorAll("i").forEach((p, i) => p.classList.toggle("on", i < d.errores));
    pildora.setAttribute("aria-label", `${d.errores} de 3 errores permitidos`);
    pintarMarcador(d);
    if (d.estado === "completado" || d.estado === "cortafuegos") {
      terminado = true; mensaje.textContent = "Guardando la serie…"; return;
    }
    if (!terminado) mensaje.textContent = d.persona_detectada || d.preparacion ? "" : "No te veo bien. Colócate como indican los consejos.";
    enVuelo = Math.max(0, enVuelo - 1);
    queueMicrotask(enviar);
  };
}

const CARAS_DOLOR = [[0, "😀", "Sin dolor"], [1, "🙂", "Leve"], [4, "😐", "Moderado"], [7, "😣", "Fuerte"], [9, "😫", "Muy fuerte"]];
const caraDolor = (n) => CARAS_DOLOR.filter((c) => n >= c[0]).pop();
function cuandoFue(fecha) {
  const dias = Math.round((new Date(new Date().toISOString().slice(0, 10)) - new Date(fecha.slice(0, 10))) / 864e5);
  if (dias <= 0) return "en la serie anterior";
  if (dias === 1) return "ayer";
  if (dias < 7) return "el " + DIAS[new Date(fecha.slice(0, 10) + "T12:00").getDay()];
  return "el " + fechaCorta(fecha).replace(/ \d{4}$/, "");
}

function resultadoSerie(ej, nivel, resultado, { duracion = null } = {}) {
  const textos = {
    completado: ["check-circulo", "", "¡Serie completada!", "Muy bien hecho. Tu fisioterapeuta ya puede ver el informe y el vídeo de la serie."],
    cortafuegos: ["alerta", "ambar", "Paramos para cuidarte", "Vuelve a ver el vídeo explicativo para mejorar la técnica en el ejercicio."],
    detenido: ["guardar", "azul", "Serie guardada", "Has terminado la serie antes de tiempo. La hemos guardado igualmente."],
  };
  const [icono, tono, titulo, texto] = textos[resultado] || textos.detenido;
  const g = S.guiada;
  if (g) g.hechas++;
  const siguiente = g && g.cola[g.i + 1];
  hablar(titulo);
  const unidad = ej.por_tiempo ? "s" : "";
  let botones;
  if (g) {
    botones = `<button class="btn" id="b1">${siguiente ? `${ic("play", "peq")} Siguiente: ${esc(nombreVisible(siguiente.ejercicio))}` : `${ic("medalla", "peq")} Terminar sesión`}</button>
      ${resultado === "cortafuegos" ? `<button class="btn secundario" id="b3">${ic("play-circulo", "peq")} Ver vídeo explicativo</button>` : ""}
      <button class="btn fantasma" id="b2">Salir de la sesión</button>`;
  } else {
    botones = `${resultado === "cortafuegos"
      ? `<button class="btn" id="b1">${ic("play-circulo", "peq")} Ver vídeo explicativo</button>`
      : `<button class="btn" id="b1">${ic("repetir", "peq")} Hacer otra serie</button>`}
      <button class="btn secundario" id="b2">Volver a mi plan</button>`;
  }
  pintar(`<main class="pantalla resultado">
    ${barraSesion()}
    <div class="grande ${tono}">${ic(icono)}</div><h2>${titulo}</h2><p id="r-texto">${texto}</p>
    <div class="resumen-serie" id="r-resumen">
      <div><b id="r-reps">–</b><span>${ej.por_tiempo ? "segundos" : "repeticiones"}</span></div>
      <div><b id="r-err">–</b><span>errores</span></div>
      <div><b>${duracion != null ? `${Math.floor(duracion / 60)}:${String(duracion % 60).padStart(2, "0")}` : "–"}</b><span>duración</span></div>
    </div>
    <p class="comparacion" id="r-comp" hidden></p>
    <section class="tarjeta valoracion" aria-label="Cómo te has sentido">
      <h3>¿Has notado dolor?</h3>
      <div class="cara-dolor" id="v-cara" aria-live="polite"><span>👆</span><small>Toca un número</small></div>
      <div class="escala-dolor" role="group" aria-label="Dolor de 0 a 10">${Array.from({ length: 11 }, (_, n) =>
    `<button type="button" data-dolor="${n}" style="--n:${n}" aria-pressed="false">${n}</button>`).join("")}</div>
      <div class="escala-pie"><span>Nada</span><span>Máximo</span></div>
      <h3>¿Cómo te ha resultado?</h3>
      <div class="segmentado" role="group" aria-label="Esfuerzo">
        <button type="button" data-esfuerzo="1" aria-pressed="false">Fácil</button>
        <button type="button" data-esfuerzo="2" aria-pressed="false">Bien</button>
        <button type="button" data-esfuerzo="3" aria-pressed="false">Difícil</button></div>
    </section>
    <div class="fila-btns">${botones}</div></main>`, () => {
    const val = { dolor: null, esfuerzo: null };
    let enviada = false;
    const enviarValoracion = async () => {
      if (enviada || (val.dolor == null && val.esfuerzo == null)) return;
      enviada = true;
      try {
        await api("/api/valoracion", { method: "POST", body: JSON.stringify({ dolor: val.dolor ?? 0, esfuerzo: val.esfuerzo ?? 2 }) });
        if (val.dolor >= 7) aviso("Gracias. Avisaremos a tu fisioterapeuta del dolor.");
      } catch (_) { }
    };
    app.querySelectorAll("[data-dolor]").forEach((b) => (b.onclick = () => {
      val.dolor = +b.dataset.dolor;
      app.querySelectorAll("[data-dolor]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      const [, cara, txt] = caraDolor(val.dolor);
      document.getElementById("v-cara").innerHTML = `<span>${cara}</span><small>${val.dolor}/10 · ${txt}</small>`;
    }));
    app.querySelectorAll("[data-esfuerzo]").forEach((b) => (b.onclick = () => {
      val.esfuerzo = +b.dataset.esfuerzo;
      app.querySelectorAll("[data-esfuerzo]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    }));
    const salir = async (accion) => { await enviarValoracion(); accion(); };
    if (g) {
      document.getElementById("b1").onclick = () => salir(() => {
        g.i++;
        if (g.i < g.cola.length) ir(() => pasoGuiado({ descanso: 30 }), { reemplazar: true });
        else ir(sesionCompletada, { reemplazar: true });
      });
      document.getElementById("b2").onclick = () => salir(salirGuiada);
      const b3 = document.getElementById("b3");
      if (b3) b3.onclick = () => salir(() => { S.guiada = null; ir(() => detalleEjercicio(ej.nombre, texto), { reemplazar: true }); });
    } else {
      document.getElementById("b1").onclick = () => salir(() => resultado === "cortafuegos"
        ? ir(() => detalleEjercicio(ej.nombre, texto), { reemplazar: true })
        : ir(() => detalleEjercicio(ej.nombre), { reemplazar: true }));
      document.getElementById("b2").onclick = () => salir(() => inicio(() => pacienteInicio("hoy")));
    }
    // Lo que ha medido el motor en esta serie y la comparación con la anterior del mismo ejercicio
    api("/api/mi-historial").then((h) => {
      const actual = h[0];
      if (!actual || actual.ejercicio !== ej.nombre || !document.getElementById("r-reps")) return;
      document.getElementById("r-reps").textContent = actual.repeticiones;
      document.getElementById("r-err").textContent = actual.errores;
      const previa = h.slice(1).find((s) => s.ejercicio === ej.nombre);
      if (!previa) return;
      const dif = actual.repeticiones - previa.repeticiones, difErr = previa.errores - actual.errores;
      const cuando = cuandoFue(previa.fecha);
      const comp = document.getElementById("r-comp");
      const u = (n) => ej.por_tiempo ? `${n} s` : `${n} ${n === 1 ? "rep" : "reps"}`;
      if (dif > 0) { comp.textContent = `+${u(dif)} que ${cuando}`; comp.className = "comparacion sube"; }
      else if (dif === 0 && difErr > 0) { comp.textContent = `${difErr} ${difErr === 1 ? "error" : "errores"} menos que ${cuando}`; comp.className = "comparacion sube"; }
      else if (dif === 0) { comp.textContent = `Igual que ${cuando}`; comp.className = "comparacion"; }
      else { comp.textContent = `${u(-dif)} menos que ${cuando}. Hay días mejores y peores: lo importante es la constancia.`; comp.className = "comparacion"; }
      comp.hidden = false;
    }).catch(() => { });
    if (g) return;
    // Progreso del plan de hoy en este ejercicio (si el fisio lo ha recetado) y celebración si ya está todo
    api("/api/mi-plan").then((p) => {
      S.plan = p.plan;
      const item = p.plan.find((x) => x.ejercicio === ej.nombre);
      if (!item) return;
      const linea = document.createElement("p");
      linea.className = "receta";
      const todo = p.plan.length && p.plan.every((x) => x.completado_hoy);
      linea.textContent = todo ? "¡Has completado todo el plan de hoy!"
        : item.completado_hoy ? `Has completado las ${item.series} series de hoy de ${nombreVisible(ej.nombre)}.`
          : `Llevas ${item.hechas_hoy} de ${item.series} series de hoy de ${nombreVisible(ej.nombre)}.`;
      document.getElementById("r-texto")?.after(linea);
      if (todo && item.hechas_hoy === item.series) {
        const main = document.querySelector(".resultado");
        main?.classList.add("celebracion");
        main?.insertAdjacentHTML("afterbegin", `<div class="confeti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>`);
      }
    }).catch(() => { });
  });
}

// ─── Fisioterapeuta ───────────────────────────────────────────────────────────
async function fisioInicio() {
  pintar(`<div class="cargando">Cargando…</div>`);
  let pacientes;
  try { pacientes = await api("/api/fisio/pacientes"); } catch (e) { return pintar(`<div class="vacio">${esc(e.message)}</div>`); }
  const ajustes = `<span class="acciones-cab"><button class="btn-icono" id="metricas" aria-label="Resultados del piloto" title="Resultados del piloto">${ic("grafica")}</button>
    <button class="btn-icono" id="ajustes" aria-label="Ajustes" title="Ajustes">${ic("ajustes")}</button></span>`;
  const activos = pacientes.filter((p) => p.ultima && p.ultima.slice(0, 10) >= new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)).length;
  const conPlan = pacientes.filter((p) => p.adherencia != null);
  const adhMedia = conPlan.length ? Math.round(conPlan.reduce((a, p) => a + p.adherencia, 0) / conPlan.length) : null;
  // Pacientes que necesitan que el fisio haga algo (alertas graves o medias), los más urgentes primero
  const urgencia = (p) => (p.alertas.some((a) => a.gravedad === "alta") ? 0 : p.alertas.some((a) => a.gravedad === "media") ? 1 : 2);
  const atencion = pacientes.filter((p) => urgencia(p) < 2).sort((a, b) => urgencia(a) - urgencia(b));
  S.pacientes = pacientes;
  pintar(`<main class="pantalla">${cabecera("Mis pacientes", { atras: false, derecha: ajustes })}
    <div class="contenido sin-tabs tablero">
      <section class="col-resumen">
      ${S.usuario.clinica ? `<p class="clinica">${ic("clinica", "mini")} ${esc(S.usuario.clinica)}</p>` : ""}
      ${atencion.length ? `<h3 class="seccion-tit" style="margin-top:4px">Requieren atención <small>${atencion.length}</small></h3>
      <div class="atencion">${atencion.slice(0, 6).map(tarjetaAtencion).join("")}</div>`
      : `<div class="todo-bien">${ic("check-circulo")}<span><b>Todo en orden</b>Ningún paciente necesita que hagas nada ahora.</span></div>`}
      <div class="kpis" style="margin:16px 0 4px">
        <div class="kpi">${ic("usuarios", "peq")}<b>${pacientes.length}</b><span>pacientes</span></div>
        <div class="kpi">${ic("actividad", "peq")}<b>${activos}</b><span>activos esta semana</span></div>
        <div class="kpi">${ic("diana", "peq")}<b>${adhMedia ?? "–"}${adhMedia != null ? "%" : ""}</b><span>adherencia media al plan</span></div>
      </div>
      </section>
      <section class="col-lista">
      <h3 class="seccion-tit">Todos</h3>
      <div class="buscador-caja">${ic("buscar", "peq")}<input class="buscador" id="buscar" type="search" placeholder="Buscar paciente" aria-label="Buscar paciente"></div>
      <div class="lista" id="lista"></div>
      <div class="pie-fijo"><button class="btn" id="nuevo">${ic("usuario-mas", "peq")} Nuevo paciente</button></div>
      </section>
    </div></main>`, () => {
    const pintarLista = (filtro = "") => {
      const f = filtro.trim().toLowerCase();
      const visibles = pacientes.filter((p) => p.nombre.toLowerCase().includes(f));
      document.getElementById("lista").innerHTML = visibles.length ? visibles.map((p) => `
        <button class="item" data-pac="${p.id}">
          ${avatar(p.nombre)}
          <span class="txt"><b>${esc(p.nombre)}</b>
            <small>${p.edad ? p.edad + " años · " : ""}${p.series} series · ${p.ultima ? "última: " + fechaCorta(p.ultima) : "sin sesiones"}</small></span>
          ${etiquetaAdherencia(p.adherencia)}</button>`).join("")
        : vacioHtml("usuarios", pacientes.length ? "Ningún paciente coincide." : "Aún no tienes pacientes. Da de alta el primero.");
      app.querySelectorAll("#lista [data-pac]").forEach((b) => (b.onclick = () => ir(() => fisioPaciente(+b.dataset.pac, "plan"))));
    };
    pintarLista();
    activarAtencion(app);
    document.getElementById("buscar").oninput = (e) => pintarLista(e.target.value);
    document.getElementById("nuevo").onclick = hojaNuevoPaciente;
    document.getElementById("ajustes").onclick = hojaAjustesFisio;
    document.getElementById("metricas").onclick = () => ir(fisioMetricas);
  });
}

/* Bandeja «Requieren atención»: el motivo y la acción más útil a un toque */
const BAJAR_NIVEL = { avanzado: "intermedio", intermedio: "principiante" };
function tarjetaAtencion(p) {
  const reales = p.alertas.filter((x) => x.gravedad !== "info");
  const a = reales[0];
  const acciones = [];
  if (a.tipo === "sin_sesiones") acciones.push(`<button data-acc="invitar" data-id="${p.id}">${ic("qr", "mini")} Reenviar acceso</button>`);
  if ((a.tipo === "tecnica" || a.tipo === "dolor") && a.ejercicio)
    acciones.push(`<button data-acc="bajar" data-id="${p.id}" data-ej="${esc(a.ejercicio)}">${ic("tendencia", "mini")} Bajar nivel</button>`);
  if (a.tipo === "inactivo" || a.tipo === "adherencia_baja" || a.tipo === "dolor")
    acciones.push(`<button data-acc="nota" data-id="${p.id}">${ic("enviar", "mini")} Mensaje</button>`);
  acciones.push(`<button data-acc="plan" data-id="${p.id}">${ic("plan", "mini")} Ajustar plan</button>`);
  return `<div class="aviso-pac ${a.gravedad} con-acciones">
    <button class="aviso-cab" data-acc="ver" data-id="${p.id}">${avatar(p.nombre)}
      <span class="txt"><b>${esc(p.nombre)}</b><span>${esc(a.texto)}${reales.length > 1 ? ` · y ${reales.length - 1} más` : ""}</span></span>
      <span class="flecha">${ic("flecha")}</span></button>
    <div class="acciones-rapidas">${acciones.join("")}</div></div>`;
}
function activarAtencion(raiz) {
  raiz.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = async () => {
    const id = +b.dataset.id, p = (S.pacientes || []).find((x) => x.id === id) || { nombre: "" };
    const acc = b.dataset.acc;
    if (acc === "ver" || acc === "plan") return ir(() => fisioPaciente(id, "plan"));
    if (acc === "nota") {
      const d = await api(`/api/fisio/pacientes/${id}/historial`).catch(() => ({}));
      return hojaNota(id, p.nombre, d.nota && d.nota.texto, () => aviso(`Mensaje enviado a ${p.nombre}`));
    }
    b.disabled = true;
    try {
      if (acc === "invitar") hojaInvitacion(p.nombre, await api(`/api/fisio/pacientes/${id}/invitacion`, { method: "POST" }));
      if (acc === "bajar") {
        const d = await api(`/api/fisio/pacientes/${id}/historial`);
        const item = d.plan.find((x) => x.ejercicio === b.dataset.ej);
        if (!item) { aviso(`${nombreVisible(b.dataset.ej)} no está en su plan`); return ir(() => fisioPaciente(id, "plan")); }
        const plan = d.plan.map((x) => ({ ejercicio: x.ejercicio, nivel: x.nivel, series: x.series, dias_semana: x.dias_semana }));
        const it = plan.find((x) => x.ejercicio === b.dataset.ej);
        if (BAJAR_NIVEL[it.nivel]) it.nivel = BAJAR_NIVEL[it.nivel]; else it.series = Math.max(1, it.series - 1);
        await api(`/api/fisio/pacientes/${id}/plan`, { method: "PUT", body: JSON.stringify({ plan }) });
        aviso(`${nombreVisible(it.ejercicio)}: ${BAJAR_NIVEL[item.nivel] ? "nivel " + it.nivel : it.series + " series al día"}`);
      }
    } catch (e) { aviso(e.message); }
    b.disabled = false;
  }));
}

/* Mensaje corto del fisio que el paciente ve al abrir la app */
const SUGERENCIAS_NOTA = ["¡Muy bien esta semana! Sigue así.", "Si notas dolor, baja el ritmo y avísame.",
  "Intenta no saltarte días: mejor poco cada día.", "Cuida la técnica antes que la velocidad."];
function hojaNota(id, nombre, actual, alGuardar) {
  abrirHoja(`<h2>Mensaje para ${esc(nombre)}</h2>
    <p class="ayuda" style="margin-top:-6px">Lo verá en su pantalla de inicio al abrir la app.</p>
    <div class="chips" style="margin-bottom:10px">${SUGERENCIAS_NOTA.map((t) => `<button type="button" class="chip" data-sug="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <div class="campo"><textarea id="nota-txt" maxlength="280" rows="4" placeholder="Escribe un mensaje corto">${esc(actual || "")}</textarea>
      <small class="ayuda" id="nota-cuenta"></small></div>
    <div class="fila-btns"><button class="btn" id="nota-guardar">${ic("enviar", "peq")} Guardar mensaje</button>
      ${actual ? `<button class="btn fantasma" id="nota-quitar">Quitar mensaje</button>` : `<button class="btn fantasma" data-cerrar>Cancelar</button>`}</div>`, (hoja) => {
    const txt = hoja.querySelector("#nota-txt"), cuenta = hoja.querySelector("#nota-cuenta");
    const contar = () => (cuenta.textContent = `${txt.value.length}/280`);
    txt.oninput = contar; contar();
    hoja.querySelectorAll("[data-sug]").forEach((c) => (c.onclick = () => { txt.value = c.dataset.sug; contar(); txt.focus(); }));
    const enviar = async (texto) => {
      try {
        const r = await api(`/api/fisio/pacientes/${id}/nota`, { method: "PUT", body: JSON.stringify({ texto }) });
        cerrarHoja(); alGuardar && alGuardar(r.nota);
      } catch (e) { aviso(e.message); }
    };
    hoja.querySelector("#nota-guardar").onclick = () => enviar(txt.value);
    const quitar = hoja.querySelector("#nota-quitar");
    if (quitar) quitar.onclick = () => enviar("");
  });
}

/* Escritorio (pantallas anchas): la lista de pacientes queda a la izquierda de la ficha */
const esEscritorio = () => matchMedia("(min-width: 1000px)").matches;
function conLateral(html, id) {
  if (!esEscritorio() || !S.pacientes) return html;
  return `<div class="escritorio"><aside class="lateral">
      <div class="lateral-cab"><button class="btn-texto" data-lat-inicio>${ic("usuarios", "peq")} Mis pacientes</button></div>
      <div class="lista">${S.pacientes.map((p) => `<button class="item ${p.id === id ? "sel" : ""}" data-lat="${p.id}">${avatar(p.nombre)}
        <span class="txt"><b>${esc(p.nombre)}</b><small>${p.ultima ? "última: " + fechaCorta(p.ultima) : "sin sesiones"}</small></span>
        ${p.alertas.some((a) => a.gravedad === "alta") ? `<span class="punto-alerta" title="Requiere atención"></span>` : etiquetaAdherencia(p.adherencia)}</button>`).join("")}</div>
    </aside><div class="principal">${html}</div></div>`;
}
function activarLateral() {
  app.querySelectorAll("[data-lat]").forEach((b) => (b.onclick = () => ir(() => fisioPaciente(+b.dataset.lat, "plan"), { reemplazar: true })));
  const ini = app.querySelector("[data-lat-inicio]");
  if (ini) ini.onclick = () => inicio(() => fisioInicio());
}
// Al pasar de móvil a escritorio (o al revés) se repinta la vista actual
matchMedia("(min-width: 1000px)").addEventListener?.("change", () => {
  if (S.usuario && S.usuario.rol === "fisio" && pila.length && !document.querySelector(".directo")) pila[pila.length - 1]();
});

function etiquetaAdherencia(adh) {
  if (adh == null) return `<span class="adh" title="Sin plan asignado">sin plan</span>`;
  const clase = adh >= 80 ? "ok" : adh >= 50 ? "media" : "baja";
  return `<span class="adh ${clase}" title="Adherencia al plan (7 días)">${adh}%</span>`;
}

function hojaNuevoPaciente() {
  abrirHoja(`<h2>Nuevo paciente</h2>
    <form id="f-nuevo" novalidate>
      <div class="campo"><label for="n-nombre">Nombre (será su usuario)</label><input id="n-nombre" autocapitalize="words" required></div>
      <div class="campo"><label for="n-edad">Edad</label><input id="n-edad" inputmode="numeric" pattern="[0-9]*"></div>
      <div class="campo"><label for="n-notas">Lesión / notas</label><textarea id="n-notas" placeholder="p. ej. Prótesis de rodilla derecha"></textarea></div>
      <div class="dos-col">
        <div class="campo"><label for="n-p1">Contraseña</label><input id="n-p1" type="password" autocomplete="new-password" placeholder="Opcional"></div>
        <div class="campo"><label for="n-p2">Repetir</label><input id="n-p2" type="password" autocomplete="new-password"></div>
      </div>
      <p class="ayuda">Si la dejas vacía, te daremos un enlace y un QR para que el paciente cree la suya desde su móvil.</p>
      <p class="error" id="n-err"></p>
      <div class="fila-btns"><button class="btn" type="submit">Dar de alta</button>
      <button class="btn fantasma" type="button" data-cerrar>Cancelar</button></div>
    </form>`, (hoja) => {
    hoja.querySelector("#f-nuevo").onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => hoja.querySelector(id).value;
      try {
        const r = await api("/api/fisio/pacientes", {
          method: "POST", body: JSON.stringify({
            nombre: v("#n-nombre"), edad: v("#n-edad"), notas: v("#n-notas"), password: v("#n-p1"), password2: v("#n-p2"),
          }),
        });
        cerrarHoja(); aviso(`${r.nombre} dado de alta. Ahora asígnale su plan.`);
        ir(() => fisioPaciente(r.id, "plan"));
        if (r.invitacion) setTimeout(() => hojaInvitacion(r.nombre, r.invitacion), 400);
      } catch (err) { hoja.querySelector("#n-err").textContent = err.message; }
    };
  });
}

function hojaAjustesFisio() {
  abrirHoja(`<h2>Ajustes</h2>
    ${selectorTema()}
    <h3 class="ajuste-tit">Contraseña</h3>
    <form id="f-pass" novalidate>
      <div class="campo"><label for="a-act">Contraseña actual</label><input id="a-act" type="password" autocomplete="current-password"></div>
      <div class="dos-col">
        <div class="campo"><label for="a-n1">Nueva</label><input id="a-n1" type="password" autocomplete="new-password"></div>
        <div class="campo"><label for="a-n2">Repetir</label><input id="a-n2" type="password" autocomplete="new-password"></div>
      </div>
      <p class="error" id="a-err"></p>
      <div class="fila-btns">
        <button class="btn" type="submit">${ic("llave", "peq")} Cambiar contraseña</button>
        <button class="btn secundario" type="button" id="salir">${ic("salir", "peq")} Cerrar sesión</button>
      </div>
    </form>`, (hoja) => {
    activarSelectorTema(hoja);
    hoja.querySelector("#salir").onclick = () => { cerrarHoja(); cerrarSesion(); };
    hoja.querySelector("#f-pass").onsubmit = async (e) => {
      e.preventDefault();
      const v = (id) => hoja.querySelector(id).value;
      try {
        await api("/api/fisio/password", { method: "POST", body: JSON.stringify({ actual: v("#a-act"), nueva: v("#a-n1"), nueva2: v("#a-n2") }) });
        cerrarHoja(); aviso("Contraseña cambiada");
      } catch (err) { hoja.querySelector("#a-err").textContent = err.message; }
    };
  });
}

async function fisioPaciente(id, tab) {
  pintar(`<div class="cargando">Cargando…</div>`);
  let datos;
  try { datos = await api(`/api/fisio/pacientes/${id}/historial`); } catch (e) { return pintar(`<div class="vacio">${esc(e.message)}</div>`); }
  const { nombre, sesiones } = datos;
  const r = resumen(sesiones);
  const pestañas = tabs(tab, [["plan", "plan", "Plan"], ["progreso", "tendencia", "Progreso"], ["sesiones", "calendario", "Sesiones"]]);
  const vacio = vacioHtml("calendario", `${esc(nombre)} todavía no tiene entrenamientos registrados.`);
  let cuerpo;

  if (tab === "plan") {
    return fisioPlan(id, datos, pestañas);
  } else if (tab === "progreso") {
    const nombresEj = [...new Set(sesiones.map((s) => s.ejercicio))];
    cuerpo = `<div class="kpis" style="margin-top:6px">
        <div class="kpi">${ic("actividad", "peq")}<b>${r.series}</b><span>series</span></div>
        <div class="kpi">${ic("calendario", "peq")}<b>${r.dias30}</b><span>días (últ. 30)</span></div>
        <div class="kpi">${ic("check-circulo", "peq")}<b>${r.correcto ?? "–"}${r.correcto != null ? "%" : ""}</b><span>correcto</span></div>
      </div>
      ${sesiones.length ? bloqueProgreso(nombresEj, sesiones) : vacio}`;
  } else {
    const porDia = {};
    sesiones.forEach((s) => (porDia[s.fecha.slice(0, 10)] ||= []).unshift(s));
    cuerpo = sesiones.length ? `<div class="lista" style="margin-top:6px">${Object.keys(porDia).sort().reverse().map((d) => {
      const porEj = {};
      porDia[d].forEach((s) => (porEj[s.ejercicio] ||= []).push(s));
      return `<div class="tarjeta dia"><h3>${fechaCorta(d)} <span class="etiqueta">${porDia[d].length} ${porDia[d].length === 1 ? "serie" : "series"}</span></h3>
        ${Object.entries(porEj).map(([ej, lista]) => lista.map((s, i) => `
          <div class="serie"><span><b>${esc(nombreVisible(ej))}</b> · serie ${i + 1}<br>
            <small class="etiqueta ${s.errores ? "mal" : "ok"}">${s.repeticiones}${esPorTiempo(ej) ? "s" : (s.repeticiones === 1 ? " rep" : " reps")} · ${s.errores} ${s.errores === 1 ? "error" : "errores"} · ${esc(s.nivel)}</small>
            ${s.dolor != null ? `<small class="etiqueta ${s.dolor >= 7 ? "mal" : ""}">dolor ${s.dolor}/10 · ${["", "fácil", "bien", "difícil"][s.esfuerzo] || ""}</small>` : ""}</span>
            <button data-serie='${esc(JSON.stringify({ fecha: d, ejercicio: ej, idx: i, ts: s.fecha }))}'>${ic("video", "mini")} Informe</button></div>`).join("")).join("")}
      </div>`;
    }).join("")}</div>` : vacio;
  }

  pintar(conLateral(`<main class="pantalla">${cabecera(nombre, { derecha: botonPdf(id) })}<div class="contenido">${cuerpo}</div>${pestañas}</main>`, id), () => {
    activarLateral();
    activarProgreso();
    app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => ir(() => fisioPaciente(id, b.dataset.tab), { reemplazar: true })));
    app.querySelectorAll("[data-serie]").forEach((b) => (b.onclick = () => hojaSerie(id, JSON.parse(b.dataset.serie))));
  });
}

/* Pestaña "Plan" del paciente: adherencia, alertas, editor del plan y protección de datos. */
async function fisioPlan(id, datos, pestañas) {
  const lista = await cargarEjercicios();
  const { nombre, plan, adherencia, alertas, consentimiento } = datos;
  let nota = datos.nota;
  // Estado editable: un registro por ejercicio del catálogo
  const estado = {};
  lista.forEach((e) => (estado[e.nombre] = { activo: false, nivel: "principiante", series: 3, dias_semana: 3 }));
  plan.forEach((p) => (estado[p.ejercicio] = { activo: true, nivel: p.nivel, series: p.series, dias_semana: p.dias_semana }));
  const porEj = Object.fromEntries(plan.map((p) => [p.ejercicio, p]));

  const contador = (ej, campo, txt, max) => `<div class="contador"><span>${txt}</span>
    <span class="ctrl"><button type="button" data-menos="${esc(ej)}|${campo}" aria-label="Menos ${txt}">−</button>
    <output data-valor="${esc(ej)}|${campo}">${estado[ej][campo]}</output>
    <button type="button" data-mas="${esc(ej)}|${campo}|${max}" aria-label="Más ${txt}">+</button></span></div>`;

  const filas = lista.map((e) => {
    const s = estado[e.nombre], p = porEj[e.nombre];
    return `<div class="fila-plan ${s.activo ? "activa" : ""}" data-fila="${esc(e.nombre)}" data-zona="${ZONA_EJ[e.nombre] || "otros"}">
      <div class="cab">${miniatura(e.nombre)}<b>${esc(nombreVisible(e.nombre))}
        ${p ? `<br><small class="receta" style="font-weight:400">${p.hechas_semana}/${p.objetivo_semana} series esta semana</small>` : ""}</b>
        <label class="interruptor"><input type="checkbox" data-activo="${esc(e.nombre)}" ${s.activo ? "checked" : ""} aria-label="Incluir ${esc(nombreVisible(e.nombre))} en el plan"><span></span></label></div>
      <div class="ajustes">
        <div class="segmentado peq" role="group" aria-label="Nivel">${NIVELES.map(([nid, txt]) =>
      `<button type="button" data-niv="${esc(e.nombre)}|${nid}" aria-pressed="${s.nivel === nid}">${txt}</button>`).join("")}</div>
        ${contador(e.nombre, "series", "Series al día", 10)}
        ${contador(e.nombre, "dias_semana", "Días por semana", 7)}
      </div></div>`;
  }).join("");

  const alertasReales = alertas.filter((a) => a.tipo !== "sin_plan");
  const notaHtml = () => `<div class="tarjeta nota-edit">
      <span class="ic-caja">${ic("enviar", "peq")}</span>
      <div><b>Mensaje para ${esc(nombre)}</b><p>${nota ? `«${esc(nota.texto)}» · ${fechaCorta(nota.fecha)}` : "Escríbele algo corto: lo verá al abrir la app."}</p></div>
      <button class="btn secundario" id="nota">${nota ? "Editar" : "Escribir"}</button></div>`;
  pintar(conLateral(`<main class="pantalla">${cabecera(nombre, { derecha: botonPdf(id) })}<div class="contenido">
    ${plan.length ? `<div class="tarjeta semana" style="margin-top:6px">
      <div class="anillo" style="--p:${adherencia ?? 0}"><b>${adherencia ?? 0}%</b></div>
      <div><b>Adherencia al plan</b><p>Series hechas de las recetadas en los últimos 7 días</p></div></div>`
      : `<div class="alerta" style="margin-top:6px">${ic("info")}<span>${esc(nombre)} todavía no tiene plan. Activa los ejercicios que debe hacer y pulsa <b>Guardar plan</b>.</span></div>`}
    ${alertasReales.length ? `<h3 class="seccion-tit">Alertas</h3><div class="atencion">${alertasReales.map((a) =>
        `<div class="aviso-pac ${a.gravedad}"><span class="punto"></span><span class="txt">${esc(a.texto)}</span></div>`).join("")}</div>` : ""}
    <div id="zona-nota">${notaHtml()}</div>
    <h3 class="seccion-tit">Ejercicios recetados <button class="btn-texto" id="plantillas">${ic("plan", "mini")} Usar plantilla</button></h3>
    <div class="chips" role="group" aria-label="Zona del cuerpo">${ZONAS.map(([z, t], i) =>
      `<button class="chip" data-zona-f="${z}" aria-pressed="${i === 0}">${t}</button>`).join("")}</div>
    <div class="lista" id="filas-plan">${filas}</div>
    <div class="pie-fijo" style="bottom:calc(70px + var(--seguro-abajo))"><button class="btn" id="guardar-plan">${ic("guardar", "peq")} Guardar plan</button></div>
    <div class="tarjeta acceso">
      <div><b>${ic("qr", "peq")} Acceso del paciente</b><p>Envíale un enlace o enséñale el QR para que entre desde su móvil y cree su contraseña.</p></div>
      <button class="btn secundario" id="invitar">Invitar</button>
    </div>
    <div class="zona-peligro">
      <h3 class="seccion-tit" style="margin-top:0">Protección de datos</h3>
      <p>${consentimiento ? `Consentimiento ${consentimiento.vigente ? "aceptado" : "de una versión anterior, aceptado"} el ${fechaCorta(consentimiento.fecha)}.` : "El paciente aún no ha aceptado el consentimiento: se le pedirá al entrar en la app."}</p>
      <p>Borrar al paciente elimina para siempre sus sesiones, informes y vídeos (derecho de supresión).</p>
      <button class="btn borde-rojo" id="borrar">${ic("papelera", "peq")} Borrar paciente y todos sus datos</button>
    </div>
  </div>${pestañas}</main>`, id), () => {
    activarLateral();
    const refrescar = (ej) => {
      const fila = app.querySelector(`[data-fila="${CSS.escape(ej)}"]`);
      fila.classList.toggle("activa", estado[ej].activo);
      fila.querySelectorAll("[data-niv]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.niv.split("|")[1] === estado[ej].nivel));
      fila.querySelectorAll("[data-valor]").forEach((o) => (o.textContent = estado[ej][o.dataset.valor.split("|")[1]]));
    };
    app.querySelectorAll("[data-activo]").forEach((c) => (c.onchange = () => { estado[c.dataset.activo].activo = c.checked; refrescar(c.dataset.activo); }));
    app.querySelectorAll("[data-niv]").forEach((b) => (b.onclick = () => { const [ej, n] = b.dataset.niv.split("|"); estado[ej].nivel = n; refrescar(ej); }));
    app.querySelectorAll("[data-menos]").forEach((b) => (b.onclick = () => { const [ej, c] = b.dataset.menos.split("|"); estado[ej][c] = Math.max(1, estado[ej][c] - 1); refrescar(ej); }));
    app.querySelectorAll("[data-mas]").forEach((b) => (b.onclick = () => { const [ej, c, max] = b.dataset.mas.split("|"); estado[ej][c] = Math.min(+max, estado[ej][c] + 1); refrescar(ej); }));
    document.getElementById("guardar-plan").onclick = async (ev) => {
      const items = lista.filter((e) => estado[e.nombre].activo).map((e) => ({ ejercicio: e.nombre, ...estado[e.nombre], activo: undefined }));
      ev.target.disabled = true;
      try {
        await api(`/api/fisio/pacientes/${id}/plan`, { method: "PUT", body: JSON.stringify({ plan: items }) });
        aviso(items.length ? `Plan guardado: ${items.length} ${items.length === 1 ? "ejercicio" : "ejercicios"}` : "Plan vaciado");
        fisioPaciente(id, "plan");
      } catch (e) { aviso(e.message); ev.target.disabled = false; }
    };
    document.getElementById("borrar").onclick = () => hojaBorrarPaciente(id, nombre);
    const activarNota = () => (document.getElementById("nota").onclick = () => hojaNota(id, nombre, nota && nota.texto, (n) => {
      nota = n; document.getElementById("zona-nota").innerHTML = notaHtml(); activarNota();
      aviso(n ? `${nombre} verá tu mensaje al abrir la app` : "Mensaje quitado");
    }));
    activarNota();
    app.querySelectorAll("[data-zona-f]").forEach((c) => (c.onclick = () => {
      const z = c.dataset.zonaF;
      app.querySelectorAll("[data-zona-f]").forEach((x) => x.setAttribute("aria-pressed", x === c));
      app.querySelectorAll("#filas-plan [data-fila]").forEach((f) => (f.hidden = z !== "todos" && f.dataset.zona !== z));
    }));
    document.getElementById("plantillas").onclick = () => abrirHoja(`<h2>Plantillas de plan</h2>
      <p class="ayuda" style="margin-top:-6px">Un punto de partida por patología. Después ajústalo a ${esc(nombre)} y pulsa <b>Guardar plan</b>.</p>
      <div class="lista">${PLANTILLAS.map((t, i) => `<button class="item" data-plantilla="${i}"><span class="emoji">${ic("plan")}</span>
        <span class="txt"><b>${esc(t.nombre)}</b><small>${esc(t.desc)} · ${t.plan.map((x) => nombreVisible(x[0])).join(", ")}</small></span>
        <span class="flecha">${ic("flecha")}</span></button>`).join("")}</div>
      <button class="btn fantasma" data-cerrar style="margin-top:8px">Cancelar</button>`, (hoja) => {
      hoja.querySelectorAll("[data-plantilla]").forEach((b) => (b.onclick = () => {
        const t = PLANTILLAS[+b.dataset.plantilla];
        Object.keys(estado).forEach((ej) => (estado[ej].activo = false));
        t.plan.forEach(([ej, nivel, series, dias]) => estado[ej] && Object.assign(estado[ej], { activo: true, nivel, series, dias_semana: dias }));
        Object.keys(estado).forEach((ej) => {
          app.querySelector(`[data-activo="${CSS.escape(ej)}"]`).checked = estado[ej].activo;
          refrescar(ej);
        });
        app.querySelector('[data-zona-f="todos"]').click();
        cerrarHoja(); aviso(`Plantilla aplicada. Revísala y pulsa «Guardar plan»`);
      }));
    });
    document.getElementById("invitar").onclick = async (ev) => {
      ev.target.disabled = true;
      try { hojaInvitacion(nombre, await api(`/api/fisio/pacientes/${id}/invitacion`, { method: "POST" })); }
      catch (e) { aviso(e.message); }
      ev.target.disabled = false;
    };
    app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => ir(() => fisioPaciente(id, b.dataset.tab), { reemplazar: true })));
  });
}

function hojaBorrarPaciente(id, nombre) {
  abrirHoja(`<h2>Borrar a ${esc(nombre)}</h2>
    <p class="privacidad-txt">Se borrarán <b>para siempre</b> su cuenta, sus sesiones, su plan, sus informes y sus vídeos. No se puede deshacer.</p>
    <form id="f-borrar" novalidate>
      <div class="campo"><label for="b-nombre">Escribe <b>${esc(nombre)}</b> para confirmar</label><input id="b-nombre" autocomplete="off"></div>
      <p class="error" id="b-err"></p>
      <div class="fila-btns"><button class="btn peligro" type="submit">Borrar definitivamente</button>
        <button class="btn fantasma" type="button" data-cerrar>Cancelar</button></div>
    </form>`, (hoja) => {
    hoja.querySelector("#f-borrar").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(`/api/fisio/pacientes/${id}`, { method: "DELETE", body: JSON.stringify({ confirmacion: hoja.querySelector("#b-nombre").value }) });
        cerrarHoja(); aviso(`${nombre} y todos sus datos se han borrado`); inicio(() => fisioInicio());
      } catch (err) { hoja.querySelector("#b-err").textContent = err.message; }
    };
  });
}

async function hojaSerie(id, s) {
  abrirHoja(`<div class="cargando">Buscando informe…</div>`);
  try {
    const q = new URLSearchParams({ paciente_id: id, fecha: s.fecha, ejercicio: s.ejercicio, idx: s.idx, ts: s.ts });
    const r = await api(`/api/fisio/serie?${q}`);
    const urlVideo = r.video ? `/api/fisio/video?ruta=${encodeURIComponent(r.video)}&token=${S.token}` : null;
    abrirHoja(`<h2>${esc(nombreVisible(s.ejercicio))} · serie ${s.idx + 1}</h2>
      ${urlVideo ? `<video class="video-serie" src="${urlVideo}" controls playsinline preload="metadata"></video>`
        : `<div class="alerta">${ic("info")}<span>No hay vídeo disponible para esta serie.</span></div>`}
      <pre class="informe">${esc(r.informe || "No se encontró el informe en texto para esta serie.")}</pre>
      <button class="btn secundario" data-cerrar style="margin-top:14px">Cerrar</button>`);
  } catch (e) { abrirHoja(`<div class="vacio">${esc(e.message)}</div>`); }
}


// ─── Informe PDF ──────────────────────────────────────────────────────────────
function botonPdf(id) {
  return `<a class="btn-icono" href="/api/fisio/pacientes/${id}/informe.pdf?token=${encodeURIComponent(S.token)}"
    target="_blank" rel="noopener" aria-label="Informe PDF" title="Informe PDF">${ic("documento")}</a>`;
}

// ─── Invitación (enlace + QR) ─────────────────────────────────────────────────
function hojaInvitacion(nombre, inv) {
  const enlace = `${location.origin}/#invitacion=${inv.codigo}`;
  const qr = `/api/fisio/qr.svg?token=${encodeURIComponent(S.token)}&texto=${encodeURIComponent(enlace)}`;
  const caduca = fechaCorta(inv.caduca);
  abrirHoja(`<h2>Invitación para ${esc(nombre)}</h2>
    <p class="privacidad-txt">Que escanee el QR con la cámara del móvil, o mándale el enlace. Entrará en la app y creará su propia contraseña.</p>
    <img class="qr" src="${qr}" alt="Código QR de la invitación" width="220" height="220">
    <input class="enlace-inv" id="inv-enlace" value="${esc(enlace)}" readonly aria-label="Enlace de invitación">
    <p class="ayuda">Válida hasta el ${caduca} y para un solo uso. Si generas otra, esta deja de valer.</p>
    <div class="fila-btns">
      <button class="btn" id="inv-compartir">${navigator.share ? ic("compartir", "peq") + " Enviar enlace" : ic("copiar", "peq") + " Copiar enlace"}</button>
      <button class="btn fantasma" data-cerrar>Cerrar</button>
    </div>`, (hoja) => {
    hoja.querySelector("#inv-enlace").onclick = (e) => e.target.select();
    hoja.querySelector("#inv-compartir").onclick = async () => {
      const texto = `Hola ${nombre}, este es tu acceso a TeleRehab para hacer en casa los ejercicios que te he pautado:`;
      if (navigator.share) { try { await navigator.share({ title: "TeleRehab", text: texto, url: enlace }); } catch (_) { } return; }
      try { await navigator.clipboard.writeText(enlace); aviso("Enlace copiado"); }
      catch (_) { hoja.querySelector("#inv-enlace").select(); aviso("Selecciona el enlace y cópialo"); }
    };
  });
}

async function pantallaInvitacion(codigo) {
  pintar(`<div class="cargando">Comprobando invitación…</div>`);
  let inv;
  try { inv = await api(`/api/invitacion/${encodeURIComponent(codigo)}`); }
  catch (e) {
    return pintar(`<main class="pantalla login"><div class="marca"><img src="/static/icono-192.png" alt=""><h1>TeleRehab IA</h1>
      <p>${esc(e.message)}</p></div><button class="btn" id="ir-login">Ir a iniciar sesión</button></main>`,
      () => (document.getElementById("ir-login").onclick = () => inicio(pantallaLogin)));
  }
  pintar(`<main class="pantalla login">
    <div class="marca">
      <img src="/static/icono-192.png" alt="">
      <h1>¡Hola, ${esc(inv.nombre)}!</h1>
      <p>${inv.clinica ? `${esc(inv.clinica)} te ha invitado` : "Tu fisioterapeuta te ha invitado"} a hacer tu rehabilitación en casa con TeleRehab.</p>
    </div>
    <form id="f-inv" novalidate>
      <div class="campo"><label for="i-u">Tu usuario</label>
        <input id="i-u" name="username" autocomplete="username" value="${esc(inv.nombre)}" readonly></div>
      <div class="campo"><label for="i-p1">Elige una contraseña</label>
        <input id="i-p1" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></div>
      <div class="campo"><label for="i-p2">Repítela</label>
        <input id="i-p2" type="password" autocomplete="new-password"></div>
      <p class="error" id="i-err"></p>
      <button class="btn" type="submit">Empezar</button>
    </form>
  </main>`, () => {
    document.getElementById("f-inv").onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button"); btn.disabled = true;
      try {
        const r = await api(`/api/invitacion/${encodeURIComponent(codigo)}`, {
          method: "POST", body: JSON.stringify({ password: document.getElementById("i-p1").value, password2: document.getElementById("i-p2").value }),
        });
        S.token = r.token; S.usuario = r; guardar("sesion", r);
        aviso("Contraseña creada. Guárdala para la próxima vez.");
        if (!r.consentimiento) inicio(pantallaConsentimiento); else entrar();
      } catch (err) { document.getElementById("i-err").textContent = err.message; btn.disabled = false; }
    };
  });
}

// ─── Resultados del piloto ────────────────────────────────────────────────────
async function fisioMetricas() {
  pintar(`<div class="cargando">Calculando resultados…</div>`);
  let d;
  try { d = await api("/api/fisio/metricas"); } catch (e) { return pintar(`<div class="vacio">${esc(e.message)}</div>`); }
  const r = d.resumen;
  const pct = (v) => (v == null ? "–" : v + "%");
  const barra = (v, clase) => `<div class="barra-h ${clase}"><span style="width:${v ?? 0}%"></span><b>${pct(v)}</b></div>`;
  const filas = d.pacientes.map((p) => `<tr>
      <td><b>${esc(p.nombre)}</b><small>${p.semanas ? `${p.semanas} sem · ${String(p.dias_por_semana).replace(".", ",")} días/sem` : "sin uso"}</small></td>
      <td>${p.series}</td><td>${etiquetaAdherencia(p.adherencia)}</td>
      <td>${p.mejora == null ? "–" : `<span class="mejora ${p.mejora > 0 ? "sube" : p.mejora < 0 ? "baja" : ""}">${p.mejora > 0 ? "+" : ""}${p.mejora}</span>`}</td>
    </tr>`).join("");
  pintar(`<main class="pantalla">${cabecera("Resultados del piloto")}
    <div class="contenido sin-tabs">
      ${d.clinica ? `<p class="clinica">${ic("clinica", "mini")} ${esc(d.clinica)}</p>` : ""}
      <div class="kpis" style="margin:6px 0 4px">
        <div class="kpi"><b>${r.pacientes_activos}/${r.pacientes}</b><span>pacientes activos (7 días)</span></div>
        <div class="kpi"><b>${pct(r.adherencia_media)}</b><span>adherencia media al plan</span></div>
        <div class="kpi"><b>${r.dias_por_semana == null ? "–" : String(r.dias_por_semana).replace(".", ",")}</b><span>días de entreno por semana</span></div>
      </div>
      <div class="kpis" style="margin:0 0 4px">
        <div class="kpi"><b>${r.series_totales}</b><span>series analizadas</span></div>
        <div class="kpi"><b>${r.series_7d}</b><span>series esta semana</span></div>
        <div class="kpi"><b>${r.pacientes_comparables ? `${r.pacientes_mejoran}/${r.pacientes_comparables}` : "–"}</b><span>mejoran su técnica</span></div>
      </div>
      <h3 class="seccion-tit">Técnica: ejecución correcta</h3>
      <div class="tarjeta">
        ${r.pacientes_comparables ? `<p class="ayuda" style="margin-top:0">Media de los pacientes con 2 semanas de uso o más (${r.pacientes_comparables}).</p>
        <div class="comparativa"><span>1.ª semana</span>${barra(r.correcto_inicio, "antes")}</div>
        <div class="comparativa"><span>Última semana</span>${barra(r.correcto_final, "despues")}</div>`
        : `<p class="ayuda" style="margin:0">Aparecerá cuando algún paciente lleve 2 semanas usando la app.</p>`}
      </div>
      <h3 class="seccion-tit">Por paciente</h3>
      <div class="tarjeta tabla-wrap"><table class="tabla-met">
        <thead><tr><th>Paciente</th><th>Series</th><th>Adher.</th><th title="Puntos de % correcto entre la 1.ª y la última semana">Técnica</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="4">Sin pacientes</td></tr>`}</tbody></table></div>
      <a class="btn secundario" style="margin-top:14px" href="/api/fisio/metricas.csv?token=${encodeURIComponent(S.token)}" download>${ic("descargar", "peq")} Descargar datos (CSV para Excel)</a>
      <p class="ayuda">Úsalo para el informe del piloto. Contiene datos de salud de tus pacientes: guárdalo en un sitio seguro.</p>
    </div></main>`);
}

// ─── Arranque ─────────────────────────────────────────────────────────────────
const sesion = leer("sesion");
const invitacion = (location.hash.match(/^#invitacion=([\w-]+)/) || [])[1];
if (invitacion) {
  history.replaceState(null, "", location.pathname);  // el código no se queda en la barra ni en el historial
  inicio(() => pantallaInvitacion(invitacion));
} else if (sesion && sesion.token) {
  S.token = sesion.token; S.usuario = sesion;
  // Comprueba que la sesión sigue siendo válida (el servidor puede haberse reiniciado)
  api(sesion.rol === "fisio" ? "/api/fisio/pacientes" : "/api/consentimiento")
    .then((r) => (sesion.rol === "paciente" && !r.aceptado ? inicio(pantallaConsentimiento) : entrar()))
    .catch(() => inicio(pantallaLogin));
} else {
  inicio(pantallaLogin);
}

// ─── Versión nueva disponible ─────────────────────────────────────────────────
// sw.js lleva dentro una huella de la app. Cuando cambia, el navegador instala la versión nueva
// en segundo plano y la deja esperando: avisamos y el usuario la activa con un toque.
let swEsperando = null, actualizando = false;
function hayVersionNueva(sw) {
  swEsperando = sw;
  document.querySelectorAll(".cabecera").forEach(ponerBotonActualizar);
  mostrarAvisoVersion();
}
function botonActualizarHtml() {
  return swEsperando ? `<button class="btn-icono btn-actualizar" data-actualizar aria-label="Actualizar la app" title="Hay una versión nueva">${ic("repetir")}<span class="punto"></span></button>` : "";
}
function ponerBotonActualizar(cab) {
  if (!swEsperando || cab.querySelector("[data-actualizar]")) return;
  const titulo = cab.querySelector(":scope > h1, :scope > .marca-mini");
  titulo ? titulo.insertAdjacentHTML("afterend", botonActualizarHtml()) : cab.insertAdjacentHTML("beforeend", botonActualizarHtml());
  cab.querySelector("[data-actualizar]").onclick = actualizarApp;
}
function mostrarAvisoVersion() {
  if (!swEsperando) return;
  // No interrumpir una serie en marcha: se avisa al terminar
  if (limpiezaDirecto) { setTimeout(mostrarAvisoVersion, 4000); return; }
  let el = document.getElementById("aviso-version");
  if (!el) {
    el = document.createElement("div");
    el.id = "aviso-version"; el.className = "aviso-version"; el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="icono">${ic("repetir")}</span>
    <span class="txt"><b>Hay una versión nueva</b><small>Actualiza para tener las últimas mejoras.</small></span>
    <button class="btn-mini" data-actualizar-ya>Actualizar</button>
    <button class="btn-icono cerrar" aria-label="Ahora no">${ic("cerrar")}</button>`;
  el.hidden = false;
  el.querySelector("[data-actualizar-ya]").onclick = actualizarApp;
  el.querySelector(".cerrar").onclick = () => { el.hidden = true; };
}
function actualizarApp() {
  if (limpiezaDirecto && !confirm("Se va a parar la serie en marcha. ¿Actualizar ahora?")) return;
  actualizando = true;
  const aviso = document.getElementById("aviso-version");
  if (aviso) aviso.querySelector(".txt").innerHTML = "<b>Actualizando…</b>";
  if (swEsperando) swEsperando.postMessage("actualizar");
  setTimeout(() => location.reload(), 1500);  // por si el navegador no avisa del cambio
}
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (actualizando) location.reload(); });
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    const vigilar = (sw) => sw && sw.addEventListener("statechange", () => {
      if (sw.state === "installed" && navigator.serviceWorker.controller) hayVersionNueva(sw);
    });
    if (reg.waiting && navigator.serviceWorker.controller) hayVersionNueva(reg.waiting);
    vigilar(reg.installing);
    reg.addEventListener("updatefound", () => vigilar(reg.installing));
    // Busca versiones nuevas al volver a la app y cada 15 minutos
    const buscar = () => reg.update().catch(() => { });
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && buscar());
    setInterval(buscar, 15 * 60 * 1000);
  }).catch(() => { });
}

// Service worker mínimo: permite instalar la app en el móvil y abrirla sin conexión
// (muestra la pantalla de inicio). Los datos y el análisis siempre van al servidor.
// VERSION la rellena quien sirve este fichero (servidor_web.py o la demo) con una huella de la app:
// si cambia cualquier fichero, cambia sw.js y la app avisa de que hay una versión nueva.
const VERSION = "946056912732";
const CACHE = "telerehab-" + VERSION;
const ESTATICOS = ["/", "/static/app.css", "/static/app.js", "/static/icono-192.png", "/static/icono.svg"];

self.addEventListener("install", (e) => {
  // No se activa sola: espera a que el usuario pulse «Actualizar» (salvo la primera instalación)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESTATICOS.map((u) => new Request(u, { cache: "reload" })))));
});
self.addEventListener("message", (e) => {
  if (e.data === "actualizar") self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Red primero (para ver siempre la última versión) y caché como respaldo sin conexión
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")
      || url.pathname.startsWith("/ws/") || url.pathname.startsWith("/videos_explicativos/")
      || url.pathname.startsWith("/demo/series/")) return;
  // no-cache: pregunta al servidor si hay versión nueva en vez de usar la copia de la caché HTTP
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => {
    if (r.ok) {
      const copia = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia));
    }
    return r;
  }).catch(() => caches.match(e.request)));
});

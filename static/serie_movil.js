/* Serie analizada en el móvil del paciente (app real con servidor).
 *
 * Se comporta como el WebSocket de /ws/serie (mismos mensajes), así que app.js no cambia su lógica:
 *  - Los fotogramas se analizan aquí (analisis.js: MediaPipe para JavaScript + los mismos módulos de
 *    Python con Pyodide). La imagen de la cámara no sale del teléfono.
 *  - Al terminar se envían al servidor solo el resultado y el informe (POST /api/serie) y, si el
 *    paciente lo permite en «Mi cuenta», el vídeo de la serie para su fisioterapeuta.
 *  - Si el móvil no puede preparar el análisis (navegador antiguo, sin memoria, sin conexión para
 *    descargarlo la primera vez), se pasa sin que se note al análisis en el servidor (/ws/serie).
 * En la demo de GitHub Pages no se usa: demo.js tiene su propia versión que guarda en el navegador.
 */
(() => {
  "use strict";
  if (window.DEMO) return;
  const WS = window.WebSocket;

  class SerieMovil {
    constructor(direccion, token, { compartirVideo = true } = {}) {
      this.direccion = direccion; this.token = token; this.compartirVideo = compartirVideo;
      const url = new URL(direccion, location.href);
      this.ejercicio = url.searchParams.get("ejercicio"); this.nivel = url.searchParams.get("nivel");
      this.readyState = 0; this.binaryType = "arraybuffer";
      this.cola = []; this.fin = false; this.serie = null; this.trabajando = false; this.remoto = null;
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); this._preparar(); }, 0);
    }
    _emitir(data) { !this.cerrado && this.onmessage && this.onmessage({ data }); }
    _error(mensaje) { this.fin = true; this._emitir(JSON.stringify({ estado: "error", mensaje })); this.readyState = 3; }
    _mensaje(texto) { const m = document.getElementById("mensaje"); if (m && texto != null) m.textContent = texto; }

    async _preparar() {
      const entrada = document.getElementById("entrada");
      const pausado = entrada && !entrada.srcObject && !entrada.paused;
      if (pausado) entrada.pause();
      let motor;
      try {
        if (!window.AnalisisNavegador) throw new Error("sin análisis");
        motor = await window.AnalisisNavegador.preparar((t) => !this.fin && this._mensaje(t));
      } catch (_) {
        if (pausado) entrada.play().catch(() => { });
        return this._alServidor();
      }
      if (this.fin) return;
      this._mensaje("");
      if (pausado) entrada.play().catch(() => { });
      this.serie = window.AnalisisNavegador.nuevaSerie(motor, this.ejercicio, this.nivel, 0, "paciente");
      this._bucle();
    }

    // Plan B: el análisis de siempre en el servidor. Se reenvían los mensajes tal cual.
    _alServidor() {
      if (this.fin) return;
      const ws = this.remoto = new WS(this.direccion);
      ws.binaryType = "arraybuffer";
      ws.onopen = () => { const c = this.cola; this.cola = []; c.forEach((d) => ws.send(d)); };
      ws.onmessage = (ev) => this._emitir(ev.data);
      ws.onerror = () => this.onerror && this.onerror();
      ws.onclose = () => { this.readyState = 3; };
    }

    send(datos) {
      if (this.remoto) {
        if (this.remoto.readyState === 1) this.remoto.send(datos); else if (datos !== "stop") this.cola.push(datos);
        return;
      }
      if (this.fin) return;
      if (datos === "stop") return this.serie ? this._terminar("detenido") : this._error("Serie cancelada antes de empezar.");
      this.cola.push(datos);
      this._bucle();
    }

    _grabador(lienzo) {
      if (this.grabador !== undefined) return;
      this.grabador = null; this.trozos = [];
      if (!this.compartirVideo) return;  // si no se comparte, ni se graba
      try {
        const tipo = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
        const g = new MediaRecorder(lienzo.captureStream(15), tipo ? { mimeType: tipo, videoBitsPerSecond: 1200000 } : {});
        g.ondataavailable = (e) => e.data && e.data.size && this.trozos.push(e.data);
        g.start(1000);
        this.grabador = g;
      } catch (_) { this.grabador = null; }
    }

    async _bucle() {
      if (this.trabajando || !this.serie) return;
      this.trabajando = true;
      try {
        while (this.cola.length && !this.fin) {
          const datos = this.cola.shift();
          const imagen = await createImageBitmap(new Blob([datos], { type: "image/jpeg" }));
          const c = this.lienzo || (this.lienzo = document.createElement("canvas"));
          if (c.width !== imagen.width || c.height !== imagen.height) { c.width = imagen.width; c.height = imagen.height; }
          c.getContext("2d").drawImage(imagen, 0, 0);
          imagen.close && imagen.close();
          const m = this.serie.procesar(c);
          this._grabador(c);
          const url = c.toDataURL("image/jpeg", 0.8), bin = atob(url.slice(url.indexOf(",") + 1));
          const jpeg = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
          this._emitir(jpeg.buffer);
          this._emitir(JSON.stringify(m));
          if (m.estado === "completado" || m.estado === "cortafuegos") { this._terminar(m.estado); break; }
        }
      } catch (e) {
        console.error(e);
        if (!this.fin) this._error("Ha fallado el análisis en este móvil. Inténtalo de nuevo.");
      } finally { this.trabajando = false; }
    }

    async _enviar(ruta, opciones, intentos = 3) {
      for (let i = 1; ; i++) {
        try {
          const r = await fetch(ruta, { ...opciones, headers: { Authorization: "Bearer " + this.token, ...(opciones.headers || {}) } });
          const d = await r.json().catch(() => ({}));
          if (r.ok) return d;
          if (r.status < 500) throw Object.assign(new Error(d.detalle || "No se ha podido guardar la serie"), { final: true });
        } catch (e) { if (e.final || i >= intentos) throw e; }
        await new Promise((ok) => setTimeout(ok, 1500 * i));
      }
    }

    async _terminar(resultado) {
      if (this.fin) return;
      this.fin = true;
      const fin = this.serie.finalizar();
      const video = await new Promise((ok) => {
        const g = this.grabador;
        if (!g || g.state === "inactive") return ok(null);
        g.onstop = () => ok(this.trozos.length ? new Blob(this.trozos, { type: g.mimeType || "video/webm" }) : null);
        g.stop();
      });
      const s = fin.sesion || {};
      try {
        const guardada = await this._enviar("/api/serie", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ejercicio: this.ejercicio, nivel: this.nivel, repeticiones: s.repeticiones || 0,
            errores: s.errores || 0, profundidad_media: s.profundidad_media ?? null, observaciones: s.observaciones || "",
            informe: fin.informe || "" }),
        });
        if (video) {
          this._mensaje("Enviando el vídeo a tu fisioterapeuta…");
          await this._enviar(`/api/serie/video?fecha=${encodeURIComponent(guardada.fecha)}`,
            { method: "POST", headers: { "Content-Type": video.type.split(";")[0] }, body: video }, 2).catch(() => { });
        }
      } catch (e) {
        return this._error(`${e.message || "No se ha podido guardar la serie"}. Revisa la conexión.`);
      }
      this._emitir(JSON.stringify({ estado: "guardado", resultado }));
      this.readyState = 3;
    }

    close() {
      if (this.remoto) { try { this.remoto.close(); } catch (_) { } return; }
      if (!this.fin && this.serie) this._terminar("detenido");
      this.fin = true; this.readyState = 3;
    }
  }

  window.SerieMovil = SerieMovil;
})();

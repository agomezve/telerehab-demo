/* Análisis con la cámara dentro del navegador (demo de GitHub Pages, sin servidor).
 *
 * Es el mismo análisis que hace el servidor en /ws/serie, pero ejecutado en el móvil:
 *  - MediaPipe para JavaScript (PoseLandmarker, modelo «full», el mismo que model_complexity=1 en
 *    Python) calcula los 33 puntos del cuerpo de cada fotograma.
 *  - Pyodide (Python en WebAssembly) ejecuta SIN CAMBIOS motor.py y modulos/*.py con esos puntos,
 *    gracias a motor_navegador.py, que sustituye mediapipe, cv2 y database.
 *  - Lo que los módulos dibujan (esqueleto, marcador, barra de progreso…) se pinta en un lienzo.
 * La primera vez descarga ~30 MB (Python, NumPy y el modelo); después quedan en la caché del navegador.
 */
(() => {
  "use strict";
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  const VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  const MODELO = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

  const cargarScript = (src) => new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error("No se ha podido descargar " + src));
    document.head.appendChild(s);
  });

  let preparado = null;
  function preparar(progreso = () => { }) {
    if (preparado) return preparado;
    preparado = (async () => {
      progreso("Preparando el análisis en tu móvil… (solo tarda la primera vez)");
      const python = (async () => {
        await cargarScript(PYODIDE + "pyodide.js");
        const py = await window.loadPyodide({ indexURL: PYODIDE });
        await py.loadPackage("numpy");
        // Código del TFG tal cual (motor.py, ejercicios.py, config.py, modulos/) + los sustitutos
        const ficheros = await fetch("/demo/py.json").then((r) => r.json());
        const mkdir = (c) => { try { py.FS.mkdir(c); } catch (_) { } };
        mkdir("/app"); mkdir("/datos");
        for (const [ruta, codigo] of Object.entries(ficheros)) {
          let carpeta = "/app";
          for (const p of ruta.split("/").slice(0, -1)) { carpeta += "/" + p; mkdir(carpeta); }
          py.FS.writeFile("/app/" + ruta, codigo);
        }
        py.runPython("import sys; sys.path.insert(0, '/app'); import motor_navegador");
        return py;
      })();
      const pose = (async () => {
        const { FilesetResolver, PoseLandmarker } = await import(VISION + "/vision_bundle.mjs");
        const archivos = await FilesetResolver.forVisionTasks(VISION + "/wasm");
        const opciones = (delegate) => ({
          baseOptions: { modelAssetPath: MODELO, delegate }, runningMode: "VIDEO", numPoses: 1,
          minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
        });
        // CPU: en móviles la GPU (WebGL) a veces pierde el contexto a mitad de serie
        return PoseLandmarker.createFromOptions(archivos, opciones("CPU"));
      })();
      const [py, detector] = await Promise.all([python, pose]);
      const motor = py.pyimport("motor_navegador");
      progreso("");
      return { py, detector, motor };
    })();
    preparado.catch(() => { preparado = null; });  // si falla (sin conexión…), se puede reintentar
    return preparado;
  }

  // Pinta en el lienzo lo que el módulo ha dibujado con cv2 (colores en RGB, como el fotograma)
  function pintarOrdenes(ctx, ordenes) {
    const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const o of ordenes) {
      if (o[0] === "t") {
        const [, texto, x, y, escala, color, grosor, ancho] = o;
        ctx.save();
        ctx.font = `${grosor >= 2 ? 700 : 500} ${Math.max(8, Math.round(escala * 30))}px system-ui, -apple-system, sans-serif`;
        ctx.textBaseline = "alphabetic";
        const medido = ctx.measureText(texto).width;
        ctx.translate(x, y);
        if (medido > ancho) ctx.scale(ancho / medido, 1);  // mismo ancho que con la fuente de OpenCV
        ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.strokeText(texto, 0, 0);
        ctx.fillStyle = rgb(color); ctx.fillText(texto, 0, 0);
        ctx.restore();
      } else if (o[0] === "r") {
        const [, x1, y1, x2, y2, color, grosor] = o;
        if (grosor < 0) { ctx.fillStyle = rgb(color); ctx.fillRect(x1, y1, x2 - x1, y2 - y1); }
        else { ctx.strokeStyle = rgb(color); ctx.lineWidth = grosor; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1); }
      } else if (o[0] === "l") {
        const [, x1, y1, x2, y2, color, grosor] = o;
        ctx.strokeStyle = rgb(color); ctx.lineWidth = grosor;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      } else if (o[0] === "c") {
        const [, x, y, r, color, grosor] = o;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        if (grosor < 0) { ctx.fillStyle = rgb(color); ctx.fill(); }
        else { ctx.strokeStyle = rgb(color); ctx.lineWidth = grosor; ctx.stroke(); }
      }
    }
  }

  const puntos = (lista) => lista.map((p) => [p.x, p.y, p.z, p.visibility ?? 1]);

  // Una serie: procesar(lienzo) analiza el fotograma que hay en el lienzo y dibuja encima
  function nuevaSerie({ py, detector, motor }, ejercicio, nivel, pacienteId, nombre) {
    motor.nueva_serie(ejercicio, nivel, pacienteId, nombre);
    let ultimo = 0;
    return {
      procesar(lienzo) {
        const t = Math.max(ultimo + 1, Math.round(performance.now()));
        ultimo = t;
        const r = detector.detectForVideo(lienzo, t);
        const hay = r.landmarks && r.landmarks.length && r.worldLandmarks && r.worldLandmarks.length;
        const datos = JSON.parse(motor.procesar(lienzo.width, lienzo.height,
          JSON.stringify(hay ? [puntos(r.landmarks[0]), puntos(r.worldLandmarks[0])] : null)));
        pintarOrdenes(lienzo.getContext("2d"), datos.ordenes);
        delete datos.ordenes;
        return datos;
      },
      finalizar() { return JSON.parse(motor.finalizar()); },
    };
  }

  window.AnalisisNavegador = { preparar, nuevaSerie };
})();

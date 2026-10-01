var listaRegistrosGlobal = [];
var todosRegistros = [];

var API_URL = (function () {
  var cfg = (typeof CONFIG !== "undefined" && CONFIG.API_URL) ? String(CONFIG.API_URL).trim() : "";
  if (cfg) {
    try { localStorage.removeItem("viajes_api_url"); } catch (e) {}
    return cfg;
  }
  var local = "";
  try { local = localStorage.getItem("viajes_api_url") || ""; } catch (e2) {}
  return String(local).trim();
})();

function idDespliegue_() {
  var m = String(API_URL).match(/\/s\/([^\/]+)\//);
  return m ? m[1].slice(0, 10) + "…" : "(sin URL)";
}

function construirURL(accion, datos) {
  var sep = API_URL.indexOf("?") === -1 ? "?" : "&";
  var url = API_URL + sep + "action=" + encodeURIComponent(accion);
  if (datos) url += "&payload=" + encodeURIComponent(JSON.stringify(datos));
  return url;
}

function jsonp(accion, datos) {
  return new Promise(function (resolve, reject) {
    var nombre = "__cb_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    var url = construirURL(accion, datos) + "&callback=" + encodeURIComponent(nombre);
    var script = document.createElement("script");
    var cerrado = false;
    var temporizador = null;

    function cerrar(error) {
      if (cerrado) return;
      cerrado = true;
      clearTimeout(temporizador);
      try { delete window[nombre]; } catch (e) { window[nombre] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
      if (error) reject(error);
    }

    temporizador = setTimeout(function () {
      cerrar(new Error(
        "La API no respondió a tiempo (60 s). Revisá: 1) Implementar → Administrar implementaciones → Acceso = Cualquiera, " +
        "2) la URL en config.js, 3) que esté publicada la versión nueva."
      ));
    }, 60000);

    window[nombre] = function (respuesta) {
      cerrar();
      resolve(respuesta);
    };

    script.onload = function () {
      setTimeout(function () {
        if (!cerrado) {
          cerrar(new Error(
            "La API contestó con una página de Google en vez de datos. Causa habitual: el acceso de la implementación NO es 'Cualquiera' " +
            "(Implementar → Administrar implementaciones → editar → Quién tiene acceso → Cualquiera). " +
            "Si ya lo es, falta publicar la versión nueva con el código de codigo.txt."
          ));
        }
      }, 600);
    };

    script.onerror = function () {
      cerrar(new Error(
        "No se pudo leer la respuesta de la API. Revisá la URL en config.js, que el acceso sea 'Cualquiera' y que la implementación sea la versión nueva."
      ));
    };

    script.src = url;
    document.head.appendChild(script);
  });
}

function llamarAPI(accion, datos) {
  if (!API_URL) {
    return Promise.reject(new Error("Falta la URL de la API. Configurala en config.js"));
  }

  var url = construirURL(accion, datos);
  var control = (typeof AbortController !== "undefined") ? new AbortController() : null;
  var temporizador = setTimeout(function () { if (control) control.abort(); }, 60000);

  return fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal: control ? control.signal : undefined })
    .then(function (res) {
      clearTimeout(temporizador);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }, function (error) {
      clearTimeout(temporizador);
      throw error;
    })
    .catch(function (errorFetch) {
      return jsonp(accion, datos).catch(function (errorJsonp) {
        throw new Error(errorFetch.message + " / JSONP: " + errorJsonp.message);
      });
    });
}

var MAX_ARCHIVO = 10 * 1024 * 1024;

function llamarAPIPost(accion, datos) {
  if (!API_URL) {
    return Promise.reject(new Error("Falta la URL de la API. Configurala en config.js"));
  }

  var control = (typeof AbortController !== "undefined") ? new AbortController() : null;
  var temporizador = setTimeout(function () { if (control) control.abort(); }, 120000);

  return fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: accion, payload: datos }),
    redirect: "follow",
    cache: "no-store",
    signal: control ? control.signal : undefined
  }).then(function (res) {
    clearTimeout(temporizador);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }, function (error) {
    clearTimeout(temporizador);
    throw new Error("No se pudo enviar el pedido a la API. Revisá que esté publicada la versión nueva y el acceso 'Cualquiera'. (" + error.message + ")");
  });
}

function leerArchivo(file) {
  return new Promise(function (resolve, reject) {
    if (!file) return resolve(null);
    if (file.size > MAX_ARCHIVO) {
      reject(new Error("El archivo '" + file.name + "' supera los 10 MB."));
      return;
    }
    var lector = new FileReader();
    lector.onload = function () {
      var resultado = String(lector.result || "");
      resolve({
        base64: resultado.split(",")[1] || "",
        nombre: file.name,
        mime: file.type || "application/octet-stream"
      });
    };
    lector.onerror = function () {
      reject(new Error("No se pudo leer el archivo " + file.name));
    };
    lector.readAsDataURL(file);
  });
}

function notificar(icono, titulo, texto) {
  if (typeof Swal !== "undefined") {
    Swal.fire({ icon: icono, title: titulo, text: texto || "" });
  } else {
    alert(titulo + (texto ? "\n" + texto : ""));
  }
}

function notificarExito(titulo) {
  if (typeof Swal !== "undefined") {
    Swal.fire({ icon: "success", title: titulo, showConfirmButton: false, timer: 1800 });
  } else {
    alert(titulo);
  }
}

function formatearFechaLatina(fechaISO) {
  if (!fechaISO) return "-";
  var partes = String(fechaISO).split("T")[0].split("-");
  if (partes.length === 3) return partes[2] + "/" + partes[1] + "/" + partes[0];
  return fechaISO;
}

function escapeHTML(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function calcularDias() {
  var inicio = document.getElementById("fechaInicio").value;
  var fin = document.getElementById("fechaFin").value;
  if (!inicio || !fin) return;
  var d1 = new Date(inicio + "T00:00:00");
  var d2 = new Date(fin + "T00:00:00");
  var diff = Math.round((d2 - d1) / 86400000) + 1;
  document.getElementById("cantidadDias").value = diff > 0 ? diff : "";
}

function marcarApi(ok) {
  var indicador = document.getElementById("estadoApi");
  if (!indicador) return;
  if (ok) {
    indicador.className = "badge bg-success";
    indicador.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>API conectada';
  } else {
    indicador.className = "badge bg-danger";
    indicador.innerHTML = '<i class="fa-solid fa-plug-circle-xmark me-1"></i>Sin conexión con la API';
  }
}

document.getElementById("fechaInicio").value = new Date().toISOString().split("T")[0];
document.getElementById("fechaFin").value = new Date().toISOString().split("T")[0];
calcularDias();

document.getElementById("fechaInicio").addEventListener("change", calcularDias);
document.getElementById("fechaFin").addEventListener("change", calcularDias);

function generarRequestId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

var requestIdActual = generarRequestId();

function panelAbierto() {
  var panel = document.getElementById("panelCarga");
  return panel && !panel.classList.contains("d-none");
}

function actualizarFab() {
  var fab = document.getElementById("btnFab");
  if (!fab) return;
  if (panelAbierto()) {
    fab.classList.add("fab-abierto");
    fab.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    fab.title = "Cerrar panel de carga";
  } else {
    fab.classList.remove("fab-abierto");
    fab.innerHTML = '<i class="fa-solid fa-plus"></i>';
    fab.title = "Nuevo registro";
  }
}

function abrirPanel() {
  var panel = document.getElementById("panelCarga");
  if (!panel) return;
  panel.classList.remove("d-none");
  actualizarFab();
  setTimeout(function () {
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    var campo = document.getElementById("fechaInicio");
    if (campo) campo.focus({ preventScroll: true });
  }, 80);
}

function cerrarPanel() {
  cancelarEdicion();
  var panel = document.getElementById("panelCarga");
  if (panel) panel.classList.add("d-none");
  actualizarFab();
  var fab = document.getElementById("btnFab");
  if (fab) fab.scrollIntoView({ block: "nearest" });
}

function alternarPanel() {
  if (panelAbierto()) cerrarPanel();
  else abrirPanel();
}

function modoCargando(btn, activo, texto) {
  if (activo) {
    btn.disabled = true;
    btn.dataset.etiquetaOriginal = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> ' + (texto || "Guardando...");
    btn.classList.add("is-loading");
  } else {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    if (btn.dataset.etiquetaOriginal) btn.innerHTML = btn.dataset.etiquetaOriginal;
    delete btn.dataset.etiquetaOriginal;
  }
}

function agregarAcompanante(datos) {
  datos = datos || {};
  var cont = document.getElementById("listaAcompanantes");
  if (!cont) return;
  var div = document.createElement("div");
  div.className = "row g-2 acompanante-bloque align-items-end";
  div.innerHTML =
    '<div class="col-md-2"><label class="form-label fw-bold">Jerarquía</label>' +
    '<input type="text" class="form-control acomp-jerarquia" placeholder="Ej: PG" value="' + escapeHTML(datos.jerarquia || "") + '"></div>' +
    '<div class="col-md-3"><label class="form-label fw-bold">DNI</label>' +
    '<input type="text" class="form-control acomp-dni" placeholder="Ej: 31XXXXXX" value="' + escapeHTML(datos.dni || "") + '"></div>' +
    '<div class="col-md-3"><label class="form-label fw-bold">Apellido</label>' +
    '<input type="text" class="form-control acomp-apellido" placeholder="Apellido" value="' + escapeHTML(datos.apellido || "") + '"></div>' +
    '<div class="col-md-3"><label class="form-label fw-bold">Nombre</label>' +
    '<input type="text" class="form-control acomp-nombre" placeholder="Nombre" value="' + escapeHTML(datos.nombre || "") + '"></div>' +
    '<div class="col-md-1 d-flex align-items-end"><button type="button" class="btn btn-sm btn-outline-danger w-100" ' +
    'onclick="this.closest(\'.acompanante-bloque\').remove()" title="Quitar"><i class="fa-solid fa-trash"></i></button></div>';
  cont.appendChild(div);
}

function obtenerAcompanantes() {
  var lista = [];
  var bloques = document.querySelectorAll("#listaAcompanantes .acompanante-bloque");
  Array.prototype.forEach.call(bloques, function (b) {
    var ap = b.querySelector(".acomp-apellido").value.trim();
    var no = b.querySelector(".acomp-nombre").value.trim();
    if (!ap && !no) return;
    lista.push({
      jerarquia: b.querySelector(".acomp-jerarquia").value.trim(),
      dni: b.querySelector(".acomp-dni").value.trim(),
      apellido: ap,
      nombre: no
    });
  });
  return lista.slice(0, 20);
}

function limpiarAcompanantes() {
  var cont = document.getElementById("listaAcompanantes");
  if (cont) cont.innerHTML = "";
}

function personasDelRegistro(r) {
  var lista = [];
  function agregar(ap, no) {
    var clave = String(ap || "").trim() + ", " + String(no || "").trim();
    if (clave && clave !== ", " && lista.indexOf(clave) === -1) lista.push(clave);
  }
  agregar(r.apellido, r.nombre);
  (r.acompanantes || []).forEach(function (a) { agregar(a.apellido, a.nombre); });
  return lista;
}

function textoAcompanantes(item) {
  var acs = item.acompanantes || [];
  if (!acs.length) return '<span class="text-muted">-</span>';
  return acs.map(function (a) {
    var t = escapeHTML(a.apellido) + ", " + escapeHTML(a.nombre);
    var extra = [];
    if (a.jerarquia) extra.push(escapeHTML(a.jerarquia));
    if (a.dni) extra.push("DNI " + escapeHTML(a.dni));
    return t + (extra.length ? " (" + extra.join(" · ") + ")" : "");
  }).join("<br>");
}

document.getElementById("formRegistro").addEventListener("submit", function (e) {
  e.preventDefault();

  var btnGuardar = document.getElementById("btnGuardar");
  if (btnGuardar.disabled) return;

  var datos = {
    id: document.getElementById("registroId").value,
    requestId: requestIdActual,
    fechaInicio: document.getElementById("fechaInicio").value,
    fechaFin: document.getElementById("fechaFin").value,
    cantidadDias: document.getElementById("cantidadDias").value,
    tipo: document.getElementById("tipo").value,
    estado: document.getElementById("estado").value,
    jerarquia: document.getElementById("jerarquia").value,
    dni: document.getElementById("dni").value,
    apellido: document.getElementById("apellido").value,
    nombre: document.getElementById("nombre").value,
    nombreComision: document.getElementById("nombreComision").value,
    motivo: document.getElementById("motivo").value,
    pais: document.getElementById("pais").value,
    ciudad: document.getElementById("ciudad").value,
    expediente: document.getElementById("expediente").value,
    gastosPna: document.getElementById("gastosPna").value,
    enviarCalendario: document.getElementById("enviarCalendario").checked,
    acompanantes: obtenerAcompanantes()
  };

  var archivoInicio = document.getElementById("adjuntoInicio").files[0] || null;
  var archivoFin = document.getElementById("adjuntoFin").files[0] || null;
  var chkQuitarInicio = document.getElementById("quitarInicio");
  var chkQuitarFin = document.getElementById("quitarFin");
  var hayArchivo = !!(archivoInicio || archivoFin);

  modoCargando(btnGuardar, true, hayArchivo ? "Subiendo informe..." : "Guardando...");

  Promise.all([leerArchivo(archivoInicio), leerArchivo(archivoFin)])
    .then(function (adjuntos) {
      var aInicio = adjuntos[0];
      var aFin = adjuntos[1];

      if (aInicio) {
        datos.adjuntoInicioBase64 = aInicio.base64;
        datos.adjuntoInicioNombre = aInicio.nombre;
        datos.adjuntoInicioMime = aInicio.mime;
      } else if (chkQuitarInicio && chkQuitarInicio.checked) {
        datos.quitarInicio = true;
      }

      if (aFin) {
        datos.adjuntoFinBase64 = aFin.base64;
        datos.adjuntoFinNombre = aFin.nombre;
        datos.adjuntoFinMime = aFin.mime;
      } else if (chkQuitarFin && chkQuitarFin.checked) {
        datos.quitarFin = true;
      }

      modoCargando(btnGuardar, true, hayArchivo ? "Subiendo informe..." : "Guardando...");

      if (hayArchivo) return llamarAPIPost("guardar", datos);
      return llamarAPI("guardar", datos);
    })
    .then(function (res) {
      modoCargando(btnGuardar, false);
      if (res && res.exito) {
        if (res.advertencia) {
          notificar("warning", "Guardado, pero sin informe", res.mensaje);
        } else {
          notificarExito(res.mensaje || "Registro guardado");
        }
        cancelarEdicion();
        cerrarPanel();
        recargarDatos();
      } else {
        notificar("error", "Error", (res && res.mensaje) || "Ocurrió un error inesperado");
      }
    })
    .catch(function (err) {
      modoCargando(btnGuardar, false);
      notificar("error", "Error al guardar", err.message);
    });
});

var kpiActivo = null;

function animarNumero(el, destino) {
  var actual = parseInt(el.textContent, 10) || 0;
  destino = destino || 0;
  if (actual === destino) {
    el.textContent = destino;
    return;
  }
  var pasos = 20;
  var i = 0;
  var timer = setInterval(function () {
    i++;
    el.textContent = Math.round(actual + (destino - actual) * (i / pasos));
    if (i >= pasos) {
      clearInterval(timer);
      el.textContent = destino;
    }
  }, 25);
}

function calcularResumenLocal() {
  var r = { total: 0, enCurso: 0, canceladas: 0, nacionales: 0, internacionales: 0 };

  todosRegistros.forEach(function (reg) {
    r.total++;
    if (reg.estado === "En curso") r.enCurso++;
    else if (reg.estado === "Cancelada") r.canceladas++;

    if (reg.tipo === "Nacional") r.nacionales++;
    else if (reg.tipo === "Internacional") r.internacionales++;
  });

  return r;
}

function pintarKpis(resumen) {
  var r = resumen || calcularResumenLocal();
  var valores = {
    kpiTotal: r.total,
    kpiEnCurso: r.enCurso,
    kpiCanceladas: r.canceladas,
    kpiNacionales: r.nacionales,
    kpiInternacionales: r.internacionales
  };
  Object.keys(valores).forEach(function (id) {
    var el = document.getElementById(id);
    if (el) animarNumero(el, valores[id]);
  });
}

function clavePersona(r) {
  var ap = (r.apellido || "").trim();
  var no = (r.nombre || "").trim();
  if (!ap && !no) return "";
  return ap + ", " + no;
}

function llenarPersonas() {
  var sel = document.getElementById("buscarPersona");
  if (!sel) return;
  var anterior = sel.value || "Todas";
  var unicas = {};
  todosRegistros.forEach(function (r) {
    personasDelRegistro(r).forEach(function (clave) { unicas[clave] = true; });
  });
  var lista = Object.keys(unicas).sort(function (a, b) {
    return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
  });
  sel.innerHTML = '<option value="Todas">Todas las personas</option>' +
    lista.map(function (p) {
      return '<option value="' + escapeHTML(p) + '">' + escapeHTML(p) + "</option>";
    }).join("");
  sel.value = unicas[anterior] ? anterior : "Todas";
}

function limpiarFiltros() {
  document.getElementById("buscarTexto").value = "";
  document.getElementById("buscarPersona").value = "Todas";
  document.getElementById("buscarTipo").value = "Todos";
  document.getElementById("buscarEstado").value = "Todos";
  document.getElementById("fechaDesde").value = "";
  document.getElementById("fechaHasta").value = "";
}

function limpiarTodo() {
  kpiActivo = null;
  marcarKpi();
  limpiarFiltros();
  ejecutarBusqueda();
}

function marcarKpi() {
  var tarjetas = document.querySelectorAll("#kpis .kpi");
  Array.prototype.forEach.call(tarjetas, function (el) {
    if (el.getAttribute("data-kpi") === kpiActivo) el.classList.add("kpi-activo");
    else el.classList.remove("kpi-activo");
  });
}

function aplicarKpi(clave) {
  if (kpiActivo === clave) {
    kpiActivo = null;
    limpiarFiltros();
  } else {
    kpiActivo = clave;
    limpiarFiltros();

    if (clave === "encurso") document.getElementById("buscarEstado").value = "En curso";
    else if (clave === "canceladas") document.getElementById("buscarEstado").value = "Cancelada";
    else if (clave === "nacionales") document.getElementById("buscarTipo").value = "Nacional";
    else if (clave === "internacionales") document.getElementById("buscarTipo").value = "Internacional";
  }

  marcarKpi();
  ejecutarBusqueda();
}

function criterioBusqueda() {
  return {
    texto: document.getElementById("buscarTexto").value,
    persona: document.getElementById("buscarPersona").value,
    tipo: document.getElementById("buscarTipo").value,
    estado: document.getElementById("buscarEstado").value,
    fechaDesde: document.getElementById("fechaDesde").value,
    fechaHasta: document.getElementById("fechaHasta").value
  };
}

["buscarTexto", "buscarPersona", "buscarTipo", "buscarEstado", "fechaDesde", "fechaHasta"].forEach(function (id) {
  var campo = document.getElementById(id);
  if (!campo) return;
  campo.addEventListener("input", function () {
    if (kpiActivo) {
      kpiActivo = null;
      marcarKpi();
    }
  });
  campo.addEventListener("change", function () {
    if (kpiActivo) {
      kpiActivo = null;
      marcarKpi();
    }
  });
});

document.getElementById("formBusqueda").addEventListener("submit", function (e) {
  e.preventDefault();
  ejecutarBusqueda();
});

var NIVELES_ZOOM = ["Año", "Semestre", "Trimestre", "Mes", "Quincena", "Semana"];
var DIAS_ZOOM = [365, 180, 90, 30, 14, 7];
var ganttZoomIdx = 0;
var ganttCentro = null;

function nivelZoomActual() {
  var d = document.getElementById("ganttDesde").value;
  var h = document.getElementById("ganttHasta").value;
  if (d && h && h >= d) return "Rango";
  return NIVELES_ZOOM[ganttZoomIdx];
}

function actualizarEtiquetaZoom() {
  var el = document.getElementById("ganttZoomNivel");
  if (el) el.textContent = nivelZoomActual();
}

function salirDeRango() {
  var d = document.getElementById("ganttDesde").value;
  var h = document.getElementById("ganttHasta").value;
  if (d && h && h >= d) {
    ganttCentro = Math.round((fechaMS(d) + fechaMS(h)) / 2);
    document.getElementById("ganttDesde").value = "";
    document.getElementById("ganttHasta").value = "";
  }
  if (ganttCentro === null) {
    var hh = new Date();
    hh.setHours(0, 0, 0, 0);
    ganttCentro = hh.getTime();
  }
}

function fijarZoom(idx) {
  ganttZoomIdx = Math.max(0, Math.min(NIVELES_ZOOM.length - 1, idx));
  var anioEl = document.getElementById("ganttAnio");
  if (anioEl && ganttCentro) anioEl.value = new Date(ganttCentro).getFullYear();
  actualizarEtiquetaZoom();
  dibujarGantt();
}

function zoomMas() {
  salirDeRango();
  fijarZoom(ganttZoomIdx + 1);
}

function zoomMenos() {
  salirDeRango();
  fijarZoom(ganttZoomIdx - 1);
}

document.getElementById("ganttAnio").addEventListener("change", function () {
  document.getElementById("ganttDesde").value = "";
  document.getElementById("ganttHasta").value = "";
  ganttZoomIdx = 0;
  ganttCentro = null;
  actualizarEtiquetaZoom();
  dibujarGantt();
});

document.getElementById("btnGanttHoy").addEventListener("click", function () {
  var h = new Date();
  h.setHours(0, 0, 0, 0);
  document.getElementById("ganttAnio").value = h.getFullYear();
  document.getElementById("ganttDesde").value = "";
  document.getElementById("ganttHasta").value = "";
  ganttCentro = h.getTime();
  actualizarEtiquetaZoom();
  dibujarGantt();
});

document.getElementById("btnGanttVer").addEventListener("click", function () {
  actualizarEtiquetaZoom();
  dibujarGantt();
});

document.getElementById("btnZoomIn").addEventListener("click", function () {
  zoomMas();
});

document.getElementById("btnZoomOut").addEventListener("click", function () {
  zoomMenos();
});

Array.prototype.forEach.call(document.querySelectorAll("[data-zoom]"), function (btn) {
  btn.addEventListener("click", function () {
    salirDeRango();
    var idx = parseInt(btn.getAttribute("data-zoom"), 10);
    if (idx === 0) ganttCentro = null;
    fijarZoom(isNaN(idx) ? 0 : idx);
  });
});

(function () {
  var zona = document.querySelector(".gantt-scroll");
  if (!zona) return;
  zona.addEventListener("wheel", function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    if (e.deltaY > 0) zoomMenos();
    else zoomMas();
  }, { passive: false });
})();

function filtrarLocal() {
  var c = criterioBusqueda();
  var texto = (c.texto || "").trim().toLowerCase();

  return todosRegistros.filter(function (r) {
    if (c.persona && c.persona !== "Todas" && personasDelRegistro(r).indexOf(c.persona) === -1) return false;
    if (c.tipo && c.tipo !== "Todos" && r.tipo !== c.tipo) return false;
    if (c.estado && c.estado !== "Todos" && r.estado !== c.estado) return false;
    if (c.fechaDesde && r.fechaInicio && r.fechaInicio < c.fechaDesde) return false;
    if (c.fechaHasta && r.fechaFin && r.fechaFin > c.fechaHasta) return false;

    if (texto) {
      var campo = [
        r.id, r.apellido, r.nombre, r.nombreComision, r.motivo,
        r.pais, r.ciudad, r.expediente, r.jerarquia, r.dni
      ].join(" ").toLowerCase();
      if (campo.indexOf(texto) === -1) return false;
    }

    return true;
  });
}

function ejecutarBusqueda() {
  renderizarTabla(filtrarLocal());
}

function recargarDatos() {
  var tbody = document.getElementById("tablaResultados");
  tbody.innerHTML = '<tr><td colspan="14" class="text-center text-muted texto-vacio">' +
    '<span class="spinner-border spinner-border-sm me-2"></span>Cargando datos...</td></tr>';

  return llamarAPI("cargarTodo", {})
    .then(function (res) {
      if (res && res.exito) {
        todosRegistros = (res.registros || []).slice().sort(function (a, b) {
          var fa = a.fechaInicio || "";
          var fb = b.fechaInicio || "";
          if (!fa && !fb) return 0;
          if (!fa) return 1;
          if (!fb) return -1;
          if (fa === fb) return 0;
          return fa < fb ? 1 : -1;
        });
        marcarApi(true);
        pintarKpis(res.resumen);
        llenarPersonas();
        ejecutarBusqueda();
      } else {
        marcarApi(false);
        tbody.innerHTML = '<tr><td colspan="14" class="text-center text-danger">' +
          escapeHTML((res && res.mensaje) || "Error al cargar los datos") + "</td></tr>";
      }
    })
    .catch(function (err) {
      marcarApi(false);
      tbody.innerHTML = '<tr><td colspan="14" class="text-center text-danger">Error al cargar datos: ' +
        escapeHTML(err.message) + " [API: " + escapeHTML(idDespliegue_()) + "]</td></tr>";
    });
}

function informesHTML(item) {
  var partes = [];
  if (item.adjuntoInicio) {
    partes.push('<a class="adj-link adj-inicio" href="' + escapeHTML(item.adjuntoInicio) +
      '" target="_blank" rel="noopener" title="Informe de inicio"><i class="fa-solid fa-file-arrow-up"></i></a>');
  }
  if (item.adjuntoFin) {
    partes.push('<a class="adj-link adj-fin" href="' + escapeHTML(item.adjuntoFin) +
      '" target="_blank" rel="noopener" title="Informe de cierre"><i class="fa-solid fa-file-circle-check"></i></a>');
  }
  if (!partes.length) return '<span class="text-muted">-</span>';
  return partes.join(" ");
}

function mostrarAdjunto(contenedor, url, campo) {
  var caja = document.getElementById(contenedor);
  if (!caja) return;
  if (url) {
    caja.classList.remove("d-none");
    caja.innerHTML = '<i class="fa-solid fa-paperclip me-1"></i>' +
      '<a href="' + escapeHTML(url) + '" target="_blank" rel="noopener">Ver informe actual</a>' +
      '<label class="ms-3 chk-quitar"><input type="checkbox" id="quitar' + campo + '"> Quitar</label>';
  } else {
    caja.classList.add("d-none");
    caja.innerHTML = "";
  }
}

var paginaActual = 1;
var POR_PAGINA = 10;

function renderizarTabla(datos) {
  listaRegistrosGlobal = datos || [];
  paginaActual = 1;

  var contador = document.getElementById("contadorRegistros");
  if (contador) contador.textContent = listaRegistrosGlobal.length;

  var tbody = document.getElementById("tablaResultados");
  if (!listaRegistrosGlobal.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="text-center text-muted texto-vacio">No se encontraron registros.</td></tr>';
    dibujarPaginacion();
    dibujarGantt();
    return;
  }

  dibujarPagina();
  dibujarGantt();
}

function dibujarPagina() {
  var total = listaRegistrosGlobal.length;
  var paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  if (paginaActual > paginas) paginaActual = paginas;
  if (paginaActual < 1) paginaActual = 1;

  var inicio = (paginaActual - 1) * POR_PAGINA;
  var fin = Math.min(inicio + POR_PAGINA, total);
  var porcion = listaRegistrosGlobal.slice(inicio, fin);

  var tbody = document.getElementById("tablaResultados");
  tbody.innerHTML = "";

  var badgeTipo = function (tipo) {
    return tipo === "Nacional" ? "badge-nacional" : "badge-internacional";
  };

  porcion.forEach(function (item, i) {
    var index = inicio + i;
    var tr = document.createElement("tr");
    var personal = escapeHTML(item.apellido) + ", " + escapeHTML(item.nombre);
    var jerarquia = item.jerarquia ? ' <span class="badge bg-dark">' + escapeHTML(item.jerarquia) + "</span>" : "";
    var acompTexto = "";
    var acs = personasDelRegistro(item).slice(1);
    if (acs.length) {
      acompTexto = '<div><small class="text-muted">+ ' + escapeHTML(acs.join("; ")) + "</small></div>";
    }

    tr.innerHTML = [
      '<td><span class="badge ' + badgeEstado(item.estado) + '">' + escapeHTML(item.estado || "-") + "</span>" +
        (item.eventoId ? ' <i class="fa-solid fa-calendar-check text-success ms-1" title="Sincronizado con Google Calendar"></i>' : "") + "</td>",
      '<td><span class="badge ' + badgeTipo(item.tipo) + '">' + escapeHTML(item.tipo || "-") + "</span></td>",
      "<td>" + personal + jerarquia + acompTexto + "</td>",
      "<td>" + escapeHTML(item.nombreComision || "-") + "</td>",
      "<td><small>" + escapeHTML(item.motivo || "-") + "</small></td>",
      "<td>" + formatearFechaLatina(item.fechaInicio) + "</td>",
      "<td>" + formatearFechaLatina(item.fechaFin) + "</td>",
      '<td class="text-center">' + escapeHTML(item.cantidadDias || "-") + "</td>",
      "<td>" + escapeHTML(item.pais || "-") + "</td>",
      "<td>" + escapeHTML(item.ciudad || "-") + "</td>",
      '<td><small class="text-muted">' + escapeHTML(item.expediente || "-") + "</small></td>",
      '<td class="text-center text-nowrap">' + informesHTML(item) + "</td>",
      '<td><span class="badge ' + (item.gastosPna === "SI" ? "bg-warning text-dark" : "bg-secondary") + '">' +
        escapeHTML(item.gastosPna || "-") + "</span></td>",
      '<td class="text-center text-nowrap">',
      '<button class="btn btn-sm btn-outline-primary me-1" onclick="cargarParaEditar(' + index + ')" title="Editar"><i class="fa-solid fa-pen"></i></button>',
      '<button class="btn btn-sm btn-outline-danger" onclick="confirmarEliminar(\'' + escapeHTML(item.id) + '\')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>',
      "</td>"
    ].join("");

    tbody.appendChild(tr);
  });

  dibujarPaginacion(inicio + 1, fin, total, paginas);
}

function numerosPagina(actual, total) {
  var lista = [];
  if (total <= 7) {
    for (var i = 1; i <= total; i++) lista.push(i);
    return lista;
  }

  lista.push(1);
  if (actual > 3) lista.push("...");
  var desde = Math.max(2, actual - 1);
  var hasta = Math.min(total - 1, actual + 1);
  for (var j = desde; j <= hasta; j++) lista.push(j);
  if (actual < total - 2) lista.push("...");
  lista.push(total);
  return lista;
}

function dibujarPaginacion(desde, hasta, total, paginas) {
  var info = document.getElementById("infoPagina");
  var cont = document.getElementById("paginacion");
  if (!info || !cont) return;

  if (!total) {
    info.textContent = "Sin resultados";
    cont.innerHTML = "";
    return;
  }

  info.textContent = "Mostrando " + desde + "–" + hasta + " de " + total + " comisiones";

  if (paginas <= 1) {
    cont.innerHTML = "";
    return;
  }

  var html = '<button type="button" class="pag-btn" ' + (paginaActual <= 1 ? "disabled" : "") +
    ' onclick="irAPagina(' + (paginaActual - 1) + ')" title="Anterior"><i class="fa-solid fa-chevron-left"></i></button>';

  numerosPagina(paginaActual, paginas).forEach(function (n) {
    if (n === "...") {
      html += '<span class="pag-puntos">&hellip;</span>';
    } else {
      html += '<button type="button" class="pag-btn' + (n === paginaActual ? " pag-activo" : "") +
        '" onclick="irAPagina(' + n + ')">' + n + "</button>";
    }
  });

  html += '<button type="button" class="pag-btn" ' + (paginaActual >= paginas ? "disabled" : "") +
    ' onclick="irAPagina(' + (paginaActual + 1) + ')" title="Siguiente"><i class="fa-solid fa-chevron-right"></i></button>';

  cont.innerHTML = html;
}

function irAPagina(n) {
  var paginas = Math.max(1, Math.ceil(listaRegistrosGlobal.length / POR_PAGINA));
  if (n < 1 || n > paginas) return;

  paginaActual = n;
  dibujarPagina();

  var contenedor = document.querySelector(".table-container");
  if (contenedor) {
    if (contenedor.scrollTo) contenedor.scrollTo({ top: 0, behavior: "smooth" });
    else contenedor.scrollTop = 0;
  }
}

var vistaActual = "tabla";

function cambiarVista(v) {
  vistaActual = v;
  document.getElementById("tabTabla").classList.toggle("vista-tab-activa", v === "tabla");
  document.getElementById("tabGantt").classList.toggle("vista-tab-activa", v === "gantt");
  document.getElementById("contenedorTabla").classList.toggle("d-none", v !== "tabla");
  document.getElementById("contenedorGantt").classList.toggle("d-none", v !== "gantt");
  var barra = document.querySelector(".paginacion-barra");
  if (barra) barra.style.display = v === "tabla" ? "" : "none";
  if (v === "gantt") {
    var anio = document.getElementById("ganttAnio");
    if (anio && !anio.value) anio.value = new Date().getFullYear();
    dibujarGantt();
  }
}

function claseGantt(estado) {
  switch (estado) {
    case "En curso": return "gantt-encurso";
    case "Finalizada": return "gantt-finalizada";
    case "Cancelada": return "gantt-cancelada";
    default: return "gantt-planificada";
  }
}

function fechaMS(iso) {
  var p = String(iso || "").split("T")[0].split("-");
  if (p.length !== 3) return null;
  var t = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)).getTime();
  return isNaN(t) ? null : t;
}

function isoDesdeMS(ms) {
  var t = new Date(ms);
  return t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
}

function dibujarGantt() {
  var cuerpo = document.getElementById("ganttCuerpo");
  var rango = document.getElementById("ganttRango");
  if (!cuerpo) return;

  var DIA = 86400000;

  var hoyCero = new Date();
  hoyCero.setHours(0, 0, 0, 0);
  var hoyISO = isoDesdeMS(hoyCero.getTime());

  var desdeVal = document.getElementById("ganttDesde").value;
  var hastaVal = document.getElementById("ganttHasta").value;
  var anioVal = parseInt(document.getElementById("ganttAnio").value, 10);
  if (isNaN(anioVal)) anioVal = new Date().getFullYear();

  var minMS;
  var maxMS;

  if (desdeVal && hastaVal && hastaVal >= desdeVal) {
    minMS = fechaMS(desdeVal);
    maxMS = fechaMS(hastaVal);
  } else if (ganttZoomIdx === 0) {
    minMS = new Date(anioVal, 0, 1).getTime();
    maxMS = new Date(anioVal, 11, 31).getTime();
  } else {
    if (ganttCentro === null) {
      var hc = new Date();
      hc.setHours(0, 0, 0, 0);
      ganttCentro = hc.getTime();
    }
    var spanZoom = DIAS_ZOOM[ganttZoomIdx];
    minMS = ganttCentro - Math.floor((spanZoom - 1) / 2) * DIA;
    maxMS = minMS + (spanZoom - 1) * DIA;
  }
  actualizarEtiquetaZoom();

  var ALTO_CARRIL = 30;

  var grupos = {};
  (listaRegistrosGlobal || []).forEach(function (r, idx) {
    var ini = fechaMS(r.fechaInicio);
    var fin = fechaMS(r.fechaFin);
    if (ini === null || fin === null) return;
    if (fin < minMS || ini > maxMS) return;
    var claves = personasDelRegistro(r);
    if (!claves.length) claves = ["Sin asignar"];
  claves.forEach(function (clave) {
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push({ r: r, idx: idx, ini: ini, fin: fin, carril: 0 });
    });
  });

  var claves = Object.keys(grupos).sort(function (a, b) {
    if (a === "Sin asignar") return 1;
    if (b === "Sin asignar") return -1;
    var al = a.toLowerCase();
    var bl = b.toLowerCase();
    return al < bl ? -1 : al > bl ? 1 : 0;
  });

  if (!claves.length) {
    if (rango) rango.textContent = "";
    cuerpo.innerHTML = '<div class="text-center text-muted p-4">Sin comisiones en el período elegido.</div>';
    return;
  }

  claves.forEach(function (clave) {
    var viajes = grupos[clave];
    viajes.sort(function (a, b) { return a.ini - b.ini || a.fin - b.fin; });
    var fines = [];
    viajes.forEach(function (t) {
      var carril = 0;
      while (carril < fines.length && !(fines[carril] < t.ini)) carril++;
      t.carril = carril;
      fines[carril] = Math.max(fines[carril] === undefined ? -1 : fines[carril], t.fin);
    });
    viajes._carriles = Math.max(1, fines.length);
  });

  var totalDias = Math.round((maxMS - minMS) / DIA) + 1;
  var paso = totalDias > 180 ? 30 : totalDias > 90 ? 14 : totalDias > 60 ? 7 : totalDias > 31 ? 3 : totalDias > 14 ? 2 : 1;

  function pos(ms) { return ((ms - minMS) / DIA) / totalDias * 100; }
  function ancho(ms1, ms2) { return Math.max((((ms2 - ms1) / DIA) + 1) / totalDias * 100, 1.5); }

  var ticks = "";
  for (var d = 0; d < totalDias; d += paso) {
    var t = new Date(minMS + d * DIA);
    ticks += '<span class="gantt-tick" style="left:' + (d / totalDias * 100) + '%">' +
      ("0" + t.getDate()).slice(-2) + "/" + ("0" + (t.getMonth() + 1)).slice(-2) + "</span>";
  }

  var hoyMS = fechaMS(hoyISO);
  var hoyHTML = "";
  var hoyEje = "";
  if (hoyMS !== null && hoyMS >= minMS && hoyMS <= maxMS) {
    var pctHoy = pos(hoyMS);
    var ajusteHoy = pctHoy < 7 ? "translate(0,0)" : pctHoy > 93 ? "translate(-100%,0)" : "translate(-50%,0)";
    var fh = new Date(hoyMS);
    hoyHTML = '<div class="gantt-hoy" style="left:' + pctHoy + '%" title="Hoy"></div>';
    hoyEje = '<span class="gantt-hoy-etiqueta" style="left:' + pctHoy + "%;transform:" + ajusteHoy + '">HOY ' +
      ("0" + fh.getDate()).slice(-2) + "/" + ("0" + (fh.getMonth() + 1)).slice(-2) + "</span>";
  }

  var fondo = (100 / totalDias) + "%";

  var extras = "";
  var detalleFino = totalDias <= 62;

  if (detalleFino) {
    for (var gd = 0; gd < totalDias; gd++) {
      var gms = minMS + gd * DIA;
      var gfecha = new Date(gms);
      if (gfecha.getDay() === 6) {
        var anchoFin = Math.min(2, totalDias - gd) / totalDias * 100;
        extras += '<div class="gantt-fin" style="left:' + (gd / totalDias * 100) +
          "%;width:" + anchoFin + '%"></div>';
      }
      if (gfecha.getDate() === 1) {
        extras += '<div class="gantt-mes" style="left:' + (gd / totalDias * 100) + '%"></div>';
      }
    }
  } else {
    var mCursor = minMS;
    var mi = 0;
    while (mCursor <= maxMS) {
      var md = new Date(mCursor);
      var proxMes = new Date(md.getFullYear(), md.getMonth() + 1, 1).getTime();
      var iniBanda = Math.max(mCursor, minMS);
      var finBanda = Math.min(proxMes, maxMS + DIA);
      if (mi % 2 === 1 && finBanda > iniBanda) {
        extras += '<div class="gantt-mes-fondo" style="left:' + ((iniBanda - minMS) / DIA) / totalDias * 100 +
          "%;width:" + ((finBanda - iniBanda) / DIA) / totalDias * 100 + '%"></div>';
      }
      mCursor = proxMes;
      mi++;
    }
  }

  var html = '<div class="gantt-fila gantt-eje"><div class="gantt-etiqueta"></div>' +
    '<div class="gantt-pista gantt-pista-eje">' + ticks + extras + hoyEje + "</div></div>";

  var totalViajes = 0;

  claves.forEach(function (clave) {
    var viajes = grupos[clave];
    totalViajes += viajes.length;
    var multi = viajes._carriles > 1;

    var gmin = Math.min.apply(null, viajes.map(function (t) { return t.ini; }));
    var gmax = Math.max.apply(null, viajes.map(function (t) { return t.fin; }));

    var etiqueta = clave === "Sin asignar" ? "Sin asignar" : escapeHTML(clave);
    html += '<div class="gantt-fila"><div class="gantt-etiqueta">' +
      '<div class="fw-bold text-truncate">' + etiqueta +
      (multi ? ' <i class="fa-solid fa-triangle-exclamation text-danger ms-1" title="Viajes superpuestos en fechas"></i>' : "") + "</div>" +
      '<div class="text-muted text-truncate"><small>' + viajes.length +
      (viajes.length === 1 ? " viaje" : " viajes") + " · " +
      formatearFechaLatina(isoDesdeMS(gmin)) + " → " + formatearFechaLatina(isoDesdeMS(gmax)) +
      "</small></div></div>" +
      '<div class="gantt-pista" style="background-size:' + fondo + " 100%;height:" +
      (viajes._carriles * ALTO_CARRIL + 14) + 'px">' + hoyHTML + extras;

    viajes.forEach(function (t) {
      var r = t.r;
      var com = escapeHTML(r.nombreComision || "Sin comisión");
      var detalle = escapeHTML(clave) + " · " + com + " — " + formatearFechaLatina(r.fechaInicio) +
        " → " + formatearFechaLatina(r.fechaFin) + " (" + (r.cantidadDias || "?") +
        " días) · " + (r.estado || "") + " · " + escapeHTML(r.motivo || "");

      html += '<div class="gantt-barra gantt-barra-carril ' + claseGantt(r.estado) +
        (multi ? " gantt-superpuesta" : "") + '" style="left:' + pos(t.ini) +
        "%;width:" + ancho(t.ini, t.fin) + ";top:" + (7 + t.carril * ALTO_CARRIL) + 'px" title="' +
        detalle.replace(/"/g, "&quot;") + '" onclick="verDetalle(' + t.idx + ')"><span>' +
        com + "</span></div>";
    });

    html += "</div></div>";
  });

  cuerpo.innerHTML = html;
  if (rango) {
    rango.textContent = formatearFechaLatina(isoDesdeMS(minMS)) + " → " +
      formatearFechaLatina(isoDesdeMS(maxMS)) + " · " + claves.length +
      (claves.length === 1 ? " persona" : " personas") + " · " + totalViajes +
      (totalViajes === 1 ? " comisión" : " comisiones");
  }
}

var detalleIdx = null;

function filaDetalle(etiqueta, valorHTML, ancho) {
  return '<div class="' + (ancho || "col-md-6 col-lg-4") + ' detalle-item">' +
    '<div class="detalle-etiqueta">' + etiqueta + "</div>" +
    '<div class="detalle-valor">' + (valorHTML || "-") + "</div></div>";
}

function enlaceInforme(url, texto) {
  if (!url) return '<span class="text-muted">-</span>';
  return '<a href="' + escapeHTML(url) + '" target="_blank" rel="noopener">' +
    '<i class="fa-solid fa-file-arrow-down me-1"></i>' + texto + "</a>";
}

function verDetalle(idx) {
  var item = listaRegistrosGlobal[idx];
  if (!item) return;

  if (!(window.bootstrap && bootstrap.Modal)) {
    cargarParaEditar(idx);
    return;
  }

  detalleIdx = idx;

  document.getElementById("modalDetalleTitulo").innerHTML =
    '<i class="fa-solid fa-circle-info me-2"></i>' +
    escapeHTML(item.nombreComision || "Comisión") +
    ' <small class="titulo-secundario">' + escapeHTML(item.apellido) + ", " + escapeHTML(item.nombre) + "</small>";

  var html = '<div class="row g-3">' +
    filaDetalle("Estado", '<span class="badge ' + badgeEstado(item.estado) + '">' + escapeHTML(item.estado || "-") + "</span>") +
    filaDetalle("Tipo", '<span class="badge ' + (item.tipo === "Nacional" ? "badge-nacional" : "badge-internacional") + '">' + escapeHTML(item.tipo || "-") + "</span>") +
    filaDetalle("Jerarquía", escapeHTML(item.jerarquia)) +
    filaDetalle("Apellido", escapeHTML(item.apellido)) +
    filaDetalle("Nombre", escapeHTML(item.nombre)) +
    filaDetalle("DNI", escapeHTML(item.dni)) +
    filaDetalle("Nombre comisión", escapeHTML(item.nombreComision), "col-12") +
    filaDetalle("Motivo / Actividad", escapeHTML(item.motivo), "col-12") +
    filaDetalle("Acompañantes", textoAcompanantes(item), "col-12") +
    filaDetalle("Fecha de inicio", formatearFechaLatina(item.fechaInicio)) +
    filaDetalle("Fecha de fin", formatearFechaLatina(item.fechaFin)) +
    filaDetalle("Cantidad de días", escapeHTML(item.cantidadDias)) +
    filaDetalle("País", escapeHTML(item.pais)) +
    filaDetalle("Ciudad", escapeHTML(item.ciudad)) +
    filaDetalle("N° expediente / Informe", escapeHTML(item.expediente), "col-md-6 col-lg-8") +
    filaDetalle("Gastos a cargo PNA", '<span class="badge ' + (item.gastosPna === "SI" ? "bg-warning text-dark" : "bg-secondary") + '">' + escapeHTML(item.gastosPna || "-") + "</span>") +
    filaDetalle("Informe de inicio", enlaceInforme(item.adjuntoInicio, "Ver informe")) +
    filaDetalle("Informe de cierre", enlaceInforme(item.adjuntoFin, "Ver informe")) +
    filaDetalle("Google Calendar", item.eventoId
      ? '<span class="badge bg-success"><i class="fa-solid fa-calendar-check me-1"></i>Sincronizado</span>'
      : '<span class="text-muted">No sincronizado</span>') +
    "</div>";

  document.getElementById("modalDetalleCuerpo").innerHTML = html;

  var modalEl = document.getElementById("modalDetalle");
  var instancia = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  instancia.show();
}

document.getElementById("btnModalEditar").addEventListener("click", function () {
  var modalEl = document.getElementById("modalDetalle");
  if (window.bootstrap && bootstrap.Modal) {
    var instancia = bootstrap.Modal.getInstance(modalEl);
    if (instancia) instancia.hide();
  }
  if (detalleIdx !== null) cargarParaEditar(detalleIdx);
});

function badgeEstado(estado) {
  switch (estado) {
    case "Planificada": return "bg-secondary";
    case "En curso": return "bg-primary";
    case "Finalizada": return "bg-success";
    case "Cancelada": return "bg-danger";
    default: return "bg-secondary";
  }
}

function cargarParaEditar(index) {
  var item = listaRegistrosGlobal[index];
  if (!item) return;

  document.getElementById("registroId").value = item.id || "";
  document.getElementById("fechaInicio").value = item.fechaInicio || "";
  document.getElementById("fechaFin").value = item.fechaFin || "";
  document.getElementById("cantidadDias").value = item.cantidadDias || "";
  document.getElementById("tipo").value = item.tipo || "Internacional";
  document.getElementById("estado").value = item.estado || "Planificada";
  document.getElementById("jerarquia").value = item.jerarquia || "";
  document.getElementById("dni").value = item.dni || "";
  document.getElementById("apellido").value = item.apellido || "";
  document.getElementById("nombre").value = item.nombre || "";
  document.getElementById("nombreComision").value = item.nombreComision || "";
  document.getElementById("motivo").value = item.motivo || "";
  document.getElementById("pais").value = item.pais || "";
  document.getElementById("ciudad").value = item.ciudad || "";
  document.getElementById("expediente").value = item.expediente || "";
  document.getElementById("gastosPna").value = item.gastosPna || "NO";
  document.getElementById("enviarCalendario").checked = !!item.eventoId;

  document.getElementById("adjuntoInicio").value = "";
  document.getElementById("adjuntoFin").value = "";
  mostrarAdjunto("infoAdjInicio", item.adjuntoInicio, "Inicio");
  mostrarAdjunto("infoAdjFin", item.adjuntoFin, "Fin");

  limpiarAcompanantes();
  (item.acompanantes || []).forEach(function (a) { agregarAcompanante(a); });

  document.getElementById("tituloFormulario").innerHTML = '<i class="fa-solid fa-pen-to-square me-2"></i> Editar Comisión';
  document.getElementById("btnGuardar").innerHTML = '<i class="fa-solid fa-arrows-rotate me-1"></i> Actualizar Registro';
  document.getElementById("btnGuardar").className = "btn btn-warning btn-custom";
  document.getElementById("btnCancelarEdicion").classList.remove("d-none");

  abrirPanel();
}

function cancelarEdicion() {
  requestIdActual = generarRequestId();

  var btnGuardar = document.getElementById("btnGuardar");
  btnGuardar.disabled = false;
  btnGuardar.classList.remove("is-loading");
  delete btnGuardar.dataset.etiquetaOriginal;

  document.getElementById("formRegistro").reset();
  document.getElementById("registroId").value = "";
  document.getElementById("fechaInicio").value = new Date().toISOString().split("T")[0];
  document.getElementById("fechaFin").value = new Date().toISOString().split("T")[0];
  document.getElementById("estado").value = "Planificada";
  document.getElementById("gastosPna").value = "NO";
  document.getElementById("enviarCalendario").checked = true;

  document.getElementById("adjuntoInicio").value = "";
  document.getElementById("adjuntoFin").value = "";
  mostrarAdjunto("infoAdjInicio", "", "Inicio");
  mostrarAdjunto("infoAdjFin", "", "Fin");
  limpiarAcompanantes();
  calcularDias();

  document.getElementById("tituloFormulario").innerHTML = '<i class="fa-solid fa-plus-circle me-2"></i> Nueva Comisión / Viaje';
  btnGuardar.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i> Guardar Registro';
  btnGuardar.className = "btn btn-success btn-custom";
  document.getElementById("btnCancelarEdicion").classList.add("d-none");
}

function confirmarEliminar(id) {
  if (typeof Swal !== "undefined") {
    Swal.fire({
      title: "¿Confirmar eliminación?",
      text: "Registro " + id + ". Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    }).then(function (result) {
      if (result.isConfirmed) procederEliminar(id);
    });
  } else if (confirm("¿Eliminar el registro " + id + "?")) {
    procederEliminar(id);
  }
}

function procederEliminar(id) {
  llamarAPI("eliminar", { id: id })
    .then(function (res) {
      if (res && res.exito) {
        if (res.advertencia) {
          notificar("warning", "Eliminado con advertencia", res.mensaje);
        } else {
          notificarExito(res.mensaje || "Registro eliminado");
        }
        recargarDatos();
      } else {
        notificar("error", "Error", (res && res.mensaje) || "No se pudo eliminar");
      }
    })
    .catch(function (err) {
      notificar("error", "Error del servidor", err.message);
    });
}

window.onload = function () {
  marcarKpi();
  recargarDatos();
};

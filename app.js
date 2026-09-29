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
    enviarCalendario: document.getElementById("enviarCalendario").checked
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

function limpiarFiltros() {
  document.getElementById("buscarTexto").value = "";
  document.getElementById("buscarTipo").value = "Todos";
  document.getElementById("buscarEstado").value = "Todos";
  document.getElementById("fechaDesde").value = "";
  document.getElementById("fechaHasta").value = "";
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
    tipo: document.getElementById("buscarTipo").value,
    estado: document.getElementById("buscarEstado").value,
    fechaDesde: document.getElementById("fechaDesde").value,
    fechaHasta: document.getElementById("fechaHasta").value
  };
}

["buscarTexto", "buscarTipo", "buscarEstado", "fechaDesde", "fechaHasta"].forEach(function (id) {
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

function filtrarLocal() {
  var c = criterioBusqueda();
  var texto = (c.texto || "").trim().toLowerCase();

  return todosRegistros.filter(function (r) {
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
    return;
  }

  dibujarPagina();
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

    tr.innerHTML = [
      '<td><span class="badge ' + badgeEstado(item.estado) + '">' + escapeHTML(item.estado || "-") + "</span>" +
        (item.eventoId ? ' <i class="fa-solid fa-calendar-check text-success ms-1" title="Sincronizado con Google Calendar"></i>' : "") + "</td>",
      '<td><span class="badge ' + badgeTipo(item.tipo) + '">' + escapeHTML(item.tipo || "-") + "</span></td>",
      "<td>" + personal + jerarquia + "</td>",
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

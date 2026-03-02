/* --- CONFIGURACIÓN Y VARIABLES --- */
// 1. Despliega backend.gs como "Web App" en Google Apps Script
// 2. Copia la URL generada y pégala aquí:
const GOOGLE_SCRIPT_URL = "URL_DE_TU_SCRIPT_AQUI";

// 3. Publica tu Google Sheet como CSV (Archivo -> Compartir -> Publicar en la Web -> CSV)
// 4. Pega las URLs de las pestañas de Nodos y Relaciones aquí:
const URL_NODOS = "URL_DE_NODOS_CSV_AQUI";
const URL_RELACIONES = "URL_DE_RELACIONES_CSV_AQUI";
const PROXY = "https://corsproxy.io/?";

const colors = {
  fondo_publico: '#81B29A', persona: '#E9C46A', fundacion: '#A2D2FF',
  corporacion: '#A2D2FF', espacio_comercial: '#E07A5F', espacio_privado: '#E07A5F',
  espacio_no_comercial: '#E76F51', estado: '#F2CC8F', premio: '#DBF4A7',
  gremio: '#9B5DE5', otro: '#888'
};

var nodes = new vis.DataSet([]);
var edges = new vis.DataSet([]);
var network = null;
var allNodesRaw = []; // Datos crudos de Google Sheets
var editMode = false;

/* --- INICIALIZACIÓN --- */
function init() {
  const pN = PROXY + encodeURIComponent(URL_NODOS);
  const pR = PROXY + encodeURIComponent(URL_RELACIONES);

  Promise.all([
    fetch(pN).then(r => r.text()),
    fetch(pR).then(r => r.text())
  ]).then(([txtNodos, txtRel]) => {

    let parsedN = Papa.parse(txtNodos, {header:true, skipEmptyLines:true}).data;
    allNodesRaw = parsedN.filter(x => x.id);

    let cleanN = allNodesRaw.map(n => formatNode(n));
    nodes.add(cleanN);
    buildFilters(cleanN);

    let parsedR = Papa.parse(txtRel, {header:true, skipEmptyLines:true}).data;
    let cleanE = parsedR.filter(x => x.from && x.to).map(e => styleEdge(e));
    edges.add(cleanE);

    drawMap();
    document.getElementById('loading-screen').style.display = 'none';

  }).catch(e => {
      console.error(e);
      alert("Error de conexión. Verifica tu internet.");
  });
}

function formatNode(n) {
  let grp = n.group || 'otro';
  let col = colors[grp] || '#888';
  let shape = (grp === 'persona') ? 'circularImage' : (grp==='gremio'?'diamond':'box');
  let img = (grp === 'persona' && !n.image) ? `https://ui-avatars.com/api/?name=${n.label}&background=${col.replace('#','')}&color=000` : n.image;

  return {
    id: n.id, label: n.label, group: grp, shape: shape, image: img,
    color: { background: col, border: col },
    value: parseInt(n.val_size) || 25,
    title: n.label,
    // Guardar campos extra para el panel de detalles
    bio: n.bio || "",
    url: n.url || ""
  };
}

function styleEdge(e) {
  let color='#666', dashes=false, arrows='to';
  if(e.relation_type === 'financiamiento') { color='#4CAF50'; dashes=[5,5]; }
  else if(e.relation_type === 'comercial') { color='#9C27B0'; }
  else if(e.relation_type === 'pareja') { color='#fff'; arrows=false; }
  else if(e.relation_type === 'ex_pareja') { color='#fff'; arrows=false; dashes=[2,2]; }
  return { from: e.from, to: e.to, label: e.label, relation_type: e.relation_type, color:{color:color}, dashes:dashes, arrows:arrows };
}

function drawMap() {
  var container = document.getElementById('ecosistema-vis');
  var data = { nodes: nodes, edges: edges };
  var options = {
    nodes: { borderWidth:2, shadow:true, font:{color:'white', strokeWidth:3, strokeColor:'black'} },
    edges: { font: { color: '#ccc', size: 10, strokeWidth: 0, align: 'middle' } },
    physics: {
        enabled: true,
        forceAtlas2Based: {
            gravitationalConstant: -100,
            springLength: 200,
            springConstant: 0.08,
            avoidOverlap: 1
        },
        solver:'forceAtlas2Based',
        stabilization: {
            enabled: true,
            iterations: 200,
            updateInterval: 25
        }
    },
    interaction: { hover:true, navigationButtons:true, multiselect: true },
    manipulation: {
      enabled: false,
      addEdge: function(data, callback) {
        if(data.from == data.to) { callback(null); return; }
        openEditor(data, callback);
      }
    }
  };
  network = new vis.Network(container, data, options);

  // Eventos de red
  network.on("selectNode", (params) => showDetails(params.nodes[0]));
  network.on("deselectNode", () => closeDetails());

  // Doble clic para agrupar
  network.on("doubleClick", function(params) {
      if (params.nodes.length == 1) {
          if (network.isCluster(params.nodes[0]) == true) {
              network.openCluster(params.nodes[0]);
          } else {
              var hubId = params.nodes[0];
              network.cluster({
                  joinCondition: function(child) {
                      return network.getConnectedNodes(child.id).includes(hubId) && child.group === 'persona';
                  },
                  clusterNodeProperties: {id:'cluster:'+hubId, borderWidth:3, shape:'dot', color:'#E9C46A', label:'Grupo', size:40}
              });
          }
      }
  });
}

/* --- UI: DETALLES --- */
function showDetails(nodeId) {
  const node = nodes.get(nodeId);
  const sidebar = document.getElementById('sidebar-right');
  const content = document.getElementById('details-content');
  const controls = document.getElementById('edit-controls');

  sidebar.classList.add('visible');

  content.innerHTML = `
    ${node.image ? `<img src="${node.image}" alt="${node.label}">` : ''}
    <div class="meta-field">
        <div class="meta-label">Nombre</div>
        <div class="meta-value" style="font-weight:bold; font-size:18px;">${node.label}</div>
    </div>
    <div class="meta-field">
        <div class="meta-label">Categoría</div>
        <div class="meta-value">${node.group.replace('_',' ')}</div>
    </div>
    ${node.bio ? `
    <div class="meta-field">
        <div class="meta-label">Biografía / Notas</div>
        <div class="meta-value">${node.bio}</div>
    </div>` : ''}
    ${node.url ? `
    <div class="meta-field">
        <div class="meta-label">Link</div>
        <div class="meta-value"><a href="${node.url}" target="_blank" style="color:#E9C46A;">Ver más <i class="fa-solid fa-external-link"></i></a></div>
    </div>` : ''}

    <div style="margin-top:20px; display:flex; gap:10px;">
        <button class="btn" style="flex:1" onclick="focusMode('${nodeId}')" id="btn-focus"><i class="fa-solid fa-expand"></i> Aislar</button>
        <button class="btn" style="flex:1" onclick="focusNode('${nodeId}')"><i class="fa-solid fa-crosshairs"></i> Centrar</button>
    </div>
  `;

  if(editMode) {
    controls.style.display = 'block';
    controls.innerHTML = `
        <button class="btn" style="width:100%; margin-bottom: 10px; background: #E9C46A; color: black;" onclick="openEditNodePopup('${nodeId}')">
            <i class="fa-solid fa-pen-to-square"></i> Editar Datos
        </button>
        <button class="btn danger" style="width:100%" onclick="deleteNodePrompt(event, '${nodeId}')">
            <i class="fa-solid fa-trash"></i> Eliminar Nodo
        </button>
        <div style="margin-top: 10px; font-size: 10px; color: #666; text-align: center;">
          ID: ${nodeId}
        </div>
    `;
  } else {
    controls.style.display = 'none';
  }
}

function closeDetails() {
  document.getElementById('sidebar-right').classList.remove('visible');
}

function focusNode(nodeId) {
    network.focus(nodeId, {scale:1.2, animation:true});
}

var originalData = null;
function focusMode(nodeId) {
    const btn = document.getElementById('btn-focus');

    if (originalData) {
        // Restaurar
        nodes.clear();
        edges.clear();
        nodes.add(originalData.nodes);
        edges.add(originalData.edges);
        originalData = null;
        btn.innerHTML = '<i class="fa-solid fa-expand"></i> Aislar';
        btn.classList.remove('active');
        return;
    }

    // Aislar
    originalData = {
        nodes: nodes.get(),
        edges: edges.get()
    };

    const connectedNodes = network.getConnectedNodes(nodeId);
    connectedNodes.push(nodeId);

    const neighborhoodNodes = nodes.get(connectedNodes);
    const neighborhoodEdges = edges.get().filter(e =>
        connectedNodes.includes(e.from) && connectedNodes.includes(e.to)
    );

    nodes.clear();
    edges.clear();
    nodes.add(neighborhoodNodes);
    edges.add(neighborhoodEdges);

    btn.innerHTML = '<i class="fa-solid fa-compress"></i> Restaurar';
    btn.classList.add('active');
    network.fit();
}

/* --- MODO EDICIÓN --- */
function toggleEditMode() {
  let btn = document.getElementById('btn-mode');
  let btnAdd = document.getElementById('btn-add-node');
  editMode = !editMode;

  if(!editMode) {
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fa-solid fa-pen-nib"></i> Modo Edición';
    btnAdd.style.display = 'none';
    network.disableEditMode();
  } else {
    btn.classList.add('active');
    btn.innerHTML = '<i class="fa-solid fa-stop"></i> Terminar';
    btnAdd.style.display = 'flex';
    network.addEdgeMode();
  }
}

function openEditor(edgeData, callback) {
  document.getElementById('popup-title').innerText = "Nueva Relación";
  document.getElementById('relation-fields').style.display = 'block';
  document.getElementById('node-fields').style.display = 'none';
  document.getElementById('editor-popup').style.display = 'block';
  document.getElementById('btn-save').onclick = function() {
    saveRelation(edgeData, callback);
  };
}

function openAddNodePopup() {
    document.getElementById('popup-title').innerText = "Nuevo Nodo";
    document.getElementById('relation-fields').style.display = 'none';
    document.getElementById('node-fields').style.display = 'block';
    document.getElementById('editor-popup').style.display = 'block';

    // Reset fields
    document.getElementById('node-label').value = "";
    document.getElementById('node-bio').value = "";
    document.getElementById('node-url').value = "";

    document.getElementById('btn-save').onclick = saveNode;
}

function openEditNodePopup(nodeId) {
    const node = nodes.get(nodeId);
    document.getElementById('popup-title').innerText = "Editar Nodo";
    document.getElementById('relation-fields').style.display = 'none';
    document.getElementById('node-fields').style.display = 'block';
    document.getElementById('editor-popup').style.display = 'block';

    // Fill fields
    document.getElementById('node-label').value = node.label;
    document.getElementById('node-group').value = node.group;
    document.getElementById('node-bio').value = node.bio || "";
    document.getElementById('node-url').value = node.url || "";

    document.getElementById('btn-save').onclick = function() {
        updateNode(nodeId);
    };
}

function closePopup() {
  document.getElementById('editor-popup').style.display = 'none';
  if(editMode) network.addEdgeMode();
}

function saveNode() {
    let label = document.getElementById('node-label').value;
    let group = document.getElementById('node-group').value;
    let bio = document.getElementById('node-bio').value;
    let url = document.getElementById('node-url').value;
    let btn = document.getElementById('btn-save');

    if(!label) return alert("El nombre es obligatorio");

    btn.innerHTML = "Guardando...";
    btn.disabled = true;

    fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: "addNode",
            label: label,
            group: group,
            bio: bio,
            url: url
        })
    }).then(() => {
        showToast("Nodo creado. Recarga para ver cambios.");
        closePopup();
        btn.innerHTML = "GUARDAR";
        btn.disabled = false;
    }).catch(err => {
        alert("Error: " + err);
        btn.innerHTML = "GUARDAR";
        btn.disabled = false;
    });
}

function updateNode(nodeId) {
    let label = document.getElementById('node-label').value;
    let group = document.getElementById('node-group').value;
    let bio = document.getElementById('node-bio').value;
    let url = document.getElementById('node-url').value;
    let btn = document.getElementById('btn-save');

    if(!label) return alert("El nombre es obligatorio");

    btn.innerHTML = "Actualizando...";
    btn.disabled = true;

    fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: "updateNode",
            id: nodeId,
            label: label,
            group: group,
            bio: bio,
            url: url
        })
    }).then(() => {
        showToast("Nodo actualizado. Recarga para ver cambios.");

        // Actualizar localmente para feedback inmediato
        let updatedNode = formatNode({
            id: nodeId,
            label: label,
            group: group,
            bio: bio,
            url: url
        });
        nodes.update(updatedNode);
        showDetails(nodeId); // Refrescar panel lateral

        closePopup();
        btn.innerHTML = "GUARDAR";
        btn.disabled = false;
    }).catch(err => {
        alert("Error: " + err);
        btn.innerHTML = "GUARDAR";
        btn.disabled = false;
    });
}

function saveRelation(edgeData, callback) {
  let type = document.getElementById('rel-type').value;
  let label = document.getElementById('rel-label').value;
  let btn = document.getElementById('btn-save');

  btn.innerHTML = "Guardando...";
  btn.disabled = true;

  const payload = {
    action: "addEdge",
    from: edgeData.from,
    to: edgeData.to,
    label: label,
    type: type
  };

  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  }).then(() => {
    document.getElementById('editor-popup').style.display = 'none';
    btn.innerHTML = "GUARDAR";
    btn.disabled = false;
    showToast();

    edgeData.label = label;
    edgeData.relation_type = type;
    callback(styleEdge(edgeData));
  }).catch(err => {
    alert("Error al guardar: " + err);
    btn.innerHTML = "GUARDAR";
    btn.disabled = false;
  });
}

/* --- FILTROS Y BÚSQUEDA --- */
function buildFilters(data) {
  const groups = [...new Set(data.map(n => n.group))];
  const container = document.getElementById('filters-container');
  container.innerHTML = "";

  groups.forEach(grp => {
    let color = colors[grp] || '#888';
    let div = document.createElement('div');
    div.className = 'filter-row';
    div.innerHTML = `
      <div class="checkbox checked" data-group="${grp}" onclick="toggleFilter(this)"><i class="fa-solid fa-check" style="font-size:10px;"></i></div>
      <span style="color:${color}">●</span>&nbsp; ${grp.toUpperCase().replace('_',' ')}
    `;
    container.appendChild(div);
  });
}

function toggleFilter(el) {
  el.classList.toggle('checked');
  let activeGroups = Array.from(document.querySelectorAll('.checkbox.checked'))
                          .map(c => c.getAttribute('data-group'));

  let finalNodes = allNodesRaw.filter(n => activeGroups.includes(n.group)).map(n => formatNode(n));
  nodes.clear();
  nodes.add(finalNodes);
}

function doSearch() {
  const term = document.getElementById('search').value.toLowerCase();
  const container = document.getElementById('search-results-container');
  container.innerHTML = "";

  if (!term || term.length < 2) {
    container.style.display = 'none';
    return;
  }

  const results = nodes.get({
    filter: (n) => n.label.toLowerCase().includes(term)
  }).slice(0, 10); // Limitar a 10 resultados para no saturar

  if (results.length > 0) {
    container.style.display = 'block';
    results.forEach(n => {
      const div = document.createElement('div');
      div.className = 'search-result-item';
      div.innerHTML = `<i class="fa-solid fa-location-dot" style="color:${n.color.background}"></i> ${n.label}`;
      div.onclick = () => {
        network.focus(n.id, { scale: 1.2, animation: true });
        network.selectNodes([n.id]);
        showDetails(n.id);
        container.style.display = 'none';
        document.getElementById('search').value = "";
      };
      container.appendChild(div);
    });
  } else {
    container.style.display = 'none';
  }
}

function showToast(message = "¡Guardado exitosamente!") {
  let toast = document.getElementById('toast');
  toast.innerHTML = `<i class="fa-solid fa-check"></i> ${message}`;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display='none', 4000);
}

function deleteNodePrompt(event, nodeId) {
  const pass = prompt("Ingresa la contraseña para ELIMINAR:");
  if (!pass) return;

  const btn = event.target.closest('button');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = "Eliminando...";
  btn.disabled = true;

  fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: "deleteNode",
      id: nodeId,
      password: pass
    })
  }).then(() => {
    nodes.remove(nodeId);
    // Eliminar también relaciones locales (vis-network lo hace si están vinculadas)
    const connectedEdges = edges.get().filter(e => e.from === nodeId || e.to === nodeId);
    edges.remove(connectedEdges.map(e => e.id));

    closeDetails();
    showToast("Nodo eliminado");
  }).catch(err => {
    alert("Error: " + err);
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  });
}

init();

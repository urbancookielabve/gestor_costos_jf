// ==== Diagnóstico ====
window.addEventListener('error', (e)=>console.error('JS error:', e.error||e.message||e));
window.addEventListener('unhandledrejection', (e)=>console.error('Promise rejection:', e.reason||e));

function uiAlert(msg){ try{ alert(msg); }catch{} }
function getProxyUrl(){ return localStorage.getItem('proxy_url') || ''; }

async function callGAS(fn, args){
  var PROXY_URL = getProxyUrl();
  if(!PROXY_URL) throw new Error('Configura el Proxy en la pestaña "Configuración".');
  var res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ fn: fn, args: args||{} })
  });
  var txt = await res.text();
  var json;
  try { json = JSON.parse(txt); } catch(e){ throw new Error('Respuesta no JSON del proxy: ' + txt.slice(0,160)); }
  if(!json.ok) throw new Error(json.error || 'Error en backend');
  return json.result;
}

function el(html){
  var d = document.createElement('div');
  d.innerHTML = (html||'').trim();
  return d.firstChild;
}

// ====== Productos ======
async function viewProductos(){
  var wrap = el(
    '<div>'
    + '<label>Nombre del producto</label>'
    + '<input id="p_name" />'
    + '<div class="row">'
      + '<div>'
        + '<label>Unidad de compra</label>'
        + '<select id="p_unit">'
          + '<option>kg</option><option>g</option><option>lt</option><option>ml</option><option>ud</option>'
        + '</select>'
      + '</div>'
      + '<div>'
        + '<label>Precio compra ($)</label>'
        + '<input id="p_price" type="number" step="0.0001" />'
      + '</div>'
    + '</div>'
    + '<button id="saveProduct">Guardar/Actualizar</button>'
    + '<div id="list"></div>'
    + '</div>'
  );

  wrap.querySelector('#saveProduct').addEventListener('click', async function(){
    var name  = wrap.querySelector('#p_name').value.trim();
    var unit  = wrap.querySelector('#p_unit').value;
    var price = parseFloat(wrap.querySelector('#p_price').value);
    if(!name || !unit || isNaN(price)) return uiAlert('Completa los campos');
    try{
      await callGAS('saveProduct', {name:name, unit:unit, price:price});
      uiAlert('Guardado');
      render('productos');
    }catch(e){ uiAlert(e.message); console.error(e); }
  });

  var list = wrap.querySelector('#list');
  list.innerHTML = '<div class="muted">Cargando...</div>';
  try{
    var items = await callGAS('listProducts');
    var html = '';
    for(var i=0;i<items.length;i++){
      var p = items[i];
      html += '<div class="card">'
            +   '<b>' + (p.name||'') + '</b>'
            +   '<div class="muted">Base: $' + Number(p.basePrice||0).toFixed(4) + ' por ' + (p.baseUnit||'') + '</div>'
            + '</div>';
    }
    list.innerHTML = html || '<div class="muted">Sin productos</div>';
  }catch(e){
    list.innerHTML = '<div class="muted">Error: ' + e.message + '</div>';
    console.error(e);
  }
  return wrap;
}

// ====== Recetas ======
function addRow(container, items){
  var row = el(
    '<div class="row3">'
    +  '<select class="ingredient"></select>'
    +  '<input class="qty" type="number" step="0.01" placeholder="Cantidad" />'
    +  '<select class="unit"><option>g</option><option>ml</option><option>ud</option></select>'
    +  '<input class="merma" type="number" step="1" min="0" max="99" placeholder="Merma %" />'
    + '</div>'
  );
  var sel = row.querySelector('.ingredient');
  var opts = '';
  for(var i=0;i<items.length;i++){
    var p = items[i];
    opts += '<option value="' + p.name + '">' + p.name + '</option>';
  }
  sel.innerHTML = opts;
  container.appendChild(row);
}

async function viewRecetas(){
  var wrap = el(
    '<div>'
    + '<label>Nombre de la receta</label>'
    + '<input id="r_name" />'
    + '<div id="items"></div>'
    + '<div style="display:flex; gap:8px; margin-top:8px;">'
      + '<button id="addRowBtn">+ Agregar ingrediente</button>'
      + '<button id="removeRowBtn">− Eliminar último</button>'
    + '</div>'
    + '<button id="saveRecipeBtn">Guardar receta</button>'
    + '<div class="muted">Merma % opcional. Se guarda por ingrediente.</div>'
    + '</div>'
  );

  var itemsBox = wrap.querySelector('#items');
  var products = await callGAS('listProducts');

  wrap.querySelector('#addRowBtn').addEventListener('click', function(){ addRow(itemsBox, products); });
  wrap.querySelector('#removeRowBtn').addEventListener('click', function(){ if(itemsBox.lastElementChild) itemsBox.removeChild(itemsBox.lastElementChild); });

  wrap.querySelector('#saveRecipeBtn').addEventListener('click', async function(){
    var name = wrap.querySelector('#r_name').value.trim();
    var rows = Array.prototype.slice.call(itemsBox.querySelectorAll('.row3'));
    var payload = [];
    for(var i=0;i<rows.length;i++){
      var r = rows[i];
      var ing = (r.querySelector('.ingredient')||{}).value || '';
      var qty = parseFloat((r.querySelector('.qty')||{}).value || 'NaN');
      var unit = (r.querySelector('.unit')||{}).value || 'g';
      var mermaPct = parseFloat((r.querySelector('.merma')||{}).value || '0');
      if(ing && !isNaN(qty) && qty>0){
        payload.push({ ingredient: ing, qty: qty, unit: unit, mermaPct: mermaPct });
      }
    }
    if(!name || !payload.length) return uiAlert('Nombre y al menos un ingrediente válido');
    try{
      await callGAS('saveRecipe', {name:name, items:payload});
      uiAlert('Receta guardada');
      render('recetas');
    }catch(e){ uiAlert(e.message); console.error(e); }
  });

  addRow(itemsBox, products);
  return wrap;
}

// ====== Exportar ======
async function viewExportar(){
  var wrap = el(
    '<div>'
    + '<div class="muted">Seleccione receta y exporte a PDF.</div>'
    + '<div class="row">'
      + '<div><label>Receta</label><select id="e_recipe"></select></div>'
      + '<div><label>&nbsp;</label><button id="goExport">Exportar PDF</button></div>'
    + '</div>'
    + '<div id="msg" class="card"></div>'
    + '</div>'
  );
  var sel = wrap.querySelector('#e_recipe');
  var msg = wrap.querySelector('#msg');
  var names = await callGAS('getRecipeNames');
  var opts = '';
  for(var i=0;i<names.length;i++){ opts += '<option>' + names[i] + '</option>'; }
  sel.innerHTML = opts;

  wrap.querySelector('#goExport').addEventListener('click', async function(){
    var name = sel.value;
    if(!name) return uiAlert('Elija receta');
    try{
      var res = await callGAS('exportRecipePdf', name);
      msg.innerHTML = 'PDF creado: <a href="' + res.url + '" target="_blank">Abrir en Drive</a>';
    }catch(e){ uiAlert(e.message); console.error(e); }
  });
  return wrap;
}

// ====== Cotizar ======
async function viewCotizar(){
  var wrap = el(
    '<div>'
    + '<div class="row">'
      + '<div><label>Receta</label><select id="q_recipe"></select></div>'
      + '<div><label>Margen %</label><input id="q_margin" type="number" step="1" value="60" /></div>'
    + '</div>'
    + '<button id="seeQuote">Ver cotización</button>'
    + '<div id="area"></div>'
    + '<button id="pdfQuote">Exportar PDF</button>'
    + '<div id="msg" class="card"></div>'
    + '</div>'
  );
  var sel = wrap.querySelector('#q_recipe');
  var area = wrap.querySelector('#area');
  var msg  = wrap.querySelector('#msg');
  var names = await callGAS('getRecipeNames');
  var opts = '';
  for(var i=0;i<names.length;i++){ opts += '<option>' + names[i] + '</option>'; }
  sel.innerHTML = opts;

  wrap.querySelector('#seeQuote').addEventListener('click', async function(){
    var name = sel.value;
    if(!name) return uiAlert('Elija receta');
    try{
      var d = await callGAS('getRecipeDetail', name);
      if(!d.items.length){ area.innerHTML = '<div class="muted">No hay ítems.</div>'; return; }
      var rows = '';
      for(var i=0;i<d.items.length;i++){
        var it = d.items[i];
        rows += '<tr>'
              +   '<td>' + it.ingredient + '</td>'
              +   '<td class="right">' + Number(it.qty).toFixed(2) + ' ' + it.unit + '</td>'
              +   '<td class="right">' + Number(it.mermaPct||0).toFixed(0) + '%</td>'
              +   '<td class="right">$' + Number(it.unitCost).toFixed(2) + '</td>'
              +   '<td class="right">$' + Number(it.total).toFixed(2) + '</td>'
              + '</tr>';
      }
      var cost = Number(d.total||0);
      var margin = parseFloat((wrap.querySelector('#q_margin')||{}).value || '0');
      var price = cost*(1+margin/100);
      area.innerHTML =
        '<div class="card">'
        + '<table>'
          + '<thead><tr>'
            + '<th>Ingrediente</th>'
            + '<th class="right">Cantidad</th>'
            + '<th class="right">Merma %</th>'
            + '<th class="right">Unit ($)</th>'
            + '<th class="right">Total ($)</th>'
          + '</tr></thead>'
          + '<tbody>' + rows + '</tbody>'
        + '</table>'
        + '<div class="right gold" style="margin-top:8px;">'
          + 'Costo: $' + cost.toFixed(2) + ' • Precio sugerido: $' + price.toFixed(2)
        + '</div>'
        + '</div>';
    }catch(e){ uiAlert(e.message); console.error(e); }
  });

  wrap.querySelector('#pdfQuote').addEventListener('click', async function(){
    var name = sel.value;
    if(!name) return uiAlert('Elija receta');
    try{
      var res = await callGAS('exportRecipePdf', name);
      msg.innerHTML = 'PDF creado: <a href="' + res.url + '" target="_blank">Abrir en Drive</a>';
    }catch(e){ uiAlert(e.message); console.error(e); }
  });

  return wrap;
}

// ====== Config ======
function viewConfig(){
  var wrap = el(
    '<div>'
    + '<div class="card">'
      + '<div class="muted">Proxy Cloudflare Worker (URL completa)</div>'
      + '<input id="proxy" placeholder="https://tu-worker.workers.dev" />'
      + '<button id="saveProxy">Guardar URL del proxy</button>'
    + '</div>'
    + '<div class="muted">* La Web App de Apps Script se configura dentro del Worker para evitar CORS.</div>'
    + '</div>'
  );
  wrap.querySelector('#proxy').value = getProxyUrl();
  wrap.querySelector('#saveProxy').addEventListener('click', function(){
    var u = (wrap.querySelector('#proxy')||{}).value||'';
    u = (u||'').trim();
    if(!u) return uiAlert('Pega la URL del Worker');
    localStorage.setItem('proxy_url', u);
    uiAlert('Guardado');
  });
  return wrap;
}

// ====== Router ======
async function render(tab){
  var root = document.getElementById('root');
  root.innerHTML = '';
  try{
    if(tab==='productos') root.appendChild(await viewProductos());
    else if(tab==='recetas') root.appendChild(await viewRecetas());
    else if(tab==='exportar') root.appendChild(await viewExportar());
    else if(tab==='cotizar') root.appendChild(await viewCotizar());
    else if(tab==='config') root.appendChild(viewConfig());
    else root.appendChild(await viewProductos());
  }catch(e){
    console.error(e);
    root.innerHTML = '<div class="card">Error: ' + e.message + '</div>';
  }
}

// ====== Init ======
document.addEventListener('DOMContentLoaded', function(){
  var tabsBar = document.querySelector('.tabs');
  if(tabsBar){
    tabsBar.addEventListener('click', function(ev){
      var t = ev.target.closest('.tab');
      if(!t) return;
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(x){ x.classList.remove('active'); });
      t.classList.add('active');
      render(t.dataset.tab);
    });
  }
  render('productos');

  if('serviceWorker' in navigator){
    window.addEventListener('load', function(){ navigator.serviceWorker.register('./sw.js'); });
  }
});

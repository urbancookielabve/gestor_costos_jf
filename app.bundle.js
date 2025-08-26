// ======== Helpers de diagnóstico ========
window.addEventListener('error', (e) => {
  console.error('JS error:', e.error || e.message || e);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Promise rejection:', e.reason || e);
});

// ======== App ========
function uiAlert(msg) {
  try { alert(msg); } catch {}
}

function getProxyUrl() {
  return localStorage.getItem('proxy_url') || '';
}

async function callGAS(fn, args = {}) {
  const PROXY_URL = getProxyUrl();
  if (!PROXY_URL) throw new Error('Configura el Proxy en la pestaña "Configuración".');
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ fn, args })
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); }
  catch { throw new Error('Respuesta no JSON del proxy: ' + txt.slice(0,160)); }
  if (!json.ok) throw new Error(json.error || 'Error en backend');
  return json.result;
}

function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }

// ======== Vistas ========
async function viewProductos(){
  const wrap = el(`<div>
    <label>Nombre del producto</label><input id="p_name" />
    <div class="row">
      <div><label>Unidad de compra</label>
        <select id="p_unit"><option>kg</option><option>g</option><option>lt</option><option>ml</option><option>ud</option></select>
      </div>
      <div><label>Precio compra ($)</label><input id="p_price" type="number" step="0.0001" /></div>
    </div>
    <button id="saveProduct">Guardar/Actualizar</button>
    <div id="list"></div>
  </div>`);

  wrap.querySelector('#saveProduct').addEventListener('click', async () => {
    const name = wrap.querySelector('#p_name').value.trim();
    const unit = wrap.querySelector('#p_unit').value;
    const price = parseFloat(wrap.querySelector('#p_price').value);
    if(!name||!unit||isNaN(price)) return uiAlert('Completa los campos');
    try{
      await callGAS('saveProduct', {name, unit, price});
      uiAlert('Guardado');
      render('productos');
    }catch(e){ uiAlert(e.message); console.error(e); }
  });

  const list = wrap.querySelector('#list'); list.innerHTML = '<div class="muted">Cargando...</div>';
  try{
    const items = await callGAS('listProducts');
    list.innerHTML = items.map(p => `  <div class="card">    <b>${p.name}</b>    <div class="muted">      Base: $${Number(p.basePrice||0).toFixed(4)} por ${p.baseUnit}    </div>  </div>
`).join('');  }catch(e){ list.innerHTML = '<div class="muted">Error: '+e.message+'</div>'; console.error(e); }

  return wrap;
}

function addRow(container, items){
  const row = el(`<div class="row3">
    <select class="ingredient"></select>
    <input class="qty" type="number" step="0.01" placeholder="Cantidad" />
    <select class="unit"><option>g</option><option>ml</option><option>ud</option></select>
    <input class="merma" type="number" step="1" min="0" max="99" placeholder="Merma %" />
  </div>`);
  row.querySelector('.ingredient').innerHTML = items.map(p=><option value="${p.name}">${p.name}</option>).join('');
  container.appendChild(row);
}

async function viewRecetas(){
  const wrap = el(`<div>
    <label>Nombre de la receta</label><input id="r_name" />
    <div id="items"></div>
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button id="addRowBtn">+ Agregar ingrediente</button>
      <button id="removeRowBtn">− Eliminar último</button>
    </div>
    <button id="saveRecipeBtn">Guardar receta</button>
    <div class="muted">Merma % opcional. Se guarda por ingrediente.</div>
  </div>`);

  const itemsBox = wrap.querySelector('#items');
  const products = await callGAS('listProducts');

  wrap.querySelector('#addRowBtn').addEventListener('click', ()=> addRow(itemsBox, products));
  wrap.querySelector('#removeRowBtn').addEventListener('click', ()=> { if(itemsBox.lastElementChild) itemsBox.removeChild(itemsBox.lastElementChild); });

  wrap.querySelector('#saveRecipeBtn').addEventListener('click', async ()=> {
    const name = wrap.querySelector('#r_name').value.trim();
    const rows = [...itemsBox.querySelectorAll('.row3')];
    const payload = rows.map(r => ({
      ingredient: r.querySelector('.ingredient')?.value || '',
      qty: parseFloat(r.querySelector('.qty')?.value || 'NaN'),
      unit: r.querySelector('.unit')?.value || 'g',
      mermaPct: parseFloat(r.querySelector('.merma')?.value || '0')
    })).filter(x => x.ingredient && !isNaN(x.qty) && x.qty>0);
    if(!name || !payload.length) return uiAlert('Nombre y al menos un ingrediente válido');
    try{
      await callGAS('saveRecipe', {name, items:payload});
      uiAlert('Receta guardada');
      render('recetas');
    }catch(e){ uiAlert(e.message); console.error(e); }
  });

  // fila inicial
  addRow(itemsBox, products);
  return wrap;
}

async function viewExportar(){
  const wrap = el(`<div>
    <div class="muted">Seleccione receta y exporte a PDF.</div>
    <div class="row">
      <div><label>Receta</label><select id="e_recipe"></select></div>
      <div><label>&nbsp;</label><button id="goExport">Exportar PDF</button></div>
    </div>
    <div id="msg" class="card"></div>
  </div>`);
  const sel = wrap.querySelector('#e_recipe'), msg = wrap.querySelector('#msg');
  const names = await callGAS('getRecipeNames'); sel.innerHTML = names.map(n=><option>${n}</option>).join('');
  wrap.querySelector('#goExport').addEventListener('click', async ()=> {
    const name = sel.value; if(!name) return uiAlert('Elija receta');
    try{
      const res = await callGAS('exportRecipePdf', name);
      msg.innerHTML = PDF creado: <a href="${res.url}" target="_blank">Abrir en Drive</a>;
    }catch(e){ uiAlert(e.message); console.error(e); }
  });
  return wrap;
}

async function viewCotizar(){
  const wrap = el(`<div>
    <div class="row">
      <div><label>Receta</label><select id="q_recipe"></select></div>
      <div><label>Margen %</label><input id="q_margin" type="number" step="1" value="60" /></div>
    </div>
    <button id="seeQuote">Ver cotización</button>
    <div id="area"></div>
    <button id="pdfQuote">Exportar PDF</button>
    <div id="msg" class="card"></div>
  </div>`);
  const sel = wrap.querySelector('#q_recipe'), area=wrap.querySelector('#area'), msg=wrap.querySelector('#msg');
  const names = await callGAS('getRecipeNames'); sel.innerHTML = names.map(n=><option>${n}</option>).join('');
  wrap.querySelector('#seeQuote').addEventListener('click', async ()=> {
    const name = sel.value; if(!name) return uiAlert('Elija receta');
    try{
      const d = await callGAS('getRecipeDetail', name);
      if(!d.items.length) return area.innerHTML = '<div class="muted">No hay ítems.</div>';
      const rows = d.items.map(it => <tr><td>${it.ingredient}</td><td class="right">${Number(it.qty).toFixed(2)} ${it.unit}</td><td class="right">${Number(it.mermaPct||0).toFixed(0)}%</td><td class="right">$${Number(it.unitCost).toFixed(2)}</td><td class="right">$${Number(it.total).toFixed(2)}</td></tr>).join('');
      const cost = Number(d.total||0), margin = parseFloat(wrap.querySelector('#q_margin').value||'0'); const price = cost*(1+margin/100);
      area.innerHTML = <div class="card"><table><thead><tr><th>Ingrediente</th><th class="right">Cantidad</th><th class="right">Merma %</th><th class="right">Unit ($)</th><th class="right">Total ($)</th></tr></thead><tbody>${rows}</tbody></table><div class="right gold" style="margin-top:8px;">Costo: $${cost.toFixed(2)} • Precio sugerido: $${price.toFixed(2)}</div></div>;
    }catch(e){ uiAlert(e.message); console.error(e); }
  });
  wrap.querySelector('#pdfQuote').addEventListener('click', async ()=> {
    const name = sel.value; if(!name) return uiAlert('Elija receta');
    try{
      const res = await callGAS('exportRecipePdf', name);
      msg.innerHTML = PDF creado: <a href="${res.url}" target="_blank">Abrir en Drive</a>;
    }catch(e){ uiAlert(e.message); console.error(e); }
  });
  return wrap;
}

function viewConfig(){
  const wrap = el(`<div>
    <div class="card">
      <div class="muted">Proxy Cloudflare Worker (URL completa)</div>
      <input id="proxy" placeholder="https://tu-worker.workers.dev" />
      <button id="saveProxy">Guardar URL del proxy</button>
    </div>
    <div class="muted">* La Web App de Apps Script se configura dentro del Worker para evitar CORS.</div>
  </div>`);
  wrap.querySelector('#proxy').value = getProxyUrl();
  wrap.querySelector('#saveProxy').addEventListener('click', ()=> {
    const u = wrap.querySelector('#proxy').value.trim();
    if(!u) return uiAlert('Pega la URL del Worker');
    localStorage.setItem('proxy_url', u);
    uiAlert('Guardado');
  });
  return wrap;
}

// ======== Router simple ========
async function render(tab){
  const root = document.getElementById('root');
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
    root.innerHTML = <div class="card">Error: ${e.message}</div>;
  }
}

// ======== Init al cargar el DOM ========
document.addEventListener('DOMContentLoaded', () => {
  // Delegación para tabs (más robusta que capturar NodeList una vez)
  const tabsBar = document.querySelector('.tabs');
  if (tabsBar) {
    tabsBar.addEventListener('click', (ev) => {
      const t = ev.target.closest('.tab');
      if (!t) return;
      document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      render(t.dataset.tab);
    });
  }
  render('productos');

  // Service worker (ruta relativa para GitHub Pages)
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js'));
  }
});

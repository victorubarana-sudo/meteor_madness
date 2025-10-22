// ==============================
// METEOR MADNESS 
// Escola Legal - Prof Nilton
// Código explicado para estudar 
// ==============================

// === elementos ===
// Pegamos do HTML os elementos que vamos manipular.
// - tbody: onde as linhas da tabela serão inseridas
// - statusEl: um pequeno texto para mensagens de status
// - btnAtualizar / btnDiag: botões de ação
const tbody = document.querySelector('#tabela tbody');
const statusEl = document.getElementById('status');
const btnAtualizar = document.getElementById('btnAtualizar');
const btnDiag = document.getElementById('btnDiag');

// === consts ===
// Constantes do projeto:
// - AU_TO_KM: 1 AU (Unidade Astronômica) em quilômetros (≈ distância Terra–Sol)
// - API_KEY: chave pessoal da NASA 
// - LIMIT: máximo de linhas exibidas na tabela (filtro final)
const AU_TO_KM = 149_597_870;
const API_KEY = 'H7OJzgwP1h7Jqj2i1jlyBqFTOx564Cc2MMKM1Hvt'; // sua chave
const LIMIT = 50;

// ===== UI inicial =====
// Mostramos uma mensagem inicial dentro da tabela e no status,
// e garantimos que os botões se comportem como "button" (não submit).
tbody.innerHTML = "<tr><td colspan='4'>Clique em “Atualizar da NASA” para carregar os dados.</td></tr>";
statusEl.textContent = 'Pronto — aguardando clique no botão.';
btnAtualizar?.setAttribute('type','button');
btnDiag?.setAttribute('type','button');

// ===== Campo "Distância máx (AU)" inserido ao lado do botão =====
// Esta IIFE (função que roda imediatamente) cria um campo de entrada
// para o usuário definir um limite de distância em AU.
// O valor é salvo no localStorage para “lembrar” na próxima visita.
(function injectMaxDistField(){
  const saved = localStorage.getItem('maxAU');
  const initial = saved ? Number(saved) : 0.05; // padrão 0.05 AU (bem perto da Terra)
  const html = `
    <label id="lblMaxAU" style="display:inline-flex;align-items:center;gap:6px;margin-left:8px;">
      <span style="color:#333">Distância máx (AU):</span>
      <input id="maxDistAu" type="number" min="0.001" step="0.001" value="${initial}" style="width:90px;padding:4px 6px;border:1px solid #ccc;border-radius:6px;">
    </label>
  `;
  // Insere o campo logo após o botão Atualizar
  btnAtualizar?.insertAdjacentHTML('afterend', html);

  // Quando o usuário muda o valor, validamos e salvamos
  const input = document.getElementById('maxDistAu');
  input?.addEventListener('change', () => {
    let v = Number(input.value);
    if (!Number.isFinite(v) || v <= 0) v = 0.05;
    input.value = String(v);
    localStorage.setItem('maxAU', String(v));
  });
})();

// Função auxiliar: lê o valor atual do campo de distância.
// Se estiver inválido, volta para 0.05 AU.
function getMaxAU(){
  const el = document.getElementById('maxDistAu');
  const v = Number(el?.value);
  return (Number.isFinite(v) && v > 0) ? v : 0.05;
}

// ===== utilitários =====
// Pequenas funções de apoio:
// - nowStr: horário atual (para mostrar quando atualizamos)
// - setStatus: escreve uma mensagem na área de status
// - fmtDate: formata Date -> "YYYY-MM-DD"
// - winAroundToday: cria uma janela de datas (por padrão, ±2 dias a partir de hoje)
const nowStr = () => new Date().toLocaleTimeString('pt-BR');
const setStatus = (s) => statusEl.textContent = s;
const fmtDate = (d) => {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};
const winAroundToday = (days=2) => {
  const now=new Date(), a=new Date(now), b=new Date(now);
  a.setDate(now.getDate()-days); b.setDate(now.getDate()+days);
  return {start: fmtDate(a), end: fmtDate(b)};
};

// fetch com timeout (evita pendurar)
// Envolve o fetch nativo com um "timer": se a resposta demorar demais,
// cancelamos a tentativa para não travar a experiência do usuário.
async function fetchWithTimeout(url, ms=10000) {
  const ctrl = new AbortController();
  const t = setTimeout(()=> ctrl.abort(new Error('TIMEOUT')), ms);
  try { return await fetch(url, { signal: ctrl.signal, mode: 'cors' }); }
  finally { clearTimeout(t); }
}

// mapeia NeoWS -> [nome, data, distAU, v(km/s)]
// A API NeoWS retorna um JSON grande. Esta função:
// 1) passeia pelo objeto,
// 2) pega, para cada NEO, a primeira "close_approach_data",
// 3) extrai distância (em AU) e velocidade (km/s),
// 4) devolve no formato simples que a tabela espera.
function mapNeo(json) {
  const out = [];
  const neoByDate = json?.near_earth_objects || {};
  for (const [dateStr, list] of Object.entries(neoByDate)) {
    for (const neo of list) {
      const ca = neo.close_approach_data?.[0];
      if (!ca) continue; // sem aproximação registrada, pulamos

      const au = Number(ca.miss_distance?.astronomical ?? NaN);
      const v  = Number(ca.relative_velocity?.kilometers_per_second ?? NaN);
      if (!Number.isFinite(au) || !Number.isFinite(v)) continue;

      const name = neo.name;
      const cd   = ca.close_approach_date_full || ca.close_approach_date || dateStr;
      out.push([name, cd, String(au), String(v)]);
    }
  }

  // Primeiro filtramos pela distância máxima que o usuário escolheu
  const maxAU = getMaxAU();
  const filtered = out.filter(r => Number(r[2]) <= maxAU);

  // Depois ordenamos: por data (primeiro), e por distância (segundo)
  filtered.sort((a,b)=> new Date(a[1]) - new Date(b[1]) || Number(a[2]) - Number(b[2]));

  // Por fim, cortamos para não mostrar “dados demais” de uma vez
  return filtered.slice(0, LIMIT);
}

// renderRows: desenha a tabela
// Recebe um array de linhas [nome, data, distAU, v(km/s)]
// e cria o HTML das <tr> para colocar dentro do <tbody>.
function renderRows(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    tbody.innerHTML = "<tr><td colspan='4'>Sem resultados para os critérios atuais.</td></tr>";
    return;
  }
  tbody.innerHTML = rows.map(([nome, dataAU, auStr, vStr]) => {
    const distKm = Math.round(Number(auStr) * AU_TO_KM).toLocaleString('pt-BR'); // converte AU -> km para exibir
    const vRel   = Number(vStr).toFixed(2); // 2 casas decimais para a velocidade
    return `<tr>
      <td>${nome}</td><td>${dataAU}</td>
      <td style="text-align:right">${distKm}</td>
      <td style="text-align:right">${vRel}</td>
    </tr>`;
  }).join('');
}

// busca principal (NeoWS direto, sem proxy)
// Monta a URL com janela de datas e sua API key,
// faz o fetch com timeout, trata erros comuns,
// e por fim devolve os dados já mapeados e filtrados.
async function fetchNASA() {
  const {start, end} = winAroundToday(2); // hoje ± 2 dias
  const url = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${start}&end_date=${end}&api_key=${API_KEY}&_=${Date.now()}`;
  setStatus(`Buscando NeoWS… (${nowStr()})`);

  const r = await fetchWithTimeout(url, 10000);
  if (!r.ok) {
    const txt = await r.text().catch(()=> '');
    // 429 = estourou limite da chave (rate limit)
    if (r.status === 429 || txt.includes('OVER_RATE_LIMIT')) {
      throw new Error('Rate limit (429) da sua chave — aguarde ou reduza chamadas.');
    }
    throw new Error(`HTTP ${r.status} ${r.statusText}`);
  }

  const json = await r.json();
  return mapNeo(json);
}

// handler do botão “Atualizar da NASA”
// Desabilita o botão enquanto busca (evita cliques repetidos),
// chama a API, renderiza a tabela e mostra status amigável com horário.
async function onAtualizarClick() {
  if (!btnAtualizar || btnAtualizar.disabled) return;
  btnAtualizar.disabled = true;
  setStatus(`Atualizando… (${nowStr()})`);
  try {
    const rows = await fetchNASA();
    renderRows(rows);
    setStatus(`OK: ${rows.length} itens, máx ${getMaxAU()} AU — ${nowStr()}`);
  } catch (e) {
    alert(`❌ Não deu para carregar da NASA.\n\n${e.message || e}`);
    setStatus(`Falhou atualização — ${nowStr()}`);
  } finally {
    btnAtualizar.disabled = false;
  }
}

// binds (conecta botões às funções)
// Observação: no CodePen, o “Debug View” é o modo mais confiável para cliques.
btnAtualizar?.addEventListener('click', onAtualizarClick);

document.addEventListener('click', (ev) => {
  // fallback: se por algum motivo o primeiro listener falhar,
  // este captura cliques no documento e dispara a mesma ação
  if (ev.target && ev.target.id === 'btnAtualizar') onAtualizarClick();
});

// diagnóstico simples
// O botão “Testar conexão” roda a mesma busca e mostra quantos itens vieram.
btnDiag?.addEventListener('click', async () => {
  setStatus(`Diagnóstico… (${nowStr()})`);
  try {
    const rows = await fetchNASA();
    renderRows(rows);
    setStatus(`Diagnóstico OK (${rows.length} itens) — ${nowStr()}`);
  } catch (e) {
    setStatus(`Diagnóstico falhou — ${nowStr()}`);
    alert(`❌ Diagnóstico: ${e.message || e}`);
  }
});

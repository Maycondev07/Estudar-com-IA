const NIVEL_COLOR = { fraco: "var(--red)", medio: "var(--yellow)", bom: "var(--green)" };
const NIVEL_PCT = { fraco: 35, medio: 68, bom: 100 };
const NIVEL_SCORE = { fraco: 1, medio: 2, bom: 3 };
const NIVEL_LABEL = { fraco: "fraco", medio: "médio", bom: "bom" };

let currentUser = null;

(async function main() {
  currentUser = await getOptionalUser();
  renderNavbar("perfil", currentUser);

  if (!currentUser) {
    document.getElementById("perfil-content").innerHTML = loginGateHtml({
      mensagem: "Entre ou crie uma conta para ver seu perfil e a árvore de skills.",
      pagina: "perfil.html",
    });
    return;
  }

  Store.init(currentUser.id);

  const perfil = await Store.getPerfil();
  document.getElementById("p-nome").value = perfil.nome || "";
  document.getElementById("p-prova").value = perfil.prova_alvo || "";

  document.getElementById("p-nome").addEventListener("change", salvarPerfil);
  document.getElementById("p-prova").addEventListener("change", salvarPerfil);

  await renderStats();
  await renderTree();
  await renderEvolucao();
})();

async function salvarPerfil() {
  await Store.setPerfil({
    nome: document.getElementById("p-nome").value,
    prova_alvo: document.getElementById("p-prova").value,
  });
  renderTree(); // o nó central usa o nome, então atualiza a árvore também
}

// ---------- Estatísticas ----------
async function renderStats() {
  const simulados = await Store.getSimulados();
  const materias = await Store.getMaterias();
  const dominadas = materias.filter((m) => m.nivel === "bom").length;

  document.getElementById("stat-simulados").textContent = simulados.length;
  document.getElementById("stat-materias").textContent = materias.length;
  document.getElementById("stat-dominadas").textContent = dominadas;
}

// ---------- Árvore de skills ----------
async function renderTree() {
  const materias = await Store.getMaterias();
  const wrap = document.getElementById("tree-wrap");
  const svg = document.getElementById("tree-svg");
  const nodesEl = document.getElementById("tree-nodes");

  const nomeUsuario = (document.getElementById("p-nome").value || "Você").trim() || "Você";

  if (materias.length === 0) {
    wrap.style.height = "220px";
    svg.innerHTML = "";
    nodesEl.innerHTML = `<div class="empty-state" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
      Cadastre matérias na página "Matérias" para ver sua árvore de skills crescer aqui.
    </div>`;
    return;
  }

  const rowHeight = 96;
  const height = Math.max(240, materias.length * rowHeight + 40);
  wrap.style.height = height + "px";
  svg.setAttribute("viewBox", `0 0 640 ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");

  const rootX = 80;
  const rootY = height / 2;
  const nodeX = 420;

  let linesHtml = "";
  let nodesHtml = `
    <div class="node node-root" style="left:${rootX}px; top:${rootY}px;">
      <div class="node-ring"><div class="node-inner"></div></div>
    </div>
  `;

  materias.forEach((m, i) => {
    const nodeY = 60 + i * rowHeight;
    const color = NIVEL_COLOR[m.nivel] || NIVEL_COLOR.medio;
    const pct = NIVEL_PCT[m.nivel] || NIVEL_PCT.medio;

    linesHtml += `<line x1="${rootX}" y1="${rootY}" x2="${nodeX}" y2="${nodeY}" stroke="var(--line)" stroke-width="2" />`;

    nodesHtml += `
      <div class="node node-skill" style="left:${nodeX}px; top:${nodeY}px;">
        <div class="node-ring" style="background: conic-gradient(${color} ${pct}%, var(--line) 0)">
          <div class="node-inner"></div>
        </div>
        <div class="node-label"></div>
      </div>
    `;
  });

  svg.innerHTML = linesHtml;
  nodesEl.innerHTML = nodesHtml;

  const rootInner = nodesEl.querySelector(".node-root .node-inner");
  rootInner.textContent = nomeUsuario.slice(0, 10);

  const skillNodes = nodesEl.querySelectorAll(".node-skill");
  materias.forEach((m, i) => {
    skillNodes[i].querySelector(".node-inner").textContent = iniciais(m.nome);
    skillNodes[i].querySelector(".node-label").textContent = m.nome;
  });
}

function iniciais(nome) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// ---------- Evolução ao longo do tempo ----------
async function renderEvolucao() {
  const history = await Store.getSkillHistory();
  const canvas = document.getElementById("evo-canvas");
  const emptyEl = document.getElementById("evo-empty");

  if (history.length === 0) {
    canvas.style.display = "none";
    emptyEl.style.display = "block";
  } else {
    canvas.style.display = "block";
    emptyEl.style.display = "none";
    desenharGrafico(canvas, calcularMediaAoLongoDoTempo(history));
  }

  renderHistoricoPorMateria(history);
}

// Reconstrói, evento a evento, a média geral de domínio ao longo do tempo.
function calcularMediaAoLongoDoTempo(history) {
  const niveisAtuais = {}; // materia_id -> nivel numérico
  const pontos = [];

  history.forEach((evento) => {
    niveisAtuais[evento.materia_id] = NIVEL_SCORE[evento.nivel] || 2;
    const valores = Object.values(niveisAtuais);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    pontos.push({ data: new Date(evento.criado_em), media });
  });

  return pontos;
}

function desenharGrafico(canvas, pontos) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.parentElement.clientWidth - 32;
  const cssHeight = 180;
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + "px";
  canvas.style.height = cssHeight + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const padding = { top: 16, right: 16, bottom: 28, left: 34 };
  const plotW = cssWidth - padding.left - padding.right;
  const plotH = cssHeight - padding.top - padding.bottom;

  // eixo Y fixo de 1 (fraco) a 3 (bom)
  const yFor = (v) => padding.top + plotH - ((v - 1) / 2) * plotH;
  const xFor = (i) => padding.left + (pontos.length === 1 ? plotW / 2 : (i / (pontos.length - 1)) * plotW);

  const inkDim = getComputedStyle(document.documentElement).getPropertyValue("--ink-dim").trim();
  const line = getComputedStyle(document.documentElement).getPropertyValue("--line").trim();
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();

  // grade horizontal + rótulos
  ctx.strokeStyle = line;
  ctx.fillStyle = inkDim;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textBaseline = "middle";
  [1, 2, 3].forEach((v) => {
    const y = yFor(v);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(cssWidth - padding.right, y);
    ctx.stroke();
    ctx.fillText(NIVEL_LABEL[v === 1 ? "fraco" : v === 2 ? "medio" : "bom"], 2, y);
  });

  // linha da evolução
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pontos.forEach((p, i) => {
    const x = xFor(i);
    const y = yFor(p.media);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // pontos
  ctx.fillStyle = accent;
  pontos.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(xFor(i), yFor(p.media), 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // datas inicial/final no eixo X
  if (pontos.length > 0) {
    ctx.fillStyle = inkDim;
    ctx.textAlign = "left";
    ctx.fillText(formatCurta(pontos[0].data), padding.left, cssHeight - 10);
    ctx.textAlign = "right";
    ctx.fillText(formatCurta(pontos[pontos.length - 1].data), cssWidth - padding.right, cssHeight - 10);
  }
}

function formatCurta(date) {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function renderHistoricoPorMateria(history) {
  const container = document.getElementById("historico-lista");

  if (history.length === 0) {
    container.innerHTML = `<div class="empty-state">Nenhuma mudança registrada ainda.</div>`;
    return;
  }

  // mais recente primeiro
  const ordenado = [...history].reverse();
  container.innerHTML = "";

  ordenado.slice(0, 30).forEach((evento) => {
    const info = { fraco: "dot-red", medio: "dot-yellow", bom: "dot-green" }[evento.nivel] || "dot-yellow";
    const data = new Date(evento.criado_em).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <span class="chip"><span class="chip-dot ${info}"></span>${NIVEL_LABEL[evento.nivel]}</span>
      <div style="flex:1; font-size:14px;"></div>
      <div class="simulado-meta" style="color:var(--ink-dim); font-size:12.5px;">${data}</div>
    `;
    row.children[1].textContent = evento.materia_nome;
    container.appendChild(row);
  });
}

// ---------------------------------------------------------------------------
// Componente COMPARTILHADO entre Treineiro e Professor (mesma conta, mesmos
// dados de "materias"/"skill_history" no Supabase). Este arquivo é IDÊNTICO
// nos dois projetos — se editar aqui, copie a mesma versão para o outro
// projeto (public/js/skillTree.js) pra não desalinhar o visual/comportamento.
//
// Responsável por dois blocos visuais da página Perfil:
//   1. Árvore de skills: matérias (nível raiz) podem ter submatérias
//      (ramificações, via "parent_id"), e cada nó tem um "dominio" contínuo
//      de 0 a 100 (%) em vez de apenas 3 categorias fixas — o anel do nó usa
//      um gradiente de cor (vermelho → amarelo → verde) proporcional a esse
//      número, então dois nós com 40% e 55% já aparecem visualmente
//      diferentes, não "empacotados" nos mesmos 3 estados.
//   2. Evolução: gráfico de linha com a média geral de domínio (0–100%) ao
//      longo do tempo, alimentado pelo histórico de mudanças (skill_history).
// ---------------------------------------------------------------------------

const SkillTree = (() => {
  // ---------- Cor contínua por percentual de domínio ----------
  // Interpola vermelho (0%) -> amarelo (50%) -> verde (100%), em vez de usar
  // só 3 cores fixas — dá mais precisão visual ao nível real de domínio.
  const COR_BAIXO = [181, 71, 58]; // --red   #b5473a
  const COR_MEDIO = [201, 162, 39]; // --yellow #c9a227
  const COR_ALTO = [92, 154, 92]; // --green  #5c9a5c

  function corPorDominio(pctBruto) {
    const pct = Math.max(0, Math.min(100, Number(pctBruto) || 0));
    const [c1, c2, t] = pct <= 50 ? [COR_BAIXO, COR_MEDIO, pct / 50] : [COR_MEDIO, COR_ALTO, (pct - 50) / 50];
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function iniciais(nome) {
    return (nome || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join("");
  }

  // ---------- Monta a floresta (matérias raiz + filhas) a partir da lista plana ----------
  function montarArvore(materias) {
    const porId = new Map();
    materias.forEach((m) => porId.set(m.id, { ...m, filhos: [] }));

    const raizes = [];
    porId.forEach((node) => {
      if (node.parent_id && porId.has(node.parent_id)) {
        porId.get(node.parent_id).filhos.push(node);
      } else {
        raizes.push(node);
      }
    });

    // ordena por nome em cada nível, pra ficar estável entre renderizações
    const ordenar = (lista) => {
      lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      lista.forEach((n) => ordenar(n.filhos));
    };
    ordenar(raizes);

    return raizes;
  }

  // Quantas "linhas" (folhas) um nó ocupa verticalmente.
  function contarFolhas(node) {
    if (node.filhos.length === 0) return 1;
    return node.filhos.reduce((soma, f) => soma + contarFolhas(f), 0);
  }

  // ---------- Renderiza a árvore ----------
  // opts: { wrapId, svgId, nodesId, materias, nomeUsuario, emptyMensagem }
  function renderSkillTree(opts) {
    const wrap = document.getElementById(opts.wrapId);
    const svg = document.getElementById(opts.svgId);
    const nodesEl = document.getElementById(opts.nodesId);
    if (!wrap || !svg || !nodesEl) return;

    const materias = opts.materias || [];
    const nomeUsuario = (opts.nomeUsuario || "Você").trim() || "Você";

    if (materias.length === 0) {
      wrap.style.height = "220px";
      svg.innerHTML = "";
      nodesEl.innerHTML = `<div class="empty-state" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center; padding:0 24px;">
        ${opts.emptyMensagem || "Nenhuma matéria cadastrada ainda."}
      </div>`;
      return;
    }

    const raizes = montarArvore(materias);
    const totalFolhas = Math.max(1, raizes.reduce((soma, r) => soma + contarFolhas(r), 0));

    const rowHeight = 78;
    const colWidth = 220;
    const paddingTop = 50;
    const rootX = 70;
    const height = Math.max(240, totalFolhas * rowHeight + paddingTop);
    const maxDepth = calcularProfundidadeMax(raizes);
    const width = rootX + (maxDepth + 1) * colWidth + 40;

    wrap.style.height = height + "px";
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "none");

    let linesHtml = "";
    let nodesHtml = "";
    let linha = 0; // contador de "linha" (posição vertical de folha) global

    function posicionar(node, depth) {
      const x = rootX + (depth + 1) * colWidth;
      if (node.filhos.length === 0) {
        node._y = paddingTop + linha * rowHeight;
        linha++;
      } else {
        node.filhos.forEach((f) => posicionar(f, depth + 1));
        const ys = node.filhos.map((f) => f._y);
        node._y = (Math.min(...ys) + Math.max(...ys)) / 2;
      }
      node._x = x;
    }
    raizes.forEach((r) => posicionar(r, 0));

    const rootY = raizes.length
      ? (Math.min(...raizes.map((r) => r._y)) + Math.max(...raizes.map((r) => r._y))) / 2
      : height / 2;

    function desenhar(node, parentX, parentY, nivel) {
      const dominio = Number(node.dominio);
      const cor = corPorDominio(dominio);
      const ringSize = nivel === 0 ? 74 : 56;
      const innerSize = nivel === 0 ? 60 : 44;
      const classe = nivel === 0 ? "node-materia" : "node-sub";

      linesHtml += `<line x1="${parentX}" y1="${parentY}" x2="${node._x}" y2="${node._y}" stroke="var(--line)" stroke-width="2" />`;
      nodesHtml += `
        <div class="node ${classe}" style="left:${node._x}px; top:${node._y}px;" title="${escapeAttr(node.nome)}: ${Math.round(dominio)}% de domínio">
          <div class="node-ring" style="width:${ringSize}px; height:${ringSize}px; background: conic-gradient(${cor} ${dominio}%, var(--line) 0)">
            <div class="node-inner" style="width:${innerSize}px; height:${innerSize}px;">${escapeHtml(iniciais(node.nome))}</div>
          </div>
          <div class="node-label">${escapeHtml(node.nome)}</div>
          <div class="node-pct" style="color:${cor}">${Math.round(dominio)}%</div>
        </div>
      `;

      node.filhos.forEach((f) => desenhar(f, node._x, node._y, nivel + 1));
    }

    raizes.forEach((r) => desenhar(r, rootX, rootY, 0));

    nodesHtml =
      `
      <div class="node node-root" style="left:${rootX}px; top:${rootY}px;">
        <div class="node-ring"><div class="node-inner">${escapeHtml(nomeUsuario.slice(0, 10))}</div></div>
      </div>
    ` + nodesHtml;

    svg.innerHTML = linesHtml;
    nodesEl.innerHTML = nodesHtml;
  }

  function calcularProfundidadeMax(raizes) {
    let max = 0;
    (function walk(nodes, d) {
      max = Math.max(max, d);
      nodes.forEach((n) => walk(n.filhos, d + 1));
    })(raizes, 0);
    return max;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(str) {
    return escapeHtml(str);
  }

  // ---------- Evolução: média geral de domínio ao longo do tempo ----------
  // opts: { canvasId, emptyId, skillHistory }
  function renderEvolucao(opts) {
    const canvas = document.getElementById(opts.canvasId);
    const emptyEl = document.getElementById(opts.emptyId);
    if (!canvas || !emptyEl) return;

    const history = opts.skillHistory || [];
    if (history.length === 0) {
      canvas.style.display = "none";
      emptyEl.style.display = "block";
      return;
    }
    canvas.style.display = "block";
    emptyEl.style.display = "none";
    desenharGrafico(canvas, calcularMediaAoLongoDoTempo(history));
  }

  function calcularMediaAoLongoDoTempo(history) {
    const dominioAtual = {}; // materia_id -> dominio numérico
    const pontos = [];
    const ordenado = [...history].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));

    ordenado.forEach((evento) => {
      dominioAtual[evento.materia_id] = Number(evento.dominio) || 0;
      const valores = Object.values(dominioAtual);
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

    // eixo Y fixo de 0% a 100%
    const yFor = (v) => padding.top + plotH - (v / 100) * plotH;
    const xFor = (i) => padding.left + (pontos.length === 1 ? plotW / 2 : (i / (pontos.length - 1)) * plotW);

    const inkDim = getComputedStyle(document.documentElement).getPropertyValue("--ink-dim").trim();
    const line = getComputedStyle(document.documentElement).getPropertyValue("--line").trim();
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();

    // grade horizontal + rótulos (0%, 25%, 50%, 75%, 100%)
    ctx.strokeStyle = line;
    ctx.fillStyle = inkDim;
    ctx.font = "11px ui-monospace, monospace";
    ctx.textBaseline = "middle";
    [0, 25, 50, 75, 100].forEach((v) => {
      const y = yFor(v);
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(cssWidth - padding.right, y);
      ctx.stroke();
      ctx.fillText(`${v}%`, 2, y);
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

  // ---------- Histórico por matéria/submatéria (lista, mais recente primeiro) ----------
  function renderHistoricoLista(containerId, history) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!history || history.length === 0) {
      container.innerHTML = `<div class="empty-state">Nenhuma mudança registrada ainda.</div>`;
      return;
    }

    const ordenado = [...history].sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
    container.innerHTML = "";

    ordenado.slice(0, 30).forEach((evento) => {
      const dominio = Math.round(Number(evento.dominio) || 0);
      const cor = corPorDominio(dominio);
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
        <span class="chip"><span class="chip-dot" style="background:${cor}"></span>${dominio}%</span>
        <div style="flex:1; font-size:14px;"></div>
        <div class="simulado-meta" style="color:var(--ink-dim); font-size:12.5px;">${data}</div>
      `;
      row.children[1].textContent = evento.materia_nome;
      container.appendChild(row);
    });
  }

  return { corPorDominio, montarArvore, renderSkillTree, renderEvolucao, renderHistoricoLista };
})();

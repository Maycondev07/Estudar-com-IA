const WELCOME = `Oi! Eu sou o Treineiro. Me diz qual prova, vestibular ou certificação você quer estudar (ex: "ITA", "Enem", "OAB primeira fase", "AWS Solutions Architect") que eu já te digo o nível de dificuldade dela e monto um diagnóstico inicial.`;

// Ajuste esse número pra bater com o limite diário (em tokens) do seu
// provedor de IA — é só uma estimativa local, calculada a partir do "usage"
// que a API retorna a cada resposta; não é o contador oficial do provedor.
const DAILY_TOKEN_BUDGET = 200000;

const PAGINAS_PERMITIDAS = ["index.html", "materias.html", "simulados.html", "perfil.html", "login.html"];

let state = {
  messages: [{ role: "assistant", content: WELCOME }],
  mode: "livre",
  difficulty: null,
  loading: false,
};
let currentUser = null;
let examTimerInterval = null;
let examStartTime = null;

if (window.marked) {
  marked.setOptions({ breaks: true, gfm: true });
}

(async function main() {
  currentUser = await getOptionalUser();
  Store.init(currentUser ? currentUser.id : "visitante");
  renderNavbar("inicio", currentUser);

  state.messages = Store.getChatHistorico() || state.messages;
  renderMessages();
  renderTokenCounter();

  document.getElementById("mode-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    document.querySelectorAll("#mode-seg button").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("difficulty-wrap").style.display = state.mode === "simulado" ? "flex" : "none";
    aplicarModoVisual();
  });

  document.getElementById("difficulty-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.difficulty = btn.dataset.diff;
    document.querySelectorAll("#difficulty-seg button").forEach((b) => b.classList.toggle("active", b === btn));
    atualizarExamBadge();
  });

  document.getElementById("send-btn").addEventListener("click", sendMessage);
  document.getElementById("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  await maybeIniciarCalibragem();
})();

// Disparado quando o usuário clica em "Iniciar prova de calibragem" no Perfil
// (index.html?calibragem=1). Só dispara sozinho se ainda não houver conversa
// além da mensagem de boas-vindas, pra não interromper um chat em andamento.
async function maybeIniciarCalibragem() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("calibragem") !== "1") return;
  if (!currentUser) return;
  if (state.messages.length > 1) return;

  history.replaceState(null, "", window.location.pathname);

  let mensagemInicial = "Quero fazer minha prova de calibragem inicial. Pode me propor o diagnóstico?";
  try {
    const perfil = await Store.getPerfil();
    if (perfil.prova_alvo) {
      mensagemInicial = `Quero fazer minha prova de calibragem inicial para a prova: ${perfil.prova_alvo}.`;
    }
  } catch (err) {
    // segue com a mensagem genérica se não conseguir ler o perfil
  }

  document.getElementById("input").value = mensagemInicial;
  await sendMessage();
}

// ---------- Layout de prova (modo simulado) ----------
function aplicarModoVisual() {
  const emProva = state.mode === "simulado";
  document.getElementById("chat-wrap").classList.toggle("modo-prova", emProva);
  document.getElementById("exam-header").style.display = emProva ? "flex" : "none";
  if (emProva) iniciarExamTimer();
  else pararExamTimer();
  atualizarExamBadge();
}

function atualizarExamBadge() {
  const el = document.getElementById("exam-badge");
  if (!el) return;
  const labels = { aprendizado: "🟩 aprendizado", intermediario: "🟨 intermediário", prova_real: "🟥 prova real" };
  el.textContent = state.difficulty ? `Simulado — ${labels[state.difficulty]}` : "Simulado — escolha a dificuldade";
}

function iniciarExamTimer() {
  examStartTime = Date.now();
  atualizarExamTimer();
  clearInterval(examTimerInterval);
  examTimerInterval = setInterval(atualizarExamTimer, 1000);
}

function pararExamTimer() {
  clearInterval(examTimerInterval);
  examTimerInterval = null;
  examStartTime = null;
  const el = document.getElementById("exam-timer");
  if (el) el.textContent = "00:00";
}

function atualizarExamTimer() {
  const el = document.getElementById("exam-timer");
  if (!el || !examStartTime) return;
  const s = Math.floor((Date.now() - examStartTime) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  el.textContent = `${mm}:${ss}`;
}

async function sendMessage() {
  const input = document.getElementById("input");
  const text = input.value.trim();
  if (!text || state.loading) return;

  state.messages.push({ role: "user", content: text });
  input.value = "";
  state.loading = true;
  hideBanner("save-banner");
  hideBanner("materias-banner");
  hideBanner("error-banner");
  renderMessages();

  try {
    let contexto = { perfil: null, materias: [], simulados: [] };
    if (currentUser) {
      try {
        const [perfil, materias, simulados] = await Promise.all([
          Store.getPerfil(),
          Store.getMaterias(),
          Store.getSimulados(),
        ]);
        contexto = { perfil, materias, simulados };
      } catch (err) {
        // Se der erro ao buscar o contexto, segue a conversa sem ele em vez de travar o chat.
      }
    }

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: state.messages,
        mode: state.mode,
        difficulty: state.difficulty,
        ...contexto,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Erro desconhecido.");
    } else {
      const { texto, acoes } = extrairAcoes(data.reply);
      state.messages.push({ role: "assistant", content: texto });
      Store.setChatHistorico(state.messages);
      checkForScore(texto);
      checkForMaterias(texto);
      if (data.usage && data.usage.total_tokens) {
        registrarTokensUsados(data.usage.total_tokens);
      }
      if (acoes.length) {
        // não trava a resposta: executa em seguida, com feedback via toast
        executarAcoes(acoes);
      }
    }
  } catch (err) {
    showError(err.message);
  } finally {
    state.loading = false;
    renderMessages();
  }
}

// ---------- Ações que a IA pode executar direto no site ----------
function extrairAcoes(reply) {
  const linhas = reply.split("\n");
  const acoes = [];
  const restante = [];

  linhas.forEach((linha) => {
    const m = linha.match(/^\s*A[ÇC][AÃ]O:\s*(\w+)\s*\|\s*(.+)$/i);
    if (m) {
      acoes.push({ tipo: m[1].toLowerCase(), args: parseArgsAcao(m[2]) });
    } else {
      restante.push(linha);
    }
  });

  const texto = restante.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { texto: texto || reply, acoes };
}

function parseArgsAcao(str) {
  const args = {};
  str.split("|").forEach((par) => {
    const idx = par.indexOf("=");
    if (idx === -1) return;
    const chave = par.slice(0, idx).trim().toLowerCase();
    const valor = par.slice(idx + 1).trim();
    if (chave) args[chave] = valor;
  });
  return args;
}

function normalizarDominio(v) {
  const n = Math.round(Number(v));
  if (Number.isNaN(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

function encontrarMateriaPorNome(materias, nome, preferirRaiz) {
  const alvo = nome.trim().toLowerCase();
  const candidatos = materias.filter((m) => m.nome.trim().toLowerCase() === alvo);
  if (candidatos.length <= 1) return candidatos[0];
  if (preferirRaiz) {
    const raiz = candidatos.find((m) => !m.parent_id);
    if (raiz) return raiz;
  }
  return candidatos[0];
}

async function executarAcoes(acoes) {
  if (!currentUser) {
    showToast("O Treineiro tentou fazer uma alteração, mas é preciso entrar ou criar conta pra isso funcionar.", "erro");
    return;
  }

  for (const acao of acoes) {
    try {
      if (acao.tipo === "definir_perfil") {
        const changes = {};
        if (acao.args.nome !== undefined) changes.nome = acao.args.nome;
        if (acao.args.prova_alvo !== undefined) changes.prova_alvo = acao.args.prova_alvo;
        if (Object.keys(changes).length) {
          await Store.setPerfil(changes);
          showToast("✓ Perfil atualizado.");
        }
      } else if (acao.tipo === "adicionar_materia") {
        if (!acao.args.nome) continue;
        let parentId = null;
        if (acao.args.pai) {
          const materias = await Store.getMaterias();
          const pai = encontrarMateriaPorNome(materias, acao.args.pai, true);
          if (pai) parentId = pai.id;
        }
        await Store.addMateria({ nome: acao.args.nome, dominio: normalizarDominio(acao.args.dominio), parent_id: parentId });
        showToast(`✓ Matéria "${acao.args.nome}" adicionada.`);
      } else if (acao.tipo === "atualizar_materia") {
        if (!acao.args.nome) continue;
        const materias = await Store.getMaterias();
        const alvo = encontrarMateriaPorNome(materias, acao.args.nome, true);
        if (alvo) {
          await Store.updateMateria(alvo.id, { dominio: normalizarDominio(acao.args.dominio) });
          showToast(`✓ Domínio de "${acao.args.nome}" atualizado.`);
        }
      } else if (acao.tipo === "remover_materia") {
        if (!acao.args.nome) continue;
        const materias = await Store.getMaterias();
        const alvo = encontrarMateriaPorNome(materias, acao.args.nome, true);
        if (alvo) {
          await Store.deleteMateria(alvo.id);
          showToast(`✓ Matéria "${acao.args.nome}" removida.`);
        }
      } else if (acao.tipo === "navegar") {
        const pagina = (acao.args.pagina || "").trim();
        if (PAGINAS_PERMITIDAS.includes(pagina)) {
          showToast(`↳ Indo para ${pagina}…`);
          setTimeout(() => {
            window.location.href = pagina;
          }, 650);
        }
      }
    } catch (err) {
      showToast("Não consegui executar uma ação: " + err.message, "erro");
    }
  }
}

// ---------- Contador de tokens restantes hoje (estimativa local) ----------
function getTokenUsageKey() {
  const dia = new Date().toISOString().slice(0, 10);
  return `treineiro_tokens_${currentUser ? currentUser.id : "visitante"}_${dia}`;
}

function getTokensUsadosHoje() {
  const raw = localStorage.getItem(getTokenUsageKey());
  return raw ? parseInt(raw, 10) || 0 : 0;
}

function registrarTokensUsados(qtd) {
  const usados = getTokensUsadosHoje() + qtd;
  localStorage.setItem(getTokenUsageKey(), String(usados));
  renderTokenCounter();
}

function renderTokenCounter() {
  const el = document.getElementById("token-counter");
  if (!el) return;
  const usados = getTokensUsadosHoje();
  const restantes = Math.max(0, DAILY_TOKEN_BUDGET - usados);
  el.textContent = `🪙 ${restantes.toLocaleString("pt-BR")} tokens restantes hoje (estimativa)`;
}

// ---------- Toasts (feedback rápido de ações) ----------
function showToast(mensagem, tipo) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const el = document.createElement("div");
  el.className = "toast" + (tipo === "erro" ? " erro" : "");
  el.textContent = mensagem;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function checkForScore(reply) {
  if (state.mode !== "simulado") return;
  const match = reply.match(/pontua[cç][aã]o final:\s*([^\n]+)/i);
  if (match) {
    showSaveBanner(match[1].trim());
  }
}

function showSaveBanner(score) {
  const banner = document.getElementById("save-banner");
  banner.style.display = "flex";

  if (!currentUser) {
    banner.querySelector("span").textContent =
      "Percebi uma pontuação nessa correção. Crie uma conta ou entre para salvar esse simulado.";
    document.getElementById("save-yes").textContent = "Entrar / Criar conta";
    document.getElementById("save-yes").onclick = () => {
      window.location.href = "login.html?next=index.html";
    };
    document.getElementById("save-no").onclick = () => hideBanner("save-banner");
    return;
  }

  banner.querySelector("span").textContent =
    'Percebi uma pontuação nessa correção. Quer salvar esse simulado na página "Simulados"?';
  document.getElementById("save-yes").textContent = "Salvar";
  document.getElementById("save-yes").onclick = async () => {
    const prova = prompt("Qual prova/certificação foi esse simulado?", "");
    if (prova === null) return;
    try {
      await Store.addSimulado({
        prova: prova || "Simulado sem nome",
        dificuldade: state.difficulty || "intermediario",
        pontuacao: score,
        notas: "",
      });
      hideBanner("save-banner");
      alert('Simulado salvo! Veja na página "Simulados".');
    } catch (err) {
      showError("Não consegui salvar o simulado: " + err.message);
    }
  };
  document.getElementById("save-no").onclick = () => hideBanner("save-banner");
}

function checkForMaterias(reply) {
  const match = reply.match(/mat[eé]rias identificadas:\s*([^\n]+)/i);
  if (!match) return;
  const itens = parseMateriasList(match[1]);
  if (itens.length) showMateriasBanner(itens);
}

function parseMateriasList(texto) {
  return texto
    .split(",")
    .map((pedaco) => {
      const m = pedaco.trim().match(/^(?:(.+?)\s*>\s*)?(.+?)\s*\((\d{1,3})\s*%\)$/);
      if (!m) return null;
      return { pai: m[1] ? m[1].trim() : null, nome: m[2].trim(), dominio: normalizarDominio(m[3]) };
    })
    .filter(Boolean);
}

function showMateriasBanner(itens) {
  const banner = document.getElementById("materias-banner");
  const nomes = itens.map((i) => (i.pai ? `${i.pai} > ${i.nome}` : i.nome)).join(", ");
  banner.style.display = "flex";

  if (!currentUser) {
    banner.querySelector("span").textContent =
      `Percebi um raio-x com estas matérias: ${nomes}. Crie uma conta ou entre para salvá-las.`;
    document.getElementById("materias-yes").textContent = "Entrar / Criar conta";
    document.getElementById("materias-yes").onclick = () => {
      window.location.href = "login.html?next=index.html";
    };
    document.getElementById("materias-no").onclick = () => hideBanner("materias-banner");
    return;
  }

  banner.querySelector("span").textContent =
    `Percebi um raio-x com estas matérias: ${nomes}. Quer salvá-las na página "Matérias"?`;
  document.getElementById("materias-yes").textContent = "Salvar";
  document.getElementById("materias-yes").onclick = async () => {
    try {
      const existentes = await Store.getMaterias();
      const chaveExistente = (nome, paiId) => `${nome.trim().toLowerCase()}|${paiId || ""}`;
      const existentesSet = new Set(existentes.map((m) => chaveExistente(m.nome, m.parent_id)));

      // Matérias-pai primeiro (sem "pai" no item, ou cujo pai já existe/já foi
      // criado nesta mesma leva), pra garantir que o parent_id exista antes de
      // criar a submatéria — repete algumas passadas até estabilizar.
      const pendentes = [...itens];
      const idPorNome = new Map(existentes.filter((m) => !m.parent_id).map((m) => [m.nome.trim().toLowerCase(), m.id]));
      let progresso = true;
      let salvas = 0;

      while (pendentes.length && progresso) {
        progresso = false;
        for (let i = pendentes.length - 1; i >= 0; i--) {
          const item = pendentes[i];
          const parentId = item.pai ? idPorNome.get(item.pai.trim().toLowerCase()) : null;
          if (item.pai && !parentId) continue; // ainda esperando o pai ser criado

          const chave = chaveExistente(item.nome, parentId);
          if (!existentesSet.has(chave)) {
            const criada = await Store.addMateria({ nome: item.nome, dominio: item.dominio, parent_id: parentId || null });
            existentesSet.add(chave);
            if (!item.pai && criada) idPorNome.set(item.nome.trim().toLowerCase(), criada.id);
            salvas++;
          }
          pendentes.splice(i, 1);
          progresso = true;
        }
      }

      hideBanner("materias-banner");
      if (salvas > 0) {
        alert(`${salvas} matéria(s) salva(s)! Veja na página "Matérias".`);
      } else {
        alert("Essas matérias já estavam cadastradas.");
      }
    } catch (err) {
      showError("Não consegui salvar as matérias: " + err.message);
    }
  };
  document.getElementById("materias-no").onclick = () => hideBanner("materias-banner");
}

function showError(message) {
  const el = document.getElementById("error-banner");
  el.textContent = message;
  el.style.display = "block";
}

function hideBanner(id) {
  document.getElementById(id).style.display = "none";
}

function renderMessages() {
  const container = document.getElementById("messages");
  container.innerHTML = "";
  state.messages.forEach((m) => {
    const row = document.createElement("div");
    row.className = "msg-row";
    row.innerHTML = `
      <div class="msg-role ${m.role === "user" ? "user" : ""}">${m.role === "user" ? "você" : "treineiro"}</div>
      <div class="msg-content"></div>
    `;
    const contentEl = row.querySelector(".msg-content");
    if (window.marked && window.DOMPurify) {
      contentEl.innerHTML = DOMPurify.sanitize(marked.parse(m.content || ""));
    } else {
      contentEl.textContent = m.content;
    }
    container.appendChild(row);
  });
  if (state.loading) {
    const row = document.createElement("div");
    row.style.cssText = "padding:16px 0; color:var(--ink-dim); font-family:var(--mono); font-size:13px;";
    row.textContent = "treineiro está escrevendo…";
    container.appendChild(row);
  }
  container.scrollTop = container.scrollHeight;
}

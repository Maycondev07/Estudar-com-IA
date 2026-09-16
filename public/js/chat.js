const WELCOME = `Oi! Eu sou o Treineiro. Me diz qual prova, vestibular ou certificação você quer estudar (ex: "ITA", "Enem", "OAB primeira fase", "AWS Solutions Architect") que eu já te digo o nível de dificuldade dela e monto um diagnóstico inicial.`;

let state = {
  messages: [{ role: "assistant", content: WELCOME }],
  mode: "livre",
  difficulty: null,
  loading: false,
};
let currentUser = null;

(async function main() {
  currentUser = await getOptionalUser();
  Store.init(currentUser ? currentUser.id : "visitante");
  renderNavbar("inicio", currentUser);

  state.messages = Store.getChatHistorico() || state.messages;
  renderMessages();

  document.getElementById("mode-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.mode = btn.dataset.mode;
    document.querySelectorAll("#mode-seg button").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("difficulty-wrap").style.display = state.mode === "simulado" ? "flex" : "none";
  });

  document.getElementById("difficulty-seg").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.difficulty = btn.dataset.diff;
    document.querySelectorAll("#difficulty-seg button").forEach((b) => b.classList.toggle("active", b === btn));
  });

  document.getElementById("send-btn").addEventListener("click", sendMessage);
  document.getElementById("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
})();

async function sendMessage() {
  const input = document.getElementById("input");
  const text = input.value.trim();
  if (!text || state.loading) return;

  state.messages.push({ role: "user", content: text });
  input.value = "";
  state.loading = true;
  hideBanner("save-banner");
  hideBanner("error-banner");
  renderMessages();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: state.messages, mode: state.mode, difficulty: state.difficulty }),
    });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || "Erro desconhecido.");
    } else {
      state.messages.push({ role: "assistant", content: data.reply });
      Store.setChatHistorico(state.messages);
      checkForScore(data.reply);
    }
  } catch (err) {
    showError(err.message);
  } finally {
    state.loading = false;
    renderMessages();
  }
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
    row.querySelector(".msg-content").textContent = m.content;
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

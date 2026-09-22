// Domínio de "skill dominada" pra fins da estatística no topo da página —
// não afeta a árvore, que sempre mostra o percentual exato de cada nó.
const DOMINIO_DOMINADA = 80;

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

  await renderCalibragemCta();
  await renderStats();
  await renderTreeESkillHistory();
})();

// Mostra um card convidando pra primeira "prova de calibragem" enquanto o
// usuário ainda não tem nenhuma matéria mapeada nem simulado feito — ou seja,
// só na primeira visita real ao Perfil.
async function renderCalibragemCta() {
  const [materias, simulados] = await Promise.all([Store.getMaterias(), Store.getSimulados()]);
  if (materias.length > 0 || simulados.length > 0) return;

  const card = document.createElement("div");
  card.className = "panel";
  card.style.cssText =
    "padding:18px 20px; margin-bottom:28px; border-color:var(--accent); display:flex; gap:16px; align-items:center; flex-wrap:wrap;";
  card.innerHTML = `
    <div style="flex:1; min-width:220px;">
      <div style="font-family:var(--serif); font-size:17px; margin-bottom:4px;">Faça sua prova de calibragem</div>
      <div style="color:var(--ink-dim); font-size:13.5px;">
        Ainda não sabemos seu nível em nada. Responda um diagnóstico rápido com o Treineiro
        pra gente mapear suas matérias e começar sua árvore de skills.
      </div>
    </div>
    <button class="btn btn-primary" id="calibragem-btn" style="flex-shrink:0;">Iniciar prova de calibragem</button>
  `;
  document.getElementById("perfil-content").prepend(card);
  document.getElementById("calibragem-btn").addEventListener("click", () => {
    window.location.href = "index.html?calibragem=1";
  });
}

async function salvarPerfil() {
  await Store.setPerfil({
    nome: document.getElementById("p-nome").value,
    prova_alvo: document.getElementById("p-prova").value,
  });
  renderTreeESkillHistory(); // o nó central usa o nome, então atualiza a árvore também
}

// ---------- Estatísticas ----------
async function renderStats() {
  const simulados = await Store.getSimulados();
  const materias = await Store.getMaterias();
  const dominadas = materias.filter((m) => Number(m.dominio) >= DOMINIO_DOMINADA).length;

  document.getElementById("stat-simulados").textContent = simulados.length;
  document.getElementById("stat-materias").textContent = materias.length;
  document.getElementById("stat-dominadas").textContent = dominadas;
}

// ---------- Árvore de skills + evolução (componente compartilhado com o Professor) ----------
async function renderTreeESkillHistory() {
  const [materias, history] = await Promise.all([Store.getMaterias(), Store.getSkillHistory()]);
  const nomeUsuario = (document.getElementById("p-nome").value || "Você").trim() || "Você";

  SkillTree.renderSkillTree({
    wrapId: "tree-wrap",
    svgId: "tree-svg",
    nodesId: "tree-nodes",
    materias,
    nomeUsuario,
    emptyMensagem: 'Cadastre matérias na página "Matérias" para ver sua árvore de skills crescer aqui.',
  });

  SkillTree.renderEvolucao({ canvasId: "evo-canvas", emptyId: "evo-empty", skillHistory: history });
  SkillTree.renderHistoricoLista("historico-lista", history);
}

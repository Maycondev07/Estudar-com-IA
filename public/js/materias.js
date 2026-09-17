const NIVEL_INFO = {
  fraco: { pct: 33, color: "var(--red)" },
  medio: { pct: 66, color: "var(--yellow)" },
  bom: { pct: 100, color: "var(--green)" },
};

(async function main() {
  const user = await getOptionalUser();
  renderNavbar("materias", user);

  if (!user) {
    document.getElementById("add-row").style.display = "none";
    document.getElementById("lista").innerHTML = loginGateHtml({
      mensagem: "Entre ou crie uma conta para cadastrar e acompanhar suas matérias.",
      pagina: "materias.html",
    });
    return;
  }

  Store.init(user.id);
  await renderLista();

  document.getElementById("add-btn").addEventListener("click", addMateria);
  document.getElementById("nova-materia").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addMateria();
  });
})();

async function renderLista() {
  const lista = document.getElementById("lista");
  lista.innerHTML = `<div class="empty-state">Carregando…</div>`;
  const materias = await Store.getMaterias();

  if (materias.length === 0) {
    lista.innerHTML = `<div class="empty-state">Nenhuma matéria cadastrada ainda. Adicione as matérias da sua prova acima, ou peça pro Treineiro sugerir com base no diagnóstico.</div>`;
    return;
  }

  lista.innerHTML = "";
  materias.forEach((m) => {
    const info = NIVEL_INFO[m.nivel] || NIVEL_INFO.medio;
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div class="materia-nome"></div>
      <div class="bar-track"><div class="bar-fill" style="width:${info.pct}%; background:${info.color}"></div></div>
      <select class="nivel-select">
        <option value="fraco">fraco</option>
        <option value="medio">médio</option>
        <option value="bom">bom</option>
      </select>
      <button class="ren-btn" style="background:none;border:none;color:var(--ink-dim);cursor:pointer;font-size:12px;padding:4px 8px">renomear</button>
      <button class="del-btn" style="background:none;border:none;color:var(--ink-dim);cursor:pointer;font-size:12px;padding:4px 8px">excluir</button>
    `;
    row.querySelector(".materia-nome").textContent = m.nome;
    const select = row.querySelector(".nivel-select");
    select.value = m.nivel;
    select.addEventListener("change", async () => {
      const anterior = m.nivel;
      try {
        await Store.updateMateria(m.id, { nivel: select.value });
        renderLista();
      } catch (err) {
        select.value = anterior; // desfaz visualmente se o banco recusou
        avisar("Não consegui atualizar o nível: " + err.message, true);
      }
    });
    // Renomear sem perder o histórico de evolução — antes só dava para
    // excluir e recriar, o que zerava o progresso registrado da matéria.
    row.querySelector(".ren-btn").addEventListener("click", async () => {
      const novo = await UI.perguntar({
        titulo: "Renomear matéria",
        mensagem: "O histórico de evolução desta matéria é preservado.",
        valorInicial: m.nome,
        campo: { placeholder: "Novo nome" },
      });
      if (novo === null || !novo || novo === m.nome) return;

      const jaExiste = await Store.findMateriaPorNome(novo);
      if (jaExiste && jaExiste.id !== m.id) {
        avisar(`Já existe uma matéria chamada "${novo}".`, true);
        return;
      }
      try {
        await Store.updateMateria(m.id, { nome: novo });
        renderLista();
        UI.toast(`✓ Renomeada para "${novo}".`);
      } catch (err) {
        avisar("Não consegui renomear: " + err.message, true);
      }
    });

    row.querySelector(".del-btn").addEventListener("click", async () => {
      const ok = await UI.confirmar({
        titulo: `Excluir "${m.nome}"?`,
        mensagem: "A matéria sai da sua árvore de skills. Essa ação não pode ser desfeita.",
        confirmar: "Excluir",
        perigo: true,
      });
      if (!ok) return;
      try {
        await Store.deleteMateria(m.id);
        renderLista();
      } catch (err) {
        avisar("Não consegui excluir: " + err.message, true);
      }
    });
    lista.appendChild(row);
  });
}

async function addMateria() {
  const input = document.getElementById("nova-materia");
  const btn = document.getElementById("add-btn");
  const nome = input.value.trim();
  if (!nome) return;

  btn.disabled = true;
  try {
    const r = await Store.addMateria({ nome, nivel: document.getElementById("novo-nivel").value });
    if (!r.criada) {
      avisar(`"${nome}" já está na sua lista.`, true);
      return;
    }
    input.value = "";
    renderLista();
  } catch (err) {
    avisar("Não consegui adicionar: " + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

// Aviso simples e não-bloqueante no topo da lista.
function avisar(mensagem, erro) {
  let el = document.getElementById("aviso");
  if (!el) {
    el = document.createElement("div");
    el.id = "aviso";
    el.style.cssText =
      "margin-bottom:14px; padding:10px 14px; border-radius:4px; font-size:13.5px;";
    document.getElementById("lista").before(el);
  }
  el.style.border = `1px solid var(${erro ? "--red" : "--accent"})`;
  el.textContent = mensagem;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.display = "none"), 4000);
}

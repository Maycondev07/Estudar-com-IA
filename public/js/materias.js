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
  const dominioInput = document.getElementById("novo-dominio");
  dominioInput.addEventListener("input", () => {
    document.getElementById("novo-dominio-label").textContent = `${dominioInput.value}%`;
  });
})();

// Preenche o select "dentro de" com todas as matérias já cadastradas,
// indentado por profundidade, pra deixar claro onde cada uma vai entrar.
function popularSelectPai(materias, selectEl, ignorarId) {
  const arvore = SkillTree.montarArvore(materias);
  selectEl.innerHTML = '<option value="">— matéria própria (nível raiz) —</option>';

  function addOpcoes(nodes, depth) {
    nodes.forEach((n) => {
      if (n.id === ignorarId) return; // não deixa uma matéria virar filha de si mesma
      const opt = document.createElement("option");
      opt.value = n.id;
      opt.textContent = `${"— ".repeat(depth)}${n.nome}`;
      selectEl.appendChild(opt);
      addOpcoes(n.filhos, depth + 1);
    });
  }
  addOpcoes(arvore, 0);
}

async function renderLista() {
  const lista = document.getElementById("lista");
  lista.innerHTML = `<div class="empty-state">Carregando…</div>`;
  const materias = await Store.getMaterias();

  popularSelectPai(materias, document.getElementById("novo-pai"));

  if (materias.length === 0) {
    lista.innerHTML = `<div class="empty-state">Nenhuma matéria cadastrada ainda. Adicione as matérias da sua prova acima, ou peça pro Treineiro sugerir com base no diagnóstico.</div>`;
    return;
  }

  const arvore = SkillTree.montarArvore(materias);
  lista.innerHTML = "";
  arvore.forEach((materia) => lista.appendChild(criarLinha(materia, materias)));
}

function criarLinha(node, todasMaterias, isSub) {
  const wrap = document.createElement("div");

  const row = document.createElement("div");
  row.className = "list-row materia-row";
  const cor = SkillTree.corPorDominio(node.dominio);
  row.innerHTML = `
    <div class="materia-nome${isSub ? " sub" : ""}"></div>
    <div class="bar-track"><div class="bar-fill" style="width:${node.dominio}%; background:${cor}"></div></div>
    <input type="range" class="dominio-slider" min="0" max="100" value="${node.dominio}" />
    <span class="dominio-num"></span>
    ${isSub ? "" : '<button class="add-sub-btn">+ submatéria</button>'}
    <button class="del-btn" style="background:none;border:none;color:var(--ink-dim);cursor:pointer;font-size:12px;padding:4px 8px">excluir</button>
  `;
  row.querySelector(".materia-nome").textContent = node.nome;
  row.querySelector(".dominio-num").textContent = `${Math.round(node.dominio)}%`;

  const slider = row.querySelector(".dominio-slider");
  const barFill = row.querySelector(".bar-fill");
  const numLabel = row.querySelector(".dominio-num");
  slider.addEventListener("input", () => {
    // feedback visual imediato, sem gravar a cada pixel arrastado
    numLabel.textContent = `${slider.value}%`;
    barFill.style.width = `${slider.value}%`;
    barFill.style.background = SkillTree.corPorDominio(Number(slider.value));
  });
  slider.addEventListener("change", async () => {
    await Store.updateMateria(node.id, { dominio: Number(slider.value) });
    renderLista();
  });

  row.querySelector(".del-btn").addEventListener("click", async () => {
    const aviso = node.filhos.length
      ? `Excluir "${node.nome}" também exclui ${node.filhos.length} submatéria(s) dentro dela. Confirma?`
      : `Excluir "${node.nome}"?`;
    if (confirm(aviso)) {
      await Store.deleteMateria(node.id);
      renderLista();
    }
  });

  const addSubBtn = row.querySelector(".add-sub-btn");
  if (addSubBtn) {
    addSubBtn.addEventListener("click", () => {
      document.getElementById("nova-materia").focus();
      document.getElementById("novo-pai").value = node.id;
    });
  }

  wrap.appendChild(row);

  if (node.filhos.length) {
    const subList = document.createElement("div");
    subList.className = "sub-list";
    node.filhos.forEach((filho) => subList.appendChild(criarLinha(filho, todasMaterias, true)));
    wrap.appendChild(subList);
  }

  return wrap;
}

async function addMateria() {
  const input = document.getElementById("nova-materia");
  const nome = input.value.trim();
  if (!nome) return;
  const parentId = document.getElementById("novo-pai").value || null;
  const dominio = Number(document.getElementById("novo-dominio").value);

  await Store.addMateria({ nome, dominio, parent_id: parentId });

  input.value = "";
  document.getElementById("novo-pai").value = "";
  document.getElementById("novo-dominio").value = 50;
  document.getElementById("novo-dominio-label").textContent = "50%";
  renderLista();
}

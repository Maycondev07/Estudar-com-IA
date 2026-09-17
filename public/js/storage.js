// Camada de dados: agora fala com o Supabase em vez do localStorage.
// Cada usuário só vê os próprios registros (garantido pelas políticas de
// RLS no banco, não só por este código). Chame Store.init(userId) uma vez,
// logo depois do login confirmado, antes de usar as outras funções.

const Store = (() => {
  let userId = null;

  function init(uid) {
    userId = uid;
  }

  // ---------- Simulados ----------
  async function getSimulados() {
    const { data, error } = await supabaseClient
      .from("simulados")
      .select("*")
      .order("data", { ascending: false });
    if (error) {
      console.error(error);
      return [];
    }
    return data;
  }

  async function addSimulado(simulado) {
    const { error } = await supabaseClient.from("simulados").insert({ user_id: userId, ...simulado });
    if (error) throw error;
  }

  async function deleteSimulado(id) {
    const { error } = await supabaseClient.from("simulados").delete().eq("id", id);
    if (error) throw error;
  }

  // ---------- Matérias ----------
  async function getMaterias() {
    const { data, error } = await supabaseClient
      .from("materias")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) {
      console.error(error);
      return [];
    }
    return data;
  }

  // Retorna a matéria já existente com esse nome (case/acento-insensível), ou null.
  async function findMateriaPorNome(nome) {
    const alvo = normalizarTexto(nome);
    const materias = await getMaterias();
    return materias.find((m) => normalizarTexto(m.nome) === alvo) || null;
  }

  function normalizarTexto(s) {
    return (s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  // Retorna { criada: true } se inseriu, ou { criada: false } se já existia.
  async function addMateria(materia) {
    const existente = await findMateriaPorNome(materia.nome);
    if (existente) return { criada: false, materia: existente };
    const { error } = await supabaseClient.from("materias").insert({ user_id: userId, ...materia });
    if (error) throw error;
    return { criada: true };
  }

  async function updateMateria(id, changes) {
    const { error } = await supabaseClient.from("materias").update(changes).eq("id", id);
    if (error) throw error;
  }

  async function deleteMateria(id) {
    const { error } = await supabaseClient.from("materias").delete().eq("id", id);
    if (error) throw error;
  }

  // ---------- Perfil ----------
  async function getPerfil() {
    const { data, error } = await supabaseClient.from("profiles").select("*").eq("id", userId).single();
    if (error) {
      console.error(error);
      return { nome: "", prova_alvo: "" };
    }
    return data;
  }

  async function setPerfil(changes) {
    // upsert (não update) porque contas criadas antes do trigger
    // `on_auth_user_created` existir podem não ter linha em profiles —
    // com update puro a gravação falharia em silêncio (0 linhas afetadas).
    const { error } = await supabaseClient
      .from("profiles")
      .upsert({ id: userId, ...changes }, { onConflict: "id" });
    if (error) throw error;
  }

  // ---------- Histórico de evolução das skills ----------
  // Preenchido automaticamente por um gatilho no banco toda vez que uma
  // matéria é criada ou muda de nível — não precisa inserir manualmente.
  async function getSkillHistory() {
    const { data, error } = await supabaseClient
      .from("skill_history")
      .select("*")
      .order("criado_em", { ascending: true });
    if (error) {
      console.error(error);
      return [];
    }
    return data;
  }

  // ---------- Histórico de chat (fica só no navegador, por usuário) ----------
  // Guarda no máximo as últimas MAX_CHAT_MSGS mensagens: sem isso o histórico
  // cresce sem limite, estoura a cota do localStorage e infla o custo de
  // tokens (o chat reenvia a conversa inteira a cada mensagem).
  const MAX_CHAT_MSGS = 40;

  function getChatHistorico() {
    try {
      const raw = localStorage.getItem("treineiro_chat_" + userId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (err) {
      // histórico corrompido não pode derrubar a página inteira
      console.warn("Histórico de chat inválido, começando do zero.", err);
      localStorage.removeItem("treineiro_chat_" + userId);
      return null;
    }
  }

  function setChatHistorico(messages) {
    try {
      const recortado = messages.length > MAX_CHAT_MSGS ? messages.slice(-MAX_CHAT_MSGS) : messages;
      localStorage.setItem("treineiro_chat_" + userId, JSON.stringify(recortado));
    } catch (err) {
      console.warn("Não consegui salvar o histórico do chat.", err);
    }
  }

  return {
    init,
    getSimulados,
    addSimulado,
    deleteSimulado,
    getMaterias,
    findMateriaPorNome,
    addMateria,
    updateMateria,
    deleteMateria,
    getPerfil,
    setPerfil,
    getSkillHistory,
    getChatHistorico,
    setChatHistorico,
  };
})();

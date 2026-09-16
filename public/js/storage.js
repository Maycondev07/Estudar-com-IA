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

  async function addMateria(materia) {
    const { error } = await supabaseClient.from("materias").insert({ user_id: userId, ...materia });
    if (error) throw error;
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
    const { error } = await supabaseClient.from("profiles").update(changes).eq("id", userId);
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
  function getChatHistorico() {
    const raw = localStorage.getItem("treineiro_chat_" + userId);
    return raw ? JSON.parse(raw) : null;
  }

  function setChatHistorico(messages) {
    localStorage.setItem("treineiro_chat_" + userId, JSON.stringify(messages));
  }

  return {
    init,
    getSimulados,
    addSimulado,
    deleteSimulado,
    getMaterias,
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

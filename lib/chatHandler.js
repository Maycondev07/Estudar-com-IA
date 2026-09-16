const { BASE_SYSTEM_PROMPT, buildStateContext } = require("./systemPrompt");

// Troque aqui se quiser usar outro provedor "estilo OpenAI":
// - Google (Gemini): https://generativelanguage.googleapis.com/v1beta      modelo: "gemini-3.6-flash"
// - Groq (gratuito, sem cartão): https://api.groq.com/openai/v1          modelo: "llama-3.3-70b-versatile"
// - DeepSeek:  https://api.deepseek.com                                  modelo: "deepseek-chat"
// - Qwen (Alibaba, modo compatível OpenAI):
//              https://dashscope-intl.aliyuncs.com/compatible-mode/v1    modelo: "qwen-plus"
// - Kimi (Moonshot): https://api.moonshot.cn/v1                          modelo: "moonshot-v1-8k"
const API_BASE_URL = process.env.AI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
const API_MODEL = process.env.AI_API_MODEL || "gemini-3.6-flash";
const API_KEY = process.env.AI_API_KEY;

async function handleChat({ messages, mode, difficulty, perfil, materias, simulados }) {
  if (!API_KEY) {
    const err = new Error(
      "Faltou configurar a variável de ambiente AI_API_KEY no servidor (.env / configurações da Vercel)."
    );
    err.status = 500;
    throw err;
  }

  if (!Array.isArray(messages)) {
    const err = new Error("Formato inválido: 'messages' deve ser uma lista.");
    err.status = 400;
    throw err;
  }

  const stateContext = buildStateContext({ mode, difficulty, perfil, materias, simulados });

  const payload = {
    model: API_MODEL,
    messages: [
      { role: "system", content: BASE_SYSTEM_PROMPT },
      { role: "system", content: stateContext },
      ...messages,
    ],
    temperature: 0.4,
  };

  const response = await fetch(`${API_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`Erro da API de IA (${response.status}): ${errorText}`);
    err.status = 502;
    throw err;
  }

  const data = await response.json();
  const reply = data?.choices?.[0]?.message?.content;

  if (!reply) {
    const err = new Error("A IA não retornou nenhuma resposta.");
    err.status = 502;
    throw err;
  }

  return { reply, usage: data?.usage || null };
}

module.exports = { handleChat };

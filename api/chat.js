const { handleChat } = require("../lib/chatHandler");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  try {
    const reply = await handleChat(req.body || {});
    res.status(200).json({ reply });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

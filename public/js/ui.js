// Diálogos e avisos no visual do site, substituindo alert/confirm/prompt
// nativos do navegador (que ignoram o tema escuro, travam a aba e destoam
// completamente do resto da interface).
//
// Todas as funções retornam Promise:
//   await UI.confirmar({ ... })  -> true/false
//   await UI.perguntar({ ... })  -> string  ou  null se cancelado
//   UI.toast("mensagem")         -> sem retorno
//   await UI.avisar({ ... })     -> fecha ao clicar em OK

const UI = (() => {
  let abertoAtual = null;

  function garantirEstilos() {
    if (document.getElementById("ui-modal-styles")) return;
    const st = document.createElement("style");
    st.id = "ui-modal-styles";
    st.textContent = `
      .ui-backdrop {
        position: fixed; inset: 0; z-index: 200;
        background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
      }
      .ui-modal {
        width: 420px; max-width: 100%;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 24px;
        max-height: 86vh; overflow-y: auto;
      }
      .ui-modal h3 {
        font-family: var(--serif); font-size: 19px;
        margin: 0 0 8px; color: var(--ink);
      }
      .ui-modal p {
        margin: 0 0 18px; font-size: 14px;
        color: var(--ink-dim); line-height: 1.55;
      }
      .ui-modal input {
        width: 100%; margin-bottom: 18px;
      }
      .ui-actions {
        display: flex; gap: 10px; justify-content: flex-end;
      }
      .ui-actions .btn { min-width: 92px; }
      @media (max-width: 560px) {
        .ui-modal { padding: 20px; }
        .ui-actions { flex-direction: column-reverse; }
        .ui-actions .btn { width: 100%; }
      }
      /* pilha de toasts — usada nas páginas que não têm a sua própria */
      #ui-toast-stack {
        position: fixed; right: 16px; bottom: 16px; z-index: 210;
        display: flex; flex-direction: column; gap: 8px; max-width: 320px;
      }
      .ui-toast {
        background: var(--panel-raised);
        border: 1px solid var(--line);
        border-left: 3px solid var(--accent);
        border-radius: 4px; padding: 10px 14px;
        font-size: 13px; color: var(--ink);
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
      }
      .ui-toast.erro { border-left-color: var(--red); }
      @media (max-width: 560px) {
        #ui-toast-stack { left: 14px; right: 14px; max-width: none; }
      }
    `;
    document.head.appendChild(st);
  }

  // Monta o diálogo. `campo` liga o input de texto (modo "perguntar").
  function abrir({ titulo, mensagem, confirmar, cancelar, campo, valorInicial, perigo }) {
    garantirEstilos();

    return new Promise((resolve) => {
      const backdrop = document.createElement("div");
      backdrop.className = "ui-backdrop";

      const modal = document.createElement("div");
      modal.className = "ui-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");

      const h = document.createElement("h3");
      h.textContent = titulo || "";
      modal.appendChild(h);

      if (mensagem) {
        const p = document.createElement("p");
        p.textContent = mensagem;
        modal.appendChild(p);
      }

      let input = null;
      if (campo) {
        input = document.createElement("input");
        input.type = "text";
        input.value = valorInicial || "";
        input.placeholder = campo.placeholder || "";
        modal.appendChild(input);
      }

      const acoes = document.createElement("div");
      acoes.className = "ui-actions";

      // "avisar" tem só o botão de confirmar
      let btnCancelar = null;
      if (cancelar !== false) {
        btnCancelar = document.createElement("button");
        btnCancelar.className = "btn";
        btnCancelar.textContent = cancelar || "Cancelar";
        acoes.appendChild(btnCancelar);
      }

      const btnOk = document.createElement("button");
      btnOk.className = "btn btn-primary";
      btnOk.textContent = confirmar || "Confirmar";
      if (perigo) {
        btnOk.style.background = "var(--red)";
        btnOk.style.borderColor = "var(--red)";
        btnOk.style.color = "#fff";
      }
      acoes.appendChild(btnOk);

      modal.appendChild(acoes);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);

      const anterior = document.activeElement;
      (input || btnOk).focus();
      if (input) input.select();

      function fechar(resultado) {
        document.removeEventListener("keydown", onKey);
        backdrop.remove();
        abertoAtual = null;
        if (anterior && anterior.focus) anterior.focus();
        resolve(resultado);
      }

      function onKey(e) {
        if (e.key === "Escape" && cancelar !== false) {
          e.preventDefault();
          fechar(campo ? null : false);
        }
        if (e.key === "Enter" && campo) {
          e.preventDefault();
          fechar(input.value.trim());
        }
        // mantém o foco dentro do diálogo
        if (e.key === "Tab") {
          const focaveis = modal.querySelectorAll("button, input");
          if (!focaveis.length) return;
          const primeiro = focaveis[0];
          const ultimo = focaveis[focaveis.length - 1];
          if (e.shiftKey && document.activeElement === primeiro) {
            e.preventDefault();
            ultimo.focus();
          } else if (!e.shiftKey && document.activeElement === ultimo) {
            e.preventDefault();
            primeiro.focus();
          }
        }
      }

      document.addEventListener("keydown", onKey);
      if (btnCancelar) btnCancelar.onclick = () => fechar(campo ? null : false);
      btnOk.onclick = () => fechar(campo ? input.value.trim() : true);
      backdrop.onclick = (e) => {
        if (e.target === backdrop && cancelar !== false) fechar(campo ? null : false);
      };

      abertoAtual = fechar;
    });
  }

  function confirmar(opcoes) {
    return abrir({ confirmar: "Confirmar", ...opcoes });
  }

  function perguntar(opcoes) {
    return abrir({ confirmar: "Salvar", campo: opcoes.campo || {}, ...opcoes });
  }

  function avisar(opcoes) {
    return abrir({ confirmar: "Entendi", cancelar: false, ...opcoes });
  }

  function toast(mensagem, tipo) {
    garantirEstilos();
    // usa a pilha da própria página, se existir (o chat tem a sua)
    let stack = document.getElementById("toast-stack") || document.getElementById("ui-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "ui-toast-stack";
      document.body.appendChild(stack);
    }
    const el = document.createElement("div");
    el.className = (stack.id === "toast-stack" ? "toast" : "ui-toast") + (tipo === "erro" ? " erro" : "");
    el.textContent = mensagem;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  return { confirmar, perguntar, avisar, toast, fecharAtual: () => abertoAtual && abertoAtual(false) };
})();

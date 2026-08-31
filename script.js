/**
 * Carrega e ativa o widget de acessibilidade VLibras (tradução em Libras)
 * assim que a página termina de carregar.
 *
 * Nota: o widget também precisa da marcação <div vw> no HTML (já presente
 * no final do index.html) — este script só injeta e inicializa o plugin.
 */
window.addEventListener("DOMContentLoaded", () => {
    const vlibrasScript = document.createElement("script");
    vlibrasScript.src = "https://vlibras.gov.br/app/vlibras-plugin.js";

    vlibrasScript.onload = () => {
        new window.VLibras.Widget("https://vlibras.gov.br/app");
    };

    document.head.appendChild(vlibrasScript);
});

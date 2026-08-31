/**
 * app.js — Lógica da interface da Saúde Plus (SPA de página única).
 *
 * Organização do arquivo:
 *   1. Configuração
 *   2. Camada de dados (DataService)       -> tudo que lê/grava no localStorage
 *   3. Base de médicos (mock)
 *   4. Navegação entre páginas/abas
 *   5. Autenticação (cadastro / login / logout)
 *   6. Dashboard (renderização de cartões, consultas, exames)
 *   7. Agendamento de consultas
 *   8. Agendamento de exames
 *   9. Cancelamento (modal de confirmação)
 *  10. Teleconsulta simulada
 *  11. Utilidades (toast, formatação de data, modal)
 *  12. Inicialização
 */

// ==================== 1. CONFIGURAÇÃO ====================
// Endereço único da API. Se o backend mudar de porta/domínio, só precisa
// atualizar aqui — antes esse valor estava repetido em cada fetch().
const API_BASE_URL = "http://127.0.0.1:5000";

const convenioLogoDomains = {
    "https://logo.clearbit.com/hapvida.com.br": "hapvida.com.br",
    "https://logo.clearbit.com/notredameintermedica.com.br": "notredame.com.br",
    "https://logo.clearbit.com/unimed.coop.br": "unimed.coop.br",
    "https://logo.clearbit.com/amil.com.br": "amil.com.br",
    "https://logo.clearbit.com/sulamerica.com.br": "sulamerica.com.br",
    "https://logo.clearbit.com/bradescoseguros.com.br": "bradescoseguros.com.br",
};

Object.entries(convenioLogoDomains).forEach(([oldUrl, domain]) => {
    document.querySelectorAll(`img[src="${oldUrl}"]`).forEach((logo) => {
        logo.src = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    });
});


// ==================== 2. CAMADA DE DADOS ====================
// Centraliza o acesso ao localStorage. Se um dia o projeto passar a salvar
// consultas/exames no backend, basta trocar a implementação aqui dentro —
// o resto do app não precisa saber onde os dados estão guardados.
const DataService = {
    getUsers() {
        return JSON.parse(localStorage.getItem("sp_users") || "[]");
    },
    saveUsers(users) {
        localStorage.setItem("sp_users", JSON.stringify(users));
    },

    getCurrentUser() {
        return JSON.parse(localStorage.getItem("sp_current_user") || "null");
    },
    setCurrentUser(user) {
        localStorage.setItem("sp_current_user", JSON.stringify(user));
    },
    clearCurrentUser() {
        localStorage.removeItem("sp_current_user");
    },

    getAppointments() {
        return JSON.parse(localStorage.getItem("sp_appointments") || "[]");
    },
    saveAppointments(data) {
        localStorage.setItem("sp_appointments", JSON.stringify(data));
    },

    getExams() {
        return JSON.parse(localStorage.getItem("sp_exams") || "[]");
    },
    saveExams(data) {
        localStorage.setItem("sp_exams", JSON.stringify(data));
    },

    // Contador de teleconsultas é salvo por usuário (sp_telecount_<id>)
    getTelecount() {
        const user = this.getCurrentUser();
        if (!user) return 0;
        return parseInt(localStorage.getItem(`sp_telecount_${user.id}`) || "0");
    },
    saveTelecount(n) {
        const user = this.getCurrentUser();
        if (!user) return;
        localStorage.setItem(`sp_telecount_${user.id}`, String(n));
    },
    getUserData(key) {
        const user = this.getCurrentUser();
        return user ? JSON.parse(localStorage.getItem(`sp_${key}_${user.id}`) || "[]") : [];
    },
    saveUserData(key, data) {
        const user = this.getCurrentUser();
        if (user) localStorage.setItem(`sp_${key}_${user.id}`, JSON.stringify(data));
    },
};


// ==================== 3. BASE DE MÉDICOS (MOCK) ====================
const doctorsDB = {
    "Clínico Geral": ["Dr. Carlos Mendes", "Dra. Ana Oliveira", "Dr. Roberto Lima"],
    "Cardiologia": ["Dr. Fernando Costa", "Dra. Mariana Souza"],
    "Dermatologia": ["Dra. Juliana Alves", "Dr. Pedro Santos"],
    "Ortopedia": ["Dr. Marcos Ribeiro", "Dra. Camila Ferreira"],
    "Pediatria": ["Dra. Beatriz Gomes", "Dr. Lucas Martins"],
    "Ginecologia": ["Dra. Patrícia Nunes", "Dra. Fernanda Rocha"],
    "Neurologia": ["Dr. André Barbosa", "Dra. Sofia Pereira"],
    "Psiquiatria": ["Dra. Carolina Dias", "Dr. Rafael Moura"],
    "Endocrinologia": ["Dr. Eduardo Nogueira", "Dra. Beatriz Cunha"],
    "Gastroenterologia": ["Dr. Hugo Almeida", "Dra. Larissa Costa"],
    "Oftalmologia": ["Dra. Renata Mendes", "Dr. Iago Vieira"],
    "Otorrinolaringologia": ["Dra. Marina Figueiredo", "Dr. José Lemos"],
    "Urologia": ["Dr. Vinicius Ramos", "Dra. Cíntia Santos"],
    "Reumatologia": ["Dr. Daniel Moreira", "Dra. Tatiana Martins"],
    "Pneumologia": ["Dr. Tiago Rocha", "Dra. Carla Antunes"],
    "Infectologia": ["Dr. Bruno Rocha", "Dra. Paula Azevedo"],
    "Hematologia": ["Dr. Marcelo Alves", "Dra. Gabriela Souza"],
    "Oncologia": ["Dr. Felipe Nobre", "Dra. Isabela Pires"],
    "Nefrologia": ["Dr. Arthur Faria", "Dra. Samanta Torres"],
    "Cirurgia Geral": ["Dr. Gabriel Silva", "Dra. Mariana Costa"],
    "Cirurgia Plástica": ["Dr. Rodrigo Prado", "Dra. Elisa Martins"],
    "Obstetrícia": ["Dra. Fernanda Lima", "Dr. Luís Coimbra"],
    "Medicina do Trabalho": ["Dr. Paulo Araujo", "Dra. Renata Leal"],
    "Alergologia": ["Dr. Victor Pinto", "Dra. Bianca Santos"],
    "Nutrição": ["Dra. Camila Moura", "Dr. Érico Tavares"],
    "Psicologia": ["Dra. Lúcia Nascimento", "Dr. Pedro Henrique"],
    "Fisioterapia": ["Dr. Matheus Duarte", "Dra. Vitoria Costa"],
    "Acupuntura": ["Dra. Helena Borges", "Dr. Bruno Teles"],
    "Homeopatia": ["Dra. Priscila Lopes", "Dr. Henrique Costa"],
    "Geriatria": ["Dr. Leonardo Reis", "Dra. Simone Maia"],
    "Medicina de Família": ["Dr. Elias Ribeiro", "Dra. Rosana Barros"],
    "Ortopedia Pediátrica": ["Dr. André Torres", "Dra. Joana Costa"],
    "Mastologia": ["Dra. Laís Neves", "Dr. Fábio Rocha"],
    "Neuropediatria": ["Dr. Marcos Oliveira", "Dra. Sofia Nunes"],
    "Psiquiatria Infantil": ["Dra. Mariana Braga", "Dr. Felipe Lima"],
    "Dermatologia Pediátrica": ["Dra. Ana Clara Dias", "Dr. Luciano Freitas"],
    "Medicina Estética": ["Dra. Larissa Ribeiro", "Dr. Otávio Costa"],
};


// ==================== 4. NAVEGAÇÃO ====================
/** Mostra a página (div.page) com o id informado e esconde as demais. */
function showPage(pageId) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.getElementById(pageId).classList.add("active");
    if (pageId === "page-dashboard") {
        renderDashboard();
        showDashSection("dash-plans");
    }
    setAssistantVisibility(Boolean(DataService.getCurrentUser()) && pageId !== "page-teleconsulta");
    lucide.createIcons();
}

/** Troca de aba dentro do dashboard (Consultas, Exames, Teleconsulta...). */
function showDashSection(sectionId) {
    const lockedSection = !hasSelectedPlan() && !["dash-plans", "dash-profile"].includes(sectionId);
    if (lockedSection) {
        showToast("Selecione um plano para liberar as demais áreas do painel.", "error");
        sectionId = "dash-plans";
    }

    document.querySelectorAll(".dash-section").forEach((s) => {
        s.classList.remove("active");
        s.style.display = "none";
    });
    const secao = document.getElementById(sectionId);
    secao.style.display = "block";
    secao.classList.add("active");

    document.querySelectorAll(".dash-nav-btn").forEach((button) => {
        const isActive = button.getAttribute("onclick")?.includes(`'${sectionId}'`);
        button.classList.toggle("bg-brand-50", isActive);
        button.classList.toggle("text-brand-600", isActive);
    });
    applyPlanLockState();
    lucide.createIcons();
}

function selectPlan(plan, notify = true) {
    const user = DataService.getCurrentUser();
    if (!user) return;

    const normalizedPlan = plan === "Plus" ? "Premium" : plan;
    localStorage.setItem(`sp_confirmed_plan_${user.id}`, normalizedPlan);
    user.plano = normalizedPlan;
    DataService.setCurrentUser(user);
    updatePlanCards(normalizedPlan);
    applyPlanLockState();
    renderDependents();
    document.getElementById("card-plan").textContent = "Plano " + normalizedPlan;
    if (notify) showToast(`Plano ${normalizedPlan} selecionado`, "success");
}

function getDependentLimit(plan) {
    return { "Básico": 2, Premium: 4, "Premium Saúde Plus": 6 }[plan] || 0;
}

function getPlanLimit(plan = getSelectedPlan()) {
    return {
        "Básico": 10,
        Premium: 20,
        "Premium Saúde Plus": Infinity,
    }[plan] ?? 0;
}

function getMonthlyUsageCount(user = DataService.getCurrentUser()) {
    if (!user) return 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthMatches = (value) => {
        if (!value) return false;
        const date = new Date(`${value}T00:00:00`);
        return date.getFullYear() === currentYear && date.getMonth() === currentMonth;
    };

    const appointments = DataService.getAppointments().filter((appointment) => {
        return appointment.userId === user.id && monthMatches(appointment.date);
    });
    const exams = DataService.getExams().filter((exam) => exam.userId === user.id && monthMatches(exam.date));

    return appointments.length + exams.length;
}

function getPlanUpgradeMessage(plan = getSelectedPlan()) {
    if (!plan) return "Selecione um plano antes de agendar.";
    if (plan === "Básico") return "Você atingiu o limite mensal do plano Básico. Atualize para Premium para continuar agendando mais consultas, exames e teleconsultas.";
    if (plan === "Premium") return "Você atingiu o limite mensal do plano Premium. Atualize para Premium Saúde Plus para ter acesso ilimitado.";
    return "Seu plano atual já inclui uso ilimitado.";
}

function canScheduleWithCurrentPlan() {
    const user = DataService.getCurrentUser();
    const plan = getSelectedPlan(user);
    if (!plan) {
        showToast("Selecione um plano antes de agendar.", "error");
        showDashSection("dash-plans");
        return false;
    }

    const limit = getPlanLimit(plan);
    if (!Number.isFinite(limit)) return true;

    const usage = getMonthlyUsageCount(user);
    if (usage >= limit) {
        showToast(getPlanUpgradeMessage(plan), "error");
        showDashSection("dash-plans");
        return false;
    }

    return true;
}

function renderPlanDependentLimits() {
    document.querySelectorAll("#plans-section .bg-white.rounded-2xl, #dash-plans [data-plan-card]").forEach((card) => {
        if (card.querySelector(".plan-dependent-limit")) return;
        const plan = card.querySelector("h3")?.textContent.trim();
        const limit = getDependentLimit(plan);
        if (!limit) return;
        const price = card.querySelector(".text-3xl.font-extrabold, .text-lg.font-extrabold");
        const info = document.createElement("p");
        info.className = "plan-dependent-limit text-xs text-gray-500 mt-2";
        info.textContent = `Até ${limit} dependentes`;
        price?.after(info);
    });
}

function updatePlanCards(activePlan = "") {
    document.querySelectorAll("[data-plan-card]").forEach((card) => {
        const isSelected = card.dataset.planCard === activePlan;
        card.classList.toggle("border-brand-600", isSelected);
        card.classList.toggle("border-gray-100", !isSelected);
        const label = card.querySelector(".plan-option-label");
        if (label) label.textContent = isSelected ? "Plano atual" : "Selecionar";
    });
}

function renderConvenioDetails() {
    const details = {
        "Hapvida Nosso Plano": "Linha regional para cuidados essenciais.",
        "NotreDame Smart": "Linha regional para consultas e exames.",
        "Unimed regional": "Rede local conforme a cooperativa da região.",
        "Unimed Regional": "Rede local conforme a cooperativa da região.",
        "Unimed nacional": "Maior abrangência, conforme o produto contratado.",
        "Unimed Nacional": "Maior abrangência, conforme o produto contratado.",
        "Amil S380": "Rede ampliada e categoria intermediária.",
        "SulAmérica Exato": "Linha intermediária com opções ampliadas.",
        "Amil One": "Categoria superior com rede e serviços premium.",
        "Bradesco Saúde Nacional Plus": "Rede nacional e categoria diferenciada.",
        "SulAmérica Prestige": "Categoria alta com atendimento premium.",
    };

    document.querySelectorAll("img[alt^=\"Logo \"]").forEach((logo) => {
        const item = logo.closest(".text-center");
        const label = item?.querySelector("span");
        if (!item || !label || item.querySelector(".convenio-detail")) return;
        const name = label.textContent.replace(/\s+/g, " ").trim();
        const detail = document.createElement("small");
        detail.className = "convenio-detail block text-[9px] leading-tight text-gray-400 mt-1";
        detail.textContent = details[name] || "Consulte as condições da operadora.";
        label.after(detail);
    });

    const benefits = {
        "Básico": ["Até 10 agendamentos por mês", "2 consultas pela plataforma/mês", "Rede regional e atendimento essencial"],
        "Premium": ["Até 20 agendamentos por mês", "4 teleconsultas pela plataforma/mês", "Rede ampliada e mais especialistas"],
        "Premium Saúde Plus": ["Consultas, exames e teleconsultas ilimitados", "Exames com desconto e suporte prioritário", "Rede nacional e hospitais de referência"],
    };
    document.querySelectorAll("[data-plan-card]").forEach((card) => {
        if (card.querySelector(".plan-benefits")) return;
        const price = card.querySelector(".text-lg.font-extrabold");
        const access = document.createElement("p");
        access.className = "plan-access text-xs text-gray-400 mt-1";
        access.textContent = "acesso à plataforma Saúde Plus";
        price?.after(access);
        const list = document.createElement("ul");
        list.className = "plan-benefits space-y-2 mt-4 text-sm text-gray-600";
        list.innerHTML = benefits[card.dataset.planCard].map((benefit) => `<li class="flex items-start gap-2"><span class="text-mint-600">✓</span><span>${benefit}</span></li>`).join("");
        price?.before(list);
        if (card.dataset.planCard === "Premium" && !card.querySelector(".plan-popular-badge")) {
            const badge = document.createElement("span");
            badge.className = "plan-popular-badge absolute -top-3 left-6 bg-brand-600 text-white text-xs font-bold px-3 py-1 rounded-full";
            badge.textContent = "MAIS POPULAR";
            card.append(badge);
        }
    });
    renderPlanDependentLimits();
}

let selectedPaymentMethod = "credit";
let pendingPlan = "";

function showPlanManagementOptions() {
    const isCurrentPlan = pendingPlan && getSelectedPlan() === pendingPlan;
    const methods = document.getElementById("payment-methods");
    const form = document.getElementById("payment-form");
    const actions = document.getElementById("plan-management-actions");

    methods.classList.toggle("hidden", isCurrentPlan);
    form.classList.toggle("hidden", isCurrentPlan);
    actions.classList.toggle("hidden", !isCurrentPlan);

    if (isCurrentPlan) {
        document.querySelector("#modal-payment h3").textContent = "Gerenciar plano";
        document.getElementById("payment-plan-name").textContent = pendingPlan;
    } else {
        document.querySelector("#modal-payment h3").textContent = "Assinar plano";
    }
    lucide.createIcons();
}

function cancelCurrentPlan() {
    const user = DataService.getCurrentUser();
    if (!user) return;

    localStorage.removeItem(`sp_confirmed_plan_${user.id}`);
    user.plano = "Nenhum plano contratado";
    DataService.setCurrentUser(user);
    closeModal("modal-payment");
    renderDashboard();
    showToast("Plano cancelado com sucesso", "success");
}

function openPayment(plan) {
    if (!DataService.getCurrentUser()) {
        showPage("page-login");
        showToast("Entre na sua conta para escolher um plano", "error");
        return;
    }

    pendingPlan = plan;
    const currentPlan = getSelectedPlan();
    const isCurrentPlan = currentPlan === plan;

    document.getElementById("payment-plan-name").textContent = plan;
    selectPaymentMethod("credit");
    document.getElementById("payment-form").reset();
    document.getElementById("card-brand").textContent = "Bandeira";

    if (isCurrentPlan) {
        document.querySelector("#modal-payment h3").textContent = "Gerenciar plano";
    } else {
        document.querySelector("#modal-payment h3").textContent = "Assinar plano";
    }

    const methods = document.getElementById("payment-methods");
    const form = document.getElementById("payment-form");
    const actions = document.getElementById("plan-management-actions");
    methods.classList.toggle("hidden", isCurrentPlan);
    form.classList.toggle("hidden", isCurrentPlan);
    actions.classList.toggle("hidden", !isCurrentPlan);

    document.getElementById("modal-payment").classList.remove("hidden");
    lucide.createIcons();
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;
    document.querySelectorAll(".payment-method").forEach((button) => {
        const selected = button.dataset.paymentMethod === method;
        button.classList.toggle("border-brand-500", selected);
        button.classList.toggle("bg-brand-50", selected);
        button.classList.toggle("text-brand-700", selected);
        button.classList.toggle("border-gray-200", !selected);
        button.classList.toggle("text-gray-600", !selected);
    });
    document.getElementById("card-payment-fields").classList.toggle("hidden", method === "pix");
    document.getElementById("pix-payment-fields").classList.toggle("hidden", method !== "pix");
    document.querySelectorAll("#card-payment-fields input").forEach((input) => {
        input.required = method !== "pix";
    });
}

function detectCardBrand(number) {
    const digits = number.replace(/\D/g, "");
    if (/^4/.test(digits)) return "Visa";
    if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
    if (/^(34|37)/.test(digits)) return "American Express";
    if (/^(606282|3841)/.test(digits)) return "Hipercard";
    if (/^(4011|4312|4389|4514|4576|5041|5066|5090|6277|6362|6363|650[0-5]|6516|6550)/.test(digits)) return "Elo";
    return digits.length >= 4 ? "Bandeira não identificada" : "Bandeira";
}

function formatCardNumber(value) {
    return value.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatCardExpiry(value) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

document.getElementById("card-number").addEventListener("input", function () {
    this.value = formatCardNumber(this.value);
    document.getElementById("card-brand").textContent = detectCardBrand(this.value);
});
document.getElementById("card-expiry").addEventListener("input", function () {
    this.value = formatCardExpiry(this.value);
});

document.getElementById("payment-form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (selectedPaymentMethod !== "pix") {
        const number = document.getElementById("card-number").value.replace(/\D/g, "");
        if (number.length < 13) {
            showToast("Informe um número de cartão válido", "error");
            return;
        }
        const holder = document.getElementById("card-holder").value.trim();
        const expiry = document.getElementById("card-expiry").value;
        const expiryMatch = expiry.match(/^(0[1-9]|1[0-2])\/\d{2}$/);
        const cvv = document.getElementById("card-cvv").value.replace(/\D/g, "");
        if (!holder || !expiryMatch || cvv.length < 3) {
            showToast("Confira titular, validade e código de segurança", "error");
            return;
        }
        const user = DataService.getCurrentUser();
        localStorage.setItem(`sp_card_${user.id}`, JSON.stringify({
            brand: detectCardBrand(number),
            last4: number.slice(-4),
            holder,
            expiry,
        }));
    }
    selectPlan(pendingPlan, false);
    closeModal("modal-payment");
    renderSavedCard();
    showToast(`Plano ${pendingPlan} assinado via ${selectedPaymentMethod === "pix" ? "Pix" : selectedPaymentMethod === "debit" ? "cartão de débito" : "cartão de crédito"}`, "success");
});

document.getElementById("btn-change-payment-method").addEventListener("click", function () {
    const methods = document.getElementById("payment-methods");
    const form = document.getElementById("payment-form");
    const actions = document.getElementById("plan-management-actions");
    methods.classList.remove("hidden");
    form.classList.remove("hidden");
    actions.classList.add("hidden");
    document.querySelector("#modal-payment h3").textContent = "Trocar forma de pagamento";
    selectPaymentMethod(selectedPaymentMethod || "credit");
    lucide.createIcons();
});

document.getElementById("btn-cancel-plan").addEventListener("click", function () {
    const user = DataService.getCurrentUser();
    if (!user) return;
    localStorage.removeItem(`sp_confirmed_plan_${user.id}`);
    user.plano = "Nenhum plano contratado";
    DataService.setCurrentUser(user);
    closeModal("modal-payment");
    renderDashboard();
    showToast("Plano cancelado com sucesso", "success");
});

function toggleMobileMenu() {
    document.getElementById("mobile-menu").classList.toggle("hidden");
}

function getSelectedPlan(user = DataService.getCurrentUser()) {
    if (!user) return "";
    const plan = localStorage.getItem(`sp_confirmed_plan_${user.id}`) || user.plano || "";
    return ["", "Nenhum plano contratado", "Nenhum plano"].includes(plan) ? "" : plan;
}

function hasSelectedPlan(user = DataService.getCurrentUser()) {
    return Boolean(getSelectedPlan(user));
}

function applyPlanLockState() {
    const unlocked = hasSelectedPlan();
    document.querySelectorAll(".dash-nav-btn").forEach((button) => {
        const match = button.getAttribute("onclick")?.match(/showDashSection\('([^']+)'/);
        const sectionId = match ? match[1] : "";
        const isLocked = !unlocked && !["dash-plans", "dash-profile"].includes(sectionId);
        button.classList.toggle("plan-locked", isLocked);
        button.classList.toggle("opacity-40", isLocked);
        button.classList.toggle("pointer-events-none", isLocked);
        button.setAttribute("aria-disabled", String(isLocked));
    });

    document.querySelectorAll(".dash-section").forEach((section) => {
        const isLocked = !unlocked && !["dash-plans", "dash-profile"].includes(section.id);
        section.classList.toggle("plan-locked", isLocked);
        section.classList.toggle("opacity-40", isLocked);
        section.style.filter = isLocked ? "grayscale(0.08) brightness(0.9)" : "";
        section.style.pointerEvents = isLocked ? "none" : "auto";
    });
}

function requirePlanAccess(actionLabel = "esta área") {
    if (hasSelectedPlan()) return true;
    showToast(`Selecione um plano antes de acessar ${actionLabel}.`, "error");
    showDashSection("dash-plans");
    return false;
}


// ==================== 5. AUTENTICAÇÃO ====================
document.getElementById("register-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const usuario = {
        nome: document.getElementById("reg-name").value.trim(),
        email: document.getElementById("reg-email").value.trim(),
        telefone: document.getElementById("reg-phone").value.trim(),
        endereco: document.getElementById("reg-address").value.trim(),
        senha: document.getElementById("reg-password").value,
    };
    const confirmacaoSenha = document.getElementById("reg-password-confirm").value;
    if (usuario.senha.length < 6) {
        showToast("A senha deve ter pelo menos 6 caracteres", "error");
        return;
    }
    if (usuario.senha !== confirmacaoSenha) {
        showToast("As senhas não coincidem", "error");
        return;
    }
    usuario.plano = "Nenhum plano contratado";

    try {
        const resposta = await fetch(`${API_BASE_URL}/cadastro`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(usuario),
        });
        const dados = await resposta.json();

        showToast(dados.mensagem, resposta.ok ? "success" : "error");
        if (resposta.ok) this.reset();
    } catch (erro) {
        console.error(erro);
        showToast("Erro ao conectar com o servidor", "error");
    }
});

document.getElementById("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const senha = document.getElementById("login-password").value;

    try {
        const resposta = await fetch(`${API_BASE_URL}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, senha }),
        });
        const dados = await resposta.json();

        if (!dados.success) {
            showToast(dados.mensagem, "error");
            return;
        }

        DataService.setCurrentUser(dados.usuario);
        showToast("Login realizado!", "success");
        this.reset();
        showPage("page-dashboard");
    } catch (erro) {
        console.error(erro);
        showToast("Erro ao conectar com o servidor", "error");
    }
});

document.getElementById("password-recovery-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = document.getElementById("recovery-email").value.trim().toLowerCase();
    const telefone = document.getElementById("recovery-phone").value.trim();
    const usingPhone = !document.getElementById("recovery-phone-field").classList.contains("hidden");
    if ((!usingPhone && !email) || (usingPhone && telefone.replace(/\D/g, "").length < 10)) {
        showToast(usingPhone ? "Informe um telefone válido" : "Informe um e-mail válido", "error");
        return;
    }
    try {
        const resposta = await fetch(`${API_BASE_URL}/solicitar-recuperacao`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, ...(usingPhone ? { telefone } : {}) }),
        });
        const dados = await resposta.json();
        if (!resposta.ok) {
            showToast(dados.mensagem || "Não foi possível validar os dados", "error");
            return;
        }
        const recoveryEmail = dados.email || email;
        localStorage.setItem("sp_recovery_email", recoveryEmail);
        localStorage.setItem("sp_recovery_phone", telefone);
        document.getElementById("password-recovery-form").classList.add("hidden");
        document.getElementById("password-token-form").classList.remove("hidden");
        if (dados.token) showToast(`Código de demonstração: ${dados.token}`, "success");
        else showToast("Código de recuperação enviado", "success");
    } catch (erro) {
        const usuarios = DataService.getUsers();
        const usuario = usuarios.find((item) => (!usingPhone && item.email.toLowerCase() === email) || (usingPhone && item.telefone.replace(/\D/g, "") === telefone.replace(/\D/g, "")));
        if (!usuario) {
            showToast("E-mail e telefone não conferem", "error");
            return;
        }
        const token = String(Math.floor(100000 + Math.random() * 900000));
        localStorage.setItem("sp_recovery_token", token);
        localStorage.setItem("sp_recovery_email", usuario.email);
        document.getElementById("password-recovery-form").classList.add("hidden");
        document.getElementById("password-token-form").classList.remove("hidden");
        showToast(`Código de demonstração: ${token}`, "success");
    }
});

document.getElementById("password-token-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = localStorage.getItem("sp_recovery_email");
    const telefone = localStorage.getItem("sp_recovery_phone");
    const token = document.getElementById("recovery-token").value.trim();
    const senha = document.getElementById("recovery-password").value;
    const confirmacao = document.getElementById("recovery-password-confirm").value;
    if (senha.length < 6) return showToast("A nova senha deve ter pelo menos 6 caracteres", "error");
    if (senha !== confirmacao) return showToast("As senhas não coincidem", "error");
    try {
        const resposta = await fetch(`${API_BASE_URL}/confirmar-recuperacao`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, telefone: telefone || null, token, senha }),
        });
        const dados = await resposta.json();
        if (!resposta.ok) return showToast(dados.mensagem || "Código inválido ou expirado", "error");
    } catch (erro) {
        if (localStorage.getItem("sp_recovery_token") !== token) return showToast("Código inválido ou expirado", "error");
        const usuarios = DataService.getUsers();
        const usuario = usuarios.find((item) => item.email.toLowerCase() === email);
        if (!usuario) return showToast("Usuário não encontrado no modo local", "error");
        usuario.senha = senha;
        DataService.saveUsers(usuarios);
    }
    localStorage.removeItem("sp_recovery_email");
    localStorage.removeItem("sp_recovery_phone");
    localStorage.removeItem("sp_recovery_token");
    document.getElementById("login-email").value = localStorage.getItem("sp_recovery_email") || email;
    this.reset();
    hidePasswordRecovery();
    showToast("Senha atualizada com sucesso. Faça login novamente.", "success");
});

function enterDemoMode() {
    const usuarioDemo = {
        id: "demo",
        nome: "Usuário Demonstração",
        email: "demo@saudeplus.local",
        telefone: "(11) 99999-0000",
        endereco: "Endereço de demonstração",
        plano: "",
        modoDemo: true,
    };

    localStorage.removeItem(`sp_confirmed_plan_${usuarioDemo.id}`);
    DataService.setCurrentUser(usuarioDemo);
    showToast("Modo demonstração ativado. Escolha um plano para liberar todas as áreas.", "success");
    showPage("page-dashboard");
}

function logout() {
    DataService.clearCurrentUser();
    showPage("page-landing");
    showToast("Sessão encerrada", "success");
}


// ==================== 6. DASHBOARD ====================
function renderDashboard() {
    const user = DataService.getCurrentUser();
    if (!user) {
        showPage("page-landing");
        return;
    }

    // Saudação e avatar
    document.getElementById("dash-greeting").textContent = `Olá, ${user.nome.split(" ")[0]}!`;
    document.getElementById("user-avatar").textContent = user.nome.charAt(0).toUpperCase();
    document.getElementById("user-avatar-icon").setAttribute("data-lucide", getProfileIcon(user.profileIcon));

    // Carteirinha digital
    document.getElementById("card-name").textContent = user.nome;
    document.getElementById("card-email").textContent = user.email;
    const planoPago = getSelectedPlan(user);
    user.plano = planoPago;
    DataService.setCurrentUser(user);
    document.getElementById("card-plan").textContent = planoPago ? "Plano " + planoPago : "Nenhum plano contratado";
    document.getElementById("card-id").textContent = "SP" + String(user.id).padStart(6, "0");

    const validade = new Date();
    validade.setFullYear(validade.getFullYear() + 1);
    document.getElementById("card-valid").textContent = validade.toLocaleDateString("pt-BR", {
        month: "2-digit",
        year: "numeric",
    });
    updatePlanCards(planoPago);
    applyPlanLockState();
    if (!planoPago) showDashSection("dash-plans");

    // Estatísticas + listas (filtradas pelo usuário logado)
    const appointments = DataService.getAppointments().filter((a) => a.userId === user.id);
    const exams = DataService.getExams().filter((e) => e.userId === user.id);
    const activeTeleconsultas = appointments.filter((appointment) => appointment.type === "Teleconsulta" && isTeleconsultaScheduled(appointment));

    document.getElementById("stat-appointments").textContent = appointments.length;
    document.getElementById("stat-exams").textContent = exams.length;
    document.getElementById("stat-tele").textContent = activeTeleconsultas.length;

    renderAppointments(appointments);
    renderExams(exams);
    renderTeleconsultas(appointments);
    renderRecentItems(appointments, exams);
    renderHospitals();
    renderContacts(appointments);
    renderDependents();
    fillProfile(user);
}

function isTeleconsultaScheduled(appointment, referenceDate = new Date()) {
    if (!appointment || appointment.type !== "Teleconsulta") return false;
    if (isTeleconsultaSessionEnded(appointment)) return false;

    const scheduledAt = new Date(`${appointment.date}T${appointment.time}`);
    const toleranceWindow = new Date(scheduledAt.getTime() + 10 * 60000);
    return referenceDate <= toleranceWindow;
}

function renderTeleconsultas(appointments) {
    const container = document.getElementById("teleconsultas-agendadas");
    if (!container) return;

    const teleconsultas = appointments.filter((appointment) => isTeleconsultaScheduled(appointment));
    const now = new Date();

    if (!teleconsultas.length) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <p class="text-gray-500">Nenhuma teleconsulta agendada.</p>
            </div>`;
        return;
    }

    const orderedTeleconsultas = [...teleconsultas].sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));

    container.innerHTML = orderedTeleconsultas
        .map((appointment) => {
            const sessionEnded = isTeleconsultaSessionEnded(appointment);
            const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}`);
            const canOpen = !sessionEnded && now >= appointmentDateTime && now <= new Date(appointmentDateTime.getTime() + 10 * 60000);
            return `
                <div class="bg-white rounded-2xl border border-gray-100 p-4 flex items-center justify-between gap-4">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                            <i data-lucide="video" class="w-5 h-5 text-purple-600"></i>
                        </div>
                        <div class="min-w-0">
                            <p class="font-bold text-gray-900 truncate">Dr. ${appointment.doctor.replace("Dr. ", "").replace("Dra. ", "")}</p>
                            <p class="text-sm text-gray-500">${appointment.specialty} • Teleconsulta</p>
                            <p class="text-xs text-gray-400 mt-1">${formatDate(appointment.date)} às ${appointment.time}</p>
                            ${sessionEnded ? '<p class="text-xs text-red-600 mt-1 font-semibold">Sessão encerrada</p>' : canOpen ? '<p class="text-xs text-green-600 mt-1 font-semibold">Atendimento disponível agora</p>' : ""}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        ${canOpen ? `<button onclick="openScheduledTeleconsulta('${appointment.id}')" class="btn-primary text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
                            <i data-lucide="video" class="w-4 h-4"></i>
                            Iniciar chamada
                        </button>` : ""}
                        <button onclick="confirmDelete('appointment','${appointment.id}')" class="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-500 transition">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>`;
        })
        .join("");

    lucide.createIcons();
}

function getTeleconsultaSessionKey(appointmentId) {
    const user = DataService.getCurrentUser();
    if (!user || !appointmentId) return "";
    return `sp_tele_session_${user.id}_${appointmentId}`;
}

function isTeleconsultaSessionEnded(appointment) {
    if (!appointment?.id) return false;
    const key = getTeleconsultaSessionKey(appointment.id);
    if (!key) return false;
    return localStorage.getItem(key) === "ended";
}

function markTeleconsultaSessionEnded(appointmentId) {
    if (!appointmentId) return;
    const key = getTeleconsultaSessionKey(appointmentId);
    if (!key) return;
    localStorage.setItem(key, "ended");
}

function openScheduledTeleconsulta(appointmentId) {
    const user = DataService.getCurrentUser();
    const appointments = DataService.getAppointments().filter((item) => item.userId === user.id);
    const appointment = appointments.find((item) => item.id === appointmentId);

    if (!appointment) {
        showToast("Teleconsulta não encontrada.", "error");
        return;
    }

    if (isTeleconsultaSessionEnded(appointment)) {
        showToast("Sessão encerrada", "error");
        renderDashboard();
        return;
    }

    const scheduledAt = new Date(`${appointment.date}T${appointment.time}`);
    const now = new Date();
    const timeoutLimit = new Date(scheduledAt.getTime() + 10 * 60000);

    if (now > timeoutLimit) {
        markTeleconsultaSessionEnded(appointment.id);
        showToast("Sessão encerrada", "error");
        renderDashboard();
        return;
    }

    document.getElementById("tele-specialty").value = appointment.specialty;
    document.getElementById("tele-doctor-name").textContent = appointment.doctor;
    document.getElementById("tele-doctor-spec").textContent = appointment.specialty;
    activeTeleconsultaId = appointment.id;
    showPage("page-teleconsulta");
    if (teleTimer) {
        clearInterval(teleTimer);
        teleTimer = null;
    }
    teleSeconds = 0;
    document.getElementById("tele-timer").textContent = "00:00";
    teleTimer = setInterval(() => {
        teleSeconds++;
        const minutos = String(Math.floor(teleSeconds / 60)).padStart(2, "0");
        const segundos = String(teleSeconds % 60).padStart(2, "0");
        document.getElementById("tele-timer").textContent = `${minutos}:${segundos}`;
    }, 1000);
}

const hospitalsDB = [
    { name: "Hospital Vida Nova", distance: 2.4, type: "Hospital geral", plan: "Plus Saúde" },
    { name: "Clínica Bem-Estar", distance: 6.8, type: "Pronto atendimento", plan: "Amil, Bradesco Saúde" },
    { name: "Hospital São Lucas", distance: 12.5, type: "Hospital geral", plan: "Unimed, SulAmérica" },
    { name: "Centro Médico Aurora", distance: 22.1, type: "Especialidades", plan: "NotreDame, Plus Saúde" },
];

function renderHospitals() {
    const container = document.getElementById("hospital-list");
    if (!container) return;
    const radius = Number(document.getElementById("hospital-radius").value);
    const user = DataService.getCurrentUser();
    const address = (user?.endereco || user?.address || "").trim().toLowerCase();
    const addressHash = [...address].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
    const available = hospitalsDB.map((hospital, index) => ({
        ...hospital,
        distance: Number((hospital.distance * (0.75 + ((addressHash + index * 53) % 51) / 100)).toFixed(1)),
    })).filter((hospital) => hospital.distance <= radius);
    container.innerHTML = available.length ? available.map((hospital) => `
        <article class="bg-white rounded-2xl border border-gray-100 p-5 card-hover flex items-start justify-between gap-4">
            <div class="flex gap-3"><div class="w-11 h-11 rounded-xl bg-brand-100 flex items-center justify-center" aria-hidden="true"><svg class="w-8 h-8 text-brand-600" viewBox="0 0 64 64" fill="currentColor"><path d="M4 26h16v30H4zM44 26h16v30H44zM20 20h24v36H20z"></path><path fill="white" d="M8 31h4v5H8zM14 31h4v5h-4zM8 40h4v5H8zM14 40h4v5h-4zM8 49h4v5H8zM14 49h4v5h-4zM24 26h5v5h-5zM35 26h5v5h-5zM24 35h5v5h-5zM35 35h5v5h-5zM24 44h5v5h-5zM35 44h5v5h-5zM27 49h10v7H27zM48 31h4v5h-4zM54 31h4v5h-4zM48 40h4v5h-4zM54 40h4v5h-4zM48 49h4v5h-4zM54 49h4v5h-4z"></path><circle cx="32" cy="11" r="9" fill="white"></circle><circle cx="32" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="2"></circle><path d="M29 6h6v3h3v5h-3v3h-6v-3h-3V9h3z"></path></svg></div><div><p class="font-bold text-gray-900">${hospital.name}</p><p class="text-sm text-gray-500">${hospital.type}</p><p class="text-xs text-gray-400 mt-1">Credenciado: ${hospital.plan}</p></div></div><span class="text-sm font-bold text-brand-600 whitespace-nowrap">${hospital.distance} km</span>
        </article>`).join("") : `<div class="bg-white rounded-2xl border border-gray-100 p-8 text-center md:col-span-2"><p class="text-gray-500">Nenhum hospital encontrado neste raio.</p></div>`;
    lucide.createIcons();
}

function renderContacts(appointments) {
    const container = document.getElementById("contacts-list");
    if (!container) return;
    const contacts = [...new Map(appointments.map((appointment) => [appointment.doctor, appointment])).values()];
    container.innerHTML = contacts.length ? contacts.map((contact) => `
        <article class="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between gap-4"><div class="flex items-center gap-3"><div class="w-11 h-11 rounded-full bg-mint-100 flex items-center justify-center"><i data-lucide="stethoscope" class="w-5 h-5 text-mint-600"></i></div><div><p class="font-bold text-gray-900">${contact.doctor}</p><p class="text-sm text-gray-500">${contact.specialty}</p><p class="text-xs text-mint-600 mt-1">Disponível para conversa</p></div></div><button onclick="openChat('${contact.doctor}')" class="btn-primary text-white px-3 py-2 rounded-xl text-sm flex items-center gap-2"><i data-lucide="message-circle" class="w-4 h-4"></i> Falar</button></article>`).join("") : `<div class="bg-white rounded-2xl border border-gray-100 p-8 text-center md:col-span-2"><p class="text-gray-500">Seus médicos aparecerão aqui após uma consulta.</p></div>`;
    lucide.createIcons();
}

function renderDependents() {
    const container = document.getElementById("dependents-list");
    if (!container) return;
    const dependents = DataService.getUserData("dependents");
    const user = DataService.getCurrentUser();
    const activePlan = localStorage.getItem(`sp_confirmed_plan_${user?.id}`) || user?.plano || "";
    const limit = getDependentLimit(activePlan);
    const limitInfo = document.getElementById("dependent-limit-info");
    if (limitInfo) limitInfo.textContent = limit ? `${dependents.length} de ${limit} dependentes utilizados` : "Escolha um plano para adicionar dependentes";
    container.innerHTML = dependents.length ? dependents.map((person, index) => {
        const isChild = person.type === "Pediatria";
        const isAdult = person.type === "Adulto";
        const icon = isChild ? "baby" : "user";
        const iconColor = isChild ? "text-brand-600" : isAdult ? "text-mint-600" : "text-orange-600";
        const iconBackground = isChild ? "bg-brand-100" : isAdult ? "bg-mint-100" : "bg-orange-100";
        const targetId = person.id || "";
        return `<article class="dependent-card bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between gap-4"><div class="dependent-card-info flex min-w-0 items-center gap-4"><div class="w-12 h-12 rounded-full ${iconBackground} flex-shrink-0 flex items-center justify-center"><i data-lucide="${icon}" class="w-6 h-6 ${iconColor}"></i></div><div class="min-w-0"><p class="font-bold text-gray-900 truncate">${person.name}</p><p class="text-sm text-gray-500 truncate">${person.type} • ${person.relation}</p>${!isChild ? `<p class="text-xs text-gray-500 mt-1">Acompanhante: ${person.companion ? "Sim" : "Não"}</p>` : ""}</div></div><button type="button" onclick="confirmDelete('dependent', '${targetId}', ${index})" class="dependent-delete-button flex-shrink-0 w-10 h-10 rounded-xl hover:bg-red-50 text-red-500 hover:text-red-600 transition flex items-center justify-center" aria-label="Excluir ${person.name}" title="Excluir dependente"><i data-lucide="trash-2" class="w-5 h-5"></i></button></article>`;
    }).join("") : `<div class="bg-white rounded-2xl border border-gray-100 p-8 text-center md:col-span-2"><p class="text-gray-500">Adicione uma criança ou pessoa idosa para cuidar dela pelo app.</p></div>`;
    lucide.createIcons();
}

function addDependent() {
    if (!requirePlanAccess("Dependentes")) return;
    const user = DataService.getCurrentUser();
    const dependents = DataService.getUserData("dependents");
    const activePlan = localStorage.getItem(`sp_confirmed_plan_${user?.id}`) || user?.plano || "";
    const limit = getDependentLimit(activePlan);
    if (!limit) {
        showToast("Escolha um plano antes de adicionar dependentes", "error");
        showDashSection("dash-plans");
        return;
    }
    if (dependents.length >= limit) {
        showToast(`O plano ${activePlan} permite até ${limit} dependentes`, "error");
        return;
    }
    document.getElementById("dependent-form").reset();
    selectDependentType("Pediatria");
    selectLegalResponsibility("Sim");
    selectDependentGender("Masculino");
    document.getElementById("modal-dependent").classList.remove("hidden");
}

function selectDependentType(type) {
    document.getElementById("dependent-type").value = type;
    document.querySelectorAll(".dependent-type-btn").forEach((button) => {
        const selected = button.dataset.type === type;
        button.classList.toggle("border-brand-500", selected);
        button.classList.toggle("bg-brand-50", selected);
        button.classList.toggle("text-brand-700", selected);
        button.classList.toggle("border-gray-200", !selected);
        button.setAttribute("aria-pressed", String(selected));
    });

    const isChild = type === "Pediatria";
    document.getElementById("dependent-name-label").textContent = isChild ? "Nome da Criança" : "Nome da pessoa";
    document.getElementById("dependent-legal-field").classList.toggle("hidden", !isChild);
    document.getElementById("dependent-relation-field").classList.toggle("hidden", isChild);
    document.getElementById("dependent-gender-field").classList.toggle("hidden", isChild);
    document.getElementById("dependent-companion-field").classList.toggle("hidden", type !== "Geriatria");
}

function selectDependentGender(gender) {
    document.getElementById("dependent-gender").value = gender;
    document.querySelectorAll(".dependent-gender-btn").forEach((button) => {
        const selected = button.dataset.gender === gender;
        button.classList.toggle("border-brand-500", selected);
        button.classList.toggle("bg-brand-50", selected);
        button.classList.toggle("text-brand-700", selected);
        button.classList.toggle("border-gray-200", !selected);
        button.setAttribute("aria-pressed", String(selected));
    });
}

function selectLegalResponsibility(value) {
    document.getElementById("dependent-legal").value = value;
    document.querySelectorAll(".dependent-legal-btn").forEach((button) => {
        const selected = button.dataset.value === value;
        button.classList.toggle("border-brand-500", selected);
        button.classList.toggle("bg-brand-50", selected);
        button.classList.toggle("text-brand-700", selected);
        button.classList.toggle("border-gray-200", !selected);
        button.setAttribute("aria-pressed", String(selected));
    });
}

document.getElementById("dependent-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const type = document.getElementById("dependent-type").value;
    const relation = document.getElementById("dependent-relation").value.trim() || "Responsável";
    const legal = document.getElementById("dependent-legal").value;
    const dependents = DataService.getUserData("dependents");
    dependents.push({
        name: document.getElementById("dependent-name").value.trim(),
        id: "DEP" + Date.now(),
        cpf: document.getElementById("dependent-cpf").value.trim(),
        type,
        gender: document.getElementById("dependent-gender").value,
        relation: type === "Pediatria" ? `Responsável legal: ${legal}` : relation,
        companion: type === "Geriatria" && document.getElementById("dependent-companion").checked,
    });
    DataService.saveUserData("dependents", dependents);
    closeModal("modal-dependent");
    renderDependents();
    showToast("Pessoa adicionada", "success");
});

function fillProfile(user) {
    document.getElementById("profile-name").value = user.nome || "";
    document.getElementById("profile-email").value = user.email || "";
    document.getElementById("profile-phone").value = user.telefone || "";
    document.getElementById("profile-address").value = user.endereco || "";
    document.getElementById("profile-password").value = "";
    selectProfileIcon(getProfileIcon(user.profileIcon));
}

function getProfileIcon(icon) {
    return ["user", "smile", "heart", "star", "stethoscope"].includes(icon) ? icon : "user";
}

function setupProfileUi() {
    const profileNav = document.querySelector("button[onclick=\"showDashSection('dash-profile')\"]");
    if (profileNav) profileNav.lastChild.textContent = " Meu Perfil ";

    document.getElementById("dash-profile").innerHTML = `
        <div class="max-w-xl mx-auto mb-6">
            <div><h2 class="text-2xl font-bold text-gray-900">Meu Perfil</h2><p class="text-sm text-gray-500 mt-1">Gerencie seus dados e seu ícone de perfil.</p></div>
        </div>
        <form id="profile-form" class="bg-white rounded-2xl border border-gray-100 p-6 max-w-xl space-y-4">
            <div><p class="block text-sm font-semibold text-gray-700 mb-2">Foto de perfil</p><div class="flex gap-3">
                <button type="button" data-profile-icon="user" onclick="selectProfileIcon('user')" class="profile-icon-btn w-12 h-12 rounded-full border-2 border-brand-500 bg-brand-50 text-brand-600 flex items-center justify-center" aria-label="Ícone homem"><i data-lucide="user" class="w-5 h-5"></i></button>
                <button type="button" data-profile-icon="smile" onclick="selectProfileIcon('smile')" class="profile-icon-btn w-12 h-12 rounded-full border-2 border-gray-200 text-gray-500 flex items-center justify-center" aria-label="Ícone sorriso"><i data-lucide="smile" class="w-5 h-5"></i></button>
                <button type="button" data-profile-icon="heart" onclick="selectProfileIcon('heart')" class="profile-icon-btn w-12 h-12 rounded-full border-2 border-gray-200 text-gray-500 flex items-center justify-center" aria-label="Ícone coração"><i data-lucide="heart" class="w-5 h-5"></i></button>
                <button type="button" data-profile-icon="star" onclick="selectProfileIcon('star')" class="profile-icon-btn w-12 h-12 rounded-full border-2 border-gray-200 text-gray-500 flex items-center justify-center" aria-label="Ícone estrela"><i data-lucide="star" class="w-5 h-5"></i></button>
                <button type="button" data-profile-icon="stethoscope" onclick="selectProfileIcon('stethoscope')" class="profile-icon-btn w-12 h-12 rounded-full border-2 border-gray-200 text-gray-500 flex items-center justify-center" aria-label="Ícone estetoscópio"><i data-lucide="stethoscope" class="w-5 h-5"></i></button>
                <input type="hidden" id="profile-icon" value="user">
            </div></div>
            <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-name">Nome completo</label><input id="profile-name" required class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
            <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-email">E-mail</label><input id="profile-email" type="email" required class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
            <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-password">Nova senha</label><input id="profile-password" type="password" minlength="6" class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none" placeholder="Deixe em branco para manter a atual"></div>
            <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-phone">Telefone</label><input id="profile-phone" required maxlength="15" inputmode="numeric" class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
            <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-address">Endereço</label><input id="profile-address" required class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
            <button class="btn-primary text-white font-semibold px-5 py-3 rounded-xl text-sm">Salvar alterações</button>
        </form>
        <div id="saved-card-panel" class="bg-white rounded-2xl border border-gray-100 p-6 max-w-xl mx-auto mt-5"></div>`;

    document.getElementById("profile-form").addEventListener("submit", saveProfile);
    lucide.createIcons();
    renderSavedCard();
}

function getSavedCard() {
    const user = DataService.getCurrentUser();
    return user ? JSON.parse(localStorage.getItem(`sp_card_${user.id}`) || "null") : null;
}

function renderSavedCard() {
    const panel = document.getElementById("saved-card-panel");
    const card = getSavedCard();
    if (!panel) return;
    panel.innerHTML = card ? `<div class="flex items-start justify-between gap-4"><div><p class="text-sm font-semibold text-gray-700">Cartão cadastrado</p><p class="text-lg font-bold text-gray-900 mt-2">${card.brand} •••• ${card.last4}</p><p class="text-xs text-gray-500 mt-1">Titular: ${escapeHtml(card.holder)} | Validade: ${card.expiry}</p></div><div class="flex gap-2"><button type="button" onclick="editSavedCard()" class="text-xs font-semibold text-brand-600 hover:underline">Alterar</button><button type="button" onclick="removeSavedCard()" class="text-xs font-semibold text-red-500 hover:underline">Excluir</button></div></div>` : `<p class="text-sm font-semibold text-gray-700">Cartão cadastrado</p><p class="text-sm text-gray-500 mt-2">Nenhum cartão salvo. Ele aparecerá aqui após uma assinatura.</p>`;
}

function editSavedCard() {
    openPayment(pendingPlan || "Premium");
    const card = getSavedCard();
    if (!card) return;
    document.getElementById("card-holder").value = card.holder;
    document.getElementById("card-expiry").value = card.expiry;
}

function removeSavedCard() {
    const user = DataService.getCurrentUser();
    if (!user) return;
    localStorage.removeItem(`sp_card_${user.id}`);
    renderSavedCard();
    showToast("Cartão excluído", "success");
}

function selectProfileIcon(icon) {
    document.getElementById("profile-icon").value = icon;
    document.querySelectorAll(".profile-icon-btn").forEach((button) => {
        const selected = button.dataset.profileIcon === icon;
        button.classList.toggle("border-brand-500", selected);
        button.classList.toggle("bg-brand-50", selected);
        button.classList.toggle("text-brand-600", selected);
        button.classList.toggle("border-gray-200", !selected);
        button.classList.toggle("text-gray-500", !selected);
    });
}

function saveProfile(e) {
    e.preventDefault();
    const user = DataService.getCurrentUser();
    user.nome = document.getElementById("profile-name").value.trim();
    user.email = document.getElementById("profile-email").value.trim();
    user.telefone = document.getElementById("profile-phone").value.trim();
    user.endereco = document.getElementById("profile-address").value.trim();
    user.profileIcon = document.getElementById("profile-icon").value;
    const password = document.getElementById("profile-password").value;
    if (password) user.senha = password;
    DataService.setCurrentUser(user);
    renderDashboard();
    showToast("Perfil atualizado", "success");
}

function openChat(doctor) {
    document.getElementById("chat-messages").dataset.doctor = doctor;
    showDashSection("dash-chat");
    showToast(`Conversa aberta com ${doctor}`, "success");
}

function toggleAssistant() {
    if (!DataService.getCurrentUser()) return;
    document.getElementById("assistant-panel").classList.toggle("hidden");
    lucide.createIcons();
}

function setAssistantVisibility(isVisible) {
    const widget = document.getElementById("assistant-widget");
    if (!widget) return;
    widget.classList.toggle("hidden", !isVisible);
    if (!isVisible) document.getElementById("assistant-panel")?.classList.add("hidden");
}

function showPasswordRecovery() {
    document.getElementById("login-form").classList.add("hidden");
    document.getElementById("password-recovery-form").classList.remove("hidden");
    document.getElementById("password-token-form").classList.add("hidden");
    document.getElementById("recovery-phone-field").classList.add("hidden");
    document.getElementById("recovery-email-field").classList.remove("hidden");
    document.getElementById("recovery-email").required = true;
    document.getElementById("recovery-phone").required = false;
    document.getElementById("recovery-other-method").textContent = "Tentar de outra maneira";
}

function toggleRecoveryPhone() {
    const field = document.getElementById("recovery-phone-field");
    const visible = field.classList.toggle("hidden") === false;
    document.getElementById("recovery-email-field").classList.toggle("hidden", visible);
    document.getElementById("recovery-email").required = !visible;
    document.getElementById("recovery-phone").required = visible;
    document.getElementById("recovery-other-method").textContent = visible ? "Usar apenas e-mail" : "Tentar de outra maneira";
}

function hidePasswordRecovery() {
    document.getElementById("password-recovery-form").classList.add("hidden");
    document.getElementById("password-token-form").classList.add("hidden");
    document.getElementById("login-form").classList.remove("hidden");
}

function renderAppointments(appointments) {
    const container = document.getElementById("appointments-list");
    const orderedAppointments = [...appointments].sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));

    if (!orderedAppointments.length) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <i data-lucide="calendar" class="w-12 h-12 text-gray-300 mx-auto mb-3"></i>
                <p class="text-gray-400">Nenhuma consulta agendada</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    const now = new Date();
    const currentDate = getLocalDateString(now);
    const currentTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });

    container.innerHTML = orderedAppointments
        .map((a) => {
            const isTele = a.type === "Teleconsulta";
            const isSessionEnded = isTeleconsultaSessionEnded(a);
            const isCurrentTeleconsulta = isTele && !isSessionEnded && a.date === currentDate && a.time === currentTime;
            const isWithinTolerance = isTele && !isSessionEnded && a.date === currentDate && getTimeInMinutes(a.time) >= getTimeInMinutes(currentTime) - 10 && getTimeInMinutes(a.time) <= getTimeInMinutes(currentTime) + 10;
            const canStartCall = isTele && !isSessionEnded && isWithinTolerance;

            return `
                <div class="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between card-hover">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl ${isTele ? "bg-purple-100" : "bg-brand-100"} flex items-center justify-center">
                            <i data-lucide="${isTele ? "video" : "stethoscope"}" class="w-6 h-6 ${isTele ? "text-purple-600" : "text-brand-600"}"></i>
                        </div>
                        <div>
                            <p class="font-bold text-gray-900">${a.doctor}</p>
                            <p class="text-sm text-gray-500">${a.specialty} • ${a.type}</p>
                            <p class="text-xs text-gray-400 mt-1">${formatDate(a.date)} às ${a.time}</p>
                            ${isSessionEnded ? '<p class="text-xs text-red-600 mt-1 font-semibold">Sessão encerrada</p>' : isCurrentTeleconsulta ? '<p class="text-xs text-green-600 mt-1 font-semibold">Atendimento disponível agora</p>' : ""}
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${canStartCall ? `<button onclick="openScheduledTeleconsulta('${a.id}')" class="btn-primary text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
                            <i data-lucide="video" class="w-4 h-4"></i>
                            Iniciar chamada
                        </button>` : ""}
                        <button onclick="confirmDelete('appointment','${a.id}')" class="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-500 transition">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>`;
        })
        .join("");
    lucide.createIcons();
}

function renderExams(exams) {
    const container = document.getElementById("exams-list");
    const orderedExams = [...exams].sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));

    if (!orderedExams.length) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <i data-lucide="file-text" class="w-12 h-12 text-gray-300 mx-auto mb-3"></i>
                <p class="text-gray-400">Nenhum exame agendado</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = orderedExams
        .map(
            (e) => `
                <div class="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between card-hover">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-mint-100 flex items-center justify-center">
                            <i data-lucide="file-text" class="w-6 h-6 text-mint-600"></i>
                        </div>
                        <div>
                            <p class="font-bold text-gray-900">${e.examType}</p>
                            <p class="text-xs text-gray-400 mt-1">${formatDate(e.date)} às ${e.time}</p>
                            ${e.notes ? `<p class="text-xs text-gray-400">${e.notes}</p>` : ""}
                        </div>
                    </div>
                    <button onclick="confirmDelete('exam','${e.id}')" class="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-500 transition">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>
                </div>`
        )
        .join("");
    lucide.createIcons();
}

/** Junta consultas + exames num só feed, ordenado por data, mostrando os 5 próximos. */
function renderRecentItems(appointments, exams) {
    const container = document.getElementById("recent-items");

    const todosItens = [
        ...appointments.map((a) => ({
            itemType: "consulta",
            label: `${a.doctor} - ${a.specialty}`,
            dateStr: `${formatDate(a.date)} ${a.time}`,
            date: a.date,
            time: a.time,
        })),
        ...exams.map((e) => ({
            itemType: "exame",
            label: e.examType,
            dateStr: `${formatDate(e.date)} ${e.time}`,
            date: e.date,
            time: e.time,
        })),
    ]
        .sort((a, b) => {
            const dateComparison = new Date(`${b.date}T${b.time || "00:00"}`) - new Date(`${a.date}T${a.time || "00:00"}`);
            return dateComparison;
        })
        .slice(0, 5);

    if (!todosItens.length) {
        container.innerHTML = `<p class="text-gray-400 text-sm text-center py-8">Nenhum compromisso agendado ainda.</p>`;
        return;
    }

    container.innerHTML = todosItens
        .map((i) => {
            const isConsulta = i.itemType === "consulta";
            return `
                <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition">
                    <div class="w-2 h-2 rounded-full ${isConsulta ? "bg-brand-500" : "bg-mint-500"}"></div>
                    <div class="flex-1">
                        <p class="text-sm font-medium text-gray-800">${i.label}</p>
                        <p class="text-xs text-gray-400">${i.dateStr}</p>
                    </div>
                    <span class="text-xs font-medium px-2 py-1 rounded-full ${isConsulta ? "bg-brand-50 text-brand-600" : "bg-mint-50 text-mint-600"}">
                        ${isConsulta ? "Consulta" : "Exame"}
                    </span>
                </div>`;
        })
        .join("");
}

const clinicClosingTime = "19:00";
const appointmentTimeSlots = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"];
const examTimeSlots = ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"];

function getLocalDateString(date = new Date()) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60000);
    return localDate.toISOString().slice(0, 10);
}

function getTimeInMinutes(timeValue) {
    if (!timeValue) return Number.MAX_SAFE_INTEGER;
    const [hours, minutes] = timeValue.split(":").map(Number);
    return hours * 60 + minutes;
}

function getAvailableTimeSlots(dateValue, slots) {
    const dayClosingTime = getTimeInMinutes(clinicClosingTime);
    const filteredByBusinessHours = slots.filter((slot) => getTimeInMinutes(slot) <= dayClosingTime);

    const today = getLocalDateString();
    if (dateValue !== today) return filteredByBusinessHours;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return filteredByBusinessHours.filter((slot) => getTimeInMinutes(slot) > nowMinutes);
}

function updateAppointmentTimeOptions() {
    const dateInput = document.getElementById("apt-date");
    const timeSelect = document.getElementById("apt-time");
    if (!dateInput || !timeSelect) return;

    const filtered = getAvailableTimeSlots(dateInput.value, appointmentTimeSlots);
    timeSelect.innerHTML = filtered.length
        ? `<option value="">Horário</option>${filtered.map((slot) => `<option value="${slot}">${slot}</option>`).join("")}`
        : `<option value="">Nenhum horário disponível</option>`;
}

function updateExamTimeOptions() {
    const dateInput = document.getElementById("exam-date");
    const timeSelect = document.getElementById("exam-time");
    if (!dateInput || !timeSelect) return;

    const filtered = getAvailableTimeSlots(dateInput.value, examTimeSlots);
    timeSelect.innerHTML = filtered.length
        ? `<option value="">Horário</option>${filtered.map((slot) => `<option value="${slot}">${slot}</option>`).join("")}`
        : `<option value="">Nenhum horário disponível</option>`;
}


// ==================== 7. AGENDAMENTO DE CONSULTAS ====================
function openAppointmentModal() {
    if (!requirePlanAccess("Consultas")) return;
    if (!canScheduleWithCurrentPlan()) return;
    const dateInput = document.getElementById("apt-date");
    if (!dateInput.value) dateInput.value = getLocalDateString();
    updateAppointmentTimeOptions();
    document.getElementById("modal-appointment").classList.remove("hidden");
}

// Ao escolher a especialidade, popula a lista de médicos disponíveis
document.getElementById("apt-specialty").addEventListener("change", function () {
    const selectMedico = document.getElementById("apt-doctor");
    const medicos = doctorsDB[this.value] || [];

    selectMedico.innerHTML = medicos.length
        ? medicos.map((d) => `<option value="${d}">${d}</option>`).join("")
        : '<option value="">Nenhum médico disponível</option>';
    selectMedico.disabled = !medicos.length;
});

document.getElementById("apt-date").addEventListener("change", updateAppointmentTimeOptions);
document.getElementById("exam-date").addEventListener("change", updateExamTimeOptions);

document.getElementById("appointment-form").addEventListener("submit", function (e) {
    e.preventDefault();

    if (!canScheduleWithCurrentPlan()) return;

    const date = document.getElementById("apt-date").value;
    const time = document.getElementById("apt-time").value;
    const today = getLocalDateString();
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const closingMinutes = getTimeInMinutes(clinicClosingTime);

    if (date === today && time && getTimeInMinutes(time) <= nowMinutes) {
        showToast("Escolha um horário futuro para a consulta.", "error");
        return;
    }
    if (time && getTimeInMinutes(time) > closingMinutes) {
        showToast("O atendimento funciona até às 19:00.", "error");
        return;
    }
    if (!date || !time) {
        showToast("Selecione uma data e um horário válidos.", "error");
        return;
    }

    const user = DataService.getCurrentUser();
    const novaConsulta = {
        id: "APT" + Date.now(),
        userId: user.id,
        specialty: document.getElementById("apt-specialty").value,
        doctor: document.getElementById("apt-doctor").value,
        date,
        time,
        type: document.getElementById("apt-type").value,
    };

    const todasConsultas = DataService.getAppointments();
    todasConsultas.push(novaConsulta);
    DataService.saveAppointments(todasConsultas);

    closeModal("modal-appointment");
    this.reset();
    document.getElementById("apt-doctor").disabled = true;
    document.getElementById("apt-doctor").innerHTML = '<option value="">Selecione a especialidade primeiro</option>';
    updateAppointmentTimeOptions();

    renderDashboard();
    showToast("Consulta agendada!", "success");
});

document.getElementById("profile-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const user = DataService.getCurrentUser();
    user.nome = document.getElementById("profile-name").value.trim();
    user.telefone = document.getElementById("profile-phone").value.trim();
    user.endereco = document.getElementById("profile-address").value.trim();
    DataService.setCurrentUser(user);
    renderDashboard();
    showToast("Perfil atualizado", "success");
});

document.getElementById("chat-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const messages = document.getElementById("chat-messages");
    const text = input.value.trim();
    if (!text) return;
    messages.insertAdjacentHTML("beforeend", `<p class="bg-gray-100 text-gray-700 rounded-xl p-3 text-sm ml-8">${text}</p><p class="bg-brand-50 text-gray-700 rounded-xl p-3 text-sm">Mensagem recebida. O médico responderá assim que estiver disponível.</p>`);
    input.value = "";
});

function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
    })[character]);
}

function getLocalAssistantReply(text) {
    const question = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (question.includes("oi") || question.includes("ola") || question.includes("ajuda")) return "Olá! Posso tirar dúvidas sobre planos, consultas, exames, teleconsultas, rede próxima, contatos e dependentes.";
    if (question.includes("teleconsulta") || question.includes("video")) return "A teleconsulta é um atendimento médico por vídeo, sem deslocamento. Na aba Teleconsulta, escolha uma especialidade e clique em Iniciar Teleconsulta para começar."
    if (question.includes("consulta") || question.includes("medico")) return "Para agendar uma consulta normal, abra a aba Consultas, clique em Nova Consulta e escolha a especialidade, o médico, a data e o horário do atendimento."
    if (question.includes("exame")) return "Para agendar um exame, abra a aba Exames e clique em Novo Exame. Depois escolha o exame, a data, o horário e confirme."
    if (question.includes("plano") || question.includes("pagamento")) return "Na aba Planos, selecione o plano desejado. Depois escolha crédito, débito ou Pix e confirme a assinatura."
    if (question.includes("hospital") || question.includes("rede") || question.includes("distancia")) return "Na aba Rede próxima, escolha o raio de busca. A distância é calculada conforme o endereço cadastrado no perfil."
    if (question.includes("contato") || question.includes("chat") || question.includes("conversa")) return "Em Contatos ficam os médicos que já atenderam você. Clique em Falar para abrir uma conversa individual com o médico."
    if (question.includes("dependente") || question.includes("crianca") || question.includes("adulto") || question.includes("idoso")) return "Na aba Dependentes, clique em Adicionar pessoa e escolha Pediatria, Adulto ou Geriatria. Preencha os dados e confirme."
    if (question.includes("perfil") || question.includes("endereco")) return "Na aba Meu perfil, você pode atualizar seus dados e o endereço. A rede próxima usa esse endereço para calcular as distâncias."
    return "Ainda não encontrei essa dúvida nas perguntas programadas. Posso ajudar com planos, consultas, exames, teleconsultas, rede próxima, contatos ou dependentes.";
}

function openSupportInterface() {
    document.getElementById("assistant-messages").classList.add("hidden");
    document.getElementById("assistant-form").classList.add("hidden");
    document.getElementById("support-interface").classList.remove("hidden");
    document.getElementById("support-input").focus();
}

function closeSupportInterface() {
    document.getElementById("support-interface").classList.add("hidden");
    document.getElementById("assistant-messages").classList.remove("hidden");
    document.getElementById("assistant-form").classList.remove("hidden");
    document.getElementById("assistant-input").focus();
}

function sendAssistantQuestion(text) {
    const messages = document.getElementById("assistant-messages");
    if (!text) return;
    if (text === "SUPORTE") {
        openSupportInterface();
        return;
    }
    const safeText = escapeHtml(text);
    messages.insertAdjacentHTML("beforeend", `<p class="bg-gray-100 text-gray-700 rounded-xl p-3 text-sm ml-8">${safeText}</p>`);
    messages.scrollTop = messages.scrollHeight;
    const respostaLocal = getLocalAssistantReply(text);
    messages.insertAdjacentHTML("beforeend", `<p class="bg-brand-50 text-gray-700 rounded-xl p-3 text-sm">${escapeHtml(respostaLocal)}</p>`);
    let followUp = document.getElementById("assistant-follow-up");
    if (!followUp) {
        followUp = document.createElement("p");
        followUp.id = "assistant-follow-up";
        followUp.className = "text-xs text-gray-500 pt-1";
        followUp.textContent = "Posso ajudar com mais alguma coisa?";
        messages.appendChild(followUp);
    }
    const suggestions = messages.querySelector(".assistant-suggestions");
    if (suggestions) messages.appendChild(suggestions);
    messages.scrollTop = messages.scrollHeight;
}

document.getElementById("assistant-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const input = document.getElementById("assistant-input");
    const text = input.value.trim();
    if (!text) return;
    sendAssistantQuestion(text);
    input.value = "";
    input.focus();
});

document.querySelectorAll(".assistant-suggestion").forEach((button) => {
    button.addEventListener("click", function () {
        sendAssistantQuestion(this.dataset.assistantQuestion);
        document.getElementById("assistant-input").focus();
    });
});

document.getElementById("support-form").addEventListener("submit", function (event) {
    event.preventDefault();
    const input = document.getElementById("support-input");
    const messages = document.getElementById("support-messages");
    const text = input.value.trim();
    if (!text) return;
    messages.insertAdjacentHTML("beforeend", `<p class="support-message support-message-user">${escapeHtml(text)}</p><p class="support-message">Sua mensagem foi registrada nesta sessão. A equipe poderá respondê-la quando o atendimento humano estiver conectado.</p>`);
    input.value = "";
    messages.scrollTop = messages.scrollHeight;
});

document.querySelectorAll("#reg-phone, #profile-phone, #recovery-phone").forEach((input) => input.addEventListener("input", function () {
    const digits = this.value.replace(/\D/g, "").slice(0, 11);
    this.value = digits.length > 10 ? digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
}));

document.getElementById("dependent-cpf").addEventListener("input", function () {
    const digits = this.value.replace(/\D/g, "").slice(0, 11);
    this.value = digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
});


// ==================== 8. AGENDAMENTO DE EXAMES ====================
const examInstructions = {
    "Hemograma Completo": "Preparo: geralmente não é necessário jejum. Confirme a orientação do laboratório.",
    "Glicemia": "Preparo: o jejum pode ser solicitado. Siga o período informado pelo laboratório ou profissional de saúde.",
    "Colesterol Total": "Preparo: o jejum depende da solicitação e do perfil lipídico. Confirme a orientação do laboratório.",
    "Eletrocardiograma": "Preparo: geralmente não exige preparo específico. Use roupas confortáveis e siga a orientação do serviço.",
    "Raio-X": "Preparo: varia conforme a região examinada. Informe possibilidade de gravidez e siga a orientação do serviço.",
    "Ultrassonografia": "Preparo: varia conforme a região examinada e pode incluir cuidados específicos. Confirme a orientação do serviço.",
    "Ressonância Magnética": "Preparo: informe implantes, objetos metálicos e possibilidade de gravidez. Siga as instruções do serviço, especialmente se houver contraste.",
    "Tomografia": "Preparo: varia conforme a região e o uso de contraste. Informe alergias e condições de saúde e siga a orientação do serviço.",
};

function updateExamInstructions() {
    const examType = document.getElementById("exam-type").value;
    const notes = document.getElementById("exam-notes");
    const status = document.getElementById("exam-notes-status");
    const instruction = examInstructions[examType] || "";
    notes.value = instruction;
    status.textContent = "Orientação informativa. Confirme o preparo específico com o laboratório ou serviço de diagnóstico.";
}

function openExamModal() {
    if (!requirePlanAccess("Exames")) return;
    if (!canScheduleWithCurrentPlan()) return;
    const dateInput = document.getElementById("exam-date");
    if (!dateInput.value) dateInput.value = getLocalDateString();
    updateExamTimeOptions();
    document.getElementById("modal-exam").classList.remove("hidden");
    updateExamInstructions();
}

document.getElementById("exam-type").addEventListener("change", updateExamInstructions);

document.getElementById("exam-form").addEventListener("submit", function (e) {
    e.preventDefault();

    if (!canScheduleWithCurrentPlan()) return;

    const date = document.getElementById("exam-date").value;
    const time = document.getElementById("exam-time").value;
    const today = getLocalDateString();
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const closingMinutes = getTimeInMinutes(clinicClosingTime);

    if (date === today && time && getTimeInMinutes(time) <= nowMinutes) {
        showToast("Escolha um horário futuro para o exame.", "error");
        return;
    }
    if (time && getTimeInMinutes(time) > closingMinutes) {
        showToast("O atendimento funciona até às 19:00.", "error");
        return;
    }
    if (!date || !time) {
        showToast("Selecione uma data e um horário válidos.", "error");
        return;
    }

    const user = DataService.getCurrentUser();
    const novoExame = {
        id: "EXM" + Date.now(),
        userId: user.id,
        examType: document.getElementById("exam-type").value,
        date,
        time,
        notes: document.getElementById("exam-notes").value,
    };

    const todosExames = DataService.getExams();
    todosExames.push(novoExame);
    DataService.saveExams(todosExames);

    closeModal("modal-exam");
    this.reset();

    renderDashboard();
    showToast("Exame agendado!", "success");
});


// ==================== 9. CANCELAMENTO (MODAL DE CONFIRMAÇÃO) ====================
let deleteTarget = null;

/** Abre o modal de confirmação, guardando o que será excluído ao confirmar. */
function confirmDelete(type, id, index) {
    deleteTarget = { type, id, index };
    document.getElementById("confirm-title").textContent = type === "dependent" ? "Excluir dependente?" : "Cancelar agendamento?";
    document.getElementById("confirm-description").textContent = type === "dependent" ? "Esta pessoa será removida da sua lista de dependentes." : "Esta ação não pode ser desfeita.";
    document.getElementById("confirm-action").textContent = type === "dependent" ? "Excluir" : "Confirmar";
    document.getElementById("modal-confirm").classList.remove("hidden");
}

document.getElementById("confirm-delete-btn").addEventListener("click", function () {
    if (!deleteTarget) return;
    const deletedType = deleteTarget.type;

    if (deleteTarget.type === "appointment") {
        const restantes = DataService.getAppointments().filter((a) => a.id !== deleteTarget.id);
        DataService.saveAppointments(restantes);
    } else if (deleteTarget.type === "exam") {
        const restantes = DataService.getExams().filter((e) => e.id !== deleteTarget.id);
        DataService.saveExams(restantes);
    } else {
        const dependents = DataService.getUserData("dependents");
        const restantes = deleteTarget.id
            ? dependents.filter((person) => person.id !== deleteTarget.id)
            : dependents.filter((person, index) => index !== deleteTarget.index);
        DataService.saveUserData("dependents", restantes);
    }

    deleteTarget = null;
    closeModal("modal-confirm");
    renderDashboard();
    showToast(deletedType === "dependent" ? "Dependente excluído" : "Agendamento cancelado", "success");
});


// ==================== 10. TELECONSULTA SIMULADA ====================
let teleTimer = null;
let teleSeconds = 0;
let activeTeleconsultaId = null;

function startTeleconsulta() {
    if (!requirePlanAccess("Teleconsulta")) return;
    if (!canScheduleWithCurrentPlan()) return;

    const especialidade = document.getElementById("tele-specialty").value;
    if (!especialidade) {
        showToast("Selecione uma especialidade", "error");
        return;
    }

    const medicos = doctorsDB[especialidade] || ["Dr(a). Especialista"];
    const medicoSorteado = medicos[Math.floor(Math.random() * medicos.length)];

    const user = DataService.getCurrentUser();
    const consultas = DataService.getAppointments();
    const novaTeleconsulta = {
        id: "APT" + Date.now(),
        userId: user.id,
        specialty: especialidade,
        doctor: medicoSorteado,
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        type: "Teleconsulta",
    };
    consultas.push(novaTeleconsulta);
    DataService.saveAppointments(consultas);

    activeTeleconsultaId = novaTeleconsulta.id;
    document.getElementById("tele-doctor-name").textContent = medicoSorteado;
    document.getElementById("tele-doctor-spec").textContent = especialidade;
    showPage("page-teleconsulta");

    DataService.saveTelecount(DataService.getTelecount() + 1);

    teleSeconds = 0;
    document.getElementById("tele-timer").textContent = "00:00";
    teleTimer = setInterval(() => {
        teleSeconds++;
        const minutos = String(Math.floor(teleSeconds / 60)).padStart(2, "0");
        const segundos = String(teleSeconds % 60).padStart(2, "0");
        document.getElementById("tele-timer").textContent = `${minutos}:${segundos}`;
    }, 1000);
}

function endTeleconsulta() {
    if (activeTeleconsultaId) {
        markTeleconsultaSessionEnded(activeTeleconsultaId);
    }
    if (teleTimer) {
        clearInterval(teleTimer);
        teleTimer = null;
    }
    activeTeleconsultaId = null;
    showPage("page-dashboard");
    showToast("Sessão encerrada", "error");
}

// Botões de mutar microfone / desligar câmera (apenas visual, é uma simulação)
document.getElementById("btn-mic").addEventListener("click", function () {
    this.classList.toggle("bg-red-500");
    this.classList.toggle("bg-gray-700");
});
document.getElementById("btn-cam").addEventListener("click", function () {
    this.classList.toggle("bg-red-500");
    this.classList.toggle("bg-gray-700");
});


// ==================== 11. UTILIDADES ====================
function closeModal(id) {
    document.getElementById(id).classList.add("hidden");
}

function formatDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("pt-BR");
}

function showToast(msg, type) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = "opacity 0.3s";
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}


// ==================== 12. INICIALIZAÇÃO ====================
(function init() {
    setupProfileUi();
    renderConvenioDetails();
    const user = DataService.getCurrentUser();
    showPage(user ? "page-dashboard" : "page-landing");
    lucide.createIcons();

    // Impede escolher datas retroativas nos formulários de agendamento
    const hoje = new Date().toISOString().split("T")[0];
    document.getElementById("apt-date").setAttribute("min", hoje);
    document.getElementById("exam-date").setAttribute("min", hoje);
})();


// ==================== ELEMENT SDK (integração com o editor visual) ====================
const defaultConfig = {
    site_title: "Saúde Plus",
    background_color: "#f9fafb",
    surface_color: "#ffffff",
    text_color: "#111827",
    primary_color: "#1570f5",
    accent_color: "#0aab48",
};

window.elementSdk.init({
    defaultConfig,
    onConfigChange: async (config) => {
        const title = config.site_title || defaultConfig.site_title;
        document.getElementById("brand-name").textContent = title;
        document.title = title;
    },
    mapToCapabilities: (config) => ({
        recolorables: [
            { get: () => config.background_color || defaultConfig.background_color, set: (v) => { config.background_color = v; window.elementSdk.setConfig({ background_color: v }); } },
            { get: () => config.surface_color || defaultConfig.surface_color, set: (v) => { config.surface_color = v; window.elementSdk.setConfig({ surface_color: v }); } },
            { get: () => config.text_color || defaultConfig.text_color, set: (v) => { config.text_color = v; window.elementSdk.setConfig({ text_color: v }); } },
            { get: () => config.primary_color || defaultConfig.primary_color, set: (v) => { config.primary_color = v; window.elementSdk.setConfig({ primary_color: v }); } },
            { get: () => config.accent_color || defaultConfig.accent_color, set: (v) => { config.accent_color = v; window.elementSdk.setConfig({ accent_color: v }); } },
        ],
        borderables: [],
        fontEditable: undefined,
        fontSizeable: undefined,
    }),
    mapToEditPanelValues: (config) => new Map([
        ["site_title", config.site_title || defaultConfig.site_title],
    ]),
});

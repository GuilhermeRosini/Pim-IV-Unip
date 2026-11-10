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
// Reúne endereços externos usados pela interface; concentrá-los aqui facilita trocar serviços sem procurar em todo o arquivo.
// O navegador usa apenas a chave pública; a service_role nunca deve sair do servidor.
const supabaseUrl = window.SUPABASE_CONFIG?.url || "";
const supabaseAnonKey = window.SUPABASE_CONFIG?.anonKey || "";
const supabaseClient = window.supabase
    && supabaseUrl.startsWith("https://")
    && !supabaseUrl.includes("SEU-PROJETO")
    && supabaseAnonKey
    && !supabaseAnonKey.startsWith("SUA_CHAVE")
    ? window.supabase.createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey)
    : null;

function getSupabaseClient() {
    if (!supabaseClient) {
        showToast("Configure a URL e a chave publicável do Supabase em supabase/config.js.", "error");
        return null;
    }
    return supabaseClient;
}

// Traduz erros comuns do Auth em próximos passos claros para o teste acadêmico sem e-mail.
function getAuthErrorMessage(error) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();

    if (code.includes("rate_limit") || message.includes("rate limit") || message.includes("email rate")) {
        return "O Supabase limitou tentativas de cadastro. Desative a confirmação de e-mail em Authentication > Providers > Email e tente novamente mais tarde.";
    }
    if (code.includes("email_not_confirmed") || message.includes("email not confirmed")) {
        return "Esta conta foi criada antes de desativar a confirmação. Para o teste, remova somente essa conta em Authentication > Users e cadastre-a novamente após desligar Confirm email.";
    }
    if (code.includes("invalid_credentials") || message.includes("invalid login credentials")) {
        return "E-mail ou senha incorretos. Confira os dados ou remova a conta de teste em Authentication > Users e faça um novo cadastro.";
    }
    if (code.includes("user_already_exists") || message.includes("already registered") || message.includes("user already registered")) {
        return "Este e-mail já tem uma conta. Entre com a senha cadastrada ou remova a conta de teste em Authentication > Users para cadastrá-la novamente.";
    }
    return error?.message || "Não foi possível concluir a autenticação.";
}

async function loadAuthenticatedUser(authUser) {
    const client = getSupabaseClient();
    if (!client || !authUser) return null;

    const { data: profile, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();
    if (error) throw error;

    const metadata = authUser.user_metadata || {};
    const user = {
        id: authUser.id,
        nome: profile?.nome || metadata.nome || "",
        email: profile?.email || authUser.email || "",
        telefone: profile?.telefone || metadata.telefone || "",
        endereco: profile?.endereco || metadata.endereco || "",
        cpf: profile?.cpf || metadata.cpf || "",
        data_nascimento: profile?.data_nascimento || metadata.data_nascimento || "",
        plano: profile?.plano || "Nenhum plano contratado",
    };
    DataService.setCurrentUser(user);
    return user;
}

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
// As chaves de dados pessoais também incluem o ID do usuário para separar as informações de cada conta neste navegador.
const DataService = {
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

    getConversationHistory(doctorName) {
        const user = this.getCurrentUser();
        if (!user || !doctorName) return [];
        const key = `sp_chat_${user.id}_${String(doctorName).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        return JSON.parse(localStorage.getItem(key) || "[]");
    },
    saveConversationHistory(doctorName, messages) {
        const user = this.getCurrentUser();
        if (!user || !doctorName) return;
        const key = `sp_chat_${user.id}_${String(doctorName).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
        localStorage.setItem(key, JSON.stringify(messages));
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

    getFavoriteNetwork() {
        const user = this.getCurrentUser();
        return user ? localStorage.getItem(`sp_favorite_network_${user.id}`) || "" : "";
    },
    saveFavoriteNetwork(networkName) {
        const user = this.getCurrentUser();
        if (!user) return;
        const key = `sp_favorite_network_${user.id}`;
        if (networkName) localStorage.setItem(key, networkName);
        else localStorage.removeItem(key);
    },
    getPhysicalCardRequest() {
        const user = this.getCurrentUser();
        return user ? JSON.parse(localStorage.getItem(`sp_physical_card_${user.id}`) || "null") : null;
    },
    savePhysicalCardRequest(request) {
        const user = this.getCurrentUser();
        if (user) localStorage.setItem(`sp_physical_card_${user.id}`, JSON.stringify(request));
    },
    getPhysicalCardRequestFor(personKey = "titular") {
        const user = this.getCurrentUser();
        if (!user) return null;
        const key = personKey === "titular" ? `sp_physical_card_${user.id}` : `sp_physical_card_${user.id}_${personKey}`;
        return JSON.parse(localStorage.getItem(key) || "null");
    },
    savePhysicalCardRequestFor(personKey, request) {
        const user = this.getCurrentUser();
        if (!user) return;
        const key = personKey === "titular" ? `sp_physical_card_${user.id}` : `sp_physical_card_${user.id}_${personKey}`;
        localStorage.setItem(key, JSON.stringify(request));
    },
    clearPhysicalCardRequestFor(personKey = "titular") {
        const user = this.getCurrentUser();
        if (!user) return;
        const key = personKey === "titular" ? `sp_physical_card_${user.id}` : `sp_physical_card_${user.id}_${personKey}`;
        localStorage.removeItem(key);
    },
};

const networksDB = [
    { name: "Rede Saúde Central", address: "Av. Paulista, 1500 - Bela Vista, SP", distance: 2.4, specialties: ["Clínico Geral", "Cardiologia", "Pediatria"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sex: 07:00 - 19:00" },
    { name: "Clinica Nova Vida", address: "Rua Augusta, 320 - Consolação, SP", distance: 4.1, specialties: ["Dermatologia", "Ginecologia", "Psiquiatria"], types: ["Presencial"], hours: "Seg-Sab: 08:00 - 18:00" },
    { name: "Hospital Horizonte", address: "Rua da Consolação, 760 - Cerqueira César, SP", distance: 6.5, specialties: ["Neurologia", "Ortopedia", "Cardiologia"], types: ["Presencial", "Exames"], hours: "Seg-Sex: 06:00 - 21:00" },
    { name: "Centro Médico União", address: "Alameda Santos, 1200 - Jardim Paulista, SP", distance: 8.2, specialties: ["Nutrição", "Psicologia", "Fisioterapia"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sab: 08:00 - 20:00" },
    { name: "Laboratório Diagnóstico Plus", address: "Rua Oscar Freire, 500 - Pinheiros, SP", distance: 11.7, specialties: ["Exames laboratoriais", "Ultrassonografia", "Ressonância"], types: ["Exames"], hours: "Seg-Sex: 07:00 - 19:00" },
    { name: "Rede Ativa Saúde", address: "Avenida Faria Lima, 2800 - Itaim Bibi, SP", distance: 14.9, specialties: ["Gastroenterologia", "Oftalmologia", "Pneumologia"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sex: 08:00 - 18:00" },
    { name: "Instituto Vida Integral", address: "Rua Vergueiro, 1850 - Vila Mariana, SP", distance: 0.8, specialties: ["Clínico Geral", "Endocrinologia", "Nutrição"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sex: 07:00 - 20:00" },
    { name: "Clínica Jardim Saúde", address: "Rua Joaquim Floriano, 940 - Itaim Bibi, SP", distance: 1.4, specialties: ["Dermatologia", "Oftalmologia", "Fisioterapia"], types: ["Presencial"], hours: "Seg-Sab: 08:00 - 18:00" },
    { name: "Centro Diagnóstico Alvorada", address: "Av. Jabaquara, 2100 - Saúde, SP", distance: 2.1, specialties: ["Exames laboratoriais", "Tomografia", "Raio-X"], types: ["Exames"], hours: "Seg-Sex: 06:30 - 19:00" },
    { name: "Hospital Santa Aurora", address: "Rua Dr. Diogo de Faria, 775 - Vila Clementino, SP", distance: 2.8, specialties: ["Cardiologia", "Ortopedia", "Pediatria"], types: ["Presencial", "Exames"], hours: "Todos os dias: 24 horas" },
    { name: "Espaço Cuidar Saúde", address: "Rua Harmonia, 410 - Vila Madalena, SP", distance: 3.5, specialties: ["Psicologia", "Psiquiatria", "Medicina de Família"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sab: 08:00 - 20:00" },
    { name: "Clínica Movimento", address: "Rua Itapeva, 380 - Bela Vista, SP", distance: 4.2, specialties: ["Ortopedia", "Fisioterapia", "Reumatologia"], types: ["Presencial"], hours: "Seg-Sex: 07:00 - 19:00" },
    { name: "Laboratório Vida Clara", address: "Av. Indianópolis, 1250 - Moema, SP", distance: 5.0, specialties: ["Exame de sangue", "Exame de urina", "Glicemia"], types: ["Exames"], hours: "Seg-Sab: 06:00 - 17:00" },
    { name: "Núcleo Médico Paulista", address: "Rua Haddock Lobo, 890 - Cerqueira César, SP", distance: 5.8, specialties: ["Ginecologia", "Obstetrícia", "Mastologia"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sex: 08:00 - 19:00" },
    { name: "Hospital Parque das Flores", address: "Av. Ibirapuera, 3100 - Moema, SP", distance: 6.3, specialties: ["Cirurgia Geral", "Neurologia", "Pneumologia"], types: ["Presencial", "Exames"], hours: "Todos os dias: 24 horas" },
    { name: "Centro Médico Liberdade", address: "Rua Galvão Bueno, 620 - Liberdade, SP", distance: 7.1, specialties: ["Clínico Geral", "Urologia", "Nefrologia"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sab: 07:30 - 18:30" },
    { name: "Instituto Bem Viver", address: "Rua Teodoro Sampaio, 1440 - Pinheiros, SP", distance: 7.9, specialties: ["Alergologia", "Pneumologia", "Otorrinolaringologia"], types: ["Presencial"], hours: "Seg-Sex: 08:00 - 18:00" },
    { name: "Diagnósticos Vila Olímpia", address: "Rua Gomes de Carvalho, 1500 - Vila Olímpia, SP", distance: 9.0, specialties: ["Ressonância", "Ultrassonografia", "Ecocardiograma"], types: ["Exames"], hours: "Seg-Sex: 06:30 - 20:00" },
    { name: "Rede Especializada São Bento", address: "Rua Líbero Badaró, 425 - Centro, SP", distance: 10.4, specialties: ["Hematologia", "Infectologia", "Endocrinologia"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sex: 07:00 - 18:00" },
    { name: "Hospital Metropolitano Saúde", address: "Av. Cruzeiro do Sul, 2650 - Santana, SP", distance: 12.8, specialties: ["Cardiologia", "Oncologia", "Cirurgia Geral"], types: ["Presencial", "Exames"], hours: "Todos os dias: 24 horas" },
    { name: "Clínica Conecta Família", address: "Rua Tito, 980 - Vila Romana, SP", distance: 15.6, specialties: ["Pediatria", "Geriatria", "Medicina de Família"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sab: 08:00 - 19:00" },
    { name: "Centro Integrado Nova Estação", address: "Av. do Estado, 5200 - Cambuci, SP", distance: 18.3, specialties: ["Neurologia", "Psiquiatria", "Psicologia"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sex: 08:00 - 18:00" },
    { name: "Instituto Diagnóstico Paulista", address: "Av. Rebouças, 3600 - Pinheiros, SP", distance: 21.7, specialties: ["Tomografia", "Ressonância", "Exames laboratoriais"], types: ["Exames"], hours: "Seg-Sex: 06:00 - 21:00" },
    { name: "Hospital Referência Cidade", address: "Av. das Nações Unidas, 14500 - Santo Amaro, SP", distance: 27.5, specialties: ["Ortopedia", "Cardiologia", "Oncologia"], types: ["Presencial", "Exames"], hours: "Todos os dias: 24 horas" },
    { name: "Clínica Horizonte Leste", address: "Av. Radial Leste, 7800 - Tatuapé, SP", distance: 34.2, specialties: ["Clínico Geral", "Ginecologia", "Dermatologia"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sab: 08:00 - 18:00" },
    { name: "Centro Saúde Leste", address: "Rua Serra Branca, 260 - Anália Franco, SP", distance: 40.5, specialties: ["Endocrinologia", "Geriatria", "Medicina de Família"], types: ["Presencial", "Teleconsulta"], hours: "Seg-Sex: 08:00 - 19:00" },
];

function normalizeDoctorName(name) {
    return String(name || "").replace(/^Dr\.?\s*/i, "").replace(/^Dra\.?\s*/i, "");
}

function normalizeCpf(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function formatCpf(value) {
    const digits = normalizeCpf(value);
    if (!digits) return "";
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function isValidCpf(value) {
    const digits = normalizeCpf(value);
    if (digits.length !== 11 || /^\d{11}$/.test(digits) === false) return false;
    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += Number(digits.charAt(i)) * (10 - i);
    let digit1 = 11 - (sum % 11);
    if (digit1 >= 10) digit1 = 0;
    if (Number(digits.charAt(9)) !== digit1) return false;
    sum = 0;
    for (let i = 0; i < 10; i += 1) sum += Number(digits.charAt(i)) * (11 - i);
    let digit2 = 11 - (sum % 11);
    if (digit2 >= 10) digit2 = 0;
    if (Number(digits.charAt(10)) !== digit2) return false;
    return true;
}

function getBeneficiaryOptions() {
    const user = DataService.getCurrentUser();
    if (!user) return [];
    const dependents = DataService.getUserData("dependents");
    const options = [{ id: user.id, label: `${user.nome} (Titular)`, type: "titular" }];
    dependents.forEach((person) => {
        options.push({ id: person.id || `${person.name}-${person.cpf}`, label: `${person.name} (${person.type})`, type: "dependente" });
    });
    return options;
}

function renderBeneficiarySelection(selectId, mode = "consult") {
    const select = document.getElementById(selectId);
    if (!select) return;
    const options = getBeneficiaryOptions();
    if (!options.length) {
        select.innerHTML = '<option value="">Cadastre primeiro um titular ou dependente</option>';
        select.disabled = true;
        return;
    }
    select.innerHTML = `<option value="">Selecione ${mode === "exam" ? "quem fará o exame" : "para quem é a consulta"}</option>${options.map((option) => `<option value="${option.id}">${option.label}</option>`).join("")}`;
    select.disabled = false;
}

function getSelectedBeneficiaryInfo(beneficiaryId) {
    const user = DataService.getCurrentUser();
    if (!beneficiaryId) return null;
    if (user && String(user.id) === String(beneficiaryId)) {
        return { id: user.id, name: user.nome, type: "titular", label: user.nome };
    }
    const dependents = DataService.getUserData("dependents") || [];
    const dep = dependents.find((person) => String(person.id || `${person.name}-${person.cpf}`) === String(beneficiaryId));
    return dep ? { id: dep.id || `${dep.name}-${dep.cpf}`, name: dep.name, type: "dependente", label: dep.name } : null;
}

function getNearbyNetworks() {
    const user = DataService.getCurrentUser();
    const favoriteNetwork = DataService.getFavoriteNetwork();
    const address = (user?.endereco || "").trim().toLowerCase();
    const addressHash = [...address].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
    return [...networksDB]
        .map((network, index) => ({
            ...network,
            distance: Number((network.distance * (0.75 + ((addressHash + index * 53) % 51) / 100)).toFixed(1)),
        }))
        .sort((a, b) => {
            const favoriteDifference = Number(b.name === favoriteNetwork) - Number(a.name === favoriteNetwork);
            return favoriteDifference || a.distance - b.distance;
        });
}

function buildNetworkOptions(selectedNetworkName = "") {
    const networks = getNearbyNetworks();
    const favoriteNetwork = DataService.getFavoriteNetwork();
    return `<option value="">Selecione uma rede próxima</option>${networks.map((network) => {
        const isFavorite = network.name === favoriteNetwork;
        const label = isFavorite ? `♥ Sua rede favorita: ${network.name} • ${network.distance} km` : `${network.name} • ${network.distance} km`;
        return `<option value="${network.name}" ${selectedNetworkName === network.name ? "selected" : ""}>${label}</option>`;
    }).join("")}`;
}

function getCurrentUserDependents() {
    return DataService.getUserData("dependents") || [];
}

function populateBeneficiaryFields() {
    renderBeneficiarySelection("apt-beneficiary");
    renderBeneficiarySelection("exam-beneficiary", "exam");
    renderBeneficiarySelection("tele-beneficiary");
    const aptNetwork = document.getElementById("apt-network");
    const favoriteNetwork = DataService.getFavoriteNetwork();
    if (aptNetwork) aptNetwork.innerHTML = buildNetworkOptions(favoriteNetwork);
    const examNetwork = document.getElementById("exam-network");
    if (examNetwork) examNetwork.innerHTML = buildNetworkOptions(favoriteNetwork);
    const appointmentType = document.getElementById("apt-type");
    if (appointmentType) {
        const shouldShowNetwork = appointmentType.value === "Presencial";
        const container = document.getElementById("apt-network-container");
        container?.classList.toggle("hidden", !shouldShowNetwork);
        if (aptNetwork) aptNetwork.required = shouldShowNetwork;
    }
}

function selectNetworkForCurrentAction(networkName) {
    const networkValue = networkName || "";
    const aptNetwork = document.getElementById("apt-network");
    const examNetwork = document.getElementById("exam-network");
    const aptContainer = document.getElementById("apt-network-container");
    if (aptNetwork) {
        aptNetwork.innerHTML = buildNetworkOptions(networkValue);
        aptNetwork.value = networkValue;
    }
    if (examNetwork) {
        examNetwork.innerHTML = buildNetworkOptions(networkValue);
        examNetwork.value = networkValue;
    }
    if (aptContainer) aptContainer.classList.toggle("hidden", !networkValue || document.getElementById("apt-type")?.value !== "Presencial");
    if (networkValue) showToast(`Rede ${networkName} selecionada.`, "success");
}

function toggleFavoriteNetwork(networkName) {
    const favoriteNetwork = DataService.getFavoriteNetwork();
    if (favoriteNetwork === networkName) {
        DataService.saveFavoriteNetwork("");
        renderHospitals();
        populateBeneficiaryFields();
        showToast("Rede removida dos favoritos.", "success");
        return;
    }

    if (favoriteNetwork) {
        favoriteReplacementTarget = networkName;
        document.getElementById("confirm-title").textContent = "Você já possui uma rede favorita.";
        document.getElementById("confirm-description").textContent = `${favoriteNetwork}. Você deseja substituir sua rede favorita por ${networkName}?`;
        document.getElementById("confirm-action").textContent = "Tornar favorita";
        document.getElementById("confirm-cancel-btn").textContent = "Cancelar";
        document.getElementById("modal-confirm").classList.remove("hidden");
        return;
    }

    DataService.saveFavoriteNetwork(networkName);
    renderHospitals();
    populateBeneficiaryFields();
    showToast(`${networkName} adicionada aos favoritos.`, "success");
}

function setFavoriteNetwork(networkName) {
    DataService.saveFavoriteNetwork(networkName);
    favoriteReplacementTarget = "";
    closeModal("modal-confirm");
    renderHospitals();
    populateBeneficiaryFields();
    showToast(`${networkName} adicionada aos favoritos.`, "success");
}


// ==================== 3. BASE DE MÉDICOS (MOCK) ====================
// Lista demonstrativa usada para preencher o seletor de profissionais por especialidade; não é um cadastro oficial.
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
// A interface funciona como uma SPA: estas funções alternam páginas e abas sem recarregar o documento.
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
    const showAssistant = Boolean(DataService.getCurrentUser()) && !["dash-contacts", "dash-chat"].includes(sectionId);
    setAssistantVisibility(showAssistant);

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
    // Atualiza o tema do cartão imediatamente, junto com a confirmação do plano.
    renderDigitalCard(user, normalizedPlan);
    applyPlanLockState();
    updateScheduleActionButtons();
    renderDependents();
    document.getElementById("card-plan").textContent = "Plano " + normalizedPlan;
    if (notify) showToast(`Plano ${normalizedPlan} selecionado`, "success");
}

// As próximas funções verificam os limites do plano antes de liberar áreas e ações do painel.
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

function getPlanUsageState(user = DataService.getCurrentUser()) {
    const plan = getSelectedPlan(user);
    const limit = getPlanLimit(plan);
    const usage = getMonthlyUsageCount(user);
    const hasLimit = Number.isFinite(limit);

    return {
        plan,
        limit,
        usage,
        reached: hasLimit && usage >= limit,
        unlimited: !hasLimit,
        canSchedule: !plan ? false : (!hasLimit || usage < limit),
    };
}

function updateScheduleActionButtons() {
    const user = DataService.getCurrentUser();
    const state = getPlanUsageState(user);

    document.querySelectorAll("[data-schedule-action]").forEach((button) => {
        const action = button.dataset.scheduleAction;
        const isDisabled = !user || !state.plan || state.reached;
        button.disabled = isDisabled;
        button.setAttribute("aria-disabled", String(isDisabled));
        button.classList.toggle("opacity-40", isDisabled);
        button.classList.toggle("pointer-events-none", isDisabled);
        button.classList.toggle("grayscale", isDisabled);
        button.classList.toggle("cursor-not-allowed", isDisabled);

        if (action === "appointment" && !state.plan) {
            button.title = "Selecione um plano antes de agendar consultas.";
        } else if (action === "appointment" && state.reached) {
            button.title = "Limite do plano atingido. Atualize seu plano para continuar.";
        } else if (action === "exam" && !state.plan) {
            button.title = "Selecione um plano antes de agendar exames.";
        } else if (action === "exam" && state.reached) {
            button.title = "Limite do plano atingido. Atualize seu plano para continuar.";
        } else if (action === "teleconsulta" && !state.plan) {
            button.title = "Selecione um plano antes de iniciar uma teleconsulta.";
        } else if (action === "teleconsulta" && state.reached) {
            button.title = "Limite do plano atingido. Atualize seu plano para continuar.";
        } else {
            button.title = "";
        }
    });
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

function isPlanLimitReachedForAction(actionType = "appointment") {
    const user = DataService.getCurrentUser();
    const state = getPlanUsageState(user);
    if (!user || !state.plan) return false;
    if (state.unlimited) return false;
    if (state.reached) {
        showToast(getPlanUpgradeMessage(state.plan), "error");
        showDashSection("dash-plans");
        return true;
    }
    return false;
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
        card.classList.toggle("bg-brand-50/50", isSelected);
        const label = card.querySelector(".plan-option-label");
        if (!label) return;

        label.textContent = isSelected ? "Plano atual" : "Selecionar";
        label.classList.toggle("plan-option-label--current", isSelected);
        label.classList.toggle("plan-option-label--select", !isSelected);
        label.classList.remove("border-brand-600", "text-brand-600", "bg-brand-600", "text-white");
        if (isSelected) {
            label.classList.add("bg-brand-600", "text-white", "border-brand-600");
        } else {
            label.classList.add("border-brand-600", "text-brand-600");
        }
    });
}

function openPlanDetails(plan) {
    const details = {
        "Básico": {
            subtitle: "Cuidados essenciais e rede regional.",
            value: "R$ 49,90 por mês",
            dependents: "Até 2 dependentes",
            usage: "Até 10 consultas, exames e teleconsultas por mês",
            network: "Rede credenciada regional, conforme cidade e regras da operadora",
            specialties: "Clínico Geral, Cardiologia, Pediatria e especialidades disponíveis na rede",
            coverage: "Agendamento, carteirinha digital e atendimentos presenciais ou por teleconsulta selecionados",
            references: "Hapvida Nosso Plano, NotreDame Smart e Unimed Regional",
            exams: "Hemograma, glicemia, colesterol, exame de urina e raio-X, conforme disponibilidade da rede",
            benefits: "Carteirinha digital, lembretes automáticos, histórico de atendimentos e suporte pelo aplicativo",
            access: "Atendimento presencial em unidades regionais e teleconsulta em especialidades selecionadas",
            differentiators: "Entrada acessível para cuidados do dia a dia e até 2 dependentes",
            conditions: "Disponibilidade, carência, coparticipação e elegibilidade devem ser confirmadas conforme a operadora.",
        },
        "Premium": {
            subtitle: "Mais rede, especialistas e abrangência.",
            value: "R$ 149,90 por mês",
            dependents: "Até 4 dependentes",
            usage: "Até 20 consultas, exames e teleconsultas por mês; 4 teleconsultas pela plataforma por mês",
            network: "Rede credenciada ampliada, conforme região e regras da operadora",
            specialties: "Clínico Geral, Cardiologia, Dermatologia, Ginecologia, Neurologia e outras especialidades da rede",
            coverage: "Consultas, exames, teleconsulta, carteirinha digital e atendimento ampliado",
            references: "Amil S380, Unimed Nacional e SulAmérica Exato",
            exams: "Hemograma, perfil lipídico, ultrassonografia, eletrocardiograma, tomografia e exames preventivos",
            benefits: "4 teleconsultas pela plataforma, descontos demonstrativos em exames, lembretes e suporte prioritário",
            access: "Atendimento presencial em rede ampliada e teleconsulta para clínica geral e especialidades elegíveis",
            differentiators: "Mais opções de especialistas, rede ampliada e até 4 dependentes",
            conditions: "Rede, cobertura, carência, coparticipação e elegibilidade devem ser confirmadas conforme a operadora.",
        },
        "Premium Saúde Plus": {
            subtitle: "Rede nacional e hospitais de referência.",
            value: "R$ 399,90 por mês",
            dependents: "Até 6 dependentes",
            usage: "Consultas, exames e teleconsultas ilimitados",
            network: "Rede nacional com hospitais e serviços de referência",
            specialties: "Especialidades médicas, exames e teleconsultas conforme a rede disponível",
            coverage: "Atendimento ampliado, acesso prioritário, descontos em exames e suporte ampliado",
            references: "Amil One, Bradesco Saúde Nacional Plus e SulAmérica Prestige",
            exams: "Exames laboratoriais e de imagem, ressonância, tomografia, ecocardiograma e check-up preventivo",
            benefits: "Uso ilimitado, suporte prioritário, descontos demonstrativos, segunda opinião e até 6 dependentes",
            access: "Rede nacional com hospitais de referência, atendimento presencial premium e teleconsulta ampliada",
            differentiators: "Maior abrangência, prioridade no suporte e acesso a serviços diferenciados da rede",
            conditions: "Condições, rede, cobertura, carência, coparticipação e elegibilidade devem ser confirmadas conforme a operadora.",
        },
    };
    const planDetails = details[plan];
    if (!planDetails) return;
    document.getElementById("plan-details-title").textContent = plan;
    document.getElementById("plan-details-subtitle").textContent = planDetails.subtitle;
    document.getElementById("plan-details-content").innerHTML = [
        ["Valor mensal", planDetails.value],
        ["Dependentes", planDetails.dependents],
        ["Consultas, exames e teleconsultas", planDetails.usage],
        ["Rede credenciada", planDetails.network],
        ["Especialidades disponíveis", planDetails.specialties],
        ["Exames disponíveis", planDetails.exams],
        ["Coberturas", planDetails.coverage],
        ["Benefícios incluídos", planDetails.benefits],
        ["Atendimento", planDetails.access],
        ["Diferenciais", planDetails.differentiators],
        ["Convênios de referência", planDetails.references],
        ["Limites e condições", planDetails.conditions],
    ].map(([label, value]) => `<section class="border border-gray-100 rounded-xl bg-gray-50 p-4"><p class="text-xs font-bold uppercase tracking-wide text-gray-400">${label}</p><p class="text-sm text-gray-700 mt-1 leading-relaxed">${value}</p></section>`).join("");
    document.getElementById("modal-plan-details").classList.remove("hidden");
    lucide.createIcons();
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
        "Básico": [
            "Até 10 agendamentos por mês",
            "2 consultas pela plataforma/mês",
            "Teleconsultas e exames com regras da operadora",
            "Rede regional e atendimento essencial",
        ],
        "Premium": [
            "Até 20 agendamentos por mês",
            "4 teleconsultas pela plataforma/mês",
            "Consultas e exames com atendimento ampliado",
            "Rede ampliada e mais especialistas",
        ],
        "Premium Saúde Plus": [
            "Consultas, exames e teleconsultas ilimitados",
            "Acesso prioritário e descontos em exames",
            "Rede nacional e hospitais de referência",
            "Cobertura conforme regras da operadora e coparticipação",
        ],
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
    document.getElementById("card-payment-fields").classList.toggle("hidden", method === "pix" || method === "boleto");
    document.getElementById("pix-payment-fields").classList.toggle("hidden", method !== "pix");
    document.getElementById("boleto-payment-fields").classList.toggle("hidden", method !== "boleto");
    document.querySelectorAll("#card-payment-fields input").forEach((input) => {
        input.required = method !== "pix" && method !== "boleto";
    });
    const boletoValue = document.getElementById("boleto-payment-value");
    const boletoDueDate = document.getElementById("boleto-payment-due-date");
    if (method === "boleto" && pendingPlan) {
        const boleto = getBoletoData(pendingPlan);
        boletoValue.textContent = boleto.value;
        boletoDueDate.textContent = boleto.dueDate;
    }
    const submitButton = document.getElementById("payment-submit-button");
    submitButton.textContent = method === "boleto" ? "Criar boleto" : "Confirmar assinatura";
    lucide.createIcons();
}

function getBoletoData(plan) {
    const planValues = {
        "Básico": "49,90",
        "Premium": "149,90",
        "Premium Saúde Plus": "399,90",
    };
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const formattedDueDate = dueDate.toLocaleDateString("pt-BR");
    const emissionDate = new Date().toLocaleDateString("pt-BR");
    const documentNumber = `SP-${String(plan.length).padStart(2, "0")}-2026-0001`;
    const line = "99990.00009 12345.678901 23456.789012 9 00000000000000";
    return {
        plan,
        value: `R$ ${planValues[plan] || "0,00"}`,
        dueDate: formattedDueDate,
        emissionDate,
        documentNumber,
        line,
        barcode: "99991234567890123456789000000000000000000000",
        payer: "Cliente Demonstração",
        payerCpf: "111.222.333-44",
        beneficiary: "Saúde Plus Serviços Digitais Ltda.",
        beneficiaryCnpj: "00.111.222/0001-00",
        address: "Av. da Inovação, 1000 - Cidade Modelo / SP",
    };
}

function buildBarcodeMarkup(value) {
    return [...value].map((character, index) => {
        const width = 1 + ((Number(character) || index + 1) % 3);
        return `<span style="width:${width}px"></span>`;
    }).join("");
}

function renderBoleto(boleto) {
    const documentElement = document.getElementById("boleto-document");
    const summary = document.getElementById("boleto-summary");
    if (!documentElement || !summary) return;

    summary.innerHTML = [
        ["Vencimento", boleto.dueDate],
        ["Valor", boleto.value],
        ["Documento", boleto.documentNumber],
        ["Plano", boleto.plan],
    ].map(([label, value]) => `<div class="bg-brand-50 rounded-xl p-3"><span class="block text-xs text-gray-400">${label}</span><strong class="block text-sm text-gray-800 mt-1">${value}</strong></div>`).join("");

    documentElement.innerHTML = `
        <div class="boleto-topline">
            <div class="boleto-brand"><span class="boleto-brand-mark">♥</span><span>Saúde Plus</span></div>
            <div class="boleto-bank">BANCO DEMONSTRAÇÃO SAÚDE PLUS<small>Instituição fictícia para apresentação acadêmica</small></div>
            <div class="boleto-code">999-9</div>
        </div>
        <div class="boleto-row">
            <div class="boleto-fields"><span class="boleto-label">Beneficiário</span><strong>${boleto.beneficiary}</strong><span>${boleto.beneficiaryCnpj}</span></div>
            <div class="boleto-fields"><span class="boleto-label">Data de emissão</span><strong>${boleto.emissionDate}</strong></div>
            <div class="boleto-fields"><span class="boleto-label">Vencimento</span><strong>${boleto.dueDate}</strong></div>
        </div>
        <div class="boleto-row">
            <div class="boleto-fields"><span class="boleto-label">Pagador</span><strong>${boleto.payer}</strong><span>CPF ${boleto.payerCpf}</span><span>${boleto.address}</span></div>
            <div class="boleto-fields"><span class="boleto-label">Número do documento</span><strong>${boleto.documentNumber}</strong></div>
        </div>
        <div class="boleto-row">
            <div class="boleto-instructions"><span class="boleto-label">Instruções</span><p>Pagamento demonstrativo referente ao plano ${boleto.plan}.<br>Não pagar. Este documento não possui validade bancária.</p></div>
            <div class="boleto-fields"><span class="boleto-label">Valor do documento</span><strong>${boleto.value}</strong><span class="boleto-label">Valor cobrado</span><strong>${boleto.value}</strong></div>
        </div>
        <div class="boleto-line">${boleto.line}</div>
        <div class="boleto-row" style="align-items:center; padding-top:8px;">
            <div><span class="boleto-label">Código de barras fictício</span><div class="boleto-barcode">${buildBarcodeMarkup(boleto.barcode)}</div></div>
            <div class="boleto-fields"><span class="boleto-label">Autenticação mecânica</span><strong>DOCUMENTO DE TESTE</strong><span>Uso exclusivo para demonstração</span></div>
        </div>
        <div class="boleto-footer">DOCUMENTO DE TESTE — SEM VALOR FINANCEIRO • Dados, banco e código de barras fictícios • Saúde Plus - PIM acadêmico</div>`;
}

function createBoleto() {
    const boleto = getBoletoData(pendingPlan);
    const user = DataService.getCurrentUser();
    if (user) localStorage.setItem(`sp_boleto_${user.id}`, JSON.stringify(boleto));
    renderBoleto(boleto);
    document.getElementById("modal-boleto").classList.remove("hidden");
    lucide.createIcons();
    return boleto;
}

function printBoleto() {
    window.print();
}

function viewBoleto() {
    document.getElementById("boleto-document")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (selectedPaymentMethod === "boleto") {
        selectPlan(pendingPlan, false);
        closeModal("modal-payment");
        createBoleto();
        renderSavedCard();
        showToast("Boleto gerado com sucesso", "success");
        return;
    }
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
// Cadastro e login usam Supabase Auth; somente metadados do perfil são copiados para a tabela profiles.
document.getElementById("register-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const cpf = document.getElementById("reg-cpf").value.trim();
    const dataNascimento = document.getElementById("reg-birthdate").value;
    const usuario = {
        nome: document.getElementById("reg-name").value.trim(),
        email: document.getElementById("reg-email").value.trim(),
        telefone: document.getElementById("reg-phone").value.trim(),
        endereco: document.getElementById("reg-address").value.trim(),
        cpf,
        data_nascimento: dataNascimento,
    };
    const senha = document.getElementById("reg-password").value;
    const confirmacaoSenha = document.getElementById("reg-password-confirm").value;
    if (!usuario.nome || !usuario.email || !usuario.telefone || !usuario.endereco || !cpf || !dataNascimento) {
        showToast("Preencha todos os campos obrigatórios.", "error");
        return;
    }
    if (!isValidCpf(cpf)) {
        showToast("Informe um CPF válido.", "error");
        return;
    }
    const birthDate = new Date(dataNascimento + "T00:00:00");
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
        showToast("Informe uma data de nascimento válida.", "error");
        return;
    }
    if (senha.length < 6) {
        showToast("A senha deve ter pelo menos 6 caracteres", "error");
        return;
    }
    if (senha !== confirmacaoSenha) {
        showToast("As senhas não coincidem", "error");
        return;
    }

    try {
        const client = getSupabaseClient();
        if (!client) return;
        const { data, error } = await client.auth.signUp({
            email: usuario.email,
            password: senha,
            options: {
                data: {
                    nome: usuario.nome,
                    telefone: usuario.telefone,
                    endereco: usuario.endereco,
                    cpf: usuario.cpf,
                    data_nascimento: usuario.data_nascimento,
                },
                emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
            },
        });
        if (error) throw error;

        this.reset();
        if (data.session && data.user) {
            await loadAuthenticatedUser(data.user);
            showToast("Conta criada com sucesso!", "success");
            showPage("page-dashboard");
        } else {
            showToast("A conta foi criada, mas o Auth não abriu uma sessão. Desative Confirm email no provedor Email e refaça o cadastro de teste.", "success");
            showPage("page-login");
        }
    } catch (erro) {
        console.error(erro);
        showToast(getAuthErrorMessage(erro), "error");
    }
});

document.getElementById("login-form").addEventListener("submit", async function (e) {
    e.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const senha = document.getElementById("login-password").value;

    try {
        const client = getSupabaseClient();
        if (!client) return;
        const { data, error } = await client.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        await loadAuthenticatedUser(data.user);
        showToast("Login realizado!", "success");
        this.reset();
        showPage("page-dashboard");
    } catch (erro) {
        console.error(erro);
        showToast(getAuthErrorMessage(erro), "error");
    }
});

document.getElementById("password-recovery-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const email = document.getElementById("recovery-email").value.trim().toLowerCase();
    try {
        const client = getSupabaseClient();
        if (!client) return;
        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}${window.location.pathname}`,
        });
        if (error) throw error;
        this.reset();
        hidePasswordRecovery();
        showToast("Se a conta existir, você receberá um link para redefinir a senha.", "success");
    } catch (erro) {
        console.error(erro);
        showToast(erro.message || "Não foi possível enviar o link de recuperação.", "error");
    }
});

document.getElementById("password-token-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const senha = document.getElementById("recovery-password").value;
    const confirmacao = document.getElementById("recovery-password-confirm").value;
    if (senha.length < 6) return showToast("A nova senha deve ter pelo menos 6 caracteres", "error");
    if (senha !== confirmacao) return showToast("As senhas não coincidem", "error");
    try {
        const client = getSupabaseClient();
        if (!client) return;
        const { error } = await client.auth.updateUser({ password: senha });
        if (error) throw error;
        await client.auth.signOut();
        DataService.clearCurrentUser();
        this.reset();
        window.history.replaceState({}, document.title, window.location.pathname);
        hidePasswordRecovery();
        document.getElementById("login-email").value = document.getElementById("recovery-email").value;
        showToast("Senha atualizada. Entre usando a nova senha.", "success");
    } catch (erro) {
        console.error(erro);
        showToast(erro.message || "Não foi possível atualizar a senha.", "error");
    }
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

async function logout() {
    const user = DataService.getCurrentUser();
    if (user && !user.modoDemo) {
        const client = getSupabaseClient();
        if (!client) return;
        const { error } = await client.auth.signOut();
        if (error) {
            console.error(error);
            showToast(error.message || "Não foi possível encerrar a sessão.", "error");
            return;
        }
    }
    DataService.clearCurrentUser();
    showPage("page-landing");
    showToast("Sessão encerrada", "success");
}


// ==================== 6. DASHBOARD ====================
// O dashboard transforma os dados salvos em cartões e listas. renderDashboard coordena as renderizações das abas.
function getDigitalCardThemeClass(plan) {
    if (plan === "Premium Saúde Plus") return "digital-card-theme-premium-plus";
    if (plan === "Premium") return "digital-card-theme-premium";
    return "digital-card-theme-standard";
}

function formatOptionalDate(value) {
    return value ? formatDate(value) : "Não informado";
}

function renderDigitalCard(user, selectedPlan) {
    const card = document.getElementById("digital-card");
    if (!card) return;
    const plan = selectedPlan || "Nenhum plano contratado";
    card.classList.remove("digital-card-theme-standard", "digital-card-theme-premium", "digital-card-theme-premium-plus");
    card.classList.add(getDigitalCardThemeClass(plan));
    document.getElementById("card-name").textContent = user.nome || "Não informado";
    document.getElementById("card-id").textContent = "SP" + String(user.id).padStart(6, "0");
    document.getElementById("card-cpf").textContent = user.cpf || "Não informado";
    document.getElementById("card-plan").textContent = plan;
    document.getElementById("card-valid").textContent = plan && plan !== "Nenhum plano contratado" ? (() => { const validity = new Date(); validity.setFullYear(validity.getFullYear() + 1); return validity.toLocaleDateString("pt-BR"); })() : "Não informado";
    document.getElementById("card-birthdate").textContent = formatOptionalDate(user.data_nascimento);
    document.getElementById("card-beneficiary-type").textContent = "Titular";
    renderPhysicalCardStatus();
    renderDependentPhysicalCards();
}

function renderPhysicalCardStatus() {
    const container = document.getElementById("physical-card-status");
    const request = DataService.getPhysicalCardRequestFor("titular");
    if (!container) return;
    if (!request) {
        container.innerHTML = "";
        return;
    }
    const status = request.status || "Solicitação recebida";
    const statusClass = { "Solicitação recebida": "status-received", "Em produção": "status-production", Enviada: "status-shipped", Entregue: "status-delivered" }[status] || "status-received";
    const canCancel = !["Enviada", "Entregue", "cancelada"].includes(status);
    container.innerHTML = `<div class="bg-white rounded-2xl border border-gray-100 p-5"><div class="flex items-start justify-between gap-3"><div><h3 class="font-bold text-gray-900">Carteirinha física</h3><p class="text-sm text-gray-500 mt-1">Status</p></div><span class="physical-status-badge ${statusClass}">${escapeHtml(status)}</span></div><div class="mt-4 flex items-center justify-between text-sm"><span class="text-gray-500">Número do pedido</span><strong class="font-mono text-gray-800">${escapeHtml(request.number)}</strong></div>${canCancel ? `<button type="button" onclick="confirmDelete('physical-card','titular')" class="text-sm font-semibold text-red-500 hover:underline mt-4">Cancelar solicitação</button>` : ""}</div>`;
}

function renderDependentPhysicalCards() {
    const container = document.getElementById("dependent-physical-cards");
    if (!container) return;
    const dependents = DataService.getUserData("dependents");
    const user = DataService.getCurrentUser();
    const plan = getSelectedPlan(user) || "Nenhum plano contratado";
    if (!dependents.length) {
        container.innerHTML = "";
        return;
    }
    container.innerHTML = `<div class="mb-4"><h3 class="text-lg font-bold text-gray-900">Carteirinhas dos dependentes</h3><p class="text-sm text-gray-500 mt-1">Solicite e acompanhe a carteirinha física de cada dependente.</p></div><div class="space-y-3">${dependents.map((person, index) => {
        const personKey = `dependent_${person.id || index}`;
        const request = DataService.getPhysicalCardRequestFor(personKey);
        const status = request?.status || "Não solicitada";
        const statusClass = request ? ({ "Solicitação recebida": "status-received", "Em produção": "status-production", Enviada: "status-shipped", Entregue: "status-delivered" }[status] || "status-received") : "status-none";
        const canCancel = request && !["Enviada", "Entregue", "cancelada"].includes(status);
        return `<div class="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><p class="font-bold text-gray-900">${escapeHtml(person.name)}</p><p class="text-sm text-gray-500">${escapeHtml(person.relation || person.type || "Dependente")} • Plano ${escapeHtml(plan)}</p><span class="physical-status-badge ${statusClass} inline-block mt-2">${escapeHtml(status)}</span></div><div class="flex flex-wrap gap-3">${request && canCancel ? `<button type="button" onclick="confirmDelete('physical-card','${personKey}')" class="text-sm font-semibold text-red-500 hover:underline">Cancelar solicitação</button>` : ""}${!request || status === "cancelada" ? `<button type="button" onclick="openPhysicalCardRequest('${personKey}')" class="btn-primary text-white font-semibold px-4 py-2 rounded-xl text-sm">Solicitar carteirinha física</button>` : ""}</div></div>`;
    }).join("")}</div>`;
}

function getPhysicalCardFormData() {
    const ids = ["name", "cpf", "birthdate", "cep", "street", "number", "complement", "neighborhood", "city", "state", "phone", "email"];
    return Object.fromEntries(ids.map((id) => [id, document.getElementById(`physical-${id}`).value.trim()]));
}

let physicalCepRequestSequence = 0;

function setPhysicalCepStatus(message, type = "neutral") {
    const status = document.getElementById("physical-cep-status");
    if (!status) return;
    status.textContent = message;
    status.className = `text-xs mt-1 min-h-4 ${type === "error" ? "text-red-500" : type === "success" ? "text-mint-600" : "text-gray-400"}`;
}

async function lookupPhysicalCardCep() {
    const cepInput = document.getElementById("physical-cep");
    if (!cepInput) return;
    const digits = cepInput.value.replace(/\D/g, "").slice(0, 8);
    cepInput.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    if (digits.length !== 8) {
        setPhysicalCepStatus("");
        return;
    }

    const requestSequence = ++physicalCepRequestSequence;
    setPhysicalCepStatus("Buscando endereço...");
    try {
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
        if (!response.ok) throw new Error("Falha na consulta");
        const address = await response.json();
        if (requestSequence !== physicalCepRequestSequence) return;
        if (address.erro) {
            setPhysicalCepStatus("CEP não encontrado. Verifique o número informado.", "error");
            return;
        }
        document.getElementById("physical-street").value = address.logradouro || "";
        document.getElementById("physical-neighborhood").value = address.bairro || "";
        document.getElementById("physical-city").value = address.localidade || "";
        document.getElementById("physical-state").value = address.uf || "";
        setPhysicalCepStatus("Endereço preenchido automaticamente.", "success");
    } catch (error) {
        if (requestSequence !== physicalCepRequestSequence) return;
        setPhysicalCepStatus("Não foi possível consultar o CEP. Tente novamente.", "error");
    }
}

document.getElementById("physical-cep")?.addEventListener("input", lookupPhysicalCardCep);

function fillPhysicalCardForm(user, dependent = null) {
    const values = { name: dependent?.name || user.nome || "", cpf: dependent?.cpf || user.cpf || "", birthdate: dependent?.birthdate || dependent?.data_nascimento || user.data_nascimento || "", street: user.endereco || "", phone: user.telefone || "", email: user.email || "" };
    Object.entries(values).forEach(([key, value]) => { document.getElementById(`physical-${key}`).value = value; });
}

let physicalCardTargetKey = "titular";
let physicalCardTargetPerson = null;

function getPhysicalCardTargetPerson(targetKey) {
    if (targetKey === "titular") return null;
    const dependents = DataService.getUserData("dependents");
    const targetId = String(targetKey).replace(/^dependent_/, "");
    return dependents.find((person, index) => String(person.id || index) === targetId) || null;
}

function openPhysicalCardRequest(targetKey = "titular") {
    const existing = DataService.getPhysicalCardRequestFor(targetKey);
    if (existing) {
        showToast(`Solicitação ${existing.number} já registrada.`, "success");
        return;
    }
    const user = DataService.getCurrentUser();
    if (!user) return;
    physicalCardTargetKey = targetKey;
    physicalCardTargetPerson = getPhysicalCardTargetPerson(targetKey);
    document.getElementById("physical-card-form").classList.remove("hidden");
    document.getElementById("physical-card-review").classList.add("hidden");
    document.getElementById("physical-card-success").classList.add("hidden");
    document.getElementById("physical-card-modal-subtitle").textContent = "Preencha os dados de entrega.";
    fillPhysicalCardForm(user, physicalCardTargetPerson);
    document.querySelector("#modal-physical-card h3").textContent = physicalCardTargetPerson ? "Solicitar carteirinha física do dependente" : "Solicitar carteirinha física";
    document.getElementById("modal-physical-card").classList.remove("hidden");
    lucide.createIcons();
}

function renderPhysicalCardReview(data) {
    const review = document.getElementById("physical-card-review");
    const display = [["Beneficiário", data.name], ["CPF", data.cpf], ["Data de nascimento", data.birthdate ? formatDate(data.birthdate) : ""], ["Endereço", [data.street, data.number, data.complement, data.neighborhood, data.city, data.state, data.cep].filter(Boolean).join(", ")], ["Telefone", data.phone], ["E-mail", data.email]];
    review.innerHTML = `<div class="space-y-4"><div><h4 class="text-lg font-bold text-gray-900">Confira seus dados</h4><p class="text-sm text-gray-500 mt-1">Revise as informações antes de confirmar.</p></div><div class="space-y-3">${display.filter(([, value]) => value).map(([label, value]) => `<div class="flex items-start justify-between gap-4 border-b border-gray-100 pb-2 text-sm"><span class="text-gray-500">${label}</span><strong class="text-gray-800 text-right">${escapeHtml(value)}</strong></div>`).join("")}</div><div class="flex flex-col-reverse sm:flex-row gap-3 pt-2"><button type="button" onclick="backToPhysicalCardForm()" class="flex-1 px-4 py-3 rounded-xl border border-gray-200 font-semibold text-sm text-gray-700 hover:bg-gray-50 transition">Voltar</button><button type="button" onclick="confirmPhysicalCardRequest()" class="flex-1 btn-primary text-white font-semibold py-3 rounded-xl text-sm">Solicitar carteirinha</button></div></div>`;
    document.getElementById("physical-card-form").classList.add("hidden");
    review.classList.remove("hidden");
    document.getElementById("physical-card-modal-subtitle").textContent = "Confira os dados antes de enviar.";
}

function backToPhysicalCardForm() {
    document.getElementById("physical-card-review").classList.add("hidden");
    document.getElementById("physical-card-form").classList.remove("hidden");
    document.getElementById("physical-card-modal-subtitle").textContent = "Preencha os dados de entrega.";
}

function confirmPhysicalCardRequest() {
    const request = { ...physicalCardDraft, number: `#SP-${String(Date.now()).slice(-6)}`, status: "Solicitação recebida" };
    request.personKey = physicalCardTargetKey;
    DataService.savePhysicalCardRequestFor(physicalCardTargetKey, request);
    document.getElementById("physical-card-form").classList.add("hidden");
    document.getElementById("physical-card-review").classList.add("hidden");
    const success = document.getElementById("physical-card-success");
    success.innerHTML = `<div class="w-14 h-14 mx-auto rounded-full bg-mint-100 flex items-center justify-center mb-4"><i data-lucide="check" class="w-7 h-7 text-mint-600"></i></div><h4 class="text-xl font-bold text-gray-900">Solicitação realizada!</h4><p class="text-sm text-gray-500 mt-2">Seu pedido de carteirinha física foi registrado.</p><div class="bg-gray-50 rounded-xl p-4 mt-5 text-sm text-left space-y-2"><div class="flex justify-between gap-4"><span class="text-gray-500">Número da solicitação</span><strong class="font-mono">${request.number}</strong></div><div class="flex justify-between gap-4"><span class="text-gray-500">Status</span><strong class="text-mint-700">${request.status}</strong></div></div><button type="button" onclick="closeModal('modal-physical-card')" class="w-full btn-primary text-white font-semibold py-3 rounded-xl text-sm mt-5">Voltar para carteirinha</button>`;
    success.classList.remove("hidden");
    document.getElementById("physical-card-modal-subtitle").textContent = "Pedido registrado.";
    renderPhysicalCardStatus();
    renderDependents();
    renderDependentPhysicalCards();
    lucide.createIcons();
    showToast("Solicitação realizada!", "success");
}

let physicalCardDraft = null;

document.getElementById("physical-card-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    physicalCardDraft = getPhysicalCardFormData();
    renderPhysicalCardReview(physicalCardDraft);
});

function flipDigitalCard() {
    document.getElementById("digital-card")?.classList.toggle("is-flipped");
}

function renderDashboard() {
    const user = DataService.getCurrentUser();
    if (!user) {
        showPage("page-landing");
        return;
    }

    populateBeneficiaryFields();

    // Saudação e avatar
    document.getElementById("dash-greeting").textContent = `Olá, ${user.nome.split(" ")[0]}!`;
    document.getElementById("user-avatar").textContent = user.nome.charAt(0).toUpperCase();
    document.getElementById("user-avatar-icon").setAttribute("data-lucide", getProfileIcon(user.profileIcon));

    // Carteirinha digital
    const planoPago = getSelectedPlan(user);
    user.plano = planoPago;
    DataService.setCurrentUser(user);
    renderDigitalCard(user, planoPago);
    updatePlanCards(planoPago);
    applyPlanLockState();
    updateScheduleActionButtons();
    if (!planoPago) showDashSection("dash-plans");

    // Estatísticas + listas (filtradas pelo usuário logado)
    const appointments = DataService.getAppointments().filter((a) => a.userId === user.id);
    const exams = DataService.getExams().filter((e) => e.userId === user.id);
    const regularAppointments = appointments.filter((appointment) => appointment.type !== "Teleconsulta" && isPendingSchedule(appointment));
    const pendingExams = exams.filter((exam) => isPendingSchedule(exam));
    const activeTeleconsultas = appointments.filter((appointment) => appointment.type === "Teleconsulta" && isTeleconsultaScheduled(appointment));

    document.getElementById("stat-appointments").textContent = regularAppointments.length;
    document.getElementById("stat-exams").textContent = pendingExams.length;
    document.getElementById("stat-tele").textContent = activeTeleconsultas.length;

    renderAppointments(regularAppointments);
    renderExams(exams);
    renderTeleconsultas(appointments);
    renderTeleconsultaHistory(appointments);
    renderRecentItems(appointments, exams);
    renderHospitals();
    renderContacts(appointments);
    renderDependents();
    fillProfile(user);
}

function isTeleconsultaScheduled(appointment, referenceDate = new Date()) {
    if (!appointment || appointment.type !== "Teleconsulta") return false;
    if (isTeleconsultaSessionEnded(appointment)) return false;
    if (isTeleconsultaReconnectAvailable(appointment, referenceDate)) return true;

    const scheduledAt = new Date(`${appointment.date}T${appointment.time}`);
    const toleranceWindow = new Date(scheduledAt.getTime() + 10 * 60000);
    return referenceDate <= toleranceWindow;
}

function renderTeleconsultas(appointments) {
    const container = document.getElementById("teleconsultas-agendadas");
    if (!container) return;

    if (teleReconnectTimer) {
        clearInterval(teleReconnectTimer);
        teleReconnectTimer = null;
    }

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
            const reconnectAvailable = isTeleconsultaReconnectAvailable(appointment);
            const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}`);
            const canOpen = !sessionEnded && (reconnectAvailable || (now >= appointmentDateTime && now <= new Date(appointmentDateTime.getTime() + 10 * 60000)));
            const reconnectMessage = reconnectAvailable
                ? `<p class="text-xs text-amber-700 mt-1 font-semibold">Você pode retornar por mais <span data-tele-reconnect-countdown="${appointment.id}">${formatTeleconsultaReconnectTime(appointment)}</span></p>`
                : sessionEnded
                    ? '<p class="text-xs text-red-600 mt-1 font-semibold">Sessão encerrada</p>'
                    : canOpen ? '<p class="text-xs text-green-600 mt-1 font-semibold">Atendimento disponível agora</p>' : "";
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
                            ${reconnectMessage}
                        </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        ${canOpen ? `<button onclick="openScheduledTeleconsulta('${appointment.id}')" class="btn-primary text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
                            <i data-lucide="video" class="w-4 h-4"></i>
                            ${reconnectAvailable ? "Retornar à chamada" : "Iniciar chamada"}
                        </button>` : ""}
                        <button onclick="confirmDelete('appointment','${appointment.id}')" class="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-500 transition">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </div>
                </div>`;
        })
        .join("");

    lucide.createIcons();
    if (teleconsultas.some((appointment) => isTeleconsultaReconnectAvailable(appointment))) {
        teleReconnectTimer = setInterval(() => {
            const currentUser = DataService.getCurrentUser();
            if (!currentUser) return;
            renderTeleconsultas(DataService.getAppointments().filter((appointment) => appointment.userId === currentUser.id));
        }, 1000);
    }
}

function isTeleconsultaCompleted(appointment, referenceDate = new Date()) {
    if (!appointment || appointment.type !== "Teleconsulta") return false;
    if (isTeleconsultaSessionEnded(appointment)) return true;
    if (isTeleconsultaReconnectAvailable(appointment, referenceDate)) return false;
    return new Date(`${appointment.date}T${appointment.time}`) < referenceDate;
}

function renderTeleconsultaHistory(appointments) {
    const container = document.getElementById("teleconsultas-history-list");
    if (!container) return;
    const completed = appointments
        .filter((appointment) => isTeleconsultaCompleted(appointment))
        .sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));

    container.innerHTML = completed.length ? completed.map((appointment) => `
        <div class="bg-gray-50 rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0"><i data-lucide="video" class="w-5 h-5 text-purple-600"></i></div>
            <div class="min-w-0">
                <p class="font-bold text-gray-900 truncate">${escapeHtml(appointment.doctor || "Profissional")}</p>
                <p class="text-sm text-gray-500">${escapeHtml(appointment.specialty || "Especialidade")} • Teleconsulta</p>
                <p class="text-xs text-gray-400 mt-1">${formatDate(appointment.date)} às ${escapeHtml(appointment.time || "")}</p>
            </div>
            <span class="ml-auto text-xs font-semibold text-gray-500 whitespace-nowrap">Concluída</span>
        </div>`).join("") : `<p class="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">Nenhuma teleconsulta concluída ainda.</p>`;
    lucide.createIcons();
}

function toggleTeleconsultaHistory() {
    const history = document.getElementById("teleconsultas-history");
    const button = document.getElementById("tele-history-toggle");
    if (!history || !button) return;
    const isHidden = history.classList.toggle("hidden");
    button.textContent = isHidden ? "Histórico de teleconsultas" : "Ocultar histórico";
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
    const sessionState = localStorage.getItem(key);
    if (sessionState === "ended") return true;
    if (!sessionState) return false;
    try {
        const state = JSON.parse(sessionState);
        if (state.status === "reconnect" && Date.now() >= state.reconnectUntil) {
            localStorage.setItem(key, "ended");
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

function markTeleconsultaSessionEnded(appointmentId) {
    if (!appointmentId) return;
    const key = getTeleconsultaSessionKey(appointmentId);
    if (!key) return;
    localStorage.setItem(key, "ended");
}

function markTeleconsultaReconnectAvailable(appointmentId) {
    if (!appointmentId) return;
    const key = getTeleconsultaSessionKey(appointmentId);
    if (!key) return;
    localStorage.setItem(key, JSON.stringify({ status: "reconnect", reconnectUntil: Date.now() + 60000 }));
}

function isTeleconsultaReconnectAvailable(appointment, referenceDate = new Date()) {
    if (!appointment?.id) return false;
    const key = getTeleconsultaSessionKey(appointment.id);
    if (!key) return false;
    try {
        const state = JSON.parse(localStorage.getItem(key) || "null");
        return state?.status === "reconnect" && referenceDate.getTime() < state.reconnectUntil;
    } catch (error) {
        return false;
    }
}

function formatTeleconsultaReconnectTime(appointment) {
    const key = getTeleconsultaSessionKey(appointment?.id);
    if (!key) return "00:00";
    try {
        const state = JSON.parse(localStorage.getItem(key) || "null");
        const remainingSeconds = Math.max(0, Math.ceil((state.reconnectUntil - Date.now()) / 1000));
        return `00:${String(remainingSeconds).padStart(2, "0")}`;
    } catch (error) {
        return "00:00";
    }
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

    if (now > timeoutLimit && !isTeleconsultaReconnectAvailable(appointment)) {
        markTeleconsultaSessionEnded(appointment.id);
        showToast("Sessão encerrada", "error");
        renderDashboard();
        return;
    }

    if (isTeleconsultaReconnectAvailable(appointment)) {
        localStorage.removeItem(getTeleconsultaSessionKey(appointment.id));
    }
    activeTeleconsultaId = appointment.id;
    beginTeleconsultaSession(appointment);
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
    const favoriteNetwork = DataService.getFavoriteNetwork();
    const available = getNearbyNetworks().filter((network) => network.distance <= radius);
    container.innerHTML = available.length ? available.map((network) => `
        <article class="bg-white rounded-2xl border border-gray-100 p-5 card-hover flex flex-col gap-4">
            <div class="flex items-start justify-between gap-4">
                <div class="flex gap-3 min-w-0">
                    <div class="w-11 h-11 rounded-xl bg-brand-100 flex items-center justify-center" aria-hidden="true"><i data-lucide="map-pin" class="w-5 h-5 text-brand-600"></i></div>
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2"><p class="font-bold text-gray-900 truncate">${network.name}</p>${network.name === favoriteNetwork ? '<span class="bg-mint-50 text-mint-700 px-2 py-1 rounded-full text-[10px] font-bold">REDE FAVORITA</span>' : ""}</div>
                        <p class="text-sm text-gray-500">${network.address}</p>
                        <p class="text-xs text-gray-400 mt-1">${network.types.join(" • ")}</p>
                    </div>
                </div>
                <span class="text-sm font-bold text-brand-600 whitespace-nowrap">${network.distance} km</span>
            </div>
            <div class="flex flex-wrap gap-2 text-xs text-gray-600">
                <span class="bg-mint-50 text-mint-700 px-2 py-1 rounded-full">${network.hours}</span>
            </div>
            <button type="button" onclick="toggleFavoriteNetwork('${network.name}')" class="${network.name === favoriteNetwork ? "bg-mint-50 text-mint-700 border border-mint-200" : "border border-brand-600 text-brand-600 hover:bg-brand-50"} font-semibold px-3 py-2.5 rounded-xl text-sm transition">${network.name === favoriteNetwork ? "♥ Rede favorita" : "♡ Favoritar rede"}</button>
        </article>`).join("") : `<div class="bg-white rounded-2xl border border-gray-100 p-8 text-center md:col-span-2"><p class="text-gray-500">Nenhum hospital encontrado neste raio.</p></div>`;
    lucide.createIcons();
}

// Agrupa consultas por médico para mostrar contatos sem duplicar profissionais.
function renderContacts(appointments) {
    const container = document.getElementById("contacts-list");
    if (!container) return;
    const contacts = [...new Map(appointments.map((appointment) => [appointment.doctor, appointment])).values()];
    container.innerHTML = contacts.length ? contacts.map((contact) => `
        <article class="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
            <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-full bg-mint-100 flex items-center justify-center"><i data-lucide="stethoscope" class="w-5 h-5 text-mint-600"></i></div>
                <div class="min-w-0"><p class="font-bold text-gray-900">${escapeHtml(contact.doctor || "Profissional não informado")}</p><p class="text-sm text-gray-500">${escapeHtml(contact.specialty || "Especialidade não informada")}</p><p class="text-xs text-mint-600 mt-1">Disponível para conversa</p></div>
            </div>
            <div class="flex flex-wrap gap-2">
                <button type="button" data-doctor-history="${escapeHtml(contact.doctor || "")}" class="border border-brand-600 text-brand-600 hover:bg-brand-50 font-semibold px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition"><i data-lucide="clipboard-list" class="w-4 h-4"></i> Histórico e dados</button>
                <button type="button" data-doctor-chat="${escapeHtml(contact.doctor || "")}" class="btn-primary text-white px-3 py-2 rounded-xl text-sm flex items-center gap-2"><i data-lucide="message-circle" class="w-4 h-4"></i> Falar</button>
            </div>
        </article>`).join("") : `<div class="bg-white rounded-2xl border border-gray-100 p-8 text-center md:col-span-2"><p class="text-gray-500">Seus médicos aparecerão aqui após uma consulta.</p></div>`;
    container.querySelectorAll("[data-doctor-history]").forEach((button) => {
        button.addEventListener("click", () => openDoctorHistory(button.dataset.doctorHistory));
    });
    container.querySelectorAll("[data-doctor-chat]").forEach((button) => {
        button.addEventListener("click", () => openChat(button.dataset.doctorChat));
    });
    lucide.createIcons();
}

// Reúne todos os atendimentos do médico selecionado e apresenta seus dados no modal de Contatos.
function openDoctorHistory(doctorName) {
    const user = DataService.getCurrentUser();
    if (!user) return;
    const appointments = DataService.getAppointments()
        .filter((appointment) => appointment.userId === user.id && appointment.doctor === doctorName)
        .sort((a, b) => new Date(`${b.date}T${b.time || "00:00"}`) - new Date(`${a.date}T${a.time || "00:00"}`));
    if (!appointments.length) {
        showToast("Não há atendimentos registrados para este médico.", "error");
        return;
    }

    const latestAppointment = appointments[0];
    const doctorCrm = getDoctorCrm(latestAppointment);
    const network = getNetworkDetails(latestAppointment.network);
    document.getElementById("doctor-history-title").textContent = latestAppointment.doctor || "Profissional";
    document.getElementById("doctor-history-subtitle").textContent = latestAppointment.specialty || "Histórico de atendimentos";
    document.getElementById("doctor-history-content").innerHTML = `
        ${detailSection("badge-check", "Identificação profissional", [
            { label: "Nome", value: latestAppointment.doctor },
            { label: "Especialidade", value: latestAppointment.specialty },
            { label: "CRM", value: doctorCrm.value },
        ])}
        ${doctorCrm.simulated ? '<p class="text-xs text-gray-400">CRM fictício para demonstração; não representa um registro profissional real.</p>' : ""}
        ${detailSection("map-pin", "Local de atendimento mais recente", [
            { label: "Rede / clínica", value: latestAppointment.network },
            { label: "Endereço", value: latestAppointment.address || network?.address },
            { label: "Telefone", value: latestAppointment.phone || network?.phone },
            { label: "Funcionamento", value: latestAppointment.hours || network?.hours },
        ], "mint")}
        <section class="border border-gray-100 rounded-xl p-4 bg-gray-50/60">
            <div class="flex items-center gap-2 mb-3"><i data-lucide="history" class="w-4 h-4 text-brand-600"></i><h4 class="text-xs font-bold uppercase tracking-wide text-gray-500">Atendimentos registrados (${appointments.length})</h4></div>
            <div class="space-y-3">${appointments.map((appointment) => {
                const appointmentNetwork = getNetworkDetails(appointment.network);
                const status = appointment.status || (isCompletedSchedule(appointment) ? "Concluída" : "Agendada");
                return `<article class="border border-gray-100 rounded-xl p-3 bg-white">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div><p class="font-semibold text-gray-900">${appointment.date ? escapeHtml(formatDate(appointment.date)) : "Data não informada"}${appointment.time ? ` às ${escapeHtml(appointment.time)}` : ""}</p><p class="text-sm text-gray-500 mt-1">${escapeHtml(appointment.specialty || "Especialidade não informada")} • ${escapeHtml(appointment.type || "Modalidade não informada")}</p></div>
                        <span class="text-xs font-semibold text-brand-600">${escapeHtml(status)}</span>
                    </div>
                    <div class="mt-3 space-y-1 text-xs text-gray-500">
                        ${appointment.beneficiaryName ? `<p>Beneficiário: ${escapeHtml(appointment.beneficiaryName)}</p>` : ""}
                        ${appointment.network ? `<p>Local: ${escapeHtml(appointment.network)}</p>` : ""}
                        ${(appointment.address || appointmentNetwork?.address) ? `<p>Endereço: ${escapeHtml(appointment.address || appointmentNetwork.address)}</p>` : ""}
                        ${appointment.protocol || appointment.protocolo ? `<p>Protocolo: ${escapeHtml(appointment.protocol || appointment.protocolo)}</p>` : ""}
                    </div>
                </article>`;
            }).join("")}</div>
        </section>`;
    document.getElementById("modal-doctor-history").classList.remove("hidden");
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
        const legalText = person.legalResponsible === "Não" ? `Responsável: ${person.responsibleName || "Não informado"}` : "Responsável legal: Sim";
        const request = DataService.getPhysicalCardRequestFor(`dependent_${targetId || index}`);
        const canCancelRequest = request && !["Enviada", "Entregue", "cancelada"].includes(request.status);
        const cardAction = request && canCancelRequest ? `<p class="text-xs text-gray-500 mt-3">Carteirinha física: <strong>${escapeHtml(request.status || "Solicitação recebida")}</strong></p><button type="button" onclick="event.stopPropagation(); confirmDelete('physical-card', '${`dependent_${targetId || index}`}')" class="text-xs font-semibold text-red-500 hover:underline mt-2">Cancelar solicitação</button>` : request ? `<p class="text-xs text-gray-500 mt-3">Carteirinha física: <strong>${escapeHtml(request.status)}</strong></p>` : `<button type="button" onclick="event.stopPropagation(); openPhysicalCardRequest('dependent_${targetId || index}')" class="text-xs font-semibold text-brand-600 hover:underline mt-3">Solicitar carteirinha física</button>`;
        return `<article class="dependent-card dependent-card-clickable bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between gap-4" onclick="openDependentDetails('${targetId || index}')" tabindex="0" role="button" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDependentDetails('${targetId || index}'); }"><div class="dependent-card-info flex min-w-0 items-center gap-4"><div class="w-12 h-12 rounded-full ${iconBackground} flex-shrink-0 flex items-center justify-center"><i data-lucide="${icon}" class="w-6 h-6 ${iconColor}"></i></div><div class="min-w-0"><p class="font-bold text-gray-900 truncate">${person.name}</p><p class="text-sm text-gray-500 truncate">${person.type} • ${person.relation}</p><p class="text-xs text-gray-500 mt-1">Plano: ${escapeHtml(activePlan || "Nenhum plano contratado")}</p>${!isChild ? `<p class="text-xs text-gray-500 mt-1">Acompanhante: ${person.companion ? "Sim" : "Não"}</p>` : ""}<p class="text-xs text-gray-500 mt-1">${legalText}</p>${cardAction}</div></div><button type="button" onclick="event.stopPropagation(); confirmDelete('dependent', '${targetId}', ${index})" class="dependent-delete-button flex-shrink-0 w-10 h-10 rounded-xl hover:bg-red-50 text-red-500 hover:text-red-600 transition flex items-center justify-center" aria-label="Excluir ${person.name}" title="Excluir dependente"><i data-lucide="trash-2" class="w-5 h-5"></i></button></article>`;
    }).join("") : `<div class="bg-white rounded-2xl border border-gray-100 p-8 text-center md:col-span-2"><p class="text-gray-500">Adicione uma criança ou pessoa idosa para cuidar dela pelo app.</p></div>`;
    lucide.createIcons();
}

function openDependentDetails(dependentId) {
    const dependents = DataService.getUserData("dependents");
    const dependent = dependents.find((person, index) => String(person.id || index) === String(dependentId));
    if (!dependent) return;
    const user = DataService.getCurrentUser();
    const plan = getSelectedPlan(user) || "Nenhum plano contratado";
    const fields = [["Nome completo", dependent.name], ["Grau de parentesco", dependent.relation], ["Data de nascimento", dependent.birthdate || dependent.data_nascimento], ["CPF", dependent.cpf], ["Plano", plan], ["Número do beneficiário", dependent.id], ["Status do cadastro", dependent.status || "Cadastrado"], ["Responsável legal", dependent.responsibleName], ["Acompanhante", dependent.companion === undefined ? "" : dependent.companion ? "Sim" : "Não"]].filter(([, value]) => value !== undefined && value !== null && String(value).trim());
    document.getElementById("dependent-details-subtitle").textContent = dependent.type || "Dependente";
    document.getElementById("dependent-details-content").innerHTML = fields.map(([label, value]) => `<div class="flex items-start justify-between gap-4 border-b border-gray-100 pb-2 text-sm"><span class="text-gray-500">${label}</span><strong class="text-gray-800 text-right">${escapeHtml(value)}</strong></div>`).join("");
    document.getElementById("modal-dependent-details").classList.remove("hidden");
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
    const legalFields = document.getElementById("dependent-legal-data");
    if (legalFields) {
        const visible = value === "Não";
        legalFields.classList.toggle("hidden", !visible);
        document.getElementById("dependent-responsible-name").required = visible;
        document.getElementById("dependent-responsible-cpf").required = visible;
    }
}

document.getElementById("dependent-form").addEventListener("submit", function (e) {
    e.preventDefault();

    const type = document.getElementById("dependent-type").value;
    const relation = document.getElementById("dependent-relation").value.trim() || "Responsável";
    const legal = document.getElementById("dependent-legal").value;
    const name = document.getElementById("dependent-name").value.trim();
    const cpf = document.getElementById("dependent-cpf").value.trim();
    const responsibleName = document.getElementById("dependent-responsible-name").value.trim();
    const responsibleCpf = document.getElementById("dependent-responsible-cpf").value.trim();

    if (!name) {
        showToast("Informe o nome do dependente.", "error");
        return;
    }
    if (!cpf || !isValidCpf(cpf)) {
        showToast("Informe um CPF válido do dependente.", "error");
        return;
    }
    if (legal === "Não") {
        if (!responsibleName) {
            showToast("Informe o nome do responsável legal.", "error");
            return;
        }
        if (!responsibleCpf || !isValidCpf(responsibleCpf)) {
            showToast("Informe um CPF válido do responsável legal.", "error");
            return;
        }
    }

    const dependents = DataService.getUserData("dependents");
    dependents.push({
        name,
        id: "DEP" + Date.now(),
        cpf,
        type,
        gender: document.getElementById("dependent-gender").value,
        relation: type === "Pediatria" ? `Responsável legal: ${legal}` : relation,
        companion: type === "Geriatria" && document.getElementById("dependent-companion").checked,
        legalResponsible: legal,
        responsibleName: legal === "Não" ? responsibleName : "",
        responsibleCpf: legal === "Não" ? responsibleCpf : "",
    });
    DataService.saveUserData("dependents", dependents);
    closeModal("modal-dependent");
    this.reset();
    selectDependentType("Pediatria");
    selectLegalResponsibility("Sim");
    renderDashboard();
    showToast("Pessoa adicionada", "success");
});

function fillProfile(user) {
    document.getElementById("profile-name").value = user.nome || "";
    document.getElementById("profile-email").value = user.email || "";
    document.getElementById("profile-phone").value = user.telefone || "";
    document.getElementById("profile-address").value = user.endereco || "";
    document.getElementById("profile-cpf").value = user.cpf || "";
    document.getElementById("profile-birthdate").value = user.data_nascimento || "";
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
            <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-email">E-mail</label><input id="profile-email" type="email" readonly class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"><p class="text-xs text-gray-500 mt-1">O e-mail é gerenciado pelo Supabase Auth.</p></div>
            <button type="button" onclick="togglePasswordChange()" id="change-password-toggle" class="border border-brand-600 text-brand-600 hover:bg-brand-50 font-semibold px-4 py-3 rounded-xl text-sm transition">Alterar senha</button>
            <div id="password-change-panel" class="hidden rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-4">
                <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-current-password">Senha atual</label><input id="profile-current-password" type="password" autocomplete="current-password" class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
                <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-new-password">Nova senha</label><input id="profile-new-password" type="password" minlength="6" autocomplete="new-password" class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
                <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-confirm-password">Confirmar nova senha</label><input id="profile-confirm-password" type="password" minlength="6" autocomplete="new-password" class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
                <button type="button" onclick="changeProfilePassword()" class="btn-primary text-white font-semibold px-4 py-3 rounded-xl text-sm">Confirmar alteração</button>
            </div>
            <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-phone">Telefone</label><input id="profile-phone" required maxlength="15" inputmode="numeric" class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
            <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-cpf">CPF</label><input id="profile-cpf" required maxlength="14" inputmode="numeric" class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
            <div><label class="block text-sm font-semibold text-gray-700 mb-1.5" for="profile-birthdate">Data de nascimento</label><input id="profile-birthdate" type="date" required class="input-style w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none"></div>
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
    const cpf = document.getElementById("profile-cpf").value.trim();
    const dataNascimento = document.getElementById("profile-birthdate").value;
    if (!isValidCpf(cpf)) {
        showToast("Informe um CPF válido.", "error");
        return;
    }
    if (!dataNascimento) {
        showToast("Informe a data de nascimento.", "error");
        return;
    }
    user.nome = document.getElementById("profile-name").value.trim();
    user.telefone = document.getElementById("profile-phone").value.trim();
    user.endereco = document.getElementById("profile-address").value.trim();
    user.cpf = cpf;
    user.data_nascimento = dataNascimento;
    user.profileIcon = document.getElementById("profile-icon").value;
    if (user.modoDemo) {
        DataService.setCurrentUser(user);
        renderDashboard();
        showToast("Perfil atualizado no modo demonstração", "success");
        return;
    }

    const client = getSupabaseClient();
    if (!client) return;
    client.auth.updateUser({
        data: {
            nome: user.nome,
            telefone: user.telefone,
            endereco: user.endereco,
            cpf: user.cpf,
            data_nascimento: user.data_nascimento,
        },
    }).then(async ({ error }) => {
        if (error) throw error;
        const { error: profileError } = await client
            .from("profiles")
            .update({
                nome: user.nome,
                telefone: user.telefone,
                endereco: user.endereco,
                cpf: user.cpf,
                data_nascimento: user.data_nascimento,
            })
            .eq("id", user.id);
        if (profileError) throw profileError;
        DataService.setCurrentUser(user);
        renderDashboard();
        showToast("Perfil atualizado", "success");
    }).catch((error) => {
        console.error(error);
        showToast(error.message || "Não foi possível salvar o perfil.", "error");
    });
}

function togglePasswordChange() {
    const panel = document.getElementById("password-change-panel");
    const button = document.getElementById("change-password-toggle");
    if (!panel || !button) return;
    const isHidden = panel.classList.toggle("hidden");
    button.textContent = isHidden ? "Alterar senha" : "Fechar alteração de senha";
}

async function changeProfilePassword() {
    const user = DataService.getCurrentUser();
    const currentPassword = document.getElementById("profile-current-password")?.value || "";
    const newPassword = document.getElementById("profile-new-password")?.value || "";
    const confirmation = document.getElementById("profile-confirm-password")?.value || "";
    if (!currentPassword || !newPassword || !confirmation) {
        showToast("Preencha os três campos de senha.", "error");
        return;
    }
    if (newPassword.length < 6) {
        showToast("A nova senha deve ter pelo menos 6 caracteres.", "error");
        return;
    }
    if (newPassword !== confirmation) {
        showToast("As novas senhas não coincidem.", "error");
        return;
    }
    if (user.modoDemo) {
        showToast("A alteração de senha não está disponível na demonstração.", "error");
        return;
    }

    const client = getSupabaseClient();
    if (!client) return;
    try {
        const { data: loginData, error: loginError } = await client.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
        });
        if (loginError) throw loginError;
        if (loginData.user.id !== user.id) throw new Error("A senha atual não confere com esta conta.");
        const { error } = await client.auth.updateUser({ password: newPassword });
        if (error) throw error;
        document.getElementById("password-change-panel")?.classList.add("hidden");
        document.getElementById("change-password-toggle").textContent = "Alterar senha";
        document.getElementById("profile-current-password").value = "";
        document.getElementById("profile-new-password").value = "";
        document.getElementById("profile-confirm-password").value = "";
        showToast("Senha alterada com sucesso.", "success");
    } catch (error) {
        console.error(error);
        showToast(error.message || "Não foi possível alterar a senha.", "error");
    }
}

function openChat(doctor) {
    const messagesContainer = document.getElementById("chat-messages");
    const history = DataService.getConversationHistory(doctor);
    messagesContainer.dataset.doctor = doctor;
    messagesContainer.innerHTML = history.length ? history.map((msg) => `
        <div class="${msg.sender === "user" ? "text-right" : ""}">
            <p class="${msg.sender === "user" ? "bg-brand-50 text-gray-700 rounded-xl p-3 text-sm inline-block max-w-[80%]" : "bg-gray-100 text-gray-700 rounded-xl p-3 text-sm inline-block max-w-[80%]"}">${escapeHtml(msg.text)}</p>
        </div>
    `).join("") : `<p class="bg-brand-50 text-gray-700 rounded-xl p-3 text-sm">Olá! Esta é uma conversa segura com ${doctor}. Como posso ajudar?</p>`;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    showDashSection("dash-chat");
    showToast(`Conversa aberta com ${doctor}`, "success");
}

function toggleAssistant() {
    if (!DataService.getCurrentUser()) return;
    const panel = document.getElementById("assistant-panel");
    const shouldOpen = panel.classList.contains("hidden");
    panel.classList.toggle("hidden", !shouldOpen);
    if (shouldOpen) resetAssistantMode();
    lucide.createIcons();
}

function resetAssistantMode() {
    document.getElementById("assistant-choice")?.classList.remove("hidden");
    document.getElementById("assistant-messages")?.classList.add("hidden");
    document.getElementById("assistant-form")?.classList.add("hidden");
    document.getElementById("support-interface")?.classList.add("hidden");
}

function selectAssistantMode(mode) {
    const choice = document.getElementById("assistant-choice");
    const messages = document.getElementById("assistant-messages");
    const form = document.getElementById("assistant-form");
    const support = document.getElementById("support-interface");
    choice?.classList.add("hidden");
    if (mode === "human") {
        messages?.classList.add("hidden");
        form?.classList.add("hidden");
        support?.classList.remove("hidden");
        document.getElementById("support-input")?.focus();
        return;
    }
    support?.classList.add("hidden");
    messages?.classList.remove("hidden");
    form?.classList.remove("hidden");
    document.getElementById("assistant-input")?.focus();
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
    document.getElementById("recovery-email-field").classList.remove("hidden");
    document.getElementById("recovery-email").required = true;
}

function hidePasswordRecovery() {
    document.getElementById("password-recovery-form").classList.add("hidden");
    document.getElementById("password-token-form").classList.add("hidden");
    document.getElementById("login-form").classList.remove("hidden");
}

function getNetworkDetails(networkName) {
    return networksDB.find((network) => network.name === networkName) || null;
}

function getDoctorCrm(appointment) {
    if (appointment?.crm) return { value: appointment.crm, simulated: false };

    const doctorName = String(appointment?.doctor || "Profissional");
    const hash = [...doctorName].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 0);
    return { value: `CRM-SP ${String(100000 + (hash % 900000))}`, simulated: true };
}

function detailSection(icon, title, fields, tone = "brand") {
    const visibleFields = fields.filter((field) => field.value !== undefined && field.value !== null && String(field.value).trim() !== "");
    if (!visibleFields.length) return "";
    return `<section class="border border-gray-100 rounded-xl p-4 bg-gray-50/60">
        <div class="flex items-center gap-2 mb-3"><i data-lucide="${icon}" class="w-4 h-4 ${tone === "mint" ? "text-mint-600" : "text-brand-600"}"></i><h4 class="text-xs font-bold uppercase tracking-wide text-gray-500">${title}</h4></div>
        <div class="space-y-2">${visibleFields.map((field) => `<div class="flex items-start justify-between gap-4 text-sm"><span class="text-gray-500">${field.label}</span><span class="text-gray-800 font-semibold text-right">${escapeHtml(field.value)}</span></div>`).join("")}</div>
    </section>`;
}

function getAppointmentTeleconsultaAvailability(appointment) {
    if (!appointment || appointment.type !== "Teleconsulta" || isTeleconsultaSessionEnded(appointment)) return false;
    if (isTeleconsultaReconnectAvailable(appointment)) return true;
    const now = new Date();
    const currentDate = getLocalDateString(now);
    const currentTime = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
    return appointment.date === currentDate && getTimeInMinutes(appointment.time) >= getTimeInMinutes(currentTime) - 10 && getTimeInMinutes(appointment.time) <= getTimeInMinutes(currentTime) + 10;
}

function canRemoveAppointment(appointment, referenceDate = new Date()) {
    if (!appointment || ["cancelada", "cancelado", "concluída", "concluido", "concluída", "completed"].includes(String(appointment.status || "").toLowerCase())) return false;
    if (isTeleconsultaSessionEnded(appointment)) return false;
    const appointmentDateTime = new Date(`${appointment.date}T${appointment.time}`);
    return appointmentDateTime > referenceDate;
}

function openAppointmentDetails(appointmentId) {
    const appointment = DataService.getAppointments().find((item) => item.id === appointmentId);
    if (!appointment) return;
    const network = getNetworkDetails(appointment.network);
    const doctorCrm = getDoctorCrm(appointment);
    const status = appointment.status || (isTeleconsultaSessionEnded(appointment) ? "Sessão encerrada" : "Consulta agendada");
    document.getElementById("appointment-details-subtitle").textContent = `${appointment.doctor || "Profissional não informado"} • ${appointment.specialty || "Especialidade não informada"}`;
    document.getElementById("appointment-details-content").innerHTML = [
        detailSection("user", "Profissional", [
            { label: "Nome", value: appointment.doctor },
            { label: "Especialidade", value: appointment.specialty },
            { label: "CRM", value: doctorCrm.value },
        ]),
        detailSection("calendar-days", "Data e horário", [
            { label: "Data", value: appointment.date ? formatDate(appointment.date) : "" },
            { label: "Horário", value: appointment.time },
        ]),
        detailSection("user", "Beneficiário", [{ label: "Nome", value: appointment.beneficiaryName }]),
        detailSection("map-pin", "Local / rede", [
            { label: "Rede", value: appointment.network },
            { label: "Endereço", value: appointment.address || network?.address },
            { label: "Telefone", value: appointment.phone || network?.phone },
            { label: "Funcionamento", value: appointment.hours || network?.hours },
        ]),
        detailSection(appointment.type === "Teleconsulta" ? "video" : "building-2", "Tipo de atendimento", [
            { label: "Modalidade", value: appointment.type },
            { label: "Informações", value: appointment.teleconsultationInfo },
        ], "mint"),
        detailSection("circle-check", "Status", [{ label: "Situação", value: status }], "mint"),
        detailSection("info", "Informações adicionais", [
            { label: "Protocolo", value: appointment.protocol || appointment.protocolo },
            { label: "Agendado em", value: appointment.scheduledAt || appointment.dataAgendamento },
            { label: "Observações", value: appointment.notes || appointment.observations },
        ]),
        ...(doctorCrm.simulated ? ['<p class="text-xs text-gray-400">CRM fictício para demonstração; não representa um registro profissional real.</p>'] : []),
    ].join("");
    document.getElementById("appointment-details-actions").innerHTML = `
        <button type="button" onclick="closeModal('modal-appointment-details')" class="flex-1 border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50 transition">Fechar</button>
        ${getAppointmentTeleconsultaAvailability(appointment) ? `<button type="button" onclick="closeModal('modal-appointment-details'); openScheduledTeleconsulta('${appointment.id}')" class="flex-1 btn-primary text-white font-semibold py-3 rounded-xl text-sm flex items-center justify-center gap-2"><i data-lucide="video" class="w-4 h-4"></i>Entrar na teleconsulta</button>` : ""}
        ${canRemoveAppointment(appointment) ? `<button type="button" onclick="closeModal('modal-appointment-details'); confirmDelete('appointment','${appointment.id}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl text-sm">Cancelar consulta</button>` : ""}`;
    document.getElementById("modal-appointment-details").classList.remove("hidden");
    lucide.createIcons();
}

function openExamDetails(examId) {
    const exam = DataService.getExams().find((item) => item.id === examId);
    if (!exam) return;
    const network = getNetworkDetails(exam.network);
    const status = exam.status || "Exame agendado";
    document.getElementById("exam-details-subtitle").textContent = exam.examType || "Exame";
    document.getElementById("exam-details-content").innerHTML = [
        detailSection("file-text", "Exame", [{ label: "Nome", value: exam.examType }], "mint"),
        detailSection("calendar-days", "Data e horário", [
            { label: "Data", value: exam.date ? formatDate(exam.date) : "" },
            { label: "Horário", value: exam.time },
        ]),
        detailSection("user", "Beneficiário", [{ label: "Nome", value: exam.beneficiaryName }]),
        detailSection("map-pin", "Local", [
            { label: "Rede", value: exam.network },
            { label: "Endereço", value: exam.address || network?.address },
            { label: "Telefone", value: exam.phone || network?.phone },
            { label: "Funcionamento", value: exam.hours || network?.hours },
        ]),
        detailSection("circle-check", "Status", [{ label: "Situação", value: status }], "mint"),
        detailSection("info", "Informações adicionais", [
            { label: "Protocolo", value: exam.protocol || exam.protocolo },
            { label: "Agendado em", value: exam.scheduledAt || exam.dataAgendamento },
            { label: "Observações", value: exam.notes || exam.observations },
        ]),
    ].join("");
    document.getElementById("exam-details-actions").innerHTML = `
        <button type="button" onclick="closeModal('modal-exam-details')" class="flex-1 border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-50 transition">Fechar</button>
        ${canRemoveAppointment(exam) ? `<button type="button" onclick="closeModal('modal-exam-details'); confirmDelete('exam','${exam.id}')" class="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl text-sm">Cancelar exame</button>` : ""}`;
    document.getElementById("modal-exam-details").classList.remove("hidden");
    lucide.createIcons();
}

function renderAppointments(appointments) {
    const container = document.getElementById("appointments-list");
    const now = new Date();
    const activeAppointments = appointments.filter((appointment) => isPendingSchedule(appointment, now));
    const completedAppointments = appointments.filter((appointment) => isCompletedSchedule(appointment, now));
    renderAppointmentCards(activeAppointments, container, "Nenhuma consulta agendada.");
    renderAppointmentCards(completedAppointments, document.getElementById("appointments-history-list"), "Nenhuma consulta concluída ainda.");
}

function isCompletedSchedule(item, referenceDate = new Date()) {
    const status = String(item?.status || "").toLowerCase();
    if (!item || ["cancelada", "cancelado"].includes(status)) return false;
    if (["concluída", "concluida", "concluído", "concluido", "completed"].includes(status)) return true;
    return new Date(`${item.date}T${item.time || "00:00"}`) < referenceDate;
}

function isPendingSchedule(item, referenceDate = new Date()) {
    const status = String(item?.status || "").toLowerCase();
    if (!item || ["cancelada", "cancelado"].includes(status)) return false;
    return !isCompletedSchedule(item, referenceDate);
}

function renderAppointmentCards(appointments, container, emptyMessage) {
    if (!container) return;
    const orderedAppointments = [...appointments].sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    if (!orderedAppointments.length) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <i data-lucide="calendar" class="w-12 h-12 text-gray-300 mx-auto mb-3"></i>
                <p class="text-gray-400">${emptyMessage}</p>
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
            const canRemove = canRemoveAppointment(a, now);
            const isCurrentTeleconsulta = isTele && !isSessionEnded && a.date === currentDate && a.time === currentTime;
            const isWithinTolerance = isTele && !isSessionEnded && a.date === currentDate && getTimeInMinutes(a.time) >= getTimeInMinutes(currentTime) - 10 && getTimeInMinutes(a.time) <= getTimeInMinutes(currentTime) + 10;
            const canStartCall = isTele && !isSessionEnded && isWithinTolerance;
            const beneficiaryLabel = a.beneficiaryName ? ` • ${a.beneficiaryName}` : "";

            return `
                <div class="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between card-hover appointment-card-clickable" onclick="openAppointmentDetails('${a.id}')" tabindex="0" role="button" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAppointmentDetails('${a.id}'); }">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl ${isTele ? "bg-purple-100" : "bg-brand-100"} flex items-center justify-center">
                            <i data-lucide="${isTele ? "video" : "stethoscope"}" class="w-6 h-6 ${isTele ? "text-purple-600" : "text-brand-600"}"></i>
                        </div>
                        <div>
                            <p class="font-bold text-gray-900">${a.doctor}</p>
                            <p class="text-sm text-gray-500">${a.specialty} • ${a.type}${beneficiaryLabel}</p>
                            <p class="text-xs text-gray-400 mt-1">${formatDate(a.date)} às ${a.time}</p>
                            ${isSessionEnded ? '<p class="text-xs text-red-600 mt-1 font-semibold">Sessão encerrada</p>' : isCurrentTeleconsulta ? '<p class="text-xs text-green-600 mt-1 font-semibold">Atendimento disponível agora</p>' : ""}
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${canStartCall ? `<button onclick="event.stopPropagation(); openScheduledTeleconsulta('${a.id}')" class="btn-primary text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
                            <i data-lucide="video" class="w-4 h-4"></i>
                            Iniciar chamada
                        </button>` : ""}
                        ${canRemove ? `<button onclick="event.stopPropagation(); confirmDelete('appointment','${a.id}')" class="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-500 transition" aria-label="Cancelar consulta">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>` : ""}
                    </div>
                </div>`;
        })
        .join("");
    lucide.createIcons();
}

function toggleAppointmentHistory() {
    const history = document.getElementById("appointments-history");
    const button = document.getElementById("appointment-history-toggle");
    if (!history || !button) return;
    const isHidden = history.classList.toggle("hidden");
    button.textContent = isHidden ? "Histórico de consultas" : "Ocultar histórico";
}

function renderExams(exams) {
    const container = document.getElementById("exams-list");
    const now = new Date();
    const activeExams = exams.filter((exam) => !isCompletedSchedule(exam, now));
    const completedExams = exams.filter((exam) => isCompletedSchedule(exam, now));
    renderExamCards(activeExams, container, "Nenhum exame agendado.");
    renderExamCards(completedExams, document.getElementById("exams-history-list"), "Nenhum exame concluído ainda.");
}

function renderExamCards(exams, container, emptyMessage) {
    if (!container) return;
    const orderedExams = [...exams].sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
    if (!orderedExams.length) {
        container.innerHTML = `
            <div class="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <i data-lucide="file-text" class="w-12 h-12 text-gray-300 mx-auto mb-3"></i>
                <p class="text-gray-400">${emptyMessage}</p>
            </div>`;
        lucide.createIcons();
        return;
    }

    container.innerHTML = orderedExams
        .map(
            (e) => `
                <div class="bg-white rounded-2xl border border-gray-100 p-5 flex items-center justify-between card-hover appointment-card-clickable" onclick="openExamDetails('${e.id}')" tabindex="0" role="button" onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openExamDetails('${e.id}'); }">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-xl bg-mint-100 flex items-center justify-center">
                            <i data-lucide="file-text" class="w-6 h-6 text-mint-600"></i>
                        </div>
                        <div>
                            <p class="font-bold text-gray-900">${e.examType}</p>
                            <p class="text-sm text-gray-500">${e.beneficiaryName ? `Para: ${e.beneficiaryName}` : "Beneficiário não informado"}</p>
                            <p class="text-xs text-gray-400 mt-1">${formatDate(e.date)} às ${e.time}</p>
                            ${e.notes ? `<p class="text-xs text-gray-400">${e.notes}</p>` : ""}
                        </div>
                    </div>
                    ${canRemoveAppointment(e) ? `<button onclick="event.stopPropagation(); confirmDelete('exam','${e.id}')" class="p-2 rounded-xl hover:bg-red-50 text-red-400 hover:text-red-500 transition" aria-label="Cancelar exame">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>` : ""}
                </div>`
        )
        .join("");
    lucide.createIcons();
}

function toggleExamHistory() {
    const history = document.getElementById("exams-history");
    const button = document.getElementById("exam-history-toggle");
    if (!history || !button) return;
    const isHidden = history.classList.toggle("hidden");
    button.textContent = isHidden ? "Histórico de exames" : "Ocultar histórico";
}

/** Junta consultas + exames num só feed, ordenado por data, mostrando os 5 próximos. */
function renderRecentItems(appointments, exams) {
    const container = document.getElementById("recent-items");
    const now = new Date();

    const todosItens = [
        ...appointments.filter((a) => isPendingSchedule(a, now)).map((a) => ({
            itemType: a.type === "Teleconsulta" ? "teleconsulta" : "consulta",
            label: `${a.doctor} - ${a.specialty}`,
            dateStr: `${formatDate(a.date)} ${a.time}`,
            date: a.date,
            time: a.time,
        })),
        ...exams.filter((e) => isPendingSchedule(e, now)).map((e) => ({
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
            const isTeleconsulta = i.itemType === "teleconsulta";
            return `
                <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition">
                    <div class="w-2 h-2 rounded-full ${isConsulta ? "bg-brand-500" : isTeleconsulta ? "bg-purple-500" : "bg-mint-500"}"></div>
                    <div class="flex-1">
                        <p class="text-sm font-medium text-gray-800">${i.label}</p>
                        <p class="text-xs text-gray-400">${i.dateStr}</p>
                    </div>
                    <span class="text-xs font-medium px-2 py-1 rounded-full ${isConsulta ? "bg-brand-50 text-brand-600" : isTeleconsulta ? "bg-purple-50 text-purple-600" : "bg-mint-50 text-mint-600"}">
                        ${isConsulta ? "Consulta" : isTeleconsulta ? "Teleconsulta" : "Exame"}
                    </span>
                </div>`;
        })
        .join("");
}

const clinicClosingTime = "23:00";
const appointmentTimeSlots = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30" , "20:00", "20:30", "21:00" , "21:30", "22:00", "22:30", "23:00"];
const examTimeSlots = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30" , "20:00", "20:30", "21:00" , "21:30", "22:00", "22:30", "23:00"];

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

function getNetworkOperatingWindow(networkName, dateValue) {
    const network = networksDB.find((item) => item.name === networkName);
    if (!network || !network.hours || /24 horas/i.test(network.hours)) return null;

    const hoursMatch = network.hours.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (!hoursMatch) return null;

    const date = new Date(`${dateValue}T12:00:00`);
    const day = date.getDay();
    const weekdayRanges = network.hours.toLowerCase();
    const isWeekday = day >= 1 && day <= 5;
    const isSaturday = day === 6;
    const isSunday = day === 0;
    if (isSunday && !weekdayRanges.includes("todos os dias")) return { closed: true };
    if (isSaturday && weekdayRanges.includes("seg-sex")) return { closed: true };
    if (isWeekday && weekdayRanges.includes("seg-sab") === false && weekdayRanges.includes("seg-sex") === false && !weekdayRanges.includes("todos os dias")) return { closed: true };

    return {
        opening: getTimeInMinutes(hoursMatch[1]),
        closing: getTimeInMinutes(hoursMatch[2]),
    };
}

function getSelectedScheduleNetwork(type) {
    return document.getElementById(type === "appointment" ? "apt-network" : "exam-network")?.value || "";
}

function getAvailableTimeSlots(dateValue, slots, networkName = "") {
    const networkWindow = getNetworkOperatingWindow(networkName, dateValue);
    if (networkWindow?.closed) return [];
    const openingTime = networkWindow?.opening ?? getTimeInMinutes("08:00");
    const closingTime = networkWindow?.closing ?? getTimeInMinutes(clinicClosingTime);
    const filteredByBusinessHours = slots.filter((slot) => {
        const minutes = getTimeInMinutes(slot);
        return minutes >= openingTime && minutes <= closingTime;
    });

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

    const filtered = getAvailableTimeSlots(dateInput.value, appointmentTimeSlots, getSelectedScheduleNetwork("appointment"));
    timeSelect.innerHTML = filtered.length
        ? `<option value="">Horário</option>${filtered.map((slot) => `<option value="${slot}">${slot}</option>`).join("")}`
        : `<option value="">Nenhum horário disponível</option>`;
}

function updateExamTimeOptions() {
    const dateInput = document.getElementById("exam-date");
    const timeSelect = document.getElementById("exam-time");
    if (!dateInput || !timeSelect) return;

    const filtered = getAvailableTimeSlots(dateInput.value, examTimeSlots, getSelectedScheduleNetwork("exam"));
    timeSelect.innerHTML = filtered.length
        ? `<option value="">Horário</option>${filtered.map((slot) => `<option value="${slot}">${slot}</option>`).join("")}`
        : `<option value="">Nenhum horário disponível</option>`;
}


// ==================== 7. AGENDAMENTO DE CONSULTAS ====================
// Esta seção valida o plano e o horário, salva a consulta e atualiza os cartões do painel.
function openAppointmentModal() {
    if (!requirePlanAccess("Consultas")) return;
    if (isPlanLimitReachedForAction("appointment")) return;
    if (!canScheduleWithCurrentPlan()) return;
    populateBeneficiaryFields();
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

document.getElementById("apt-type")?.addEventListener("change", function () {
    const container = document.getElementById("apt-network-container");
    const select = document.getElementById("apt-network");
    const showNetwork = this.value === "Presencial";
    container?.classList.toggle("hidden", !showNetwork);
    if (select) select.required = showNetwork;
});

document.getElementById("apt-date").addEventListener("change", updateAppointmentTimeOptions);
document.getElementById("exam-date").addEventListener("change", updateExamTimeOptions);
document.getElementById("apt-network")?.addEventListener("change", updateAppointmentTimeOptions);
document.getElementById("exam-network")?.addEventListener("change", updateExamTimeOptions);

function validateScheduleDateAndTime(date, time, networkName, label) {
    const today = getLocalDateString();
    if (!date || !time) {
        showToast(`Selecione uma data e um horário válidos para ${label}.`, "error");
        return false;
    }
    if (date < today) {
        showToast(`A data de ${label} deve ser hoje ou posterior.`, "error");
        return false;
    }

    const selectedMinutes = getTimeInMinutes(time);
    const now = new Date();
    if (date === today && selectedMinutes <= now.getHours() * 60 + now.getMinutes()) {
        showToast(`Escolha um horário futuro para ${label}.`, "error");
        return false;
    }

    const networkWindow = getNetworkOperatingWindow(networkName, date);
    if (networkWindow?.closed) {
        showToast("A rede selecionada não funciona nessa data.", "error");
        return false;
    }
    if (networkWindow && (selectedMinutes < networkWindow.opening || selectedMinutes > networkWindow.closing)) {
        showToast(`Escolha um horário dentro do funcionamento da rede: ${networkWindow.opening === networkWindow.closing ? "24 horas" : `${String(Math.floor(networkWindow.opening / 60)).padStart(2, "0")}:${String(networkWindow.opening % 60).padStart(2, "0")} às ${String(Math.floor(networkWindow.closing / 60)).padStart(2, "0")}:${String(networkWindow.closing % 60).padStart(2, "0")}`}.`, "error");
        return false;
    }
    return true;
}

document.getElementById("appointment-form").addEventListener("submit", function (e) {
    e.preventDefault();

    if (!canScheduleWithCurrentPlan()) return;

    const beneficiaryId = document.getElementById("apt-beneficiary").value;
    const beneficiaryInfo = getSelectedBeneficiaryInfo(beneficiaryId);
    if (!beneficiaryInfo) {
        showToast("Selecione o beneficiário da consulta.", "error");
        return;
    }

    const date = document.getElementById("apt-date").value;
    const time = document.getElementById("apt-time").value;
    const selectedNetwork = document.getElementById("apt-network")?.value || "";
    if (!validateScheduleDateAndTime(date, time, selectedNetwork, "a consulta")) return;

    const user = DataService.getCurrentUser();
    const novaConsulta = {
        id: "APT" + Date.now(),
        userId: user.id,
        beneficiaryId,
        beneficiaryName: beneficiaryInfo.name,
        specialty: document.getElementById("apt-specialty").value,
        doctor: document.getElementById("apt-doctor").value,
        crm: getDoctorCrm({ doctor: document.getElementById("apt-doctor").value }).value,
        date,
        time,
        type: document.getElementById("apt-type").value,
        network: selectedNetwork,
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
    updateScheduleActionButtons();
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
    const doctor = messages.dataset.doctor || "Médico";
    const text = input.value.trim();
    if (!text) return;
    const history = DataService.getConversationHistory(doctor);
    const nextHistory = [...history, { sender: "user", text }, { sender: "doctor", text: "Mensagem recebida. O médico responderá assim que estiver disponível." }];
    DataService.saveConversationHistory(doctor, nextHistory);
    messages.innerHTML = nextHistory.map((msg) => `
        <div class="${msg.sender === "user" ? "text-right" : ""}">
            <p class="${msg.sender === "user" ? "bg-brand-50 text-gray-700 rounded-xl p-3 text-sm inline-block max-w-[80%]" : "bg-gray-100 text-gray-700 rounded-xl p-3 text-sm inline-block max-w-[80%]"}">${escapeHtml(msg.text)}</p>
        </div>
    `).join("");
    input.value = "";
    messages.scrollTop = messages.scrollHeight;
});

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
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
    if (question.includes("carteirinha") || question.includes("cartao")) return "Na aba Carteirinha você pode consultar seus dados digitais e solicitar uma versão física para entrega.";
    if (question.includes("perfil") || question.includes("endereco")) return "Na aba Meu perfil, você pode atualizar seus dados e o endereço. A rede próxima usa esse endereço para calcular as distâncias."
    return "Ainda não encontrei essa dúvida nas perguntas programadas. Posso ajudar com planos, consultas, exames, teleconsultas, rede próxima, contatos ou dependentes.";
}

function openSupportInterface() {
    selectAssistantMode("human");
}

function closeSupportInterface() {
    selectAssistantMode("bot");
}

function showAssistantMoreOptions() {
    const messages = document.getElementById("assistant-messages");
    const oldOptions = messages.querySelector(".assistant-more-options");
    if (oldOptions) oldOptions.remove();
    messages.insertAdjacentHTML("beforeend", `<p class="bg-brand-50 text-gray-700 rounded-xl p-3 text-sm">Claro! Sobre qual área você precisa de ajuda?</p><div class="assistant-suggestions assistant-more-options"><button type="button" class="assistant-suggestion" onclick="sendAssistantQuestion('Quais planos estão disponíveis?')">Planos</button><button type="button" class="assistant-suggestion" onclick="sendAssistantQuestion('Como encontro uma rede próxima?')">Rede próxima</button><button type="button" class="assistant-suggestion" onclick="sendAssistantQuestion('Como cadastro um dependente?')">Dependentes</button><button type="button" class="assistant-suggestion" onclick="sendAssistantQuestion('Como acesso minha carteirinha?')">Carteirinha</button><button type="button" class="assistant-suggestion" onclick="sendAssistantQuestion('Como atualizo meu perfil?')">Meu perfil</button></div>`);
    messages.scrollTop = messages.scrollHeight;
}

function sendAssistantQuestion(text) {
    const messages = document.getElementById("assistant-messages");
    if (!text) return;
    if (text === "__OUTRAS_OPCOES__") {
        showAssistantMoreOptions();
        return;
    }
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
        if (this.dataset.assistantAction === "more") {
            showAssistantMoreOptions();
            return;
        }
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

document.querySelectorAll("#reg-phone, #profile-phone").forEach((input) => input.addEventListener("input", function () {
    const digits = this.value.replace(/\D/g, "").slice(0, 11);
    this.value = digits.length > 10 ? digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3") : digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
}));

document.getElementById("reg-cpf")?.addEventListener("input", function () {
    this.value = formatCpf(this.value);
});

document.getElementById("profile-cpf")?.addEventListener("input", function () {
    this.value = formatCpf(this.value);
});

document.getElementById("dependent-cpf").addEventListener("input", function () {
    this.value = formatCpf(this.value);
});

document.getElementById("dependent-responsible-cpf").addEventListener("input", function () {
    this.value = formatCpf(this.value);
});


// ==================== 8. AGENDAMENTO DE EXAMES ====================
// Além de marcar o horário, esta seção mostra orientações de preparo associadas ao tipo de exame.
const examInstructions = {
    "Hemograma Completo": "Jejum não obrigatório. Evite esforço físico intenso antes da coleta e confirme a orientação do laboratório.",
    "Glicemia": "Necessário jejum de 8 horas, salvo orientação médica diferente. Água está liberada.",
    "Colesterol Total": "Preferencialmente jejum de 8 a 12 horas quando solicitado junto ao perfil lipídico.",
    "Eletrocardiograma": "Não exige jejum. Evite cremes ou óleos no peito e use roupas confortáveis.",
    "Raio-X": "Não exige jejum. Retire objetos metálicos e informe ao serviço qualquer possibilidade de gravidez.",
    "Ultrassonografia": "O preparo depende da região. Para abdômen, faça jejum de 6 a 8 horas e beba água conforme orientação.",
    "Ressonância Magnética": "Informe implantes, marca-passo, metais no corpo e possibilidade de gravidez. Pode exigir jejum se houver contraste.",
    "Tomografia": "Pode exigir jejum de 4 horas quando houver contraste. Informe alergias, diabetes e problemas renais.",
    "Exame de Urina": "Higienize a região e colete a primeira urina da manhã em frasco apropriado, salvo orientação diferente.",
    "Ecocardiograma": "Não exige jejum. Use roupa confortável e leve exames cardiológicos anteriores, se disponíveis.",
    "Exame de Sangue": "O preparo varia conforme os marcadores solicitados; confirme se é necessário jejum de 8 a 12 horas.",
    "Exame de Tireoide": "Geralmente não exige jejum. Informe medicamentos em uso, especialmente hormônios da tireoide.",
    "Exame de Colesterol e Triglicerídeos": "Jejum de 8 a 12 horas pode ser solicitado. Evite álcool e refeições muito gordurosas no dia anterior.",
};

function updateExamInstructions() {
    const examType = document.getElementById("exam-type").value;
    const notes = document.getElementById("exam-notes");
    const status = document.getElementById("exam-notes-status");
    const instruction = examInstructions[examType] || "";
    notes.value = instruction;
    status.textContent = instruction ? "Orientação informativa. Confirme o preparo específico com o laboratório ou serviço de diagnóstico." : "Selecione um exame para ver a orientação de preparo.";
}

function openExamModal() {
    if (!requirePlanAccess("Exames")) return;
    if (isPlanLimitReachedForAction("exam")) return;
    if (!canScheduleWithCurrentPlan()) return;
    populateBeneficiaryFields();
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

    const beneficiaryId = document.getElementById("exam-beneficiary").value;
    const beneficiaryInfo = getSelectedBeneficiaryInfo(beneficiaryId);
    if (!beneficiaryInfo) {
        showToast("Selecione o beneficiário do exame.", "error");
        return;
    }

    const date = document.getElementById("exam-date").value;
    const time = document.getElementById("exam-time").value;
    const selectedNetwork = document.getElementById("exam-network")?.value || "";
    if (!validateScheduleDateAndTime(date, time, selectedNetwork, "o exame")) return;

    const user = DataService.getCurrentUser();
    const novoExame = {
        id: "EXM" + Date.now(),
        userId: user.id,
        beneficiaryId,
        beneficiaryName: beneficiaryInfo.name,
        examType: document.getElementById("exam-type").value,
        date,
        time,
        network: selectedNetwork,
        notes: document.getElementById("exam-notes").value,
    };

    const todosExames = DataService.getExams();
    todosExames.push(novoExame);
    DataService.saveExams(todosExames);

    closeModal("modal-exam");
    this.reset();

    renderDashboard();
    updateScheduleActionButtons();
    showToast("Exame agendado!", "success");
});


// ==================== 9. CANCELAMENTO (MODAL DE CONFIRMAÇÃO) ====================
// O alvo fica guardado até a confirmação explícita, evitando excluir dados ao clicar acidentalmente em cancelar.
let deleteTarget = null;
let favoriteReplacementTarget = "";

/** Abre o modal de confirmação, guardando o que será excluído ao confirmar. */
function confirmDelete(type, id, index) {
    deleteTarget = { type, id, index };
    favoriteReplacementTarget = "";
    const isPhysicalCard = type === "physical-card";
    document.getElementById("confirm-title").textContent = isPhysicalCard ? "Cancelar solicitação?" : type === "dependent" ? "Excluir dependente?" : "Cancelar agendamento?";
    document.getElementById("confirm-description").textContent = isPhysicalCard ? "Tem certeza que deseja cancelar a solicitação da carteirinha física?" : type === "dependent" ? "Esta pessoa será removida da sua lista de dependentes." : "Esta ação não pode ser desfeita.";
    document.getElementById("confirm-action").textContent = isPhysicalCard ? "Confirmar cancelamento" : type === "dependent" ? "Excluir" : "Confirmar";
    document.getElementById("confirm-cancel-btn").textContent = "Voltar";
    document.getElementById("modal-confirm").classList.remove("hidden");
}

function cancelConfirmAction() {
    deleteTarget = null;
    favoriteReplacementTarget = "";
    closeModal("modal-confirm");
}

document.getElementById("confirm-delete-btn").addEventListener("click", function () {
    if (favoriteReplacementTarget) {
        setFavoriteNetwork(favoriteReplacementTarget);
        return;
    }
    if (!deleteTarget) return;
    const deletedType = deleteTarget.type;

    if (deleteTarget.type === "appointment") {
        const restantes = DataService.getAppointments().filter((a) => a.id !== deleteTarget.id);
        DataService.saveAppointments(restantes);
    } else if (deleteTarget.type === "exam") {
        const restantes = DataService.getExams().filter((e) => e.id !== deleteTarget.id);
        DataService.saveExams(restantes);
    } else if (deleteTarget.type === "physical-card") {
        DataService.clearPhysicalCardRequestFor(deleteTarget.id || "titular");
        deleteTarget = null;
        closeModal("modal-confirm");
        renderPhysicalCardStatus();
        renderDependents();
        renderDependentPhysicalCards();
        showToast("Solicitação cancelada", "success");
        return;
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
// Controla o estado da chamada, mídia local e tentativa de reconexão durante uma teleconsulta de demonstração.
let teleTimer = null;
let teleReconnectTimer = null;
let teleSeconds = 0;
let activeTeleconsultaId = null;
let teleMediaStream = null;
let teleMicrophoneEnabled = true;
let teleCameraEnabled = true;

function resetTeleconsultaMediaUi() {
    const preparation = document.getElementById("tele-preparation");
    const callView = document.getElementById("tele-call-view");
    const message = document.getElementById("tele-media-message");
    const retry = document.getElementById("tele-retry");
    const cameraOff = document.getElementById("tele-camera-off");
    preparation?.classList.remove("hidden");
    callView?.classList.add("hidden");
    message?.classList.add("hidden");
    retry?.classList.add("hidden");
    cameraOff?.classList.add("hidden");
    teleMicrophoneEnabled = true;
    teleCameraEnabled = true;
    updateTeleconsultaControlButtons();
}

function updateTeleconsultaPreparationInfo(appointment) {
    const info = document.getElementById("tele-preparation-info");
    if (!info || !appointment) return;
    info.innerHTML = `<strong>${escapeHtml(DataService.getCurrentUser()?.nome || appointment.beneficiaryName || "Usuário")}</strong><br>${escapeHtml(appointment.doctor || "Profissional") }<br>${escapeHtml(appointment.specialty || "Especialidade")}<br>${appointment.date ? formatDate(appointment.date) : ""} às ${escapeHtml(appointment.time || "")}`;
}

function beginTeleconsultaSession(appointment) {
    document.getElementById("tele-specialty").value = appointment.specialty || "";
    document.getElementById("tele-doctor-name").textContent = appointment.doctor || "Dr(a). Médico";
    document.getElementById("tele-doctor-spec").textContent = appointment.specialty || "Especialidade";
    updateTeleconsultaPreparationInfo(appointment);
    resetTeleconsultaMediaUi();
    showPage("page-teleconsulta");
    startTeleconsultaTimer();
    requestTeleconsultaMedia();
}

function startTeleconsultaTimer() {
    if (teleTimer) clearInterval(teleTimer);
    teleSeconds = 0;
    document.getElementById("tele-timer").textContent = "00:00";
    teleTimer = setInterval(() => {
        teleSeconds++;
        const minutos = String(Math.floor(teleSeconds / 60)).padStart(2, "0");
        const segundos = String(teleSeconds % 60).padStart(2, "0");
        document.getElementById("tele-timer").textContent = `${minutos}:${segundos}`;
    }, 1000);
}

function updateTeleconsultaControlButtons() {
    const micButton = document.getElementById("btn-mic");
    const camButton = document.getElementById("btn-cam");
    if (!micButton || !camButton) return;
    micButton.classList.toggle("is-muted", !teleMicrophoneEnabled);
    camButton.classList.toggle("is-camera-off", !teleCameraEnabled);
    micButton.setAttribute("aria-label", teleMicrophoneEnabled ? "Desligar microfone" : "Ligar microfone");
    micButton.title = teleMicrophoneEnabled ? "Desligar microfone" : "Ligar microfone";
    camButton.setAttribute("aria-label", teleCameraEnabled ? "Desligar câmera" : "Ligar câmera");
    camButton.title = teleCameraEnabled ? "Desligar câmera" : "Ligar câmera";
    micButton.innerHTML = `<i data-lucide="${teleMicrophoneEnabled ? "mic" : "mic-off"}" class="w-5 h-5 text-white"></i>`;
    camButton.innerHTML = `<i data-lucide="${teleCameraEnabled ? "camera" : "video-off"}" class="w-5 h-5 text-white"></i>`;
    const micStatus = document.getElementById("tele-mic-status");
    if (micStatus) {
        micStatus.innerHTML = `<i data-lucide="${teleMicrophoneEnabled ? "mic" : "mic-off"}" class="w-4 h-4"></i> ${teleMicrophoneEnabled ? "Microfone ativo" : "Microfone desligado"}`;
        micStatus.classList.toggle("is-muted", !teleMicrophoneEnabled);
    }
    lucide.createIcons();
}

function showTeleconsultaMediaError(message) {
    const preparation = document.getElementById("tele-preparation");
    const mediaMessage = document.getElementById("tele-media-message");
    const retry = document.getElementById("tele-retry");
    preparation?.classList.remove("hidden");
    document.getElementById("tele-call-view")?.classList.add("hidden");
    if (mediaMessage) {
        mediaMessage.textContent = message;
        mediaMessage.classList.remove("hidden");
    }
    retry?.classList.remove("hidden");
}

function showTeleconsultaDemoWithoutCamera(message) {
    const mediaMessage = document.getElementById("tele-media-message");
    const video = document.getElementById("tele-local-video");
    document.getElementById("tele-preparation")?.classList.add("hidden");
    document.getElementById("tele-call-view")?.classList.remove("hidden");
    document.getElementById("tele-camera-off")?.classList.remove("hidden");
    if (video) video.srcObject = null;
    teleCameraEnabled = false;
    if (mediaMessage) {
        mediaMessage.textContent = message;
        mediaMessage.classList.remove("hidden");
    }
    updateTeleconsultaControlButtons();
    showToast(message, "error");
}

async function requestTeleconsultaMedia() {
    const mediaMessage = document.getElementById("tele-media-message");
    const retry = document.getElementById("tele-retry");
    mediaMessage?.classList.add("hidden");
    retry?.classList.add("hidden");
    if (!navigator.mediaDevices?.getUserMedia) {
        showTeleconsultaMediaError("Não foi possível acessar sua câmera ou microfone. Verifique as permissões do navegador para continuar.");
        return;
    }
    stopTeleconsultaMedia();
    try {
        teleMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const video = document.getElementById("tele-local-video");
        video.srcObject = teleMediaStream;
        document.getElementById("tele-preparation")?.classList.add("hidden");
        document.getElementById("tele-call-view")?.classList.remove("hidden");
        updateTeleconsultaControlButtons();
    } catch (error) {
        if (error?.name === "NotFoundError") {
            showTeleconsultaDemoWithoutCamera("Câmera não disponível. Você pode continuar utilizando a demonstração.");
            return;
        }
        showTeleconsultaMediaError("Não foi possível acessar sua câmera ou microfone. Verifique as permissões do navegador para continuar.");
    }
}

function stopTeleconsultaMedia() {
    if (teleMediaStream) {
        teleMediaStream.getTracks().forEach((track) => track.stop());
        teleMediaStream = null;
    }
    const video = document.getElementById("tele-local-video");
    if (video) video.srcObject = null;
}

function toggleTeleconsultaMicrophone() {
    teleMicrophoneEnabled = !teleMicrophoneEnabled;
    teleMediaStream?.getAudioTracks().forEach((track) => { track.enabled = teleMicrophoneEnabled; });
    updateTeleconsultaControlButtons();
}

function toggleTeleconsultaCamera() {
    teleCameraEnabled = !teleCameraEnabled;
    teleMediaStream?.getVideoTracks().forEach((track) => { track.enabled = teleCameraEnabled; });
    document.getElementById("tele-camera-off")?.classList.toggle("hidden", teleCameraEnabled);
    updateTeleconsultaControlButtons();
}

function startTeleconsulta() {
    if (!requirePlanAccess("Teleconsulta")) return;
    if (isPlanLimitReachedForAction("teleconsulta")) return;
    if (!canScheduleWithCurrentPlan()) return;

    const beneficiaryId = document.getElementById("tele-beneficiary").value;
    const beneficiaryInfo = getSelectedBeneficiaryInfo(beneficiaryId);
    if (!beneficiaryInfo) {
        showToast("Selecione para quem é a teleconsulta.", "error");
        return;
    }

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
        beneficiaryId,
        beneficiaryName: beneficiaryInfo.name,
        specialty: especialidade,
        doctor: medicoSorteado,
        date: new Date().toISOString().slice(0, 10),
        time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        type: "Teleconsulta",
    };
    consultas.push(novaTeleconsulta);
    DataService.saveAppointments(consultas);

    activeTeleconsultaId = novaTeleconsulta.id;
    beginTeleconsultaSession(novaTeleconsulta);

    DataService.saveTelecount(DataService.getTelecount() + 1);
    updateScheduleActionButtons();
}

function endTeleconsulta() {
    if (activeTeleconsultaId) {
        markTeleconsultaReconnectAvailable(activeTeleconsultaId);
    }
    if (teleTimer) {
        clearInterval(teleTimer);
        teleTimer = null;
    }
    stopTeleconsultaMedia();
    activeTeleconsultaId = null;
    showPage("page-dashboard");
    showToast("Chamada encerrada. Você tem 1 minuto para retornar.", "success");
}

document.getElementById("btn-mic").addEventListener("click", toggleTeleconsultaMicrophone);
document.getElementById("btn-cam").addEventListener("click", toggleTeleconsultaCamera);


// ==================== 11. UTILIDADES ====================
// Funções compartilhadas por diferentes telas, como fechamento de modal, formatação de datas e notificações.
function closeModal(id) {
    document.getElementById(id)?.classList.add("hidden");
}

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((modal) => modal.classList.add("hidden"));
});

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
// Prepara a interface depois que o HTML existe: registra eventos iniciais e restaura a sessão quando aplicável.
(async function init() {
    setupProfileUi();
    renderConvenioDetails();
    populateBeneficiaryFields();
    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === "PASSWORD_RECOVERY" && session) {
                document.getElementById("login-form").classList.add("hidden");
                document.getElementById("password-recovery-form").classList.add("hidden");
                document.getElementById("password-token-form").classList.remove("hidden");
                document.getElementById("recovery-email").value = session.user.email || "";
                showPage("page-login");
            }
        });
    }

    let user = null;
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.auth.getSession();
            if (error) throw error;
            if (data.session?.user) user = await loadAuthenticatedUser(data.session.user);
        } catch (error) {
            console.error(error);
            showToast(error.message || "Não foi possível restaurar a sessão.", "error");
        }
    }

    const cachedUser = DataService.getCurrentUser();
    if (!user && cachedUser?.modoDemo) user = cachedUser;
    else if (!user) DataService.clearCurrentUser();
    showPage(user ? "page-dashboard" : "page-landing");
    lucide.createIcons();

    // Impede escolher datas retroativas nos formulários de agendamento
    const hoje = getLocalDateString();
    document.getElementById("apt-date").setAttribute("min", hoje);
    document.getElementById("exam-date").setAttribute("min", hoje);
})();


// ==================== ELEMENT SDK (integração com o editor visual) ====================
// Configuração opcional para o editor visual personalizar textos e cores sem alterar o fluxo principal do app.
const defaultConfig = {
    site_title: "Saúde Plus",
    background_color: "#f9fafb",
    surface_color: "#ffffff",
    text_color: "#111827",
    primary_color: "#1570f5",
    accent_color: "#0aab48",
};

window.elementSdk?.init({
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

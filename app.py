"""
Backend da plataforma Saúde Plus.

Expõe uma API em Flask para cadastro, login e recuperação de senha
usando o Supabase como banco de dados.
"""

import os
import secrets
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client


def carregar_dotenv(path=".env"):
    """Lê um arquivo .env simples sem depender de biblioteca extra."""
    arquivo = os.path.join(os.path.dirname(__file__), path)
    if not os.path.exists(arquivo):
        return

    with open(arquivo, "r", encoding="utf-8") as handle:
        for linha in handle:
            linha = linha.strip()
            if not linha or linha.startswith("#") or "=" not in linha:
                continue
            chave, valor = linha.split("=", 1)
            os.environ.setdefault(chave.strip(), valor.strip().strip('"\''))


carregar_dotenv()

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Configuração do Supabase
# ---------------------------------------------------------------------------
# Preencha as variáveis no arquivo .env com:
# SUPABASE_URL=https://SEU_PROJETO.supabase.co
# SUPABASE_KEY=sua_chave_anon_ou_service_role
#
# Se estiver usando a chave de service role, o backend pode criar/consultar
# dados diretamente. Em produção, o ideal é usar autenticação e políticas de RLS.
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = (
    os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(
        "Variáveis de ambiente ausentes. Defina SUPABASE_URL e SUPABASE_KEY no arquivo .env "
        "na raiz do projeto. Exemplo: SUPABASE_URL=https://...supabase.co e SUPABASE_KEY=sua_chave"
    )

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
RECOVERY_TOKENS = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def montar_payload_usuario(dados):
    """Cria o payload do usuário respeitando os campos que o app usa."""
    payload = {
        "nome": dados.get("nome"),
        "email": dados.get("email"),
        "telefone": dados.get("telefone"),
        "endereco": dados.get("endereco"),
        "senha": dados.get("senha"),
    }

    if "plano" in dados and dados.get("plano"):
        payload["plano"] = dados.get("plano")

    return payload


def normalizar_usuario(usuario):
    """Garante que campos esperados pelo front-end existam."""
    if not usuario:
        return None

    if "plano" not in usuario:
        usuario["plano"] = "Nenhum plano contratado"

    return usuario


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------
@app.route("/")
def home():
    return "Backend conectado ao Supabase!"


@app.route("/cadastro", methods=["POST"])
def cadastro():
    """Cadastra um novo usuário na tabela `usuarios`."""
    dados = request.json or {}

    campos_obrigatorios = ["nome", "email", "telefone", "senha"]
    faltando = [campo for campo in campos_obrigatorios if not dados.get(campo)]
    if faltando:
        return jsonify({
            "mensagem": f"Campos obrigatórios ausentes: {', '.join(faltando)}"
        }), 400

    payload = montar_payload_usuario(dados)

    try:
        response = supabase.table("usuarios").insert(payload).execute()
    except Exception as erro:
        mensagem = str(erro).lower()
        if "duplicate" in mensagem or "already exists" in mensagem or "violates unique constraint" in mensagem:
            return jsonify({"mensagem": "E-mail já cadastrado"}), 409

        if "column" in mensagem and "does not exist" in mensagem:
            payload_sem_plano = {k: v for k, v in payload.items() if k != "plano"}
            try:
                supabase.table("usuarios").insert(payload_sem_plano).execute()
                return jsonify({"mensagem": "Usuário cadastrado com sucesso!"})
            except Exception as erro_2:
                return jsonify({"mensagem": f"Erro ao cadastrar usuário: {erro_2}"}), 500

        return jsonify({"mensagem": f"Erro ao cadastrar usuário: {erro}"}), 500

    if response.data is None:
        return jsonify({"mensagem": "Erro ao cadastrar usuário"}), 500

    return jsonify({"mensagem": "Usuário cadastrado com sucesso!"})


@app.route("/login", methods=["POST"])
def login():
    """Valida e-mail e senha e retorna os dados do usuário autenticado."""
    dados = request.json or {}
    email = dados.get("email")
    senha = dados.get("senha")

    if not email or not senha:
        return jsonify({
            "success": False,
            "mensagem": "E-mail e senha são obrigatórios",
        }), 400

    try:
        response = supabase.table("usuarios").select("*").eq("email", email).eq("senha", senha).limit(1).execute()
    except Exception as erro:
        return jsonify({
            "success": False,
            "mensagem": f"Erro ao consultar usuário: {erro}",
        }), 500

    usuario = (response.data or [None])[0] if response.data else None
    if usuario:
        return jsonify({"success": True, "usuario": normalizar_usuario(usuario)})

    return jsonify({"success": False, "mensagem": "E-mail ou senha incorretos"})


@app.route("/solicitar-recuperacao", methods=["POST"])
def solicitar_recuperacao():
    """Valida e-mail/telefone e cria um token temporário de recuperação."""
    dados = request.json or {}
    email = dados.get("email")
    telefone = dados.get("telefone")

    if not email and not telefone:
        return jsonify({"mensagem": "Informe um e-mail ou telefone"}), 400

    try:
        if email and telefone:
            response = supabase.table("usuarios").select("id,email").eq("email", email).eq("telefone", telefone).limit(1).execute()
        elif telefone:
            response = supabase.table("usuarios").select("id,email").eq("telefone", telefone).limit(1).execute()
        else:
            response = supabase.table("usuarios").select("id,email").eq("email", email).limit(1).execute()
    except Exception as erro:
        return jsonify({"mensagem": f"Erro ao validar recuperação: {erro}"}), 500

    usuario = (response.data or [None])[0] if response.data else None
    if not usuario:
        return jsonify({"mensagem": "E-mail e telefone não conferem"}), 404

    token = f"{secrets.randbelow(1000000):06d}"
    email_recuperacao = usuario["email"]
    RECOVERY_TOKENS[email_recuperacao] = {
        "token": token,
        "telefone": telefone,
        "expires_at": time.time() + 900,
    }

    response_json = {"mensagem": "Código de recuperação gerado", "email": email_recuperacao}
    if app.debug:
        response_json["token"] = token

    return jsonify(response_json)


@app.route("/confirmar-recuperacao", methods=["POST"])
def confirmar_recuperacao():
    """Valida token temporário e atualiza a senha do usuário."""
    dados = request.json or {}
    email = dados.get("email")
    telefone = dados.get("telefone")
    token = dados.get("token")
    senha = dados.get("senha")
    recuperacao = RECOVERY_TOKENS.get(email)

    if not email or not token or not senha or len(senha) < 6:
        return jsonify({"mensagem": "Dados incompletos para concluir a recuperação"}), 400

    if not recuperacao or recuperacao["expires_at"] < time.time() or recuperacao["token"] != token or recuperacao["telefone"] != telefone:
        return jsonify({"mensagem": "Código inválido ou expirado"}), 400

    try:
        if telefone:
            response = supabase.table("usuarios").update({"senha": senha}).eq("email", email).eq("telefone", telefone).execute()
        else:
            response = supabase.table("usuarios").update({"senha": senha}).eq("email", email).execute()
    except Exception as erro:
        return jsonify({"mensagem": f"Erro ao atualizar senha: {erro}"}), 500

    if not response.data:
        return jsonify({"mensagem": "Usuário não encontrado"}), 404

    RECOVERY_TOKENS.pop(email, None)
    return jsonify({"mensagem": "Senha atualizada com sucesso"})


if __name__ == "__main__":
    app.run(debug=True)

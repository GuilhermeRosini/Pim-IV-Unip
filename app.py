"""
Backend da plataforma Saúde Plus.

Expõe uma API simples em Flask para cadastro e login de usuários,
usando MySQL como banco de dados.
"""

import os
import secrets
import time
import mysql.connector
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# Configuração do banco de dados
# ---------------------------------------------------------------------------
# As credenciais vêm de variáveis de ambiente (com um valor padrão apenas
# para facilitar o desenvolvimento local). Isso evita deixar senha "hardcoded"
# no código-fonte, o que é uma boa prática mesmo em projetos acadêmicos.
DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "user": os.environ.get("DB_USER", "root"),
    "password": os.environ.get("DB_PASSWORD", ""),
    "database": os.environ.get("DB_NAME", "saudeplus"),
}
RECOVERY_TOKENS = {}


def get_connection():
    """
    Abre uma nova conexão com o MySQL.

    Criar uma conexão por requisição (em vez de usar uma única conexão
    global) evita erros de "MySQL server has gone away" quando o servidor
    fica muito tempo sem receber requisições.
    """
    return mysql.connector.connect(**DB_CONFIG)


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------
@app.route("/")
def home():
    return "Backend conectado ao MySQL!"


@app.route("/cadastro", methods=["POST"])
def cadastro():
    """Cadastra um novo usuário na tabela `usuarios`."""
    dados = request.json or {}

    campos_obrigatorios = ["nome", "email", "telefone", "plano", "senha"]
    faltando = [campo for campo in campos_obrigatorios if not dados.get(campo)]
    if faltando:
        return jsonify({
            "mensagem": f"Campos obrigatórios ausentes: {', '.join(faltando)}"
        }), 400

    sql = """
        INSERT INTO usuarios (nome, email, telefone, plano, senha)
        VALUES (%s, %s, %s, %s, %s)
    """
    valores = (
        dados["nome"],
        dados["email"],
        dados["telefone"],
        dados["plano"],
        dados["senha"],
    )

    try:
        conexao = get_connection()
        with conexao.cursor() as cursor:
            cursor.execute(sql, valores)
            conexao.commit()
    except mysql.connector.IntegrityError:
        # Ex.: e-mail já cadastrado (caso exista UNIQUE na coluna email)
        return jsonify({"mensagem": "E-mail já cadastrado"}), 409
    except mysql.connector.Error as erro:
        return jsonify({"mensagem": f"Erro ao cadastrar usuário: {erro}"}), 500
    finally:
        if "conexao" in locals() and conexao.is_connected():
            conexao.close()

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

    sql = "SELECT * FROM usuarios WHERE email = %s AND senha = %s"

    try:
        conexao = get_connection()
        with conexao.cursor(dictionary=True) as cursor:
            cursor.execute(sql, (email, senha))
            usuario = cursor.fetchone()
    except mysql.connector.Error as erro:
        return jsonify({
            "success": False,
            "mensagem": f"Erro ao consultar usuário: {erro}",
        }), 500
    finally:
        if "conexao" in locals() and conexao.is_connected():
            conexao.close()

    if usuario:
        return jsonify({"success": True, "usuario": usuario})

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
        conexao = get_connection()
        with conexao.cursor(dictionary=True) as cursor:
            if email and telefone:
                cursor.execute("SELECT id, email FROM usuarios WHERE email = %s AND telefone = %s", (email, telefone))
            elif telefone:
                cursor.execute("SELECT id, email FROM usuarios WHERE telefone = %s", (telefone,))
            else:
                cursor.execute("SELECT id, email FROM usuarios WHERE email = %s", (email,))
            usuario = cursor.fetchone()
            if not usuario:
                return jsonify({"mensagem": "E-mail e telefone não conferem"}), 404
    except mysql.connector.Error as erro:
        return jsonify({"mensagem": f"Erro ao validar recuperação: {erro}"}), 500
    finally:
        if "conexao" in locals() and conexao.is_connected():
            conexao.close()

    token = f"{secrets.randbelow(1000000):06d}"
    email = usuario["email"]
    RECOVERY_TOKENS[email] = {"token": token, "telefone": telefone, "expires_at": time.time() + 900}
    response = {"mensagem": "Código de recuperação gerado"}
    response["email"] = email
    if app.debug:
        response["token"] = token
    return jsonify(response)


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
        conexao = get_connection()
        with conexao.cursor() as cursor:
            if telefone:
                cursor.execute("UPDATE usuarios SET senha = %s WHERE email = %s AND telefone = %s", (senha, email, telefone))
            else:
                cursor.execute("UPDATE usuarios SET senha = %s WHERE email = %s", (senha, email))
            if cursor.rowcount == 0:
                return jsonify({"mensagem": "Usuário não encontrado"}), 404
            conexao.commit()
    except mysql.connector.Error as erro:
        return jsonify({"mensagem": f"Erro ao atualizar senha: {erro}"}), 500
    finally:
        if "conexao" in locals() and conexao.is_connected():
            conexao.close()

    RECOVERY_TOKENS.pop(email, None)
    return jsonify({"mensagem": "Senha atualizada com sucesso"})


if __name__ == "__main__":
    app.run(debug=True)

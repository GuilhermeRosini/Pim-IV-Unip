"""API Flask desativada: cadastro, login e recuperação agora usam Supabase Auth no navegador."""

from flask import Flask
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


@app.route("/")
def home():
    # Mantém uma resposta simples para quem ainda inicia o servidor Flask antigo.
    return "A autenticação do Saúde Plus é feita diretamente pelo Supabase Auth."


if __name__ == "__main__":
    app.run(debug=True)

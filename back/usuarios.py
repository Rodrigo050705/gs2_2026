"""Gerencia os usuários do painel (login). Roda onde a API roda, no mesmo banco.

    python usuarios.py listar
    python usuarios.py criar <usuario> [--nome "Nome"]     # pede a senha
    python usuarios.py senha <usuario>                       # troca a senha e derruba as sessões
    python usuarios.py desativar <usuario>                   # bloqueia o acesso e derruba as sessões
    python usuarios.py ativar <usuario>

No servidor (stack agrosmart-prod):

    docker exec -it agrosmart-prod-api-1 python usuarios.py criar maria
"""

import argparse
import getpass
import sys

import main
from main import SessaoDB, SessionLocal, UsuarioDB


def pedir_senha() -> str:
    senha = getpass.getpass("Senha: ")
    if senha != getpass.getpass("Repita a senha: "):
        sys.exit("As senhas não conferem.")
    return senha


def buscar(db, usuario: str) -> UsuarioDB:
    u = db.query(UsuarioDB).filter(UsuarioDB.usuario == usuario.strip().lower()).first()
    if not u:
        sys.exit(f"Usuário '{usuario}' não encontrado.")
    return u


def derrubar_sessoes(db, u: UsuarioDB):
    db.query(SessaoDB).filter(SessaoDB.usuario_id == u.id).delete()


def principal():
    parser = argparse.ArgumentParser(description="Usuários do AgroSmart")
    sub = parser.add_subparsers(dest="comando", required=True)
    sub.add_parser("listar")
    criar = sub.add_parser("criar")
    criar.add_argument("usuario")
    criar.add_argument("--nome")
    for nome in ("senha", "desativar", "ativar"):
        sub.add_parser(nome).add_argument("usuario")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.comando == "listar":
            for u in db.query(UsuarioDB).order_by(UsuarioDB.usuario):
                print(f"{u.usuario:20} {'ativo' if u.ativo else 'DESATIVADO':10} {u.nome or ''}")
        elif args.comando == "criar":
            try:
                main.criar_usuario(db, args.usuario, pedir_senha(), nome=args.nome)
            except ValueError as e:
                sys.exit(str(e))
            print(f"Usuário '{args.usuario.strip().lower()}' criado.")
        elif args.comando == "senha":
            u = buscar(db, args.usuario)
            senha = pedir_senha()
            if len(senha) < main.SENHA_MIN:
                sys.exit(f"A senha precisa ter pelo menos {main.SENHA_MIN} caracteres.")
            u.senha_hash = main.gerar_hash_senha(senha)
            derrubar_sessoes(db, u)
            db.commit()
            print("Senha trocada; as sessões abertas foram encerradas.")
        else:
            u = buscar(db, args.usuario)
            u.ativo = args.comando == "ativar"
            if not u.ativo:
                derrubar_sessoes(db, u)
            db.commit()
            print(f"Usuário '{u.usuario}' {'ativado' if u.ativo else 'desativado'}.")
    finally:
        db.close()


if __name__ == "__main__":
    principal()

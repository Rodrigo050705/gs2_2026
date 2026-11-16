from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, inspect, text

import main


class _IAFalsa:
    def __init__(self):
        self.instrucoes = []
        self.models = self

    def generate_content(self, model, contents, config):
        self.instrucoes.append(config.system_instruction)
        return SimpleNamespace(text="ok")


@pytest.fixture()
def ia(monkeypatch):
    falsa = _IAFalsa()
    monkeypatch.setattr(main, "get_gemini_client", lambda: falsa)
    db = main.SessionLocal()
    db.query(main.ChatInteracaoDB).delete()
    db.commit()
    db.close()
    return falsa


def test_tela_vai_para_a_ia_e_fica_registrada(cliente, ia):
    resp = cliente.post("/api/v1/chat", json={"mensagem": "O que isso significa?", "tela": "vendas"})
    assert resp.status_code == 200
    assert "TELA ATUAL" in ia.instrucoes[0] and "Vendas: registro de vendas" in ia.instrucoes[0]

    [registro] = cliente.get("/api/v1/chat/interacoes").json()
    assert registro["tela"] == "vendas"


def test_sem_tela_nao_acrescenta_instrucao(cliente, ia):
    assert cliente.post("/api/v1/chat", json={"mensagem": "Oi"}).status_code == 200
    assert "TELA ATUAL" not in ia.instrucoes[0]


def test_tela_desconhecida_e_recusada(cliente, ia):
    assert cliente.post("/api/v1/chat", json={"mensagem": "Oi", "tela": "financeiro"}).status_code == 422
    assert ia.instrucoes == []


def test_estatisticas_por_tela(cliente, ia):
    for tela in ("clima", "clima", "vendas", None):
        cliente.post("/api/v1/chat", json={"mensagem": "?", **({"tela": tela} if tela else {})})
    por_tela = cliente.get("/api/v1/chat/estatisticas").json()["por_tela"]
    assert por_tela == [{"tela": "clima", "total": 2}, {"tela": None, "total": 1}, {"tela": "vendas", "total": 1}]


def test_migracao_acrescenta_tela_em_banco_do_pr_anterior(tmp_path, monkeypatch):
    antigo = create_engine(f"sqlite:///{(tmp_path / 'antigo.db').as_posix()}")
    with antigo.begin() as con:
        con.execute(text("CREATE TABLE alertas (id INTEGER PRIMARY KEY, cultura VARCHAR, chave VARCHAR)"))
        con.execute(text("CREATE TABLE chat_interacoes (id INTEGER PRIMARY KEY, pergunta VARCHAR)"))
    monkeypatch.setattr(main, "engine", antigo)

    main.garantir_colunas_novas()

    assert "tela" in {c["name"] for c in inspect(antigo).get_columns("chat_interacoes")}

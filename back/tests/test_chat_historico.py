from types import SimpleNamespace

import pytest

import main


class _IAFalsa:
    def __init__(self, texto="resposta", erro=None):
        self.texto, self.erro = texto, erro
        self.models = self

    def generate_content(self, model, contents, config):
        if self.erro:
            raise self.erro
        return SimpleNamespace(text=self.texto)


@pytest.fixture(autouse=True)
def sem_interacoes():
    db = main.SessionLocal()
    db.query(main.ChatInteracaoDB).delete()
    db.commit()
    db.close()


def _perguntar(cliente, monkeypatch, pergunta="Qual o melhor produto?", **ia):
    monkeypatch.setattr(main, "get_gemini_client", lambda: _IAFalsa(**ia))
    return cliente.post("/api/v1/chat", json={"mensagem": pergunta})


def test_pergunta_respondida_fica_registrada(cliente, monkeypatch):
    resp = _perguntar(cliente, monkeypatch, texto="Cenoura")
    assert resp.status_code == 200
    interacao_id = resp.json()["interacao_id"]

    [registro] = cliente.get("/api/v1/chat/interacoes").json()
    assert registro["id"] == interacao_id
    assert registro["pergunta"] == "Qual o melhor produto?"
    assert registro["resposta"] == "Cenoura"
    assert registro["sucesso"] is True and registro["modelo"] == main.GEMINI_MODEL
    assert registro["feedback"] is None and registro["duracao_ms"] >= 0


def test_falha_da_ia_tambem_fica_registrada(cliente, monkeypatch):
    assert _perguntar(cliente, monkeypatch, erro=TimeoutError("fora")).status_code == 503
    [registro] = cliente.get("/api/v1/chat/interacoes?avaliacao=falhas").json()
    assert registro["sucesso"] is False and "sobrecarregada" in registro["erro"]


def test_feedback_positivo_e_negativo_com_comentario(cliente, monkeypatch):
    interacao_id = _perguntar(cliente, monkeypatch).json()["interacao_id"]

    negativo = cliente.post(f"/api/v1/chat/{interacao_id}/feedback", json={"nota": -1, "comentario": "  faltou o preço  "})
    assert negativo.status_code == 200
    assert negativo.json()["feedback"] == -1 and negativo.json()["comentario"] == "faltou o preço"

    # Mudar de ideia para 👍 descarta o comentário
    positivo = cliente.post(f"/api/v1/chat/{interacao_id}/feedback", json={"nota": 1, "comentario": "ignorado"}).json()
    assert positivo["feedback"] == 1 and positivo["comentario"] is None


def test_feedback_invalido(cliente, monkeypatch):
    assert cliente.post("/api/v1/chat/999999/feedback", json={"nota": 1}).status_code == 404
    interacao_id = _perguntar(cliente, monkeypatch).json()["interacao_id"]
    assert cliente.post(f"/api/v1/chat/{interacao_id}/feedback", json={"nota": 5}).status_code == 422

    _perguntar(cliente, monkeypatch, erro=TimeoutError("fora"))
    [falha] = cliente.get("/api/v1/chat/interacoes?avaliacao=falhas").json()
    assert cliente.post(f"/api/v1/chat/{falha['id']}/feedback", json={"nota": 1}).status_code == 400


def test_filtros_e_estatisticas(cliente, monkeypatch):
    ids = [_perguntar(cliente, monkeypatch, pergunta=f"p{n}").json()["interacao_id"] for n in range(4)]
    _perguntar(cliente, monkeypatch, erro=TimeoutError("fora"))
    cliente.post(f"/api/v1/chat/{ids[0]}/feedback", json={"nota": 1})
    cliente.post(f"/api/v1/chat/{ids[1]}/feedback", json={"nota": 1})
    cliente.post(f"/api/v1/chat/{ids[2]}/feedback", json={"nota": -1})

    assert len(cliente.get("/api/v1/chat/interacoes?avaliacao=positivas").json()) == 2
    assert [i["pergunta"] for i in cliente.get("/api/v1/chat/interacoes?avaliacao=negativas").json()] == ["p2"]
    assert [i["pergunta"] for i in cliente.get("/api/v1/chat/interacoes?avaliacao=sem_avaliacao").json()] == ["p3"]

    est = cliente.get("/api/v1/chat/estatisticas").json()
    assert (est["total"], est["respondidas"], est["falhas"]) == (5, 4, 1)
    assert (est["positivas"], est["negativas"], est["avaliadas"]) == (2, 1, 3)
    assert est["satisfacao_percentual"] == 66.7
    assert len(est["perguntas_por_dia"]) == 14
    assert est["perguntas_por_dia"][-1]["total"] == 5  # todas hoje


def test_estatisticas_sem_dados(cliente):
    est = cliente.get("/api/v1/chat/estatisticas").json()
    assert est["total"] == 0 and est["satisfacao_percentual"] is None and est["tempo_medio_s"] is None

from datetime import date
from types import SimpleNamespace

import main


# --- Saúde e dados de demonstração ---------------------------------------------------------

def test_health(cliente):
    resp = cliente.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_seed_cria_produtos_produtor_e_plantios(cliente):
    assert len(cliente.get("/api/v1/produtos").json()) == 5
    assert cliente.get("/api/v1/produtores/1").json()["cidade"] == "Atibaia"
    assert len(cliente.get("/api/v1/plantios").json()) == 6


# --- Vendas ---------------------------------------------------------------------------------

def _estoque(cliente, produto_id):
    return next(p for p in cliente.get("/api/v1/produtos").json() if p["id"] == produto_id)["quantidade"]


def test_venda_da_baixa_no_estoque(cliente):
    antes = _estoque(cliente, 4)
    resp = cliente.post("/api/v1/vendas", json={"produto_id": 4, "quantidade": 10, "canal": "Feira"})
    assert resp.status_code == 201
    venda = resp.json()
    assert venda["preco_unitario"] == 3.40  # preço de venda do produto quando omitido
    assert venda["data_venda"] == date.today().isoformat()
    assert _estoque(cliente, 4) == antes - 10


def test_venda_sem_estoque_suficiente_e_recusada(cliente):
    resp = cliente.post("/api/v1/vendas", json={"produto_id": 4, "quantidade": 999999})
    assert resp.status_code == 400
    assert "Estoque insuficiente" in resp.json()["detail"]


def test_venda_com_canal_invalido_e_recusada(cliente):
    resp = cliente.post("/api/v1/vendas", json={"produto_id": 4, "quantidade": 1, "canal": "Bar"})
    assert resp.status_code == 422


def test_resumo_de_vendas(cliente):
    resumo = cliente.get("/api/v1/vendas/resumo?dias=90").json()
    assert resumo["receita_total"] > 0
    assert {p["produto"] for p in resumo["produtos"]} >= {"Tomate Carmem", "Morango Albion"}
    # Ordenado por lucro, do maior para o menor
    lucros = [p["lucro"] for p in resumo["produtos"]]
    assert lucros == sorted(lucros, reverse=True)
    # 6 meses de calendário, incluindo o atual
    meses = list(resumo["receita_mensal"])
    assert len(meses) == 6
    assert meses[-1] == date.today().strftime("%Y-%m")


# --- Plantios -------------------------------------------------------------------------------

def test_fases_dos_plantios_de_demonstracao(cliente):
    por_talhao = {p["talhao"]: p for p in cliente.get("/api/v1/plantios").json()}
    assert por_talhao["Talhão 1"]["fase"] == "Pré-colheita"   # 100 de 110 dias
    assert por_talhao["Talhão 4"]["fase"] == "Inicial"        # 25 de 100 dias
    assert por_talhao["Talhão 5"]["fase"] == "Colhido"


def test_plantio_colhido_sem_data_assume_hoje(cliente):
    novo = cliente.post(
        "/api/v1/plantios",
        json={"cultura": "Rúcula", "talhao": "Talhão 9", "data_plantio": date.today().isoformat(), "ciclo_dias": 35},
    ).json()
    assert novo["fase"] == "Inicial"

    colhido = cliente.put(f"/api/v1/plantios/{novo['id']}", json={"status": "Colhido"}).json()
    assert colhido["data_colheita_real"] == date.today().isoformat()

    assert cliente.delete(f"/api/v1/plantios/{novo['id']}").status_code == 204
    assert cliente.delete(f"/api/v1/plantios/{novo['id']}").status_code == 404


# --- Ficha técnica --------------------------------------------------------------------------

def test_chave_cultura_normaliza_nome():
    assert main.chave_cultura("Feijão Carioca") == "feijao"
    assert main.chave_cultura("  Tomate ") == "tomate"


def test_ficha_por_nome_de_produto(cliente):
    assert cliente.get("/api/v1/culturas/Feij%C3%A3o%20Carioca").json()["nome"] == "Feijão"
    assert cliente.get("/api/v1/culturas/abacaxi").status_code == 404


def test_avaliar_condicoes_compara_com_a_ficha():
    ficha = main.carregar_fichas()["tomate"]  # ideal 20–26 °C, crítico até 32 °C, solo 40–60 %
    leitura = SimpleNamespace(temperatura_ar=24.0, umidade_solo=30.0)
    from tests.conftest import PREVISAO_FALSA  # previsão com máxima de 35 °C

    alertas = main.avaliar_condicoes(ficha, leitura, PREVISAO_FALSA)
    assert any("Umidade do solo 30.0% abaixo do ideal" in a for a in alertas)
    assert any("acima do limite crítico de 32" in a for a in alertas)
    assert not any("Temperatura atual" in a for a in alertas)


# --- Chat (sem chamar o Gemini) -------------------------------------------------------------

class _ClienteIAFalso:
    def __init__(self, resposta=None, erro=None):
        self.chamadas = []
        self._resposta, self._erro = resposta, erro
        self.models = self

    def generate_content(self, model, contents, config):
        self.chamadas.append({"model": model, "config": config})
        if self._erro:
            raise self._erro
        return SimpleNamespace(text=self._resposta)


def test_chat_monta_contexto_com_os_dados_do_produtor(cliente, monkeypatch):
    falso = _ClienteIAFalso(resposta="**Cenoura**")
    monkeypatch.setattr(main, "get_gemini_client", lambda: falso)

    resp = cliente.post("/api/v1/chat", json={"mensagem": "Qual o melhor produto?"})
    assert resp.status_code == 200
    assert resp.json()["resposta"] == "**Cenoura**"
    assert isinstance(resp.json()["interacao_id"], int)

    contexto = falso.chamadas[0]["config"].system_instruction
    for chave in ("estoque_produtos", "resumo_ultimos_90_dias", "previsao_7_dias", "plantios_ativos",
                  "fichas_tecnicas_culturas", "alertas_agronomicos"):
        assert chave in contexto
    assert falso.chamadas[0]["model"] == main.GEMINI_MODEL


def test_chat_tenta_modelos_de_reserva_e_responde_amigavel(cliente, monkeypatch):
    falso = _ClienteIAFalso(erro=TimeoutError("demorou"))
    monkeypatch.setattr(main, "get_gemini_client", lambda: falso)

    resp = cliente.post("/api/v1/chat", json={"mensagem": "Oi"})
    assert resp.status_code == 503
    assert "sobrecarregada" in resp.json()["detail"]
    # principal + todos os de reserva
    assert len(falso.chamadas) == 1 + len(main.GEMINI_MODELOS_RESERVA)


def test_chat_recusa_mensagem_vazia(cliente):
    assert cliente.post("/api/v1/chat", json={"mensagem": ""}).status_code == 422

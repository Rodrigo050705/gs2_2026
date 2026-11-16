from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, inspect, text

import main

# Plantios ativos do seed: tomate (crítico > 32 °C), alface, morango e cenoura (crítico > 30 °C).
# Solo crítico = mínimo ideal da ficha - 10: tomate 30, alface 35, morango 30, cenoura 30.


@pytest.fixture(autouse=True)
def sem_alertas():
    db = main.SessionLocal()
    db.query(main.AlertaDB).delete()
    db.commit()
    db.close()


def _leitura(cliente, temperatura, solo):
    resp = cliente.post(
        "/api/v1/telemetria",
        json={
            "produtor_id": 1,
            "sensor_id": "teste",
            "temperatura_ar": temperatura,
            "umidade_ar": 60.0,
            "umidade_solo": solo,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert resp.status_code == 201
    return resp.json()["alertas_disparados"]


def _pendentes(cliente):
    return cliente.get("/api/v1/alertas?apenas_pendentes=true&limite=50").json()


def test_leitura_normal_nao_gera_alerta(cliente):
    assert _leitura(cliente, 25.0, 48.0) == 0
    assert _pendentes(cliente) == []


def test_leitura_critica_gera_alerta_por_cultura(cliente):
    assert _leitura(cliente, 38.0, 15.0) == 8  # calor + solo seco para 4 culturas
    alertas = _pendentes(cliente)
    assert {a["cultura"] for a in alertas} == {"Tomate", "Alface", "Morango", "Cenoura"}
    calor_alface = next(a for a in alertas if a["cultura"] == "Alface" and a["tipo"] == "CLIMA")
    assert "acima do limite crítico de 30 °C" in calor_alface["mensagem"]
    assert "Talhão 2A, Talhão 2B" in calor_alface["mensagem"]
    assert calor_alface["severidade"] == "ALTA"


def test_limite_da_cultura_e_nao_o_generico(cliente):
    # 31 °C: abaixo dos 32 °C genéricos e do tomate, mas acima do crítico de alface, morango e cenoura
    assert _leitura(cliente, 31.0, 48.0) == 3
    assert {a["cultura"] for a in _pendentes(cliente)} == {"Alface", "Morango", "Cenoura"}


def test_mesma_condicao_nao_se_repete(cliente):
    assert _leitura(cliente, 38.0, 48.0) == 4
    assert _leitura(cliente, 38.5, 48.0) == 0  # ainda na janela de 6 horas
    assert _leitura(cliente, 38.5, 15.0) == 4  # condição nova (solo seco) gera os seus
    assert len(_pendentes(cliente)) == 8


def test_resolvido_continua_bloqueando_repeticao(cliente):
    _leitura(cliente, 38.0, 48.0)
    cliente.post("/api/v1/alertas/resolver-todos")
    assert _leitura(cliente, 38.0, 48.0) == 0
    assert _pendentes(cliente) == []


def test_resolver_um_e_todos(cliente):
    _leitura(cliente, 38.0, 15.0)
    primeiro = _pendentes(cliente)[0]

    resp = cliente.put(f"/api/v1/alertas/{primeiro['id']}/resolver")
    assert resp.status_code == 200 and resp.json()["lido"] is True
    assert len(_pendentes(cliente)) == 7
    assert cliente.put("/api/v1/alertas/999999/resolver").status_code == 404

    assert cliente.post("/api/v1/alertas/resolver-todos").json() == {"resolvidos": 7}
    assert _pendentes(cliente) == []
    # Sem o filtro, os resolvidos continuam no histórico
    assert len(cliente.get("/api/v1/alertas?limite=50").json()) == 8


def test_encharcamento_e_media(cliente):
    _leitura(cliente, 25.0, 90.0)  # acima de máximo ideal + 15 para todas
    alertas = _pendentes(cliente)
    assert alertas and all(a["severidade"] == "MEDIA" and "encharcamento" in a["mensagem"] for a in alertas)


def test_limites_da_automacao(cliente):
    limites = cliente.get("/api/v1/automacao/limites").json()
    assert limites["fonte"] == "fichas técnicas"
    assert limites["culturas"] == ["Alface", "Cenoura", "Morango", "Tomate"]
    assert limites["temperatura_max_critica"] == 30
    assert limites["umidade_solo_minima_critica"] == 35  # alface: 45 - 10


def test_sem_culturas_usa_regras_genericas():
    leitura = main.TelemetriaInput(
        produtor_id=1, sensor_id="s1", temperatura_ar=33.0, umidade_ar=50.0, umidade_solo=25.0,
        timestamp=datetime.now(timezone.utc),
    )
    achados = main.condicoes_criticas(leitura, culturas={})
    assert [a["chave"] for a in achados] == ["CLIMA:geral:calor", "SOLO:geral:seco"]
    assert main.limites_criticos({})["temperatura_max_critica"] == 32.0


def test_chat_recebe_alertas_pendentes_e_desvios(cliente, monkeypatch):
    """Regressão: os desvios agronômicos não podem sobrescrever a lista de alertas do contexto."""
    _leitura(cliente, 38.0, 15.0)

    chamadas = []

    class _Falso:
        models = None

        def generate_content(self, model, contents, config):
            chamadas.append(config.system_instruction)
            from types import SimpleNamespace
            return SimpleNamespace(text="ok")

    falso = _Falso()
    falso.models = falso
    monkeypatch.setattr(main, "get_gemini_client", lambda: falso)

    assert cliente.post("/api/v1/chat", json={"mensagem": "Algum alerta?"}).status_code == 200
    contexto = chamadas[0]
    assert '"alertas_pendentes": [{' in contexto
    assert "acima do limite crítico de 30 °C" in contexto
    assert '"alertas_agronomicos": {' in contexto


def test_migracao_acrescenta_colunas_em_banco_antigo(tmp_path, monkeypatch):
    antigo = create_engine(f"sqlite:///{(tmp_path / 'antigo.db').as_posix()}")
    with antigo.begin() as con:
        con.execute(text(
            "CREATE TABLE alertas (id INTEGER PRIMARY KEY, produtor_id INTEGER, tipo VARCHAR, "
            "severidade VARCHAR, mensagem VARCHAR, lido BOOLEAN, criado_em DATETIME)"
        ))
    monkeypatch.setattr(main, "engine", antigo)

    main.garantir_colunas_novas()
    main.garantir_colunas_novas()  # idempotente

    colunas = {c["name"] for c in inspect(antigo).get_columns("alertas")}
    assert {"cultura", "chave"} <= colunas

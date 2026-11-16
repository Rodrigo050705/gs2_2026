from types import SimpleNamespace

import pytest

import main


class _IAFalsa:
    def __init__(self, texto="- **Estoque:** ok", erro=None):
        self.chamadas = []
        self.texto, self.erro = texto, erro
        self.models = self

    def generate_content(self, model, contents, config):
        self.chamadas.append(config.system_instruction)
        if self.erro:
            raise self.erro
        return SimpleNamespace(text=self.texto)


@pytest.fixture(autouse=True)
def sem_resumos():
    db = main.SessionLocal()
    db.query(main.ResumoDiaDB).delete()
    db.commit()
    db.close()


def test_resumo_gerado_pela_ia_e_guardado_em_cache(cliente, monkeypatch):
    ia = _IAFalsa(texto="- **Estoque:** alface vence em 2 dias\n- **Ação do dia:** vender a alface")
    monkeypatch.setattr(main, "get_gemini_client", lambda: ia)

    primeiro = cliente.get("/api/v1/resumo-dia").json()
    assert primeiro["fonte"] == "ia" and primeiro["em_cache"] is False
    assert primeiro["texto"].startswith("- **Estoque:**")
    assert primeiro["modelo"] == main.GEMINI_MODEL
    assert primeiro["gerado_em"].endswith(("Z", "+00:00"))  # com fuso: o navegador converte para a hora local

    # As instruções do resumo e os dados do produtor vão para a IA
    assert "RESUMO DO DIA" in ia.chamadas[0] and "estoque_produtos" in ia.chamadas[0]

    segundo = cliente.get("/api/v1/resumo-dia").json()
    assert segundo["em_cache"] is True and segundo["texto"] == primeiro["texto"]
    assert len(ia.chamadas) == 1  # não chamou a IA de novo


def test_atualizar_ignora_o_cache(cliente, monkeypatch):
    ia = _IAFalsa()
    monkeypatch.setattr(main, "get_gemini_client", lambda: ia)
    cliente.get("/api/v1/resumo-dia")
    assert cliente.get("/api/v1/resumo-dia?atualizar=true").json()["em_cache"] is False
    assert len(ia.chamadas) == 2


def test_sem_ia_devolve_resumo_por_regras_sem_guardar(cliente, monkeypatch):
    monkeypatch.setattr(main, "get_gemini_client", lambda: _IAFalsa(erro=TimeoutError("fora")))
    resumo = cliente.get("/api/v1/resumo-dia").json()
    assert resumo["fonte"] == "regras"
    assert "sobrecarregada" in resumo["aviso"]
    # Seed: alface (2 dias) e tomate (3 dias) estão vencendo
    assert "**Estoque:**" in resumo["texto"] and "Alface Crespa" in resumo["texto"]
    assert "**Ação do dia:**" in resumo["texto"]
    assert "**Clima:** 10.0 mm" in resumo["texto"]  # previsão falsa do conftest

    # Quando a IA volta, gera de novo (o resumo por regras não ficou em cache)
    ia = _IAFalsa()
    monkeypatch.setattr(main, "get_gemini_client", lambda: ia)
    assert cliente.get("/api/v1/resumo-dia").json()["fonte"] == "ia"
    assert len(ia.chamadas) == 1


def test_formatar_brl():
    assert main.formatar_brl(1234.5) == "R$ 1.234,50"
    assert main.formatar_brl(3.0) == "R$ 3,00"

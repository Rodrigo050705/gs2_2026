"""Configuração dos testes da API.

O main.py cria o banco e os dados de demonstração na importação, então o ambiente precisa estar
pronto ANTES do import: banco SQLite temporário, nenhuma pasta de segredos e nenhuma chave de IA.
Nada aqui acessa a internet: previsão do tempo e Gemini são substituídos por dublês.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest

_PASTA_TMP = tempfile.mkdtemp(prefix="agrosmart-testes-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_PASTA_TMP, 'teste.db').as_posix()}"
os.environ["SECRETS_DIR"] = str(Path(_PASTA_TMP, "sem-segredos"))
os.environ.pop("GEMINI_API_KEY", None)

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # back/

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

PREVISAO_FALSA = {
    "local": "Atibaia-SP",
    "fonte": "teste",
    "dias": [
        {
            "data": "2026-11-16",
            "dia_semana": "segunda",
            "temp_max": 35.0,
            "temp_min": 18.0,
            "chuva_mm": 10.0,
            "prob_chuva_percentual": 90,
            "evapotranspiracao_mm": 4.0,
            "vento_max_kmh": 12.0,
        }
    ],
    "chuva_total_mm": 10.0,
    "evapotranspiracao_total_mm": 4.0,
}


@pytest.fixture(autouse=True)
def sem_internet(monkeypatch):
    """Previsão do tempo fixa (sem chamar a Open-Meteo)."""
    monkeypatch.setattr(main, "obter_previsao_tempo", lambda produtor, dias=7: PREVISAO_FALSA)


@pytest.fixture()
def cliente():
    return TestClient(main.app)

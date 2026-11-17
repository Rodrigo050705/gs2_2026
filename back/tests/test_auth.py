import pytest

import main


@pytest.fixture(autouse=True)
def zera_bloqueios():
    main._falhas_login.clear()
    yield
    main._falhas_login.clear()


ROTAS_PROTEGIDAS = [
    ("get", "/api/v1/produtos"),
    ("get", "/api/v1/vendas/resumo"),
    ("get", "/api/v1/telemetria"),
    ("get", "/api/v1/produtores/1"),
    ("get", "/api/v1/resumo-dia"),
    ("get", "/api/v1/chat/interacoes"),
    ("get", "/api/v1/auth/me"),
    ("delete", "/api/v1/produtos/1"),
]


@pytest.mark.parametrize("metodo,rota", ROTAS_PROTEGIDAS)
def test_rotas_exigem_login(anonimo, metodo, rota):
    assert getattr(anonimo, metodo)(rota).status_code == 401


def test_health_e_publico(anonimo):
    assert anonimo.get("/health").status_code == 200


def test_docs_desligada_por_padrao(anonimo):
    assert anonimo.get("/docs").status_code == 404
    assert anonimo.get("/openapi.json").status_code == 404


def test_login_abre_sessao_e_logout_fecha(anonimo):
    resp = anonimo.post("/api/v1/auth/login", json={"usuario": "ADMIN ", "senha": "senha-de-teste-123"})
    assert resp.status_code == 200
    assert resp.json()["usuario"] == "admin"
    cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert "senha" not in resp.text

    assert anonimo.get("/api/v1/auth/me").json()["usuario"] == "admin"
    assert anonimo.get("/api/v1/produtos").status_code == 200

    token = anonimo.cookies.get(main.COOKIE_SESSAO)
    assert anonimo.post("/api/v1/auth/logout").status_code == 204
    # O token antigo não vale mais, mesmo se alguém o guardou.
    anonimo.cookies.set(main.COOKIE_SESSAO, token)
    assert anonimo.get("/api/v1/produtos").status_code == 401


def test_senha_errada_e_usuario_inexistente(anonimo):
    r1 = anonimo.post("/api/v1/auth/login", json={"usuario": "admin", "senha": "errada"})
    r2 = anonimo.post("/api/v1/auth/login", json={"usuario": "ninguem", "senha": "errada"})
    assert r1.status_code == r2.status_code == 401
    assert r1.json() == r2.json()  # não revela se o usuário existe


def test_bloqueio_apos_muitas_falhas(anonimo):
    for _ in range(main.LIMITE_FALHAS):
        anonimo.post("/api/v1/auth/login", json={"usuario": "admin", "senha": "errada"})
    resp = anonimo.post("/api/v1/auth/login", json={"usuario": "admin", "senha": "senha-de-teste-123"})
    assert resp.status_code == 429


def test_token_invalido_nao_entra(anonimo):
    anonimo.cookies.set(main.COOKIE_SESSAO, "inventado")
    assert anonimo.get("/api/v1/produtos").status_code == 401


LEITURA = {"produtor_id": 1, "sensor_id": "s1", "temperatura_ar": 25, "umidade_ar": 60, "umidade_solo": 45,
           "timestamp": "2026-11-17T12:00:00+00:00"}


def test_telemetria_com_token_do_dispositivo(anonimo):
    assert anonimo.post("/api/v1/telemetria", json=LEITURA).status_code == 401
    assert anonimo.post("/api/v1/telemetria", json=LEITURA,
                        headers={"X-Dispositivo-Token": "errado"}).status_code == 401
    assert anonimo.post("/api/v1/telemetria", json=LEITURA,
                        headers={"X-Dispositivo-Token": "token-de-teste"}).status_code == 201
    # O token do dispositivo só serve para enviar leituras, não para ler dados.
    assert anonimo.get("/api/v1/telemetria", headers={"X-Dispositivo-Token": "token-de-teste"}).status_code == 401


def test_hash_de_senha():
    h = main.gerar_hash_senha("uma senha qualquer")
    assert h.startswith("scrypt$") and "uma senha" not in h
    assert main.conferir_senha("uma senha qualquer", h)
    assert not main.conferir_senha("outra senha", h)
    assert not main.conferir_senha("x", "lixo")


def test_criar_usuario_valida_senha_e_duplicado():
    db = main.SessionLocal()
    try:
        with pytest.raises(ValueError):
            main.criar_usuario(db, "curta", "123")
        with pytest.raises(ValueError):
            main.criar_usuario(db, "Admin", "senha-longa-o-bastante")
    finally:
        db.close()


def test_sem_cors_aberto(anonimo):
    resp = anonimo.get("/health", headers={"Origin": "https://malicioso.example"})
    assert "access-control-allow-origin" not in resp.headers

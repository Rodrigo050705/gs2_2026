import json
import os
import time as _time
import unicodedata
from pathlib import Path
from datetime import datetime, date, timedelta, timezone
from typing import List, Literal, Optional
import requests
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import create_engine, text, Column, Integer, Float, String, DateTime, Date, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ==========================================
# 0. CONFIGURAÇÃO (.env local + segredos por arquivo nos ambientes)
# ==========================================
from dotenv import load_dotenv

# Desenvolvimento: back/.env (fora do Git).
load_dotenv(Path(__file__).resolve().parent / ".env")

# Homologação/produção: um arquivo por chave em /run/secrets (key-per-file, como nos outros apps
# do gtlabs-deploy). O nome do arquivo é a variável (ex.: GEMINI_API_KEY) e o arquivo vale mais
# que a variável de ambiente de mesmo nome.
PASTA_SEGREDOS = Path(os.getenv("SECRETS_DIR", "/run/secrets"))
if PASTA_SEGREDOS.is_dir():
    for arquivo in PASTA_SEGREDOS.iterdir():
        if arquivo.is_file():
            os.environ[arquivo.name] = arquivo.read_text(encoding="utf-8").strip()


# ==========================================
# 1. CONFIGURAÇÃO DO BANCO (SQLite)
# ==========================================
# No container o banco fica num volume (ex.: sqlite:////data/agrosmart.db).
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./agrosmart.db")
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class TelemetriaDB(Base):
    __tablename__ = "telemetria"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, index=True)
    sensor_id = Column(String)
    temperatura_ar = Column(Float)
    umidade_ar = Column(Float)
    umidade_solo = Column(Float)
    timestamp = Column(DateTime)


class AlertaDB(Base):
    __tablename__ = "alertas"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, index=True)
    tipo = Column(String)        # Ex: "CLIMA", "SOLO", "ESTOQUE"
    severidade = Column(String)  # Ex: "ALTA", "MEDIA"
    mensagem = Column(String)
    lido = Column(Boolean, default=False)          # True = resolvido pelo produtor
    criado_em = Column(DateTime, default=datetime.utcnow)
    cultura = Column(String, nullable=True)        # Ex: "Alface"; None = alerta geral
    chave = Column(String, nullable=True, index=True)  # Ex: "CLIMA:alface:calor" (evita repetição)


class ProdutoDB(Base):
    __tablename__ = "produtos"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, default=1, index=True)
    nome = Column(String, index=True)
    categoria = Column(String)       # Ex: "Hortaliças", "Frutas", "Grãos"
    quantidade = Column(Float)
    unidade = Column(String)         # Ex: "kg", "cx", "un"
    custo_unitario = Column(Float)
    preco_venda = Column(Float)
    preco_mercado = Column(Float)    # Referência regional (ex: CEASA)
    data_validade = Column(Date)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class VendaDB(Base):
    __tablename__ = "vendas"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, default=1, index=True)
    produto_id = Column(Integer, index=True)      # referência a produtos.id
    produto_nome = Column(String, index=True)     # cópia do nome no momento da venda
    quantidade = Column(Float)
    unidade = Column(String)
    preco_unitario = Column(Float)                # preço efetivamente praticado
    custo_unitario = Column(Float)                # custo no momento da venda (para lucro)
    canal = Column(String)                        # Ex: "Feira", "Mercado local", "CEASA", "Delivery"
    data_venda = Column(Date, index=True)
    criado_em = Column(DateTime, default=datetime.utcnow)


class ProdutorDB(Base):
    __tablename__ = "produtores"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String)
    cidade = Column(String)
    uf = Column(String(2))
    latitude = Column(Float)
    longitude = Column(Float)
    area_hectares = Column(Float)
    irrigacao = Column(String)      # Ex: "Gotejamento", "Aspersão", "Nenhuma"
    tipo_solo = Column(String)      # Ex: "Argiloso", "Arenoso", "Misto"
    culturas = Column(String)       # lista separada por vírgula
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PlantioDB(Base):
    __tablename__ = "plantios"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, default=1, index=True)
    cultura = Column(String, index=True)          # Ex: "Tomate"
    variedade = Column(String)                    # Ex: "Carmem"
    talhao = Column(String)                       # Ex: "Talhão 1"
    area_m2 = Column(Float)
    data_plantio = Column(Date)
    ciclo_dias = Column(Integer)                  # dias do plantio até o início da colheita
    janela_colheita_dias = Column(Integer, default=7)  # por quantos dias a colheita se estende
    producao_estimada = Column(Float)
    unidade = Column(String)                      # unidade da produção estimada (kg, un, cx)
    status = Column(String, default="Em andamento")    # "Em andamento", "Colhido", "Perdido"
    data_colheita_real = Column(Date, nullable=True)
    observacoes = Column(String, nullable=True)
    criado_em = Column(DateTime, default=datetime.utcnow)


class ResumoDiaDB(Base):
    """Último resumo do dia gerado pela IA (cache, para não chamar o Gemini a cada abertura)."""
    __tablename__ = "resumos_dia"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, index=True)
    texto = Column(String)
    modelo = Column(String)
    gerado_em = Column(DateTime, default=datetime.utcnow, index=True)


class ChatInteracaoDB(Base):
    """Cada pergunta feita ao assistente, com a resposta e a avaliação do produtor (👍/👎)."""
    __tablename__ = "chat_interacoes"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, index=True)
    pergunta = Column(String)
    resposta = Column(String, nullable=True)
    modelo = Column(String, nullable=True)
    sucesso = Column(Boolean, default=True)
    erro = Column(String, nullable=True)
    duracao_ms = Column(Integer)
    feedback = Column(Integer, nullable=True)      # 1 = 👍, -1 = 👎, None = sem avaliação
    comentario = Column(String, nullable=True)     # o que faltou (opcional, junto do 👎)
    tela = Column(String, nullable=True)           # aba em que o produtor estava ao perguntar
    criado_em = Column(DateTime, default=datetime.utcnow, index=True)


Base.metadata.create_all(bind=engine)


def garantir_colunas_novas():
    """O create_all cria tabelas novas, mas não acrescenta colunas em tabelas que já existem.
    Acrescenta aqui as colunas que entraram depois (só mudanças aditivas), para bancos antigos."""
    if engine.dialect.name != "sqlite":
        return
    novas = {
        "alertas": {"cultura": "VARCHAR", "chave": "VARCHAR"},
        "chat_interacoes": {"tela": "VARCHAR"},
    }
    with engine.begin() as con:
        for tabela, colunas in novas.items():
            existentes = {linha[1] for linha in con.execute(text(f"PRAGMA table_info({tabela})"))}
            if not existentes:  # tabela ainda não existe: o create_all a cria completa
                continue
            for nome, tipo in colunas.items():
                if nome not in existentes:
                    con.execute(text(f"ALTER TABLE {tabela} ADD COLUMN {nome} {tipo}"))


garantir_colunas_novas()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# 2. POPULAÇÃO INICIAL PARA DEMO (SEED ESTOQUE)
# ==========================================
def inicializar_dados_demo():
    db = SessionLocal()
    try:
        if db.query(ProdutoDB).count() == 0:
            hoje = date.today()
            itens_iniciais = [
                ProdutoDB(
                    produtor_id=1,
                    nome="Tomate Carmem",
                    categoria="Hortaliças",
                    quantidade=120.0,
                    unidade="kg",
                    custo_unitario=3.20,
                    preco_venda=5.50,
                    preco_mercado=6.20,
                    data_validade=hoje + timedelta(days=3),  # Risco crítico de validade
                ),
                ProdutoDB(
                    produtor_id=1,
                    nome="Alface Crespa",
                    categoria="Hortaliças",
                    quantidade=85.0,
                    unidade="un",
                    custo_unitario=1.10,
                    preco_venda=2.50,
                    preco_mercado=2.40,
                    data_validade=hoje + timedelta(days=2),  # Risco crítico de validade
                ),
                ProdutoDB(
                    produtor_id=1,
                    nome="Morango Albion",
                    categoria="Frutas",
                    quantidade=45.0,
                    unidade="cx",
                    custo_unitario=9.50,
                    preco_venda=11.00,  # Margem baixa (< 20%)
                    preco_mercado=14.50,
                    data_validade=hoje + timedelta(days=5),
                ),
                ProdutoDB(
                    produtor_id=1,
                    nome="Cenoura Nantes",
                    categoria="Hortaliças",
                    quantidade=200.0,
                    unidade="kg",
                    custo_unitario=1.80,
                    preco_venda=3.40,
                    preco_mercado=3.50,
                    data_validade=hoje + timedelta(days=14),
                ),
                ProdutoDB(
                    produtor_id=1,
                    nome="Feijão Carioca",
                    categoria="Grãos",
                    quantidade=300.0,
                    unidade="kg",
                    custo_unitario=4.50,
                    preco_venda=7.20,
                    preco_mercado=7.00,
                    data_validade=hoje + timedelta(days=90),
                ),
            ]
            db.add_all(itens_iniciais)
            db.commit()
    finally:
        db.close()


# Vendas diárias médias e sazonalidade por mês (1=jan … 12=dez) para gerar um histórico realista
PERFIL_VENDAS_DEMO = {
    "Tomate Carmem":  {"base": 18, "sazonal": {11: 1.25, 12: 1.35, 1: 1.3, 6: 0.8, 7: 0.8}},
    "Alface Crespa":  {"base": 22, "sazonal": {12: 1.4, 1: 1.45, 2: 1.3, 11: 1.2, 6: 0.7, 7: 0.65}},
    "Morango Albion": {"base": 5,  "sazonal": {6: 1.5, 7: 1.7, 8: 1.8, 9: 1.6, 10: 1.2, 11: 0.8, 12: 0.5, 1: 0.4}},
    "Cenoura Nantes": {"base": 12, "sazonal": {}},
    "Feijão Carioca": {"base": 8,  "sazonal": {3: 1.2, 4: 1.2}},
}
CANAIS_DEMO = ["Feira", "Feira", "Mercado local", "Mercado local", "CEASA", "Delivery"]


def inicializar_vendas_demo(dias: int = 180):
    """Gera ~6 meses de vendas fictícias (determinísticas) para a demo, se a tabela estiver vazia."""
    import random

    db = SessionLocal()
    try:
        if db.query(VendaDB).count() > 0:
            return
        rnd = random.Random(42)
        produtos = {p.nome: p for p in db.query(ProdutoDB).filter(ProdutoDB.produtor_id == 1).all()}
        hoje = date.today()
        vendas = []
        for d in range(dias, 0, -1):
            dia = hoje - timedelta(days=d)
            # Quarta e sábado são dias de feira: vende mais
            fator_dia = 1.6 if dia.weekday() in (2, 5) else (0.4 if dia.weekday() == 6 else 1.0)
            for nome, perfil in PERFIL_VENDAS_DEMO.items():
                p = produtos.get(nome)
                if not p or rnd.random() < 0.25:  # nem todo produto vende todo dia
                    continue
                qtd = perfil["base"] * perfil["sazonal"].get(dia.month, 1.0) * fator_dia * rnd.uniform(0.6, 1.4)
                vendas.append(
                    VendaDB(
                        produtor_id=1,
                        produto_id=p.id,
                        produto_nome=p.nome,
                        quantidade=round(max(qtd, 1), 1),
                        unidade=p.unidade,
                        preco_unitario=round(p.preco_venda * rnd.uniform(0.88, 1.06), 2),
                        custo_unitario=p.custo_unitario,
                        canal=rnd.choice(CANAIS_DEMO),
                        data_venda=dia,
                    )
                )
        db.add_all(vendas)
        db.commit()
    finally:
        db.close()


def inicializar_produtor_demo():
    """Perfil da propriedade de demonstração (Atibaia-SP, região de morango e hortaliças)."""
    db = SessionLocal()
    try:
        if db.query(ProdutorDB).filter(ProdutorDB.id == 1).first() is None:
            db.add(
                ProdutorDB(
                    id=1,
                    nome="Sítio Demo AgroSmart",
                    cidade="Atibaia",
                    uf="SP",
                    latitude=-23.1171,
                    longitude=-46.5503,
                    area_hectares=4.5,
                    irrigacao="Gotejamento",
                    tipo_solo="Argiloso",
                    culturas="Tomate, Alface, Morango, Cenoura, Feijão",
                )
            )
            db.commit()
    finally:
        db.close()


def inicializar_plantios_demo():
    """Plantios de demonstração em fases diferentes (datas relativas a hoje)."""
    db = SessionLocal()
    try:
        if db.query(PlantioDB).count() > 0:
            return
        hoje = date.today()
        #  (cultura, variedade, talhão, m², dias desde o plantio, ciclo, janela, produção, unidade, status, colhido há X dias)
        demo = [
            ("Tomate", "Carmem", "Talhão 1", 800, 100, 110, 45, 2400, "kg", "Em andamento", None),
            ("Alface", "Crespa", "Talhão 2A", 300, 42, 50, 10, 1800, "un", "Em andamento", None),
            ("Alface", "Crespa", "Talhão 2B", 300, 12, 50, 10, 1800, "un", "Em andamento", None),  # plantio escalonado
            ("Morango", "Albion", "Talhão 3", 600, 70, 80, 150, 900, "cx", "Em andamento", None),
            ("Cenoura", "Nantes", "Talhão 4", 500, 25, 100, 15, 1500, "kg", "Em andamento", None),
            ("Feijão", "Carioca", "Talhão 5", 1500, 120, 90, 10, 900, "kg", "Colhido", 25),
        ]
        for cultura, variedade, talhao, area, dias, ciclo, janela, prod, un, status, colhido_ha in demo:
            db.add(
                PlantioDB(
                    produtor_id=1,
                    cultura=cultura,
                    variedade=variedade,
                    talhao=talhao,
                    area_m2=area,
                    data_plantio=hoje - timedelta(days=dias),
                    ciclo_dias=ciclo,
                    janela_colheita_dias=janela,
                    producao_estimada=prod,
                    unidade=un,
                    status=status,
                    data_colheita_real=(hoje - timedelta(days=colhido_ha)) if colhido_ha else None,
                )
            )
        db.commit()
    finally:
        db.close()


inicializar_dados_demo()
inicializar_vendas_demo()
inicializar_produtor_demo()
inicializar_plantios_demo()


# ==========================================
# 3. SCHEMAS PYDANTIC (Contratos JSON)
# ==========================================
class TelemetriaInput(BaseModel):
    produtor_id: int
    sensor_id: str
    temperatura_ar: float
    umidade_ar: float
    umidade_solo: float
    timestamp: datetime


def marcar_como_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """O SQLite guarda datas sem fuso; todas são gravadas em UTC. Marca o fuso para o JSON sair com +00:00
    e o navegador converter para o horário local corretamente."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def utc_para_local(dt: Optional[datetime]) -> Optional[str]:
    """Converte uma data UTC do banco para o horário local do servidor (texto legível)."""
    if dt is None:
        return None
    return marcar_como_utc(dt).astimezone().strftime("%d/%m/%Y %H:%M")


class TelemetriaResponse(TelemetriaInput):
    id: int

    validar_timestamp_utc = field_validator("timestamp")(marcar_como_utc)

    class Config:
        from_attributes = True


class AlertaResponse(BaseModel):
    id: int
    tipo: str
    severidade: str
    mensagem: str
    lido: bool
    criado_em: datetime
    cultura: Optional[str] = None

    validar_criado_em_utc = field_validator("criado_em")(marcar_como_utc)

    class Config:
        from_attributes = True


class ProdutoInput(BaseModel):
    produtor_id: int = 1
    nome: str
    categoria: str
    quantidade: float
    unidade: str
    custo_unitario: float
    preco_venda: float
    preco_mercado: float
    data_validade: date


class ProdutoUpdate(BaseModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    quantidade: Optional[float] = None
    unidade: Optional[str] = None
    custo_unitario: Optional[float] = None
    preco_venda: Optional[float] = None
    preco_mercado: Optional[float] = None
    data_validade: Optional[date] = None


class ProdutoResponse(ProdutoInput):
    id: int
    valor_total_estoque: float
    margem_percentual: float
    dias_para_vencer: int
    status_validade: str

    class Config:
        from_attributes = True


def enriquecer_produto(p: ProdutoDB) -> dict:
    """Calcula métricas comerciais e de risco de validade em tempo real."""
    hoje = date.today()
    dias_vencer = (p.data_validade - hoje).days
    valor_total = round(p.quantidade * p.preco_venda, 2)

    if p.preco_venda > 0:
        margem = round(((p.preco_venda - p.custo_unitario) / p.preco_venda) * 100, 1)
    else:
        margem = 0.0

    if dias_vencer <= 3:
        status_val = "CRITICO"
    elif dias_vencer <= 7:
        status_val = "ATENCAO"
    else:
        status_val = "SAUDAVEL"

    return {
        "id": p.id,
        "produtor_id": p.produtor_id,
        "nome": p.nome,
        "categoria": p.categoria,
        "quantidade": p.quantidade,
        "unidade": p.unidade,
        "custo_unitario": p.custo_unitario,
        "preco_venda": p.preco_venda,
        "preco_mercado": p.preco_mercado,
        "data_validade": p.data_validade,
        "valor_total_estoque": valor_total,
        "margem_percentual": margem,
        "dias_para_vencer": dias_vencer,
        "status_validade": status_val,
    }


# ==========================================
# 4. MOTOR DE AUTOMAÇÃO (Regras por cultura, a partir das fichas técnicas)
# ==========================================
# Alerta = condição CRÍTICA. Desvios só da faixa ideal aparecem no painel "Condições por cultura"
# (/culturas/{nome}/condicoes) e não viram alerta, para não gerar ruído.
JANELA_ALERTA_REPETIDO = timedelta(hours=6)  # mesma condição não gera outro alerta nesse intervalo
MARGEM_SOLO_CRITICO = 10       # pontos abaixo do mínimo ideal da ficha → solo crítico
MARGEM_SOLO_ENCHARCADO = 15    # pontos acima do máximo ideal da ficha → risco de encharcamento
# Sem plantios com ficha técnica, valem os limites genéricos de antes.
LIMITES_GENERICOS = {"temperatura_max": 32.0, "umidade_solo_min": 30.0}


def culturas_monitoradas(db: Session, produtor_id: int) -> dict:
    """Culturas com plantio em andamento e ficha técnica: {chave: {"ficha": ..., "talhoes": [...]}}."""
    fichas = carregar_fichas()
    resultado: dict = {}
    plantios = (
        db.query(PlantioDB)
        .filter(PlantioDB.produtor_id == produtor_id, PlantioDB.status == "Em andamento")
        .all()
    )
    for p in plantios:
        chave = chave_cultura(p.cultura)
        if chave in fichas:
            resultado.setdefault(chave, {"ficha": fichas[chave], "talhoes": []})["talhoes"].append(p.talhao)
    return resultado


def limites_criticos(culturas: dict) -> dict:
    """Limites mais restritivos entre as culturas monitoradas (usados no gráfico e nos cards do front)."""
    if not culturas:
        return {
            "fonte": "genérico",
            "culturas": [],
            "temperatura_max_critica": LIMITES_GENERICOS["temperatura_max"],
            "temperatura_min_critica": None,
            "umidade_solo_minima_critica": LIMITES_GENERICOS["umidade_solo_min"],
        }
    fichas = [c["ficha"] for c in culturas.values()]
    return {
        "fonte": "fichas técnicas",
        "culturas": sorted(f["nome"] for f in fichas),
        "temperatura_max_critica": min(f["temperatura_critica_c"]["max"] for f in fichas),
        "temperatura_min_critica": max(f["temperatura_critica_c"]["min"] for f in fichas),
        "umidade_solo_minima_critica": max(f["umidade_solo_ideal_percentual"]["min"] for f in fichas) - MARGEM_SOLO_CRITICO,
    }


def condicoes_criticas(leitura: TelemetriaInput, culturas: dict) -> List[dict]:
    """Lista as condições críticas da leitura, por cultura (ou gerais, sem culturas monitoradas)."""
    t, u = leitura.temperatura_ar, leitura.umidade_solo
    achados = []

    if not culturas:
        if t > LIMITES_GENERICOS["temperatura_max"]:
            achados.append({"chave": "CLIMA:geral:calor", "tipo": "CLIMA", "severidade": "ALTA", "cultura": None,
                            "mensagem": f"Calor extremo ({t} °C) no sensor {leitura.sensor_id}. Risco de estresse térmico nas culturas."})
        if u < LIMITES_GENERICOS["umidade_solo_min"]:
            achados.append({"chave": "SOLO:geral:seco", "tipo": "SOLO", "severidade": "ALTA", "cultura": None,
                            "mensagem": f"Umidade do solo crítica ({u}%) no sensor {leitura.sensor_id}. Acionar irrigação imediatamente."})
        return achados

    for chave, info in culturas.items():
        ficha = info["ficha"]
        nome, talhoes = ficha["nome"], ", ".join(info["talhoes"])
        t_crit, u_ideal = ficha["temperatura_critica_c"], ficha["umidade_solo_ideal_percentual"]
        obs = f" {t_crit['obs']}" if t_crit.get("obs") else ""

        if t > t_crit["max"]:
            achados.append({"chave": f"CLIMA:{chave}:calor", "tipo": "CLIMA", "severidade": "ALTA", "cultura": nome,
                            "mensagem": f"{nome} ({talhoes}): {t} °C, acima do limite crítico de {t_crit['max']} °C.{obs}"})
        elif t < t_crit["min"]:
            achados.append({"chave": f"CLIMA:{chave}:frio", "tipo": "CLIMA", "severidade": "ALTA", "cultura": nome,
                            "mensagem": f"{nome} ({talhoes}): {t} °C, abaixo do limite crítico de {t_crit['min']} °C.{obs}"})

        if u < u_ideal["min"] - MARGEM_SOLO_CRITICO:
            achados.append({"chave": f"SOLO:{chave}:seco", "tipo": "SOLO", "severidade": "ALTA", "cultura": nome,
                            "mensagem": f"{nome} ({talhoes}): umidade do solo em {u}%, muito abaixo do ideal "
                                        f"({u_ideal['min']}–{u_ideal['max']}%). Acionar a irrigação."})
        elif u > u_ideal["max"] + MARGEM_SOLO_ENCHARCADO:
            achados.append({"chave": f"SOLO:{chave}:encharcado", "tipo": "SOLO", "severidade": "MEDIA", "cultura": nome,
                            "mensagem": f"{nome} ({talhoes}): umidade do solo em {u}%, bem acima do ideal "
                                        f"({u_ideal['min']}–{u_ideal['max']}%). Risco de encharcamento: suspender a irrigação."})
    return achados


def avaliar_regras_automacao(db: Session, leitura: TelemetriaInput):
    """Gera alertas para as condições críticas da leitura, sem repetir a mesma condição na janela."""
    achados = condicoes_criticas(leitura, culturas_monitoradas(db, leitura.produtor_id))
    if not achados:
        return 0

    desde = datetime.utcnow() - JANELA_ALERTA_REPETIDO
    recentes = {
        chave
        for (chave,) in db.query(AlertaDB.chave)
        .filter(AlertaDB.produtor_id == leitura.produtor_id, AlertaDB.criado_em >= desde, AlertaDB.chave.isnot(None))
        .all()
    }
    novos = [
        AlertaDB(produtor_id=leitura.produtor_id, tipo=a["tipo"], severidade=a["severidade"],
                 mensagem=a["mensagem"], cultura=a["cultura"], chave=a["chave"])
        for a in achados
        if a["chave"] not in recentes
    ]
    if novos:
        db.add_all(novos)
        db.commit()
    return len(novos)


# ==========================================
# 5. APLICAÇÃO E ENDPOINTS FASTAPI
# ==========================================
app = FastAPI(title="AgroSmart API - Telemetria, Estoque & Inteligência", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """Usado pelo healthcheck do container: confirma que a API responde e que o banco abre."""
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


# --- ENDPOINTS DE TELEMETRIA & ALERTAS ---
@app.post("/api/v1/telemetria", status_code=201)
def registrar_telemetria(payload: TelemetriaInput, db: Session = Depends(get_db)):
    nova_leitura = TelemetriaDB(**payload.model_dump())
    db.add(nova_leitura)
    db.commit()
    db.refresh(nova_leitura)

    qtd_alertas = avaliar_regras_automacao(db, payload)
    return {
        "status": "registrado",
        "leitura_id": nova_leitura.id,
        "alertas_disparados": qtd_alertas,
    }


@app.get("/api/v1/telemetria", response_model=List[TelemetriaResponse])
def listar_telemetria(limite: int = 20, produtor_id: int = 1, db: Session = Depends(get_db)):
    registros = (
        db.query(TelemetriaDB)
        .filter(TelemetriaDB.produtor_id == produtor_id)
        .order_by(TelemetriaDB.timestamp.desc())
        .limit(limite)
        .all()
    )
    return list(reversed(registros))


@app.get("/api/v1/alertas", response_model=List[AlertaResponse])
def listar_alertas(
    produtor_id: int = 1,
    apenas_pendentes: bool = False,
    limite: int = 10,
    db: Session = Depends(get_db),
):
    query = db.query(AlertaDB).filter(AlertaDB.produtor_id == produtor_id)
    if apenas_pendentes:
        query = query.filter(AlertaDB.lido.is_(False))
    return query.order_by(AlertaDB.criado_em.desc(), AlertaDB.id.desc()).limit(limite).all()


@app.put("/api/v1/alertas/{alerta_id}/resolver", response_model=AlertaResponse)
def resolver_alerta(alerta_id: int, db: Session = Depends(get_db)):
    alerta = db.query(AlertaDB).filter(AlertaDB.id == alerta_id).first()
    if not alerta:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    alerta.lido = True
    db.commit()
    db.refresh(alerta)
    return alerta


@app.post("/api/v1/alertas/resolver-todos")
def resolver_todos_alertas(produtor_id: int = 1, db: Session = Depends(get_db)):
    total = (
        db.query(AlertaDB)
        .filter(AlertaDB.produtor_id == produtor_id, AlertaDB.lido.is_(False))
        .update({AlertaDB.lido: True})
    )
    db.commit()
    return {"resolvidos": total}


@app.get("/api/v1/automacao/limites")
def obter_limites_automacao(produtor_id: int = 1, db: Session = Depends(get_db)):
    """Limites críticos mais restritivos das culturas plantadas (os mesmos que geram os alertas)."""
    return limites_criticos(culturas_monitoradas(db, produtor_id))


# --- ENDPOINTS CRUD DE ESTOQUE ---
@app.post("/api/v1/produtos", response_model=ProdutoResponse, status_code=201)
def criar_produto(payload: ProdutoInput, db: Session = Depends(get_db)):
    novo_produto = ProdutoDB(**payload.model_dump())
    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)
    return enriquecer_produto(novo_produto)


@app.get("/api/v1/produtos", response_model=List[ProdutoResponse])
def listar_produtos(
    produtor_id: int = 1,
    categoria: Optional[str] = None,
    apenas_risco: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(ProdutoDB).filter(ProdutoDB.produtor_id == produtor_id)

    if categoria and categoria.upper() != "TODAS":
        query = query.filter(ProdutoDB.categoria == categoria)

    produtos = query.order_by(ProdutoDB.data_validade.asc()).all()
    resultado = [enriquecer_produto(p) for p in produtos]

    if apenas_risco:
        resultado = [r for r in resultado if r["dias_para_vencer"] <= 5 or r["margem_percentual"] < 20.0]

    return resultado


@app.put("/api/v1/produtos/{produto_id}", response_model=ProdutoResponse)
def atualizar_produto(produto_id: int, payload: ProdutoUpdate, db: Session = Depends(get_db)):
    produto = db.query(ProdutoDB).filter(ProdutoDB.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    dados_atualizados = payload.model_dump(exclude_unset=True)
    for campo, valor in dados_atualizados.items():
        setattr(produto, campo, valor)

    db.commit()
    db.refresh(produto)
    return enriquecer_produto(produto)


@app.delete("/api/v1/produtos/{produto_id}", status_code=204)
def deletar_produto(produto_id: int, db: Session = Depends(get_db)):
    produto = db.query(ProdutoDB).filter(ProdutoDB.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    db.delete(produto)
    db.commit()
    return None


# --- ENDPOINT CONSOLIDADO PARA OS 3 INDICADORES COMERCIAIS ---
@app.get("/api/v1/dashboard/comercial")
def obter_indicadores_comerciais(produtor_id: int = 1, db: Session = Depends(get_db)):
    produtos = db.query(ProdutoDB).filter(ProdutoDB.produtor_id == produtor_id).all()
    itens = [enriquecer_produto(p) for p in produtos]

    valor_total_estoque = round(sum(i["valor_total_estoque"] for i in itens), 2)
    capital_em_risco = round(
        sum(i["valor_total_estoque"] for i in itens if i["dias_para_vencer"] <= 5), 2
    )
    margem_media = (
        round(sum(i["margem_percentual"] for i in itens) / len(itens), 1) if itens else 0.0
    )

    # Agrupamento por faixa de risco de validade (Indicador 2)
    risco_validade = [
        {
            "faixa": "Crítico (≤ 3 dias)",
            "valor": round(sum(i["valor_total_estoque"] for i in itens if i["dias_para_vencer"] <= 3), 2),
        },
        {
            "faixa": "Atenção (4 a 7 dias)",
            "valor": round(sum(i["valor_total_estoque"] for i in itens if 4 <= i["dias_para_vencer"] <= 7), 2),
        },
        {
            "faixa": "Saudável (> 7 dias)",
            "valor": round(sum(i["valor_total_estoque"] for i in itens if i["dias_para_vencer"] > 7), 2),
        },
    ]

    return {
        "kpis": {
            "valor_total_estoque": valor_total_estoque,
            "capital_em_risco": capital_em_risco,
            "margem_media_percentual": margem_media,
            "total_itens": len(itens),
        },
        "risco_validade": risco_validade,
        "produtos": itens,
    }


# --- ENDPOINTS DE VENDAS ---
CANAIS_VENDA = ("Feira", "Mercado local", "CEASA", "Delivery", "Outro")


class VendaInput(BaseModel):
    produtor_id: int = 1
    produto_id: int
    quantidade: float = Field(gt=0)
    preco_unitario: Optional[float] = Field(default=None, gt=0)  # se omitido, usa o preço de venda do produto
    canal: Literal[CANAIS_VENDA] = "Feira"
    data_venda: Optional[date] = None                            # se omitido, hoje
    baixar_estoque: bool = True                                  # desconta a quantidade do estoque


class VendaResponse(BaseModel):
    id: int
    produtor_id: int
    produto_id: int
    produto_nome: str
    quantidade: float
    unidade: str
    preco_unitario: float
    custo_unitario: float
    canal: str
    data_venda: date
    valor_total: float

    class Config:
        from_attributes = True


def venda_para_dict(v: VendaDB) -> dict:
    return {
        "id": v.id,
        "produtor_id": v.produtor_id,
        "produto_id": v.produto_id,
        "produto_nome": v.produto_nome,
        "quantidade": v.quantidade,
        "unidade": v.unidade,
        "preco_unitario": v.preco_unitario,
        "custo_unitario": v.custo_unitario,
        "canal": v.canal,
        "data_venda": v.data_venda,
        "valor_total": round(v.quantidade * v.preco_unitario, 2),
    }


def resumir_vendas(db: Session, produtor_id: int, dias: int = 90) -> dict:
    """Agrega as vendas por produto: quantidade, receita, lucro, margem e tendência (últimos 30d vs. 30d anteriores)."""
    hoje = date.today()
    inicio = hoje - timedelta(days=dias)
    vendas = (
        db.query(VendaDB)
        .filter(VendaDB.produtor_id == produtor_id, VendaDB.data_venda >= min(inicio, hoje - timedelta(days=60)))
        .all()
    )

    por_produto: dict = {}
    for v in vendas:
        r = por_produto.setdefault(
            v.produto_nome,
            {"produto": v.produto_nome, "unidade": v.unidade, "quantidade": 0.0, "receita": 0.0, "lucro": 0.0,
             "num_vendas": 0, "_ult30": 0.0, "_ant30": 0.0},
        )
        valor = v.quantidade * v.preco_unitario
        if v.data_venda >= inicio:
            r["quantidade"] += v.quantidade
            r["receita"] += valor
            r["lucro"] += v.quantidade * (v.preco_unitario - (v.custo_unitario or 0))
            r["num_vendas"] += 1
        if v.data_venda >= hoje - timedelta(days=30):
            r["_ult30"] += valor
        elif v.data_venda >= hoje - timedelta(days=60):
            r["_ant30"] += valor

    produtos = []
    for r in por_produto.values():
        ult, ant = r.pop("_ult30"), r.pop("_ant30")
        r["quantidade"] = round(r["quantidade"], 1)
        r["receita"] = round(r["receita"], 2)
        r["lucro"] = round(r["lucro"], 2)
        r["margem_realizada_percentual"] = round(r["lucro"] / r["receita"] * 100, 1) if r["receita"] else 0.0
        r["receita_ultimos_30d"] = round(ult, 2)
        r["tendencia_30d_percentual"] = round((ult - ant) / ant * 100, 1) if ant else None
        produtos.append(r)
    produtos.sort(key=lambda r: r["lucro"], reverse=True)

    return {
        "periodo_dias": dias,
        "receita_total": round(sum(p["receita"] for p in produtos), 2),
        "lucro_total": round(sum(p["lucro"] for p in produtos), 2),
        "produtos": produtos,
    }


def receita_mensal(db: Session, produtor_id: int, meses: int = 6) -> dict:
    """Receita por mês e por produto (para a IA enxergar sazonalidade)."""
    hoje = date.today()
    indice_mes = hoje.year * 12 + (hoje.month - 1) - (meses - 1)  # volta (meses-1) meses, incluindo o atual
    inicio = date(indice_mes // 12, indice_mes % 12 + 1, 1)
    vendas = db.query(VendaDB).filter(VendaDB.produtor_id == produtor_id, VendaDB.data_venda >= inicio).all()
    tabela: dict = {}
    for v in vendas:
        mes = v.data_venda.strftime("%Y-%m")
        tabela.setdefault(mes, {}).setdefault(v.produto_nome, 0.0)
        tabela[mes][v.produto_nome] += v.quantidade * v.preco_unitario
    return {mes: {p: round(val, 2) for p, val in sorted(prods.items())} for mes, prods in sorted(tabela.items())}


@app.post("/api/v1/vendas", response_model=VendaResponse, status_code=201)
def registrar_venda(payload: VendaInput, db: Session = Depends(get_db)):
    produto = (
        db.query(ProdutoDB)
        .filter(ProdutoDB.id == payload.produto_id, ProdutoDB.produtor_id == payload.produtor_id)
        .first()
    )
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    if payload.baixar_estoque and payload.quantidade > produto.quantidade:
        raise HTTPException(
            status_code=400,
            detail=f"Estoque insuficiente: há {produto.quantidade} {produto.unidade} de {produto.nome}",
        )

    venda = VendaDB(
        produtor_id=payload.produtor_id,
        produto_id=produto.id,
        produto_nome=produto.nome,
        quantidade=payload.quantidade,
        unidade=produto.unidade,
        preco_unitario=payload.preco_unitario or produto.preco_venda,
        custo_unitario=produto.custo_unitario,
        canal=payload.canal,
        data_venda=payload.data_venda or date.today(),
    )
    if payload.baixar_estoque:
        produto.quantidade = round(produto.quantidade - payload.quantidade, 3)
    db.add(venda)
    db.commit()
    db.refresh(venda)
    return venda_para_dict(venda)


@app.get("/api/v1/vendas", response_model=List[VendaResponse])
def listar_vendas(
    produtor_id: int = 1,
    dias: int = 30,
    produto_id: Optional[int] = None,
    limite: int = 200,
    db: Session = Depends(get_db),
):
    query = db.query(VendaDB).filter(
        VendaDB.produtor_id == produtor_id,
        VendaDB.data_venda >= date.today() - timedelta(days=dias),
    )
    if produto_id:
        query = query.filter(VendaDB.produto_id == produto_id)
    vendas = query.order_by(VendaDB.data_venda.desc(), VendaDB.id.desc()).limit(limite).all()
    return [venda_para_dict(v) for v in vendas]


@app.get("/api/v1/vendas/resumo")
def obter_resumo_vendas(produtor_id: int = 1, dias: int = 90, db: Session = Depends(get_db)):
    return {**resumir_vendas(db, produtor_id, dias), "receita_mensal": receita_mensal(db, produtor_id)}


# --- PERFIL DO PRODUTOR ---
class ProdutorBase(BaseModel):
    nome: str
    cidade: str
    uf: str = Field(min_length=2, max_length=2)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    area_hectares: Optional[float] = None
    irrigacao: Optional[str] = None
    tipo_solo: Optional[str] = None
    culturas: Optional[str] = None


class ProdutorUpdate(BaseModel):
    nome: Optional[str] = None
    cidade: Optional[str] = None
    uf: Optional[str] = Field(default=None, min_length=2, max_length=2)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    area_hectares: Optional[float] = None
    irrigacao: Optional[str] = None
    tipo_solo: Optional[str] = None
    culturas: Optional[str] = None


class ProdutorResponse(ProdutorBase):
    id: int

    class Config:
        from_attributes = True


def buscar_produtor(db: Session, produtor_id: int) -> ProdutorDB:
    produtor = db.query(ProdutorDB).filter(ProdutorDB.id == produtor_id).first()
    if not produtor:
        raise HTTPException(status_code=404, detail="Produtor não encontrado")
    return produtor


@app.get("/api/v1/produtores/{produtor_id}", response_model=ProdutorResponse)
def obter_produtor(produtor_id: int, db: Session = Depends(get_db)):
    return buscar_produtor(db, produtor_id)


@app.put("/api/v1/produtores/{produtor_id}", response_model=ProdutorResponse)
def atualizar_produtor(produtor_id: int, payload: ProdutorUpdate, db: Session = Depends(get_db)):
    produtor = buscar_produtor(db, produtor_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(produtor, campo, valor.upper() if campo == "uf" and valor else valor)
    db.commit()
    db.refresh(produtor)
    _cache_previsao.pop(produtor_id, None)  # localização pode ter mudado
    return produtor


# --- PREVISÃO DO TEMPO (Open-Meteo: grátis, sem chave) ---
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
DIAS_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]
PREVISAO_CACHE_SEGUNDOS = 60 * 60  # a previsão muda pouco; evita chamar a API a cada pergunta
_cache_previsao: dict = {}          # produtor_id -> (instante, previsão)


def obter_previsao_tempo(produtor: ProdutorDB, dias: int = 7) -> dict:
    """Previsão diária para a localização do produtor. Levanta exceção se a Open-Meteo falhar."""
    em_cache = _cache_previsao.get(produtor.id)
    if em_cache and _time.time() - em_cache[0] < PREVISAO_CACHE_SEGUNDOS:
        return em_cache[1]

    resp = requests.get(
        OPEN_METEO_URL,
        params={
            "latitude": produtor.latitude,
            "longitude": produtor.longitude,
            "daily": ",".join([
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_sum",
                "precipitation_probability_max",
                "et0_fao_evapotranspiration",
                "wind_speed_10m_max",
            ]),
            "timezone": "America/Sao_Paulo",
            "forecast_days": dias,
        },
        timeout=10,
    )
    resp.raise_for_status()
    d = resp.json()["daily"]

    dias_previsao = [
        {
            "data": d["time"][i],
            "dia_semana": DIAS_SEMANA[date.fromisoformat(d["time"][i]).weekday()],
            "temp_max": d["temperature_2m_max"][i],
            "temp_min": d["temperature_2m_min"][i],
            "chuva_mm": d["precipitation_sum"][i],
            "prob_chuva_percentual": d["precipitation_probability_max"][i],
            "evapotranspiracao_mm": d["et0_fao_evapotranspiration"][i],  # perda de água do solo/planta
            "vento_max_kmh": d["wind_speed_10m_max"][i],
        }
        for i in range(len(d["time"]))
    ]
    previsao = {
        "local": f"{produtor.cidade}-{produtor.uf}",
        "fonte": "Open-Meteo",
        "dias": dias_previsao,
        "chuva_total_mm": round(sum(x["chuva_mm"] or 0 for x in dias_previsao), 1),
        "evapotranspiracao_total_mm": round(sum(x["evapotranspiracao_mm"] or 0 for x in dias_previsao), 1),
    }
    _cache_previsao[produtor.id] = (_time.time(), previsao)
    return previsao


@app.get("/api/v1/previsao")
def previsao_tempo(produtor_id: int = 1, db: Session = Depends(get_db)):
    produtor = buscar_produtor(db, produtor_id)
    try:
        return obter_previsao_tempo(produtor)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Previsão do tempo indisponível: {e}")


# --- PLANTIOS / CALENDÁRIO DE SAFRA ---
STATUS_PLANTIO = ("Em andamento", "Colhido", "Perdido")


class PlantioInput(BaseModel):
    produtor_id: int = 1
    cultura: str
    variedade: Optional[str] = None
    talhao: str
    area_m2: Optional[float] = Field(default=None, gt=0)
    data_plantio: date
    ciclo_dias: int = Field(gt=0, le=730)
    janela_colheita_dias: int = Field(default=7, ge=1, le=365)
    producao_estimada: Optional[float] = Field(default=None, ge=0)
    unidade: Optional[str] = None
    observacoes: Optional[str] = None


class PlantioUpdate(BaseModel):
    talhao: Optional[str] = None
    area_m2: Optional[float] = Field(default=None, gt=0)
    data_plantio: Optional[date] = None
    ciclo_dias: Optional[int] = Field(default=None, gt=0, le=730)
    janela_colheita_dias: Optional[int] = Field(default=None, ge=1, le=365)
    producao_estimada: Optional[float] = Field(default=None, ge=0)
    unidade: Optional[str] = None
    status: Optional[Literal[STATUS_PLANTIO]] = None
    data_colheita_real: Optional[date] = None
    observacoes: Optional[str] = None


def enriquecer_plantio(p: PlantioDB) -> dict:
    """Calcula datas de colheita, progresso e fase atual do plantio."""
    hoje = date.today()
    inicio_colheita = p.data_plantio + timedelta(days=p.ciclo_dias)
    fim_colheita = inicio_colheita + timedelta(days=p.janela_colheita_dias or 0)
    dias_desde = (hoje - p.data_plantio).days
    progresso = max(0.0, min(100.0, round(dias_desde / p.ciclo_dias * 100, 1)))

    if p.status != "Em andamento":
        fase = p.status
    elif hoje > fim_colheita:
        fase = "Atrasado (janela de colheita passou)"
    elif hoje >= inicio_colheita:
        fase = "Em colheita"
    elif progresso >= 85:
        fase = "Pré-colheita"
    elif progresso >= 30:
        fase = "Desenvolvimento"
    else:
        fase = "Inicial"

    return {
        "id": p.id,
        "produtor_id": p.produtor_id,
        "cultura": p.cultura,
        "variedade": p.variedade,
        "talhao": p.talhao,
        "area_m2": p.area_m2,
        "data_plantio": p.data_plantio,
        "ciclo_dias": p.ciclo_dias,
        "janela_colheita_dias": p.janela_colheita_dias,
        "producao_estimada": p.producao_estimada,
        "unidade": p.unidade,
        "status": p.status,
        "data_colheita_real": p.data_colheita_real,
        "observacoes": p.observacoes,
        "inicio_colheita_previsto": inicio_colheita,
        "fim_colheita_previsto": fim_colheita,
        "dias_desde_plantio": dias_desde,
        "dias_para_colheita": (inicio_colheita - hoje).days,
        "progresso_percentual": progresso,
        "fase": fase,
    }


def buscar_plantio(db: Session, plantio_id: int) -> PlantioDB:
    plantio = db.query(PlantioDB).filter(PlantioDB.id == plantio_id).first()
    if not plantio:
        raise HTTPException(status_code=404, detail="Plantio não encontrado")
    return plantio


@app.post("/api/v1/plantios", status_code=201)
def criar_plantio(payload: PlantioInput, db: Session = Depends(get_db)):
    plantio = PlantioDB(**payload.model_dump(), status="Em andamento")
    db.add(plantio)
    db.commit()
    db.refresh(plantio)
    return enriquecer_plantio(plantio)


@app.get("/api/v1/plantios")
def listar_plantios(
    produtor_id: int = 1,
    status: Optional[Literal[STATUS_PLANTIO]] = None,
    db: Session = Depends(get_db),
):
    query = db.query(PlantioDB).filter(PlantioDB.produtor_id == produtor_id)
    if status:
        query = query.filter(PlantioDB.status == status)
    plantios = [enriquecer_plantio(p) for p in query.all()]
    return sorted(plantios, key=lambda p: p["inicio_colheita_previsto"])


@app.put("/api/v1/plantios/{plantio_id}")
def atualizar_plantio(plantio_id: int, payload: PlantioUpdate, db: Session = Depends(get_db)):
    plantio = buscar_plantio(db, plantio_id)
    dados = payload.model_dump(exclude_unset=True)
    # Ao marcar como colhido sem informar a data, assume hoje
    if dados.get("status") == "Colhido" and not dados.get("data_colheita_real") and not plantio.data_colheita_real:
        dados["data_colheita_real"] = date.today()
    for campo, valor in dados.items():
        setattr(plantio, campo, valor)
    db.commit()
    db.refresh(plantio)
    return enriquecer_plantio(plantio)


@app.delete("/api/v1/plantios/{plantio_id}", status_code=204)
def deletar_plantio(plantio_id: int, db: Session = Depends(get_db)):
    db.delete(buscar_plantio(db, plantio_id))
    db.commit()
    return None


@app.get("/api/v1/plantios/calendario")
def calendario_colheitas(produtor_id: int = 1, dias: int = 60, db: Session = Depends(get_db)):
    """Colheitas previstas nos próximos N dias (inclui as que já estão em andamento)."""
    hoje = date.today()
    limite = hoje + timedelta(days=dias)
    ativos = db.query(PlantioDB).filter(PlantioDB.produtor_id == produtor_id, PlantioDB.status == "Em andamento").all()
    itens = [enriquecer_plantio(p) for p in ativos]
    return sorted(
        [i for i in itens if i["inicio_colheita_previsto"] <= limite and i["fim_colheita_previsto"] >= hoje],
        key=lambda i: i["inicio_colheita_previsto"],
    )


# --- FICHA TÉCNICA DAS CULTURAS ---
ARQUIVO_CULTURAS = Path(__file__).resolve().parent / "dados" / "culturas.json"


def carregar_fichas() -> dict:
    """Lê back/dados/culturas.json (relido a cada chamada para que edições valham sem reiniciar)."""
    with open(ARQUIVO_CULTURAS, encoding="utf-8") as f:
        dados = json.load(f)
    dados.pop("_sobre", None)
    return dados


def chave_cultura(nome: str) -> str:
    """'Feijão Carioca' -> 'feijao' (primeira palavra, minúscula, sem acento)."""
    primeira = (nome or "").strip().split(" ")[0].lower()
    return "".join(c for c in unicodedata.normalize("NFD", primeira) if unicodedata.category(c) != "Mn")


def avaliar_condicoes(ficha: dict, leitura: Optional[TelemetriaDB], previsao: Optional[dict]) -> List[str]:
    """Compara sensores e previsão com as faixas da ficha e devolve alertas objetivos em texto."""
    alertas = []
    t_ideal, t_crit = ficha["temperatura_ideal_c"], ficha["temperatura_critica_c"]
    u_ideal = ficha["umidade_solo_ideal_percentual"]

    if leitura:
        t, u = leitura.temperatura_ar, leitura.umidade_solo
        if t > t_crit["max"] or t < t_crit["min"]:
            alertas.append(f"Temperatura atual {t} °C fora do limite crítico ({t_crit['min']}–{t_crit['max']} °C).")
        elif t > t_ideal["max"] or t < t_ideal["min"]:
            alertas.append(f"Temperatura atual {t} °C fora da faixa ideal ({t_ideal['min']}–{t_ideal['max']} °C).")
        if u < u_ideal["min"]:
            alertas.append(f"Umidade do solo {u}% abaixo do ideal ({u_ideal['min']}–{u_ideal['max']}%).")
        elif u > u_ideal["max"]:
            alertas.append(f"Umidade do solo {u}% acima do ideal ({u_ideal['min']}–{u_ideal['max']}%): risco de encharcamento.")

    if isinstance(previsao, dict):
        quentes = [f"{d['dia_semana']} {d['data'][8:10]}/{d['data'][5:7]} ({d['temp_max']} °C)"
                   for d in previsao["dias"] if d["temp_max"] is not None and d["temp_max"] > t_crit["max"]]
        frios = [f"{d['dia_semana']} {d['data'][8:10]}/{d['data'][5:7]} ({d['temp_min']} °C)"
                 for d in previsao["dias"] if d["temp_min"] is not None and d["temp_min"] < t_crit["min"]]
        if quentes:
            alertas.append(f"Previsão acima do limite crítico de {t_crit['max']} °C: {', '.join(quentes)}.")
        if frios:
            alertas.append(f"Previsão abaixo do limite crítico de {t_crit['min']} °C: {', '.join(frios)}.")
    return alertas


@app.get("/api/v1/culturas")
def listar_culturas():
    return carregar_fichas()


@app.get("/api/v1/culturas/{nome}")
def obter_cultura(nome: str):
    ficha = carregar_fichas().get(chave_cultura(nome))
    if not ficha:
        raise HTTPException(status_code=404, detail="Cultura sem ficha técnica cadastrada")
    return ficha


@app.get("/api/v1/culturas/{nome}/condicoes")
def condicoes_cultura(nome: str, produtor_id: int = 1, db: Session = Depends(get_db)):
    """Avalia o clima atual (sensores) e a previsão contra a ficha técnica da cultura."""
    ficha = obter_cultura(nome)
    leitura = (
        db.query(TelemetriaDB)
        .filter(TelemetriaDB.produtor_id == produtor_id)
        .order_by(TelemetriaDB.timestamp.desc())
        .first()
    )
    previsao = None
    produtor = db.query(ProdutorDB).filter(ProdutorDB.id == produtor_id).first()
    if produtor:
        try:
            previsao = obter_previsao_tempo(produtor)
        except Exception:
            previsao = None
    alertas = avaliar_condicoes(ficha, leitura, previsao)
    return {"cultura": ficha["nome"], "alertas": alertas, "condicoes_ok": not alertas}


# ==========================================
# 6. ASSISTENTE IA (CHAT)
# ==========================================
# A chave GEMINI_API_KEY vem de back/.env (dev) ou de /run/secrets (hml/prod) — ver seção 0.
#   Chave grátis em: https://aistudio.google.com/apikey
from google import genai
from google.genai import types
from google.genai import errors as genai_errors

# flash-lite: respostas em ~2-4s; os "flash" maiores estavam sobrecarregados (timeouts de 25s+)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
# Se o principal falhar (sobrecarga, limite, timeout), tenta estes em ordem
GEMINI_MODELOS_RESERVA = ["gemini-3.5-flash-lite", "gemini-3.8-flash"]
_gemini_client = None


def get_gemini_client():
    """Cria o cliente uma única vez (lê GEMINI_API_KEY do ambiente)."""
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(
            http_options=types.HttpOptions(
                timeout=20_000,  # ms: se um modelo travar, desiste e passa para o próximo
                retry_options=types.HttpRetryOptions(attempts=1),  # sem retry interno; a troca de modelo cuida disso
            )
        )
    return _gemini_client


class MensagemChat(BaseModel):
    papel: Literal["user", "model"]
    texto: str = Field(max_length=4000)


# Abas do front: o chat sabe onde o produtor está e interpreta perguntas vagas ("isso", "esse gráfico") a partir dela.
TELAS = {
    "clima": "Clima & IoT: leituras dos sensores (temperatura, umidade do ar e do solo), previsão de 7 dias, "
             "condições de cada cultura e alertas da automação",
    "plantios": "Plantios: talhões, fases das culturas, calendário de colheita e fichas técnicas",
    "vendas": "Vendas: registro de vendas, lucro, margem, tendência de 30 dias e receita mensal por produto",
    "comercial": "Dashboard Comercial: valor em estoque, capital em risco por validade, margens e ranking de produtos",
    "estoque": "Gestão de Estoque: produtos, quantidades, custos, preços de venda e de mercado e validades",
    "assistente": "Assistente IA: histórico das perguntas feitas ao chat e avaliações das respostas",
}


class ChatInput(BaseModel):
    produtor_id: int = 1
    mensagem: str = Field(min_length=1, max_length=2000)
    historico: List[MensagemChat] = []
    tela: Optional[Literal[tuple(TELAS)]] = None  # aba aberta no front


def instrucao_tela(tela: Optional[str]) -> str:
    if not tela:
        return ""
    return (
        f"\n\nTELA ATUAL: o produtor está na tela \"{TELAS[tela]}\". Se a pergunta for vaga ou se referir a algo "
        "visível (\"isso\", \"aqui\", \"esse gráfico\", \"o que eu faço?\"), interprete a partir dessa tela e priorize "
        "os dados dela. Se a pergunta for clara e sobre outro assunto, responda normalmente, sem citar a tela."
    )


# "Parametrização do sistema": regras de comportamento da IA
SYSTEM_PROMPT = """Você é o AgroSmart Assistente, consultor de um pequeno produtor rural brasileiro.
Regras:
- Responda em português do Brasil, de forma curta, prática e direta (no máximo ~8 linhas, use listas quando ajudar).
- Baseie-se PRIMEIRO nos DADOS ATUAIS abaixo (estoque, vendas, margens, validade, clima e alertas). Cite números concretos.
- "Melhor produto" / "o que mais vende": use o HISTÓRICO DE VENDAS (lucro realizado, receita, giro e tendência dos últimos 30 dias);
  complemente com o estoque (margem atual, preço vs. mercado, risco de validade). Explique o critério usado.
- Sazonalidade: use "receita_mensal" para identificar meses fortes/fracos de cada produto.
- Perguntas sobre "melhor momento para produzir/plantar X": combine o histórico de vendas (quando X vende mais), os dados de clima
  dos sensores, a localização da propriedade (perfil_propriedade) e conhecimento agronômico geral (época na região, temperatura
  ideal, ciclo da cultura — conte o ciclo para trás a partir do pico de vendas). Deixe claro o que vem dos dados e o que é geral.
- Previsão do tempo (previsao_7_dias): use para chuva, irrigação, colheita e aplicações. Irrigação: compare chuva prevista com
  evapotranspiração e com a umidade do solo dos sensores. Evite recomendar colheita/aplicação em dias de chuva forte ou vento alto.
  Sempre diga o dia da semana junto com a data.
- Plantios (plantios_ativos): use para "o que colho/quando colho", "vou ter X para vender em <mês>?" e planejamento de talhões.
  Cruze as datas de colheita com a previsão do tempo, o estoque atual (evitar colher mais enquanto há estoque vencendo) e o
  histórico de vendas (se a colheita cai num mês fraco, avise). Para sugerir novo plantio, indique o talhão que fica livre e quando
  (fim_colheita_previsto). Fases "Atrasado" merecem alerta.
  Para "vou ter X em <período>?": haverá produto se o intervalo inicio_colheita_previsto–fim_colheita_previsto de algum plantio
  de X se sobrepuser ao período. Se a sobreposição for parcial, diga exatamente quais dias ficam cobertos e quais ficam sem produto.
- Ficha técnica (fichas_tecnicas_culturas): é a FONTE para números agronômicos (ciclo, temperaturas, umidade ideal, época de
  plantio na região, conservação, riscos). Prefira esses valores ao seu conhecimento geral e diga "pela ficha técnica" ao usá-los.
  Para "quando plantar X", use meses_plantio/epoca_plantio_regiao + ciclo_dias + pico de vendas.
  alertas_agronomicos já traz comparações calculadas (sensores e previsão x faixas da ficha): mencione-os quando forem relevantes.
  Use riscos_climaticos para avisar de doenças/pragas quando a previsão ou os sensores indicarem a condição descrita.
- Se faltar dado para responder, diga isso e responda com o que existe.
- Nunca invente números que não estejam nos dados.
- Assuntos fora de agro/gestão do negócio: recuse educadamente."""


def montar_contexto(db: Session, produtor_id: int) -> str:
    """Coleta os dados do produtor e transforma em JSON para a IA."""
    produtos = [
        enriquecer_produto(p)
        for p in db.query(ProdutoDB).filter(ProdutoDB.produtor_id == produtor_id).all()
    ]

    leituras = (
        db.query(TelemetriaDB)
        .filter(TelemetriaDB.produtor_id == produtor_id)
        .order_by(TelemetriaDB.timestamp.desc())
        .limit(50)
        .all()
    )
    clima = None
    if leituras:
        n = len(leituras)
        clima = {
            "leituras_consideradas": n,
            "ultima_leitura": {
                "temperatura_ar": leituras[0].temperatura_ar,
                "umidade_ar": leituras[0].umidade_ar,
                "umidade_solo": leituras[0].umidade_solo,
                "horario_local": utc_para_local(leituras[0].timestamp),
            },
            "media_temperatura_ar": round(sum(l.temperatura_ar for l in leituras) / n, 1),
            "media_umidade_ar": round(sum(l.umidade_ar for l in leituras) / n, 1),
            "media_umidade_solo": round(sum(l.umidade_solo for l in leituras) / n, 1),
        }

    alertas = (
        db.query(AlertaDB)
        .filter(AlertaDB.produtor_id == produtor_id, AlertaDB.lido.is_(False))  # só os pendentes
        .order_by(AlertaDB.criado_em.desc())
        .limit(10)
        .all()
    )

    produtor = db.query(ProdutorDB).filter(ProdutorDB.id == produtor_id).first()
    perfil = None
    previsao = "perfil sem localização cadastrada"
    if produtor:
        perfil = {
            "nome": produtor.nome,
            "local": f"{produtor.cidade}-{produtor.uf}",
            "area_hectares": produtor.area_hectares,
            "irrigacao": produtor.irrigacao,
            "tipo_solo": produtor.tipo_solo,
            "culturas": produtor.culturas,
        }
        try:
            previsao = obter_previsao_tempo(produtor)
        except Exception as e:
            print(f"[chat] previsão indisponível: {e}")
            previsao = "previsão do tempo indisponível no momento"

    # Fichas técnicas só das culturas que o produtor tem (estoque, plantios ou perfil) + alertas calculados
    nomes_culturas = [p["nome"] for p in produtos]
    nomes_culturas += [c for (c,) in db.query(PlantioDB.cultura).filter(PlantioDB.produtor_id == produtor_id).all()]
    if produtor and produtor.culturas:
        nomes_culturas += produtor.culturas.split(",")
    fichas_todas = carregar_fichas()
    fichas = {k: fichas_todas[k] for k in dict.fromkeys(chave_cultura(n) for n in nomes_culturas) if k in fichas_todas}
    ultima_leitura = leituras[0] if leituras else None
    previsao_dict = previsao if isinstance(previsao, dict) else None
    # Sem ":=" aqui: numa compreensão ele vaza para a função e sobrescreveria a variável "alertas".
    alertas_agronomicos = {}
    for ficha in fichas.values():
        desvios = avaliar_condicoes(ficha, ultima_leitura, previsao_dict)
        if desvios:
            alertas_agronomicos[ficha["nome"]] = desvios

    contexto = {
        "agora_horario_local": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "hoje_dia_semana": DIAS_SEMANA[date.today().weekday()],
        "perfil_propriedade": perfil or "não cadastrado",
        "previsao_7_dias": previsao,
        "fichas_tecnicas_culturas": fichas,
        "alertas_agronomicos": alertas_agronomicos or "nenhum: sensores e previsão dentro das faixas das fichas",
        "plantios_ativos": [
            enriquecer_plantio(p)
            for p in db.query(PlantioDB)
            .filter(PlantioDB.produtor_id == produtor_id, PlantioDB.status == "Em andamento")
            .all()
        ],
        "plantios_colhidos_recentes": [
            enriquecer_plantio(p)
            for p in db.query(PlantioDB)
            .filter(
                PlantioDB.produtor_id == produtor_id,
                PlantioDB.status != "Em andamento",
                PlantioDB.data_colheita_real >= date.today() - timedelta(days=90),
            )
            .all()
        ],
        "estoque_produtos": produtos,
        "vendas": {
            "resumo_ultimos_90_dias": resumir_vendas(db, produtor_id, 90),
            "receita_mensal": receita_mensal(db, produtor_id, 6),
        },
        "clima_sensores": clima or "sem leituras de sensores ainda",
        "alertas_pendentes": [
            {"tipo": a.tipo, "severidade": a.severidade, "cultura": a.cultura, "mensagem": a.mensagem,
             "horario_local": utc_para_local(a.criado_em)}
            for a in alertas
        ] or "nenhum alerta crítico pendente",
    }
    return json.dumps(contexto, default=str, ensure_ascii=False)


class IAIndisponivel(Exception):
    """Todos os modelos falharam. `mensagem` é o texto amigável para o usuário."""

    def __init__(self, mensagem: str, erro: Exception = None):
        super().__init__(mensagem)
        self.mensagem = mensagem
        self.erro = erro


def gerar_com_ia(contents, system_instruction: str, temperatura: float = 0.3):
    """Chama o Gemini tentando o modelo principal e depois os de reserva.
    Devolve (texto, modelo usado) ou levanta IAIndisponivel."""
    config = types.GenerateContentConfig(system_instruction=system_instruction, temperature=temperatura)
    ultimo_erro = None
    for modelo in [GEMINI_MODEL] + [m for m in GEMINI_MODELOS_RESERVA if m != GEMINI_MODEL]:
        try:
            resposta = get_gemini_client().models.generate_content(model=modelo, contents=contents, config=config)
            return resposta.text, modelo
        except genai_errors.APIError as e:
            ultimo_erro = e
            if e.code in (400, 401, 403):  # requisição/chave inválida: trocar de modelo não resolve
                break
        except Exception as e:  # timeout de rede etc. → próximo modelo
            ultimo_erro = e

    print(f"[ia] todos os modelos falharam. Último erro: {ultimo_erro}")
    codigo = getattr(ultimo_erro, "code", None)
    if codigo in (401, 403) or (codigo == 400 and "API key" in str(ultimo_erro)):
        msg = "A chave da IA é inválida ou expirou. Verifique o GEMINI_API_KEY."
    elif codigo == 400:
        msg = "A IA não conseguiu processar essa pergunta. Tente reformular."
    else:
        msg = "A IA está sobrecarregada no momento. Tente novamente em alguns segundos."
    raise IAIndisponivel(msg, ultimo_erro)


@app.post("/api/v1/chat")
def conversar_com_assistente(payload: ChatInput, db: Session = Depends(get_db)):
    contexto = montar_contexto(db, payload.produtor_id)

    # Histórico curto (últimas 10 mensagens) + pergunta atual
    contents = [
        types.Content(role=m.papel, parts=[types.Part(text=m.texto)])
        for m in payload.historico[-10:]
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=payload.mensagem)]))

    inicio = _time.monotonic()
    interacao = ChatInteracaoDB(produtor_id=payload.produtor_id, pergunta=payload.mensagem, tela=payload.tela)
    try:
        texto, modelo = gerar_com_ia(
            contents,
            f"{SYSTEM_PROMPT}{instrucao_tela(payload.tela)}\n\nDADOS ATUAIS DO PRODUTOR (JSON):\n{contexto}",
        )
        interacao.resposta = texto or "Não consegui gerar uma resposta agora."
        interacao.modelo, interacao.sucesso = modelo, True
    except IAIndisponivel as e:
        interacao.sucesso, interacao.erro = False, e.mensagem
    finally:
        interacao.duracao_ms = int((_time.monotonic() - inicio) * 1000)
        db.add(interacao)
        db.commit()

    if not interacao.sucesso:
        raise HTTPException(status_code=503, detail=interacao.erro)
    return {"resposta": interacao.resposta, "interacao_id": interacao.id}


# --- Histórico de perguntas e avaliação (👍/👎) ---
class FeedbackInput(BaseModel):
    nota: Literal[1, -1]
    comentario: Optional[str] = Field(default=None, max_length=500)


def interacao_para_dict(i: ChatInteracaoDB) -> dict:
    return {
        "id": i.id,
        "pergunta": i.pergunta,
        "resposta": i.resposta,
        "modelo": i.modelo,
        "sucesso": i.sucesso,
        "erro": i.erro,
        "duracao_ms": i.duracao_ms,
        "feedback": i.feedback,
        "comentario": i.comentario,
        "tela": i.tela,
        "criado_em": marcar_como_utc(i.criado_em),
    }


@app.post("/api/v1/chat/{interacao_id}/feedback")
def avaliar_resposta(interacao_id: int, payload: FeedbackInput, db: Session = Depends(get_db)):
    interacao = db.query(ChatInteracaoDB).filter(ChatInteracaoDB.id == interacao_id).first()
    if not interacao:
        raise HTTPException(status_code=404, detail="Interação não encontrada")
    if not interacao.sucesso:
        raise HTTPException(status_code=400, detail="Só respostas da IA podem ser avaliadas")
    interacao.feedback = payload.nota
    # O comentário só vale junto do 👎; trocar para 👍 descarta o antigo
    if payload.nota == -1:
        interacao.comentario = (payload.comentario or "").strip() or None
    else:
        interacao.comentario = None
    db.commit()
    return interacao_para_dict(interacao)


@app.get("/api/v1/chat/interacoes")
def listar_interacoes(
    produtor_id: int = 1,
    avaliacao: Optional[Literal["positivas", "negativas", "sem_avaliacao", "falhas"]] = None,
    limite: int = 50,
    db: Session = Depends(get_db),
):
    query = db.query(ChatInteracaoDB).filter(ChatInteracaoDB.produtor_id == produtor_id)
    if avaliacao == "positivas":
        query = query.filter(ChatInteracaoDB.feedback == 1)
    elif avaliacao == "negativas":
        query = query.filter(ChatInteracaoDB.feedback == -1)
    elif avaliacao == "sem_avaliacao":
        query = query.filter(ChatInteracaoDB.feedback.is_(None), ChatInteracaoDB.sucesso.is_(True))
    elif avaliacao == "falhas":
        query = query.filter(ChatInteracaoDB.sucesso.is_(False))
    itens = query.order_by(ChatInteracaoDB.criado_em.desc(), ChatInteracaoDB.id.desc()).limit(limite).all()
    return [interacao_para_dict(i) for i in itens]


@app.get("/api/v1/chat/estatisticas")
def estatisticas_chat(produtor_id: int = 1, dias: int = 30, db: Session = Depends(get_db)):
    desde = datetime.utcnow() - timedelta(days=dias)
    itens = (
        db.query(ChatInteracaoDB)
        .filter(ChatInteracaoDB.produtor_id == produtor_id, ChatInteracaoDB.criado_em >= desde)
        .all()
    )
    respondidas = [i for i in itens if i.sucesso]
    positivas = sum(1 for i in itens if i.feedback == 1)
    negativas = sum(1 for i in itens if i.feedback == -1)

    # Perguntas por dia (horário local), dos últimos 14 dias, inclusive os sem perguntas
    hoje_local = datetime.now().date()
    por_dia = {(hoje_local - timedelta(days=d)).isoformat(): 0 for d in range(13, -1, -1)}
    for i in itens:
        dia = marcar_como_utc(i.criado_em).astimezone().date().isoformat()
        if dia in por_dia:
            por_dia[dia] += 1

    return {
        "periodo_dias": dias,
        "total": len(itens),
        "respondidas": len(respondidas),
        "falhas": len(itens) - len(respondidas),
        "avaliadas": positivas + negativas,
        "positivas": positivas,
        "negativas": negativas,
        "satisfacao_percentual": round(positivas / (positivas + negativas) * 100, 1) if positivas + negativas else None,
        "tempo_medio_s": round(sum(i.duracao_ms for i in respondidas) / len(respondidas) / 1000, 1) if respondidas else None,
        "perguntas_por_dia": [{"data": d, "total": n} for d, n in por_dia.items()],
        # De onde os produtores perguntam (aba aberta), da mais para a menos usada
        "por_tela": sorted(
            ({"tela": t, "total": sum(1 for i in itens if i.tela == t)} for t in {i.tela for i in itens}),
            key=lambda x: (-x["total"], x["tela"] or ""),
        ),
    }


# ==========================================
# 7. RESUMO DO DIA
# ==========================================
RESUMO_VALIDADE = timedelta(hours=3)  # depois disso (ou ao virar o dia) a IA gera um novo

INSTRUCOES_RESUMO = """TAREFA AGORA: gerar o RESUMO DO DIA que aparece no topo do sistema quando o produtor abre o painel.
- No máximo 5 tópicos curtos em Markdown (lista com "-"), do mais urgente para o menos urgente.
- Cada tópico começa com um rótulo em negrito: **Estoque:**, **Alertas:**, **Clima:**, **Colheita:**, **Vendas:**.
- Cubra, quando houver: itens do estoque vencendo, alertas pendentes, chuva/irrigação dos próximos dias (com dia da
  semana), colheitas próximas e um destaque de vendas (tendência ou melhor produto).
- O último tópico é **Ação do dia:** com UMA recomendação prática e concreta.
- Sem saudação, sem título e sem conclusão. Use só números que estão nos dados."""


def formatar_brl(valor: float) -> str:
    """1234.5 -> 'R$ 1.234,50'"""
    return "R$ " + f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def resumo_por_regras(db: Session, produtor_id: int) -> str:
    """Resumo sem IA (quando o Gemini está indisponível): os mesmos tópicos, montados pelas regras."""
    topicos = []

    vencendo = [enriquecer_produto(p) for p in db.query(ProdutoDB).filter(ProdutoDB.produtor_id == produtor_id).all()]
    vencendo = sorted((p for p in vencendo if p["status_validade"] == "CRITICO"), key=lambda p: p["dias_para_vencer"])
    if vencendo:
        itens = ", ".join(f"{p['nome']} ({p['quantidade']:g} {p['unidade']}, {p['dias_para_vencer']} dias)" for p in vencendo)
        topicos.append(f"- **Estoque:** vencendo em até 3 dias: {itens}.")

    pendentes = db.query(AlertaDB).filter(AlertaDB.produtor_id == produtor_id, AlertaDB.lido.is_(False)).count()
    if pendentes:
        topicos.append(f"- **Alertas:** {pendentes} alerta(s) crítico(s) pendente(s) na aba Clima & IoT.")

    produtor = db.query(ProdutorDB).filter(ProdutorDB.id == produtor_id).first()
    if produtor:
        try:
            previsao = obter_previsao_tempo(produtor)
            chuvosos = [d["dia_semana"] for d in previsao["dias"] if (d["prob_chuva_percentual"] or 0) >= 60]
            texto = f"{previsao['chuva_total_mm']} mm de chuva previstos em 7 dias"
            texto += f" (chuva provável: {', '.join(chuvosos)})." if chuvosos else "."
            topicos.append(f"- **Clima:** {texto}")
        except Exception:
            pass

    hoje = date.today()
    proximas = [
        enriquecer_plantio(p)
        for p in db.query(PlantioDB).filter(PlantioDB.produtor_id == produtor_id, PlantioDB.status == "Em andamento").all()
    ]
    proximas = [p for p in proximas if p["inicio_colheita_previsto"] <= hoje + timedelta(days=7) and p["fim_colheita_previsto"] >= hoje]
    if proximas:
        itens = ", ".join(f"{p['cultura']} ({p['talhao']}, a partir de {p['inicio_colheita_previsto']:%d/%m})" for p in proximas)
        topicos.append(f"- **Colheita:** nos próximos 7 dias: {itens}.")

    vendas = resumir_vendas(db, produtor_id, 30)["produtos"]
    if vendas:
        melhor = vendas[0]
        topicos.append(f"- **Vendas:** maior lucro em 30 dias: {melhor['produto']} ({formatar_brl(melhor['lucro'])}).")

    if vencendo:
        topicos.append(f"- **Ação do dia:** priorizar a venda de {vencendo[0]['nome']}, que vence primeiro.")
    return "\n".join(topicos) or "- Nada urgente hoje."


@app.get("/api/v1/resumo-dia")
def resumo_do_dia(produtor_id: int = 1, atualizar: bool = False, db: Session = Depends(get_db)):
    """Resumo do dia gerado pela IA (com cache de 3 h no banco). Se a IA falhar, devolve um resumo por regras."""
    agora = datetime.utcnow()
    ultimo = (
        db.query(ResumoDiaDB)
        .filter(ResumoDiaDB.produtor_id == produtor_id)
        .order_by(ResumoDiaDB.gerado_em.desc())
        .first()
    )
    mesmo_dia = ultimo and utc_para_local(ultimo.gerado_em)[:10] == datetime.now().strftime("%d/%m/%Y")
    if ultimo and not atualizar and mesmo_dia and agora - ultimo.gerado_em < RESUMO_VALIDADE:
        return {"texto": ultimo.texto, "fonte": "ia", "modelo": ultimo.modelo,
                "gerado_em": marcar_como_utc(ultimo.gerado_em), "em_cache": True}

    contexto = montar_contexto(db, produtor_id)
    contents = [types.Content(role="user", parts=[types.Part(text="Gere o resumo do dia.")])]
    try:
        texto, modelo = gerar_com_ia(
            contents, f"{SYSTEM_PROMPT}\n\n{INSTRUCOES_RESUMO}\n\nDADOS ATUAIS DO PRODUTOR (JSON):\n{contexto}"
        )
    except IAIndisponivel as e:
        # Não guarda: na próxima abertura tenta a IA de novo.
        return {"texto": resumo_por_regras(db, produtor_id), "fonte": "regras", "modelo": None,
                "gerado_em": marcar_como_utc(agora), "em_cache": False, "aviso": e.mensagem}

    resumo = ResumoDiaDB(produtor_id=produtor_id, texto=texto or resumo_por_regras(db, produtor_id), modelo=modelo, gerado_em=agora)
    db.add(resumo)
    db.commit()
    return {"texto": resumo.texto, "fonte": "ia", "modelo": modelo, "gerado_em": marcar_como_utc(agora), "em_cache": False}

import argparse
import math
import random
import time
from datetime import datetime, timezone
import requests

API_URL = "http://localhost:8000/api/v1/telemetria"
SENSOR_ID = "estacao-campo-01"
PRODUTOR_ID = 1


def gerar_leitura(anomalia: bool = False) -> dict:
    agora = datetime.now(timezone.utc)

    if anomalia:
        return {
            "produtor_id": PRODUTOR_ID,
            "sensor_id": SENSOR_ID,
            "temperatura_ar": round(random.uniform(36.0, 39.5), 1),
            "umidade_ar": round(random.uniform(22.0, 28.0), 1),
            "umidade_solo": round(random.uniform(15.0, 22.0), 1),
            "timestamp": agora.isoformat()
        }

    # Gera variações suaves a cada envio para o gráfico ficar dinâmico na demo
    oscilacao = math.sin(time.time() / 15.0)
    temperatura_ar = 25.0 + (3.5 * oscilacao) + random.uniform(-0.5, 0.5)
    umidade_ar = 65.0 - (8.0 * oscilacao) + random.uniform(-1.5, 1.5)
    umidade_solo = 48.0 - (4.0 * oscilacao) + random.uniform(-1.0, 1.0)

    return {
        "produtor_id": PRODUTOR_ID,
        "sensor_id": SENSOR_ID,
        "temperatura_ar": round(temperatura_ar, 1),
        "umidade_ar": round(umidade_ar, 1),
        "umidade_solo": round(umidade_solo, 1),
        "timestamp": agora.isoformat()
    }


def enviar(payload: dict, url: str):
    try:
        res = requests.post(url, json=payload, timeout=5)
        if res.status_code in (200, 201):
            print(
                f"[ENVIADO] Temp: {payload['temperatura_ar']}°C | "
                f"Umid. Ar: {payload['umidade_ar']}% | "
                f"Solo: {payload['umidade_solo']}%"
            )
        else:
            print(f"[ERRO {res.status_code}] {res.text}")
    except requests.exceptions.RequestException as e:
        print(f"[OFFLINE] Aguardando API em {url}... ({e})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Simulador IoT Demo")
    parser.add_argument("--url", type=str, default=API_URL, help="Endpoint da API")
    parser.add_argument("--intervalo", type=int, default=5, help="Intervalo em segundos")
    parser.add_argument("--anomalia", action="store_true", help="Envia 1 alerta crítico imediato")
    args = parser.parse_args()

    if args.anomalia:
        print("--- Disparando leitura CRÍTICA ---")
        enviar(gerar_leitura(anomalia=True), args.url)
    else:
        print(f"--- Simulador Demo rodando (1 leitura a cada {args.intervalo}s). Ctrl+C para parar ---")
        try:
            while True:
                enviar(gerar_leitura(anomalia=False), args.url)
                time.sleep(args.intervalo)
        except KeyboardInterrupt:
            print("\nSimulador encerrado.")
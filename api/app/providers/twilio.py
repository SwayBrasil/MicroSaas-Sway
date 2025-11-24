# app/providers/twilio.py
import os
import time
from twilio.rest import Client

# 🔧 Configurações de ambiente
ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
FROM = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+5561947565536")

# Limite de caracteres do Twilio (1600 para mensagens concatenadas)
TWILIO_MAX_LENGTH = 1600

_client = Client(ACCOUNT_SID, AUTH_TOKEN)


def _fmt_whatsapp(num: str) -> str:
    """Garante que o número esteja no formato whatsapp:+55DDDNNNNNNN"""
    n = num.strip()
    if n.startswith("whatsapp:"):
        return n
    if n.startswith("+"):
        return f"whatsapp:{n}"
    return f"whatsapp:+{n}"


def _split_message(text: str, max_length: int = TWILIO_MAX_LENGTH) -> list[str]:
    """
    Divide uma mensagem longa em chunks menores, respeitando o limite do Twilio.
    Tenta quebrar em quebras de linha ou espaços para evitar cortar palavras.
    """
    if len(text) <= max_length:
        return [text]
    
    chunks = []
    remaining = text
    
    while len(remaining) > max_length:
        # Tenta encontrar um ponto de quebra ideal (quebra de linha ou espaço)
        chunk = remaining[:max_length]
        
        # Procura pela última quebra de linha no chunk
        last_newline = chunk.rfind('\n')
        # Procura pelo último espaço no chunk (se não houver quebra de linha)
        last_space = chunk.rfind(' ') if last_newline == -1 else -1
        
        # Escolhe o melhor ponto de quebra
        if last_newline != -1:
            split_pos = last_newline + 1
        elif last_space != -1:
            split_pos = last_space + 1
        else:
            # Se não houver quebra natural, corta no limite mesmo
            split_pos = max_length
        
        # Adiciona o chunk e continua com o restante
        chunks.append(remaining[:split_pos].strip())
        remaining = remaining[split_pos:].strip()
    
    # Adiciona o último pedaço
    if remaining:
        chunks.append(remaining)
    
    return chunks


def send_text(to_e164: str, body: str, sender: str = "BOT") -> str:
    """
    Envia mensagem de texto pelo WhatsApp via Twilio.
    Se a mensagem for maior que 1600 caracteres, divide em múltiplas mensagens.
    sender: "BOT" ou "HUMANO" (apenas para log)
    Retorna o SID da primeira mensagem enviada.
    """
    if not ACCOUNT_SID or not AUTH_TOKEN or not FROM:
        raise RuntimeError(
            "❌ TWILIO envs faltando (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM)"
        )

    to = _fmt_whatsapp(to_e164)
    from_ = FROM if FROM.startswith("whatsapp:") else f"whatsapp:{FROM}"

    # Divide a mensagem se necessário
    chunks = _split_message(body, TWILIO_MAX_LENGTH)
    
    if len(chunks) > 1:
        print(f"\033[93m[TWILIO] Mensagem longa detectada ({len(body)} chars), dividindo em {len(chunks)} partes\033[0m")
    
    first_sid = None
    
    # Envia cada chunk
    for i, chunk in enumerate(chunks):
        try:
            msg = _client.messages.create(to=to, from_=from_, body=chunk)
            
            if first_sid is None:
                first_sid = msg.sid
            
            # Log detalhado no terminal
            part_info = f" ({i+1}/{len(chunks)})" if len(chunks) > 1 else ""
            if sender.upper() == "BOT":
                print(f"\033[94m[TWILIO][BOT] → {to}{part_info} | SID={msg.sid} | {len(chunk)} chars\033[0m")  # azul
            else:
                print(f"\033[92m[TWILIO][HUMANO] → {to}{part_info} | SID={msg.sid} | {len(chunk)} chars\033[0m")  # verde
            
            # Pequeno delay entre mensagens para evitar rate limiting (apenas se houver múltiplas partes)
            if i < len(chunks) - 1:
                time.sleep(0.5)  # 500ms entre mensagens
                
        except Exception as e:
            print(f"\033[91m[TWILIO] Erro ao enviar parte {i+1}/{len(chunks)}: {str(e)}\033[0m")
            # Se for a primeira mensagem e falhar, propaga o erro
            if i == 0:
                raise
            # Se for uma mensagem subsequente, apenas loga o erro mas continua
    
    return first_sid or ""

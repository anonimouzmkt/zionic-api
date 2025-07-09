# 🚀 Zionic API

API simples para envio de mensagens WhatsApp.

## 📦 Instalação

```bash
npm install
```

## ⚙️ Configuração

Crie um arquivo `.env` com:

```bash
# Supabase
SUPABASE_URL=https://sua-url-aqui.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_key_aqui

# Evolution API
EVOLUTION_API_URL=https://evowise.anonimouz.com
EVOLUTION_API_KEY=GfwncPVPb2ou4i1DMI9IEAVVR3p0fI7W

# Porta
PORT=3001
```

## 🚀 Executar

```bash
npm start
```

## 📡 Endpoints

### 🧪 Teste
- `GET /` - Verificar se API está funcionando

### 💬 Mensagens de Texto
- `POST /api/messages/send` - Enviar mensagem de texto

### 📎 Mídia (Imagem, Áudio, Vídeo)
- `POST /api/messages/send-media` - Enviar mídia (FormData)

### 💬 Responder Mensagens  
- `POST /api/messages/reply` - Responder mensagem (quoted)

## 📋 Exemplos de Uso

### Enviar Texto
```bash
curl -X POST http://localhost:3001/api/messages/send \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "uuid-da-conversa",
    "message": "Olá! Mensagem via API",
    "instanceName": "nome-da-instancia"
  }'
```

### Enviar Mídia
```bash
curl -X POST http://localhost:3001/api/messages/send-media \
  -F "conversationId=uuid-da-conversa" \
  -F "instanceName=nome-da-instancia" \
  -F "caption=Legenda da imagem" \
  -F "file=@caminho/para/arquivo.jpg"
```

### Responder Mensagem
```bash
curl -X POST http://localhost:3001/api/messages/reply \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "uuid-da-conversa",
    "message": "Resposta à sua mensagem",
    "quotedMessageId": "uuid-da-mensagem-citada",
    "instanceName": "nome-da-instancia"
  }'
``` 

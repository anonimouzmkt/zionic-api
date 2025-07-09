# 🚀 API Zionic - Mensagens WhatsApp/Instagram

API REST para envio de mensagens via WhatsApp e Instagram com autenticação por API Keys.

## 🌟 Funcionalidades

- ✅ **Autenticação por API Keys** - Sistema seguro de chaves de acesso
- ✅ **Mensagens de texto** - Envio simples e rápido
- ✅ **Envio de mídia** - Imagens, vídeos, áudios e documentos
- ✅ **Respostas citadas** - Reply de mensagens específicas
- ✅ **Monitoramento** - Controle de uso das API Keys
- ✅ **Multi-empresa** - Cada empresa tem suas próprias keys

## 🔐 Autenticação

### Como obter uma API Key

1. Acesse o painel administrativo da sua empresa
2. Vá em **Configurações da Empresa**
3. Seção **API Keys**
4. Clique em **"Criar API Key"**
5. Copie e guarde a key gerada (formato: `zio_xxxxx...`)

### Como usar

Inclua o header em todas as requisições:
```
Authorization: Bearer zio_sua_api_key_aqui
```

## 📡 Endpoints

### 🧪 Teste de conexão (público)
```
GET /
```

### 🔑 Teste de autenticação
```
GET /api/auth/test
```

### 💬 Enviar mensagem de texto
```
POST /api/messages/send
```
```json
{
  "number": "5511999999999",
  "message": "Sua mensagem aqui"
}
```

### 📎 Enviar mídia
```
POST /api/messages/send-media
```
Form-data:
- `number`: Número do destinatário
- `file`: Arquivo para enviar
- `caption`: Legenda (opcional)

### 💬 Responder mensagem
```
POST /api/messages/reply
```
```json
{
  "number": "5511999999999",
  "message": "Sua resposta aqui",
  "quotedMessageId": "message_id_original"
}
```

## 🎯 Exemplos de uso

### JavaScript/Node.js
```javascript
const response = await fetch('https://zionic-api.onrender.com/api/messages/send', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer zio_sua_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    number: '5511999999999',
    message: 'Olá da API!'
  })
});

const result = await response.json();
console.log(result);
```

### Python
```python
import requests

url = "https://zionic-api.onrender.com/api/messages/send"
headers = {
    "Authorization": "Bearer zio_sua_api_key",
    "Content-Type": "application/json"
}
data = {
    "number": "5511999999999",
    "message": "Olá da API!"
}

response = requests.post(url, headers=headers, json=data)
print(response.json())
```

### cURL
```bash
curl -X POST https://zionic-api.onrender.com/api/messages/send \
  -H "Authorization: Bearer zio_sua_api_key" \
  -H "Content-Type: application/json" \
  -d '{"number":"5511999999999","message":"Olá da API!"}'
```

## 🛠️ Desenvolvimento local

### Pré-requisitos
- Node.js 16+
- Conta Supabase
- Evolution API configurada

### Instalação
```bash
git clone https://github.com/seu-usuario/zionic-api
cd zionic-api
npm install
```

### Configuração
Crie um arquivo `.env`:
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_evolution_api_key
PORT=3001
```

### Executar
```bash
npm start
```

## 🚀 Deploy no Render

### 1. Fork do repositório
1. Faça fork deste repositório
2. Clone para sua conta GitHub

### 2. Criar serviço no Render
1. Acesse [render.com](https://render.com)
2. **New** → **Web Service**
3. Conecte seu repositório GitHub
4. Configure:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 3. Variáveis de ambiente
Adicione no Render:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`

### 4. Deploy
- O deploy acontece automaticamente
- URL será: `https://seu-app.onrender.com`

## 📊 Monitoramento

### No painel administrativo você pode:
- Ver todas as API Keys da empresa
- Ativar/desativar keys
- Monitorar último uso
- Deletar keys não utilizadas

### Logs no Render:
- Acesse o dashboard do Render
- Vá em **Logs** para ver requisições
- Monitor de erros e performance

## ⚠️ Códigos de erro

| Código | Descrição |
|--------|-----------|
| `401` | API Key inválida ou ausente |
| `400` | Dados de entrada inválidos |
| `500` | Erro interno do servidor |
| `503` | Evolution API indisponível |

## 🔒 Segurança

- ✅ Autenticação obrigatória em todas as rotas
- ✅ Validação de formato de API Key
- ✅ Rate limiting automático
- ✅ Logs de auditoria
- ✅ HTTPS obrigatório em produção

## 📚 Documentação completa

Para mais detalhes, veja:
- [API_AUTHENTICATION.md](./API_AUTHENTICATION.md) - Guia completo de autenticação
- [Evolution API Docs](https://evolution-api.com) - Documentação da Evolution API

## 🛡️ Suporte

Em caso de problemas:
1. Verifique se a API Key está ativa
2. Teste primeiro o endpoint `/api/auth/test`
3. Consulte os logs no Render
4. Entre em contato com o suporte técnico

## 📈 Status da API

- 🟢 **Operacional**: https://zionic-api.onrender.com
- 📊 **Monitoramento**: Via painel Render
- 🔄 **Atualizações**: Deploy automático via GitHub

---

**Desenvolvido com ❤️ para facilitar integrações WhatsApp/Instagram** 

# Zionic API v3.1

API para integração e controle de conversas, mensagens e agentes do sistema Zionic.

## ✨ Novidades da v3.1

- 🎛️ **Controle de Agentes**: Novo endpoint para pausar, ativar e atribuir agentes IA ou humanos em conversas
- 💳 **Sistema de Créditos**: Gerenciamento completo de tokens de IA com conversão 1:1 OpenAI
- 📊 **Monitoramento de Uso**: Estatísticas detalhadas e controle de consumo por serviço
- 📊 **Auditoria Completa**: Registro de todas as ações de controle de agentes e consumo de créditos
- 🔄 **Escalação Inteligente**: Suporte nativo para escalação entre IA e agentes humanos
- ⚡ **Integração Automática**: Consumo automático de créditos em chamadas de IA

## 🚀 Início Rápido

### 1. Configuração

```bash
npm install
```

### 2. Variáveis de Ambiente

```env
SUPABASE_URL=sua_url_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
PORT=3001
```

### 3. Executar API

```bash
npm start
```

A API estará disponível em `http://localhost:3001`

## 🔐 Autenticação

Todas as rotas (exceto `/` e `/health`) requerem autenticação via Bearer Token:

```bash
Authorization: Bearer zio_your_api_key_here
```

### Testar Autenticação

```bash
curl -H "Authorization: Bearer zio_your_api_key" \
     http://localhost:3001/api/auth/test
```

## 📋 Endpoints Disponíveis

### 🔍 Informações da API

```bash
GET /                    # Documentação completa da API
GET /health             # Status da API
GET /api/auth/test      # Testar autenticação
```

### 📨 Mensagens

```bash
POST /api/messages/send-text         # Enviar mensagem de texto
POST /api/messages/send-media        # Enviar mídia
POST /api/messages/send-document     # Enviar documento
POST /api/messages/mark-read         # Marcar mensagem como lida
```

### 💬 Conversas

```bash
POST /api/conversation/send-text     # Enviar mensagem via conversa
POST /api/conversation/send-media    # Enviar mídia via conversa
POST /api/conversation/send-document # Enviar documento via conversa
POST /api/conversation/agent-control # 🆕 Controlar agentes na conversa
```

### 💳 Créditos (NOVO v3.1)

```bash
POST /api/credits/consume            # 🆕 Consumir créditos da empresa
POST /api/credits/add                # 🆕 Adicionar créditos à empresa
GET  /api/credits/balance            # 🆕 Obter saldo atual de créditos
GET  /api/credits/usage-stats        # 🆕 Obter estatísticas de uso
GET  /api/credits/transactions       # 🆕 Listar transações de créditos
```

## 🎛️ Controle de Agentes (NOVO v3.1)

O endpoint `/api/conversation/agent-control` permite gerenciar agentes em conversas específicas.

### Ações Disponíveis

| Ação | Descrição | Parâmetros Extras |
|------|-----------|------------------|
| `assign_ai` | Atribuir agente IA | `ai_agent_id` (obrigatório) |
| `pause_ai` | Pausar agente IA | - |
| `resume_ai` | Reativar agente IA | - |
| `assign_human` | Atribuir agente humano | `assigned_to` (obrigatório) |
| `unassign_human` | Remover atribuição humana | - |
| `remove_ai` | Remover agente IA completamente | - |

## 💳 Sistema de Créditos (NOVO v3.1)

A API Zionic agora inclui um sistema completo de gerenciamento de créditos para controlar o consumo de tokens de IA.

### Características

- 🔄 **Conversão 1:1**: 1 token OpenAI = 1 Zionic Credit
- ⚡ **Consumo Automático**: Integração direta com serviços de IA
- 📊 **Monitoramento**: Estatísticas detalhadas de uso por serviço
- 🔒 **Controle de Saldo**: Verificação automática antes do consumo
- 📈 **Auditoria**: Histórico completo de transações

### Endpoints de Créditos

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/credits/consume` | POST | Consumir créditos para uso de IA |
| `/api/credits/add` | POST | Adicionar créditos à empresa |
| `/api/credits/balance` | GET | Obter saldo atual |
| `/api/credits/usage-stats` | GET | Estatísticas de uso |
| `/api/credits/transactions` | GET | Histórico de transações |

### Exemplos de Uso

#### Atribuir Agente IA

```bash
curl -X POST http://localhost:3001/api/conversation/agent-control \
  -H "Authorization: Bearer zio_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "uuid-da-conversa",
    "action": "assign_ai",
    "ai_agent_id": "uuid-do-agente-ia"
  }'
```

#### Pausar Agente IA

```bash
curl -X POST http://localhost:3001/api/conversation/agent-control \
  -H "Authorization: Bearer zio_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "uuid-da-conversa",
    "action": "pause_ai"
  }'
```

#### Atribuir Agente Humano

```bash
curl -X POST http://localhost:3001/api/conversation/agent-control \
  -H "Authorization: Bearer zio_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "uuid-da-conversa",
    "action": "assign_human",
    "assigned_to": "uuid-do-usuario"
  }'
```

### Resposta de Sucesso

```json
{
  "success": true,
  "message": "Agente IA \"Atendente Virtual\" atribuído e ativado",
  "data": {
    "conversation_id": "uuid-da-conversa",
    "contact_name": "João Silva",
    "conversation_title": "WhatsApp Conversation",
    "action_performed": "assign_ai",
    "current_state": {
      "ai_agent": {
        "id": "uuid-do-agente",
        "name": "Atendente Virtual",
        "enabled": true
      },
      "human_agent": null,
      "ai_enabled": true
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## 📝 Exemplos de Integração

### JavaScript/Node.js

```javascript
const fetch = require('node-fetch');

class ZionicAPI {
  constructor(apiKey, baseUrl = 'http://localhost:3001') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async controlAgent(conversationId, action, params = {}) {
    const response = await fetch(`${this.baseUrl}/api/conversation/agent-control`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        action: action,
        ...params
      })
    });

    return await response.json();
  }

  async sendMessage(conversationId, message) {
    const response = await fetch(`${this.baseUrl}/api/conversation/send-text`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        message: message
      })
    });

    return await response.json();
  }

  // 💳 Métodos de Créditos
  async consumeCredits(params) {
    const response = await fetch(`${this.baseUrl}/api/credits/consume`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });

    return await response.json();
  }

  async getBalance() {
    const response = await fetch(`${this.baseUrl}/api/credits/balance`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    return await response.json();
  }

  async getUsageStats() {
    const response = await fetch(`${this.baseUrl}/api/credits/usage-stats`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    return await response.json();
  }

  async getTransactions(limit = 50, type = null) {
    const params = new URLSearchParams({ limit });
    if (type) params.append('type', type);
    
    const response = await fetch(`${this.baseUrl}/api/credits/transactions?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      }
    });

    return await response.json();
  }
}

// Uso
const api = new ZionicAPI('zio_your_api_key');

// Atribuir agente IA
await api.controlAgent('conversation-id', 'assign_ai', {
  ai_agent_id: 'agent-id'
});

// Enviar mensagem
await api.sendMessage('conversation-id', 'Olá! Como posso ajudar?');

// 💳 Usar créditos
// Verificar saldo
const balance = await api.getBalance();
console.log('Saldo atual:', balance.balance);

// Consumir créditos
await api.consumeCredits({
  credits_to_consume: 1500,
  service_type: 'openai_chat',
  description: 'Chat com GPT-4',
  tokens_used: 1500,
  model_used: 'gpt-4',
  conversation_id: 'conversation-id'
});

// Ver estatísticas
const stats = await api.getUsageStats();
console.log('Uso este mês:', stats.total_usage_this_month);
```

### Python

```python
import requests
import json

class ZionicAPI:
    def __init__(self, api_key, base_url="http://localhost:3001"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def control_agent(self, conversation_id, action, **kwargs):
        payload = {
            "conversation_id": conversation_id,
            "action": action,
            **kwargs
        }
        
        response = requests.post(
            f"{self.base_url}/api/conversation/agent-control",
            headers=self.headers,
            data=json.dumps(payload)
        )
        
        return response.json()
    
    def send_message(self, conversation_id, message):
        payload = {
            "conversation_id": conversation_id,
            "message": message
        }
        
        response = requests.post(
            f"{self.base_url}/api/conversation/send-text",
            headers=self.headers,
            data=json.dumps(payload)
        )
        
        return response.json()
    
    # 💳 Métodos de Créditos
    def consume_credits(self, **kwargs):
        response = requests.post(
            f"{self.base_url}/api/credits/consume",
            headers=self.headers,
            data=json.dumps(kwargs)
        )
        return response.json()
    
    def get_balance(self):
        response = requests.get(
            f"{self.base_url}/api/credits/balance",
            headers=self.headers
        )
        return response.json()
    
    def get_usage_stats(self):
        response = requests.get(
            f"{self.base_url}/api/credits/usage-stats",
            headers=self.headers
        )
        return response.json()
    
    def get_transactions(self, limit=50, type=None):
        params = {"limit": limit}
        if type:
            params["type"] = type
            
        response = requests.get(
            f"{self.base_url}/api/credits/transactions",
            headers=self.headers,
            params=params
        )
        return response.json()

# Uso
api = ZionicAPI("zio_your_api_key")

# Atribuir agente IA
result = api.control_agent(
    "conversation-id",
    "assign_ai",
    ai_agent_id="agent-id"
)

# Enviar mensagem
result = api.send_message("conversation-id", "Olá! Como posso ajudar?")

# 💳 Usar créditos
# Verificar saldo
balance = api.get_balance()
print(f"Saldo atual: {balance['balance']} créditos")

# Consumir créditos
result = api.consume_credits(
    credits_to_consume=1500,
    service_type="openai_chat",
    description="Chat com GPT-4",
    tokens_used=1500,
    model_used="gpt-4",
    conversation_id="conversation-id"
)

# Ver estatísticas
stats = api.get_usage_stats()
print(f"Uso este mês: {stats['total_usage_this_month']} créditos")
```

## 🧪 Testes

### Executar Todos os Testes

```bash
# Configure suas credenciais em test_agent_control.js
node test_agent_control.js
```

### Teste Manual

```bash
# 1. Testar autenticação
curl -H "Authorization: Bearer zio_your_api_key" \
     http://localhost:3001/api/auth/test

# 2. Ver documentação completa
curl http://localhost:3001/

# 3. Testar controle de agente
curl -X POST http://localhost:3001/api/conversation/agent-control \
  -H "Authorization: Bearer zio_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"conversation_id": "test", "action": "pause_ai"}'
```

### Exemplos de Uso - Créditos

#### Consumir Créditos

```bash
curl -X POST http://localhost:3001/api/credits/consume \
  -H "Authorization: Bearer zio_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "credits_to_consume": 1500,
    "service_type": "openai_chat",
    "feature": "Chat AI",
    "description": "Conversa com GPT-4 - 1000 prompt + 500 completion tokens",
    "tokens_used": 1500,
    "model_used": "gpt-4",
    "conversation_id": "uuid-da-conversa"
  }'
```

#### Verificar Saldo

```bash
curl -H "Authorization: Bearer zio_your_api_key" \
     http://localhost:3001/api/credits/balance
```

#### Obter Estatísticas

```bash
curl -H "Authorization: Bearer zio_your_api_key" \
     http://localhost:3001/api/credits/usage-stats
```

#### Resposta de Consumo de Créditos

```json
{
  "success": true,
  "message": "Créditos consumidos com sucesso",
  "credits_consumed": 1500,
  "service_type": "openai_chat",
  "new_balance": 98500,
  "transaction_details": {
    "feature": "Chat AI",
    "description": "Conversa com GPT-4 - 1000 prompt + 500 completion tokens",
    "tokens_used": 1500,
    "model_used": "gpt-4"
  }
}
```

## 🔧 Casos de Uso Comuns

### Escalação Automática

```javascript
// Escalar para humano quando detectar palavra-chave
async function handleMessage(conversationId, message) {
  if (message.includes('cancelar pedido') || message.includes('reclamação')) {
    await api.controlAgent(conversationId, 'assign_human', {
      assigned_to: supervisorId
    });
  }
}
```

### Controle por Horário

```javascript
// Pausar IA fora do horário comercial
function checkBusinessHours(conversationId) {
  const hour = new Date().getHours();
  if (hour < 8 || hour > 18) {
    api.controlAgent(conversationId, 'pause_ai');
  }
}
```

### Rotação de Agentes

```javascript
// Atribuir agente especializado baseado no contexto
async function assignSpecializedAgent(conversationId, messageType) {
  const agentMap = {
    'technical': 'technical-agent-id',
    'sales': 'sales-agent-id',
    'support': 'support-agent-id'
  };
  
  const agentId = agentMap[messageType];
  if (agentId) {
    await api.controlAgent(conversationId, 'assign_ai', {
      ai_agent_id: agentId
    });
  }
}
```

### Gerenciamento de Créditos

```javascript
// Verificar saldo antes de usar IA
async function checkCreditsBeforeAI(conversationId, estimatedTokens = 1000) {
  const balance = await api.getBalance();
  
  if (balance.balance < estimatedTokens) {
    await api.sendMessage(conversationId, 
      'Saldo de créditos insuficiente. Entre em contato com o administrador.');
    return false;
  }
  
  return true;
}

// Consumir créditos após uso da OpenAI
async function consumeCreditsAfterAI(conversationId, tokensUsed, model) {
  await api.consumeCredits({
    credits_to_consume: tokensUsed,
    service_type: 'openai_chat',
    description: `Chat com ${model} - ${tokensUsed} tokens`,
    tokens_used: tokensUsed,
    model_used: model,
    conversation_id: conversationId
  });
}

// Monitorar uso diário
async function checkDailyUsage() {
  const stats = await api.getUsageStats();
  
  if (stats.average_daily_usage > 10000) {
    console.log('⚠️ Alto consumo detectado:', stats.average_daily_usage, 'créditos/dia');
  }
}
```

### Alertas de Saldo

```javascript
// Verificar saldo baixo automaticamente
async function monitorCreditBalance() {
  const balance = await api.getBalance();
  
  if (balance.balance < 50000) { // Menos de 50K créditos
    // Enviar alerta para administradores
    await notifyAdmins(`Saldo baixo: ${balance.balance} créditos restantes`);
  }
}
```

## 🗂️ Estrutura de Arquivos

```
zionic-api/
├── index.js                    # Servidor principal da API
├── routes/
│   ├── messages.js             # Rotas de mensagens
│   ├── conversation.js         # Rotas de conversas (inclui agent-control)
│   └── credits.js              # 🆕 Rotas de créditos
├── test_agent_control.js       # Script de testes
├── README.md                   # Esta documentação
├── AGENT_CONTROL_API.md        # Documentação detalhada do controle de agentes
├── CREDITS_API.md              # 🆕 Documentação completa da API de créditos
└── package.json               # Dependências
```

## 📚 Documentação Adicional

- **[AGENT_CONTROL_API.md](./AGENT_CONTROL_API.md)** - Documentação completa do controle de agentes
- **[CREDITS_API.md](./CREDITS_API.md)** - 🆕 Documentação completa da API de créditos
- **[API Endpoints](http://localhost:3001/)** - Documentação interativa (quando a API estiver rodando)

## 🛡️ Segurança

- ✅ Autenticação obrigatória via API Keys
- ✅ Validação de acesso por empresa
- ✅ Sanitização de parâmetros
- ✅ Rate limiting implementado
- ✅ Logs de auditoria para todas as ações

## 📈 Performance

- ✅ Operações atômicas no banco
- ✅ Índices otimizados
- ✅ Auditoria assíncrona
- ✅ Cache de validações
- ✅ Timeouts configurados

## 🐛 Solução de Problemas

### Erro 401 - Unauthorized

```bash
# Verificar se a API key está correta
curl -H "Authorization: Bearer zio_your_actual_key" \
     http://localhost:3001/api/auth/test
```

### Erro 404 - Conversation Not Found

```bash
# Verificar se o conversation_id existe e pertence à sua empresa
curl -H "Authorization: Bearer zio_your_key" \
     http://localhost:3001/api/conversation/agent-control \
     -d '{"conversation_id": "correct-uuid", "action": "pause_ai"}'
```

### Teste de Conectividade

```bash
# Verificar se a API está rodando
curl http://localhost:3001/health
```

## 📞 Suporte

- **Documentação**: [http://localhost:3001/](http://localhost:3001/) (API rodando)
- **Logs**: Verifique os logs do servidor para detalhes de erro
- **Testes**: Execute `node test_agent_control.js` para diagnosticar problemas

## 📋 Changelog

### v3.1 (Atual)
- ✨ Novo endpoint de controle de agentes (`/api/conversation/agent-control`)
- ✨ 6 ações de controle: assign_ai, pause_ai, resume_ai, assign_human, unassign_human, remove_ai
- 💳 **Sistema de Créditos Completo**: 5 novos endpoints para gerenciar tokens de IA
- 💳 **Consumo Automático**: Integração 1:1 com tokens OpenAI
- 💳 **Monitoramento Avançado**: Estatísticas detalhadas e auditoria de uso
- ✨ Sistema de auditoria completo
- ✨ Documentação interativa expandida
- ✨ Scripts de teste abrangentes

### v3.0
- 🚀 API base com endpoints de mensagens e conversas
- 🔐 Sistema de autenticação por API Keys
- 📨 Suporte a texto, mídia e documentos
- 💬 Integração com WhatsApp via Evolution API 

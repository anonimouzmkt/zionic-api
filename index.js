require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware para disponibilizar supabase nas rotas
app.use((req, res, next) => {
  req.supabase = supabase;
  next();
});

// Middleware de autenticação para API Keys
const authenticateApiKey = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Token de acesso obrigatório',
        message: 'Inclua o header: Authorization: Bearer YOUR_API_KEY'
      });
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer "
    
    if (!apiKey || !apiKey.startsWith('zio_')) {
      console.log('❌ API Key inválida ou formato incorreto:', apiKey?.substring(0, 10) + '...');
      return res.status(401).json({
        error: 'Formato de API Key inválido',
        message: 'API Key deve começar com "zio_"'
      });
    }

    console.log('🔍 Buscando API key:', apiKey.substring(0, 10) + '...');

    // ✅ CORRIGIDO: Buscar API keys em company_settings.api_integrations (SEM JOIN)
    const { data: companySettings, error } = await supabase
      .from('company_settings')
      .select('company_id, api_integrations')
      .not('api_integrations', 'is', null);

    if (error) {
      console.error('❌ Erro ao buscar company_settings:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor'
      });
    }

    console.log(`📊 Encontradas ${companySettings?.length || 0} empresas com API integrations`);

    let validApiKey = null;
    let companyId = null;
    let companyName = null;

    // ✅ CORRIGIDO: Procurar a API key nas configurações corretas
    for (const setting of companySettings) {
      if (setting.api_integrations && setting.api_integrations.api_keys) {
        const apiKeyData = setting.api_integrations.api_keys.find(
          key => key.key === apiKey && key.enabled === true
        );
        
        if (apiKeyData) {
          validApiKey = apiKeyData;
          companyId = setting.company_id;
          
          console.log('✅ API Key encontrada para company:', setting.company_id);
          
          // ✅ Buscar nome da empresa separadamente se necessário
          const { data: companyData } = await supabase
            .from('companies')
            .select('name')
            .eq('id', setting.company_id)
            .single();
          
          companyName = companyData?.name || 'Empresa';
          break;
        }
      }
    }

    if (!validApiKey) {
      console.log('❌ API Key não encontrada ou inativa:', apiKey.substring(0, 10) + '...');
      return res.status(401).json({
        error: 'API Key inválida ou inativa',
        message: 'Verifique se a API Key está correta e ativa'
      });
    }

    // ✅ CORRIGIDO: Atualizar last_used_at no local correto
    const updatedApiKeys = companySettings
      .find(cs => cs.company_id === companyId)
      .api_integrations.api_keys.map(key => 
        key.key === apiKey 
          ? { ...key, last_used_at: new Date().toISOString() }
          : key
      );

    const updatedApiIntegrations = {
      ...companySettings.find(cs => cs.company_id === companyId).api_integrations,
      api_keys: updatedApiKeys
    };

    await supabase
      .from('company_settings')
      .update({ api_integrations: updatedApiIntegrations })
      .eq('company_id', companyId);

    // Adicionar informações da empresa na requisição
    req.company = {
      id: companyId,
      name: companyName
    };
    req.apiKey = validApiKey;

    next();

  } catch (error) {
    console.error('Erro no middleware de autenticação:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor'
    });
  }
};

// Importar rotas
const messageRoutes = require('./routes/messages');
const conversationRoutes = require('./routes/conversation');

// Rota de teste
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Zionic funcionando!',
    version: '3.1',
    endpoints: {
      messages: '/api/messages',
      conversation: '/api/conversation',
      auth_test: '/api/auth/test'
    },
    available_routes: {
      authentication: {
        test: 'GET /api/auth/test - Testar autenticação'
      },
      messages: {
        send_text: 'POST /api/messages/send-text - Enviar mensagem de texto',
        send_media: 'POST /api/messages/send-media - Enviar mídia',
        send_document: 'POST /api/messages/send-document - Enviar documento',
        mark_read: 'POST /api/messages/mark-read - Marcar como lida'
      },
      conversation: {
        send_text: 'POST /api/conversation/send-text - Enviar mensagem via conversa',
        send_media: 'POST /api/conversation/send-media - Enviar mídia via conversa',
        send_document: 'POST /api/conversation/send-document - Enviar documento via conversa',
        agent_control: 'POST /api/conversation/agent-control - Pausar ou atribuir agentes'
      }
    },
    agent_control_actions: {
      assign_ai: 'Atribuir agente IA à conversa',
      pause_ai: 'Pausar agente IA (mantém atribuição)',
      resume_ai: 'Reativar agente IA',
      assign_human: 'Atribuir agente humano',
      unassign_human: 'Remover atribuição humana',
      remove_ai: 'Remover agente IA completamente'
    },
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer YOUR_API_KEY',
      api_key_format: 'zio_xxxxxxxxxx',
      note: 'Todas as rotas exceto / e /health requerem autenticação'
    },
    examples: {
      agent_control: {
        assign_ai: {
          url: 'POST /api/conversation/agent-control',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            conversation_id: 'uuid-da-conversa',
            action: 'assign_ai',
            ai_agent_id: 'uuid-do-agente-ia'
          }
        },
        pause_ai: {
          url: 'POST /api/conversation/agent-control',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            conversation_id: 'uuid-da-conversa',
            action: 'pause_ai'
          }
        },
        assign_human: {
          url: 'POST /api/conversation/agent-control',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            conversation_id: 'uuid-da-conversa',
            action: 'assign_human',
            assigned_to: 'uuid-do-usuario'
          }
        }
      }
    }
  });
});

// Rota de health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'API funcionando normalmente',
    timestamp: new Date().toISOString(),
    version: '3.1'
  });
});

// Rota para testar autenticação
app.get('/api/auth/test', authenticateApiKey, (req, res) => {
  res.json({ 
    message: 'Autenticação bem-sucedida!',
    company: req.company,
    apiKey: {
      name: req.apiKey.name,
      created_at: req.apiKey.created_at,
      last_used_at: req.apiKey.last_used_at
    }
  });
});

// Usar rotas (com autenticação)
app.use('/api/messages', authenticateApiKey, messageRoutes);
app.use('/api/conversation', authenticateApiKey, conversationRoutes);

app.listen(port, () => {
  console.log(`🚀 API rodando na porta ${port}`);
}); 

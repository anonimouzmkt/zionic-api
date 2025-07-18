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
const calendarRoutes = require('./routes/calendar');
const leadsRoutes = require('./routes/leads');
const pipelinesRoutes = require('./routes/pipelines');
const columnsRoutes = require('./routes/columns');
const creditsRoutes = require('./routes/credits');
const attachmentRoutes = require('./routes/attachments');

// Rota de teste
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Zionic funcionando!',
    version: '3.2',
    endpoints: {
      messages: '/api/messages',
      conversation: '/api/conversation',
      calendar: '/api/calendar',
      leads: '/api/leads',
      attachments: '/api/leads/attachments',
      pipelines: '/api/pipelines',
      columns: '/api/columns',
      credits: '/api/credits',
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
        send_image: 'POST /api/conversation/send-image - Enviar imagem via URL',
        send_image_base64: 'POST /api/conversation/send-image-base64 - Enviar imagem via base64',
        send_audio: 'POST /api/conversation/send-audio - Enviar áudio via URL',
        send_audio_base64: 'POST /api/conversation/send-audio-base64 - Enviar áudio via base64',
        send_video: 'POST /api/conversation/send-video - Enviar vídeo via URL',
        send_document: 'POST /api/conversation/send-document - Enviar documento via URL',
        upload_image: 'POST /api/conversation/upload-image - Upload e envio de imagem',
        upload_audio: 'POST /api/conversation/upload-audio - Upload e envio de áudio',
        upload_video: 'POST /api/conversation/upload-video - Upload e envio de vídeo',
        upload_document: 'POST /api/conversation/upload-document - Upload e envio de documento',
        mark_read: 'POST /api/conversation/mark-read - Marcar mensagem como lida',
        agent_control: 'POST /api/conversation/agent-control - Pausar ou atribuir agentes'
      },
      calendar: {
        availability: 'GET /api/calendar/availability/:date - Verificar disponibilidade de horário',
        schedule: 'POST /api/calendar/schedule - Agendar horário',
        list: 'GET /api/calendar/appointments - Listar agendamentos',
        update: 'PUT /api/calendar/appointments/:id - Atualizar agendamento',
        delete: 'DELETE /api/calendar/appointments/:id - Deletar agendamento'
      },
      leads: {
        list: 'GET /api/leads - Listar todos os leads',
        get: 'GET /api/leads/:id - Obter lead específico',
        create: 'POST /api/leads - Criar novo lead',
        update: 'PUT /api/leads/:id - Atualizar lead',
        delete: 'DELETE /api/leads/:id - Deletar lead',
        move: 'POST /api/leads/:id/move - Mover lead entre colunas',
        column_leads: 'GET /api/leads/column/:column_id - Listar leads de uma coluna',
        add_attachment: 'POST /api/leads/attachments/:id - Anexar documento via base64',
        list_attachments: 'GET /api/leads/attachments/:id - Listar anexos de um lead',
        delete_attachment: 'DELETE /api/leads/attachments/:id/:attachment_id - Deletar anexo'
      },
      pipelines: {
        list: 'GET /api/pipelines - Listar pipelines',
        get: 'GET /api/pipelines/:id - Obter pipeline específico',
        default: 'GET /api/pipelines/default/info - Obter pipeline padrão',
        columns: 'GET /api/pipelines/:id/columns - Listar colunas de um pipeline',
        all_columns: 'GET /api/pipelines/columns/all - Listar todas as colunas',
        stats: 'GET /api/pipelines/:id/stats - Estatísticas do pipeline'
      },
      columns: {
        list: 'GET /api/columns - Listar todas as colunas',
        get: 'GET /api/columns/:id - Obter coluna específica',
        leads: 'GET /api/columns/:id/leads - Listar leads de uma coluna'
      },
      credits: {
        consume: 'POST /api/credits/consume - Consumir créditos da empresa',
        add: 'POST /api/credits/add - Adicionar créditos à empresa',
        balance: 'GET /api/credits/balance - Obter saldo atual de créditos',
        usage_stats: 'GET /api/credits/usage-stats - Obter estatísticas de uso',
        transactions: 'GET /api/credits/transactions - Listar transações de créditos'
      },
      attachments: {
        add: 'POST /api/leads/attachments/:leadId - Anexar documento via base64',
        list: 'GET /api/leads/attachments/:leadId - Listar anexos do lead',
        delete: 'DELETE /api/leads/attachments/:leadId/:attachmentId - Deletar anexo'
      }
    },
    lead_attachments: {
      supported_categories: ['document', 'image', 'contract', 'proposal', 'other'],
      supported_formats: {
        documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
        images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        spreadsheets: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        presentations: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
      },
      max_file_size: '50MB',
      storage_location: 'Supabase Storage bucket "media"',
      storage_path_pattern: 'lead-attachments/{company_id}/lead_{lead_id}_{timestamp}_{filename}',
      soft_delete: true,
             api_access: {
         add: 'POST /api/leads/attachments/:id - Upload via base64',
         list: 'GET /api/leads/attachments/:id - Listar todos anexos',
         delete: 'DELETE /api/leads/attachments/:id/:attachment_id - Remover anexo'
       },
      preview_support: 'Arquivos podem ser visualizados no frontend via modal (PDFs, imagens, texto)',
      note: 'Arquivos são convertidos de base64 para buffer e salvos com URL pública acessível. Metadata inclui informações da API Key usada.'
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
      },
      calendar: {
        check_availability: {
          url: 'GET /api/calendar/availability/2024-07-15?start_hour=08:00&end_hour=18:00',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        },
        schedule_appointment: {
          url: 'POST /api/calendar/schedule',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            title: 'Reunião com Cliente',
            description: 'Apresentação do produto',
            start_time: '2024-07-15T14:00:00.000Z',
            end_time: '2024-07-15T15:00:00.000Z',
            location: 'Escritório',
            attendees: ['cliente@empresa.com'],
            lead_id: 'uuid-do-lead',
            create_meet: true
          }
        },
        list_appointments: {
          url: 'GET /api/calendar/appointments?date=2024-07-15&status=scheduled',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        }
      },
      leads: {
        list_leads: {
          url: 'GET /api/leads?status=new&priority=high&search=empresa',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        },
        create_lead: {
          url: 'POST /api/leads',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            title: 'Novo Lead',
            description: 'Lead interessado em nosso produto',
            estimated_value: 5000,
            priority: 'high',
            source: 'website',
            contact_name: 'João Silva',
            contact_email: 'joao@empresa.com',
            contact_phone: '+5511999999999',
            tags: ['quente', 'produto-a']
          }
        },
        move_lead: {
          url: 'POST /api/leads/lead-uuid/move',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            column_id: 'column-uuid',
            position: 0
          }
        },
                 add_attachment: {
           url: 'POST /api/leads/attachments/lead-uuid',
           headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            file_base64: 'JVBERi0xLjQKJcOkw7zDtsO...', // PDF em base64
            file_name: 'contrato.pdf',
            file_type: 'application/pdf',
            description: 'Contrato assinado pelo cliente',
            category: 'contract'
          },
          response: {
            success: true,
            message: 'Anexo adicionado com sucesso ao lead',
            data: {
              attachment_id: 'uuid-do-anexo',
              lead_id: 'uuid-do-lead',
              lead_title: 'Nome do Lead',
              file_name: 'contrato.pdf',
              file_type: 'application/pdf',
              file_size: 1024000,
              file_size_formatted: '1000 KB',
              file_url: 'https://projeto.supabase.co/storage/v1/object/public/media/lead-attachments/...',
              category: 'contract',
              description: 'Contrato assinado pelo cliente',
              uploaded_at: '2024-01-15T10:30:00Z',
              uploaded_via: 'api'
                         }
           }
         },
         list_attachments: {
           url: 'GET /api/leads/attachments/lead-uuid',
           headers: { 'Authorization': 'Bearer zio_your_api_key' },
           response: {
             success: true,
             data: {
               lead_id: 'uuid-do-lead',
               lead_title: 'Nome do Lead',
               attachments_count: 2,
               attachments: [
                 {
                   attachment_id: 'uuid-anexo-1',
                   file_name: 'contrato.pdf',
                   file_type: 'application/pdf',
                   file_size: 1024000,
                   file_size_formatted: '1000 KB',
                   file_url: 'https://projeto.supabase.co/storage/v1/object/public/media/...',
                   description: 'Contrato assinado',
                   category: 'contract',
                   uploaded_by_name: 'API',
                   uploaded_at: '2024-01-15T10:30:00Z',
                   created_at: '2024-01-15T10:30:00Z'
                 }
               ]
             }
           }
         },
         delete_attachment: {
           url: 'DELETE /api/leads/attachments/lead-uuid/attachment-uuid',
           headers: { 'Authorization': 'Bearer zio_your_api_key' },
           response: {
             success: true,
             message: 'Anexo removido com sucesso',
             data: {
               attachment_id: 'uuid-do-anexo',
               lead_id: 'uuid-do-lead',
               file_name: 'contrato.pdf',
               deleted_at: '2024-01-15T11:00:00Z'
             }
           }
         }
      },
      pipelines: {
        list_pipelines: {
          url: 'GET /api/pipelines',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        },
        get_default_pipeline: {
          url: 'GET /api/pipelines/default/info',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        },
        get_pipeline_stats: {
          url: 'GET /api/pipelines/pipeline-uuid/stats',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        }
      },
      columns: {
        list_columns: {
          url: 'GET /api/columns',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        },
        get_column_leads: {
          url: 'GET /api/columns/column-uuid/leads',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        }
      },
      conversation_media: {
        send_image_url: {
          url: 'POST /api/conversation/send-image',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            conversation_id: 'uuid-da-conversa',
            image_url: 'https://exemplo.com/imagem.jpg',
            caption: 'Legenda da imagem'
          }
        },
        send_image_base64: {
          url: 'POST /api/conversation/send-image-base64',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            conversation_id: 'uuid-da-conversa',
            image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
            caption: 'Imagem enviada via base64',
            filename: 'minha-imagem.jpg'
          }
        },
        send_audio_url: {
          url: 'POST /api/conversation/send-audio',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            conversation_id: 'uuid-da-conversa',
            audio_url: 'https://exemplo.com/audio.mp3',
            delay: 1500
          }
        },
        send_audio_base64: {
          url: 'POST /api/conversation/send-audio-base64',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            conversation_id: 'uuid-da-conversa',
            audio_base64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=',
            delay: 1500,
            sent_via_agent: false
          }
        },
        upload_image: {
          url: 'POST /api/conversation/upload-image',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: 'multipart/form-data com campos: conversation_id, image (arquivo), caption'
        }
      },
      credits: {
        consume_credits: {
          url: 'POST /api/credits/consume',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            credits_to_consume: 1500,
            service_type: 'openai_chat',
            feature: 'Chat AI',
            description: 'Conversa com GPT-4 - 1000 prompt + 500 completion tokens',
            tokens_used: 1500,
            model_used: 'gpt-4',
            conversation_id: 'uuid-da-conversa'
          }
        },
        add_credits: {
          url: 'POST /api/credits/add',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            credits_to_add: 100000,
            description: 'Recarga de créditos - Pacote 100K',
            reference: 'stripe_payment_intent_123'
          }
        },
        get_balance: {
          url: 'GET /api/credits/balance',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        },
        get_usage_stats: {
          url: 'GET /api/credits/usage-stats',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        },
        list_transactions: {
          url: 'GET /api/credits/transactions?limit=20&type=usage',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        }
      },
      attachments: {
        add_attachment: {
          url: 'POST /api/leads/attachments/lead-uuid',
          headers: { 'Authorization': 'Bearer zio_your_api_key' },
          body: {
            file_base64: 'JVBERi0xLjQKJcOkw7zDtsO...',
            file_name: 'proposta_comercial.pdf',
            file_type: 'application/pdf',
            description: 'Proposta comercial para o cliente',
            category: 'proposal'
          }
        },
        list_attachments: {
          url: 'GET /api/leads/attachments/lead-uuid',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
        },
        delete_attachment: {
          url: 'DELETE /api/leads/attachments/lead-uuid/attachment-uuid',
          headers: { 'Authorization': 'Bearer zio_your_api_key' }
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
    version: '3.2'
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
app.use('/api/calendar', authenticateApiKey, calendarRoutes);
app.use('/api/leads', authenticateApiKey, leadsRoutes);
app.use('/api/leads/attachments', authenticateApiKey, attachmentRoutes);
app.use('/api/pipelines', authenticateApiKey, pipelinesRoutes);
app.use('/api/columns', authenticateApiKey, columnsRoutes);
app.use('/api/credits', authenticateApiKey, creditsRoutes);

app.listen(port, () => {
  console.log(`🚀 API rodando na porta ${port}`);
}); 

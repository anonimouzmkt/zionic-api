const express = require('express');
const fetch = require('node-fetch');
const multer = require('multer');
const router = express.Router();

// Configurar multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
});

// ✅ HELPER: Extrair número de telefone limpo
function extractPhoneNumber(number) {
  if (!number) return '';
  
  // Remover caracteres especiais
  let cleanNumber = number.replace(/[^\d]/g, '');
  
  // Se não começar com código do país, assumir Brasil (+55)
  if (!cleanNumber.startsWith('55') && cleanNumber.length === 11) {
    cleanNumber = '55' + cleanNumber;
  }
  
  return cleanNumber;
}

// ✅ HELPER: Encontrar empresa pela API Key
async function findCompanyByApiKey(apiKey, supabase) {
  try {
    // ✅ CORRIGIDO: Buscar API keys em company_settings.api_integrations
    const { data: companySettings, error } = await supabase
      .from('company_settings')
      .select(`
        company_id,
        api_integrations,
        companies!inner(id, name)
      `)
      .not('api_integrations', 'is', null);

    if (error) throw error;

    for (const setting of companySettings || []) {
      if (setting.api_integrations?.api_keys) {
        const validKey = setting.api_integrations.api_keys.find(
          key => key.key === apiKey && key.enabled === true
        );
        
        if (validKey) {
          return {
            success: true,
            company: {
              id: setting.company_id,
              name: setting.companies.name
            },
            apiKeyData: validKey
          };
        }
      }
    }

    return {
      success: false,
      error: 'API Key não encontrada ou inativa'
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ✅ HELPER: Encontrar ou criar communication_integration
async function findOrCreateCommunicationIntegration(companyId, instanceName, whatsappInstanceId, supabase) {
  try {
    // Tentar encontrar integração existente
    const { data: existingIntegration, error: findError } = await supabase
      .from('communication_integrations')
      .select('id')
      .eq('company_id', companyId)
      .eq('provider', 'whatsapp')
      .eq('name', instanceName)
      .single();

    if (!findError && existingIntegration) {
      console.log(`✅ Integration encontrada: ${existingIntegration.id}`);
      return existingIntegration.id;
    }

    // Criar nova integração
    const { data: newIntegration, error: createError } = await supabase
      .from('communication_integrations')
      .insert({
        company_id: companyId,
        provider: 'whatsapp',
        name: instanceName,
        is_active: true,
        connection_status: 'connected',
        config: {
          whatsapp_instance_id: whatsappInstanceId,
          instance_name: instanceName
        }
      })
      .select('id')
      .single();

    if (createError || !newIntegration) {
      throw new Error(`Erro ao criar integração: ${createError?.message}`);
    }

    console.log(`✅ Nova integração criada: ${newIntegration.id}`);
    return newIntegration.id;

  } catch (error) {
    console.error('❌ Erro em findOrCreateCommunicationIntegration:', error);
    throw error;
  }
}

// ✅ HELPER: Encontrar ou criar contato
async function findOrCreateContact(companyId, phoneNumber, name, supabase) {
  try {
    // Buscar contato existente
    const { data: existingContact, error: findError } = await supabase
      .from('contacts')
      .select('id, full_name, phone')
      .eq('company_id', companyId)
      .eq('phone', phoneNumber)
      .single();

    if (!findError && existingContact) {
      console.log(`✅ Contato encontrado: ${existingContact.id}`);
      return {
        success: true,
        contactId: existingContact.id,
        isNew: false
      };
    }

    // Criar novo contato
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || '';

    const { data: newContact, error: createError } = await supabase
      .from('contacts')
      .insert({
        company_id: companyId,
        first_name: firstName,
        last_name: lastName,
        phone: phoneNumber,
        status: 'active',
        source: 'api'
      })
      .select('id')
      .single();

    if (createError || !newContact) {
      throw new Error(`Erro ao criar contato: ${createError?.message}`);
    }

    console.log(`✅ Novo contato criado: ${newContact.id}`);
    return {
      success: true,
      contactId: newContact.id,
      isNew: true
    };

  } catch (error) {
    console.error('❌ Erro em findOrCreateContact:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ✅ HELPER: Encontrar ou criar conversa (MESMO PADRÃO DO WEBHOOK)
async function findOrCreateConversation(companyId, contactId, integrationId, externalId, whatsappInstanceId, supabase) {
  try {
    // Buscar conversa existente pelo external_id e integration_id
    const { data: existingConversation, error: findError } = await supabase
      .from('conversations')
      .select('id, ai_agent_id, ai_enabled')
      .eq('integration_id', integrationId)
      .eq('external_id', externalId)
      .single();

    if (!findError && existingConversation) {
      console.log(`✅ Conversa encontrada: ${existingConversation.id}`);
      return {
        success: true,
        conversationId: existingConversation.id,
        aiAgentId: existingConversation.ai_agent_id,
        aiEnabled: existingConversation.ai_enabled,
        isNew: false
      };
    }

    // Buscar configuração da instância WhatsApp para herdar agente IA
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('ai_agent_id')
      .eq('id', whatsappInstanceId)
      .single();

    // Criar nova conversa
    const { data: newConversation, error: createError } = await supabase
      .from('conversations')
      .insert({
        company_id: companyId,
        contact_id: contactId,
        integration_id: integrationId,
        external_id: externalId,
        title: 'API Conversation',
        status: 'active',
        priority: 'normal',
        first_message_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        ai_agent_id: instance?.ai_agent_id || null,
        ai_enabled: instance?.ai_agent_id ? true : null,
        whatsapp_instance_id: whatsappInstanceId,
        tags: ['api']
      })
      .select('id, ai_agent_id, ai_enabled')
      .single();

    if (createError || !newConversation) {
      throw new Error(`Erro ao criar conversa: ${createError?.message}`);
    }

    console.log(`✅ Nova conversa criada: ${newConversation.id}`);
    return {
      success: true,
      conversationId: newConversation.id,
      aiAgentId: newConversation.ai_agent_id,
      aiEnabled: newConversation.ai_enabled,
      isNew: true
    };

  } catch (error) {
    console.error('❌ Erro em findOrCreateConversation:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ✅ HELPER: Encontrar instância WhatsApp da empresa
async function findWhatsappInstance(companyId, supabase, instanceId = null, instanceName = null) {
  try {
    let query = supabase
      .from('whatsapp_instances')
      .select('id, name, phone_number, api_url, api_key')
      .eq('company_id', companyId)
      .eq('status', 'connected');

    // Se especificou instance_id, buscar por ID específico
    if (instanceId) {
      query = query.eq('id', instanceId);
    }
    // Se especificou instance_name, buscar por nome específico
    else if (instanceName) {
      query = query.eq('name', instanceName);
    }
    // Se não especificou nada, pegar a primeira disponível
    else {
      query = query.limit(1);
    }

    const { data: instance, error } = await query.single();

    if (error || !instance) {
      let errorMsg = 'Nenhuma instância WhatsApp conectada encontrada';
      if (instanceId) {
        errorMsg = `Instância com ID '${instanceId}' não encontrada ou desconectada`;
      } else if (instanceName) {
        errorMsg = `Instância '${instanceName}' não encontrada ou desconectada`;
      } else {
        errorMsg += ' para esta empresa';
      }
      
      return {
        success: false,
        error: errorMsg
      };
    }

    // Usar configurações padrão se não definidas
    const apiUrl = instance.api_url || 'https://evowise.anonimouz.com';
    const apiKey = instance.api_key || 'GfwncPVPb2ou4i1DMI9IEAVVR3p0fI7W';

    return {
      success: true,
      instance: {
        id: instance.id,
        name: instance.name,
        phone_number: instance.phone_number,
        api_url: apiUrl,
        api_key: apiKey
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ✅ HELPER: Salvar mensagem no banco
async function saveMessageToDatabase(conversationId, direction, messageType, content, attachment, sentByAi, externalId, supabase) {
  try {
    const messageData = {
      conversation_id: conversationId,
      direction,
      message_type: messageType,
      content,
      sent_by_ai: sentByAi || false,
      status: 'sent',
      sent_at: new Date().toISOString(),
      external_id: externalId,
      metadata: attachment ? { attachment } : { sent_via: 'api' }
    };

    const { data, error } = await supabase
      .from('messages')
      .insert(messageData)
      .select('id')
      .single();

    if (error) throw error;

    // Atualizar timestamp da conversa
    await supabase
      .from('conversations')
      .update({ 
        last_message_at: new Date().toISOString()
      })
      .eq('id', conversationId);

    return {
      success: true,
      messageId: data.id
    };

  } catch (error) {
    console.error('❌ Erro ao salvar mensagem:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ✅ FUNÇÃO PRINCIPAL: Enviar mensagem de texto
router.post('/send', async (req, res) => {
  try {
    const { number, message, instance_id, instance_name } = req.body;
    const companyId = req.company.id;
    const apiKeyData = req.apiKey;

    // Validações
    if (!number || !message) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: number, message',
        example: {
          number: "5511999999999",
          message: "Sua mensagem aqui",
          instance_id: "uuid-da-instancia (opcional)",
          instance_name: "nome-da-instancia (opcional)"
        }
      });
    }

    // Limpar e validar número
    const cleanNumber = extractPhoneNumber(number);
    if (cleanNumber.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Número de telefone inválido',
        received: number,
        cleaned: cleanNumber,
        example: "5511999999999"
      });
    }

    console.log(`📤 Processando envio de mensagem:`, {
      company: req.company.name,
      apiKey: apiKeyData.name,
      number: cleanNumber,
      messageLength: message.length
    });

    // 1. Encontrar instância WhatsApp da empresa
    const instanceResult = await findWhatsappInstance(companyId, req.supabase, instance_id, instance_name);
    if (!instanceResult.success) {
      return res.status(404).json({
        success: false,
        error: instanceResult.error,
        hint: instance_id || instance_name ? 
          "Verifique se a instância especificada existe e está conectada" : 
          "Certifique-se de ter pelo menos uma instância WhatsApp conectada"
      });
    }

    const instance = instanceResult.instance;
    const externalId = `${cleanNumber}@s.whatsapp.net`;

    // 2. Encontrar ou criar integração
    const integrationId = await findOrCreateCommunicationIntegration(
      companyId,
      instance.name,
      instance.id,
      req.supabase
    );

    // 3. Encontrar ou criar contato
    const contactResult = await findOrCreateContact(
      companyId,
      cleanNumber,
      `Cliente ${cleanNumber}`,
      req.supabase
    );

    if (!contactResult.success) {
      return res.status(500).json({
        success: false,
        error: contactResult.error
      });
    }

    // 4. Encontrar ou criar conversa
    const conversationResult = await findOrCreateConversation(
      companyId,
      contactResult.contactId,
      integrationId,
      externalId,
      instance.id,
      req.supabase
    );

    if (!conversationResult.success) {
      return res.status(500).json({
        success: false,
        error: conversationResult.error
      });
    }

    // 5. Enviar via Evolution API
    const evolutionResponse = await fetch(`${instance.api_url}/message/sendText/${instance.name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': instance.api_key
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: message
      })
    });

    const evolutionResult = await evolutionResponse.json();

    if (!evolutionResponse.ok) {
      throw new Error(evolutionResult.error?.message || 'Erro na Evolution API');
    }

    // 6. Salvar mensagem no banco
    const saveResult = await saveMessageToDatabase(
      conversationResult.conversationId,
      'outbound',
      'text',
      message,
      null,
      false,
      evolutionResult.key?.id,
      req.supabase
    );

    console.log(`✅ Mensagem enviada com sucesso:`, {
      conversationId: conversationResult.conversationId,
      messageId: saveResult.messageId,
      evolutionId: evolutionResult.key?.id,
      instanceUsed: instance.name
    });

    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      data: {
        messageId: saveResult.messageId,
        conversationId: conversationResult.conversationId,
        contactId: contactResult.contactId,
        instanceId: instance.id,
        instanceName: instance.name,
        evolutionId: evolutionResult.key?.id,
        isNewContact: contactResult.isNew,
        isNewConversation: conversationResult.isNew,
        number: cleanNumber,
        content: message,
        sentAt: new Date().toISOString(),
        company: {
          id: companyId,
          name: req.company.name
        },
        apiKey: {
          name: apiKeyData.name,
          used_at: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro no envio:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FUNÇÃO PRINCIPAL: Enviar mídia
router.post('/send-media', upload.single('file'), async (req, res) => {
  try {
    const { number, caption, instance_id, instance_name } = req.body;
    const file = req.file;
    const companyId = req.company.id;
    const apiKeyData = req.apiKey;

    // Validações
    if (!number || !file) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: number, file',
        example: {
          number: "5511999999999",
          file: "arquivo via FormData",
          caption: "Legenda opcional",
          instance_id: "uuid-da-instancia (opcional)",
          instance_name: "nome-da-instancia (opcional)"
        }
      });
    }

    const cleanNumber = extractPhoneNumber(number);
    if (cleanNumber.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'Número de telefone inválido'
      });
    }

    console.log(`📎 Processando envio de mídia:`, {
      company: req.company.name,
      number: cleanNumber,
      fileType: file.mimetype,
      fileSize: `${Math.round(file.size / 1024)} KB`
    });

    // 1. Encontrar instância WhatsApp
    const instanceResult = await findWhatsappInstance(companyId, req.supabase, instance_id, instance_name);
    if (!instanceResult.success) {
      return res.status(404).json({
        success: false,
        error: instanceResult.error,
        hint: instance_id || instance_name ? 
          "Verifique se a instância especificada existe e está conectada" : 
          "Certifique-se de ter pelo menos uma instância WhatsApp conectada"
      });
    }

    const instance = instanceResult.instance;
    const externalId = `${cleanNumber}@s.whatsapp.net`;

    // 2. Processar estrutura de dados (mesmo padrão do send)
    const integrationId = await findOrCreateCommunicationIntegration(
      companyId,
      instance.name,
      instance.id,
      req.supabase
    );

    const contactResult = await findOrCreateContact(
      companyId,
      cleanNumber,
      `Cliente ${cleanNumber}`,
      req.supabase
    );

    if (!contactResult.success) {
      return res.status(500).json({
        success: false,
        error: contactResult.error
      });
    }

    const conversationResult = await findOrCreateConversation(
      companyId,
      contactResult.contactId,
      integrationId,
      externalId,
      instance.id,
      req.supabase
    );

    if (!conversationResult.success) {
      return res.status(500).json({
        success: false,
        error: conversationResult.error
      });
    }

    // 3. Converter arquivo para base64
    const base64Data = file.buffer.toString('base64');

    // 4. Determinar tipo de mídia
    const mimeType = file.mimetype;
    let mediaType = 'document';
    let evolutionEndpoint = 'sendMedia';

    if (mimeType.startsWith('image/')) {
      mediaType = 'image';
    } else if (mimeType.startsWith('video/')) {
      mediaType = 'video';
    } else if (mimeType.startsWith('audio/')) {
      mediaType = 'audio';
      evolutionEndpoint = 'sendWhatsAppAudio';
    }

    // 5. Enviar via Evolution API
    let evolutionResponse;

    if (mediaType === 'audio') {
      evolutionResponse = await fetch(`${instance.api_url}/message/${evolutionEndpoint}/${instance.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': instance.api_key
        },
        body: JSON.stringify({
          number: cleanNumber,
          audiobase64: base64Data
        })
      });
    } else {
      evolutionResponse = await fetch(`${instance.api_url}/message/${evolutionEndpoint}/${instance.name}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': instance.api_key
        },
        body: JSON.stringify({
          number: cleanNumber,
          mediatype: mediaType,
          mimetype: mimeType,
          caption: caption || '',
          media: base64Data,
          fileName: file.originalname
        })
      });
    }

    const evolutionResult = await evolutionResponse.json();

    if (!evolutionResponse.ok) {
      throw new Error(evolutionResult.error?.message || 'Erro ao enviar mídia');
    }

    // 6. Preparar dados do attachment
    const attachmentData = {
      name: file.originalname,
      size: Math.round(file.size / 1024) + ' KB',
      mimetype: mimeType,
      type: mediaType,
      url: `data:${mimeType};base64,${base64Data}` // URL base64 para exibição
    };

    // 7. Salvar mensagem no banco
    const saveResult = await saveMessageToDatabase(
      conversationResult.conversationId,
      'outbound',
      mediaType,
      caption || file.originalname,
      attachmentData,
      false,
      evolutionResult.key?.id,
      req.supabase
    );

    console.log(`✅ Mídia enviada com sucesso:`, {
      conversationId: conversationResult.conversationId,
      messageId: saveResult.messageId,
      mediaType,
      fileSize: attachmentData.size
    });

    res.json({
      success: true,
      message: 'Mídia enviada com sucesso',
      data: {
        messageId: saveResult.messageId,
        conversationId: conversationResult.conversationId,
        contactId: contactResult.contactId,
        instanceId: instance.id,
        instanceName: instance.name,
        evolutionId: evolutionResult.key?.id,
        mediaType: mediaType,
        fileName: file.originalname,
        fileSize: attachmentData.size,
        caption: caption,
        number: cleanNumber,
        sentAt: new Date().toISOString(),
        company: {
          id: companyId,
          name: req.company.name
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro no envio de mídia:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ FUNÇÃO PRINCIPAL: Responder mensagem
router.post('/reply', async (req, res) => {
  try {
    const { number, message, quotedMessageId, instance_id, instance_name } = req.body;
    const companyId = req.company.id;

    // Validações
    if (!number || !message || !quotedMessageId) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: number, message, quotedMessageId',
        example: {
          number: "5511999999999",
          message: "Sua resposta aqui",
          quotedMessageId: "uuid-da-mensagem-original",
          instance_id: "uuid-da-instancia (opcional - usa conversa se omitido)",
          instance_name: "nome-da-instancia (opcional - usa conversa se omitido)"
        }
      });
    }

    const cleanNumber = extractPhoneNumber(number);

    // 1. Buscar mensagem citada
    const { data: quotedMessage, error: quotedError } = await req.supabase
      .from('messages')
      .select('external_id, content, conversation_id')
      .eq('id', quotedMessageId)
      .single();

    if (quotedError || !quotedMessage) {
      return res.status(404).json({
        success: false,
        error: 'Mensagem citada não encontrada',
        quotedMessageId: quotedMessageId
      });
    }

    // 2. Se especificou instância específica, usar ela; senão, usar da conversa
    let instance;
    
    if (instance_id || instance_name) {
      // Usar instância especificada
      const instanceResult = await findWhatsappInstance(companyId, req.supabase, instance_id, instance_name);
      if (!instanceResult.success) {
        return res.status(404).json({
          success: false,
          error: instanceResult.error,
          hint: "Verifique se a instância especificada existe e está conectada"
        });
      }
      instance = {
        name: instanceResult.instance.name,
        api_url: instanceResult.instance.api_url,
        api_key: instanceResult.instance.api_key
      };
    } else {
      // Usar instância da conversa original (comportamento padrão)
      const { data: conversation, error: convError } = await req.supabase
        .from('conversations')
        .select(`
          id,
          company_id,
          whatsapp_instance_id,
          whatsapp_instances!inner(name, api_url, api_key)
        `)
        .eq('id', quotedMessage.conversation_id)
        .eq('company_id', companyId)
        .single();

      if (convError || !conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversa não encontrada'
        });
      }

      instance = conversation.whatsapp_instances;
    }

    const apiUrl = instance.api_url || 'https://evowise.anonimouz.com';
    const apiKey = instance.api_key || 'GfwncPVPb2ou4i1DMI9IEAVVR3p0fI7W';

    // 3. Enviar resposta via Evolution API
    const evolutionResponse = await fetch(`${apiUrl}/message/sendText/${instance.name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: message,
        quoted: {
          key: {
            id: quotedMessage.external_id
          },
          message: {
            conversation: quotedMessage.content
          }
        }
      })
    });

    const evolutionResult = await evolutionResponse.json();

    if (!evolutionResponse.ok) {
      throw new Error(evolutionResult.error?.message || 'Erro ao enviar resposta');
    }

    // 4. Salvar mensagem no banco
    const saveResult = await saveMessageToDatabase(
      quotedMessage.conversation_id,
      'outbound',
      'text',
      message,
      null,
      false,
      evolutionResult.key?.id,
      req.supabase
    );

    console.log(`✅ Resposta enviada com sucesso:`, {
      conversationId: quotedMessage.conversation_id,
      messageId: saveResult.messageId,
      quotedContent: quotedMessage.content.substring(0, 50) + '...'
    });

    res.json({
      success: true,
      message: 'Resposta enviada com sucesso',
      data: {
        messageId: saveResult.messageId,
        conversationId: quotedMessage.conversation_id,
        evolutionId: evolutionResult.key?.id,
        quotedMessage: quotedMessage.content,
        reply: message,
        number: cleanNumber,
        isReply: true,
        sentAt: new Date().toISOString(),
        instanceName: instance.name
      }
    });

  } catch (error) {
    console.error('❌ Erro no envio de resposta:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 

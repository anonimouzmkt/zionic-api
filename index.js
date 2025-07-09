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

// Rota de teste
app.get('/', (req, res) => {
  res.json({ message: 'API Zionic funcionando!' });
});

// Rota para enviar mensagem de texto
app.post('/api/send', async (req, res) => {
  try {
    const { conversationId, message, instanceName } = req.body;

    // Validações
    if (!conversationId || !message || !instanceName) {
      return res.status(400).json({
        success: false,
        error: 'conversationId, message e instanceName são obrigatórios'
      });
    }

    // Buscar dados da conversa
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        contacts(phone, full_name),
        communication_integrations(name, provider)
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      return res.status(404).json({
        success: false,
        error: 'Conversa não encontrada'
      });
    }

    const phoneNumber = conversation.contacts.phone;

    // Enviar via Evolution API
    const evolutionResponse = await fetch(`${process.env.EVOLUTION_API_URL}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.EVOLUTION_API_KEY
      },
      body: JSON.stringify({
        number: phoneNumber,
        text: message
      })
    });

    const evolutionResult = await evolutionResponse.json();

    if (!evolutionResponse.ok) {
      throw new Error(evolutionResult.error?.message || 'Erro ao enviar mensagem');
    }

    // Salvar no banco
    const { data: savedMessage, error: saveError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outbound',
        message_type: 'text',
        content: message,
        sent_by_ai: false,
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: { sent_via: 'api' }
      })
      .select()
      .single();

    if (saveError) {
      console.error('Erro ao salvar mensagem:', saveError);
    }

    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      data: {
        messageId: savedMessage?.id,
        evolutionId: evolutionResult.key?.id
      }
    });

  } catch (error) {
    console.error('Erro no envio:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 API rodando na porta ${port}`);
}); 

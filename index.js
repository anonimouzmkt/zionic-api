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
      return res.status(401).json({
        error: 'Formato de API Key inválido',
        message: 'API Key deve começar com "zio_"'
      });
    }

    // Buscar a company que possui esta API key
    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, name, settings')
      .neq('settings', null);

    if (error) {
      console.error('Erro ao buscar companies:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor'
      });
    }

    let validApiKey = null;
    let companyId = null;

    // Procurar a API key nas configurações das companies
    for (const company of companies) {
      if (company.settings && company.settings.api_keys) {
        const apiKeyData = company.settings.api_keys.find(
          key => key.key === apiKey && key.enabled === true
        );
        
        if (apiKeyData) {
          validApiKey = apiKeyData;
          companyId = company.id;
          break;
        }
      }
    }

    if (!validApiKey) {
      return res.status(401).json({
        error: 'API Key inválida ou inativa',
        message: 'Verifique se a API Key está correta e ativa'
      });
    }

    // Atualizar last_used_at
    const updatedApiKeys = companies
      .find(c => c.id === companyId)
      .settings.api_keys.map(key => 
        key.key === apiKey 
          ? { ...key, last_used_at: new Date().toISOString() }
          : key
      );

    const updatedSettings = {
      ...companies.find(c => c.id === companyId).settings,
      api_keys: updatedApiKeys
    };

    await supabase
      .from('companies')
      .update({ settings: updatedSettings })
      .eq('id', companyId);

    // Adicionar informações da empresa na requisição
    req.company = {
      id: companyId,
      name: companies.find(c => c.id === companyId).name
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

// Rota de teste
app.get('/', (req, res) => {
  res.json({ message: 'API Zionic funcionando!' });
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

app.listen(port, () => {
  console.log(`🚀 API rodando na porta ${port}`);
}); 

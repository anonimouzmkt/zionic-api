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

// Rota para enviar mensagem
app.post('/api/send', async (req, res) => {
  res.json({ message: 'Endpoint de envio - em desenvolvimento' });
});

app.listen(port, () => {
  console.log(`🚀 API rodando na porta ${port}`);
});

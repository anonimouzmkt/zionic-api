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

// Importar rotas
const messageRoutes = require('./routes/messages');

// Rota de teste
app.get('/', (req, res) => {
  res.json({ message: 'API Zionic funcionando!' });
});

// Usar rotas
app.use('/api/messages', messageRoutes);

app.listen(port, () => {
  console.log(`🚀 API rodando na porta ${port}`);
}); 

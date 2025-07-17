const express = require('express');
const router = express.Router();

/**
 * POST /api/credits/consume
 * Atualizar consumo de tokens/créditos da empresa
 */
router.post('/consume', async (req, res) => {
  try {
    const { supabase, company } = req;
    const {
      credits_to_consume,
      service_type,
      feature,
      description,
      user_id,
      tokens_used,
      model_used,
      request_id,
      conversation_id
    } = req.body;

    // ✅ Validação de dados obrigatórios
    if (!credits_to_consume || credits_to_consume <= 0) {
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'credits_to_consume é obrigatório e deve ser maior que 0'
      });
    }

    if (!service_type) {
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'service_type é obrigatório'
      });
    }

    if (!description) {
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'description é obrigatório'
      });
    }

    console.log('💳 Processing credit consumption:', {
      company_id: company.id,
      credits_to_consume,
      service_type,
      feature: feature || 'API External',
      tokens_used,
      model_used
    });

    // ✅ Verificar saldo antes de consumir
    const { data: currentBalance, error: balanceError } = await supabase
      .from('company_credits')
      .select('balance')
      .eq('company_id', company.id)
      .single();

    if (balanceError) {
      console.error('❌ Error checking balance:', balanceError);
      return res.status(500).json({
        error: 'Erro interno',
        message: 'Falha ao verificar saldo de créditos'
      });
    }

    if (!currentBalance || currentBalance.balance < credits_to_consume) {
      return res.status(402).json({
        error: 'Saldo insuficiente',
        message: `Saldo atual: ${currentBalance?.balance || 0} créditos. Necessário: ${credits_to_consume} créditos.`,
        current_balance: currentBalance?.balance || 0,
        required: credits_to_consume
      });
    }

    // ✅ Consumir créditos usando função RPC
    const { data: consumeResult, error: consumeError } = await supabase.rpc('consume_credits', {
      p_company_id: company.id,
      credits_to_consume: credits_to_consume,
      service_type: service_type,
      feature: feature || 'API External',
      description: description,
      user_id: user_id || null,
      tokens_used: tokens_used || null,
      model_used: model_used || null,
      request_id: request_id || conversation_id || null
    });

    if (consumeError) {
      console.error('❌ Error consuming credits:', consumeError);
      return res.status(500).json({
        error: 'Erro ao consumir créditos',
        message: consumeError.message
      });
    }

    if (!consumeResult) {
      return res.status(400).json({
        error: 'Falha no consumo',
        message: 'Não foi possível consumir os créditos solicitados'
      });
    }

    // ✅ Buscar saldo atualizado
    const { data: newBalance, error: newBalanceError } = await supabase
      .from('company_credits')
      .select('balance')
      .eq('company_id', company.id)
      .single();

    if (newBalanceError) {
      console.warn('⚠️ Error fetching updated balance:', newBalanceError);
    }

    console.log('✅ Credits consumed successfully:', {
      company_id: company.id,
      credits_consumed: credits_to_consume,
      new_balance: newBalance?.balance || 'unknown'
    });

    res.json({
      success: true,
      message: 'Créditos consumidos com sucesso',
      credits_consumed: credits_to_consume,
      service_type: service_type,
      new_balance: newBalance?.balance || null,
      transaction_details: {
        feature: feature || 'API External',
        description: description,
        tokens_used: tokens_used || null,
        model_used: model_used || null
      }
    });

  } catch (error) {
    console.error('💥 Error in credit consumption endpoint:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Falha ao processar consumo de créditos'
    });
  }
});

/**
 * POST /api/credits/add
 * Adicionar créditos à empresa
 */
router.post('/add', async (req, res) => {
  try {
    const { supabase, company } = req;
    const {
      credits_to_add,
      description,
      reference,
      user_id
    } = req.body;

    // ✅ Validação de dados obrigatórios
    if (!credits_to_add || credits_to_add <= 0) {
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'credits_to_add é obrigatório e deve ser maior que 0'
      });
    }

    if (!description) {
      return res.status(400).json({
        error: 'Dados inválidos',
        message: 'description é obrigatório'
      });
    }

    console.log('💰 Adding credits:', {
      company_id: company.id,
      credits_to_add,
      description,
      reference
    });

    // ✅ Adicionar créditos usando função RPC
    const { error: addError } = await supabase.rpc('add_credits', {
      p_company_id: company.id,
      credits_to_add: credits_to_add,
      description: description,
      reference: reference || null,
      user_id: user_id || null
    });

    if (addError) {
      console.error('❌ Error adding credits:', addError);
      return res.status(500).json({
        error: 'Erro ao adicionar créditos',
        message: addError.message
      });
    }

    // ✅ Buscar saldo atualizado
    const { data: newBalance, error: balanceError } = await supabase
      .from('company_credits')
      .select('balance')
      .eq('company_id', company.id)
      .single();

    if (balanceError) {
      console.warn('⚠️ Error fetching updated balance:', balanceError);
    }

    console.log('✅ Credits added successfully:', {
      company_id: company.id,
      credits_added: credits_to_add,
      new_balance: newBalance?.balance || 'unknown'
    });

    res.json({
      success: true,
      message: 'Créditos adicionados com sucesso',
      credits_added: credits_to_add,
      new_balance: newBalance?.balance || null,
      transaction_details: {
        description: description,
        reference: reference || null
      }
    });

  } catch (error) {
    console.error('💥 Error in add credits endpoint:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Falha ao adicionar créditos'
    });
  }
});

/**
 * GET /api/credits/balance
 * Obter saldo atual de créditos da empresa
 */
router.get('/balance', async (req, res) => {
  try {
    const { supabase, company } = req;

    console.log('📊 Fetching credit balance for company:', company.id);

    // ✅ Buscar saldo atual
    const { data: balance, error: balanceError } = await supabase
      .from('company_credits')
      .select('balance, updated_at, credit_details')
      .eq('company_id', company.id)
      .single();

    if (balanceError) {
      console.error('❌ Error fetching balance:', balanceError);
      return res.status(500).json({
        error: 'Erro ao buscar saldo',
        message: balanceError.message
      });
    }

    if (!balance) {
      // ✅ Inicializar créditos se não existir registro
      const { error: initError } = await supabase.rpc('initialize_company_credits', {
        p_company_id: company.id,
        initial_credits: 0
      });

      if (initError) {
        console.error('❌ Error initializing credits:', initError);
        return res.status(500).json({
          error: 'Erro ao inicializar créditos',
          message: initError.message
        });
      }

      return res.json({
        balance: 0,
        company_id: company.id,
        last_updated: new Date().toISOString(),
        credit_details: null
      });
    }

    res.json({
      balance: balance.balance,
      company_id: company.id,
      last_updated: balance.updated_at,
      credit_details: balance.credit_details
    });

  } catch (error) {
    console.error('💥 Error in balance endpoint:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Falha ao buscar saldo de créditos'
    });
  }
});

/**
 * GET /api/credits/usage-stats
 * Obter estatísticas de uso de créditos
 */
router.get('/usage-stats', async (req, res) => {
  try {
    const { supabase, company } = req;

    console.log('📈 Fetching usage stats for company:', company.id);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // ✅ Buscar uso deste mês
    const { data: thisMonthData, error: thisMonthError } = await supabase
      .from('credit_usage_logs')
      .select('credits_used, service_type')
      .eq('company_id', company.id)
      .gte('created_at', startOfMonth.toISOString());

    if (thisMonthError) {
      console.error('❌ Error fetching this month data:', thisMonthError);
      return res.status(500).json({
        error: 'Erro ao buscar dados do mês atual',
        message: thisMonthError.message
      });
    }

    // ✅ Buscar uso do mês passado
    const { data: lastMonthData, error: lastMonthError } = await supabase
      .from('credit_usage_logs')
      .select('credits_used')
      .eq('company_id', company.id)
      .gte('created_at', startOfLastMonth.toISOString())
      .lte('created_at', endOfLastMonth.toISOString());

    if (lastMonthError) {
      console.error('❌ Error fetching last month data:', lastMonthError);
      return res.status(500).json({
        error: 'Erro ao buscar dados do mês passado',
        message: lastMonthError.message
      });
    }

    // ✅ Calcular estatísticas
    const totalUsageThisMonth = thisMonthData?.reduce((sum, log) => sum + log.credits_used, 0) || 0;
    const totalUsageLastMonth = lastMonthData?.reduce((sum, log) => sum + log.credits_used, 0) || 0;

    const daysInMonth = now.getDate();
    const averageDailyUsage = daysInMonth > 0 ? totalUsageThisMonth / daysInMonth : 0;

    // ✅ Calcular top serviços
    const serviceUsage = thisMonthData?.reduce((acc, log) => {
      acc[log.service_type] = (acc[log.service_type] || 0) + log.credits_used;
      return acc;
    }, {}) || {};

    const topServices = Object.entries(serviceUsage)
      .map(([service_type, credits_used]) => ({
        service_type,
        credits_used,
        percentage: totalUsageThisMonth > 0 ? (credits_used / totalUsageThisMonth) * 100 : 0
      }))
      .sort((a, b) => b.credits_used - a.credits_used)
      .slice(0, 5);

    res.json({
      total_usage_this_month: totalUsageThisMonth,
      total_usage_last_month: totalUsageLastMonth,
      average_daily_usage: Math.round(averageDailyUsage),
      top_services: topServices,
      period: {
        current_month: {
          start: startOfMonth.toISOString(),
          end: now.toISOString()
        },
        last_month: {
          start: startOfLastMonth.toISOString(),
          end: endOfLastMonth.toISOString()
        }
      }
    });

  } catch (error) {
    console.error('💥 Error in usage stats endpoint:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Falha ao buscar estatísticas de uso'
    });
  }
});

/**
 * GET /api/credits/transactions
 * Listar transações de créditos
 */
router.get('/transactions', async (req, res) => {
  try {
    const { supabase, company } = req;
    const { limit = 50, offset = 0, type } = req.query;

    console.log('📋 Fetching credit transactions for company:', company.id);

    let query = supabase
      .from('credit_transactions')
      .select('*')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // ✅ Filtrar por tipo se especificado
    if (type && ['purchase', 'usage', 'bonus', 'refund'].includes(type)) {
      query = query.eq('type', type);
    }

    const { data: transactions, error: transactionsError } = await query;

    if (transactionsError) {
      console.error('❌ Error fetching transactions:', transactionsError);
      return res.status(500).json({
        error: 'Erro ao buscar transações',
        message: transactionsError.message
      });
    }

    res.json({
      transactions: transactions || [],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: transactions?.length || 0
      },
      filters: {
        type: type || null
      }
    });

  } catch (error) {
    console.error('💥 Error in transactions endpoint:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: 'Falha ao buscar transações'
    });
  }
});

module.exports = router; 

const express = require('express');
const router = express.Router();

// ✅ Listar todos os leads da empresa
router.get('/', async (req, res) => {
  try {
    const { company } = req;
    const { pipeline_id, column_id, status, priority, source, search } = req.query;

    console.log(`📋 Listando leads para empresa: ${company.name}`);

    let query = req.supabase
      .from('leads')
      .select(`
        id,
        title,
        description,
        estimated_value,
        status,
        priority,
        source,
        tags,
        notes,
        metadata,
        created_at,
        updated_at,
        created_by,
        contacts!inner(
          id,
          first_name,
          last_name,
          full_name,
          email,
          phone,
          company_name
        ),
        pipeline_lead_mappings(
          id,
          position,
          pipeline_columns!inner(
            id,
            title,
            color,
            position,
            pipelines!inner(
              id,
              name,
              description
            )
          )
        )
      `)
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });

    // Filtros opcionais
    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (source) query = query.eq('source', source);
    if (search) {
      query = query.or(`title.ilike.%${search}%, description.ilike.%${search}%`);
    }

    const { data: leads, error } = await query;

    if (error) {
      console.error('❌ Erro ao listar leads:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Formatar resposta para compatibilidade com frontend
    const formattedLeads = leads.map(lead => ({
      id: lead.id,
      title: lead.title,
      description: lead.description,
      name: lead.contacts?.full_name || lead.title,
      company: lead.contacts?.company_name || 'N/A',
      email: lead.contacts?.email || 'N/A',
      phone: lead.contacts?.phone || 'N/A',
      value: lead.estimated_value || 0,
      status: lead.status,
      priority: lead.priority,
      source: lead.source,
      tags: lead.tags || [],
      notes: lead.notes,
      metadata: lead.metadata || {},
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      created_by: lead.created_by,
      contact_id: lead.contacts?.id,
      pipeline_info: lead.pipeline_lead_mappings?.[0] ? {
        pipeline_id: lead.pipeline_lead_mappings[0].pipeline_columns.pipelines.id,
        pipeline_name: lead.pipeline_lead_mappings[0].pipeline_columns.pipelines.name,
        column_id: lead.pipeline_lead_mappings[0].pipeline_columns.id,
        column_title: lead.pipeline_lead_mappings[0].pipeline_columns.title,
        column_color: lead.pipeline_lead_mappings[0].pipeline_columns.color,
        position: lead.pipeline_lead_mappings[0].position
      } : null
    }));

    res.json({
      success: true,
      data: formattedLeads,
      total: formattedLeads.length,
      filters_applied: {
        pipeline_id,
        column_id,
        status,
        priority,
        source,
        search
      }
    });

  } catch (error) {
    console.error('❌ Erro ao processar listagem de leads:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Obter lead específico por ID
router.get('/:id', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;

    console.log(`📋 Buscando lead ${id} para empresa: ${company.name}`);

    const { data: lead, error } = await req.supabase
      .from('leads')
      .select(`
        *,
        contacts(
          id,
          first_name,
          last_name,
          full_name,
          email,
          phone,
          company_name
        ),
        pipeline_lead_mappings(
          id,
          position,
          pipeline_columns(
            id,
            title,
            color,
            position,
            pipelines(
              id,
              name,
              description
            )
          )
        )
      `)
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Lead não encontrado'
        });
      }
      console.error('❌ Erro ao buscar lead:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: lead
    });

  } catch (error) {
    console.error('❌ Erro ao processar busca de lead:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Criar novo lead
router.post('/', async (req, res) => {
  try {
    const { company } = req;
    const leadData = req.body;

    console.log(`➕ Criando lead para empresa: ${company.name}`, leadData);

    // Validações básicas
    if (!leadData.title && !leadData.name) {
      return res.status(400).json({
        error: 'Campo obrigatório: title ou name'
      });
    }

    // Preparar dados para a função unificada
    const processedData = {
      title: leadData.title || leadData.name,
      description: leadData.description,
      estimated_value: leadData.estimated_value || leadData.value || 0,
      status: leadData.status || 'new',
      priority: leadData.priority || 'medium',
      source: leadData.source || 'api',
      tags: leadData.tags || [],
      notes: leadData.notes,
      metadata: leadData.metadata || {},
      // Dados do contato
      contact_id: leadData.contact_id,
      contact_name: leadData.contact_name || leadData.name,
      contact_email: leadData.contact_email || leadData.email,
      contact_phone: leadData.contact_phone || leadData.phone,
      contact_company: leadData.contact_company || leadData.company
    };

    // Buscar um usuário da empresa para usar como created_by
    const { data: user } = await req.supabase
      .from('users')
      .select('id')
      .eq('company_id', company.id)
      .limit(1)
      .single();

    if (!user) {
      return res.status(400).json({
        error: 'Nenhum usuário encontrado para esta empresa'
      });
    }

    // Chamar função de criação unificada
    const { data: result, error } = await req.supabase
      .rpc('create_lead_unified', {
        lead_data: processedData,
        user_id: user.id
      });

    if (error) {
      console.error('❌ Erro ao criar lead:', error);
      return res.status(500).json({
        error: 'Erro ao criar lead',
        details: error.message
      });
    }

    if (!result?.success) {
      return res.status(400).json({
        error: 'Falha ao criar lead',
        details: result?.error || 'Erro desconhecido'
      });
    }

    console.log('✅ Lead criado com sucesso:', result.lead_id);

    res.status(201).json({
      success: true,
      data: {
        id: result.lead_id,
        message: 'Lead criado com sucesso'
      }
    });

  } catch (error) {
    console.error('❌ Erro ao processar criação de lead:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Atualizar lead existente
router.put('/:id', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;
    const leadData = req.body;

    console.log(`✏️ Atualizando lead ${id} para empresa: ${company.name}`, leadData);

    // Verificar se o lead existe e pertence à empresa
    const { data: existingLead, error: findError } = await req.supabase
      .from('leads')
      .select('id, created_by')
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Lead não encontrado'
        });
      }
      return res.status(500).json({
        error: 'Erro ao buscar lead',
        details: findError.message
      });
    }

    // Preparar dados para atualização
    const updateData = {
      title: leadData.title || leadData.name,
      description: leadData.description,
      estimated_value: leadData.estimated_value || leadData.value,
      status: leadData.status,
      priority: leadData.priority,
      source: leadData.source,
      tags: leadData.tags,
      notes: leadData.notes,
      metadata: leadData.metadata || {}
    };

    // Buscar um usuário da empresa para usar como updated_by
    const { data: user } = await req.supabase
      .from('users')
      .select('id')
      .eq('company_id', company.id)
      .limit(1)
      .single();

    if (!user) {
      return res.status(400).json({
        error: 'Nenhum usuário encontrado para esta empresa'
      });
    }

    // Chamar função de atualização unificada
    const { data: result, error } = await req.supabase
      .rpc('update_lead_unified', {
        lead_id_param: id,
        lead_data: updateData,
        user_id: user.id
      });

    if (error) {
      console.error('❌ Erro ao atualizar lead:', error);
      return res.status(500).json({
        error: 'Erro ao atualizar lead',
        details: error.message
      });
    }

    if (!result?.success) {
      return res.status(400).json({
        error: 'Falha ao atualizar lead',
        details: result?.error || 'Erro desconhecido'
      });
    }

    console.log('✅ Lead atualizado com sucesso:', id);

    res.json({
      success: true,
      data: {
        id: id,
        message: 'Lead atualizado com sucesso'
      }
    });

  } catch (error) {
    console.error('❌ Erro ao processar atualização de lead:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Deletar lead
router.delete('/:id', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;

    console.log(`🗑️ Deletando lead ${id} para empresa: ${company.name}`);

    // Verificar se o lead existe e pertence à empresa
    const { data: existingLead, error: findError } = await req.supabase
      .from('leads')
      .select('id')
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Lead não encontrado'
        });
      }
      return res.status(500).json({
        error: 'Erro ao buscar lead',
        details: findError.message
      });
    }

    // Deletar mapeamentos do pipeline primeiro
    await req.supabase
      .from('pipeline_lead_mappings')
      .delete()
      .eq('lead_id', id);

    // Deletar tags do lead
    await req.supabase
      .from('lead_tags')
      .delete()
      .eq('lead_id', id);

    // Deletar atividades do lead
    await req.supabase
      .from('lead_activities')
      .delete()
      .eq('lead_id', id);

    // Deletar o lead
    const { error: deleteError } = await req.supabase
      .from('leads')
      .delete()
      .eq('id', id)
      .eq('company_id', company.id);

    if (deleteError) {
      console.error('❌ Erro ao deletar lead:', deleteError);
      return res.status(500).json({
        error: 'Erro ao deletar lead',
        details: deleteError.message
      });
    }

    console.log('✅ Lead deletado com sucesso:', id);

    res.json({
      success: true,
      message: 'Lead deletado com sucesso'
    });

  } catch (error) {
    console.error('❌ Erro ao processar deleção de lead:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Mover lead entre colunas/pipelines
router.post('/:id/move', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;
    const { column_id, pipeline_id, position } = req.body;

    console.log(`🔄 Movendo lead ${id} para coluna ${column_id}`);

    // Validações
    if (!column_id) {
      return res.status(400).json({
        error: 'Campo obrigatório: column_id'
      });
    }

    // Verificar se o lead existe e pertence à empresa
    const { data: existingLead, error: findError } = await req.supabase
      .from('leads')
      .select('id')
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (findError) {
      if (findError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Lead não encontrado'
        });
      }
      return res.status(500).json({
        error: 'Erro ao buscar lead',
        details: findError.message
      });
    }

    // Verificar se a coluna existe e pertence à empresa
    const { data: column, error: columnError } = await req.supabase
      .from('pipeline_columns')
      .select('id, pipeline_id')
      .eq('id', column_id)
      .eq('company_id', company.id)
      .single();

    if (columnError) {
      return res.status(400).json({
        error: 'Coluna não encontrada ou não pertence à empresa'
      });
    }

    // Determinar posição se não fornecida
    let finalPosition = position;
    if (finalPosition === undefined) {
      const { data: lastPosition } = await req.supabase
        .from('pipeline_lead_mappings')
        .select('position')
        .eq('column_id', column_id)
        .order('position', { ascending: false })
        .limit(1)
        .single();

      finalPosition = (lastPosition?.position || 0) + 1;
    }

    // Atualizar ou inserir mapeamento
    const { error: upsertError } = await req.supabase
      .from('pipeline_lead_mappings')
      .upsert({
        pipeline_id: pipeline_id || column.pipeline_id,
        column_id: column_id,
        lead_id: id,
        position: finalPosition
      }, {
        onConflict: 'pipeline_id,lead_id',
        ignoreDuplicates: false
      });

    if (upsertError) {
      console.error('❌ Erro ao mover lead:', upsertError);
      return res.status(500).json({
        error: 'Erro ao mover lead',
        details: upsertError.message
      });
    }

    console.log('✅ Lead movido com sucesso');

    res.json({
      success: true,
      data: {
        lead_id: id,
        column_id: column_id,
        pipeline_id: pipeline_id || column.pipeline_id,
        position: finalPosition,
        message: 'Lead movido com sucesso'
      }
    });

  } catch (error) {
    console.error('❌ Erro ao processar movimentação de lead:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Listar leads de uma coluna específica
router.get('/column/:column_id', async (req, res) => {
  try {
    const { company } = req;
    const { column_id } = req.params;

    console.log(`📋 Listando leads da coluna ${column_id} para empresa: ${company.name}`);

    // Verificar se a coluna pertence à empresa
    const { data: column, error: columnError } = await req.supabase
      .from('pipeline_columns')
      .select('id, title, pipeline_id')
      .eq('id', column_id)
      .eq('company_id', company.id)
      .single();

    if (columnError) {
      return res.status(404).json({
        error: 'Coluna não encontrada'
      });
    }

    // Buscar leads da coluna
    const { data: mappings, error } = await req.supabase
      .from('pipeline_lead_mappings')
      .select(`
        position,
        leads!inner(
          id,
          title,
          description,
          estimated_value,
          status,
          priority,
          source,
          tags,
          notes,
          created_at,
          updated_at,
          contacts(
            id,
            full_name,
            email,
            phone,
            company_name
          )
        )
      `)
      .eq('column_id', column_id)
      .order('position');

    if (error) {
      console.error('❌ Erro ao listar leads da coluna:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    const leads = mappings.map(mapping => ({
      ...mapping.leads,
      position: mapping.position,
      contact: mapping.leads.contacts
    }));

    res.json({
      success: true,
      data: {
        column: column,
        leads: leads,
        total: leads.length
      }
    });

  } catch (error) {
    console.error('❌ Erro ao processar listagem de leads da coluna:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

module.exports = router; 

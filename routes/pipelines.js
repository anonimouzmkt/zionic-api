const express = require('express');
const router = express.Router();

// ✅ Listar todos os pipelines da empresa
router.get('/', async (req, res) => {
  try {
    const { company } = req;

    console.log(`📋 Listando pipelines para empresa: ${company.name}`);

    const { data: pipelines, error } = await req.supabase
      .from('pipelines')
      .select(`
        id,
        name,
        description,
        is_default,
        created_at,
        updated_at,
        pipeline_columns(
          id,
          title,
          description,
          color,
          position,
          created_at
        )
      `)
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao listar pipelines:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Ordenar colunas por posição
    const formattedPipelines = pipelines.map(pipeline => ({
      ...pipeline,
      columns: pipeline.pipeline_columns
        ? pipeline.pipeline_columns.sort((a, b) => a.position - b.position)
        : []
    }));

    res.json({
      success: true,
      data: formattedPipelines,
      total: formattedPipelines.length
    });

  } catch (error) {
    console.error('❌ Erro ao processar listagem de pipelines:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Obter pipeline específico por ID
router.get('/:id', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;

    console.log(`📋 Buscando pipeline ${id} para empresa: ${company.name}`);

    const { data: pipeline, error } = await req.supabase
      .from('pipelines')
      .select(`
        id,
        name,
        description,
        is_default,
        created_at,
        updated_at,
        pipeline_columns(
          id,
          title,
          description,
          color,
          position,
          created_at,
          updated_at
        )
      `)
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Pipeline não encontrado'
        });
      }
      console.error('❌ Erro ao buscar pipeline:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Ordenar colunas por posição
    if (pipeline.pipeline_columns) {
      pipeline.columns = pipeline.pipeline_columns.sort((a, b) => a.position - b.position);
      delete pipeline.pipeline_columns;
    }

    res.json({
      success: true,
      data: pipeline
    });

  } catch (error) {
    console.error('❌ Erro ao processar busca de pipeline:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Obter pipeline padrão da empresa
router.get('/default/info', async (req, res) => {
  try {
    const { company } = req;

    console.log(`📋 Buscando pipeline padrão para empresa: ${company.name}`);

    const { data: pipeline, error } = await req.supabase
      .from('pipelines')
      .select(`
        id,
        name,
        description,
        is_default,
        created_at,
        updated_at,
        pipeline_columns(
          id,
          title,
          description,
          color,
          position,
          created_at,
          updated_at
        )
      `)
      .eq('company_id', company.id)
      .eq('is_default', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Se não há pipeline padrão, buscar o primeiro disponível
        const { data: firstPipeline, error: firstError } = await req.supabase
          .from('pipelines')
          .select(`
            id,
            name,
            description,
            is_default,
            created_at,
            updated_at,
            pipeline_columns(
              id,
              title,
              description,
              color,
              position,
              created_at,
              updated_at
            )
          `)
          .eq('company_id', company.id)
          .order('created_at')
          .limit(1)
          .single();

        if (firstError) {
          return res.status(404).json({
            error: 'Nenhum pipeline encontrado para esta empresa'
          });
        }

        // Ordenar colunas por posição
        if (firstPipeline.pipeline_columns) {
          firstPipeline.columns = firstPipeline.pipeline_columns.sort((a, b) => a.position - b.position);
          delete firstPipeline.pipeline_columns;
        }

        return res.json({
          success: true,
          data: firstPipeline,
          note: 'Pipeline padrão não definido, retornando o primeiro pipeline disponível'
        });
      }

      console.error('❌ Erro ao buscar pipeline padrão:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Ordenar colunas por posição
    if (pipeline.pipeline_columns) {
      pipeline.columns = pipeline.pipeline_columns.sort((a, b) => a.position - b.position);
      delete pipeline.pipeline_columns;
    }

    res.json({
      success: true,
      data: pipeline
    });

  } catch (error) {
    console.error('❌ Erro ao processar busca de pipeline padrão:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Listar colunas de um pipeline específico
router.get('/:id/columns', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;

    console.log(`📋 Listando colunas do pipeline ${id} para empresa: ${company.name}`);

    // Verificar se o pipeline pertence à empresa
    const { data: pipeline, error: pipelineError } = await req.supabase
      .from('pipelines')
      .select('id, name')
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (pipelineError) {
      return res.status(404).json({
        error: 'Pipeline não encontrado'
      });
    }

    // Buscar colunas do pipeline
    const { data: columns, error } = await req.supabase
      .from('pipeline_columns')
      .select(`
        id,
        title,
        description,
        color,
        position,
        created_at,
        updated_at
      `)
      .eq('pipeline_id', id)
      .eq('company_id', company.id)
      .order('position');

    if (error) {
      console.error('❌ Erro ao listar colunas do pipeline:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: {
        pipeline: pipeline,
        columns: columns,
        total: columns.length
      }
    });

  } catch (error) {
    console.error('❌ Erro ao processar listagem de colunas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Listar todas as colunas da empresa (de todos os pipelines)
router.get('/columns/all', async (req, res) => {
  try {
    const { company } = req;

    console.log(`📋 Listando todas as colunas para empresa: ${company.name}`);

    const { data: columns, error } = await req.supabase
      .from('pipeline_columns')
      .select(`
        id,
        title,
        description,
        color,
        position,
        created_at,
        updated_at,
        pipelines!inner(
          id,
          name,
          description,
          is_default
        )
      `)
      .eq('company_id', company.id)
      .order('position');

    if (error) {
      console.error('❌ Erro ao listar todas as colunas:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Formatar resposta agrupando por pipeline
    const columnsByPipeline = columns.reduce((acc, column) => {
      const pipelineId = column.pipelines.id;
      if (!acc[pipelineId]) {
        acc[pipelineId] = {
          pipeline: column.pipelines,
          columns: []
        };
      }
      acc[pipelineId].columns.push({
        id: column.id,
        title: column.title,
        description: column.description,
        color: column.color,
        position: column.position,
        created_at: column.created_at,
        updated_at: column.updated_at
      });
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        by_pipeline: columnsByPipeline,
        all_columns: columns.map(col => ({
          id: col.id,
          title: col.title,
          description: col.description,
          color: col.color,
          position: col.position,
          pipeline_id: col.pipelines.id,
          pipeline_name: col.pipelines.name,
          pipeline_is_default: col.pipelines.is_default,
          created_at: col.created_at,
          updated_at: col.updated_at
        })),
        total: columns.length
      }
    });

  } catch (error) {
    console.error('❌ Erro ao processar listagem de todas as colunas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Obter estatísticas de um pipeline
router.get('/:id/stats', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;

    console.log(`📊 Buscando estatísticas do pipeline ${id} para empresa: ${company.name}`);

    // Verificar se o pipeline pertence à empresa
    const { data: pipeline, error: pipelineError } = await req.supabase
      .from('pipelines')
      .select('id, name')
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (pipelineError) {
      return res.status(404).json({
        error: 'Pipeline não encontrado'
      });
    }

    // Buscar estatísticas das colunas
    const { data: columnStats, error } = await req.supabase
      .from('pipeline_columns')
      .select(`
        id,
        title,
        color,
        position,
        pipeline_lead_mappings(
          lead_id,
          leads!inner(
            id,
            estimated_value,
            status,
            priority,
            created_at
          )
        )
      `)
      .eq('pipeline_id', id)
      .eq('company_id', company.id)
      .order('position');

    if (error) {
      console.error('❌ Erro ao buscar estatísticas:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Calcular estatísticas
    let totalLeads = 0;
    let totalValue = 0;
    const columnStats_processed = columnStats.map(column => {
      const leads = column.pipeline_lead_mappings || [];
      const leadsCount = leads.length;
      const columnValue = leads.reduce((sum, mapping) => {
        return sum + (mapping.leads?.estimated_value || 0);
      }, 0);

      totalLeads += leadsCount;
      totalValue += columnValue;

      return {
        column_id: column.id,
        column_title: column.title,
        column_color: column.color,
        column_position: column.position,
        leads_count: leadsCount,
        total_value: columnValue,
        avg_value: leadsCount > 0 ? columnValue / leadsCount : 0
      };
    });

    res.json({
      success: true,
      data: {
        pipeline: pipeline,
        total_leads: totalLeads,
        total_value: totalValue,
        avg_lead_value: totalLeads > 0 ? totalValue / totalLeads : 0,
        columns_count: columnStats.length,
        columns_stats: columnStats_processed
      }
    });

  } catch (error) {
    console.error('❌ Erro ao processar estatísticas do pipeline:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

module.exports = router; 

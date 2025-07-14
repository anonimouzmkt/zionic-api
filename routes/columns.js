const express = require('express');
const router = express.Router();

// ✅ Listar todas as colunas da empresa
router.get('/', async (req, res) => {
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
        pipeline_id,
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
      console.error('❌ Erro ao listar colunas:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Formatar resposta
    const formattedColumns = columns.map(column => ({
      id: column.id,
      title: column.title,
      description: column.description,
      color: column.color,
      position: column.position,
      pipeline_id: column.pipeline_id,
      pipeline_name: column.pipelines.name,
      pipeline_description: column.pipelines.description,
      pipeline_is_default: column.pipelines.is_default,
      created_at: column.created_at,
      updated_at: column.updated_at
    }));

    // Agrupar por pipeline
    const columnsByPipeline = formattedColumns.reduce((acc, column) => {
      const pipelineId = column.pipeline_id;
      if (!acc[pipelineId]) {
        acc[pipelineId] = {
          pipeline: {
            id: pipelineId,
            name: column.pipeline_name,
            description: column.pipeline_description,
            is_default: column.pipeline_is_default
          },
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
        all_columns: formattedColumns,
        by_pipeline: columnsByPipeline,
        total: formattedColumns.length,
        pipelines_count: Object.keys(columnsByPipeline).length
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

// ✅ Obter coluna específica por ID
router.get('/:id', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;

    console.log(`📋 Buscando coluna ${id} para empresa: ${company.name}`);

    const { data: column, error } = await req.supabase
      .from('pipeline_columns')
      .select(`
        id,
        title,
        description,
        color,
        position,
        created_at,
        updated_at,
        pipeline_id,
        pipelines!inner(
          id,
          name,
          description,
          is_default
        )
      `)
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Coluna não encontrada'
        });
      }
      console.error('❌ Erro ao buscar coluna:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    res.json({
      success: true,
      data: {
        id: column.id,
        title: column.title,
        description: column.description,
        color: column.color,
        position: column.position,
        pipeline_id: column.pipeline_id,
        pipeline: column.pipelines,
        created_at: column.created_at,
        updated_at: column.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Erro ao processar busca de coluna:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// ✅ Listar leads de uma coluna específica
router.get('/:id/leads', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;

    console.log(`📋 Listando leads da coluna ${id} para empresa: ${company.name}`);

    // Verificar se a coluna pertence à empresa
    const { data: column, error: columnError } = await req.supabase
      .from('pipeline_columns')
      .select('id, title, pipeline_id')
      .eq('id', id)
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
      .eq('column_id', id)
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

const express = require('express');
const router = express.Router();

// ✅ Rota para anexar documento via base64
router.post('/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    const { 
      file_base64, 
      file_name, 
      file_type, 
      description, 
      category = 'document' 
    } = req.body;
    const companyId = req.company.id;

    // ✅ 1. Validações
    if (!file_base64 || !file_name || !file_type) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros obrigatórios: file_base64, file_name, file_type',
        example: {
          file_base64: 'base64_string_here',
          file_name: 'documento.pdf',
          file_type: 'application/pdf',
          description: 'Descrição opcional',
          category: 'document|image|contract|proposal|other'
        }
      });
    }

    // Verificar se lead existe e pertence à empresa
    const { data: leadData, error: leadError } = await req.supabase
      .from('leads')
      .select('id, title')
      .eq('id', leadId)
      .eq('company_id', companyId)
      .single();

    if (leadError || !leadData) {
      return res.status(404).json({
        success: false,
        error: 'Lead não encontrado ou não pertence à sua empresa'
      });
    }

    console.log(`📎 [ATTACHMENTS] Upload de anexo via base64:`, {
      company: req.company.name,
      leadId,
      leadTitle: leadData.title,
      fileName: file_name,
      fileType: file_type,
      category
    });

    // ✅ 2. Decodificar base64 e validar tamanho
    let fileBuffer;
    try {
      fileBuffer = Buffer.from(file_base64, 'base64');
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Base64 inválido'
      });
    }

    const fileSize = fileBuffer.length;
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (fileSize > maxSize) {
      return res.status(400).json({
        success: false,
        error: 'Arquivo muito grande. Máximo: 50MB',
        received_size: `${Math.round(fileSize / 1024 / 1024)} MB`
      });
    }

    // ✅ 3. Upload para Supabase Storage
    const fileName = `lead_${leadId}_${Date.now()}_${file_name}`;
    const filePath = `lead-attachments/${companyId}/${fileName}`;

    const { data: uploadData, error: uploadError } = await req.supabase.storage
      .from('media')
      .upload(filePath, fileBuffer, {
        contentType: file_type,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('❌ Erro no upload para storage:', uploadError);
      return res.status(500).json({
        success: false,
        error: `Erro no upload: ${uploadError.message}`
      });
    }

    // ✅ 4. Obter URL pública
    const { data: { publicUrl } } = req.supabase.storage
      .from('media')
      .getPublicUrl(filePath);

    // ✅ 5. Salvar registro no banco
    const { data: attachmentData, error: attachmentError } = await req.supabase
      .from('lead_attachments')
      .insert({
        lead_id: leadId,
        company_id: companyId,
        file_name,
        file_type,
        file_size: fileSize,
        file_url: publicUrl,
        description: description || null,
        category,
        uploaded_by: null, // API externa, sem usuário específico
        metadata: {
          uploaded_via: 'api',
          api_key_name: req.apiKey.name,
          original_name: file_name,
          upload_path: filePath,
          mime_type: file_type
        }
      })
      .select('id, file_name, file_size, file_url, category, created_at')
      .single();

    if (attachmentError) {
      console.error('❌ Erro ao salvar anexo no banco:', attachmentError);
      
      // Limpar arquivo do storage se falhou salvar no banco
      await req.supabase.storage.from('media').remove([filePath]);
      
      return res.status(500).json({
        success: false,
        error: `Erro ao salvar anexo: ${attachmentError.message}`
      });
    }

    console.log(`✅ [ATTACHMENTS] Anexo salvo com sucesso:`, {
      attachmentId: attachmentData.id,
      leadId,
      fileName: file_name,
      fileSize: `${Math.round(fileSize / 1024)} KB`,
      category
    });

    res.json({
      success: true,
      message: 'Anexo adicionado com sucesso ao lead',
      data: {
        attachment_id: attachmentData.id,
        lead_id: leadId,
        lead_title: leadData.title,
        file_name: attachmentData.file_name,
        file_type,
        file_size: attachmentData.file_size,
        file_size_formatted: `${Math.round(fileSize / 1024)} KB`,
        file_url: attachmentData.file_url,
        category: attachmentData.category,
        description,
        uploaded_at: attachmentData.created_at,
        uploaded_via: 'api'
      }
    });

  } catch (error) {
    console.error('❌ [ATTACHMENTS] Erro no upload de anexo:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
});

// ✅ Rota para listar anexos de um lead
router.get('/:leadId', async (req, res) => {
  try {
    const { leadId } = req.params;
    const companyId = req.company.id;

    // Verificar se lead existe e pertence à empresa
    const { data: leadData, error: leadError } = await req.supabase
      .from('leads')
      .select('id, title')
      .eq('id', leadId)
      .eq('company_id', companyId)
      .single();

    if (leadError || !leadData) {
      return res.status(404).json({
        success: false,
        error: 'Lead não encontrado ou não pertence à sua empresa'
      });
    }

    // Buscar anexos do lead
    const { data: attachments, error } = await req.supabase.rpc('get_lead_attachments', {
      p_lead_id: leadId,
      p_company_id: companyId
    });

    if (error) {
      console.error('❌ Erro ao buscar anexos:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar anexos do lead'
      });
    }

    const formattedAttachments = (attachments || []).map(att => ({
      attachment_id: att.attachment_id,
      file_name: att.file_name,
      file_type: att.file_type,
      file_size: att.file_size,
      file_size_formatted: `${Math.round(att.file_size / 1024)} KB`,
      file_url: att.file_url,
      description: att.description,
      category: att.category,
      uploaded_by_name: att.uploaded_by_name,
      uploaded_at: att.uploaded_at,
      created_at: att.created_at
    }));

    console.log(`📋 [ATTACHMENTS] Listando anexos:`, {
      company: req.company.name,
      leadId,
      leadTitle: leadData.title,
      attachmentsCount: formattedAttachments.length
    });

    res.json({
      success: true,
      data: {
        lead_id: leadId,
        lead_title: leadData.title,
        attachments_count: formattedAttachments.length,
        attachments: formattedAttachments
      }
    });

  } catch (error) {
    console.error('❌ [ATTACHMENTS] Erro ao listar anexos:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
});

// ✅ Rota para deletar anexo de um lead
router.delete('/:leadId/:attachmentId', async (req, res) => {
  try {
    const { leadId, attachmentId } = req.params;
    const companyId = req.company.id;

    // Verificar se anexo existe, pertence ao lead e à empresa
    const { data: attachmentData, error: fetchError } = await req.supabase
      .from('lead_attachments')
      .select('id, file_name, file_url, company_id, lead_id')
      .eq('id', attachmentId)
      .eq('lead_id', leadId)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (fetchError || !attachmentData) {
      return res.status(404).json({
        success: false,
        error: 'Anexo não encontrado ou não pertence à sua empresa/lead'
      });
    }

    console.log(`🗑️ [ATTACHMENTS] Deletando anexo:`, {
      company: req.company.name,
      leadId,
      attachmentId,
      fileName: attachmentData.file_name
    });

    // Extrair path do storage da URL
    const storagePath = attachmentData.file_url.split('/').slice(-3).join('/');

    // Deletar do banco (soft delete)
    const { error: deleteError } = await req.supabase
      .from('lead_attachments')
      .update({ is_active: false })
      .eq('id', attachmentId);

    if (deleteError) {
      console.error('❌ Erro ao deletar anexo do banco:', deleteError);
      return res.status(500).json({
        success: false,
        error: `Erro ao deletar anexo: ${deleteError.message}`
      });
    }

    // Tentar deletar do storage (não crítico se falhar)
    try {
      await req.supabase.storage.from('media').remove([storagePath]);
    } catch (storageError) {
      console.warn('⚠️ Falha ao deletar arquivo do storage (não crítico):', storageError);
    }

    console.log(`✅ [ATTACHMENTS] Anexo deletado com sucesso:`, {
      attachmentId,
      leadId,
      fileName: attachmentData.file_name
    });

    res.json({
      success: true,
      message: 'Anexo removido com sucesso',
      data: {
        attachment_id: attachmentId,
        lead_id: leadId,
        file_name: attachmentData.file_name,
        deleted_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ [ATTACHMENTS] Erro ao deletar anexo:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor'
    });
  }
});

module.exports = router; 

const express = require('express');
const router = express.Router();

// ✅ HELPER: Validar formato de data
function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// ✅ HELPER: Formatar data para ISO string considerando timezone
function formatToISO(dateString, time = null, timezone = 'America/Sao_Paulo') {
  try {
    if (time) {
      // Criar data no timezone específico
      const localDateTime = `${dateString}T${time}:00`;
      const date = new Date(localDateTime);
      
      // Ajustar para o timezone especificado
      const offsetMs = getTimezoneOffset(timezone, date);
      const adjustedDate = new Date(date.getTime() - offsetMs);
      
      return adjustedDate.toISOString();
    }
    
    const date = new Date(dateString);
    const offsetMs = getTimezoneOffset(timezone, date);
    const adjustedDate = new Date(date.getTime() - offsetMs);
    
    return adjustedDate.toISOString();
  } catch (error) {
    console.warn('⚠️ Erro ao formatar data com timezone, usando formato padrão:', error);
    if (time) {
      return new Date(`${dateString}T${time}:00.000Z`).toISOString();
    }
    return new Date(dateString).toISOString();
  }
}

// ✅ HELPER: Obter offset do timezone em milissegundos
function getTimezoneOffset(timezone, date = new Date()) {
  try {
    // Criar formatador para o timezone
    const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    
    // Calcular diferença
    return utc.getTime() - local.getTime();
  } catch (error) {
    console.warn('⚠️ Erro ao calcular offset do timezone:', error);
    return 0; // Fallback para UTC
  }
}

// ✅ HELPER: Obter timezone da empresa
async function getCompanyTimezone(companyId, supabase) {
  try {
    // Primeiro, tentar obter o timezone das configurações da empresa
    const { data: companySettings, error: settingsError } = await supabase
      .from('company_settings')
      .select('timezone')
      .eq('company_id', companyId)
      .single();

    if (!settingsError && companySettings?.timezone) {
      return companySettings.timezone;
    }

    // Se não encontrar nas configurações da empresa, buscar do primeiro usuário da empresa
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('timezone')
      .eq('company_id', companyId)
      .not('timezone', 'is', null)
      .limit(1)
      .single();

    if (!userError && userData?.timezone) {
      return userData.timezone;
    }

    // Fallback para timezone padrão do Brasil
    return 'America/Sao_Paulo';
  } catch (error) {
    console.warn('⚠️ Erro ao obter timezone da empresa, usando padrão:', error);
    return 'America/Sao_Paulo';
  }
}

// ✅ HELPER: Verificar se empresa tem integração ativa do Google Calendar
async function checkGoogleCalendarIntegration(companyId, supabase) {
  // ✅ NOVO: Buscar todas as integrações ativas (múltiplas agendas)
  const { data, error } = await supabase
    .from('google_calendar_integrations')
    .select('id, status, access_token, is_active, calendar_id, calendar_name, user_id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('status', 'connected');

  if (error || !data || data.length === 0) {
    return {
      hasIntegration: false,
      error: 'Nenhuma integração ativa do Google Calendar encontrada',
      integrations: []
    };
  }

  // Filtrar apenas integrações com access_token válido
  const validIntegrations = data.filter(integration => integration.access_token);

  if (validIntegrations.length === 0) {
    return {
      hasIntegration: false,
      error: 'Nenhuma integração conectada do Google Calendar encontrada',
      integrations: []
    };
  }

  return {
    hasIntegration: true,
    integrations: validIntegrations,
    primary: validIntegrations[0] // Primeira integração como primária para compatibilidade
  };
}

// ✅ 1. ENDPOINT: Verificar disponibilidade de horário
router.get('/availability/:date', async (req, res) => {
  try {
    const { company } = req;
    const { date } = req.params;
    const { start_hour = '08:00', end_hour = '18:00' } = req.query;

    // Validar data
    if (!isValidDate(date)) {
      return res.status(400).json({
        error: 'Data inválida',
        message: 'Use formato YYYY-MM-DD'
      });
    }

    // Obter timezone da empresa
    const companyTimezone = await getCompanyTimezone(company.id, req.supabase);

    // Definir período do dia considerando timezone da empresa
    const startDateTime = formatToISO(date, start_hour, companyTimezone);
    const endDateTime = formatToISO(date, end_hour, companyTimezone);

    console.log(`🔍 Verificando disponibilidade para ${date} entre ${start_hour} e ${end_hour}`);

    // Buscar appointments do dia
    const { data: appointments, error } = await req.supabase
      .from('appointments')
      .select('id, title, start_time, end_time, status')
      .eq('company_id', company.id)
      .gte('start_time', startDateTime)
      .lte('end_time', endDateTime)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar appointments:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Calcular horários ocupados
    const busySlots = appointments.map(apt => ({
      id: apt.id,
      title: apt.title,
      start: apt.start_time,
      end: apt.end_time,
      status: apt.status
    }));

    // Determinar se o dia está livre
    const isFree = busySlots.length === 0;

    return res.json({
      success: true,
      date,
      is_free: isFree,
      total_appointments: busySlots.length,
      busy_slots: busySlots,
      availability_window: {
        start: startDateTime,
        end: endDateTime
      },
      timezone: companyTimezone,
      company: {
        id: company.id,
        name: company.name
      }
    });

  } catch (error) {
    console.error('❌ Erro em /availability:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// ✅ 2. ENDPOINT: Agendar horário
router.post('/schedule', async (req, res) => {
  try {
    const { company } = req;
    const {
      title,
      description,
      start_time,
      end_time,
      location,
      attendees = [],
      lead_id,
      create_meet = true,
      all_day = false
    } = req.body;

    // Obter timezone da empresa
    const companyTimezone = await getCompanyTimezone(company.id, req.supabase);

    // Validações obrigatórias
    if (!title || !start_time || !end_time) {
      return res.status(400).json({
        error: 'Dados obrigatórios faltando',
        message: 'title, start_time e end_time são obrigatórios'
      });
    }

    // Validar datas
    if (!isValidDate(start_time) || !isValidDate(end_time)) {
      return res.status(400).json({
        error: 'Datas inválidas',
        message: 'Use formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)'
      });
    }

    // Verificar se end_time é após start_time
    if (new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({
        error: 'Horário inválido',
        message: 'Horário de fim deve ser posterior ao de início'
      });
    }

    console.log(`📅 Agendando: ${title} para ${start_time} - ${end_time}`);

    // Verificar se lead_id existe (se fornecido)
    if (lead_id) {
      const { data: lead, error: leadError } = await req.supabase
        .from('leads')
        .select('id, contact_id')
        .eq('id', lead_id)
        .eq('company_id', company.id)
        .single();

      if (leadError || !lead) {
        return res.status(400).json({
          error: 'Lead não encontrado',
          message: 'O lead_id fornecido não existe ou não pertence à empresa'
        });
      }
    }

    // Verificar conflitos de horário
    const { data: conflicts, error: conflictError } = await req.supabase
      .from('appointments')
      .select('id, title, start_time, end_time')
      .eq('company_id', company.id)
      .neq('status', 'cancelled')
      .or(`and(start_time.lte.${start_time},end_time.gte.${start_time}),and(start_time.lte.${end_time},end_time.gte.${end_time}),and(start_time.gte.${start_time},end_time.lte.${end_time})`);

    if (conflictError) {
      console.error('❌ Erro ao verificar conflitos:', conflictError);
      return res.status(500).json({
        error: 'Erro ao verificar conflitos',
        details: conflictError.message
      });
    }

    if (conflicts && conflicts.length > 0) {
      return res.status(409).json({
        error: 'Conflito de horário',
        message: 'Já existe um agendamento neste horário',
        conflicts: conflicts
      });
    }

    // Preparar dados dos participantes
    const attendeesJson = Array.isArray(attendees) 
      ? attendees.map(email => typeof email === 'string' 
          ? { email, displayName: email.split('@')[0] }
          : email)
      : [];

    // Criar appointment no banco
    const { data: appointment, error: createError } = await req.supabase
      .from('appointments')
      .insert({
        company_id: company.id,
        created_by: req.apiKey.created_by || null, // API key pode não ter usuário
        title,
        description,
        start_time,
        end_time,
        location,
        attendees: attendeesJson,
        lead_id,
        create_meet,
        all_day,
        status: 'scheduled'
      })
      .select('*')
      .single();

    if (createError) {
      console.error('❌ Erro ao criar appointment:', createError);
      return res.status(500).json({
        error: 'Erro ao criar agendamento',
        details: createError.message
      });
    }

    console.log(`✅ Appointment criado: ${appointment.id}`);

    // ✅ NOVO: Verificar múltiplas integrações com Google Calendar
    const googleIntegration = await checkGoogleCalendarIntegration(company.id, req.supabase);

    let googleEventInfo = null;
    if (googleIntegration.hasIntegration) {
      console.log(`🔄 Tentando sincronizar com ${googleIntegration.integrations.length} agenda(s) do Google Calendar...`);
      
      // Para agendamentos via API, usar a primeira integração (primária)
      // Em versões futuras, permitir especificar qual integração usar
      const primaryIntegration = googleIntegration.primary;
      
      googleEventInfo = {
        integration_status: 'attempted',
        message: `Sincronização com ${googleIntegration.integrations.length} agenda(s) do Google Calendar será processada`,
        primary_calendar: primaryIntegration.calendar_name || primaryIntegration.calendar_id,
        total_integrations: googleIntegration.integrations.length
      };
    }

    return res.status(201).json({
      success: true,
      message: 'Agendamento criado com sucesso',
      appointment: {
        id: appointment.id,
        title: appointment.title,
        description: appointment.description,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        location: appointment.location,
        status: appointment.status,
        attendees: appointment.attendees,
        lead_id: appointment.lead_id,
        created_at: appointment.created_at
      },
      google_calendar: googleEventInfo,
      timezone: companyTimezone,
      company: {
        id: company.id,
        name: company.name
      }
    });

  } catch (error) {
    console.error('❌ Erro em /schedule:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// ✅ 3. ENDPOINT: Listar agendamentos
router.get('/appointments', async (req, res) => {
  try {
    const { company } = req;
    const { 
      date,
      start_date,
      end_date,
      status,
      lead_id,
      limit = 50,
      page = 1
    } = req.query;

    // Obter timezone da empresa
    const companyTimezone = await getCompanyTimezone(company.id, req.supabase);

    let query = req.supabase
      .from('appointments')
      .select(`
        id, title, description, start_time, end_time, location,
        status, attendees, all_day, google_event_id, google_meet_link,
        lead_id, created_at, updated_at,
        leads(id, title, status),
        users!appointments_created_by_fkey(id, first_name, last_name, full_name)
      `)
      .eq('company_id', company.id)
      .order('start_time', { ascending: true });

    // Filtros de data
    if (date) {
      if (!isValidDate(date)) {
        return res.status(400).json({
          error: 'Data inválida',
          message: 'Use formato YYYY-MM-DD'
        });
      }
      const startOfDay = formatToISO(date, '00:00', companyTimezone);
      const endOfDay = formatToISO(date, '23:59', companyTimezone);
      query = query.gte('start_time', startOfDay).lte('start_time', endOfDay);
    } else if (start_date && end_date) {
      if (!isValidDate(start_date) || !isValidDate(end_date)) {
        return res.status(400).json({
          error: 'Datas inválidas',
          message: 'Use formato YYYY-MM-DD'
        });
      }
      query = query.gte('start_time', start_date).lte('end_time', end_date);
    }

    // Outros filtros
    if (status) {
      query = query.eq('status', status);
    }
    if (lead_id) {
      query = query.eq('lead_id', lead_id);
    }

    // Paginação
    const offset = (parseInt(page) - 1) * parseInt(limit);
    query = query.range(offset, offset + parseInt(limit) - 1);

    const { data: appointments, error, count } = await query;

    if (error) {
      console.error('❌ Erro ao buscar appointments:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Formatar resposta
    const formattedAppointments = appointments.map(apt => ({
      id: apt.id,
      title: apt.title,
      description: apt.description,
      start_time: apt.start_time,
      end_time: apt.end_time,
      location: apt.location,
      status: apt.status,
      attendees: apt.attendees,
      all_day: apt.all_day,
      google_event_id: apt.google_event_id,
      google_meet_link: apt.google_meet_link,
      lead: apt.leads ? {
        id: apt.leads.id,
        title: apt.leads.title,
        status: apt.leads.status
      } : null,
      created_by: apt.users ? {
        id: apt.users.id,
        name: apt.users.full_name || `${apt.users.first_name} ${apt.users.last_name}`.trim()
      } : null,
      created_at: apt.created_at,
      updated_at: apt.updated_at
    }));

    return res.json({
      success: true,
      appointments: formattedAppointments,
      pagination: {
        total: count || formattedAppointments.length,
        page: parseInt(page),
        limit: parseInt(limit),
        has_more: formattedAppointments.length === parseInt(limit)
      },
      filters: {
        date,
        start_date,
        end_date,
        status,
        lead_id
      },
      timezone: companyTimezone,
      company: {
        id: company.id,
        name: company.name
      }
    });

  } catch (error) {
    console.error('❌ Erro em /appointments:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// ✅ 4. ENDPOINT: Cancelar/Editar agendamento
router.put('/appointments/:id', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;
    const {
      title,
      description,
      start_time,
      end_time,
      location,
      attendees,
      status,
      create_meet,
      all_day
    } = req.body;

    // Obter timezone da empresa
    const companyTimezone = await getCompanyTimezone(company.id, req.supabase);

    // Verificar se appointment existe
    const { data: existingAppointment, error: findError } = await req.supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (findError || !existingAppointment) {
      return res.status(404).json({
        error: 'Agendamento não encontrado',
        message: 'O agendamento não existe ou não pertence à empresa'
      });
    }

    // Validar datas se fornecidas
    if (start_time && !isValidDate(start_time)) {
      return res.status(400).json({
        error: 'start_time inválido',
        message: 'Use formato ISO 8601'
      });
    }

    if (end_time && !isValidDate(end_time)) {
      return res.status(400).json({
        error: 'end_time inválido', 
        message: 'Use formato ISO 8601'
      });
    }

    // Verificar se end_time é após start_time (se ambos fornecidos)
    const newStartTime = start_time || existingAppointment.start_time;
    const newEndTime = end_time || existingAppointment.end_time;
    
    if (new Date(newEndTime) <= new Date(newStartTime)) {
      return res.status(400).json({
        error: 'Horário inválido',
        message: 'Horário de fim deve ser posterior ao de início'
      });
    }

    // Verificar conflitos (se mudando horário)
    if (start_time || end_time) {
      const { data: conflicts, error: conflictError } = await req.supabase
        .from('appointments')
        .select('id, title, start_time, end_time')
        .eq('company_id', company.id)
        .neq('id', id) // Excluir o próprio appointment
        .neq('status', 'cancelled')
        .or(`and(start_time.lte.${newStartTime},end_time.gte.${newStartTime}),and(start_time.lte.${newEndTime},end_time.gte.${newEndTime}),and(start_time.gte.${newStartTime},end_time.lte.${newEndTime})`);

      if (conflictError) {
        console.error('❌ Erro ao verificar conflitos:', conflictError);
        return res.status(500).json({
          error: 'Erro ao verificar conflitos',
          details: conflictError.message
        });
      }

      if (conflicts && conflicts.length > 0) {
        return res.status(409).json({
          error: 'Conflito de horário',
          message: 'Já existe um agendamento neste horário',
          conflicts: conflicts
        });
      }
    }

    // Preparar dados para atualização
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (start_time !== undefined) updateData.start_time = start_time;
    if (end_time !== undefined) updateData.end_time = end_time;
    if (location !== undefined) updateData.location = location;
    if (status !== undefined) updateData.status = status;
    if (create_meet !== undefined) updateData.create_meet = create_meet;
    if (all_day !== undefined) updateData.all_day = all_day;
    
    if (attendees !== undefined) {
      updateData.attendees = Array.isArray(attendees) 
        ? attendees.map(email => typeof email === 'string' 
            ? { email, displayName: email.split('@')[0] }
            : email)
        : [];
    }

    // Atualizar appointment
    const { data: updatedAppointment, error: updateError } = await req.supabase
      .from('appointments')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', company.id)
      .select('*')
      .single();

    if (updateError) {
      console.error('❌ Erro ao atualizar appointment:', updateError);
      return res.status(500).json({
        error: 'Erro ao atualizar agendamento',
        details: updateError.message
      });
    }

    console.log(`✅ Appointment ${id} atualizado`);

    // ✅ NOVO: Verificar múltiplas integrações com Google Calendar
    const googleIntegration = await checkGoogleCalendarIntegration(company.id, req.supabase);

    let googleEventInfo = null;
    if (googleIntegration.hasIntegration && existingAppointment.google_event_id) {
      console.log(`🔄 Tentando sincronizar mudanças com ${googleIntegration.integrations.length} agenda(s) do Google Calendar...`);
      
      googleEventInfo = {
        integration_status: 'sync_attempted',
        google_event_id: existingAppointment.google_event_id,
        message: `Sincronização de mudanças com ${googleIntegration.integrations.length} agenda(s) do Google Calendar será processada`,
        total_integrations: googleIntegration.integrations.length
      };
    }

    return res.json({
      success: true,
      message: 'Agendamento atualizado com sucesso',
      appointment: {
        id: updatedAppointment.id,
        title: updatedAppointment.title,
        description: updatedAppointment.description,
        start_time: updatedAppointment.start_time,
        end_time: updatedAppointment.end_time,
        location: updatedAppointment.location,
        status: updatedAppointment.status,
        attendees: updatedAppointment.attendees,
        lead_id: updatedAppointment.lead_id,
        google_event_id: updatedAppointment.google_event_id,
        google_meet_link: updatedAppointment.google_meet_link,
        updated_at: updatedAppointment.updated_at
      },
      google_calendar: googleEventInfo,
      timezone: companyTimezone,
      company: {
        id: company.id,
        name: company.name
      }
    });

  } catch (error) {
    console.error('❌ Erro em PUT /appointments/:id:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// ✅ 5. ENDPOINT ADICIONAL: Deletar agendamento
router.delete('/appointments/:id', async (req, res) => {
  try {
    const { company } = req;
    const { id } = req.params;

    // Verificar se appointment existe
    const { data: existingAppointment, error: findError } = await req.supabase
      .from('appointments')
      .select('*')
      .eq('id', id)
      .eq('company_id', company.id)
      .single();

    if (findError || !existingAppointment) {
      return res.status(404).json({
        error: 'Agendamento não encontrado',
        message: 'O agendamento não existe ou não pertence à empresa'
      });
    }

    // Deletar appointment
    const { error: deleteError } = await req.supabase
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('company_id', company.id);

    if (deleteError) {
      console.error('❌ Erro ao deletar appointment:', deleteError);
      return res.status(500).json({
        error: 'Erro ao deletar agendamento',
        details: deleteError.message
      });
    }

    console.log(`✅ Appointment ${id} deletado`);

    // ✅ NOVO: Verificar múltiplas integrações para deleção
    let googleEventInfo = null;
    if (existingAppointment.google_event_id) {
      console.log('🔄 Tentando deletar evento do Google Calendar...');
      
      // Verificar se ainda há integrações ativas
      const googleIntegration = await checkGoogleCalendarIntegration(company.id, req.supabase);
      
      googleEventInfo = {
        integration_status: 'deletion_attempted',
        google_event_id: existingAppointment.google_event_id,
        message: googleIntegration.hasIntegration 
          ? `Deleção do evento em ${googleIntegration.integrations.length} agenda(s) do Google Calendar será processada`
          : 'Deleção no Google Calendar não será processada (nenhuma integração ativa)',
        total_integrations: googleIntegration.hasIntegration ? googleIntegration.integrations.length : 0
      };
    }

    return res.json({
      success: true,
      message: 'Agendamento deletado com sucesso',
      deleted_appointment: {
        id: existingAppointment.id,
        title: existingAppointment.title,
        start_time: existingAppointment.start_time,
        end_time: existingAppointment.end_time
      },
      google_calendar: googleEventInfo,
      timezone: await getCompanyTimezone(company.id, req.supabase),
      company: {
        id: company.id,
        name: company.name
      }
    });

  } catch (error) {
    console.error('❌ Erro em DELETE /appointments/:id:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// ✅ 6. ENDPOINT NOVO: Listar Integrações do Google Calendar
router.get('/integrations', async (req, res) => {
  try {
    const { company } = req;

    // Obter todas as integrações do Google Calendar da empresa
    const { data: integrations, error } = await req.supabase
      .from('google_calendar_integrations')
      .select(`
        id, calendar_id, calendar_name, status, is_active,
        timezone, auto_create_meet, sync_enabled, 
        created_at, updated_at, last_sync_at,
        users!google_calendar_integrations_user_id_fkey(
          id, first_name, last_name, full_name, email
        )
      `)
      .eq('company_id', company.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Erro ao buscar integrações:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // Obter timezone da empresa
    const companyTimezone = await getCompanyTimezone(company.id, req.supabase);

    // Contar integrações por status
    const statusCount = {
      connected: integrations.filter(i => i.status === 'connected' && i.is_active).length,
      disconnected: integrations.filter(i => i.status === 'disconnected').length,
      error: integrations.filter(i => i.status === 'error').length,
      inactive: integrations.filter(i => !i.is_active).length,
      total: integrations.length
    };

    // Formatar resposta
    const formattedIntegrations = integrations.map(integration => ({
      id: integration.id,
      calendar_id: integration.calendar_id,
      calendar_name: integration.calendar_name || `Agenda ${integration.calendar_id}`,
      status: integration.status,
      is_active: integration.is_active,
      timezone: integration.timezone || companyTimezone,
      auto_create_meet: integration.auto_create_meet,
      sync_enabled: integration.sync_enabled,
      user: integration.users ? {
        id: integration.users.id,
        name: integration.users.full_name || `${integration.users.first_name} ${integration.users.last_name}`.trim(),
        email: integration.users.email
      } : null,
      created_at: integration.created_at,
      updated_at: integration.updated_at,
      last_sync_at: integration.last_sync_at
    }));

    return res.json({
      success: true,
      message: `${statusCount.total} integração(ões) encontrada(s)`,
      data: {
        integrations: formattedIntegrations,
        summary: {
          total_integrations: statusCount.total,
          active_integrations: statusCount.connected,
          status_breakdown: statusCount
        },
        company: {
          id: company.id,
          name: company.name,
          timezone: companyTimezone
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro em GET /integrations:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

// ✅ 7. ENDPOINT NOVO: Verificar Status de Múltiplas Integrações
router.get('/integrations/status', async (req, res) => {
  try {
    const { company } = req;

    const googleIntegration = await checkGoogleCalendarIntegration(company.id, req.supabase);
    const companyTimezone = await getCompanyTimezone(company.id, req.supabase);

    return res.json({
      success: true,
      data: {
        has_integration: googleIntegration.hasIntegration,
        total_active: googleIntegration.hasIntegration ? googleIntegration.integrations.length : 0,
        primary_calendar: googleIntegration.hasIntegration ? 
          (googleIntegration.primary.calendar_name || googleIntegration.primary.calendar_id) : null,
        integrations_summary: googleIntegration.hasIntegration ? 
          googleIntegration.integrations.map(integration => ({
            id: integration.id,
            calendar_name: integration.calendar_name || integration.calendar_id,
            status: integration.status,
            user_id: integration.user_id
          })) : [],
        error: googleIntegration.error || null,
        timezone: companyTimezone,
        company: {
          id: company.id,
          name: company.name
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro em GET /integrations/status:', error);
    return res.status(500).json({
      error: 'Erro interno do servidor',
      details: error.message
    });
  }
});

module.exports = router; 

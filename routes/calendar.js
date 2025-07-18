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

// ✅ HELPER NOVO: Validar se calendar_id pertence à empresa e está ativo
async function validateCalendarId(calendarId, companyId, supabase) {
  try {
    const { data: integration, error } = await supabase
      .from('google_calendar_integrations')
      .select('id, calendar_id, calendar_name, status, is_active, access_token, user_id')
      .eq('id', calendarId)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('status', 'connected')
      .single();

    if (error || !integration) {
      return {
        valid: false,
        error: 'Integração de calendário não encontrada ou inativa',
        integration: null
      };
    }

    if (!integration.access_token) {
      return {
        valid: false,
        error: 'Integração de calendário sem token de acesso válido',
        integration: null
      };
    }

    return {
      valid: true,
      integration: {
        id: integration.id,
        calendar_id: integration.calendar_id,
        calendar_name: integration.calendar_name,
        user_id: integration.user_id,
        access_token: integration.access_token
      }
    };
  } catch (error) {
    console.error('❌ Erro ao validar calendar_id:', error);
    return {
      valid: false,
      error: 'Erro interno ao validar integração de calendário',
      integration: null
    };
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

// ✅ 1. ENDPOINT: Verificar disponibilidade de horário (MODIFICADO - requer calendar_id)
router.get('/availability/:date', async (req, res) => {
  try {
    const { company } = req;
    const { date } = req.params;
    const { start_hour = '08:00', end_hour = '18:00', calendar_id } = req.query;

    // ✅ NOVO: Validar calendar_id obrigatório
    if (!calendar_id) {
      return res.status(400).json({
        error: 'Parâmetro obrigatório faltando',
        message: 'calendar_id é obrigatório. Use GET /api/calendar/integrations para listar as agendas disponíveis'
      });
    }

    // ✅ NOVO: Validar se calendar_id é válido para a empresa
    const calendarValidation = await validateCalendarId(calendar_id, company.id, req.supabase);
    if (!calendarValidation.valid) {
      return res.status(400).json({
        error: 'Agenda inválida',
        message: calendarValidation.error
      });
    }

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

    console.log(`🔍 Verificando disponibilidade para ${date} entre ${start_hour} e ${end_hour} na agenda ${calendarValidation.integration.calendar_name}`);

    // ✅ MODIFICADO: Buscar appointments do dia para a agenda específica
    const { data: appointments, error } = await req.supabase
      .from('appointments')
      .select('id, title, start_time, end_time, status, calendar_integration_id')
      .eq('company_id', company.id)
      .eq('calendar_integration_id', calendar_id)
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
      calendar_info: {
        id: calendarValidation.integration.id,
        name: calendarValidation.integration.calendar_name,
        calendar_id: calendarValidation.integration.calendar_id
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

// ✅ 2. ENDPOINT: Agendar horário (MODIFICADO - requer calendar_id)
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
      all_day = false,
      calendar_id
    } = req.body;

    // ✅ NOVO: Validar calendar_id obrigatório
    if (!calendar_id) {
      return res.status(400).json({
        error: 'Parâmetro obrigatório faltando',
        message: 'calendar_id é obrigatório no body da requisição. Use GET /api/calendar/integrations para listar as agendas disponíveis'
      });
    }

    // ✅ NOVO: Validar se calendar_id é válido para a empresa
    const calendarValidation = await validateCalendarId(calendar_id, company.id, req.supabase);
    if (!calendarValidation.valid) {
      return res.status(400).json({
        error: 'Agenda inválida',
        message: calendarValidation.error
      });
    }

    // Obter timezone da empresa
    const companyTimezone = await getCompanyTimezone(company.id, req.supabase);

    // Validações obrigatórias
    if (!title || !start_time || !end_time) {
      return res.status(400).json({
        error: 'Dados obrigatórios faltando',
        message: 'title, start_time, end_time e calendar_id são obrigatórios'
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

    console.log(`📅 Agendando: ${title} para ${start_time} - ${end_time} na agenda ${calendarValidation.integration.calendar_name}`);

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

    // ✅ MODIFICADO: Verificar conflitos de horário na agenda específica
    const { data: conflicts, error: conflictError } = await req.supabase
      .from('appointments')
      .select('id, title, start_time, end_time')
      .eq('company_id', company.id)
      .eq('calendar_integration_id', calendar_id)
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
        message: 'Já existe um agendamento neste horário nesta agenda',
        conflicts: conflicts,
        calendar_info: {
          id: calendarValidation.integration.id,
          name: calendarValidation.integration.calendar_name
        }
      });
    }

    // Preparar dados dos participantes
    const attendeesJson = Array.isArray(attendees) 
      ? attendees.map(email => typeof email === 'string' 
          ? { email, displayName: email.split('@')[0] }
          : email)
      : [];

    // ✅ MODIFICADO: Criar appointment no banco com calendar_integration_id
    const { data: appointment, error: createError } = await req.supabase
      .from('appointments')
      .insert({
        company_id: company.id,
        calendar_integration_id: calendar_id,
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

    // ✅ MODIFICADO: Usar a integração específica para sincronização
    let googleEventInfo = {
      integration_status: 'sync_attempted',
      message: `Sincronização com agenda ${calendarValidation.integration.calendar_name} será processada`,
      calendar_info: {
        id: calendarValidation.integration.id,
        name: calendarValidation.integration.calendar_name,
        calendar_id: calendarValidation.integration.calendar_id
      }
    };

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
        calendar_integration_id: appointment.calendar_integration_id,
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

// ✅ 3. ENDPOINT: Listar agendamentos (MODIFICADO - aceita calendar_id como filtro)
router.get('/appointments', async (req, res) => {
  try {
    const { company } = req;
    const { 
      date,
      start_date,
      end_date,
      status,
      lead_id,
      calendar_id,
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
        lead_id, calendar_integration_id, created_at, updated_at,
        leads(id, title, status),
        users!appointments_created_by_fkey(id, first_name, last_name, full_name),
        google_calendar_integrations!appointments_calendar_integration_id_fkey(id, calendar_name, calendar_id)
      `)
      .eq('company_id', company.id)
      .order('start_time', { ascending: true });

    // ✅ NOVO: Filtro por calendar_id específico
    if (calendar_id) {
      // Validar se calendar_id é válido para a empresa
      const calendarValidation = await validateCalendarId(calendar_id, company.id, req.supabase);
      if (!calendarValidation.valid) {
        return res.status(400).json({
          error: 'Agenda inválida',
          message: calendarValidation.error
        });
      }
      query = query.eq('calendar_integration_id', calendar_id);
    }

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
      calendar_info: apt.google_calendar_integrations ? {
        id: apt.calendar_integration_id,
        name: apt.google_calendar_integrations.calendar_name,
        calendar_id: apt.google_calendar_integrations.calendar_id
      } : null,
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
        lead_id,
        calendar_id
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

// ✅ 4. ENDPOINT: Cancelar/Editar agendamento (MODIFICADO - mantém calendar_id)
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
      all_day,
      calendar_id // ✅ NOVO: Permitir trocar de agenda
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

    // ✅ NOVO: Se calendar_id foi fornecido, validar se é válido
    let targetCalendarId = existingAppointment.calendar_integration_id;
    let calendarValidation = null;
    
    if (calendar_id && calendar_id !== existingAppointment.calendar_integration_id) {
      calendarValidation = await validateCalendarId(calendar_id, company.id, req.supabase);
      if (!calendarValidation.valid) {
        return res.status(400).json({
          error: 'Agenda inválida',
          message: calendarValidation.error
        });
      }
      targetCalendarId = calendar_id;
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

    // ✅ MODIFICADO: Verificar conflitos na agenda específica (se mudando horário ou agenda)
    if (start_time || end_time || calendar_id) {
      const { data: conflicts, error: conflictError } = await req.supabase
        .from('appointments')
        .select('id, title, start_time, end_time')
        .eq('company_id', company.id)
        .eq('calendar_integration_id', targetCalendarId)
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
          message: 'Já existe um agendamento neste horário na agenda especificada',
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
    if (calendar_id !== undefined) updateData.calendar_integration_id = calendar_id;
    
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

    // ✅ MODIFICADO: Informações sobre sincronização (considerando possível mudança de agenda)
    let googleEventInfo = {
      integration_status: 'sync_attempted',
      google_event_id: existingAppointment.google_event_id,
      message: calendar_id ? 
        `Agendamento movido para nova agenda. Sincronização será processada` :
        `Sincronização de mudanças será processada`,
      calendar_changed: !!calendar_id
    };

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
        calendar_integration_id: updatedAppointment.calendar_integration_id,
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

// ✅ 5. ENDPOINT ADICIONAL: Deletar agendamento (sem modificação necessária)
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

    // ✅ MODIFICADO: Informações sobre deleção
    let googleEventInfo = null;
    if (existingAppointment.google_event_id) {
      console.log('🔄 Tentando deletar evento do Google Calendar...');
      
      googleEventInfo = {
        integration_status: 'deletion_attempted',
        google_event_id: existingAppointment.google_event_id,
        message: 'Deleção do evento no Google Calendar será processada',
        calendar_integration_id: existingAppointment.calendar_integration_id
      };
    }

    return res.json({
      success: true,
      message: 'Agendamento deletado com sucesso',
      deleted_appointment: {
        id: existingAppointment.id,
        title: existingAppointment.title,
        start_time: existingAppointment.start_time,
        end_time: existingAppointment.end_time,
        calendar_integration_id: existingAppointment.calendar_integration_id
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

// ✅ 6. ENDPOINT: Listar Integrações do Google Calendar (sem modificação necessária)
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

// ✅ 7. ENDPOINT: Verificar Status de Múltiplas Integrações (sem modificação necessária)
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

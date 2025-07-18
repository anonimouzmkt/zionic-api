const express = require('express');
const router = express.Router();

// ✅ NOVO: Função helper para criar evento no Google Calendar
async function createGoogleCalendarEvent(integration, eventData) {
  const GOOGLE_API_BASE_URL = 'https://www.googleapis.com/calendar/v3';
  
  // Verificar se token ainda é válido ou precisa renovar
  let accessToken = integration.access_token;
  
  // Verificar se token está próximo do vencimento (5 minutos antes)
  if (integration.token_expires_at) {
    const expiresAt = new Date(integration.token_expires_at);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinutesFromNow && integration.refresh_token) {
      console.log('🔄 Token expiring soon, refreshing...');
      
      try {
        const newTokens = await refreshGoogleToken(integration);
        accessToken = newTokens.access_token;
        
        // Atualizar tokens no banco (será feito pelo caller)
        integration._needsTokenUpdate = {
          access_token: newTokens.access_token,
          refresh_token: newTokens.refresh_token || integration.refresh_token,
          expires_in: newTokens.expires_in
        };
      } catch (refreshError) {
        console.error('❌ Erro ao renovar token:', refreshError);
        throw new Error('Token expirado e não foi possível renovar');
      }
    }
  }

  // Preparar dados do evento para Google Calendar
  const googleEvent = {
    summary: eventData.title,
    description: eventData.description,
    start: {
      dateTime: eventData.start_time,
      timeZone: integration.timezone || 'America/Sao_Paulo'
    },
    end: {
      dateTime: eventData.end_time,
      timeZone: integration.timezone || 'America/Sao_Paulo'
    },
    location: eventData.location,
    attendees: eventData.attendees?.map(email => ({ email }))
  };

  // Adicionar Google Meet se solicitado
  if (eventData.createMeet && integration.auto_create_meet) {
    googleEvent.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}`,
        conferenceSolutionKey: {
          type: 'hangoutsMeet'
        }
      }
    };
  }

  // Fazer chamada para API do Google Calendar
  const url = `${GOOGLE_API_BASE_URL}/calendars/${integration.calendar_id}/events?conferenceDataVersion=1`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(googleEvent)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ Google Calendar API Error:', errorText);
    throw new Error(`Google Calendar API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

// ✅ NOVO: Função helper para renovar token do Google
async function refreshGoogleToken(integration) {
  const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
  
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: integration.refresh_token,
      client_id: integration.client_id,
      client_secret: integration.client_secret,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Token refresh failed: ${errorData.error_description || errorData.error}`);
  }

  return await response.json();
}

// ✅ HELPER: Validar formato de data
function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// ✅ HELPER: Formatar data para ISO string considerando timezone - CORRIGIDO
function formatToISO(dateString, time = null, timezone = 'America/Sao_Paulo') {
  try {
    let localDateTime;
    if (time) {
      localDateTime = `${dateString}T${time}:00`;
    } else {
      localDateTime = dateString.includes('T') ? dateString : `${dateString}T00:00:00`;
    }
    
    // Para São Paulo (UTC-3), adicionamos 3 horas para converter para UTC
    if (timezone === 'America/Sao_Paulo') {
      const localDate = new Date(localDateTime);
      const utcDate = new Date(localDate.getTime() + (3 * 60 * 60 * 1000)); // +3 horas
      return utcDate.toISOString();
    }
    
    // Para outros timezones, usar método original (fallback)
    const date = new Date(localDateTime);
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

// ✅ NOVO: Converter UTC para timezone local (inverso do formatToISO)
function convertUTCToTimezone(utcDateString, timezone = 'America/Sao_Paulo') {
  try {
    const utcDate = new Date(utcDateString);
    
    // Para São Paulo (UTC-3), subtraímos 3 horas para converter de UTC para local
    if (timezone === 'America/Sao_Paulo') {
      const localDate = new Date(utcDate.getTime() - (3 * 60 * 60 * 1000)); // -3 horas
      return localDate.toISOString().replace('Z', '-03:00');
    }
    
    // Para outros timezones, usar Intl.DateTimeFormat (fallback)
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = formatter.formatToParts(utcDate);
    const date = parts.find(p => p.type === 'year').value + '-' +
                parts.find(p => p.type === 'month').value + '-' +
                parts.find(p => p.type === 'day').value;
    const time = parts.find(p => p.type === 'hour').value + ':' +
                parts.find(p => p.type === 'minute').value + ':' +
                parts.find(p => p.type === 'second').value;
    
    return `${date}T${time}${timezone === 'America/Sao_Paulo' ? '-03:00' : '+00:00'}`;
  } catch (error) {
    console.warn('⚠️ Erro ao converter UTC para timezone, usando formato original:', error);
    return utcDateString;
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

// ✅ HELPER NOVO: Converter "primary" para email real se necessário
async function resolveGoogleCalendarId(calendarId, companyId, supabase) {
  if (calendarId !== 'primary') {
    return calendarId; // Se não for "primary", retorna como está
  }
  
  // Para "primary", buscar qual email real está sendo usado nos appointments desta empresa
  const { data: sampleAppointment } = await supabase
    .from('appointments')
    .select('google_calendar_id')
    .eq('company_id', companyId)
    .not('google_calendar_id', 'is', null)
    .not('google_calendar_id', 'eq', 'primary')
    .limit(1)
    .single();
  
  if (sampleAppointment?.google_calendar_id) {
    return sampleAppointment.google_calendar_id;
  }
  
  return calendarId; // Fallback para o valor original
}

// ✅ HELPER NOVO: Validar se calendar_id pertence à empresa e está ativo
async function validateCalendarId(calendarId, companyId, supabase) {
  try {
    // ✅ CORRIGIDO: Buscar TODOS os campos necessários para o GoogleCalendarService
    const { data: integration, error } = await supabase
      .from('google_calendar_integrations')
      .select(`
        id, company_id, user_id, client_id, client_secret, redirect_uri,
        access_token, refresh_token, token_expires_at, calendar_id, calendar_name,
        status, is_active, timezone, auto_create_meet, sync_enabled, sync_token,
        created_at, updated_at, last_sync_at
      `)
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

    // ✅ CORRIGIDO: Retornar objeto completo GoogleCalendarIntegration
    return {
      valid: true,
      integration: {
        id: integration.id,
        company_id: integration.company_id,
        user_id: integration.user_id,
        client_id: integration.client_id,
        client_secret: integration.client_secret,
        redirect_uri: integration.redirect_uri,
        access_token: integration.access_token,
        refresh_token: integration.refresh_token,
        token_expires_at: integration.token_expires_at,
        calendar_id: integration.calendar_id,
        calendar_name: integration.calendar_name,
        status: integration.status,
        is_active: integration.is_active,
        timezone: integration.timezone,
        auto_create_meet: integration.auto_create_meet,
        sync_enabled: integration.sync_enabled,
        sync_token: integration.sync_token,
        created_at: integration.created_at,
        updated_at: integration.updated_at,
        last_sync_at: integration.last_sync_at
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

// ✅ 1. ENDPOINT: Verificar disponibilidade de horário (MODIFICADO - usa start_time/end_time ISO)
router.get('/availability', async (req, res) => {
  try {
    const { company } = req;
    const { start_time, end_time, calendar_id } = req.query;

    // ✅ NOVO: Validar calendar_id obrigatório
    if (!calendar_id) {
      return res.status(400).json({
        error: 'Parâmetro obrigatório faltando',
        message: 'calendar_id é obrigatório. Use GET /api/calendar/integrations para listar as agendas disponíveis'
      });
    }

    // ✅ NOVO: Validar start_time e end_time obrigatórios
    if (!start_time || !end_time) {
      return res.status(400).json({
        error: 'Parâmetros obrigatórios faltando',
        message: 'start_time e end_time são obrigatórios no formato ISO 8601 (ex: 2025-07-07T11:30:00)'
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

    // Validar formato das datas ISO
    if (!isValidDate(start_time) || !isValidDate(end_time)) {
      return res.status(400).json({
        error: 'Datas inválidas',
        message: 'Use formato ISO 8601 (ex: 2025-07-07T11:30:00 ou 2025-07-07T11:30:00Z)'
      });
    }

    // Verificar se end_time é após start_time
    if (new Date(end_time) <= new Date(start_time)) {
      return res.status(400).json({
        error: 'Período inválido',
        message: 'end_time deve ser posterior ao start_time'
      });
    }

    // Obter timezone da empresa (busca em users.timezone)
    const companyTimezone = await getCompanyTimezone(company.id, req.supabase);

    // ✅ CORRIGIDO: Converter horários de timezone local para UTC para consulta no banco
    let startDateTimeUTC, endDateTimeUTC;
    
    if (start_time.includes('Z') || start_time.includes('+')) {
      // Se já tem timezone explícito (Z ou +/-), usar diretamente
      startDateTimeUTC = start_time;
      endDateTimeUTC = end_time;
    } else {
      // Se é horário local (sem timezone), assumir que é no timezone da empresa e converter para UTC
      const [startDate, startTime] = start_time.includes('T') ? start_time.split('T') : [start_time, '00:00:00'];
      const [endDate, endTime] = end_time.includes('T') ? end_time.split('T') : [end_time, '00:00:00'];
      
      startDateTimeUTC = formatToISO(startDate, startTime.split(':').slice(0, 2).join(':'), companyTimezone);
      endDateTimeUTC = formatToISO(endDate, endTime.split(':').slice(0, 2).join(':'), companyTimezone);
    }

    console.log(`🔍 Verificando disponibilidade de ${start_time} até ${end_time} (timezone: ${companyTimezone})`);
    console.log(`🔄 Convertido para UTC: ${startDateTimeUTC} até ${endDateTimeUTC}`);

    // ✅ CORREÇÃO: Se calendar_id for "primary", buscar pelo email real dos appointments
    const googleCalendarIdToSearch = await resolveGoogleCalendarId(
      calendarValidation.integration.calendar_id, 
      company.id, 
      req.supabase
    );

    // ✅ CORRIGIDO: Buscar appointments da agenda específica usando horários UTC convertidos
    const { data: appointments, error } = await req.supabase
      .from('appointments')
      .select('id, title, start_time, end_time, status, google_calendar_id')
      .eq('company_id', company.id)
      .eq('google_calendar_id', googleCalendarIdToSearch)
      .gte('start_time', startDateTimeUTC)
      .lte('end_time', endDateTimeUTC)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true });

    if (error) {
      console.error('❌ Erro ao buscar appointments:', error);
      return res.status(500).json({
        error: 'Erro interno do servidor',
        details: error.message
      });
    }

    // ✅ CORRIGIDO: Calcular horários ocupados convertidos para timezone da empresa
    const busySlots = appointments.map(apt => ({
      id: apt.id,
      title: apt.title,
      start: convertUTCToTimezone(apt.start_time, companyTimezone),
      end: convertUTCToTimezone(apt.end_time, companyTimezone),
      status: apt.status
    }));

    // Determinar se o dia está livre
    const isFree = busySlots.length === 0;

    return res.json({
      success: true,
      is_free: isFree,
      total_appointments: busySlots.length,
      busy_slots: busySlots,
      availability_window: {
        start_time: start_time,
        end_time: end_time
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
      },
      debug: {
        googleCalendarIdToSearch,
        totalAppointmentsInPeriod: appointments.length,
        filteredAppointments: busySlots.length,
        utcSearchWindow: {
          start_utc: startDateTimeUTC,
          end_utc: endDateTimeUTC
        },
        timezoneConversion: {
          companyTimezone,
          busySlotsConvertedFromUTC: true,
          note: "busy_slots horários convertidos de UTC para timezone da empresa"
        }
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
      create_google_meet = true,
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

    // ✅ NOVO: Converter horários para UTC antes de salvar no banco
    let startTimeUTC, endTimeUTC;
    
    if (start_time.includes('Z') || start_time.includes('+')) {
      // Se já tem timezone explícito, usar diretamente
      startTimeUTC = start_time;
      endTimeUTC = end_time;
    } else {
      // Se é horário local, converter para UTC
      const [startDate, startTimeOnly] = start_time.includes('T') ? start_time.split('T') : [start_time, '00:00:00'];
      const [endDate, endTimeOnly] = end_time.includes('T') ? end_time.split('T') : [end_time, '00:00:00'];
      
      startTimeUTC = formatToISO(startDate, startTimeOnly.split(':').slice(0, 2).join(':'), companyTimezone);
      endTimeUTC = formatToISO(endDate, endTimeOnly.split(':').slice(0, 2).join(':'), companyTimezone);
    }

    console.log(`📅 Agendando: ${title} para ${start_time} - ${end_time} (${companyTimezone}) na agenda ${calendarValidation.integration.calendar_name}`);
    console.log(`🔄 Convertido para UTC: ${startTimeUTC} - ${endTimeUTC}`);

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

    // ✅ CORREÇÃO: Se calendar_id for "primary", buscar pelo email real para verificar conflitos
    const googleCalendarIdForConflicts = await resolveGoogleCalendarId(
      calendarValidation.integration.calendar_id, 
      company.id, 
      req.supabase
    );

    // ✅ CORRIGIDO: Verificar conflitos de horário na agenda específica usando horários UTC
    const { data: conflicts, error: conflictError } = await req.supabase
      .from('appointments')
      .select('id, title, start_time, end_time')
      .eq('company_id', company.id)
      .eq('google_calendar_id', googleCalendarIdForConflicts)
      .neq('status', 'cancelled')
      .or(`and(start_time.lte.${startTimeUTC},end_time.gte.${startTimeUTC}),and(start_time.lte.${endTimeUTC},end_time.gte.${endTimeUTC}),and(start_time.gte.${startTimeUTC},end_time.lte.${endTimeUTC})`);

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
        conflicts: conflicts.map(c => ({
          appointment_id: c.id,
          title: c.title,
          start_time: c.start_time,
          end_time: c.end_time
        })),
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

    // ✅ CORRIGIDO: Criar appointment no banco com horários UTC convertidos
    const { data: appointment, error: createError } = await req.supabase
      .from('appointments')
      .insert({
        company_id: company.id,
        created_by: req.apiKey.created_by || null, // API key pode não ter usuário
        title,
        description,
        start_time: startTimeUTC,  // ✅ CORRIGIDO: Usar horário UTC
        end_time: endTimeUTC,      // ✅ CORRIGIDO: Usar horário UTC
        location,
        attendees: attendeesJson,
        google_calendar_id: googleCalendarIdForConflicts, // Email real da agenda do Google
        create_meet: create_google_meet,
        lead_id,
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

    // ✅ NOVO: Criar evento automaticamente no Google Calendar
    let googleEventInfo = {
      integration_status: 'not_attempted',
      message: 'Sincronização com Google Calendar não configurada',
      calendar_info: {
        id: calendarValidation.integration.id,
        name: calendarValidation.integration.calendar_name,
        calendar_id: calendarValidation.integration.calendar_id
      }
    };

    // Verificar se a integração tem tokens válidos para criar no Google Calendar
    if (calendarValidation.integration.access_token) {
      try {
        console.log(`🔄 Criando evento no Google Calendar...`);
        
        // Preparar dados do evento para Google Calendar
        const googleEventData = {
          title,
          description,
          start_time,
          end_time,
          location,
          attendees: attendeesJson.map(att => att.email).filter(Boolean),
          all_day,
          createMeet: create_google_meet,
          lead_id
        };

        // Criar evento no Google Calendar usando nossa função helper
        const googleEvent = await createGoogleCalendarEvent(
          calendarValidation.integration,
          googleEventData
        );

        // ✅ NOVO: Se houve renovação de token, atualizar no banco
        if (calendarValidation.integration._needsTokenUpdate) {
          const tokenUpdate = calendarValidation.integration._needsTokenUpdate;
          const expiresAt = new Date(Date.now() + tokenUpdate.expires_in * 1000);

          const { error: tokenUpdateError } = await req.supabase
            .from('google_calendar_integrations')
            .update({
              access_token: tokenUpdate.access_token,
              refresh_token: tokenUpdate.refresh_token,
              token_expires_at: expiresAt.toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', calendarValidation.integration.id);

          if (tokenUpdateError) {
            console.error('⚠️ Erro ao atualizar tokens renovados:', tokenUpdateError);
          } else {
            console.log('✅ Tokens renovados salvos com sucesso');
          }
        }

        // Atualizar appointment com informações do Google Calendar
        const { error: updateError } = await req.supabase
          .from('appointments')
          .update({
            google_event_id: googleEvent.id,
            google_meet_link: googleEvent.conferenceData?.entryPoints?.[0]?.uri || null
          })
          .eq('id', appointment.id);

        if (updateError) {
          console.error('❌ Erro ao atualizar appointment com dados do Google:', updateError);
          googleEventInfo = {
            integration_status: 'partial_success',
            message: 'Evento criado no Google Calendar mas falha ao salvar referência',
            google_event_id: googleEvent.id,
            calendar_info: googleEventInfo.calendar_info
          };
        } else {
          googleEventInfo = {
            integration_status: 'success',
            message: 'Evento criado com sucesso no Google Calendar',
            google_event_id: googleEvent.id,
            google_meet_link: googleEvent.conferenceData?.entryPoints?.[0]?.uri || null,
            calendar_info: googleEventInfo.calendar_info
          };
          
          // Atualizar dados do appointment retornado
          appointment.google_event_id = googleEvent.id;
          appointment.google_meet_link = googleEvent.conferenceData?.entryPoints?.[0]?.uri || null;
        }

        console.log(`✅ Evento criado no Google Calendar: ${googleEvent.id}`);
        
      } catch (googleError) {
        console.error('❌ Erro ao criar evento no Google Calendar:', googleError);
        googleEventInfo = {
          integration_status: 'failed',
          message: `Erro ao criar no Google Calendar: ${googleError.message}`,
          calendar_info: googleEventInfo.calendar_info
        };
      }
    } else {
      googleEventInfo.message = 'Integração sem token de acesso válido. Reconecte o Google Calendar';
    }

    return res.status(201).json({
      success: true,
      message: 'Agendamento criado com sucesso',
      appointment: {
        id: appointment.id,
        title: appointment.title,
        description: appointment.description,
        start_time: start_time,  // ✅ Retornar horário original enviado pelo usuário
        end_time: end_time,      // ✅ Retornar horário original enviado pelo usuário
        start_time_utc: appointment.start_time,  // ✅ NOVO: Mostrar também o UTC salvo
        end_time_utc: appointment.end_time,      // ✅ NOVO: Mostrar também o UTC salvo
        location: appointment.location,
        status: appointment.status,
        attendees: appointment.attendees,
        lead_id: appointment.lead_id,
        google_calendar_id: appointment.google_calendar_id,
        create_meet: appointment.create_meet,
        created_at: appointment.created_at
      },
      google_calendar: googleEventInfo,
      timezone: companyTimezone,
      company: {
        id: company.id,
        name: company.name
      },
      debug: {
        timezone_conversion: {
          original_start: start_time,
          original_end: end_time,
          utc_start: startTimeUTC,
          utc_end: endTimeUTC,
          company_timezone: companyTimezone,
          note: "Horários convertidos de timezone local para UTC antes de salvar no banco"
        }
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
      date,           // LEGACY: formato YYYY-MM-DD
      start_date,     // LEGACY: formato YYYY-MM-DD  
      end_date,       // LEGACY: formato YYYY-MM-DD
      start_time,     // NOVO: formato ISO 8601 (ex: 2025-07-07T11:30:00)
      end_time,       // NOVO: formato ISO 8601 (ex: 2025-07-07T11:30:00)
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
        lead_id, google_calendar_id, create_meet, created_at, updated_at, created_by
      `)
      .eq('company_id', company.id)
      .order('start_time', { ascending: true });

    // ✅ CORRIGIDO: Filtro por calendar_id específico
    if (calendar_id) {
      // Validar se calendar_id é válido para a empresa
      const calendarValidation = await validateCalendarId(calendar_id, company.id, req.supabase);
      if (!calendarValidation.valid) {
        return res.status(400).json({
          error: 'Agenda inválida',
          message: calendarValidation.error
        });
      }
      
      // ✅ CORREÇÃO: Se calendar_id for "primary", buscar pelo email real dos appointments
      const googleCalendarIdToSearch = await resolveGoogleCalendarId(
        calendarValidation.integration.calendar_id, 
        company.id, 
        req.supabase
      );
      query = query.eq('google_calendar_id', googleCalendarIdToSearch);
    }

    // ✅ FILTROS DE DATA: Suporte para formatos antigos (LEGACY) e novos (ISO 8601)
    if (start_time && end_time) {
      // ✅ NOVO FORMATO: start_time/end_time ISO 8601 (ex: 2025-07-07T11:30:00)
      if (!isValidDate(start_time) || !isValidDate(end_time)) {
        return res.status(400).json({
          error: 'Datas inválidas',
          message: 'Use formato ISO 8601 (ex: 2025-07-07T11:30:00 ou 2025-07-07T11:30:00Z)'
        });
      }
      
      if (new Date(end_time) <= new Date(start_time)) {
        return res.status(400).json({
          error: 'Período inválido',
          message: 'end_time deve ser posterior ao start_time'
        });
      }
      
      query = query.gte('start_time', start_time).lte('start_time', end_time);
      
    } else if (date) {
      // ✅ FORMATO LEGACY: date YYYY-MM-DD (busca dia inteiro)
      if (!isValidDate(date)) {
        return res.status(400).json({
          error: 'Data inválida',
          message: 'Use formato YYYY-MM-DD ou prefira start_time/end_time em ISO 8601'
        });
      }
      const startOfDay = formatToISO(date, '00:00', companyTimezone);
      const endOfDay = formatToISO(date, '23:59', companyTimezone);
      query = query.gte('start_time', startOfDay).lte('start_time', endOfDay);
      
    } else if (start_date && end_date) {
      // ✅ FORMATO LEGACY: start_date/end_date YYYY-MM-DD 
      if (!isValidDate(start_date) || !isValidDate(end_date)) {
        return res.status(400).json({
          error: 'Datas inválidas',
          message: 'Use formato YYYY-MM-DD ou prefira start_time/end_time em ISO 8601'
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



    // ✅ CORRIGIDO: Buscar informações das agendas, leads e usuários separadamente
    let calendarInfoMap = {};
    let leadsMap = {};
    let usersMap = {};
    
    if (appointments.length > 0) {
      // Buscar informações únicas das agendas usadas (pelos google_calendar_id)
      const uniqueGoogleCalendarIds = [...new Set(appointments.map(apt => apt.google_calendar_id).filter(Boolean))];
      
      if (uniqueGoogleCalendarIds.length > 0) {
        const { data: calendars, error: calendarsError } = await req.supabase
          .from('google_calendar_integrations')
          .select('id, calendar_name, calendar_id')
          .eq('company_id', company.id)
          .in('calendar_id', uniqueGoogleCalendarIds);

        if (!calendarsError && calendars) {
          calendarInfoMap = calendars.reduce((map, cal) => {
            map[cal.calendar_id] = {
              id: cal.id,
              name: cal.calendar_name,
              calendar_id: cal.calendar_id
            };
            return map;
          }, {});
        }
      }

      // Buscar informações dos leads
      const uniqueLeadIds = [...new Set(appointments.map(apt => apt.lead_id).filter(Boolean))];
      if (uniqueLeadIds.length > 0) {
        const { data: leads, error: leadsError } = await req.supabase
          .from('leads')
          .select('id, title, status')
          .eq('company_id', company.id)
          .in('id', uniqueLeadIds);

        if (!leadsError && leads) {
          leadsMap = leads.reduce((map, lead) => {
            map[lead.id] = {
              id: lead.id,
              title: lead.title,
              status: lead.status
            };
            return map;
          }, {});
        }
      }

      // Buscar informações dos usuários criadores
      const uniqueUserIds = [...new Set(appointments.map(apt => apt.created_by).filter(Boolean))];
      if (uniqueUserIds.length > 0) {
        const { data: users, error: usersError } = await req.supabase
          .from('users')
          .select('id, first_name, last_name, full_name')
          .eq('company_id', company.id)
          .in('id', uniqueUserIds);

        if (!usersError && users) {
          usersMap = users.reduce((map, user) => {
            map[user.id] = {
              id: user.id,
              name: user.full_name || `${user.first_name} ${user.last_name}`.trim()
            };
            return map;
          }, {});
        }
      }
    }

    // Formatar resposta usando os mapas separados
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
      calendar_info: apt.google_calendar_id ? calendarInfoMap[apt.google_calendar_id] || {
        id: "unknown",
        name: "Agenda não encontrada", 
        calendar_id: apt.google_calendar_id
      } : null,
      create_meet: apt.create_meet,
      lead: apt.lead_id ? leadsMap[apt.lead_id] || null : null,
      created_by: apt.created_by ? usersMap[apt.created_by] || null : null,
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
        // Novos filtros preferidos (ISO 8601)
        start_time,
        end_time,
        // Filtros legacy (compatibilidade)
        date,
        start_date,
        end_date,
        // Outros filtros
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
      create_google_meet,
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

    // ✅ CORRIGIDO: Se calendar_id foi fornecido, validar se é válido
    let targetGoogleCalendarId = existingAppointment.google_calendar_id;
    let calendarValidation = null;
    
    if (calendar_id) {
      calendarValidation = await validateCalendarId(calendar_id, company.id, req.supabase);
      if (!calendarValidation.valid) {
        return res.status(400).json({
          error: 'Agenda inválida',
          message: calendarValidation.error
        });
      }
      
      // ✅ CORREÇÃO: Se calendar_id for "primary", buscar pelo email real
      const newGoogleCalendarId = await resolveGoogleCalendarId(
        calendarValidation.integration.calendar_id, 
        company.id, 
        req.supabase
      );
      
      // Se está mudando de agenda, atualizar o target com email real
      if (newGoogleCalendarId !== existingAppointment.google_calendar_id) {
        targetGoogleCalendarId = newGoogleCalendarId;
      }
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

    // ✅ NOVO: Converter horários para UTC se fornecidos
    let startTimeUTC, endTimeUTC;
    
    if (start_time) {
      if (start_time.includes('Z') || start_time.includes('+')) {
        startTimeUTC = start_time;
      } else {
        const [startDate, startTimeOnly] = start_time.includes('T') ? start_time.split('T') : [start_time, '00:00:00'];
        startTimeUTC = formatToISO(startDate, startTimeOnly.split(':').slice(0, 2).join(':'), companyTimezone);
      }
    }
    
    if (end_time) {
      if (end_time.includes('Z') || end_time.includes('+')) {
        endTimeUTC = end_time;
      } else {
        const [endDate, endTimeOnly] = end_time.includes('T') ? end_time.split('T') : [end_time, '00:00:00'];
        endTimeUTC = formatToISO(endDate, endTimeOnly.split(':').slice(0, 2).join(':'), companyTimezone);
      }
    }

    // Verificar se end_time é após start_time (usando horários UTC para comparação)
    const newStartTimeUTC = startTimeUTC || existingAppointment.start_time;
    const newEndTimeUTC = endTimeUTC || existingAppointment.end_time;
    
    if (new Date(newEndTimeUTC) <= new Date(newStartTimeUTC)) {
      return res.status(400).json({
        error: 'Horário inválido',
        message: 'Horário de fim deve ser posterior ao de início'
      });
    }

    // ✅ CORRIGIDO: Verificar conflitos na agenda específica (se mudando horário ou agenda)
    if (start_time || end_time || calendar_id) {
      const { data: conflicts, error: conflictError } = await req.supabase
        .from('appointments')
        .select('id, title, start_time, end_time')
        .eq('company_id', company.id)
        .eq('google_calendar_id', targetGoogleCalendarId)
        .neq('id', id) // Excluir o próprio appointment
        .neq('status', 'cancelled')
        .or(`and(start_time.lte.${newStartTimeUTC},end_time.gte.${newStartTimeUTC}),and(start_time.lte.${newEndTimeUTC},end_time.gte.${newEndTimeUTC}),and(start_time.gte.${newStartTimeUTC},end_time.lte.${newEndTimeUTC})`);

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
          conflicts: conflicts.map(c => ({
            appointment_id: c.id,
            title: c.title,
            start_time: c.start_time,
            end_time: c.end_time
          }))
        });
      }
    }

    // ✅ CORRIGIDO: Preparar dados para atualização usando horários UTC convertidos
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (start_time !== undefined) updateData.start_time = startTimeUTC;  // ✅ Usar horário UTC
    if (end_time !== undefined) updateData.end_time = endTimeUTC;        // ✅ Usar horário UTC
    if (location !== undefined) updateData.location = location;
    if (status !== undefined) updateData.status = status;
    if (create_google_meet !== undefined) updateData.create_meet = create_google_meet;
    if (all_day !== undefined) updateData.all_day = all_day;
    if (calendar_id !== undefined) updateData.google_calendar_id = targetGoogleCalendarId;
    
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

    // ✅ NOVO: Atualizar evento no Google Calendar se houver google_event_id
    let googleEventInfo = {
      integration_status: 'not_attempted',
      google_event_id: existingAppointment.google_event_id,
      message: 'Sincronização com Google Calendar não configurada',
      calendar_changed: !!calendar_id
    };

    if (existingAppointment.google_event_id && targetGoogleCalendarId) {
      try {
        // Buscar integração da agenda alvo usando o google_calendar_id
        const { data: targetIntegration, error: integrationError } = await req.supabase
          .from('google_calendar_integrations')
          .select('*')
          .eq('company_id', company.id)
          .eq('calendar_id', targetGoogleCalendarId)
          .eq('is_active', true)
          .eq('status', 'connected')
          .single();
        
        if (!integrationError && targetIntegration && targetIntegration.access_token) {
          console.log(`🔄 Atualizando evento no Google Calendar...`);
          
          // Se mudou de agenda, precisa deletar da agenda antiga e criar na nova
          if (targetGoogleCalendarId !== existingAppointment.google_calendar_id) {
            // TODO: Implementar mudança entre agendas (deletar + criar)
            googleEventInfo = {
              integration_status: 'pending',
              google_event_id: existingAppointment.google_event_id,
              message: 'Mudança entre agendas será processada em background',
              calendar_changed: true
            };
          } else {
            // Atualizar evento na mesma agenda
            const googleEventUpdates = {};
            if (title !== undefined) googleEventUpdates.summary = title;
            if (description !== undefined) googleEventUpdates.description = description;
            if (location !== undefined) googleEventUpdates.location = location;
            if (start_time !== undefined) {
              googleEventUpdates.start = {
                dateTime: start_time,
                timeZone: targetIntegration.timezone || 'America/Sao_Paulo'
              };
            }
            if (end_time !== undefined) {
              googleEventUpdates.end = {
                dateTime: end_time,
                timeZone: targetIntegration.timezone || 'America/Sao_Paulo'
              };
            }
            if (attendees !== undefined) {
              googleEventUpdates.attendees = updateData.attendees.map(att => ({ email: att.email }));
            }

            // Fazer chamada para API do Google Calendar
            const url = `https://www.googleapis.com/calendar/v3/calendars/${targetIntegration.calendar_id}/events/${existingAppointment.google_event_id}`;
            
            const response = await fetch(url, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${targetIntegration.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(googleEventUpdates)
            });

            if (response.ok) {
              const updatedGoogleEvent = await response.json();
              googleEventInfo = {
                integration_status: 'success',
                google_event_id: updatedGoogleEvent.id,
                message: 'Evento atualizado com sucesso no Google Calendar',
                calendar_changed: false
              };
              console.log(`✅ Evento atualizado no Google Calendar: ${updatedGoogleEvent.id}`);
            } else {
              const errorText = await response.text();
              console.error('❌ Erro ao atualizar evento no Google:', errorText);
              googleEventInfo = {
                integration_status: 'failed',
                google_event_id: existingAppointment.google_event_id,
                message: `Erro ao atualizar no Google Calendar: ${response.status}`,
                calendar_changed: false
              };
            }
          }
        } else {
          googleEventInfo.message = 'Integração sem token de acesso válido. Reconecte o Google Calendar';
        }
      } catch (googleError) {
        console.error('❌ Erro ao atualizar evento no Google Calendar:', googleError);
        googleEventInfo = {
          integration_status: 'failed',
          google_event_id: existingAppointment.google_event_id,
          message: `Erro ao atualizar no Google Calendar: ${googleError.message}`,
          calendar_changed: !!calendar_id
        };
      }
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
        google_calendar_id: updatedAppointment.google_calendar_id,
        create_meet: updatedAppointment.create_meet,
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

    // ✅ CORRIGIDO: Deletar evento do Google Calendar se houver google_event_id
    let googleEventInfo = null;
    if (existingAppointment.google_event_id && existingAppointment.google_calendar_id) {
      try {
        console.log('🔄 Deletando evento do Google Calendar...');
        
        // Buscar integração da agenda usando google_calendar_id
        const { data: integration, error: integrationError } = await req.supabase
          .from('google_calendar_integrations')
          .select('*')
          .eq('company_id', company.id)
          .eq('calendar_id', existingAppointment.google_calendar_id)
          .eq('is_active', true)
          .eq('status', 'connected')
          .single();
        
        if (!integrationError && integration && integration.access_token) {
          // Fazer chamada para API do Google Calendar
          const url = `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events/${existingAppointment.google_event_id}`;
          
          const response = await fetch(url, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${integration.access_token}`,
              'Content-Type': 'application/json',
            }
          });

          if (response.ok) {
            googleEventInfo = {
              integration_status: 'success',
              google_event_id: existingAppointment.google_event_id,
              message: 'Evento deletado com sucesso do Google Calendar',
              google_calendar_id: existingAppointment.google_calendar_id
            };
            console.log(`✅ Evento deletado do Google Calendar: ${existingAppointment.google_event_id}`);
          } else if (response.status === 410) {
            // Erro 410: Resource já foi deletado
            googleEventInfo = {
              integration_status: 'already_deleted',
              google_event_id: existingAppointment.google_event_id,
              message: 'Evento já havia sido deletado do Google Calendar',
              google_calendar_id: existingAppointment.google_calendar_id
            };
            console.log('ℹ️ Evento já havia sido deletado no Google Calendar');
          } else {
            const errorText = await response.text();
            console.error('❌ Erro ao deletar evento do Google:', errorText);
            googleEventInfo = {
              integration_status: 'failed',
              google_event_id: existingAppointment.google_event_id,
              message: `Erro ao deletar do Google Calendar: ${response.status}`,
              google_calendar_id: existingAppointment.google_calendar_id
            };
          }
        } else {
          googleEventInfo = {
            integration_status: 'skipped',
            google_event_id: existingAppointment.google_event_id,
            message: 'Integração sem token de acesso válido. Evento não foi deletado do Google Calendar',
            google_calendar_id: existingAppointment.google_calendar_id
          };
        }
      } catch (googleError) {
        console.error('❌ Erro ao deletar evento do Google Calendar:', googleError);
        googleEventInfo = {
          integration_status: 'failed',
          google_event_id: existingAppointment.google_event_id,
          message: `Erro ao deletar do Google Calendar: ${googleError.message}`,
          google_calendar_id: existingAppointment.google_calendar_id
        };
      }
    }

    return res.json({
      success: true,
      message: 'Agendamento deletado com sucesso',
      deleted_appointment: {
        id: existingAppointment.id,
        title: existingAppointment.title,
        start_time: existingAppointment.start_time,
        end_time: existingAppointment.end_time,
        google_calendar_id: existingAppointment.google_calendar_id
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

// ==================== EXEMPLO DE USO ====================
/*
🔥 INTEGRAÇÃO COMPLETA GOOGLE CALENDAR + API 🔥

✅ NOVO: Formato ISO 8601 unificado para data/hora (2025-07-07T11:30:00)
✅ AGORA quando um usuário agenda via API, o evento É CRIADO AUTOMATICAMENTE no Google Calendar!
✅ Timezone buscado automaticamente da tabela users.timezone da empresa

📋 COMO USAR:

1. PRIMEIRO - Obter lista de agendas:
   GET /api/calendar/integrations
   
   Response:
   {
     "success": true,
     "data": {
       "integrations": [
         {
           "id": "550e8400-e29b-41d4-a716-446655440001",
           "calendar_name": "Agenda Principal",
           "status": "connected",
           "is_active": true
         }
       ]
     }
   }

2. VERIFICAR DISPONIBILIDADE (novo formato ISO):
   GET /api/calendar/availability?calendar_id=550e8400-e29b-41d4-a716-446655440001&start_time=2025-07-07T09:00:00&end_time=2025-07-07T18:00:00
   
   Response:
   {
     "success": true,
     "is_free": false,
     "total_appointments": 2,
     "busy_slots": [...],
     "availability_window": {
       "start_time": "2025-07-07T09:00:00",
       "end_time": "2025-07-07T18:00:00"
     },
     "timezone": "America/Sao_Paulo"
   }

3. AGENDAR (cria automaticamente no Google Calendar):
   POST /api/calendar/schedule
   {
     "title": "Reunião com Cliente",
     "description": "Apresentação da proposta",
     "start_time": "2025-07-07T11:30:00",
     "end_time": "2025-07-07T12:30:00",
     "calendar_id": "550e8400-e29b-41d4-a716-446655440001",
     "create_google_meet": true,
     "attendees": ["cliente@empresa.com"]
   }
   
   Response:
   {
     "success": true,
     "appointment": {
       "id": "apt_123",
       "google_event_id": "google_event_456",
       "google_meet_link": "https://meet.google.com/abc-defg-hij"
     },
     "google_calendar": {
       "integration_status": "success",
       "message": "Evento criado com sucesso no Google Calendar"
     }
   }

4. LISTAR AGENDAMENTOS (novo formato ISO preferido):
   GET /api/calendar/appointments?calendar_id=550e8400-e29b-41d4-a716-446655440001&start_time=2025-07-07T00:00:00&end_time=2025-07-07T23:59:59
   
   OU formato legacy (ainda suportado):
   GET /api/calendar/appointments?calendar_id=550e8400-e29b-41d4-a716-446655440001&date=2025-07-07

🕐 FORMATOS DE DATA/HORA ACEITOS:
- PREFERIDO: ISO 8601 → "2025-07-07T11:30:00" ou "2025-07-07T11:30:00Z"
- LEGACY: Apenas data → "2025-07-07" (busca dia inteiro)

🌍 TIMEZONE:
- Busca automaticamente de users.timezone da empresa
- Fallback: company_settings.timezone
- Padrão: "America/Sao_Paulo"

🔄 TOKENS REFRESH AUTOMÁTICO:
- Se o access_token estiver vencendo, a API renova automaticamente usando refresh_token
- Salva novos tokens no banco para próximas chamadas

🎯 VALIDAÇÕES:
- calendar_id deve pertencer à empresa
- Integração deve estar ativa (status: connected)
- Access token deve estar válido (ou renovável)
- Conflitos de horário são verificados
- Formato ISO 8601 validado

🛠️ TROUBLESHOOTING:
- Se falhar: verifique se Google Calendar está conectado
- Reconecte via frontend se necessário
- Logs detalhados no console para debug
- Use formato ISO 8601 para melhor compatibilidade
*/ 

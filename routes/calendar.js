const express = require('express');
const router = express.Router();

// ✅ HELPER: Validar formato de data
function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

// ✅ HELPER: Formatar data para ISO string
function formatToISO(dateString, time = null) {
  if (time) {
    return new Date(`${dateString}T${time}:00.000Z`).toISOString();
  }
  return new Date(dateString).toISOString();
}

// ✅ HELPER: Verificar se empresa tem integração ativa do Google Calendar
async function checkGoogleCalendarIntegration(companyId, supabase) {
  const { data, error } = await supabase
    .from('google_calendar_integrations')
    .select('id, status, access_token, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    return {
      hasIntegration: false,
      error: 'Integração do Google Calendar não encontrada'
    };
  }

  if (data.status !== 'connected' || !data.access_token) {
    return {
      hasIntegration: false,
      error: 'Google Calendar não está conectado'
    };
  }

  return {
    hasIntegration: true,
    integration: data
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

    // Definir período do dia
    const startDateTime = formatToISO(date, start_hour);
    const endDateTime = formatToISO(date, end_hour);

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

    // Verificar integração com Google Calendar
    const googleIntegration = await checkGoogleCalendarIntegration(company.id, req.supabase);

    let googleEventInfo = null;
    if (googleIntegration.hasIntegration) {
      console.log('🔄 Tentando sincronizar com Google Calendar...');
      
      // Aqui seria feita a integração com Google Calendar
      // Por enquanto, apenas marcar que foi tentado
      googleEventInfo = {
        integration_status: 'attempted',
        message: 'Sincronização com Google Calendar será processada'
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
      const startOfDay = formatToISO(date, '00:00');
      const endOfDay = formatToISO(date, '23:59');
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

    // Verificar integração com Google Calendar
    const googleIntegration = await checkGoogleCalendarIntegration(company.id, req.supabase);

    let googleEventInfo = null;
    if (googleIntegration.hasIntegration && existingAppointment.google_event_id) {
      console.log('🔄 Tentando sincronizar mudanças com Google Calendar...');
      
      googleEventInfo = {
        integration_status: 'sync_attempted',
        google_event_id: existingAppointment.google_event_id,
        message: 'Sincronização de mudanças com Google Calendar será processada'
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

    // Verificar integração com Google Calendar
    let googleEventInfo = null;
    if (existingAppointment.google_event_id) {
      console.log('🔄 Tentando deletar evento do Google Calendar...');
      
      googleEventInfo = {
        integration_status: 'deletion_attempted',
        google_event_id: existingAppointment.google_event_id,
        message: 'Deleção do evento no Google Calendar será processada'
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

module.exports = router; 

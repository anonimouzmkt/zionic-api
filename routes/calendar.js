import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  X, 
  Building2, 
  Mail, 
  Phone, 
  DollarSign, 
  Calendar, 
  MessageSquare, 
  Edit2,
  Star,
  Clock,
  Tag,
  User,
  ExternalLink,
  ChevronRight,
  MapPin,
  Bot,
  Activity,
  ArrowRight,
  FileText,
  CheckSquare,
  Image,
  Mic,
  Video,
  AlertTriangle
} from 'lucide-react';
import { Lead } from './KanbanBoard';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import CustomFieldRenderer from '../Leads/CustomFieldRenderer';
import { useCustomFields } from '../../hooks/useCustomFields';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import Toast from '../UI/Toast';
import { GoogleCalendarService } from '../../services/googleCalendarService';

// ✅ NOVO: Ícone do WhatsApp (igual aos outros componentes)
const WhatsAppIcon = () => (
  <div className="w-4 h-4 bg-white rounded-full flex items-center justify-center border border-gray-200">
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-green-500"
    >
      <path
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.893 3.405"
        fill="currentColor"
      />
    </svg>
  </div>
);

// ✅ Tipos para os dados reais
interface LeadActivity {
  id: string;
  activity_type: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  activity_timestamp: string;
  duration_text: string;
  metadata: any;
}

interface LeadNote {
  id: string;
  content: string;
  author: string;
  formatted_time: string;
  created_at: string;
}

interface PipelineLeadDetailsModalProps {
  lead: Lead;
  onClose: () => void;
  onEdit: () => void;
  onViewFullDetails: () => void;
}

const PipelineLeadDetailsModal: React.FC<PipelineLeadDetailsModalProps> = ({ 
  lead, 
  onClose, 
  onEdit,
  onViewFullDetails 
}) => {
  const supabase = useSupabaseClient();
  const navigate = useNavigate();
  const { company } = useAuth();
  const { toast, showSuccess, showError, hideToast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  
  // ✅ NOVO: Instância local do GoogleCalendarService com supabase client
  const googleCalendarService = new GoogleCalendarService(supabase);
  
  // ✅ NOVO: Estados para funcionalidades de ação rápida
  const [conversations, setConversations] = useState<any[]>([]);
  const [callAgents, setCallAgents] = useState<any[]>([]);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callLoading, setCallLoading] = useState(false);
  
  // ✅ NOVO: Estados para seleção de instância WhatsApp
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [whatsappInstances, setWhatsappInstances] = useState<any[]>([]);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  
  // ✅ Estados para dados reais
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [loading, setLoading] = useState(false);
  
  // ✅ NOVO: Estados para dados do criador e contato
  const [creatorData, setCreatorData] = useState<{
    name: string;
    avatar_url?: string;
  } | null>(null);
  const [contactData, setContactData] = useState<{
    full_name: string;
    avatar_url?: string;
  } | null>(null);

  // ✅ NOVO: Estados para agendamento inline
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [appointmentLoading, setAppointmentLoading] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
    location: '',
    attendees: [''],
    create_meet: true
  });

  // ✅ NOVO: Ref para auto-scroll do formulário de agendamento
  const appointmentFormRef = useRef<HTMLDivElement>(null);

  // Hook para campos personalizados
  const { 
    customFields, 
    loading: customFieldsLoading, 
    getLeadCustomFields 
  } = useCustomFields();
  const [leadCustomFields, setLeadCustomFields] = useState({});
  
  // ✅ NOVO: Detectar origem do lead
  const isAICreated = lead.created_by === null;
  const isManualCreated = lead.created_by !== null;
  const isWhatsAppSource = lead.source?.toLowerCase().includes('whatsapp') || 
                          lead.source?.toLowerCase().includes('chat');

  // ✅ NOVO: Funções para gerenciar agendamento inline
  const handleOpenAppointmentForm = () => {
    console.log('✅ handleOpenAppointmentForm executada - Configurando formulário inline');
    console.log('📝 Lead:', { id: lead.id, name: lead.name, email: lead.email });
    
    // Pré-preencher dados baseados no lead
    const now = new Date();
    const defaultStart = new Date(now.getTime() + 60 * 60 * 1000); // 1 hora a partir de agora
    const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000); // 1 hora de duração
    
    setAppointmentForm({
      title: `Reunião com ${lead.name}`,
      description: `Reunião agendada com o lead ${lead.name} da empresa ${lead.company}`,
      start_time: formatDateTimeForInput(defaultStart.toISOString()),
      end_time: formatDateTimeForInput(defaultEnd.toISOString()),
      location: '',
      attendees: [lead.email],
      create_meet: true
    });
    
    console.log('🔄 Exibindo formulário de agendamento inline');
    setShowAppointmentForm(true);
    console.log('🎬 Auto-scroll será ativado após renderização...');
  };

  const handleCloseAppointmentForm = () => {
    setShowAppointmentForm(false);
  };

  const formatDateTimeForInput = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleAppointmentFormChange = (field: string, value: any) => {
    setAppointmentForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateAppointment = async () => {
    if (!company) {
      showError('Empresa não encontrada');
      return;
    }

    if (!appointmentForm.title.trim() || !appointmentForm.start_time || !appointmentForm.end_time) {
      showError('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      setAppointmentLoading(true);

      const eventData = {
        title: appointmentForm.title.trim(),
        description: appointmentForm.description.trim(),
        start_time: new Date(appointmentForm.start_time).toISOString(),
        end_time: new Date(appointmentForm.end_time).toISOString(),
        location: appointmentForm.location.trim(),
        attendees: appointmentForm.attendees.filter(email => email.trim()).map(email => email.trim()),
        createMeet: appointmentForm.create_meet,
        lead_id: lead.id // ✅ Vinculado automaticamente ao lead
      };

      await googleCalendarService.createEvent(company.id, eventData);
      
      showSuccess('Agendamento criado com sucesso!');
      setShowAppointmentForm(false);
      
      // Recarregar atividades para mostrar o novo appointment
      fetchActivities();
      
    } catch (error: any) {
      console.error('Erro ao criar agendamento:', error);
      showError(`Erro ao criar agendamento: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setAppointmentLoading(false);
    }
  };
  
  // ✅ NOVO: Helper functions
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getAvatarGradient = (id: string) => {
    const colors = [
      'from-blue-500 to-purple-600', 
      'from-green-500 to-teal-600', 
      'from-orange-500 to-red-600',
      'from-purple-500 to-indigo-600',
      'from-pink-500 to-rose-600'
    ];
    
    const index = parseInt(id.slice(-1), 16) % colors.length;
    return colors[index];
  };
  
  // ✅ Função para mapear ícones
  const getIconComponent = (iconName: string) => {
    const iconMap: { [key: string]: React.ComponentType<any> } = {
      'User': User,
      'Edit2': Edit2,
      'ArrowRight': ArrowRight,
      'Bot': Bot,
      'Phone': Phone,
      'MessageSquare': MessageSquare,
      'Activity': Activity,
      'Mail': Mail,
              'FileText': FileText,
        'CheckSquare': CheckSquare,
        'Image': Image,
        'Mic': Mic,
        'Video': Video
    };
    
    const IconComponent = iconMap[iconName] || Activity;
    return IconComponent;
  };
  
  // ✅ Função para buscar atividades reais COM PROTEÇÃO contra erros de enum
  const fetchActivities = async () => {
    try {
      // Primeiro, tentar buscar normalmente
      const { data, error } = await supabase.rpc('get_lead_activities', {
        p_lead_id: lead.id
      });

      if (error) {
        // ✅ PROTEÇÃO: Se o erro for relacionado ao enum activity_type
        if (error.code === '22P02' && error.message?.includes('activity_type')) {
          console.warn('⚠️ Detectado erro de enum activity_type, tentando busca alternativa...');
          
          // Buscar atividades manualmente, filtrando apenas registros válidos
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('lead_activities')
            .select(`
              id,
              type,
              title,
              description,
              created_at,
              metadata,
              performed_by,
              users!performed_by(first_name, last_name)
            `)
            .eq('lead_id', lead.id)
            .order('created_at', { ascending: false })
            .limit(20);

          if (fallbackError) {
            console.error('Erro na busca alternativa:', fallbackError);
            return;
          }

          // Mapear dados para o formato esperado
          const mappedActivities = (fallbackData || []).map(activity => ({
            id: activity.id,
            activity_type: activity.type,
            title: activity.title,
            description: activity.description || 'Atividade registrada',
            icon: getActivityIcon(activity.type),
            color: getActivityColor(activity.type),
            activity_timestamp: activity.created_at,
            duration_text: getDurationText(activity.created_at),
            metadata: {
              ...activity.metadata,
              performed_by_user: activity.performed_by !== null,
              performer_name: activity.users 
                ? `${activity.users.first_name || ''} ${activity.users.last_name || ''}`.trim() || 'Usuário'
                : 'Sistema',
              fallback_mode: true
            }
          }));

          // Adicionar atividade de criação do lead
          const creationActivity = {
            id: `creation_${lead.id}`,
            activity_type: 'lead_created',
            title: lead.created_by ? 'Lead criado por usuário' : 'Lead criado pela IA',
            description: lead.created_by 
              ? 'Lead criado manualmente por um usuário do sistema.'
              : 'Agente IA analisou a conversa e criou automaticamente este lead.',
            icon: 'Bot',
            color: lead.created_by ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600',
            activity_timestamp: new Date().toISOString(), // Usar timestamp atual como fallback
            duration_text: 'Criação do lead',
            metadata: {
              created_by_ai: !lead.created_by,
              created_by_user: !!lead.created_by,
              lead_data: {
                estimated_value: lead.value,
                priority: lead.priority,
                source: lead.source
              },
              fallback_mode: true
            }
          };

          setActivities([creationActivity, ...mappedActivities]);
          return;
        }
        
        console.error('Erro ao buscar atividades:', error);
        return;
      }

      setActivities(data || []);
    } catch (error) {
      console.error('Erro ao buscar atividades:', error);
    }
  };

  // ✅ NOVO: Funções auxiliares para o modo fallback
  const getActivityIcon = (type: string) => {
    const iconMap: { [key: string]: string } = {
      'status_change': 'ArrowRight',
      'value_change': 'Edit2', 
      'note': 'FileText',
      'call': 'Phone',
      'email': 'Mail',
      'meeting': 'Calendar',
      'task': 'CheckSquare',
      'lead_created': 'Bot',
      'lead_updated': 'Edit2'
    };
    return iconMap[type] || 'Activity';
  };

  const getActivityColor = (type: string) => {
    const colorMap: { [key: string]: string } = {
      'status_change': 'bg-purple-100 text-purple-600',
      'value_change': 'bg-blue-100 text-blue-600',
      'note': 'bg-gray-100 text-gray-600',
      'call': 'bg-green-100 text-green-600',
      'email': 'bg-cyan-100 text-cyan-600',
      'meeting': 'bg-yellow-100 text-yellow-600',
      'task': 'bg-teal-100 text-teal-600',
      'lead_created': 'bg-blue-100 text-blue-600',
      'lead_updated': 'bg-orange-100 text-orange-600'
    };
    return colorMap[type] || 'bg-gray-100 text-gray-600';
  };

  const getDurationText = (timestamp: string) => {
    const now = new Date();
    const activityTime = new Date(timestamp);
    const diffMs = now.getTime() - activityTime.getTime();
    
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) {
      return `${minutes} minutos atrás`;
    } else if (hours < 24) {
      return `${hours} horas atrás`;
    } else if (days < 7) {
      return `${days} dias atrás`;
    } else {
      return activityTime.toLocaleDateString('pt-BR');
    }
  };

  // ✅ Função para buscar notas reais
  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase.rpc('get_lead_notes', {
        p_lead_id: lead.id
      });

      if (error) {
        console.error('Erro ao buscar notas:', error);
        return;
      }

      setNotes(data || []);
    } catch (error) {
      console.error('Erro ao buscar notas:', error);
    }
  };

  // Carregar campos personalizados
  const loadLeadCustomFields = async () => {
    if (!lead.id) return;

    try {
      const fieldValues = await getLeadCustomFields(lead.id);
      setLeadCustomFields(fieldValues);
    } catch (error) {
      console.error('Error loading lead custom fields:', error);
    }
  };
  
  // ✅ Buscar dados do criador e contato
  useEffect(() => {
    const fetchCreatorAndContactData = async () => {
      setLoading(true);
      
      try {
        // Buscar dados do criador (se foi criado manualmente)
        if (isManualCreated && lead.created_by) {
          const { data: creator } = await supabase
            .from('users')
            .select('first_name, last_name, avatar_url')
            .eq('id', lead.created_by)
            .single();
          
          if (creator) {
            setCreatorData({
              name: `${creator.first_name || ''} ${creator.last_name || ''}`.trim() || 'Usuário',
              avatar_url: creator.avatar_url
            });
          }
        }

        // Buscar dados do contato
        if (lead.contact_id) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('full_name, avatar_url')
            .eq('id', lead.contact_id)
            .single();
          
          if (contact) {
            setContactData({
              full_name: contact.full_name || 'Contato',
              avatar_url: contact.avatar_url
            });
          }
        }

        // ✅ NOVO: Buscar conversas do lead (CORRIGIDO: melhor busca e debug)
        if (lead.contact_id && company?.id) {
          console.log('🔍 Buscando conversas existentes para:', {
            contact_id: lead.contact_id,
            company_id: company.id
          });
          
          const { data: conversationsData, error: conversationsError } = await supabase
            .from('conversations')
            .select(`
              id, 
              title, 
              status,
              integration_id,
              external_id,
              communication_integrations(provider, name, is_active)
            `)
                        .eq('contact_id', lead.contact_id)
            .eq('company_id', company.id)
            .eq('status', 'active')
            .order('last_message_at', { ascending: false });
          
          if (conversationsError) {
            console.error('❌ Erro ao buscar conversas:', conversationsError);
          } else {
            console.log('📊 Conversas encontradas:', conversationsData?.length || 0);
            console.log('🔍 Debug conversas:', conversationsData);
            setConversations(conversationsData || []);
          }
        }

        // ✅ NOVO: Buscar agentes de call
        if (company?.id) {
          const { data: agentsData } = await supabase
            .from('agent_call')
            .select('id, name, assistant_id, is_active')
            .eq('company_id', company.id)
            .eq('is_active', true)
            .not('assistant_id', 'is', null);
          
          setCallAgents(agentsData || []);
        }

        // Buscar atividades e notas
        await Promise.all([
          fetchActivities(),
          fetchNotes(),
          loadLeadCustomFields()
        ]);

      } catch (error) {
        console.error('Erro ao buscar dados do criador/contato:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCreatorAndContactData();
  }, [lead.created_by, lead.contact_id, lead.id, isManualCreated, company?.id, supabase]);

  // ✅ DEBUG: Log de inicialização das funções
  useEffect(() => {
    console.log('🎯 PipelineLeadDetailsModal carregado');
    console.log('🔍 Debug - Funções definidas:');
    console.log('  - handleOpenWhatsApp:', typeof handleOpenWhatsApp);
    console.log('  - fetchWhatsAppInstances:', typeof fetchWhatsAppInstances);
    console.log('  - handleCreateWhatsAppConversation:', typeof handleCreateWhatsAppConversation);
  }, []);

  // ✅ NOVO: Auto-scroll para o formulário de agendamento quando abrir
  useEffect(() => {
    if (showAppointmentForm && appointmentFormRef.current) {
      console.log('📜 Auto-scroll iniciado - Rolando para o formulário de agendamento');
      
      // Aguardar um pouco para garantir que o elemento foi renderizado
      setTimeout(() => {
        appointmentFormRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center', // Mudar para 'center' para melhor visualização
          inline: 'nearest'
        });
        console.log('🎯 Auto-scroll concluído!');
      }, 200); // Aumentar o delay para 200ms
    }
  }, [showAppointmentForm]);

  // ✅ NOVO: Funções para botões de ação rápida
  const handleOpenWhatsApp = async () => {
    console.log('🔔 Botão WhatsApp clicado - Buscando conversa do lead');
    console.log('🔍 Debug - conversations:', conversations);
    console.log('🔍 Debug - company:', company);
    console.log('🔍 Debug - lead.contact_id:', lead.contact_id);
    
    // ✅ BUSCA MAIS ROBUSTA: verificar diferentes estruturas de dados
    let whatsappConversation = null;
    
    // Tentar diferentes formas de encontrar conversa WhatsApp
    for (const conv of conversations) {
      console.log('🔍 Analisando conversa:', conv);
      
      // Verificar se tem communication_integrations como objeto
      if (conv.communication_integrations?.provider === 'whatsapp') {
        whatsappConversation = conv;
        console.log('✅ Encontrada por communication_integrations.provider');
        break;
      }
      
      // Verificar se tem communication_integrations como array (caso de erro de estrutura)
      if (Array.isArray(conv.communication_integrations)) {
        const whatsappIntegration = conv.communication_integrations.find(int => int.provider === 'whatsapp');
        if (whatsappIntegration) {
          whatsappConversation = conv;
          console.log('✅ Encontrada por communication_integrations array');
          break;
        }
      }
    }
    
    console.log('🔍 Debug - whatsappConversation final:', whatsappConversation);
    
    if (whatsappConversation) {
      console.log('✅ Conversa WhatsApp encontrada:', whatsappConversation.id);
      // Navegar para a conversa na mesma aba
      navigate(`/chat/${whatsappConversation.id}`);
      onClose(); // Fechar o modal
    } else {
      console.log('⚠️ Nenhuma conversa WhatsApp encontrada, revalidando com busca direta...');
      
      // ✅ BUSCA DIRETA no banco para ter certeza
      if (!company?.id || !lead.contact_id) {
        console.error('❌ Dados faltando - company.id:', company?.id, 'lead.contact_id:', lead.contact_id);
        showError('Dados da empresa ou contato não encontrados');
        return;
      }
      
      try {
        console.log('🔄 Fazendo busca direta no banco de dados...');
        const { data: directConversations, error: directError } = await supabase
          .from('conversations')
          .select(`
            id, 
            title,
            communication_integrations!inner(provider)
          `)
          .eq('contact_id', lead.contact_id)
          .eq('company_id', company.id)
          .eq('communication_integrations.provider', 'whatsapp')
          .eq('status', 'active')
          .limit(1);
        
        if (directError) {
          console.error('❌ Erro na busca direta:', directError);
        } else if (directConversations && directConversations.length > 0) {
          console.log('✅ Conversa WhatsApp encontrada na busca direta!', directConversations[0]);
          navigate(`/chat/${directConversations[0].id}`);
          onClose();
          return;
        }
        
        console.log('🚫 Realmente não existe conversa WhatsApp - prosseguindo para criar nova');
        
        // Buscar instâncias WhatsApp disponíveis e mostrar modal de seleção
        await fetchWhatsAppInstances();
        console.log('✅ fetchWhatsAppInstances executada com sucesso');
        
      } catch (error) {
        console.error('❌ Erro ao buscar conversas direto ou instâncias:', error);
        showError('Erro inesperado ao buscar conversas WhatsApp');
      }
    }
  };

  // ✅ NOVO: Buscar instâncias WhatsApp disponíveis
  const fetchWhatsAppInstances = async () => {
    console.log('🔄 fetchWhatsAppInstances iniciada');
    console.log('🔍 Debug - company.id:', company?.id);
    
    if (!company?.id) {
      console.error('❌ Company ID não encontrado, abortando fetchWhatsAppInstances');
      return;
    }
    
    try {
      setWhatsappLoading(true);
      console.log('⏳ Loading ativo, buscando instâncias...');
      
      // Buscar todas as integrações WhatsApp ativas da empresa
      const { data: instances, error } = await supabase
        .from('communication_integrations')
        .select('id, name, provider, config, connection_status')
        .eq('company_id', company.id)
        .eq('provider', 'whatsapp')
        .eq('is_active', true)
        .order('name');
      
      console.log('📊 Resultado da query:', { instances, error });
      
      if (error) {
        console.error('❌ Erro ao buscar instâncias WhatsApp:', error);
        showError('Erro ao buscar instâncias WhatsApp');
        return;
      }
      
      if (!instances || instances.length === 0) {
        console.warn('⚠️ Nenhuma instância encontrada');
        showError('Nenhuma instância WhatsApp ativa encontrada. Configure uma instância primeiro.');
        return;
      }
      
      console.log(`✅ ${instances.length} instâncias WhatsApp encontradas:`, instances);
      setWhatsappInstances(instances);
      setShowWhatsAppModal(true);
      console.log('🎯 Modal WhatsApp será exibido');
      
    } catch (error) {
      console.error('❌ Erro inesperado ao buscar instâncias:', error);
      showError('Erro inesperado ao buscar instâncias WhatsApp');
    } finally {
      setWhatsappLoading(false);
      console.log('🏁 fetchWhatsAppInstances finalizada');
    }
  };

  // ✅ NOVO: Criar conversa com instância selecionada
  const handleCreateWhatsAppConversation = async (instanceId: string) => {
    if (!company?.id || !lead.contact_id) {
      showError('Dados da empresa ou contato não encontrados');
      return;
    }
    
    try {
      setWhatsappLoading(true);
      
      // Buscar dados da instância selecionada
      const selectedInstance = whatsappInstances.find(inst => inst.id === instanceId);
      if (!selectedInstance) {
        showError('Instância selecionada não encontrada');
        return;
      }
      
      console.log('✅ Criando conversa com instância:', selectedInstance.name);
      
      // ✅ VERIFICAÇÃO FINAL: Tentar encontrar conversa existente antes de criar
      console.log('🔍 Verificação final: buscando conversa existente...');
      const { data: finalCheck, error: finalCheckError } = await supabase
        .from('conversations')
        .select('id')
                  .eq('contact_id', lead.contact_id)
          .eq('company_id', company.id)
          .eq('integration_id', instanceId)
          .eq('status', 'active')
          .limit(1);
      
      if (!finalCheckError && finalCheck && finalCheck.length > 0) {
        console.log('⚠️ Conversa existente encontrada na verificação final! Redirecionando...');
        setShowWhatsAppModal(false);
        navigate(`/chat/${finalCheck[0].id}`);
        onClose();
        return;
      }
      
      // ✅ USAR external_id baseado no telefone do lead (padrão do sistema)
      const externalId = lead.phone || `lead-contact-${lead.contact_id}`;
      
      // Criar nova conversa usando o padrão do sistema
      const { data: newConversation, error: conversationError } = await supabase
        .from('conversations')
        .insert({
          company_id: company.id,
          contact_id: lead.contact_id,
          integration_id: instanceId,
          external_id: externalId, // ✅ Usar phone como external_id padrão
          title: `Conversa com ${lead.name}`,
          status: 'active',
          priority: 'normal',
          first_message_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          tags: ['lead', 'pipeline'],
          metadata: {
            created_from: 'lead_pipeline',
            lead_id: lead.id,
            lead_title: lead.name,
            lead_company: lead.company,
            lead_value: lead.value,
            whatsapp_instance: selectedInstance.name
          }
        })
        .select('id')
        .single();
      
      if (conversationError || !newConversation) {
        console.error('❌ Erro ao criar conversa:', conversationError);
        
        // ✅ Se erro for de duplicata, tentar buscar a conversa existente
        if (conversationError?.code === '23505') { // Unique constraint violation
          console.log('⚠️ Conversa duplicada detectada, buscando conversa existente...');
          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_id', lead.contact_id)
            .eq('integration_id', instanceId)
            .limit(1);
          
          if (existingConv && existingConv.length > 0) {
            console.log('✅ Conversa existente encontrada após erro de duplicata');
            setShowWhatsAppModal(false);
            navigate(`/chat/${existingConv[0].id}`);
            onClose();
            return;
          }
        }
        
        showError('Erro ao criar conversa. Tente novamente.');
        return;
      }
      
      console.log('✅ Nova conversa criada:', newConversation.id);
      
      // Fechar modal e mostrar feedback de sucesso
      setShowWhatsAppModal(false);
      showSuccess(`Conversa WhatsApp criada com ${selectedInstance.name}!`);
      
      // Navegar para a nova conversa
      navigate(`/chat/${newConversation.id}`);
      onClose(); // Fechar o modal principal
      
    } catch (error) {
      console.error('❌ Erro inesperado ao criar conversa:', error);
      showError('Erro inesperado ao criar conversa. Tente novamente.');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const handleOpenCall = () => {
    console.log('🔔 Botão Ligar clicado - Verificando agentes disponíveis');
    
    if (callAgents.length === 0) {
      console.log('⚠️ Nenhum agente de call encontrado');
      showError('Nenhum agente de ligação configurado. Configure um agente primeiro.');
      return;
    }
    
    console.log('✅ Agentes encontrados:', callAgents.length);
    setShowCallModal(true);
  };

  const handleMakeCall = async (agentId: string) => {
    if (!lead.phone) {
      showError('Telefone do lead não encontrado');
      return;
    }

    try {
      setCallLoading(true);
      
      // Aqui você pode integrar com o sistema de chamadas
      // Por exemplo, usar o vapiService ou navegar para a página de calls
      console.log('📞 Iniciando chamada:', {
        agentId,
        phone: lead.phone,
        leadId: lead.id
      });
      
      // Navegar para a página de calls com dados pré-preenchidos
      navigate('/callai', { 
        state: { 
          prefilledPhone: lead.phone,
          prefilledAgentId: agentId,
          leadId: lead.id,
          leadName: lead.name
        } 
      });
      
      setShowCallModal(false);
      onClose(); // Fechar o modal
      
    } catch (error: any) {
      console.error('Erro ao iniciar chamada:', error);
      showError(`Erro ao iniciar chamada: ${error.message}`);
    } finally {
      setCallLoading(false);
    }
  };

  const tabs = [
    { id: 'overview', label: 'Visão Geral', icon: User },
    { id: 'activity', label: 'Atividade', icon: Clock },
    { id: 'notes', label: 'Notas', icon: MessageSquare }
  ];

  const getPriorityColor = (priority: Lead['priority']) => {
    switch (priority) {
      case 'high': return 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700';
      case 'medium': return 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700';
      case 'low': return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600';
      default: return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600';
    }
  };

  const getSourceColor = (source: string) => {
    const colors: Record<string, string> = {
      'Website': 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
      'LinkedIn': 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
      'WhatsApp': 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300',
      'Cold Call': 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300',
      'Email Campaign': 'bg-pink-100 dark:bg-pink-900/50 text-pink-700 dark:text-pink-300',
      'Referral': 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
    };
    return colors[source] || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-5">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                  <DollarSign className="w-5 h-5" />
                  <span className="text-sm font-semibold">Valor Potencial</span>
                </div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">R$ {lead.value.toLocaleString()}</p>
              </div>
              
              <div className="p-4 bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                  <Clock className="w-5 h-5" />
                  <span className="text-sm font-semibold">Último Contato</span>
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{lead.lastContact}</p>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-white dark:bg-gray-700 rounded-xl p-4 border border-gray-200 dark:border-gray-600 shadow-sm">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Informações de Contato
              </h4>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/50 rounded-lg flex items-center justify-center">
                    <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Email</p>
                    <p className="font-medium text-gray-900 dark:text-white truncate">{lead.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 dark:bg-green-900/50 rounded-lg flex items-center justify-center">
                    <Phone className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Telefone</p>
                    <p className="font-medium text-gray-900 dark:text-white">{lead.phone}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/50 rounded-lg flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-600 dark:text-gray-400">Empresa</p>
                    <p className="font-medium text-gray-900 dark:text-white">{lead.company}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            {lead.tags.length > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-700/50">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Tags
                </h4>
                <div className="flex flex-wrap gap-2">
                  {lead.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium border border-blue-200 dark:border-blue-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Campos Personalizados */}
            {(customFields.length > 0 || customFieldsLoading) && (
              <div className="bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 p-4">
                <CustomFieldRenderer
                  fields={customFields}
                  values={leadCustomFields}
                  loading={customFieldsLoading}
                  emptyMessage="Este lead ainda não possui campos personalizados preenchidos"
                />
              </div>
            )}

            {/* Quick Actions */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-xl p-4 border border-gray-200 dark:border-gray-600">
              <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Ações Rápidas</h4>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={handleOpenCall}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors shadow-sm"
                >
                  <Phone className="w-4 h-4" />
                  <span className="text-sm font-medium">Ligar</span>
                </button>
                <button 
                  onClick={() => {
                    console.log('🔔 Botão WhatsApp clicado - onClick chamado');
                    console.log('🔍 Debug - handleOpenWhatsApp existe:', typeof handleOpenWhatsApp);
                    handleOpenWhatsApp();
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-600 transition-colors shadow-sm"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-sm font-medium">WhatsApp</span>
                </button>
                <button 
                  onClick={() => {
                    console.log('🔔 Botão Agendar clicado - Abrindo formulário inline');
                    handleOpenAppointmentForm();
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 dark:bg-orange-700 text-white rounded-lg hover:bg-orange-700 dark:hover:bg-orange-600 transition-colors shadow-sm"
                >
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Agendar Reunião</span>
                </button>
              </div>
            </div>

            {/* ✅ NOVO: Formulário de Agendamento Inline */}
            {showAppointmentForm && (
              <div 
                ref={appointmentFormRef}
                className="bg-white dark:bg-gray-700 rounded-xl border border-orange-200 dark:border-orange-700 shadow-lg overflow-hidden mt-4 scroll-mt-4"
              >
                <div className="bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20 px-4 py-3 border-b border-orange-200 dark:border-orange-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      <h4 className="font-semibold text-gray-900 dark:text-white">🗓️ Criar Agendamento (INLINE)</h4>
                    </div>
                    <button 
                      onClick={handleCloseAppointmentForm}
                      className="p-1 hover:bg-orange-100 dark:hover:bg-orange-800 rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Agendamento será vinculado automaticamente ao lead {lead.name}
                  </p>
                </div>
                
                <div className="p-4 space-y-4">
                  {/* Título */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Título *
                    </label>
                    <input
                      type="text"
                      value={appointmentForm.title}
                      onChange={(e) => handleAppointmentFormChange('title', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="Ex: Reunião de apresentação"
                    />
                  </div>

                  {/* Data e Hora */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Início *
                      </label>
                      <input
                        type="datetime-local"
                        value={appointmentForm.start_time}
                        onChange={(e) => handleAppointmentFormChange('start_time', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Fim *
                      </label>
                      <input
                        type="datetime-local"
                        value={appointmentForm.end_time}
                        onChange={(e) => handleAppointmentFormChange('end_time', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {/* Descrição */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Descrição
                    </label>
                    <textarea
                      value={appointmentForm.description}
                      onChange={(e) => handleAppointmentFormChange('description', e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="Detalhes do agendamento..."
                    />
                  </div>

                  {/* Local */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Local
                    </label>
                    <input
                      type="text"
                      value={appointmentForm.location}
                      onChange={(e) => handleAppointmentFormChange('location', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      placeholder="Ex: Escritório, Online, etc."
                    />
                  </div>

                  {/* Google Meet */}
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="create_meet"
                      checked={appointmentForm.create_meet}
                      onChange={(e) => handleAppointmentFormChange('create_meet', e.target.checked)}
                      className="w-4 h-4 text-orange-600 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 rounded focus:ring-orange-500"
                    />
                    <label htmlFor="create_meet" className="text-sm text-gray-700 dark:text-gray-300">
                      Criar link do Google Meet automaticamente
                    </label>
                  </div>

                  {/* Botões */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
                    <button
                      onClick={handleCloseAppointmentForm}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateAppointment}
                      disabled={appointmentLoading}
                      className="px-4 py-2 bg-orange-600 dark:bg-orange-700 text-white rounded-lg hover:bg-orange-700 dark:hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {appointmentLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          Criando...
                        </>
                      ) : (
                        <>
                          <Calendar className="w-4 h-4" />
                          Criar Agendamento
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'activity':
        return (
          <div className="space-y-4">
            {/* Header da seção */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Activity className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white">Pipeline de Atividades</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Histórico completo do lead</p>
                </div>
              </div>
              <button 
                onClick={fetchActivities}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-700"
              >
                <Activity className="w-4 h-4" />
                <span className="text-sm font-medium">Atualizar</span>
              </button>
            </div>
            
            {loading ? (
              <div className="flex items-center justify-center p-12">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-blue-600 border-t-transparent"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Carregando atividades...</p>
                </div>
              </div>
            ) : activities.length > 0 ? (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500 via-purple-500 to-gray-300 dark:to-gray-600"></div>
                
                <div className="space-y-4">
              {activities.map((activity, index) => {
                    const IconComponent = getIconComponent(activity.icon);
                    const isFirst = index === 0;
                    const isLast = index === activities.length - 1;
                    
                    // Parse metadata para informações extras
                    const metadata = typeof activity.metadata === 'string' 
                      ? JSON.parse(activity.metadata) 
                      : activity.metadata || {};
                    
                    const isCreationActivity = activity.activity_type === 'lead_created';
                    const isAIGenerated = metadata.created_by_ai || metadata.created_from === 'ai_conversation';
                    const isFromAds = metadata.ad_detection?.is_from_ads;
                    const platform = metadata.ad_detection?.platform || 'WhatsApp';
                    
                return (
                      <div key={activity.id} className="relative pl-16">
                        {/* Timeline dot */}
                        <div className={`absolute left-4 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 shadow-lg ${
                          isFirst ? 'bg-gradient-to-br from-green-500 to-emerald-600' :
                          isCreationActivity ? 'bg-gradient-to-br from-blue-500 to-indigo-600' :
                          'bg-gradient-to-br from-gray-400 to-gray-500'
                        }`}>
                          {isFirst && (
                            <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-20"></div>
                          )}
                        </div>
                        
                        {/* Activity card */}
                        <div className={`bg-white dark:bg-gray-700 rounded-xl border shadow-sm transition-all duration-200 hover:shadow-md ${
                          isCreationActivity ? 'border-blue-200 dark:border-blue-700 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20' :
                          isFirst ? 'border-green-200 dark:border-green-700 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20' :
                          'border-gray-200 dark:border-gray-600'
                        }`}>
                          <div className="p-4">
                            {/* Activity header */}
                            <div className="flex items-start gap-3 mb-3">
                              <div className={`p-2.5 rounded-lg ${activity.color} shadow-sm`}>
                                <IconComponent className="w-5 h-5" />
                    </div>
                              
                    <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h5 className="font-semibold text-gray-900 dark:text-white">{activity.title}</h5>
                                  
                                  {/* Badge especial para criação */}
                                  {isCreationActivity && (
                                    <div className="flex items-center gap-1">
                                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded-full">
                                        Origem
                                      </span>
                                    </div>
                                  )}
                                  
                                  {/* Badge de IA */}
                                  {isAIGenerated && (
                                    <div className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-full">
                                      <Bot className="w-3 h-3" />
                                      <span className="text-xs font-medium">IA</span>
                                    </div>
                                  )}
                                  
                                  {/* Badge de plataforma */}
                                  {isFromAds && (
                                    <div className="flex items-center gap-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 px-2 py-1 rounded-full">
                                      <div className="w-3 h-3 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full"></div>
                                      <span className="text-xs font-medium">{platform} Ads</span>
                                    </div>
                                  )}
                                </div>
                                
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                                  {activity.description}
                                </p>
                              </div>
                            </div>
                            
                            {/* Metadata extras */}
                            {metadata && Object.keys(metadata).length > 0 && (
                              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  {/* Informações do criador */}
                                  {metadata.creator_name && (
                                    <div className="flex items-center gap-2">
                                      <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                      <span className="text-gray-700 dark:text-gray-300">
                                        <span className="font-medium">Criado por:</span> {metadata.creator_name}
                                      </span>
                                    </div>
                                  )}
                                  
                                  {/* Valor do lead */}
                                  {metadata.lead_data?.estimated_value && (
                                    <div className="flex items-center gap-2">
                                      <DollarSign className="w-4 h-4 text-green-500 dark:text-green-400" />
                                      <span className="text-gray-700 dark:text-gray-300">
                                        <span className="font-medium">Valor:</span> R$ {metadata.lead_data.estimated_value.toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                  
                                  {/* Origem do contato */}
                                  {metadata.contact_data?.source && (
                                    <div className="flex items-center gap-2">
                                      <MapPin className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                                      <span className="text-gray-700 dark:text-gray-300">
                                        <span className="font-medium">Origem:</span> {metadata.contact_data.source}
                                      </span>
                                    </div>
                                  )}
                                  
                                  {/* Ferramenta usada */}
                                  {metadata.tool_used && (
                                    <div className="flex items-center gap-2">
                                      <Activity className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                                      <span className="text-gray-700 dark:text-gray-300">
                                        <span className="font-medium">Ferramenta:</span> {metadata.tool_used}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                
                                {/* UTM info se existir */}
                                {metadata.contact_data?.utm_info && (
                                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                                    <h6 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Informações de Campanha:</h6>
                                    <div className="grid grid-cols-1 gap-2">
                                      {metadata.contact_data.utm_info.utm_source && (
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="font-medium text-gray-600 dark:text-gray-400">Fonte:</span>
                                          <span className="text-gray-700 dark:text-gray-300">{metadata.contact_data.utm_info.utm_source}</span>
                                        </div>
                                      )}
                                      {metadata.contact_data.utm_info.utm_campaign && (
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="font-medium text-gray-600 dark:text-gray-400">Campanha:</span>
                                          <span className="text-gray-700 dark:text-gray-300">{metadata.contact_data.utm_info.utm_campaign}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Footer com timestamp */}
                            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-200 dark:border-gray-600">
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <Clock className="w-3 h-3" />
                                <span>{activity.duration_text}</span>
                              </div>
                              
                              {isFirst && (
                                <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                  <span>Mais recente</span>
                                </div>
                              )}
                            </div>
                          </div>
                    </div>
                  </div>
                );
              })}
            </div>
              </div>
            ) : (
              <div className="text-center p-12 bg-white dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600">
                <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Activity className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <h6 className="font-medium text-gray-900 dark:text-white mb-2">Nenhuma atividade registrada</h6>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  As atividades aparecerão aqui conforme o lead progride no pipeline.
                </p>
              </div>
            )}
          </div>
        );

      case 'notes':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900 dark:text-white">Notas</h4>
              <button 
                onClick={fetchNotes}
                className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
              >
                Atualizar
              </button>
            </div>
            
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : notes.length > 0 ? (
            <div className="space-y-3">
              {notes.map(note => (
                  <div key={note.id} className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700">
                    <p className="text-gray-900 dark:text-white mb-2">{note.content}</p>
                    <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Por {note.author}</span>
                                                <span>{note.formatted_time}</span>
                  </div>
                </div>
              ))}
            </div>
            ) : (
              <div className="text-center p-8 text-gray-500 dark:text-gray-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma nota registrada ainda.</p>
              </div>
            )}

            <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
              <textarea
                placeholder="Adicionar nova nota..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <div className="flex justify-end mt-2">
                <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                  Salvar Nota
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header Modernizado */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Avatar principal */}
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg bg-gradient-to-br ${
                isAICreated ? 'from-blue-500 to-blue-600' : 
                isManualCreated ? 'from-green-500 to-green-600' : 
                'from-gray-500 to-gray-600'
              }`}>
                {getInitials(lead.name)}
              </div>
              
              {/* Informações principais */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{lead.name}</h2>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(lead.priority)}`}>
                    {lead.priority === 'high' ? 'Alta' : lead.priority === 'medium' ? 'Média' : 'Baixa'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{lead.company}</span>
                </div>
                
                {/* Badges de origem */}
                <div className="flex items-center gap-2 flex-wrap">
                  {isWhatsAppSource && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full">
                      <WhatsAppIcon />
                      <span className="text-xs font-medium">WhatsApp</span>
                    </div>
                  )}
                  
                  {isAICreated ? (
                    <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                      <Bot className="w-3 h-3" />
                      <span className="text-xs font-medium">IA</span>
                    </div>
                  ) : isManualCreated && creatorData ? (
                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
                      {creatorData.avatar_url ? (
                        <img 
                          src={creatorData.avatar_url} 
                          alt={creatorData.name}
                          className="w-3 h-3 rounded-full object-cover"
                        />
                      ) : (
                        <div className={`w-3 h-3 rounded-full flex items-center justify-center text-white text-xs font-medium bg-gradient-to-br ${getAvatarGradient(lead.created_by || '')}`}>
                          {getInitials(creatorData.name).charAt(0)}
                        </div>
                      )}
                      <span className="text-xs font-medium">{creatorData.name.split(' ')[0]}</span>
                    </div>
                  ) : null}
                  
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSourceColor(lead.source)}`}>
                    {lead.source}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Botões de ação */}
            <div className="flex items-center gap-2">
              <button
                onClick={onViewFullDetails}
                className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-500 transition-colors border border-gray-200 dark:border-gray-500 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                Detalhes
              </button>
              <button
                onClick={onEdit}
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors text-sm"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white hover:bg-opacity-50 dark:hover:bg-gray-600 dark:hover:bg-opacity-50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
          </div>
          
          {/* Informações rápidas */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                R$ {lead.value.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-300">
                {lead.lastContact}
              </span>
            </div>
            {contactData && (
              <div className="flex items-center gap-2">
                {contactData.avatar_url ? (
                  <img 
                    src={contactData.avatar_url} 
                    alt={contactData.full_name}
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-medium bg-gradient-to-br ${getAvatarGradient(lead.contact_id || '')}`}>
                    {getInitials(contactData.full_name).charAt(0)}
                  </div>
                )}
                <span className="text-sm text-gray-600 dark:text-gray-300">{contactData.full_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Navigation to Full Details */}
        <div className="px-5 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={onViewFullDetails}
            className="flex items-center gap-2 text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors group"
          >
            <span className="text-sm font-medium">Ver página completa do lead</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Tabs Modernizadas */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-all duration-200 relative ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-700 shadow-sm'
                    : 'border-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="font-medium">{tab.label}</span>
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-5 bg-gray-50 dark:bg-gray-800 min-h-80">
          {renderTabContent()}
        </div>
      </div>

      {/* ✅ NOVO: Modal de Seleção de Agente para Ligação */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                    <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Fazer Ligação</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Selecione um agente para a ligação</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowCallModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <strong>Lead:</strong> {lead.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Telefone:</strong> {lead.phone}
                </p>
              </div>
              
              {callAgents.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Agentes Disponíveis:
                  </h4>
                  {callAgents.map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => handleMakeCall(agent.id)}
                      disabled={callLoading}
                      className="w-full flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-200 dark:hover:border-blue-700 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <Bot className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">{agent.name}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Agente de Ligações</p>
                      </div>
                      {callLoading && (
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6">
                  <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-3" />
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Nenhum agente configurado</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Você precisa configurar um agente de ligação primeiro.
                  </p>
                  <button 
                    onClick={() => {
                      setShowCallModal(false);
                      window.open('/callai', '_blank');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                  >
                    <Bot className="w-4 h-4" />
                    Configurar Agente
                  </button>
                </div>
              )}
              
              <div className="flex justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowCallModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ NOVO: Modal de Seleção de Instância WhatsApp */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Iniciar Conversa WhatsApp</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Selecione uma instância para conversar</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowWhatsAppModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <strong>Lead:</strong> {lead.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  <strong>Empresa:</strong> {lead.company}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <strong>Telefone:</strong> {lead.phone}
                </p>
              </div>
              
              {whatsappLoading ? (
                <div className="text-center p-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent mx-auto mb-3"></div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Buscando instâncias WhatsApp...
                  </p>
                </div>
              ) : whatsappInstances.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Instâncias Disponíveis:
                  </h4>
                  {whatsappInstances.map(instance => (
                    <button
                      key={instance.id}
                      onClick={() => handleCreateWhatsAppConversation(instance.id)}
                      disabled={whatsappLoading}
                      className="w-full flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 hover:border-green-200 dark:hover:border-green-700 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                        <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center border border-gray-200">
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="text-green-500"
                          >
                            <path
                              d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.893 3.405"
                              fill="currentColor"
                            />
                          </svg>
                        </div>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 dark:text-white">{instance.name}</h4>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            instance.connection_status === 'connected'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          }`}>
                            <div className={`w-2 h-2 rounded-full ${
                              instance.connection_status === 'connected' ? 'bg-green-500' : 'bg-orange-500'
                            }`}></div>
                            {instance.connection_status === 'connected' ? 'Conectado' : 'Desconectado'}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center p-6">
                  <AlertTriangle className="w-12 h-12 text-orange-400 mx-auto mb-3" />
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Nenhuma instância encontrada</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Configure uma instância WhatsApp para iniciar conversas.
                  </p>
                  <button 
                    onClick={() => {
                      setShowWhatsAppModal(false);
                      window.open('/whatsapp', '_blank');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Configurar WhatsApp
                  </button>
                </div>
              )}
              
              <div className="flex justify-end mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setShowWhatsAppModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ NOVO: Toast Notifications */}
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />
    </div>
  );
};

export default PipelineLeadDetailsModal;

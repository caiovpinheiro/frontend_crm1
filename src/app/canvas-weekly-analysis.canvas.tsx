import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter
} from 'recharts';

const ConversationAnalysisDashboard = () => {
  const data = {
    organization: "EduIT",
    organizationId: "org_eduit",
    period: {
      start: "2026-09-13T00:00:00.000Z",
      end: "2026-09-18T23:59:59.000Z"
    },
    summary: {
      totalConversations: 1,
      totalMessages: 8,
      humanMessages: 8,
      botMessages: 0,
      systemMessages: 0,
      inboundMessages: 0,
      outboundMessages: 8,
      agentInteractions: {
        "Admin EduIT": 1
      },
      aiAgentInteractions: {},
      departmentStats: {
        "Sem departamento": {
          count: 1,
          conversations: ["#1"]
        }
      },
      channelStats: {
        "whatsapp": 1
      }
    },
    conversations: [
      {
        number: 1,
        contact: "Aluno Mock (+55 11 90000-0001)",
        status: "OPEN",
        channel: "whatsapp",
        assignedTo: "Admin EduIT",
        assignedToType: "HUMAN",
        department: "Sem departamento",
        createdAt: "2026-09-14T17:55:24.337Z",
        updatedAt: "2026-09-14T17:55:24.337Z",
        totalMessages: 8,
        humanMessages: 8,
        botMessages: 0,
        systemMessages: 0,
        inbound: 0,
        outbound: 8,
        hasHumanReply: false,
        hasAgentReply: false,
        messages: [
          {
            timestamp: "2026-09-14T17:55:24.337Z",
            direction: "in",
            authorType: "human",
            aiAgent: null,
            preview: "Olá! Preciso de ajuda com a minha matrícula."
          },
          {
            timestamp: "2026-09-14T18:00:27.046Z",
            direction: "out",
            authorType: "human",
            aiAgent: null,
            preview: "*Admin EduIT*: Posso ajudar em algo mais?"
          },
          {
            timestamp: "2026-09-14T18:00:40.319Z",
            direction: "out",
            authorType: "human",
            aiAgent: null,
            preview: "*Admin EduIT*: Posso te explicar as opções disponíveis."
          },
          {
            timestamp: "2026-09-14T18:00:49.767Z",
            direction: "out",
            authorType: "human",
            aiAgent: null,
            preview: "*Admin EduIT*: Só um momento, por favor. Vou verificar para você."
          },
          {
            timestamp: "2026-09-14T18:01:57.351Z",
            direction: "out",
            authorType: "human",
            aiAgent: null,
            preview: "*Admin EduIT*: Olá! Como posso ajudar?"
          },
          {
            timestamp: "2026-09-14T18:31:08.126Z",
            direction: "out",
            authorType: "human",
            aiAgent: null,
            preview: "*Admin EduIT*: Olá! Como posso ajudar?"
          },
          {
            timestamp: "2026-09-14T18:31:53.102Z",
            direction: "out",
            authorType: "human",
            aiAgent: null,
            preview: "*Admin EduIT*: Só um momento, por favor. Vou verificar para você."
          },
          {
            timestamp: "2026-09-14T18:32:05.982Z",
            direction: "out",
            authorType: "human",
            aiAgent: null,
            preview: "*Admin EduIT*: Posso ajudar em algo mais?"
          }
        ]
      }
    ]
  };

  const [selectedConv, setSelectedConv] = useState(0);
  const [tab, setTab] = useState('overview');

  // Preparar dados para gráficos
  const messageTypeData = [
    { name: 'Humanas', value: data.summary.humanMessages, color: '#3b82f6' },
    { name: 'Bot/IA', value: data.summary.botMessages, color: '#8b5cf6' },
    { name: 'Sistema', value: data.summary.systemMessages, color: '#6b7280' }
  ].filter(d => d.value > 0);

  const directionData = [
    { name: 'Inbound', value: data.summary.inboundMessages, color: '#10b981' },
    { name: 'Outbound', value: data.summary.outboundMessages, color: '#f59e0b' }
  ].filter(d => d.value > 0);

  const channelData = Object.entries(data.summary.channelStats).map(([name, count]) => ({
    name,
    count
  }));

  const agentData = Object.entries(data.summary.agentInteractions).map(([name, count]) => ({
    name,
    conversas: count,
    type: 'Humano'
  }));

  const conv = data.conversations[selectedConv];

  return (
    <div style={{ padding: '24px', backgroundColor: '#0f172a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', marginBottom: '8px' }}>📊 Análise de Conversas da Semana</h1>
        <p style={{ color: '#94a3b8', marginBottom: '4px' }}>
          Período: 13/09 - 18/09/2026
        </p>
        <p style={{ color: '#94a3b8' }}>
          Organização: <strong>{data.organization}</strong>
        </p>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
        {['overview', 'conversations', 'messages'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px',
              backgroundColor: tab === t ? '#3b82f6' : 'transparent',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: tab === t ? '600' : '400'
            }}
          >
            {t === 'overview' && '📈 Visão Geral'}
            {t === 'conversations' && '💬 Conversas'}
            {t === 'messages' && '💭 Mensagens'}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
            {[
              { label: 'Total de Conversas', value: data.summary.totalConversations, icon: '💬' },
              { label: 'Total de Mensagens', value: data.summary.totalMessages, icon: '📨' },
              { label: 'Mensagens Humanas', value: data.summary.humanMessages, icon: '👤' },
              { label: 'Mensagens Bot/IA', value: data.summary.botMessages, icon: '🤖' }
            ].map((kpi, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: '#1e293b',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #334155'
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{kpi.icon}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>{kpi.label}</div>
                <div style={{ fontSize: '24px', fontWeight: '600' }}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Gráficos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            {/* Distribuição por Tipo de Mensagem */}
            {messageTypeData.length > 0 && (
              <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: '600' }}>📊 Distribuição por Tipo</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={messageTypeData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {messageTypeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Inbound vs Outbound */}
            {directionData.length > 0 && (
              <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: '600' }}>🔄 Direção das Mensagens</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={directionData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {directionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Distribuição por Canal */}
            {channelData.length > 0 && (
              <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: '600' }}>📱 Canais</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={channelData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                    <Bar dataKey="count" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Agentes Humanos */}
            {agentData.length > 0 && (
              <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: '600' }}>👥 Agentes Humanos</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={agentData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" stroke="#94a3b8" />
                    <YAxis dataKey="name" type="category" width={150} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
                    <Bar dataKey="conversas" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Resumo por Departamento */}
          <div style={{ marginTop: '24px', backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
            <h3 style={{ marginBottom: '12px', fontSize: '14px', fontWeight: '600' }}>🏷️ Departamentos</h3>
            <div>
              {Object.entries(data.summary.departmentStats).map(([dept, stats]) => (
                <div
                  key={dept}
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid #334155',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}
                >
                  <span>{dept}</span>
                  <strong>{stats.count} conversa(s)</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONVERSATIONS */}
      {tab === 'conversations' && (
        <div>
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ marginBottom: '12px' }}>Selecione uma conversa:</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
              {data.conversations.map((c, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedConv(idx)}
                  style={{
                    padding: '12px',
                    backgroundColor: selectedConv === idx ? '#3b82f6' : '#1e293b',
                    border: selectedConv === idx ? '2px solid #60a5fa' : '1px solid #334155',
                    borderRadius: '6px',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ fontWeight: '600' }}>#{c.number}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{c.contact}</div>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{c.totalMessages} mensagens</div>
                </button>
              ))}
            </div>
          </div>

          {conv && (
            <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '8px', border: '1px solid #334155' }}>
              <h2 style={{ marginBottom: '16px' }}>Conversa #{conv.number}</h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                  { label: 'Contato', value: conv.contact },
                  { label: 'Status', value: conv.status },
                  { label: 'Canal', value: conv.channel },
                  { label: 'Agente', value: conv.assignedTo },
                  { label: 'Departamento', value: conv.department },
                  { label: 'Mensagens', value: `${conv.totalMessages} (${conv.humanMessages} humanas, ${conv.botMessages} bot)` }
                ].map((item, i) => (
                  <div key={i} style={{ backgroundColor: '#0f172a', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>{item.label}</div>
                    <div style={{ fontWeight: '600' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <h3 style={{ marginBottom: '12px' }}>Timeline de Mensagens</h3>
              <div style={{ maxHeight: '400px', overflowY: 'auto', backgroundColor: '#0f172a', borderRadius: '6px', padding: '12px' }}>
                {conv.messages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: '12px',
                      paddingBottom: '12px',
                      borderBottom: '1px solid #334155',
                      display: 'flex',
                      gap: '12px'
                    }}
                  >
                    <div style={{ minWidth: '80px', fontSize: '12px', color: '#94a3b8' }}>
                      {new Date(msg.timestamp).toLocaleTimeString('pt-BR')}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                        {msg.direction === 'in' ? '📥 Inbound' : '📤 Outbound'} • {msg.authorType === 'bot' ? '🤖' : '👤'} {msg.authorType}
                      </div>
                      <div>{msg.preview}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MESSAGES ANALYSIS */}
      {tab === 'messages' && (
        <div>
          {conv && (
            <div>
              <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155', marginBottom: '24px' }}>
                <h3 style={{ marginBottom: '12px' }}>Análise da Conversa #{conv.number}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                  {[
                    { label: 'Total', value: conv.totalMessages, color: '#3b82f6' },
                    { label: 'Humanas', value: conv.humanMessages, color: '#10b981' },
                    { label: 'Bot/IA', value: conv.botMessages, color: '#8b5cf6' },
                    { label: 'Inbound', value: conv.inbound, color: '#f59e0b' },
                    { label: 'Outbound', value: conv.outbound, color: '#ef4444' }
                  ].map((stat, i) => (
                    <div
                      key={i}
                      style={{
                        backgroundColor: '#0f172a',
                        padding: '12px',
                        borderRadius: '6px',
                        borderLeft: `4px solid ${stat.color}`
                      }}
                    >
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{stat.label}</div>
                      <div style={{ fontSize: '20px', fontWeight: '600' }}>{stat.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <h3 style={{ marginBottom: '12px' }}>Necessidades do Cliente Identificadas:</h3>
              <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <ul style={{ lineHeight: '1.8', color: '#cbd5e1' }}>
                  <li>📚 <strong>Ajuda com matrícula</strong> - Cliente solicita assistência no processo de matrícula</li>
                  <li>⏱️ <strong>Resposta rápida</strong> - Múltiplas tentativas de contato do agente (5 respostas sobre espera)</li>
                  <li>❓ <strong>Explicações detalhadas</strong> - Necessidade de entendimento de opções/processos</li>
                  <li>✅ <strong>Disponibilidade</strong> - Cliente precisa de informações rápidas e sem atrasos</li>
                </ul>
              </div>

              <h3 style={{ marginTop: '20px', marginBottom: '12px' }}>Desempenho do Agente Humano:</h3>
              <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <ul style={{ lineHeight: '1.8', color: '#cbd5e1' }}>
                  <li>✅ <strong>Presença</strong> - Agente respondeu durante a conversa</li>
                  <li>✅ <strong>Educação</strong> - Mensagens polidas e respeitosas</li>
                  <li>⚠️ <strong>Redundância</strong> - Múltiplas saudações repetidas ("Olá! Como posso ajudar?" x2)</li>
                  <li>⚠️ <strong>Foco</strong> - Respostas genéricas sem resolver a dúvida específica de matrícula</li>
                  <li>❌ <strong>Inbound não respondido</strong> - 1 mensagem inbound não teve resposta direta</li>
                </ul>
              </div>

              <h3 style={{ marginTop: '20px', marginBottom: '12px' }}>Recomendações para Testes de IA:</h3>
              <div style={{ backgroundColor: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                <ul style={{ lineHeight: '1.8', color: '#cbd5e1' }}>
                  <li>🤖 <strong>Teste de contexto</strong> - IA deve identificar que é sobre matrícula e oferecer informações específicas</li>
                  <li>🤖 <strong>Redução de redundância</strong> - Evitar repetir saudações em sequência</li>
                  <li>🤖 <strong>Resposta direta</strong> - Oferecer ações concretas (links, formulários, próximos passos)</li>
                  <li>🤖 <strong>Análise de satisfação</strong> - Verificar se resoluções da IA superam o 0% de encerramento humano neste caso</li>
                  <li>🤖 <strong>Tempo de resposta</strong> - Medir latência: IA &lt;5s vs Humano ~5min (no caso, 5min+ com delay)</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ConversationAnalysisDashboard;

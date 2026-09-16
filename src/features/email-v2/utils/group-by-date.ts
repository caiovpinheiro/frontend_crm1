import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface GroupedEmail {
  date: string;
  label: string;
  emails: EmailListItem[];
}

export interface EmailListItem {
  id: string;
  receivedAt: string;
  // outros campos necessários
}

/**
 * Agrupa e-mails por data e retorna com rótulos amigáveis (Hoje, Ontem, dd/MM)
 * @param emails Lista de e-mails
 * @returns Lista de grupos de e-mails por data
 */
export function groupEmailsByDate(emails: EmailListItem[]): GroupedEmail[] {
  if (!emails || emails.length === 0) return [];
  
  // Ordena e-mails por data recebida (mais recentes primeiro)
  const sortedEmails = [...emails].sort((a, b) => 
    new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );
  
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  
  const grouped: Record<string, EmailListItem[]> = {};
  
  sortedEmails.forEach(email => {
    const emailDate = new Date(email.receivedAt);
    const dateKey = emailDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(email);
  });
  
  return Object.entries(grouped).map(([dateKey, emails]) => {
    const date = new Date(dateKey);
    let label = '';
    
    if (date.toDateString() === today.toDateString()) {
      label = 'Hoje';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'Ontem';
    } else {
      label = format(date, 'dd/MM', { locale: ptBR });
    }
    
    return {
      date: dateKey,
      label,
      emails
    };
  });
}
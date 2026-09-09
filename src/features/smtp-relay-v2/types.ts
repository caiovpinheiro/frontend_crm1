/**
 * Relay SMTP (smarthost) por org — espelha GET/PUT /api/settings/smtp-relay.
 * A senha nunca trafega de volta: o backend expõe apenas `hasPassword`.
 */
export type SmtpRelaySettings = {
  configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  enabled: boolean;
  updatedAt: string | null;
};

export type SmtpRelayInput = {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  /** Omitida/vazia = manter a senha atual. */
  password?: string;
  /** true = remover a senha (relay sem AUTH, ex.: liberação por IP). */
  clearPassword?: boolean;
  enabled: boolean;
};

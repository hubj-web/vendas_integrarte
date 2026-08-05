import nodemailer from "nodemailer";
import { ENV } from "./_core/env";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  launcher: "Vendedor",
  delivery: "Entregador",
};

const ROLE_LOGIN_PATHS: Record<string, string> = {
  admin: "/admin",
  launcher: "/vendedor",
  delivery: "/entregador",
};

function isConfigured(): boolean {
  return !!ENV.gmailUser && !!ENV.gmailAppPassword;
}

function getTransport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: ENV.gmailUser,
      pass: ENV.gmailAppPassword,
    },
    connectionTimeout: 15000,
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!isConfigured()) {
    console.warn("[Email] GMAIL_USER/GMAIL_APP_PASSWORD não configurados — e-mail não enviado.");
    return false;
  }
  try {
    const transport = getTransport();
    await transport.sendMail({
      from: `"ERP Integrarte" <${ENV.gmailUser}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error("[Email] Falha ao enviar e-mail:", err);
    return false;
  }
}

const EMAIL_WRAPPER = (title: string, bodyHtml: string) => `
<div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <div style="background: linear-gradient(135deg, #059669, #047857); border-radius: 12px 12px 0 0; padding: 24px; text-align: center;">
    <h1 style="color: #ffffff; font-size: 18px; margin: 0;">ERP Integrarte</h1>
  </div>
  <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
    <h2 style="font-size: 16px; color: #111827; margin-top: 0;">${title}</h2>
    ${bodyHtml}
  </div>
  <p style="text-align: center; font-size: 11px; color: #9ca3af; margin-top: 16px;">
    Esta é uma mensagem automática do sistema Integrarte — não responda este e-mail.
  </p>
</div>`;

/** E-mail de boas-vindas enviado quando um novo usuário é cadastrado. */
export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  temporaryPassword: string;
  role: string;
}): Promise<boolean> {
  const roleLabel = ROLE_LABELS[params.role] ?? "Usuário";
  const loginPath = ROLE_LOGIN_PATHS[params.role] ?? "/";
  const loginUrl = `${ENV.appUrl}${loginPath}`;

  const html = EMAIL_WRAPPER(
    `Bem-vindo(a), ${params.name}!`,
    `
      <p style="font-size: 14px; color: #374151; line-height: 1.6;">
        Uma conta foi criada para você no sistema Integrarte, com acesso de <strong>${roleLabel}</strong>.
      </p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p style="font-size: 13px; color: #374151; margin: 0 0 8px 0;"><strong>Usuário:</strong> ${params.to}</p>
        <p style="font-size: 13px; color: #374151; margin: 0;"><strong>Senha provisória:</strong> ${params.temporaryPassword}</p>
      </div>
      <p style="font-size: 13px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px;">
        ⚠️ No primeiro acesso, o sistema vai pedir para você definir sua própria senha, no lugar dessa provisória.
      </p>
      <div style="text-align: center; margin: 24px 0 8px 0;">
        <a href="${loginUrl}" style="background: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: bold; display: inline-block;">
          Acessar o sistema
        </a>
      </div>
      <p style="font-size: 11px; color: #9ca3af; text-align: center;">${loginUrl}</p>
    `
  );

  return sendEmail(params.to, "Bem-vindo(a) ao Sistema Integrarte", html);
}

/** E-mail com o link de redefinição de senha ("esqueci minha senha"). */
export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  token: string;
}): Promise<boolean> {
  const resetUrl = `${ENV.appUrl}/redefinir-senha?token=${params.token}`;

  const html = EMAIL_WRAPPER(
    "Redefinição de senha",
    `
      <p style="font-size: 14px; color: #374151; line-height: 1.6;">
        Olá, ${params.name}. Recebemos um pedido para redefinir a senha da sua conta no sistema Integrarte.
      </p>
      <p style="font-size: 14px; color: #374151; line-height: 1.6;">
        Clique no botão abaixo para escolher uma nova senha. Este link expira em <strong>1 hora</strong>.
      </p>
      <div style="text-align: center; margin: 24px 0 8px 0;">
        <a href="${resetUrl}" style="background: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: bold; display: inline-block;">
          Redefinir minha senha
        </a>
      </div>
      <p style="font-size: 11px; color: #9ca3af; text-align: center;">${resetUrl}</p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 20px;">
        Se você não pediu essa redefinição, pode ignorar este e-mail — sua senha continua a mesma.
      </p>
    `
  );

  return sendEmail(params.to, "Redefinição de senha — Integrarte", html);
}

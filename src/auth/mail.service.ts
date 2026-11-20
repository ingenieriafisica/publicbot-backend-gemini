import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.MAIL_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.MAIL_PORT || '587', 10);
    const secure = process.env.MAIL_SECURE === 'true' || port === 465;
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS ? process.env.MAIL_PASS.replace(/['"]/g, '').trim() : undefined;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  async testConnection(): Promise<{ ok: boolean; message: string; host: string; port: number; userConfigured: boolean; passConfigured: boolean }> {
    this.initTransporter();
    const host = process.env.MAIL_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.MAIL_PORT || '587', 10);
    const userConfigured = !!process.env.MAIL_USER && process.env.MAIL_USER !== 'tu_correo@gmail.com';
    const passConfigured = !!process.env.MAIL_PASS && process.env.MAIL_PASS !== 'tu_app_password';

    if (!userConfigured || !passConfigured) {
      return {
        ok: false,
        message: 'Faltan credenciales válidas en .env: define MAIL_USER y MAIL_PASS.',
        host,
        port,
        userConfigured,
        passConfigured,
      };
    }

    try {
      await this.transporter.verify();
      return {
        ok: true,
        message: 'Conexión SMTP exitosa.',
        host,
        port,
        userConfigured,
        passConfigured,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message || String(err),
        host,
        port,
        userConfigured,
        passConfigured,
      };
    }
  }

  async sendOtp(to: string, code: string, expiresInMinutes = 5): Promise<void> {
    if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
      const msg = 'Variables MAIL_USER o MAIL_PASS no están configuradas en el archivo .env del servidor';
      this.logger.error(msg);
      throw new InternalServerErrorException(msg);
    }

    this.initTransporter();
    const subject = `${code} es tu código de acceso — PublicBot OTP`;

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PublicBot OTP</title>
      </head>
      <body style="margin:0;padding:0;background-color:#FAF9FB;font-family:'Inter',ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FAF9FB;padding:40px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="480" cellspacing="0" cellpadding="0"
                style="background-color:#ffffff;border-radius:16px;border:1px solid #E4E4E7;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.04);">

                <!-- Green Accent Top Bar -->
                <tr>
                  <td style="background:#39A900;height:4px;padding:0;"></td>
                </tr>

                <!-- Header -->
                <tr>
                  <td style="padding:32px 32px 16px;text-align:center;">
                    <h1 style="color:#18181B;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.025em;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;">
                      PublicBot OTP
                    </h1>
                    <p style="margin:6px 0 0;color:#71717A;font-size:13px;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;">
                      Acceso seguro mediante código de un solo uso
                    </p>
                  </td>
                </tr>

                <!-- Divider -->
                <tr>
                  <td style="padding:0 32px;">
                    <div style="border-top:1px solid #E4E4E7;"></div>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:28px 32px 32px;">
                    <p style="margin:0 0 8px;color:#18181B;font-size:16px;font-weight:600;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;">
                      Hola 👋
                    </p>
                    <p style="margin:0 0 24px;color:#71717A;font-size:14px;line-height:1.6;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;">
                      Recibimos una solicitud de autenticación para tu cuenta en <strong style="color:#18181B;">PublicBot</strong>. Usa el siguiente código para iniciar sesión sin contraseñas:
                    </p>

                    <!-- OTP Code Box (Green & White style) -->
                    <div style="text-align:center;margin:24px 0;">
                      <div style="display:inline-block;background-color:#f0fdf4;border:2px solid #39A900;border-radius:12px;padding:16px 36px;">
                        <p style="margin:0 0 6px;color:#166534;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;">
                          Código de verificación
                        </p>
                        <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#39A900;font-family:'Courier New',monospace;">
                          ${code}
                        </span>
                      </div>
                    </div>

                    <p style="margin:0 0 16px;color:#71717A;font-size:14px;line-height:1.6;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;">
                      ⏱ Este código expira en <strong style="color:#18181B;">${expiresInMinutes} minutos</strong>.<br>
                      <span style="color:#a1a1aa;font-size:12px;">Si no solicitaste este código, puedes ignorar este correo.</span>
                    </p>

                    <!-- Security Alert (Green accent) -->
                    <div style="background-color:#f0fdf4;border-left:4px solid #39A900;border-radius:4px;padding:12px 16px;">
                      <p style="margin:0;color:#166534;font-size:13px;line-height:1.5;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;">
                        🔒 Nunca compartas este código con nadie. El equipo de SENA o PublicBot nunca te lo solicitará.
                      </p>
                    </div>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color:#F4F4F5;padding:16px 24px;text-align:center;border-top:1px solid #E4E4E7;">
                    <p style="color:#71717A;font-size:11px;margin:0;font-family:'Inter',ui-sans-serif,system-ui,sans-serif;">
                      © ${new Date().getFullYear()} SENA · PublicBot. Este es un correo automático.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      this.logger.log(`Enviando correo OTP a ${to}`);
      await this.transporter.sendMail({
        from:
          process.env.MAIL_FROM || `"PublicBot OTP" <${process.env.MAIL_USER}>`,
        to,
        subject,
        html,
        text: `Tu código de acceso a PublicBot es: ${code}\nExpira en ${expiresInMinutes} minutos.`,
      });
      this.logger.log(`OTP enviado exitosamente a ${to}`);
    } catch (error: any) {
      this.logger.error(`Error enviando OTP a ${to}: ${error?.message || error}`);
      throw new InternalServerErrorException(
        `No se pudo enviar el correo de verificación: ${error?.message || 'Error en SMTP'}`,
      );
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PasswordResetMailerService {
  private readonly logger = new Logger(PasswordResetMailerService.name);

  constructor(private readonly config: ConfigService) { }

  async send(email: string, resetUrl: string) {
    console.log('\n🔴 SEND EMAIL CALLED');
    console.log('Email:', email);
    console.log('URL:', resetUrl);

    const nodeEnv = this.config.get<string>('NODE_ENV') || 'development';
    console.log('NODE_ENV:', nodeEnv);

    try {
      // ✅ LOCALHOST: просто логуємо в консоль
      if (
        nodeEnv === 'development' ||
        nodeEnv === 'localhost' ||
        nodeEnv !== 'production'
      ) {
        console.log('\n' + '='.repeat(70));
        console.log('📧 PASSWORD RESET EMAIL (DEV MODE)');
        console.log('='.repeat(70));
        console.log(`📬 To: ${email}`);
        console.log(`\n🔗 COPY THIS LINK AND PASTE IN BROWSER:\n`);
        console.log(`${resetUrl}`);
        console.log(`\n⏱️  Link expires in 15 minutes`);
        console.log('='.repeat(70) + '\n');

        this.logger.log(`Reset email logged for: ${email}`);
        return;
      }

      // PRODUCTION: використовуємо Resend
      const apiKey = this.config.get<string>('RESEND_API_KEY');
      const from = this.config.get<string>('EMAIL_FROM');

      console.log('PRODUCTION MODE - Sending via Resend');
      console.log('API Key exists:', !!apiKey);
      console.log('From:', from);

      if (!apiKey || !from) {
        throw new Error('RESEND_API_KEY or EMAIL_FROM not configured');
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'Відновлення пароля AI Nutrition',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Відновлення пароля</h2>
              <p>Щоб встановити новий пароль, перейдіть за посиланням:</p>
              <p>
                <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                  Відновити пароль
                </a>
              </p>
              <p style="color: #666; font-size: 12px;">
                Посилання діє 15 хвилин.<br>
                Якщо ви не запитували скидання пароля, проігноруйте цей лист.
              </p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Resend API error: ${error}`);
      }

      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      console.error('\n❌ EMAIL SEND ERROR:');
      console.error(error);
      // НЕ кидаємо помилку - система вже показала повідомлення
      // цих логувати помилку, але юзер вже отримав відповідь
      this.logger.error(`Failed to send password reset email: ${error.message}`);
    }
  }
}
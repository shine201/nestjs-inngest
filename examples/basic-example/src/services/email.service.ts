import { Injectable, Logger } from '@nestjs/common';

export interface EmailResult {
  messageId: string;
  success: boolean;
  error?: string;
}

export interface EmailTemplate {
  subject: string;
  htmlContent: string;
  textContent: string;
}

/**
 * Email service for sending various types of emails
 * 
 * In a real application, this would integrate with services like:
 * - SendGrid
 * - AWS SES
 * - Mailgun
 * - Postmark
 * 
 * For this example, we'll simulate email sending with console logging
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  /**
   * Send a welcome email to a newly registered user
   */
  async sendWelcomeEmail(
    email: string,
    data: { name: string }
  ): Promise<EmailResult> {
    const template = this.getWelcomeEmailTemplate(data.name);
    
    try {
      // Simulate email sending
      await this.simulateEmailSending(email, template);
      
      const messageId = `welcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.logger.log(`Welcome email sent to ${email} (Message ID: ${messageId})`);
      
      return {
        messageId,
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
      
      return {
        messageId: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send an email verification email
   */
  async sendVerificationEmail(
    email: string,
    data: { name: string; verificationToken: string; verificationUrl: string }
  ): Promise<EmailResult> {
    const template = this.getVerificationEmailTemplate(data);
    
    try {
      await this.simulateEmailSending(email, template);
      
      const messageId = `verification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.logger.log(`Verification email sent to ${email} (Message ID: ${messageId})`);
      
      return {
        messageId,
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}:`, error);
      
      return {
        messageId: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send a password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    data: { name: string; resetToken: string; resetUrl: string }
  ): Promise<EmailResult> {
    const template = this.getPasswordResetEmailTemplate(data);
    
    try {
      await this.simulateEmailSending(email, template);
      
      const messageId = `password-reset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.logger.log(`Password reset email sent to ${email} (Message ID: ${messageId})`);
      
      return {
        messageId,
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}:`, error);
      
      return {
        messageId: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Send a generic notification email
   */
  async sendNotificationEmail(
    email: string,
    data: { 
      name: string; 
      subject: string; 
      message: string;
      actionUrl?: string;
      actionText?: string;
    }
  ): Promise<EmailResult> {
    const template = this.getNotificationEmailTemplate(data);
    
    try {
      await this.simulateEmailSending(email, template);
      
      const messageId = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      this.logger.log(`Notification email sent to ${email} (Message ID: ${messageId})`);
      
      return {
        messageId,
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to send notification email to ${email}:`, error);
      
      return {
        messageId: '',
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if email service is healthy
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
    try {
      // In a real implementation, this would check the email provider's status
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate API call
      
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        details: `Email service health check failed: ${error.message}` 
      };
    }
  }

  /**
   * Simulate email sending with random delays and occasional failures
   */
  private async simulateEmailSending(email: string, template: EmailTemplate): Promise<void> {
    // Simulate network delay
    const delay = Math.random() * 2000 + 500; // 500ms to 2.5s
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Simulate occasional failures (5% failure rate) - DISABLED for testing
    // if (Math.random() < 0.05) {
    //   throw new Error('Simulated email service failure');
    // }
    
    // Log the email content for development
    this.logger.debug(`📧 Email Details:
      To: ${email}
      Subject: ${template.subject}
      Content: ${template.textContent.substring(0, 100)}...
    `);
  }

  /**
   * Get welcome email template
   */
  private getWelcomeEmailTemplate(name: string): EmailTemplate {
    const subject = `Welcome to Our App, ${name}!`;
    
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #007bff;">Welcome to Our App!</h1>
            <p>Hi ${name},</p>
            <p>Welcome to our amazing application! We're excited to have you on board.</p>
            <p>Here are some things you can do to get started:</p>
            <ul>
              <li>Complete your profile</li>
              <li>Explore our features</li>
              <li>Connect with other users</li>
            </ul>
            <p>If you have any questions, feel free to reach out to our support team.</p>
            <p>Best regards,<br>The Team</p>
          </div>
        </body>
      </html>
    `;
    
    const textContent = `
      Welcome to Our App!
      
      Hi ${name},
      
      Welcome to our amazing application! We're excited to have you on board.
      
      Here are some things you can do to get started:
      - Complete your profile
      - Explore our features
      - Connect with other users
      
      If you have any questions, feel free to reach out to our support team.
      
      Best regards,
      The Team
    `;
    
    return { subject, htmlContent, textContent };
  }

  /**
   * Get verification email template
   */
  private getVerificationEmailTemplate(data: { 
    name: string; 
    verificationToken: string; 
    verificationUrl: string; 
  }): EmailTemplate {
    const subject = 'Please verify your email address';
    
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #007bff;">Verify Your Email</h1>
            <p>Hi ${data.name},</p>
            <p>Please click the link below to verify your email address:</p>
            <p style="text-align: center;">
              <a href="${data.verificationUrl}" 
                 style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Verify Email
              </a>
            </p>
            <p>If you can't click the button, copy and paste this URL into your browser:</p>
            <p style="word-break: break-all; color: #666;">${data.verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
          </div>
        </body>
      </html>
    `;
    
    const textContent = `
      Verify Your Email
      
      Hi ${data.name},
      
      Please visit the following URL to verify your email address:
      ${data.verificationUrl}
      
      This link will expire in 24 hours.
    `;
    
    return { subject, htmlContent, textContent };
  }

  /**
   * Get password reset email template
   */
  private getPasswordResetEmailTemplate(data: { 
    name: string; 
    resetToken: string; 
    resetUrl: string; 
  }): EmailTemplate {
    const subject = 'Password Reset Request';
    
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #dc3545;">Password Reset</h1>
            <p>Hi ${data.name},</p>
            <p>You requested a password reset. Click the link below to reset your password:</p>
            <p style="text-align: center;">
              <a href="${data.resetUrl}" 
                 style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
                Reset Password
              </a>
            </p>
            <p>If you can't click the button, copy and paste this URL into your browser:</p>
            <p style="word-break: break-all; color: #666;">${data.resetUrl}</p>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        </body>
      </html>
    `;
    
    const textContent = `
      Password Reset
      
      Hi ${data.name},
      
      You requested a password reset. Visit the following URL to reset your password:
      ${data.resetUrl}
      
      This link will expire in 1 hour.
      
      If you didn't request this, please ignore this email.
    `;
    
    return { subject, htmlContent, textContent };
  }

  /**
   * Get notification email template
   */
  private getNotificationEmailTemplate(data: { 
    name: string; 
    subject: string; 
    message: string;
    actionUrl?: string;
    actionText?: string;
  }): EmailTemplate {
    const actionButton = data.actionUrl && data.actionText ? `
      <p style="text-align: center;">
        <a href="${data.actionUrl}" 
           style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
          ${data.actionText}
        </a>
      </p>
    ` : '';
    
    const htmlContent = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #007bff;">${data.subject}</h1>
            <p>Hi ${data.name},</p>
            <p>${data.message}</p>
            ${actionButton}
            <p>Best regards,<br>The Team</p>
          </div>
        </body>
      </html>
    `;
    
    const textContent = `
      ${data.subject}
      
      Hi ${data.name},
      
      ${data.message}
      ${data.actionUrl ? `\nAction: ${data.actionUrl}` : ''}
      
      Best regards,
      The Team
    `;
    
    return { subject: data.subject, htmlContent, textContent };
  }
}
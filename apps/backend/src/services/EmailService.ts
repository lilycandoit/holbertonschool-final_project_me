import { Resend } from 'resend';
import { User, Order, Subscription } from "@prisma/client";

// Type for order with optional user info and items
type OrderWithUser = Order & {
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  items?: Array<{
    id: string;
    quantity: number;
    priceCents: number;
    subscriptionType: string | null;
    requestedDeliveryDate: Date | null;
    product: {
      id: string;
      name: string;
      priceCents: number;
      imageUrl: string | null;
    };
  }>;
};

export class EmailService {
  private resend: Resend;
  private fromEmail: string;

  constructor() {
    // Initialize Resend with API key
    const apiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS;

    if (!apiKey) {
      console.error("❌ RESEND_API_KEY not found in environment variables");
      throw new Error("RESEND_API_KEY is required");
    }

    this.resend = new Resend(apiKey);

    // Resend requires verified sender domain
    // For testing: use onboarding@resend.dev
    // For production: use your verified domain
    this.fromEmail = process.env.FROM_EMAIL || "onboarding@resend.dev";

    console.log("✅ Resend email service initialized");
    console.log(`📧 Sending from: ${this.fromEmail}`);
  }

  // Helper method to get customer name from order
  private getCustomerName(order: OrderWithUser): string {
    if (order.user?.firstName && order.user?.lastName) {
      return `${order.user.firstName} ${order.user.lastName}`;
    }
    if (order.billingFirstName && order.billingLastName) {
      return `${order.billingFirstName} ${order.billingLastName}`;
    }
    if (order.shippingFirstName && order.shippingLastName) {
      return `${order.shippingFirstName} ${order.shippingLastName}`;
    }
    return order.user?.firstName || 'Valued Customer';
  }

  // Helper method to format dates consistently
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  async sendWelcomeEmail(user: User): Promise<void> {
    const personalization = this.getPersonalization(user);

    try {
      await this.resend.emails.send({
        from: `Flora Marketplace <${this.fromEmail}>`,
        to: user.email,
        subject: "Welcome to Flora!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Welcome to Flora!</h1>
            <p>Dear ${user.firstName || "Customer"},</p>
            <p>Thank you for joining Flora! We're excited to help you discover beautiful, fresh flowers for every occasion.</p>

            ${personalization ? `
            <div style="background-color: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #16a34a; margin-top: 0;">Based on your preferences:</h3>
              <p>${personalization}</p>
            </div>
            ` : ''}

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #16a34a; margin-top: 0;">What's next?</h3>
              <ul>
                <li>Browse our collection of fresh flowers and arrangements</li>
                <li>Consider a subscription for regular flower deliveries</li>
                <li>Check out our seasonal specials</li>
                <li>Complete your profile to get personalized recommendations</li>
              </ul>
            </div>

            <p>If you have any questions, feel free to reach out to our customer service team.</p>
            <p>Happy flowering!</p>
            <p>The Flora Team</p>
          </div>
        `,
      });

      console.log(`✅ Welcome email sent to ${user.email}`);
    } catch (error) {
      console.error(`❌ Failed to send welcome email to ${user.email}:`, error);
      throw error;
    }
  }

  async sendOrderConfirmation(order: OrderWithUser): Promise<void> {
    const customerEmail = order.guestEmail || order.user?.email;
    const customerName = this.getCustomerName(order);
    const subtotalAmount = (order.subtotalCents / 100).toFixed(2);
    const shippingAmount = ((order.totalCents - order.subtotalCents) / 100).toFixed(2);
    const totalAmount = (order.totalCents / 100).toFixed(2);

    if (!customerEmail) {
      console.warn('No email found for order confirmation:', order.id);
      return;
    }

    try {
      await this.resend.emails.send({
        from: `Flora Marketplace <${this.fromEmail}>`,
        to: customerEmail,
        subject: `Order Confirmation #${order.orderNumber}`,
        html: `
          <div style="font-family: 'Outfit', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
            <!-- Logo Section -->
            <div style="text-align: center; padding: 2rem 0; width: 100%; box-sizing: border-box;">
              <img src="https://i.imgur.com/yWZVxUd.png" alt="FLORA" style="max-width: 200px; height: auto; display: block; margin: 0 auto;">
            </div>

            <!-- Header Section -->
            <div style="background: #C8D7C4; width: 100%; padding: 2rem 2rem; text-align: center; box-sizing: border-box;">
              <h1 style="color: #595E4E; font-size: 36px; font-weight: 600; font-family: 'EB Garamond', Georgia, serif; margin: 0 0 1rem 0; letter-spacing: 2px;">ORDER CONFIRMATION</h1>

              <!-- Order Number Highlight -->
              <div style="background: rgba(255, 255, 255, 0.7); padding: 0.75rem 1.5rem; border-radius: 8px; margin: 1rem auto; display: inline-block; border: 2px solid #595E4E;">
                <span style="color: #595E4E; font-size: 0.95rem; font-weight: 500;">Order Number:</span>
                <span style="color: #595E4E; font-size: 1.125rem; font-family: 'EB Garamond', Georgia, serif; font-weight: 600; letter-spacing: 1px;"> #${order.orderNumber}</span>
              </div>

              <p style="color: #595E4E; font-size: 1.125rem; margin: 1rem 0;">${customerName}, thank you for your order!</p>
              <p style="color: #595E4E; font-size: 0.95rem; line-height: 1.6; margin: 0.5rem auto; max-width: 500px;">We've received your order and will contact you as soon as your package is shipped. You can find your purchase information below.</p>
            </div>

            <!-- Order Summary Section -->
            <div style="padding: 2rem; text-align: center; width: 100%; box-sizing: border-box;">
              <h2 style="color: #595E4E; font-size: 36px; font-weight: 600; font-family: 'EB Garamond', Georgia, serif; margin-bottom: 0.5rem;">Order Summary</h2>
              <p style="color: #595E4E; font-size: 16px; margin-bottom: 2rem;">${this.formatDate(order.createdAt)}</p>

              <!-- Order Items -->
              ${this.renderOrderItems(order)}

              <!-- Price Breakdown -->
              <table style="max-width: 400px; width: 100%; margin: 2rem auto; padding-top: 1.5rem; border-top: 1px solid #e5e5e0; border-collapse: collapse;">
                <tr>
                  <td style="padding: 0.35rem 0; color: #595E4E; font-size: 1rem; text-align: left;">Subtotal</td>
                  <td style="padding: 0.35rem 0; color: #595E4E; font-size: 1rem; text-align: right;">$${subtotalAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 0.35rem 0; color: #595E4E; font-size: 1rem; text-align: left;">Shipping</td>
                  <td style="padding: 0.35rem 0; color: #595E4E; font-size: 1rem; text-align: right;">$${shippingAmount}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 0.5rem; border-top: 1px solid #e5e5e0;"></td>
                </tr>
                <tr>
                  <td style="padding: 0.5rem 0; color: #595E4E; font-size: 1.125rem; font-weight: 700; text-align: left;">Total</td>
                  <td style="padding: 0.5rem 0; color: #595E4E; font-size: 1.125rem; font-weight: 700; text-align: right;">$${totalAmount}</td>
                </tr>
              </table>
            </div>

            <!-- Billing and Shipping Section -->
            <div style="padding: 2rem; text-align: center; width: 100%; box-sizing: border-box;">
              <h2 style="color: #595E4E; font-size: 36px; font-family: 'EB Garamond', Georgia, serif; font-weight: 600; margin-bottom: 2rem;">Billing and Shipping</h2>

              <table style="width: 100%; max-width: 500px; margin: 0 auto; border-collapse: collapse;">
                <tr>
                  <td style="width: 50%; vertical-align: top; padding: 1rem; text-align: left;">
                    <h3 style="color: #595E4E; font-size: 20px; font-weight: 500; font-family: 'EB Garamond', Georgia, serif; margin: 0 0 1rem 0; white-space: nowrap;">Billing Information</h3>
                    <p style="color: #595E4E; font-size: 15px; margin: 0.25rem 0; line-height: 1.6;">
                      ${order.billingFirstName && order.billingLastName
                        ? `${order.billingFirstName} ${order.billingLastName}<br/>${order.billingStreet1}<br/>${order.billingStreet2 ? order.billingStreet2 + '<br/>' : ''}${order.billingCity}, ${order.billingState}<br/>${order.billingZipCode}<br/>${order.billingCountry || 'AU'}`
                        : `${order.shippingFirstName} ${order.shippingLastName}<br/>${order.shippingStreet1}<br/>${order.shippingStreet2 ? order.shippingStreet2 + '<br/>' : ''}${order.shippingCity}, ${order.shippingState}<br/>${order.shippingZipCode}<br/>${order.shippingCountry || 'AU'}<br/><span style="color: #6b7a5e; font-style: italic;">(Same as shipping)</span>`}
                    </p>
                  </td>
                  <td style="width: 50%; vertical-align: top; padding: 1rem; text-align: left;">
                    <h3 style="color: #595E4E; font-size: 20px; font-weight: 500; font-family: 'EB Garamond', Georgia, serif; margin: 0 0 1rem 0; white-space: nowrap;">Shipping Information</h3>
                    <p style="color: #595E4E; font-size: 15px; margin: 0.25rem 0; line-height: 1.6;">
                      ${order.shippingFirstName} ${order.shippingLastName}<br/>
                      ${order.shippingStreet1}<br/>
                      ${order.shippingStreet2 ? order.shippingStreet2 + '<br/>' : ''}
                      ${order.shippingCity}, ${order.shippingState}<br/>
                      ${order.shippingZipCode}<br/>
                      ${order.shippingCountry || 'AU'}
                    </p>
                  </td>
                </tr>
              </table>

              <div style="margin-top: 2rem;">
                <p style="color: #595E4E; font-size: 0.95rem; line-height: 1.6;">
                  ${order.requestedDeliveryDate
                    ? `<strong>Requested Delivery Date:</strong> ${this.formatDate(new Date(order.requestedDeliveryDate))}<br/>`
                    : ''}
                  ${order.deliveryNotes ? `<strong>Delivery Notes:</strong> ${order.deliveryNotes}<br/>` : ''}
                  <strong>Shipping method:</strong> ${order.deliveryType === 'STANDARD' ? 'Standard shipping' : order.deliveryType || 'Standard shipping'}
                </p>
              </div>
            </div>

            <!-- Footer Section -->
            <div style="background: #C8D7C4; width: 100%; padding: 2rem 2rem; text-align: center; box-sizing: border-box;">
              <p style="color: #595E4E; font-size: 0.95rem; line-height: 1.6; margin: 0 0 1rem 0;">We'll send you another email when your order ships with tracking information.</p>
              <p style="color: #595E4E; font-size: 0.95rem; margin: 0;">Thank you for choosing Flora!</p>
              <p style="color: #595E4E; font-size: 0.95rem; font-weight: 500; margin: 0.5rem 0 0 0;">The Flora Team</p>
            </div>
          </div>
        `,
      });

      console.log(`✅ Order confirmation sent to ${customerEmail} for order #${order.orderNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send order confirmation to ${customerEmail}:`, error);
      throw error;
    }
  }

  async sendOrderShipped(order: OrderWithUser, trackingNumber?: string): Promise<void> {
    const customerEmail = order.guestEmail || order.user?.email;
    const customerName = this.getCustomerName(order);
    const deliveryAddress = `${order.shippingFirstName} ${order.shippingLastName}\n${order.shippingStreet1}${order.shippingStreet2 ? '\n' + order.shippingStreet2 : ''}\n${order.shippingCity}, ${order.shippingState} ${order.shippingZipCode}`;

    if (!customerEmail) {
      console.warn('No email found for shipping notification:', order.id);
      return;
    }

    try {
      await this.resend.emails.send({
        from: `Flora Marketplace <${this.fromEmail}>`,
        to: customerEmail,
        subject: `Your Flora Order #${order.orderNumber} Has Shipped!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Your Order Has Shipped!</h1>
            <p>Dear ${customerName},</p>
            <p>Great news! Your Flora order is on its way to you.</p>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #16a34a; margin-top: 0;">Shipping Information</h3>
              <p><strong>Order Number:</strong> #${order.orderNumber}</p>
              ${trackingNumber ? `<p><strong>Tracking Number:</strong> ${trackingNumber}</p>` : ""}
              <p><strong>Delivery Address:</strong><br/>
              ${deliveryAddress}</p>
              ${
                order.requestedDeliveryDate
                  ? `<p><strong>Expected Delivery:</strong> ${new Date(order.requestedDeliveryDate).toLocaleDateString()}</p>`
                  : ""
              }
            </div>

            <p>Your fresh flowers are carefully packaged and on their way to brighten your day!</p>
            <p>The Flora Team</p>
          </div>
        `,
      });

      console.log(`✅ Shipping notification sent to ${customerEmail} for order #${order.orderNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send shipping notification to ${customerEmail}:`, error);
      throw error;
    }
  }

  async sendSubscriptionConfirmation(subscription: Subscription & { user: User }): Promise<void> {
    try {
      await this.resend.emails.send({
        from: `Flora Marketplace <${this.fromEmail}>`,
        to: subscription.user.email,
        subject: "Your Flora Subscription is Active!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Subscription Confirmed!</h1>
            <p>Dear ${subscription.user.firstName || subscription.user.lastName || "Customer"},</p>
            <p>Your Flora subscription is now active! You'll receive beautiful, fresh flowers regularly.</p>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #16a34a; margin-top: 0;">Subscription Details</h3>
              <p><strong>Subscription Type:</strong> ${subscription.type}</p>
              <p><strong>Start Date:</strong> ${subscription.createdAt.toLocaleDateString()}</p>
              <p><strong>Next Delivery:</strong> ${subscription.nextDeliveryDate?.toLocaleDateString() || 'TBD'}</p>
              <p><strong>Delivery Address:</strong><br/>
              Address on file</p>
              ${subscription.deliveryNotes ? `<p><strong>Notes:</strong> ${subscription.deliveryNotes}</p>` : ""}
            </div>

            <p>You can manage your subscription anytime from your account dashboard.</p>
            <p>Welcome to the Flora family!</p>
            <p>The Flora Team</p>
          </div>
        `,
      });

      console.log(`✅ Subscription confirmation sent to ${subscription.user.email}`);
    } catch (error) {
      console.error(`❌ Failed to send subscription confirmation to ${subscription.user.email}:`, error);
      throw error;
    }
  }

  async sendSubscriptionReminder(subscription: Subscription & { user: User }): Promise<void> {
    try {
      await this.resend.emails.send({
        from: `Flora Marketplace <${this.fromEmail}>`,
        to: subscription.user.email,
        subject: "Your Flora Delivery is Coming Soon!",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Delivery Reminder</h1>
            <p>Dear ${subscription.user.firstName || subscription.user.lastName || "Customer"},</p>
            <p>Just a friendly reminder that your next Flora delivery is scheduled for ${subscription.nextDeliveryDate?.toLocaleDateString() || 'TBD'}.</p>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #16a34a; margin-top: 0;">Delivery Details</h3>
              <p><strong>Delivery Date:</strong> ${subscription.nextDeliveryDate?.toLocaleDateString() || 'TBD'}</p>
              <p><strong>Delivery Address:</strong><br/>
              Address on file</p>
            </div>

            <p>Need to make changes to your subscription? You can do so anytime from your account dashboard.</p>
            <p>The Flora Team</p>
          </div>
        `,
      });

      console.log(`✅ Subscription reminder sent to ${subscription.user.email}`);
    } catch (error) {
      console.error(`❌ Failed to send subscription reminder to ${subscription.user.email}:`, error);
      throw error;
    }
  }

  async sendPasswordReset(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    try {
      await this.resend.emails.send({
        from: `Flora Marketplace <${this.fromEmail}>`,
        to: email,
        subject: "Reset Your Flora Password",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Reset Your Password</h1>
            <p>We received a request to reset your Flora account password.</p>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <a href="${resetUrl}" style="display: inline-block; background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Reset Password
              </a>
            </div>

            <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
            <p>This link will expire in 1 hour for security reasons.</p>
            <p>The Flora Team</p>
          </div>
        `,
      });

      console.log(`✅ Password reset email sent to ${email}`);
    } catch (error) {
      console.error(`❌ Failed to send password reset email to ${email}:`, error);
      throw error;
    }
  }

  async sendContactFormSubmission(data: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<void> {
    try {
      // Send to support team
      await this.resend.emails.send({
        from: `Flora Marketplace <${this.fromEmail}>`,
        to: process.env.CONTACT_EMAIL || "support@flora.com",
        subject: `Contact Form: ${data.subject}`,
        reply_to: data.email,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">New Contact Form Submission</h1>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Name:</strong> ${data.name}</p>
              <p><strong>Email:</strong> ${data.email}</p>
              <p><strong>Subject:</strong> ${data.subject}</p>
              <p><strong>Message:</strong></p>
              <p>${data.message.replace(/\n/g, "<br>")}</p>
            </div>
          </div>
        `,
      });

      // Send confirmation to user
      await this.resend.emails.send({
        from: `Flora Marketplace <${this.fromEmail}>`,
        to: data.email,
        subject: "We Received Your Message - Flora",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #16a34a;">Thank You for Contacting Flora</h1>
            <p>Dear ${data.name},</p>
            <p>We've received your message and will get back to you within 24 hours.</p>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Your message:</strong></p>
              <p>${data.message.replace(/\n/g, "<br>")}</p>
            </div>

            <p>Thank you for reaching out to us!</p>
            <p>The Flora Team</p>
          </div>
        `,
      });

      console.log(`✅ Contact form emails sent for ${data.subject}`);
    } catch (error) {
      console.error(`❌ Failed to send contact form emails:`, error);
      throw error;
    }
  }

  // Helper method to render order items for email
  private renderOrderItems(order: OrderWithUser): string {
    if (!order.items || order.items.length === 0) {
      return '';
    }

    return order.items.map(item => {
      const itemTotal = ((item.priceCents * item.quantity) / 100).toFixed(2);
      const subscriptionText = this.formatSubscriptionType(item.subscriptionType);
      const deliveryDateText = item.requestedDeliveryDate
        ? this.formatDate(new Date(item.requestedDeliveryDate))
        : 'Standard delivery (3-5 business days)';

      return `
        <table style="background: white; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05); max-width: 500px; width: 100%; margin-left: auto; margin-right: auto; border-collapse: collapse;">
          <tr>
            <td style="padding-bottom: 1rem; border-bottom: 1px solid #e5e5e0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="color: #595E4E; font-size: 1.25rem; font-family: 'EB Garamond', Georgia, serif; font-weight: 500; text-align: left;">${item.product.name}</td>
                  <td style="color: #595E4E; font-size: 1.25rem; font-family: 'EB Garamond', Georgia, serif; font-weight: 500; text-align: right; white-space: nowrap;">$${itemTotal}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="color: #595E4E; font-size: 0.95rem; font-family: 'Outfit', Arial, sans-serif; line-height: 1.8; padding-top: 1rem; text-align: left;">
              <p style="margin: 0.25rem 0;"><strong>Quantity:</strong> ${item.quantity}</p>
              <p style="margin: 0.25rem 0;"><strong>Suburb:</strong> ${order.shippingCity || 'N/A'}</p>
              <p style="margin: 0.25rem 0;"><strong>Postcode:</strong> ${order.shippingZipCode || 'N/A'}</p>
              <p style="margin: 0.25rem 0;"><strong>Delivery Date:</strong> ${deliveryDateText}</p>
              <p style="margin: 0.25rem 0;"><strong>Subscription:</strong> ${subscriptionText}</p>
            </td>
          </tr>
        </table>
      `;
    }).join('');
  }

  // Helper method to format subscription type
  private formatSubscriptionType(subscriptionType?: string | null): string {
    if (!subscriptionType) return 'One-time purchase';

    let frequency = '';
    let type = '';

    if (subscriptionType.includes('SPONTANEOUS')) {
      type = 'Spontaneous';
    } else if (subscriptionType.includes('RECURRING')) {
      type = 'Recurring';
    }

    if (subscriptionType.includes('BIWEEKLY')) {
      frequency = 'Biweekly';
    } else if (subscriptionType.includes('WEEKLY')) {
      frequency = 'Weekly';
    } else if (subscriptionType.includes('MONTHLY')) {
      frequency = 'Monthly';
    } else if (subscriptionType.includes('QUARTERLY')) {
      frequency = 'Quarterly';
    } else if (subscriptionType.includes('YEARLY')) {
      frequency = 'Yearly';
    } else if (subscriptionType === 'SPONTANEOUS') {
      return 'Biweekly Spontaneous';
    }

    return frequency && type ? `${frequency} ${type}` : subscriptionType;
  }

  // Helper method to create personalized content based on user preferences
  private getPersonalization(user: User): string | null {
    const preferences = [];

    if (user.favoriteColors && user.favoriteColors.length > 0) {
      preferences.push(`We have beautiful ${user.favoriteColors.join(', ').toLowerCase()} flowers`);
    }

    if (user.favoriteOccasions && user.favoriteOccasions.length > 0) {
      preferences.push(`perfect for ${user.favoriteOccasions.join(', ').toLowerCase()}`);
    }

    if (user.favoriteMoods && user.favoriteMoods.length > 0) {
      preferences.push(`to create ${user.favoriteMoods.join(', ').toLowerCase()} atmospheres`);
    }

    return preferences.length > 0 ? preferences.join(' ') + '.' : null;
  }

  /**
   * Send tracking update email when delivery status changes
   * Called by update-tracking.ts script
   */
  async sendTrackingUpdate(params: {
    to: string;
    orderNumber: string;
    trackingNumber: string;
    newStatus: string;
    trackingUrl?: string;
    customerName?: string;
  }): Promise<void> {
    const { to, orderNumber, trackingNumber, newStatus, trackingUrl, customerName } = params;

    const subject = `📦 Delivery Update: ${orderNumber}`;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .container {
            background-color: #f9f9f9;
            border-radius: 10px;
            padding: 30px;
            border: 1px solid #e0e0e0;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 32px;
            color: #4a90a4;
            font-weight: bold;
          }
          .status-badge {
            background-color: #4a90a4;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            display: inline-block;
            font-weight: bold;
            margin: 20px 0;
          }
          .info-box {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .info-row {
            padding: 10px 0;
            border-bottom: 1px solid #eee;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .label {
            font-weight: bold;
            color: #666;
          }
          .btn {
            display: inline-block;
            padding: 12px 30px;
            background-color: #4a90a4;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🌸 Flora</div>
            <h2>Delivery Status Update</h2>
          </div>

          ${customerName ? `<p>Hi ${customerName},</p>` : '<p>Hello,</p>'}

          <p>Great news! Your Flora order has a status update:</p>

          <div style="text-align: center;">
            <div class="status-badge">${newStatus}</div>
          </div>

          <div class="info-box">
            <div class="info-row">
              <span class="label">Order Number:</span> ${orderNumber}
            </div>
            <div class="info-row">
              <span class="label">Tracking Number:</span> ${trackingNumber}
            </div>
            <div class="info-row">
              <span class="label">Status:</span> ${newStatus}
            </div>
          </div>

          ${trackingUrl ? `
            <div style="text-align: center;">
              <a href="${trackingUrl}" class="btn">Track Your Order</a>
            </div>
          ` : ''}

          <div class="footer">
            <p>Thank you for shopping with Flora! 🌸</p>
            <p>If you have any questions, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Flora Delivery Update

${customerName ? `Hi ${customerName},` : 'Hello,'}

Your Flora order has been updated:

Order Number: ${orderNumber}
Tracking Number: ${trackingNumber}
Status: ${newStatus}

${trackingUrl ? `Track your order: ${trackingUrl}` : ''}

Thank you for shopping with Flora!
    `;

    try {
      await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject,
        html: htmlContent,
        text: textContent,
      });

      console.log(`✅ Tracking update email sent to ${to}`);
    } catch (error) {
      console.error(`❌ Failed to send tracking update email to ${to}:`, error);
      throw error;
    }
  }

}

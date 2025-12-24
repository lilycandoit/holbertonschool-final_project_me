import { useState } from 'react';
import orderService from '../services/orderService';
import type { CreateOrderData } from '../services/orderService';
import paymentService from '../services/paymentService';
import subscriptionService from '../services/subscriptionService';
import type { CreateSubscriptionData } from '../services/subscriptionService';
import type { CheckoutFormData } from '../components/CheckoutForm';
import type { CartItem } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

// Type mapping functions
const mapSubscriptionType = (
  purchaseType: 'one-time' | 'recurring' | 'spontaneous',
  frequency: 'weekly' | 'fortnightly' | 'monthly'
): 'RECURRING_WEEKLY' | 'RECURRING_BIWEEKLY' | 'RECURRING_MONTHLY' | 'SPONTANEOUS' => {
  if (purchaseType === 'spontaneous') {
    return 'SPONTANEOUS';
  }

  const mapping = {
    'weekly': 'RECURRING_WEEKLY' as const,
    'fortnightly': 'RECURRING_BIWEEKLY' as const,
    'monthly': 'RECURRING_MONTHLY' as const,
  };
  return mapping[frequency];
};

interface UseCheckoutReturn {
  isProcessing: boolean;
  error: string | null;
  orderId: string | null;
  clientSecret: string | null;
  setupSecret: string | null; // NEW: For saving payment method
  hasSubscriptions: boolean; // NEW: Flag to indicate subscription items
  createOrderAndPaymentIntent: (
    formData: CheckoutFormData,
    cartItems: CartItem[]
  ) => Promise<void>;
  handlePaymentSuccess: (paymentMethodId?: string) => Promise<void>; // NEW: Accept payment method ID
  handlePaymentError: (error: string) => void;
}

export const useCheckout = (): UseCheckoutReturn => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null); // NEW
  const [hasSubscriptions, setHasSubscriptions] = useState(false); // NEW
  const [createdSubscriptionIds, setCreatedSubscriptionIds] = useState<string[]>([]); // NEW: Track subscriptions
  const { user, getAccessToken } = useAuth();

  const createOrderAndPaymentIntent = async (
    formData: CheckoutFormData,
    cartItems: CartItem[]
  ) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Identify subscription items (for creating subscription records for future deliveries)
      const subscriptionItems = cartItems.filter(item => item.isSubscription);

      logger.log('🛒 Processing cart:', {
        totalItems: cartItems.length,
        subscriptionCount: subscriptionItems.length
      });

      let totalOrderId = null;
      let totalClientSecret = null;

      // Create a SINGLE order with ALL items (both one-time and subscription)
      // Subscription items get their first delivery in this order
      const allItems = cartItems.map((item) => {
        // Calculate the actual price (including subscription discounts)
        let finalPrice = item.product.priceCents;
        if (item.isSubscription && item.subscriptionDiscount) {
          finalPrice = Math.round(finalPrice * (1 - item.subscriptionDiscount / 100));
        }

        // Determine subscription type for this item
        let itemSubscriptionType = undefined;
        if (item.isSubscription && item.subscriptionFrequency) {
          const purchaseType = item.purchaseType || 'recurring';
          itemSubscriptionType = mapSubscriptionType(purchaseType, item.subscriptionFrequency);
        }

        return {
          productId: item.product.id,
          quantity: item.quantity,
          priceCents: finalPrice,
          subscriptionType: itemSubscriptionType,
          requestedDeliveryDate: item.selectedDate,
        };
      });

      // Get user token if logged in
      const token = await getAccessToken();

      // Build billing address based on checkbox
      logger.log('💳 Billing Address Logic:', {
        useSameAddress: formData.useSameAddress,
        senderFirstName: formData.senderFirstName,
        senderLastName: formData.senderLastName,
        senderAddress: formData.senderAddress,
      });

      const billingAddress = formData.useSameAddress ? {
        firstName: formData.recipientFirstName,
        lastName: formData.recipientLastName,
        street1: formData.recipientAddress,
        street2: formData.recipientApartment,
        city: formData.recipientCity,
        state: formData.recipientState,
        zipCode: formData.recipientZipCode,
        country: formData.recipientCountry || 'AU',
        phone: formData.recipientPhone,
      } : {
        firstName: formData.senderFirstName,
        lastName: formData.senderLastName,
        street1: formData.senderAddress,
        street2: formData.senderApartment,
        city: formData.senderCity,
        state: formData.senderState,
        zipCode: formData.senderZipCode,
        country: 'AU',
        phone: formData.senderPhone,
      };

      logger.log('💳 Built billing address:', billingAddress);

      const orderData: CreateOrderData = {
        purchaseType: 'ONE_TIME', // First order is always one-time, subscriptions are for future
        // If user is logged in, use their ID; otherwise guest checkout
        userId: user?.sub,  // Auth0 user ID
        guestEmail: formData.guestEmail || user?.email || 'guest@example.com',
        guestPhone: formData.recipientPhone || '+1234567890',
        items: allItems,
        shippingAddress: {
          firstName: formData.recipientFirstName,
          lastName: formData.recipientLastName,
          street1: formData.recipientAddress,
          street2: formData.recipientApartment,
          city: formData.recipientCity,
          state: formData.recipientState,
          zipCode: formData.recipientZipCode,
          country: formData.recipientCountry || 'AU',
          phone: formData.recipientPhone || '+1234567890',
        },
        billingAddress: billingAddress,
        deliveryType: formData.deliveryType || 'STANDARD',
      };

      logger.log('📦 Creating order with all items');
      logger.log('🔑 User logged in:', !!user, 'User ID:', user?.sub);
      const order = await orderService.createOrder(orderData, token);
      logger.log('Order created:', order);

      totalOrderId = order.id;

      // Create payment intent for the full order
      const totalInDollars = order.totalCents / 100;
      logger.log('Creating payment intent for amount:', totalInDollars);
      const paymentIntent = await paymentService.createPaymentIntent({
        orderId: order.id,
        amount: totalInDollars,
      });
      logger.log('Payment intent created successfully');
      totalClientSecret = paymentIntent.clientSecret;

      // NEW: Set flag for subscriptions
      setHasSubscriptions(subscriptionItems.length > 0);

      // Create subscription records for future recurring deliveries
      // (The first delivery is already included in the order above)
      if (subscriptionItems.length > 0) {
        if (!token) {
          throw new Error('SUBSCRIPTION_AUTH_REQUIRED');
        }

        logger.log(`🔄 Creating ${subscriptionItems.length} subscription records`);
        const subscriptionIds: string[] = [];

        for (const item of subscriptionItems) {
          // For subscriptions, PICKUP doesn't make sense (recurring deliveries), so default to STANDARD
          const subscriptionDeliveryType = formData.deliveryType === 'PICKUP'
            ? 'STANDARD'
            : (formData.deliveryType || 'STANDARD');

          const itemPurchaseType = item.purchaseType || 'recurring';
          const subscriptionData: CreateSubscriptionData = {
            type: mapSubscriptionType(itemPurchaseType, item.subscriptionFrequency || 'monthly'),
            deliveryType: subscriptionDeliveryType as 'STANDARD' | 'EXPRESS',
            shippingAddress: {
              firstName: formData.recipientFirstName,
              lastName: formData.recipientLastName,
              street1: formData.recipientAddress,
              street2: formData.recipientApartment,
              city: formData.recipientCity,
              state: formData.recipientState,
              zipCode: formData.recipientZipCode,
              phone: formData.recipientPhone,
            },
            items: [{
              productId: item.product.id,
              quantity: item.quantity,
            }],
          };

          logger.log(`🔄 Creating subscription record for future deliveries: ${item.product.name}`);

          // Create subscription record for future recurring deliveries
          const subscriptionResponse = await subscriptionService.createSubscription(subscriptionData, token);
          logger.log(`Subscription created for ${item.product.name}:`, subscriptionResponse);

          // Extract subscription ID from response (backend returns { success, data, message })
          // The actual subscription is in the 'data' field
          const subscriptionId = (subscriptionResponse as any).data?.id || (subscriptionResponse as any).id;
          if (subscriptionId) {
            subscriptionIds.push(subscriptionId);
            logger.log(`✅ Stored subscription ID for payment method: ${subscriptionId}`);
          } else {
            logger.error('❌ Could not extract subscription ID from response:', subscriptionResponse);
          }
        }

        // NEW: Create SetupIntent for saving payment method
        logger.log('💳 Creating SetupIntent to save payment method for subscriptions');
        try {
          const setupIntentResponse = await fetch(
            `${import.meta.env.VITE_API_URL}/subscriptions/setup-intent`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (!setupIntentResponse.ok) {
            throw new Error('Failed to create SetupIntent');
          }

          const setupData = await setupIntentResponse.json();
          logger.log('✅ SetupIntent created:', setupData);
          setSetupSecret(setupData.data.clientSecret);

          // Store subscription IDs for payment method attachment after payment
          setCreatedSubscriptionIds(subscriptionIds);
        } catch (setupError) {
          logger.error('⚠️ SetupIntent creation failed (non-fatal):', setupError);
          // Non-fatal: subscriptions created but payment method not saved
          // User can add payment method later
        }
      }

      setOrderId(totalOrderId);
      setClientSecret(totalClientSecret);
    } catch (err: any) {
      logger.error('Checkout error:', err);
      logger.error('Error response:', err.response?.data);
      setError(err.response?.data?.error || err.message || 'An error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePaymentSuccess = async (paymentMethodId?: string) => {
    logger.log('💳 Payment successful!', paymentMethodId ? `Payment method: ${paymentMethodId}` : '');

    // NEW: If subscriptions exist and we have a payment method, save it
    if (createdSubscriptionIds.length > 0 && paymentMethodId) {
      try {
        const token = await getAccessToken();
        if (!token) {
          logger.warn('⚠️ No auth token - cannot save payment method to subscriptions');
          return;
        }

        logger.log(`💾 Saving payment method ${paymentMethodId} to ${createdSubscriptionIds.length} subscriptions`);

        // Update each subscription with the payment method
        for (const subscriptionId of createdSubscriptionIds) {
          try {
            const updateResponse = await fetch(
              `${import.meta.env.VITE_API_URL}/subscriptions/${subscriptionId}/payment-method`,
              {
                method: 'PATCH',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ paymentMethodId }),
              }
            );

            if (!updateResponse.ok) {
              logger.error(`❌ Failed to save payment method to subscription ${subscriptionId}`);
            } else {
              logger.log(`✅ Payment method saved to subscription ${subscriptionId}`);
            }
          } catch (updateError) {
            logger.error(`❌ Error updating subscription ${subscriptionId}:`, updateError);
          }
        }

        logger.log('✅ All subscriptions updated with payment method');
      } catch (error) {
        logger.error('❌ Error saving payment methods:', error);
        // Non-fatal: order completed, user can add payment method later
      }
    }

    // Redirect is handled by Stripe confirmPayment
  };

  const handlePaymentError = (errorMsg: string) => {
    setError(errorMsg);
    logger.error('Payment error:', errorMsg);
  };

  return {
    isProcessing,
    error,
    orderId,
    clientSecret,
    setupSecret, // NEW
    hasSubscriptions, // NEW
    createOrderAndPaymentIntent,
    handlePaymentSuccess,
    handlePaymentError,
  };
};
import React, { useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import '../styles/PaymentForm.css';

interface PaymentFormProps {
  orderId: string;
  onPaymentSuccess: (paymentMethodId?: string) => void; // NEW: Accept payment method ID
  onPaymentError: (error: string) => void;
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  orderId,
  onPaymentSuccess,
  onPaymentError,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/order-confirmation/${orderId}`,
        },
        redirect: 'if_required', // NEW: Don't redirect if not required, so we can get payment method ID
      });

      if (error) {
        setErrorMessage(error.message || 'An error occurred');
        onPaymentError(error.message || 'Payment failed');
      } else if (paymentIntent) {
        // NEW: Extract payment method ID from successful payment
        const paymentMethodId = paymentIntent.payment_method as string;
        console.log('✅ Payment successful! Payment method:', paymentMethodId);

        // Pass payment method ID to parent for subscription attachment
        await onPaymentSuccess(paymentMethodId);

        // Now redirect to confirmation page
        window.location.href = `${window.location.origin}/order-confirmation/${orderId}`;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setErrorMessage(errorMessage);
      onPaymentError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <div className="payment-element-container">
        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {errorMessage && (
        <div className="payment-error">
          <span className="error-icon">⚠️</span>
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || isProcessing}
        className="submit-payment-button"
      >
        {isProcessing ? 'Processing...' : 'Complete Order'}
      </button>
    </form>
  );
};

export default PaymentForm;
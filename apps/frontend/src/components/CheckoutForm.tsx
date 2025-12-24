import React, { useState, useEffect } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import PaymentForm from "./PaymentForm";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import deliveryService, { type DeliveryInfo } from "../services/deliveryService";
import { logger } from "../utils/logger";
import "../styles/CheckoutForm.css";

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export interface CheckoutFormData {
  deliveryType?: "STANDARD" | "EXPRESS" | "PICKUP";
  guestEmail: string;
  giftMessageTo?: string;
  giftMessageFrom?: string;
  giftMessage?: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientBusinessName?: string;
  recipientAddress: string;
  recipientApartment?: string;
  recipientCity: string;
  recipientState: string;
  recipientZipCode: string;
  recipientCountry?: string;
  recipientPhone?: string;
  senderFirstName: string;
  senderLastName: string;
  senderBusinessName?: string;
  senderAddress: string;
  senderApartment?: string;
  senderCity: string;
  senderState: string;
  senderZipCode: string;
  senderPhone?: string;
  useSameAddress: boolean;
}

interface CheckoutFormProps {
  clientSecret?: string;
  orderId?: string;
  onSubmit: (data: CheckoutFormData) => void;
  onPaymentSuccess: (paymentMethodId?: string) => void; // UPDATED: Accept payment method ID
  onPaymentError: (error: string) => void;
  deliveryInfo: DeliveryInfo | null;
  selectedDeliveryType: "STANDARD" | "EXPRESS" | "PICKUP";
  onDeliveryTypeChange: (type: "STANDARD" | "EXPRESS" | "PICKUP") => void;
  hasSubscriptions?: boolean; // NEW: Flag for subscription items
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({
  clientSecret,
  orderId,
  onSubmit,
  onPaymentSuccess,
  onPaymentError,
  deliveryInfo,
  selectedDeliveryType,
  onDeliveryTypeChange,
  hasSubscriptions = false, // NEW
}) => {
  const { login, user } = useAuth();
  const { state: cartState, setGiftMessage } = useCart();
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [savedMessage, setSavedMessage] = useState({ to: "", from: "", message: "" });
  const [formData, setFormData] = useState<CheckoutFormData>({
    guestEmail: "",
    giftMessageTo: "",
    giftMessageFrom: "",
    giftMessage: "",
    recipientFirstName: "",
    recipientLastName: "",
    recipientBusinessName: "",
    recipientAddress: "",
    recipientApartment: "",
    recipientCity: "",
    recipientState: "",
    recipientZipCode: "",
    recipientPhone: "",
    senderFirstName: "",
    senderLastName: "",
    senderBusinessName: "",
    senderAddress: "",
    senderApartment: "",
    senderCity: "",
    senderState: "",
    senderZipCode: "",
    senderPhone: "",
    useSameAddress: false,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutFormData, string>>>({});

  // Pre-fill email if user is logged in
  useEffect(() => {
    if (user?.email && !formData.guestEmail) {
      setFormData((prev) => ({
        ...prev,
        guestEmail: user.email || "",
      }));
    }
  }, [user]);

  // Load gift message from cart on mount and when cart changes
  useEffect(() => {
    if (
      cartState.giftMessage &&
      (cartState.giftMessage.to || cartState.giftMessage.from || cartState.giftMessage.message)
    ) {
      const messageData = {
        to: cartState.giftMessage.to || "",
        from: cartState.giftMessage.from || "",
        message: cartState.giftMessage.message || "",
      };
      setSavedMessage(messageData);
      setFormData((prev) => ({
        ...prev,
        giftMessageTo: messageData.to,
        giftMessageFrom: messageData.from,
        giftMessage: messageData.message,
      }));
      // Start with the message shown (not in edit mode)
      setIsEditingMessage(false);
    }
  }, [cartState.giftMessage]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof CheckoutFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleUseSameAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;

    if (checked) {
      // Auto-fill sender fields with recipient data
      setFormData((prev) => ({
        ...prev,
        senderFirstName: prev.recipientFirstName,
        senderLastName: prev.recipientLastName,
        senderBusinessName: prev.recipientBusinessName || "",
        senderAddress: prev.recipientAddress,
        senderApartment: prev.recipientApartment || "",
        senderCity: prev.recipientCity,
        senderState: prev.recipientState,
        senderZipCode: prev.recipientZipCode,
        senderPhone: prev.recipientPhone || "",
        useSameAddress: true,
      }));
    } else {
      // Just update the flag, don't clear fields (user might have already typed)
      setFormData((prev) => ({
        ...prev,
        useSameAddress: false,
      }));
    }
  };

  const validateForm = async (): Promise<boolean> => {
    const newErrors: Partial<Record<keyof CheckoutFormData, string>> = {};

    if (!formData.guestEmail.trim()) {
      newErrors.guestEmail = "Enter an email address";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.guestEmail)) {
      newErrors.guestEmail = "Enter a valid email address";
    }
    if (!formData.recipientFirstName.trim()) {
      newErrors.recipientFirstName = "Enter a first name";
    }
    if (!formData.recipientLastName.trim()) {
      newErrors.recipientLastName = "Enter a last name";
    }
    if (!formData.recipientAddress.trim()) {
      newErrors.recipientAddress = "Enter an address";
    }
    if (!formData.recipientCity.trim()) {
      newErrors.recipientCity = "Enter a city";
    }
    if (!formData.recipientState.trim()) {
      newErrors.recipientState = "Select a state/territory";
    }
    if (!formData.recipientZipCode.trim()) {
      newErrors.recipientZipCode = "Enter a ZIP / postal code";
    } else {
      // Validate postcode is in Melbourne delivery zone
      try {
        const validation = await deliveryService.validatePostcode(formData.recipientZipCode);
        if (!validation.available) {
          newErrors.recipientZipCode = "We only deliver to Melbourne metro area. Please check your postcode.";
        } else {
          // Cross-validate: Melbourne postcodes must have VIC state
          if (formData.recipientState && formData.recipientState !== "VIC") {
            newErrors.recipientState = "Melbourne postcodes are in Victoria (VIC). Please select the correct state.";
          }
        }
      } catch (error) {
        // Graceful degradation: if validation service fails, allow checkout to continue
        logger.warn("Postcode validation service unavailable, allowing checkout:", error);
        // No error added - we don't block checkout for technical failures
      }
    }

    // Sender (billing) validation - validate before proceeding to payment
    if (!formData.useSameAddress) {
      if (!formData.senderFirstName.trim()) {
        newErrors.senderFirstName = "Enter your first name for billing";
      }
      if (!formData.senderLastName.trim()) {
        newErrors.senderLastName = "Enter your last name for billing";
      }
      if (!formData.senderAddress.trim()) {
        newErrors.senderAddress = "Enter your billing address";
      }
      if (!formData.senderCity.trim()) {
        newErrors.senderCity = "Enter your billing suburb";
      }
      if (!formData.senderState.trim()) {
        newErrors.senderState = "Select your billing state";
      }
      if (!formData.senderZipCode.trim()) {
        newErrors.senderZipCode = "Enter your billing postcode";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const isValid = await validateForm();
    if (isValid) {
      onSubmit(formData);
    }
  };

  const handleSaveMessage = () => {
    const messageData = {
      to: formData.giftMessageTo || "",
      from: formData.giftMessageFrom || "",
      message: formData.giftMessage || "",
    };
    setSavedMessage(messageData);
    setGiftMessage(messageData); // Sync to cart context
    setIsEditingMessage(false);
  };

  const handleUpdateMessage = () => {
    setIsEditingMessage(true);
  };

  const appearance: Appearance = {
    theme: "stripe",
    variables: {
      colorPrimary: "#7a2e4a",
      colorBackground: "#ffffff",
      colorText: "#30313d",
      colorDanger: "#df1b41",
      fontFamily: "system-ui, sans-serif",
      spacingUnit: "4px",
      borderRadius: "8px",
    },
  };

  const elementsOptions = clientSecret
    ? {
        clientSecret,
        appearance,
      }
    : undefined;

  return (
    <div className="checkout-form-container">
      {/* Email Section */}
      <section className="checkout-section email-section">
        <div className="section-header-with-link">
          <h2 className="section-title">Email</h2>
          <button type="button" onClick={login} className="sign-in-link">
            Sign In
          </button>
        </div>

        <div className="email-banner">Enter your email below.</div>

        <div className="form-section">
          <div className="form-field">
            <input
              type="email"
              name="guestEmail"
              className={`form-input ${errors.guestEmail ? "error" : ""}`}
              placeholder="Email:"
              value={formData.guestEmail}
              onChange={handleInputChange}
            />
            {errors.guestEmail && <span className="field-error">{errors.guestEmail}</span>}
          </div>
        </div>
      </section>

      {/* Gift Message Section */}
      <section className="checkout-section gift-message-section">
        <div className="message-header">
          <h2 className="section-title">Leave a Message</h2>
          <button type="button" className="update-cart-link" onClick={() => (window.location.href = "/cart")}>
            Or Update In The Cart
          </button>
        </div>

        <div className="message-banner">Leave a message below.</div>

        {!isEditingMessage && (savedMessage.to || savedMessage.from || savedMessage.message) ? (
          <div className="saved-message-display">
            {savedMessage.to && (
              <p>
                <strong>To:</strong> {savedMessage.to}
              </p>
            )}
            {savedMessage.from && (
              <p>
                <strong>From:</strong> {savedMessage.from}
              </p>
            )}
            {savedMessage.message && (
              <p>
                <strong>Message:</strong> {savedMessage.message}
              </p>
            )}
            <button type="button" className="edit-message-button" onClick={handleUpdateMessage}>
              Edit Message
            </button>
          </div>
        ) : (
          <div className="message-form-container">
            <div className="form-field">
              <input
                type="text"
                name="giftMessageTo"
                className="form-input message-input"
                placeholder="To:"
                value={formData.giftMessageTo}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-field">
              <input
                type="text"
                name="giftMessageFrom"
                className="form-input message-input"
                placeholder="From:"
                value={formData.giftMessageFrom}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-field">
              <textarea
                name="giftMessage"
                className="form-input message-input message-textarea"
                placeholder="Message:"
                rows={5}
                value={formData.giftMessage}
                onChange={handleInputChange}
              />
            </div>

            <button type="button" className="save-message-button" onClick={handleSaveMessage}>
              Save
            </button>
          </div>
        )}
      </section>

      {/* Delivery Options */}
      <section className="checkout-section delivery-section">
        <h2 className="section-title">Shipping</h2>

        <div className="delivery-banner">Select your delivery option below.</div>

        <div className="delivery-options">
          <div className="delivery-type-selector">
            {deliveryInfo && (
              <>
                <label className={`delivery-option ${selectedDeliveryType === "STANDARD" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="deliveryType"
                    value="STANDARD"
                    checked={selectedDeliveryType === "STANDARD"}
                    onChange={(e) => onDeliveryTypeChange(e.target.value as "STANDARD" | "EXPRESS" | "PICKUP")}
                  />
                  <div className="delivery-details">
                    <div className="delivery-name">Standard Delivery</div>
                    <div className="delivery-time">{deliveryInfo.pricing.standard.estimate}</div>
                    <div className="delivery-price">{deliveryInfo.pricing.standard.display}</div>
                  </div>
                </label>
                <label className={`delivery-option ${selectedDeliveryType === "EXPRESS" ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="deliveryType"
                    value="EXPRESS"
                    checked={selectedDeliveryType === "EXPRESS"}
                    onChange={(e) => onDeliveryTypeChange(e.target.value as "STANDARD" | "EXPRESS" | "PICKUP")}
                  />
                  <div className="delivery-details">
                    <div className="delivery-name">Express Delivery</div>
                    <div className="delivery-time">{deliveryInfo.pricing.express.estimate}</div>
                    <div className="delivery-price">{deliveryInfo.pricing.express.display}</div>
                  </div>
                </label>
              </>
            )}
            <label className={`delivery-option ${selectedDeliveryType === "PICKUP" ? "active" : ""}`}>
              <input
                type="radio"
                name="deliveryType"
                value="PICKUP"
                checked={selectedDeliveryType === "PICKUP"}
                onChange={(e) => onDeliveryTypeChange(e.target.value as "STANDARD" | "EXPRESS" | "PICKUP")}
              />
              <div className="delivery-details">
                <div className="delivery-name">Pick Up</div>
                <div className="delivery-time">Available anytime</div>
                <div className="delivery-price">Free</div>
              </div>
            </label>
          </div>
        </div>
      </section>

      {/* Recipient's Address Section */}
      <section className="checkout-section recipient-section">
        <h2 className="section-title">Delivery</h2>

        <div className="recipient-banner">Please enter the recipient's details below.</div>

        <div className="form-section recipient-form">
          <div className="form-field">
            <label className="form-label-top">Country</label>
            <input type="text" name="country" className="form-input" value="Australia" readOnly disabled />
          </div>

          <div className="form-row">
            <div className="form-field">
              <input
                type="text"
                name="recipientFirstName"
                className={`form-input ${errors.recipientFirstName ? "error" : ""}`}
                placeholder="First Name"
                value={formData.recipientFirstName}
                onChange={handleInputChange}
              />
              {errors.recipientFirstName && <span className="field-error">{errors.recipientFirstName}</span>}
            </div>
            <div className="form-field">
              <input
                type="text"
                name="recipientLastName"
                className={`form-input ${errors.recipientLastName ? "error" : ""}`}
                placeholder="Last Name"
                value={formData.recipientLastName}
                onChange={handleInputChange}
              />
              {errors.recipientLastName && <span className="field-error">{errors.recipientLastName}</span>}
            </div>
          </div>

          <div className="form-field">
            <input
              type="text"
              name="recipientBusinessName"
              className="form-input"
              placeholder="Business Name (optional)"
              value={formData.recipientBusinessName}
              onChange={handleInputChange}
            />
          </div>

          <div className="form-field">
            <input
              type="text"
              name="recipientAddress"
              className={`form-input ${errors.recipientAddress ? "error" : ""}`}
              placeholder="Address"
              value={formData.recipientAddress}
              onChange={handleInputChange}
            />
            {errors.recipientAddress && <span className="field-error">{errors.recipientAddress}</span>}
          </div>

          <div className="form-field">
            <input
              type="text"
              name="recipientApartment"
              className="form-input"
              placeholder="Apartment, unit, etc. (optional)"
              value={formData.recipientApartment}
              onChange={handleInputChange}
            />
          </div>

          <div className="form-row form-row-three">
            <div className="form-field">
              <input
                type="text"
                name="recipientCity"
                className={`form-input ${errors.recipientCity ? "error" : ""}`}
                placeholder="Suburb"
                value={formData.recipientCity}
                onChange={handleInputChange}
              />
              {errors.recipientCity && <span className="field-error">{errors.recipientCity}</span>}
            </div>
            <div className="form-field">
              <select
                name="recipientState"
                className={`form-input ${errors.recipientState ? "error" : ""}`}
                value={formData.recipientState}
                onChange={handleInputChange}
              >
                <option value="">State/territory</option>
                <option value="VIC">Victoria (Melbourne Metro - Currently Available)</option>
                {/* Other states will be added as we expand delivery zones */}
              </select>
              {errors.recipientState && <span className="field-error">{errors.recipientState}</span>}
            </div>
            <div className="form-field">
              <input
                type="text"
                name="recipientZipCode"
                className={`form-input ${errors.recipientZipCode ? "error" : ""}`}
                placeholder="Postcode"
                value={formData.recipientZipCode}
                onChange={handleInputChange}
              />
              {errors.recipientZipCode && <span className="field-error">{errors.recipientZipCode}</span>}
            </div>
          </div>

          <div className="form-field">
            <input
              type="tel"
              name="recipientPhone"
              className="form-input"
              placeholder="Phone"
              value={formData.recipientPhone}
              onChange={handleInputChange}
            />
          </div>
        </div>
      </section>

      {/* Sender's Details (Billing Address) Section */}
      <section className="checkout-section recipient-section">
        <h2 className="section-title">Billing Information</h2>

        <div className="recipient-banner">Enter your information below.</div>

        <div className="form-section">
          <div className="form-field checkbox-field">
            <input
              type="checkbox"
              id="useSameAddress"
              checked={formData.useSameAddress}
              onChange={handleUseSameAddressChange}
            />
            <label htmlFor="useSameAddress">Use recipient's address as billing address.</label>
          </div>

          {!formData.useSameAddress && (
            <div className="recipient-form">
              <div className="form-field">
                <label className="form-label-top">Country</label>
                <input type="text" name="senderCountry" className="form-input" value="Australia" readOnly disabled />
              </div>

              <div className="form-row">
                <div className="form-field">
                  <input
                    type="text"
                    name="senderFirstName"
                    className={`form-input ${errors.senderFirstName ? "error" : ""}`}
                    placeholder="First Name"
                    value={formData.senderFirstName}
                    onChange={handleInputChange}
                  />
                  {errors.senderFirstName && <span className="field-error">{errors.senderFirstName}</span>}
                </div>
                <div className="form-field">
                  <input
                    type="text"
                    name="senderLastName"
                    className={`form-input ${errors.senderLastName ? "error" : ""}`}
                    placeholder="Last Name"
                    value={formData.senderLastName}
                    onChange={handleInputChange}
                  />
                  {errors.senderLastName && <span className="field-error">{errors.senderLastName}</span>}
                </div>
              </div>

              <div className="form-field">
                <input
                  type="text"
                  name="senderBusinessName"
                  className="form-input"
                  placeholder="Business Name (optional)"
                  value={formData.senderBusinessName}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-field">
                <input
                  type="text"
                  name="senderAddress"
                  className={`form-input ${errors.senderAddress ? "error" : ""}`}
                  placeholder="Address"
                  value={formData.senderAddress}
                  onChange={handleInputChange}
                />
                {errors.senderAddress && <span className="field-error">{errors.senderAddress}</span>}
              </div>

              <div className="form-field">
                <input
                  type="text"
                  name="senderApartment"
                  className="form-input"
                  placeholder="Apartment, unit, etc. (optional)"
                  value={formData.senderApartment}
                  onChange={handleInputChange}
                />
              </div>

              <div className="form-row form-row-three">
                <div className="form-field">
                  <input
                    type="text"
                    name="senderCity"
                    className={`form-input ${errors.senderCity ? "error" : ""}`}
                    placeholder="Suburb"
                    value={formData.senderCity}
                    onChange={handleInputChange}
                  />
                  {errors.senderCity && <span className="field-error">{errors.senderCity}</span>}
                </div>
                <div className="form-field">
                  <select
                    name="senderState"
                    className={`form-input ${errors.senderState ? "error" : ""}`}
                    value={formData.senderState}
                    onChange={handleInputChange}
                  >
                    <option value="">State/territory</option>
                    <option value="VIC">Victoria (VIC)</option>
                    <option value="NSW">New South Wales (NSW)</option>
                    <option value="QLD">Queensland (QLD)</option>
                    <option value="SA">South Australia (SA)</option>
                    <option value="WA">Western Australia (WA)</option>
                    <option value="TAS">Tasmania (TAS)</option>
                    <option value="NT">Northern Territory (NT)</option>
                    <option value="ACT">Australian Capital Territory (ACT)</option>
                  </select>
                  {errors.senderState && <span className="field-error">{errors.senderState}</span>}
                </div>
                <div className="form-field">
                  <input
                    type="text"
                    name="senderZipCode"
                    className={`form-input ${errors.senderZipCode ? "error" : ""}`}
                    placeholder="Postcode"
                    value={formData.senderZipCode}
                    onChange={handleInputChange}
                  />
                  {errors.senderZipCode && <span className="field-error">{errors.senderZipCode}</span>}
                </div>
              </div>

              <div className="form-field">
                <input
                  type="tel"
                  name="senderPhone"
                  className="form-input"
                  placeholder="Phone"
                  value={formData.senderPhone}
                  onChange={handleInputChange}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Payment Section */}
      {clientSecret && orderId && (
        <section className="checkout-section payment-section">
          <h2 className="section-title">Payment</h2>

          <div className="payment-banner">All transactions are secure and encrypted.</div>

          {/* NEW: Subscription indicator */}
          {hasSubscriptions && (
            <div className="subscription-info-banner">
              <span className="info-icon">🔄</span>
              <div>
                <strong>Subscription items in cart</strong>
                <p>Your payment method will be saved for automatic renewals.</p>
              </div>
            </div>
          )}

          <Elements stripe={stripePromise} options={elementsOptions}>
            <PaymentForm orderId={orderId} onPaymentSuccess={onPaymentSuccess} onPaymentError={onPaymentError} />
          </Elements>
        </section>
      )}

      {/* Continue button if no client secret yet */}
      {!clientSecret && (
        <button type="button" onClick={handleProceedToPayment} className="continue-button">
          Continue to Payment
        </button>
      )}
    </div>
  );
};

export default CheckoutForm;

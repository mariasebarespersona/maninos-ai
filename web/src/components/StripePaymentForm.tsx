'use client';

import { useState, useEffect, useRef } from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2, Lock, Shield, AlertCircle, CreditCard, CheckCircle } from 'lucide-react';

// Initialize Stripe once
const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise: Promise<Stripe | null> = stripeKey ? loadStripe(stripeKey) : Promise.resolve(null);

// ─── Inner form that uses Stripe hooks ────────────────────────────────────────

function CheckoutForm({
  amount,
  onSuccess,
  onError,
}: {
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setError('Esperando formulario de pago...');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const { error: submitError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.href, // fallback, redirect='if_required' avoids it
        },
        redirect: 'if_required',
      });

      if (submitError) {
        const msg = submitError.message || 'Error al procesar el pago';
        setError(msg);
        onError(msg);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess(paymentIntent.id);
      } else {
        setError(`Estado del pago: ${paymentIntent?.status || 'desconocido'}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      setError(msg);
      onError(msg);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        id="payment-element"
        options={{ layout: 'tabs' }}
      />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold py-3.5 rounded-lg 
                   hover:from-indigo-500 hover:to-indigo-600 transition-all
                   disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Procesando pago...
          </>
        ) : (
          <>
            <Lock className="w-5 h-5" />
            Pagar ${amount.toLocaleString()}
          </>
        )}
      </button>

      <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-1">
        <Shield className="w-3.5 h-3.5" />
        Pago seguro procesado por Stripe
      </p>
    </form>
  );
}

// ─── Public wrapper component ─────────────────────────────────────────────────

interface StripePaymentFormProps {
  /** Property ID for the purchase */
  propertyId: string;
  /** Payment amount in USD */
  amount: number;
  /** Description for the PaymentIntent */
  description?: string;
  /** Called with the PaymentIntent ID when the payment succeeds */
  onSuccess: (paymentIntentId: string) => void;
  /** Called with an error message on failure */
  onError: (message: string) => void;
  /** Called when the user cancels */
  onCancel?: () => void;
}

export default function StripePaymentForm({
  propertyId,
  amount,
  description,
  onSuccess,
  onError,
  onCancel,
}: StripePaymentFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState('');
  const [paid, setPaid] = useState(false);
  const [paidIntentId, setPaidIntentId] = useState('');
  const intentCreated = useRef(false);

  // Create PaymentIntent on mount — runs only ONCE
  useEffect(() => {
    if (intentCreated.current) return;
    intentCreated.current = true;

    const createIntent = async () => {
      try {
        const res = await fetch('/api/purchase-payments/stripe?action=create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            property_id: propertyId,
            amount,
            description: description || `Compra propiedad: ${propertyId}`,
          }),
        });
        const data = await res.json();
        if (data.ok && data.client_secret) {
          setClientSecret(data.client_secret);
        } else {
          setInitError(data.detail || 'Error al iniciar pago con Stripe');
        }
      } catch {
        setInitError('Error de conexión con Stripe');
      } finally {
        setLoading(false);
      }
    };
    createIntent();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSuccess = (paymentIntentId: string) => {
    setPaid(true);
    setPaidIntentId(paymentIntentId);
    onSuccess(paymentIntentId);
  };

  // ── No Stripe key configured ──
  if (!stripeKey) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Stripe no configurado</p>
            <p className="text-sm text-red-600 mt-1">
              Falta la variable NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
              Usa otro método de pago o configura Stripe.
            </p>
          </div>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="mt-3 text-sm text-red-600 underline">
            Usar otro método
          </button>
        )}
      </div>
    );
  }

  // ── Payment succeeded ──
  if (paid) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-5 text-center">
        <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-3" />
        <p className="font-bold text-green-800 text-lg">¡Pago exitoso!</p>
        <p className="text-sm text-green-700 mt-1">
          ${amount.toLocaleString()} cobrado correctamente
        </p>
        <p className="text-xs text-green-600 font-mono mt-2">Ref: {paidIntentId}</p>
      </div>
    );
  }

  // ── Loading intent ──
  if (loading) {
    return (
      <div className="flex flex-col items-center py-8">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm text-gray-500">Preparando formulario de pago...</p>
      </div>
    );
  }

  // ── Error creating intent ──
  if (initError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Error al iniciar pago</p>
            <p className="text-sm text-red-600 mt-1">{initError}</p>
          </div>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="mt-3 text-sm text-red-600 underline">
            Usar otro método
          </button>
        )}
      </div>
    );
  }

  // ── Stripe Elements form ──
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="w-5 h-5 text-indigo-600" />
        <p className="font-semibold text-indigo-800">
          Pago con tarjeta — ${amount.toLocaleString()}
        </p>
      </div>

      {clientSecret && (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: 'stripe',
              variables: {
                colorPrimary: '#4f46e5',
                colorBackground: '#ffffff',
                colorText: '#1e3a5f',
                fontFamily: 'system-ui, sans-serif',
                borderRadius: '8px',
              },
            },
          }}
        >
          <CheckoutForm
            amount={amount}
            onSuccess={handleSuccess}
            onError={onError}
          />
        </Elements>
      )}
    </div>
  );
}


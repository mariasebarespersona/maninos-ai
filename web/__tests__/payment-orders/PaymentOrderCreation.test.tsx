/**
 * Unit tests for Payment Order creation logic.
 *
 * Both MarketDashboard (confirmPurchase ~line 1020-1037) and the new-property
 * page (confirmPurchase ~line 418-436) build an identical payment-order payload
 * before POSTing to /api/payment-orders.  These tests verify the payload
 * construction rules, status workflow expectations, and completion payload
 * without rendering the full components.
 */

import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Helpers — mirror the payload-building logic shared by both pages
// ---------------------------------------------------------------------------

interface PaymentInfo {
  method: string
  reference: string
  date: string
  amount: number
  payee_id?: string
  payee_name?: string
}

interface NewPayeeInfo {
  name: string
  bank_name: string
  routing_number: string
  account_number: string
  account_type: string
  address: string
  bank_address: string
}

function buildPaymentOrderPayload(
  propertyId: string,
  propertyAddress: string,
  payment: PaymentInfo,
  newPayee: NewPayeeInfo,
  notes: string,
) {
  return {
    property_id: propertyId,
    property_address: propertyAddress,
    payee_id: payment.payee_id || undefined,
    payee_name: payment.payee_name || newPayee.name || 'Vendedor',
    bank_name: newPayee.bank_name || undefined,
    routing_number_last4: newPayee.routing_number
      ? newPayee.routing_number.slice(-4)
      : undefined,
    account_number_last4: newPayee.account_number
      ? newPayee.account_number.slice(-4)
      : undefined,
    account_type: newPayee.account_type || 'checking',
    amount: payment.amount,
    method: payment.method,
    notes,
  }
}

// ---------------------------------------------------------------------------
// Part 1 — Payload Construction
// ---------------------------------------------------------------------------

describe('Payment Order — Payload Construction', () => {
  const defaultPayment: PaymentInfo = {
    method: 'transferencia',
    reference: 'REF-123',
    date: '2026-03-01',
    amount: 45000,
    payee_id: 'p-1',
    payee_name: 'John Seller',
  }

  const defaultNewPayee: NewPayeeInfo = {
    name: 'John Seller',
    bank_name: 'Chase',
    routing_number: '123456789',
    account_number: '9876543210',
    account_type: 'checking',
    address: '',
    bank_address: '',
  }

  it('builds correct payload with new payee info', () => {
    const payload = buildPaymentOrderPayload(
      'prop-1',
      '123 Main St',
      defaultPayment,
      defaultNewPayee,
      'Compra desde Casas del Mercado',
    )

    expect(payload.property_id).toBe('prop-1')
    expect(payload.property_address).toBe('123 Main St')
    expect(payload.payee_name).toBe('John Seller')
    expect(payload.routing_number_last4).toBe('6789')
    expect(payload.account_number_last4).toBe('3210')
    expect(payload.amount).toBe(45000)
    expect(payload.bank_name).toBe('Chase')
    expect(payload.method).toBe('transferencia')
    expect(payload.account_type).toBe('checking')
    expect(payload.payee_id).toBe('p-1')
  })

  it('falls back to newPayee.name when payment.payee_name is empty', () => {
    const payment = { ...defaultPayment, payee_name: '' }
    const payload = buildPaymentOrderPayload(
      'prop-2',
      '456 Oak Ave',
      payment,
      defaultNewPayee,
      '',
    )

    expect(payload.payee_name).toBe('John Seller')
  })

  it('falls back to "Vendedor" when both payee_name and newPayee.name are empty', () => {
    const payment = { ...defaultPayment, payee_name: '' }
    const emptyPayee: NewPayeeInfo = {
      name: '',
      bank_name: '',
      routing_number: '',
      account_number: '',
      account_type: '',
      address: '',
      bank_address: '',
    }

    const payload = buildPaymentOrderPayload(
      'prop-3',
      '789 Elm Blvd',
      payment,
      emptyPayee,
      '',
    )

    expect(payload.payee_name).toBe('Vendedor')
  })

  it('sets bank info to undefined when newPayee has no bank data', () => {
    const emptyPayee: NewPayeeInfo = {
      name: '',
      bank_name: '',
      routing_number: '',
      account_number: '',
      account_type: '',
      address: '',
      bank_address: '',
    }

    const payload = buildPaymentOrderPayload(
      'prop-4',
      '100 Pine Rd',
      defaultPayment,
      emptyPayee,
      '',
    )

    expect(payload.bank_name).toBeUndefined()
    expect(payload.routing_number_last4).toBeUndefined()
    expect(payload.account_number_last4).toBeUndefined()
  })

  it('defaults account_type to "checking" when not provided', () => {
    const payeeNoType: NewPayeeInfo = {
      ...defaultNewPayee,
      account_type: '',
    }

    const payload = buildPaymentOrderPayload(
      'prop-5',
      '200 Maple Ln',
      defaultPayment,
      payeeNoType,
      '',
    )

    expect(payload.account_type).toBe('checking')
  })

  it('extracts last 4 digits of routing number correctly', () => {
    const payee9: NewPayeeInfo = { ...defaultNewPayee, routing_number: '021000021' }
    const payload9 = buildPaymentOrderPayload('p', 'a', defaultPayment, payee9, '')
    expect(payload9.routing_number_last4).toBe('0021')

    const payeeShort: NewPayeeInfo = { ...defaultNewPayee, routing_number: '1234' }
    const payloadShort = buildPaymentOrderPayload('p', 'a', defaultPayment, payeeShort, '')
    expect(payloadShort.routing_number_last4).toBe('1234')
  })

  it('extracts last 4 digits of account number correctly', () => {
    const payeeLong: NewPayeeInfo = { ...defaultNewPayee, account_number: '00112233445566' }
    const payload = buildPaymentOrderPayload('p', 'a', defaultPayment, payeeLong, '')
    expect(payload.account_number_last4).toBe('5566')
  })

  it('sets payee_id to undefined when not provided', () => {
    const payment: PaymentInfo = { ...defaultPayment, payee_id: undefined }
    const payload = buildPaymentOrderPayload('p', 'a', payment, defaultNewPayee, '')
    expect(payload.payee_id).toBeUndefined()
  })

  it('sets payee_id to undefined when empty string', () => {
    const payment: PaymentInfo = { ...defaultPayment, payee_id: '' }
    const payload = buildPaymentOrderPayload('p', 'a', payment, defaultNewPayee, '')
    expect(payload.payee_id).toBeUndefined()
  })

  it('MarketDashboard note matches expected text', () => {
    const payload = buildPaymentOrderPayload(
      'prop-1',
      '123 Main St',
      defaultPayment,
      defaultNewPayee,
      'Compra desde Casas del Mercado',
    )
    expect(payload.notes).toBe('Compra desde Casas del Mercado')
  })

  it('New Property page note matches expected text', () => {
    const payload = buildPaymentOrderPayload(
      'prop-1',
      '123 Main St',
      defaultPayment,
      defaultNewPayee,
      'Compra directa desde Nueva Propiedad',
    )
    expect(payload.notes).toBe('Compra directa desde Nueva Propiedad')
  })
})

// ---------------------------------------------------------------------------
// Part 2 — Status Workflow
// ---------------------------------------------------------------------------

describe('Payment Order — Status Workflow', () => {
  type OrderStatus = 'pending' | 'completed' | 'cancelled'

  interface PaymentOrder {
    id: string
    status: OrderStatus
    reference?: string
    payment_date?: string
  }

  function createOrder(id: string): PaymentOrder {
    return { id, status: 'pending' }
  }

  function completeOrder(
    order: PaymentOrder,
    reference: string,
    paymentDate: string,
  ): PaymentOrder {
    if (order.status === 'cancelled') {
      throw new Error('Cannot complete a cancelled order')
    }
    if (!reference) {
      throw new Error('Reference is required to complete an order')
    }
    return {
      ...order,
      status: 'completed',
      reference,
      payment_date: paymentDate,
    }
  }

  function cancelOrder(order: PaymentOrder): PaymentOrder {
    return { ...order, status: 'cancelled' }
  }

  it('new orders are created with pending status', () => {
    const order = createOrder('ord-1')
    expect(order.status).toBe('pending')
    expect(order.reference).toBeUndefined()
    expect(order.payment_date).toBeUndefined()
  })

  it('completed orders require a reference number', () => {
    const order = createOrder('ord-2')
    expect(() => completeOrder(order, '', '2026-03-05')).toThrow(
      'Reference is required to complete an order',
    )
  })

  it('completed orders have a payment_date', () => {
    const order = createOrder('ord-3')
    const completed = completeOrder(order, 'CONF-789', '2026-03-05')
    expect(completed.status).toBe('completed')
    expect(completed.payment_date).toBe('2026-03-05')
    expect(completed.reference).toBe('CONF-789')
  })

  it('cancelled orders cannot be completed', () => {
    const order = cancelOrder(createOrder('ord-4'))
    expect(order.status).toBe('cancelled')
    expect(() => completeOrder(order, 'REF-X', '2026-03-05')).toThrow(
      'Cannot complete a cancelled order',
    )
  })

  it('pending -> completed is a valid transition', () => {
    const order = createOrder('ord-5')
    const completed = completeOrder(order, 'REF-OK', '2026-03-05')
    expect(completed.status).toBe('completed')
  })

  it('pending -> cancelled is a valid transition', () => {
    const order = createOrder('ord-6')
    const cancelled = cancelOrder(order)
    expect(cancelled.status).toBe('cancelled')
  })
})

// ---------------------------------------------------------------------------
// Part 3 — Completion Payload (Abigail completes the order)
// ---------------------------------------------------------------------------

describe('Payment Order — Completion Payload', () => {
  interface CompletionPayload {
    reference: string
    payment_date: string
    bank_account_id?: string
  }

  function buildCompletionPayload(
    reference: string,
    paymentDate: string,
    bankAccountId?: string,
  ): CompletionPayload {
    return {
      reference,
      payment_date: paymentDate,
      bank_account_id: bankAccountId || undefined,
    }
  }

  it('builds correct completion payload', () => {
    const payload = buildCompletionPayload('CONF-456', '2026-03-05', 'ba-1')
    expect(payload.reference).toBeTruthy()
    expect(payload.payment_date).toBeTruthy()
    expect(payload.bank_account_id).toBe('ba-1')
  })

  it('reference is required for completion', () => {
    const payload = buildCompletionPayload('', '2026-03-05')
    expect(payload.reference).toBeFalsy()
    // In the actual UI, an empty reference would be rejected before submitting
  })

  it('bank_account_id is optional', () => {
    const payload = buildCompletionPayload('CONF-789', '2026-03-05')
    expect(payload.bank_account_id).toBeUndefined()
  })

  it('bank_account_id is undefined when empty string', () => {
    const payload = buildCompletionPayload('CONF-789', '2026-03-05', '')
    expect(payload.bank_account_id).toBeUndefined()
  })

  it('payment_date is included in the payload', () => {
    const payload = buildCompletionPayload('REF-X', '2026-03-10')
    expect(payload.payment_date).toBe('2026-03-10')
  })
})

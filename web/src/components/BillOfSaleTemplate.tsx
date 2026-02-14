'use client'

import { useState, useRef, useEffect } from 'react'
import { Printer, Save, X, Download, Edit3, Eye, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BillOfSaleData {
  // Seller info
  seller_name: string
  seller2_name: string
  seller_address: string
  seller_phone: string
  seller_email: string
  // Buyer info
  buyer_name: string
  buyer2_name: string
  buyer_address: string
  buyer_date: string
  buyer_phone: string
  buyer_email: string
  // Property details
  manufacturer: string
  make: string
  date_manufactured: string
  bedrooms: string
  baths: string
  dimensions: string
  serial_number: string
  is_new: boolean
  is_used: boolean
  location_of_home: string
  hud_label_number: string
  // Terms
  optional_equipment: string
  purchaser_responsibilities: string
  seller_responsibilities: string
  // Financial
  deposit: string
  subtotal: string
  state_tax: string
  city_tax: string
  county_tax: string
  mhi_tax: string
  mobil_owners_insurance: string
  credit_life_insurance: string
  home_buyers_protection: string
  filing_fee: string
  sol_transfer_form_t: string
  delivery: string
  ac_hook_up: string
  trimout: string
  skirting: string
  total: string
  // Moving & salesperson
  moving_to: string
  salesperson: string
  total_payment: string
  duration: string
  cost_of_moving: string
}

interface Props {
  /** Pre-filled data from property/listing */
  initialData?: Partial<BillOfSaleData>
  /** 'purchase' = Homes buying from vendor; 'sale' = Homes selling to client */
  transactionType?: 'purchase' | 'sale'
  /** Called with generated PDF File + data when user saves */
  onSave?: (file: File, data: BillOfSaleData) => void
  /** Called when user closes the template */
  onClose?: () => void
  /** Read-only mode (no editing) */
  readOnly?: boolean
}

const EMPTY_DATA: BillOfSaleData = {
  seller_name: 'MANINOS HOMES',
  seller2_name: '',
  seller_address: '',
  seller_phone: '',
  seller_email: '',
  buyer_name: '',
  buyer2_name: '',
  buyer_address: '',
  buyer_date: new Date().toISOString().split('T')[0],
  buyer_phone: '',
  buyer_email: '',
  manufacturer: '',
  make: '',
  date_manufactured: '',
  bedrooms: '',
  baths: '',
  dimensions: '',
  serial_number: '',
  is_new: false,
  is_used: true,
  location_of_home: '',
  hud_label_number: '',
  optional_equipment: '',
  purchaser_responsibilities: '',
  seller_responsibilities: '',
  deposit: '',
  subtotal: '',
  state_tax: 'N/A',
  city_tax: 'N/A',
  county_tax: 'N/A',
  mhi_tax: 'N/A',
  mobil_owners_insurance: 'N/A',
  credit_life_insurance: 'N/A',
  home_buyers_protection: 'N/A',
  filing_fee: 'N/A',
  sol_transfer_form_t: 'N/A',
  delivery: 'N/A',
  ac_hook_up: 'N/A',
  trimout: 'N/A',
  skirting: 'N/A',
  total: '',
  moving_to: '',
  salesperson: '',
  total_payment: '',
  duration: '',
  cost_of_moving: '',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BillOfSaleTemplate({
  initialData,
  transactionType = 'sale',
  onSave,
  onClose,
  readOnly = false,
}: Props) {
  const [data, setData] = useState<BillOfSaleData>(() => {
    const base = { ...EMPTY_DATA }
    // For purchases (Homes buying), seller is the vendor
    if (transactionType === 'purchase') {
      base.seller_name = ''
      base.buyer_name = 'MANINOS HOMES'
    }
    return { ...base, ...initialData }
  })
  const [editing, setEditing] = useState(!readOnly)
  const [saving, setSaving] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  // Update data when initialData changes
  useEffect(() => {
    if (initialData) {
      setData(prev => ({ ...prev, ...initialData }))
    }
  }, [initialData])

  const update = (field: keyof BillOfSaleData, value: string | boolean) => {
    if (!editing) return
    setData(prev => ({ ...prev, [field]: value }))
  }

  // ─── Generate PDF from the template ───────────────────────────────────────

  const generatePDF = async (): Promise<File> => {
    const el = printRef.current
    if (!el) throw new Error('Template ref not found')

    // Temporarily switch to preview mode for clean capture
    const wasEditing = editing
    if (wasEditing) setEditing(false)

    // Wait for re-render
    await new Promise(r => setTimeout(r, 200))

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    // Restore editing mode
    if (wasEditing) setEditing(true)

    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 8
    const usableW = pageWidth - margin * 2

    const imgW = canvas.width
    const imgH = canvas.height
    const ratio = usableW / imgW
    const scaledH = imgH * ratio

    // If content fits in one page
    if (scaledH <= pageHeight - margin * 2) {
      pdf.addImage(imgData, 'JPEG', margin, margin, usableW, scaledH)
    } else {
      // Multi-page: split the image
      const usableH = pageHeight - margin * 2
      let yOffset = 0
      let page = 0
      while (yOffset < scaledH) {
        if (page > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', margin, margin - yOffset, usableW, scaledH)
        yOffset += usableH
        page++
      }
    }

    const blob = pdf.output('blob')
    const filename = `bill_of_sale_${transactionType}_${Date.now()}.pdf`
    return new File([blob], filename, { type: 'application/pdf' })
  }

  // ─── Print ────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const printWindow = window.open('', '_blank', 'width=800,height=1100')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bill of Sale - Maninos Homes</title>
        <style>
          @page { size: letter; margin: 0.5in; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; }
          .bos-container { max-width: 7.5in; margin: 0 auto; }
          ${getPrintStyles()}
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }

  const handleSave = async () => {
    if (!onSave) return
    setSaving(true)
    try {
      const file = await generatePDF()
      onSave(file, data)
    } catch (err) {
      console.error('Error generating PDF:', err)
    } finally {
      setSaving(false)
    }
  }

  // ─── Editable field helpers (plain functions, NOT components) ──────────────
  // Using plain function calls instead of <Component /> to avoid React
  // unmounting/remounting inputs on each render, which causes focus loss.

  function renderField(field: keyof BillOfSaleData, className = '', placeholder = '', style?: React.CSSProperties) {
    const val = data[field]
    if (typeof val === 'boolean') return null

    if (!editing) {
      return (
        <span className={`bos-value ${className}`} style={style}>
          {val || <span className="text-gray-300">{'_'.repeat(20)}</span>}
        </span>
      )
    }

    return (
      <input
        type="text"
        value={val as string}
        onChange={e => update(field, e.target.value)}
        placeholder={placeholder}
        className={`bos-input ${className}`}
        style={style}
      />
    )
  }

  function renderTextArea(field: keyof BillOfSaleData, className = '', placeholder = '', rows = 2) {
    const val = data[field]
    if (typeof val === 'boolean') return null

    if (!editing) {
      return (
        <span className={`bos-value whitespace-pre-wrap ${className}`}>
          {val || ''}
        </span>
      )
    }

    return (
      <textarea
        value={val as string}
        onChange={e => update(field, e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`bos-textarea ${className}`}
      />
    )
  }

  function renderCheckbox(field: 'is_new' | 'is_used') {
    const checked = data[field]
    if (!editing) {
      return (
        <span className="bos-checkbox">
          {checked ? '✔' : ''}
        </span>
      )
    }
    return (
      <input
        type="checkbox"
        checked={!!checked}
        onChange={e => update(field, e.target.checked)}
        className="bos-checkbox-input"
      />
    )
  }

  function renderFeeRow(label: string, field: keyof BillOfSaleData) {
    return (
      <tr>
        <td className="bos-fee-label">{label}</td>
        <td className="bos-fee-value">
          {renderField(field, '', 'N/A')}
        </td>
      </tr>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bos-wrapper">
      {/* Toolbar */}
      <div className="bos-toolbar no-print">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-navy-900 text-lg">Bill of Sale</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-gold-100 text-gold-700 font-medium">
            {transactionType === 'purchase' ? 'Compra' : 'Venta'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <button
              onClick={() => setEditing(!editing)}
              className="bos-btn bos-btn-secondary"
              title={editing ? 'Vista previa' : 'Editar'}
            >
              {editing ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              {editing ? 'Preview' : 'Editar'}
            </button>
          )}
          <button onClick={handlePrint} className="bos-btn bos-btn-secondary">
            <Printer className="w-4 h-4" /> Imprimir
          </button>
          {onSave && (
            <button onClick={handleSave} disabled={saving} className="bos-btn bos-btn-primary">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Generando PDF...' : 'Guardar PDF'}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="bos-btn bos-btn-ghost">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Document */}
      <div ref={printRef} className="bos-container">
        {/* Header */}
        <div className="bos-header">
          <div className="bos-logo-area">
            <div className="bos-logo-icon">
              <svg viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-10">
                <path d="M30 2 L5 30 L20 30 L30 15 L40 30 L55 30 Z" fill="#1a1a2e" stroke="#1a1a2e" strokeWidth="2"/>
                <path d="M30 8 L15 28 L25 28 L30 18 L35 28 L45 28 Z" fill="#c9a84c" stroke="#c9a84c" strokeWidth="1"/>
              </svg>
              <span className="bos-logo-text">maninos homes</span>
            </div>
            <div className="bos-title-block">
              <h1 className="bos-company-name">MANINOS<br/>HOMES</h1>
            </div>
          </div>
          <div className="bos-doc-mark">M</div>
        </div>

        <h2 className="bos-doc-title">BILL OF SALE</h2>

        {/* Seller / Buyer Info */}
        <div className="bos-section">
          <div className="bos-row">
            <span className="bos-label">SELLER: SELLER 2: ADDRESS:</span>
            {renderField("seller_name", "bos-flex-1", "Nombre vendedor")}
          </div>
          <div className="bos-row">
            {renderField("seller_address", "bos-flex-1 bos-underline", "Dirección vendedor")}
          </div>
          <div className="bos-row bos-row-split">
            <div className="bos-half">
              <span className="bos-label">PHONE:</span>
              {renderField("seller_phone", "", "Teléfono")}
            </div>
            <div className="bos-half">
              <span className="bos-label">EMAIL:</span>
              {renderField("seller_email", "", "Email")}
            </div>
          </div>

          <div className="bos-row">
            <span className="bos-label">BUYER:</span>
            {renderField("buyer_name", "bos-flex-1 bos-underline", "Nombre comprador")}
          </div>
          <div className="bos-row">
            <span className="bos-label">BUYER 2:</span>
            {renderField("buyer2_name", "bos-flex-1 bos-underline")}
          </div>
          <div className="bos-row bos-row-split">
            <div className="bos-half">
              <span className="bos-label">ADDRESS:</span>
              {renderField("buyer_address", "bos-flex-1 bos-underline", "Dirección comprador")}
            </div>
            <div className="bos-third">
              <span className="bos-label">DATE:</span>
              {renderField("buyer_date", "", "mm/dd/yyyy")}
            </div>
          </div>
          <div className="bos-row bos-row-split">
            <div className="bos-half">
              <span className="bos-label">TELE:</span>
              {renderField("buyer_phone", "", "Teléfono")}
            </div>
            <div className="bos-half">
              <span className="bos-label">EMAIL:</span>
              {renderField("buyer_email", "", "Email")}
            </div>
          </div>
        </div>

        {/* Property Details Table */}
        <table className="bos-table">
          <tbody>
            <tr>
              <td className="bos-cell bos-cell-header">MANUFACTURER</td>
              <td className="bos-cell bos-cell-header">MAKE</td>
              <td className="bos-cell bos-cell-header">DATE MANUFACTURED</td>
            </tr>
            <tr>
              <td className="bos-cell">{renderField("manufacturer", "", "Fabricante")}</td>
              <td className="bos-cell">{renderField("make", "", "Marca")}</td>
              <td className="bos-cell">{renderField("date_manufactured", "", "Fecha")}</td>
            </tr>
            <tr>
              <td className="bos-cell bos-cell-header" style={{ width: '12%' }}>B.ROOMS</td>
              <td className="bos-cell bos-cell-header" style={{ width: '12%' }}>BATHS</td>
              <td className="bos-cell bos-cell-header" style={{ width: '20%' }}>DIMENSIONS</td>
              <td className="bos-cell bos-cell-header" style={{ width: '30%' }}>SERIAL NUMBER</td>
              <td className="bos-cell bos-cell-header" style={{ width: '10%' }}>NEW</td>
              <td className="bos-cell bos-cell-header" style={{ width: '10%' }}>USED</td>
            </tr>
            <tr>
              <td className="bos-cell">{renderField("bedrooms", "", "#")}</td>
              <td className="bos-cell">{renderField("baths", "", "#")}</td>
              <td className="bos-cell">{renderField("dimensions", "", "16x80")}</td>
              <td className="bos-cell">{renderField("serial_number", "", "Serial #")}</td>
              <td className="bos-cell bos-center">{renderCheckbox("is_new")}</td>
              <td className="bos-cell bos-center">{renderCheckbox("is_used")}</td>
            </tr>
            <tr>
              <td className="bos-cell bos-cell-header" colSpan={3}>LOCATION OF HOME</td>
              <td className="bos-cell bos-cell-header" colSpan={3}>HUD/LABEL NUMBER</td>
            </tr>
            <tr>
              <td className="bos-cell" colSpan={3}>{renderField("location_of_home", "", "Ubicación")}</td>
              <td className="bos-cell" colSpan={3}>{renderField("hud_label_number", "", "HUD #")}</td>
            </tr>
          </tbody>
        </table>

        {/* Two-column: Terms + Fees */}
        <div className="bos-split-section">
          {/* Left column: Terms */}
          <div className="bos-left-col">
            <div className="bos-term-block">
              <span className="bos-label-sm bos-underline-label">OPTIONAL EQUIPMENT, LABOR AND ACCESSORIES</span>
              {renderTextArea("optional_equipment", "", "Equipo opcional...")}
            </div>
            <div className="bos-term-block">
              <span className="bos-label-sm">PURCHASER&apos;S RESPONSIBILITIES:</span>
              {renderTextArea("purchaser_responsibilities", "", "Responsabilidades del comprador...")}
            </div>
            <div className="bos-term-block">
              <span className="bos-label-sm">SELLER&apos;S RESPONSIBILITIES:</span>
              {renderTextArea("seller_responsibilities", "", "Responsabilidades del vendedor...")}
            </div>
            <p className="bos-small-text">WARRANTY JUTS IN NEW EQUIPEMENT</p>
            <p className="bos-disclaimer">
              **Deposit and down payment are not refundable after closing date, <u>may</u> applicate to another house**
            </p>

            <div className="bos-term-row">
              <span className="bos-label-sm">MOVING TO:</span>
              {renderField("moving_to", "bos-flex-1 bos-underline")}
            </div>
            <div className="bos-term-row">
              <span className="bos-label-sm">SALESPERSON:</span>
              {renderField("salesperson", "bos-flex-1 bos-underline")}
            </div>
            <div className="bos-term-row">
              <span className="bos-label-sm">TOTAL PAYMENT:</span>
              {renderField("total_payment", "bos-flex-1 bos-underline")}
            </div>
            <div className="bos-term-row">
              <span className="bos-label-sm">DURATION:</span>
              {renderField("duration", "bos-flex-1 bos-underline")}
            </div>
            <div className="bos-term-row">
              <span className="bos-label-sm">COST OF MOVING:</span>
              {renderField("cost_of_moving", "bos-flex-1 bos-underline")}
            </div>
          </div>

          {/* Right column: Fees */}
          <div className="bos-right-col">
            <div className="bos-deposit-row">
              <span className="bos-label-sm bos-bold">DEPOSIT:</span>
              {renderField("deposit", "", "$0")}
            </div>
            <table className="bos-fee-table">
              <tbody>
                <tr><td colSpan={2} className="bos-fee-header">SUB-TOTAL</td></tr>
                {renderFeeRow("State Tax", "state_tax")}
                {renderFeeRow("City Tax", "city_tax")}
                {renderFeeRow("County Tax", "county_tax")}
                {renderFeeRow("MHI Tax", "mhi_tax")}
                {renderFeeRow("Mobil Owners Insurance Premium", "mobil_owners_insurance")}
                {renderFeeRow("Credit Life Insurance Premium", "credit_life_insurance")}
                {renderFeeRow("Home Buyer's Protection Ins. Premium", "home_buyers_protection")}
                {renderFeeRow("Filing Fee", "filing_fee")}
                {renderFeeRow("SOL TRANSFER & FORM T", "sol_transfer_form_t")}
                {renderFeeRow("DELIVERY", "delivery")}
                {renderFeeRow("A/C HOOK UP", "ac_hook_up")}
                {renderFeeRow("TRIMOUT", "trimout")}
                {renderFeeRow("SKIRTING", "skirting")}
                <tr>
                  <td className="bos-fee-total-label">1. TOTAL:</td>
                  <td className="bos-fee-total-value">
                    {renderField("total", "", "$0")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Signatures */}
        <div className="bos-signatures">
          <div className="bos-sig-row">
            <div className="bos-sig-left">
              <span className="bos-label-sm bos-bold">SELLER:</span>
              <span className="bos-sig-name">MANINOS HOMES</span>
            </div>
            <div className="bos-sig-right">
              <span className="bos-label-sm bos-bold">BUYER 1:</span> X
              <span className="bos-sig-line"></span>
              <div className="bos-sig-date">
                <span className="bos-label-sm">DATE:</span>
                <span className="bos-sig-line-short"></span>
              </div>
            </div>
          </div>
          <div className="bos-sig-x">
            X <span className="bos-sig-line"></span>
          </div>
          <div className="bos-sig-row">
            <div className="bos-sig-left">
              <span className="bos-label-sm bos-bold">SELLER:</span>
              <span className="bos-sig-line"></span>
            </div>
            <div className="bos-sig-right">
              <span className="bos-label-sm bos-bold">BUYER 2:</span> X
              <span className="bos-sig-line"></span>
              <div className="bos-sig-date">
                <span className="bos-label-sm">DATE:</span>
                <span className="bos-sig-line-short"></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scoped styles */}
      <style>{`
        .bos-wrapper {
          background: #f8f9fa;
          border-radius: 12px;
          overflow: hidden;
        }
        .bos-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: white;
          border-bottom: 1px solid #e5e7eb;
        }
        .bos-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.15s;
        }
        .bos-btn-primary { background: #1a1a2e; color: #c9a84c; }
        .bos-btn-primary:hover { background: #2a2a3e; }
        .bos-btn-secondary { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
        .bos-btn-secondary:hover { background: #e5e7eb; }
        .bos-btn-ghost { background: transparent; color: #6b7280; }
        .bos-btn-ghost:hover { background: #f3f4f6; }

        .bos-container {
          background: white;
          margin: 16px;
          padding: 32px 36px;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 12px;
          color: #000;
          line-height: 1.4;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }

        /* Header */
        .bos-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 4px;
        }
        .bos-logo-area {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .bos-logo-icon {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .bos-logo-text {
          font-size: 10px;
          color: #1a1a2e;
          letter-spacing: 1px;
          margin-top: 2px;
        }
        .bos-title-block {
          text-align: center;
        }
        .bos-company-name {
          font-size: 28px;
          font-weight: 900;
          color: #1a1a2e;
          line-height: 1.1;
          letter-spacing: 2px;
        }
        .bos-doc-mark {
          font-size: 36px;
          font-weight: 900;
          color: #000;
          border: 2px solid #000;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .bos-doc-title {
          text-align: center;
          font-size: 20px;
          font-weight: 700;
          margin: 16px 0 12px;
          border-bottom: 2px solid #000;
          padding-bottom: 8px;
        }

        /* Sections */
        .bos-section {
          margin-bottom: 12px;
        }
        .bos-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }
        .bos-row-split {
          display: flex;
          gap: 24px;
        }
        .bos-half { display: flex; align-items: center; gap: 6px; flex: 1; }
        .bos-third { display: flex; align-items: center; gap: 6px; flex: 0.6; }
        .bos-label {
          font-weight: 700;
          font-size: 11px;
          white-space: nowrap;
        }
        .bos-label-sm {
          font-weight: 700;
          font-size: 10px;
          white-space: nowrap;
        }
        .bos-bold { font-weight: 700; }
        .bos-flex-1 { flex: 1; }
        .bos-underline { border-bottom: 1px solid #000; }
        .bos-underline-label { border-bottom: 1px solid #000; display: block; margin-bottom: 4px; }

        /* Input styles */
        .bos-input {
          border: none;
          border-bottom: 1px solid #999;
          font-size: 12px;
          font-family: Arial, Helvetica, sans-serif;
          padding: 2px 4px;
          background: #fffef5;
          outline: none;
          min-width: 60px;
          flex: 1;
        }
        .bos-input:focus { border-bottom-color: #c9a84c; background: #fffff0; }
        .bos-textarea {
          border: 1px solid #ddd;
          font-size: 11px;
          font-family: Arial, Helvetica, sans-serif;
          padding: 4px 6px;
          background: #fffef5;
          outline: none;
          width: 100%;
          resize: vertical;
          border-radius: 2px;
        }
        .bos-textarea:focus { border-color: #c9a84c; }
        .bos-value {
          font-size: 12px;
          min-height: 16px;
        }
        .bos-checkbox {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 1.5px solid #000;
          text-align: center;
          font-size: 12px;
          line-height: 14px;
        }
        .bos-checkbox-input {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
        .bos-center { text-align: center; }

        /* Property table */
        .bos-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        .bos-cell {
          border: 1.5px solid #000;
          padding: 4px 6px;
          font-size: 11px;
        }
        .bos-cell-header {
          font-weight: 700;
          background: #f0f0f0;
          font-size: 10px;
        }

        /* Two-column split */
        .bos-split-section {
          display: flex;
          gap: 16px;
          margin: 10px 0;
        }
        .bos-left-col { flex: 1; }
        .bos-right-col { flex: 0.8; }

        .bos-term-block { margin-bottom: 8px; }
        .bos-term-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
        }
        .bos-small-text {
          font-size: 9px;
          font-weight: 700;
          margin: 4px 0;
        }
        .bos-disclaimer {
          font-size: 9px;
          font-weight: 700;
          text-align: center;
          margin: 8px 0;
          padding: 4px;
          border: 1px solid #000;
          background: #fff;
        }

        /* Fee table */
        .bos-deposit-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
          border: 1.5px solid #000;
          padding: 6px;
          margin-bottom: 4px;
        }
        .bos-fee-table {
          width: 100%;
          border-collapse: collapse;
        }
        .bos-fee-header {
          font-weight: 700;
          text-align: center;
          padding: 3px;
          border-bottom: 1px solid #000;
          font-size: 11px;
        }
        .bos-fee-label {
          font-size: 10px;
          padding: 2px 4px;
          border-bottom: 1px solid #ddd;
        }
        .bos-fee-value {
          text-align: right;
          padding: 2px 4px;
          border-bottom: 1px solid #ddd;
          font-size: 11px;
          width: 60px;
        }
        .bos-fee-total-label {
          font-weight: 700;
          font-size: 12px;
          padding: 4px;
          border-top: 2px solid #000;
        }
        .bos-fee-total-value {
          font-weight: 700;
          text-align: right;
          font-size: 12px;
          padding: 4px;
          border-top: 2px solid #000;
          width: 60px;
        }

        /* Signatures */
        .bos-signatures {
          margin-top: 20px;
          border-top: 1px solid #ccc;
          padding-top: 16px;
        }
        .bos-sig-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .bos-sig-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        .bos-sig-right {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 1;
          flex-wrap: wrap;
        }
        .bos-sig-name {
          font-weight: 700;
          font-size: 12px;
        }
        .bos-sig-line {
          flex: 1;
          border-bottom: 1px solid #000;
          min-width: 80px;
          height: 16px;
        }
        .bos-sig-line-short {
          border-bottom: 1px solid #000;
          min-width: 60px;
          width: 80px;
          height: 16px;
        }
        .bos-sig-x {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          padding-left: 40px;
          font-weight: 700;
        }
        .bos-sig-date {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        @media print {
          .no-print { display: none !important; }
          .bos-wrapper { background: white; border-radius: 0; }
          .bos-container { margin: 0; padding: 0; border: none; box-shadow: none; }
          .bos-input, .bos-textarea {
            border: none;
            background: transparent;
            padding: 0;
          }
        }
      `}</style>
    </div>
  )
}

// Print styles as string for the popup window
function getPrintStyles(): string {
  return `
    .no-print { display: none !important; }
    .bos-container {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      line-height: 1.4;
    }
    .bos-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
    .bos-logo-area { display: flex; align-items: center; gap: 16px; }
    .bos-logo-icon { display: flex; flex-direction: column; align-items: center; }
    .bos-logo-text { font-size: 10px; color: #1a1a2e; letter-spacing: 1px; margin-top: 2px; }
    .bos-title-block { text-align: center; }
    .bos-company-name { font-size: 26px; font-weight: 900; line-height: 1.1; letter-spacing: 2px; }
    .bos-doc-mark { font-size: 32px; font-weight: 900; border: 2px solid #000; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; }
    .bos-doc-title { text-align: center; font-size: 18px; font-weight: 700; margin: 14px 0 10px; border-bottom: 2px solid #000; padding-bottom: 6px; }
    .bos-section { margin-bottom: 10px; }
    .bos-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
    .bos-row-split { display: flex; gap: 20px; }
    .bos-half { display: flex; align-items: center; gap: 4px; flex: 1; }
    .bos-third { display: flex; align-items: center; gap: 4px; flex: 0.6; }
    .bos-label { font-weight: 700; font-size: 10px; white-space: nowrap; }
    .bos-label-sm { font-weight: 700; font-size: 9px; white-space: nowrap; }
    .bos-bold { font-weight: 700; }
    .bos-flex-1 { flex: 1; }
    .bos-underline { border-bottom: 1px solid #000; }
    .bos-value { font-size: 11px; min-height: 14px; }
    .bos-input { border: none; border-bottom: 1px solid #999; font-size: 11px; font-family: Arial; padding: 1px 2px; background: transparent; min-width: 50px; flex: 1; }
    .bos-textarea { border: none; font-size: 10px; font-family: Arial; padding: 0; background: transparent; width: 100%; resize: none; }
    .bos-checkbox { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #000; text-align: center; font-size: 11px; line-height: 12px; }
    .bos-checkbox-input { width: 14px; height: 14px; }
    .bos-center { text-align: center; }
    .bos-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    .bos-cell { border: 1.5px solid #000; padding: 3px 5px; font-size: 10px; }
    .bos-cell-header { font-weight: 700; background: #f0f0f0; font-size: 9px; }
    .bos-split-section { display: flex; gap: 14px; margin: 8px 0; }
    .bos-left-col { flex: 1; }
    .bos-right-col { flex: 0.8; }
    .bos-term-block { margin-bottom: 6px; }
    .bos-term-row { display: flex; align-items: center; gap: 4px; margin-bottom: 3px; }
    .bos-small-text { font-size: 8px; font-weight: 700; margin: 3px 0; }
    .bos-disclaimer { font-size: 8px; font-weight: 700; text-align: center; margin: 6px 0; padding: 3px; border: 1px solid #000; }
    .bos-deposit-row { display: flex; align-items: center; gap: 6px; border: 1.5px solid #000; padding: 4px; margin-bottom: 3px; }
    .bos-fee-table { width: 100%; border-collapse: collapse; }
    .bos-fee-header { font-weight: 700; text-align: center; padding: 2px; border-bottom: 1px solid #000; font-size: 10px; }
    .bos-fee-label { font-size: 9px; padding: 1px 3px; border-bottom: 1px solid #ddd; }
    .bos-fee-value { text-align: right; padding: 1px 3px; border-bottom: 1px solid #ddd; font-size: 10px; width: 50px; }
    .bos-fee-total-label { font-weight: 700; font-size: 11px; padding: 3px; border-top: 2px solid #000; }
    .bos-fee-total-value { font-weight: 700; text-align: right; font-size: 11px; padding: 3px; border-top: 2px solid #000; width: 50px; }
    .bos-signatures { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 12px; }
    .bos-sig-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .bos-sig-left { display: flex; align-items: center; gap: 6px; flex: 1; }
    .bos-sig-right { display: flex; align-items: center; gap: 4px; flex: 1; flex-wrap: wrap; }
    .bos-sig-name { font-weight: 700; font-size: 11px; }
    .bos-sig-line { flex: 1; border-bottom: 1px solid #000; min-width: 60px; height: 14px; }
    .bos-sig-line-short { border-bottom: 1px solid #000; min-width: 50px; width: 70px; height: 14px; }
    .bos-sig-x { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; padding-left: 36px; font-weight: 700; }
    .bos-sig-date { display: flex; align-items: center; gap: 3px; }
    .bos-underline-label { border-bottom: 1px solid #000; display: block; margin-bottom: 3px; }
  `
}


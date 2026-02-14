'use client'

import { useState, useRef, useEffect } from 'react'
import { Printer, Save, X, Edit3, Eye, Loader2 } from 'lucide-react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TitleApplicationData {
  // BLOCK 1: Transaction Identification
  tx_personal_new: boolean
  tx_personal_used: boolean
  tx_personal_lien_assignment: boolean
  tx_personal_convert_back: boolean
  tx_personal_beneficiary: boolean
  tx_personal_other: boolean
  tx_personal_other_text: string
  tx_real_new: boolean
  tx_real_used: boolean
  tx_real_other: boolean
  tx_real_other_text: string
  handling_normal: boolean
  handling_expedited: boolean

  // BLOCK 2(a): Home Information
  manufacturer: string
  manufacturer_address: string
  manufacturer_city_state_zip: string
  manufacturer_license: string
  make: string
  date_of_manufacture: string
  year: string
  total_sqft: string
  wind_zone: string
  section1_label: string
  section1_serial: string
  section1_weight: string
  section1_width: string
  section1_length: string
  section2_label: string
  section2_serial: string
  section2_weight: string
  section2_width: string
  section2_length: string
  section3_label: string
  section3_serial: string
  section3_weight: string
  section3_width: string
  section3_length: string
  section4_label: string
  section4_serial: string
  section4_weight: string
  section4_width: string
  section4_length: string

  // BLOCK 2(b)
  has_hud_label: boolean
  no_hud_label: boolean
  seal_section1: boolean
  seal_section2: boolean
  seal_section3: boolean
  seal_section4: boolean

  // BLOCK 3: Home Location
  location_address: string
  location_city: string
  location_state: string
  location_zip: string
  location_county: string
  home_moved: boolean
  home_moved_no: boolean
  home_installed: boolean
  home_installed_no: boolean
  date_installed: string
  installer_name_address: string
  installer_phone: string
  installer_license: string

  // BLOCK 4: Ownership
  seller_name: string
  seller_license: string
  seller2_name: string
  seller_address: string
  seller_city_state_zip: string
  seller_phone: string
  buyer_name: string
  buyer_license: string
  buyer2_name: string
  buyer_address: string
  buyer_city_state_zip: string
  buyer_phone: string
  is_sale: boolean
  is_sale_no: boolean
  sale_transfer_date: string

  // Page 2 top
  page2_hud_label: string
  page2_serial: string
  page2_gf: string

  // BLOCK 5: Right of Survivorship
  surv_married: boolean
  surv_joint: boolean
  surv_beneficiary: boolean

  // BLOCK 6: Election
  election_real_property: boolean
  election_own_land: boolean
  election_lease_land: boolean
  election_loan_holder: boolean
  election_gf_number: string
  election_inventory: boolean

  // BLOCK 7
  use_business: boolean
  use_non_residential: boolean
  use_salvage: boolean

  // BLOCK 8
  has_liens: boolean
  has_liens_no: boolean
  lien1_date: string
  lien1_name: string
  lien1_address: string
  lien1_city_state_zip: string
  lien1_phone: string
  lien2_date: string
  lien2_name: string
  lien2_address: string
  lien2_city_state_zip: string
  lien2_phone: string

  // BLOCK 9
  mailing_name: string
  mailing_company: string
  mailing_address: string
  mailing_city_state_zip: string
  mailing_phone: string
  mailing_email: string

  // Notes
  notes: string

  // ── Legacy compat fields (keep for backward compat with existing code) ──
  serial_number: string
  label_seal_number: string
  hud_number: string
  sqft: string
  width: string
  length: string
  bedrooms: string
  bathrooms: string
  is_new: boolean
  is_used: boolean
  applicant_name: string
  applicant_address: string
  applicant_city: string
  applicant_state: string
  applicant_zip: string
  applicant_phone: string
  applicant_email: string
  applicant_dl: string
  sale_date: string
  sale_price: string
  lienholder_name: string
  lienholder_address: string
  lienholder_city: string
  lienholder_state: string
  lienholder_zip: string
  lien_amount: string
  location_address_legacy: string
  location_city_legacy: string
  location_county_legacy: string
  location_state_legacy: string
  location_zip_legacy: string
  seller_phone_legacy: string
}

interface Props {
  initialData?: Partial<TitleApplicationData>
  transactionType?: 'purchase' | 'sale'
  onSave?: (file: File, data: TitleApplicationData) => void
  onClose?: () => void
  readOnly?: boolean
}

const EMPTY: TitleApplicationData = {
  tx_personal_new: false, tx_personal_used: true, tx_personal_lien_assignment: false,
  tx_personal_convert_back: false, tx_personal_beneficiary: false,
  tx_personal_other: false, tx_personal_other_text: '',
  tx_real_new: false, tx_real_used: false, tx_real_other: false, tx_real_other_text: '',
  handling_normal: true, handling_expedited: false,
  manufacturer: '', manufacturer_address: '', manufacturer_city_state_zip: '',
  manufacturer_license: '', make: '', date_of_manufacture: '', year: '',
  total_sqft: '', wind_zone: '',
  section1_label: '', section1_serial: '', section1_weight: '', section1_width: '', section1_length: '',
  section2_label: '', section2_serial: '', section2_weight: '', section2_width: '', section2_length: '',
  section3_label: '', section3_serial: '', section3_weight: '', section3_width: '', section3_length: '',
  section4_label: '', section4_serial: '', section4_weight: '', section4_width: '', section4_length: '',
  has_hud_label: false, no_hud_label: false,
  seal_section1: false, seal_section2: false, seal_section3: false, seal_section4: false,
  location_address: '', location_city: '', location_state: 'TX', location_zip: '', location_county: '',
  home_moved: false, home_moved_no: true, home_installed: false, home_installed_no: true,
  date_installed: '', installer_name_address: '', installer_phone: '', installer_license: '',
  seller_name: '', seller_license: '', seller2_name: '',
  seller_address: '', seller_city_state_zip: '', seller_phone: '',
  buyer_name: 'MANINOS HOMES LLC', buyer_license: '', buyer2_name: '',
  buyer_address: '', buyer_city_state_zip: '', buyer_phone: '',
  is_sale: true, is_sale_no: false, sale_transfer_date: '',
  page2_hud_label: '', page2_serial: '', page2_gf: '',
  surv_married: false, surv_joint: false, surv_beneficiary: false,
  election_real_property: false, election_own_land: false, election_lease_land: false,
  election_loan_holder: false, election_gf_number: '', election_inventory: false,
  use_business: false, use_non_residential: false, use_salvage: false,
  has_liens: false, has_liens_no: true,
  lien1_date: '', lien1_name: '', lien1_address: '', lien1_city_state_zip: '', lien1_phone: '',
  lien2_date: '', lien2_name: '', lien2_address: '', lien2_city_state_zip: '', lien2_phone: '',
  mailing_name: '', mailing_company: '', mailing_address: '',
  mailing_city_state_zip: '', mailing_phone: '', mailing_email: '',
  notes: '',
  // Legacy
  serial_number: '', label_seal_number: '', hud_number: '', sqft: '', width: '', length: '',
  bedrooms: '', bathrooms: '', is_new: false, is_used: true,
  applicant_name: 'MANINOS HOMES LLC', applicant_address: '', applicant_city: '',
  applicant_state: 'TX', applicant_zip: '', applicant_phone: '', applicant_email: '',
  applicant_dl: '', sale_date: new Date().toISOString().split('T')[0], sale_price: '',
  lienholder_name: '', lienholder_address: '', lienholder_city: '',
  lienholder_state: '', lienholder_zip: '', lien_amount: '',
  location_address_legacy: '', location_city_legacy: '', location_county_legacy: '',
  location_state_legacy: 'TX', location_zip_legacy: '', seller_phone_legacy: '',
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TitleApplicationTemplate({
  initialData, transactionType = 'purchase', onSave, onClose, readOnly = false,
}: Props) {
  const [data, setData] = useState<TitleApplicationData>(() => {
    const base = { ...EMPTY }
    if (transactionType === 'sale') {
      base.seller_name = 'MANINOS HOMES LLC'; base.buyer_name = ''; base.applicant_name = ''
    }
    const m = { ...base, ...initialData }
    // Map legacy → new
    if (initialData?.applicant_name && !initialData?.buyer_name) m.buyer_name = initialData.applicant_name
    if (initialData?.applicant_phone && !initialData?.buyer_phone) m.buyer_phone = initialData.applicant_phone
    if (initialData?.serial_number && !initialData?.section1_serial) m.section1_serial = initialData.serial_number
    if (initialData?.label_seal_number && !initialData?.section1_label) m.section1_label = initialData.label_seal_number
    if (initialData?.sqft && !initialData?.total_sqft) m.total_sqft = initialData.sqft
    if (initialData?.sale_date && !initialData?.sale_transfer_date) m.sale_transfer_date = initialData.sale_date
    if (initialData?.lienholder_name && !initialData?.lien1_name) m.lien1_name = initialData.lienholder_name
    if (initialData?.lienholder_address && !initialData?.lien1_address) m.lien1_address = initialData.lienholder_address
    if (initialData?.seller_phone_legacy && !initialData?.seller_phone) m.seller_phone = initialData.seller_phone_legacy
    return m
  })
  const [editing, setEditing] = useState(!readOnly)
  const [saving, setSaving] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (initialData) setData(prev => ({ ...prev, ...initialData })) }, [initialData])

  const update = (field: keyof TitleApplicationData, value: string | boolean) => {
    if (!editing) return
    setData(prev => ({ ...prev, [field]: value }))
  }

  // ─── PDF ──────────────────────────────────────────────────────────────────

  const generatePDF = async (): Promise<File> => {
    const el = printRef.current
    if (!el) throw new Error('Ref not found')
    const was = editing; if (was) setEditing(false)
    await new Promise(r => setTimeout(r, 250))
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fff', logging: false })
    if (was) setEditing(true)
    const img = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), mg = 6
    const uw = pw - mg * 2, ratio = uw / canvas.width, sh = canvas.height * ratio
    if (sh <= ph - mg * 2) { pdf.addImage(img, 'JPEG', mg, mg, uw, sh) }
    else { const uh = ph - mg * 2; let y = 0, p = 0; while (y < sh) { if (p > 0) pdf.addPage(); pdf.addImage(img, 'JPEG', mg, mg - y, uw, sh); y += uh; p++ } }
    return new File([pdf.output('blob')], `title_application_${transactionType}_${Date.now()}.pdf`, { type: 'application/pdf' })
  }

  const handlePrint = () => {
    const c = printRef.current; if (!c) return
    const w = window.open('', '_blank', 'width=900,height=1200'); if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><title>TDHCA Form 1023</title><style>@page{size:letter;margin:0.35in;}*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Times New Roman',Times,serif;font-size:9.5px;color:#000;}${getPrintCSS()}</style></head><body>${c.innerHTML}</body></html>`)
    w.document.close(); setTimeout(() => w.print(), 500)
  }

  const handleSave = async () => {
    if (!onSave) return; setSaving(true)
    try { const f = await generatePDF(); onSave(f, data) } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  // ─── Field helpers ────────────────────────────────────────────────────────

  function I(field: keyof TitleApplicationData, placeholder = '', className = '') {
    const v = data[field]
    if (typeof v === 'boolean') return null
    if (!editing) return <span className={`fv ${className}`}>{v || ''}</span>
    return <input type="text" value={v as string} onChange={e => update(field, e.target.value)} placeholder={placeholder} className={`fi ${className}`} />
  }

  function C(field: keyof TitleApplicationData) {
    const checked = !!data[field]
    if (!editing) return <span className="cb">{checked ? '☒' : '☐'}</span>
    return <input type="checkbox" checked={checked} onChange={e => update(field, e.target.checked)} className="ci" />
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="taw">
      {/* Toolbar */}
      <div className="toolbar no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ fontWeight: 700, fontSize: 16 }}>TDHCA Form 1023 — Aplicación de Título</h3>
          <span className="badge">{transactionType === 'purchase' ? 'Compra' : 'Venta'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!readOnly && (
            <button onClick={() => setEditing(!editing)} className="tbtn tsec">
              {editing ? <Eye className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
              {editing ? 'Preview' : 'Editar'}
            </button>
          )}
          <button onClick={handlePrint} className="tbtn tsec"><Printer className="w-4 h-4" /> Imprimir</button>
          {onSave && (
            <button onClick={handleSave} disabled={saving} className="tbtn tpri">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Generando...' : 'Guardar PDF'}
            </button>
          )}
          {onClose && <button onClick={onClose} className="tbtn tgho"><X className="w-4 h-4" /></button>}
        </div>
      </div>

      {/* ═══════════ FORM DOCUMENT ═══════════ */}
      <div ref={printRef} className="doc">

        {/* ══ HEADER ══ */}
        <div className="hdr">
          <p className="hdr-dept"><span className="sc">Texas Department of Housing and Community Affairs</span></p>
          <p className="hdr-div"><span className="sc">Manufactured Housing Division</span></p>
          <p className="hdr-addr">P. O. BOX 12489 &nbsp; Austin, Texas &nbsp;78711-2489</p>
          <p className="hdr-addr">(800) 500-7074, (512) 475-2200 FAX (512) 475-1109</p>
          <p className="hdr-addr">Internet Address: <u>www.tdhca.texas.gov/mhd</u></p>
          <p className="hdr-title">APPLICATION FOR STATEMENT OF OWNERSHIP</p>
        </div>

        <div className="notice-box">
          <p><strong>The filing of an application for the issuance of a Statement of Ownership later than sixty (60) days after the date of a sale to a consumer for residential use, may result in a fee of up to one hundred dollars ($100). Any such application that is submitted late may be delayed until the fee is paid in full.</strong></p>
        </div>

        {/* ══ BLOCK 1 ══ */}
        <table className="bt"><tbody>
          <tr><td colSpan={3} className="bth">BLOCK 1: &nbsp;Transaction Identification</td></tr>
          <tr>
            {/* Col 1: Type of Transaction */}
            <td className="b1c1" style={{ width: '34%' }}>
              <p className="b1h">Type of Transaction</p>
              <p className="b1sub">(Home cannot be selected as Personal and Real Property)</p>
              <div className="b1sec">
                <p className="b1sh"><u>Personal Property Transaction</u></p>
                <div className="cg">{C('tx_personal_new')} New</div>
                <div className="cg">{C('tx_personal_used')} Used</div>
                <div className="cg">{C('tx_personal_lien_assignment')} Lien Assignment</div>
                <div className="cg">{C('tx_personal_convert_back')} Convert back to Personal Property</div>
                <div className="cg">{C('tx_personal_beneficiary')} Beneficiary Designation / Revocation</div>
                <div className="cg">{C('tx_personal_other')} Other: {I('tx_personal_other_text', '', 'w80')}</div>
              </div>
              <div className="b1sec">
                <p className="b1sh"><u>Real Property Transaction</u></p>
                <div className="cg">{C('tx_real_new')} New</div>
                <div className="cg">{C('tx_real_used')} Used</div>
                <div className="cg">{C('tx_real_other')} Other {I('tx_real_other_text', '', 'w80')}</div>
              </div>
            </td>
            {/* Col 2: Type of Handling */}
            <td className="b1c2" style={{ width: '38%' }}>
              <p className="b1h">Type of Handling (Check One)</p>
              <div style={{ marginTop: 4 }}>
                <div className="cg">{C('handling_normal')} <strong>Process application in the normal 15 working days.</strong></div>
                <p className="b1note">A payment of $55 per transaction is required (total amount can be combined into one payment).</p>
              </div>
              <div style={{ marginTop: 8 }}>
                <div className="cg">{C('handling_expedited')} <strong>Process application within 5 working days from receipt.</strong></div>
                <p className="b1note">An additional $55 service fee must be added to the total payment to have the application processed within 5 working days from receipt.</p>
              </div>
            </td>
            {/* Col 3: Dept Use Only */}
            <td className="b1c3" style={{ width: '28%' }}>
              <p className="b1h">(For Department Use Only) Coding:</p>
              <div className="dept-grid">
                <p>Lien on file: &nbsp; Y &nbsp; / &nbsp; N</p>
                <p>Right of Survivorship: &nbsp; Y &nbsp; / &nbsp; N</p>
                <p>Texas Seal Purchase: &nbsp; Y &nbsp; / &nbsp; N</p>
                <p>For Section(s) &nbsp; 1 &nbsp; 2 &nbsp; 3 &nbsp; 4</p>
              </div>
            </td>
          </tr>
        </tbody></table>

        {/* ══ BLOCK 2(a) ══ */}
        <table className="bt"><tbody>
          <tr><td colSpan={2} className="bth">BLOCK 2(a): &nbsp;Home Information (required)</td></tr>
          <tr><td colSpan={2} className="btd">
            <table className="inner-tbl"><tbody>
              <tr>
                <td style={{ width: '60%' }}>
                  <div className="fr"><span className="fl">Manufacturer Name:</span>{I('manufacturer', 'Manufacturer', 'f1')}</div>
                  <div className="fr"><span className="fl">Address:</span>{I('manufacturer_address', 'Address', 'f1')}</div>
                  <div className="fr"><span className="fl">City, State, Zip:</span>{I('manufacturer_city_state_zip', 'City, State, Zip', 'f1')}</div>
                  <div className="fr"><span className="fl">License Number:</span>{I('manufacturer_license', 'License #', 'f1')}</div>
                </td>
                <td style={{ width: '40%' }}>
                  <div className="fr"><span className="fl">Model:</span>{I('make', 'Model', 'f1')}</div>
                  <div className="fr"><span className="fl">Date of Manufacture:</span>{I('date_of_manufacture', 'Date', 'f1')}</div>
                  <div className="fr"><span className="fl">Total Square Feet:</span>{I('total_sqft', 'Sqft', 'f1')}</div>
                  <div className="fr"><span className="fl">Wind Zone:</span>{I('wind_zone', 'I/II/III', 'f1')}</div>
                </td>
              </tr>
            </tbody></table>

            <table className="sec-tbl">
              <thead><tr>
                <th style={{ width: '12%' }}><em>Sections</em></th>
                <th style={{ width: '20%' }}><em>Label/Seal Number</em></th>
                <th style={{ width: '28%' }}><em>Complete Serial Number</em></th>
                <th style={{ width: '12%' }}><em>Weight</em></th>
                <th style={{ width: '18%' }}><em>Size*</em></th>
                <th rowSpan={5} style={{ width: '10%', fontSize: '7.5px', fontStyle: 'italic', fontWeight: 400, textAlign: 'left', verticalAlign: 'top', padding: '3px 4px', lineHeight: 1.3 }}>
                  * <u>NOTE</u>: Size must be reported as the outside dimensions (length and width) of the home as measured to the nearest ½ foot at the base of the home, exclusive of the tongue or other towing device.
                </th>
              </tr></thead>
              <tbody>
                <tr>
                  <td className="lb">Section 1:</td>
                  <td>{I('section1_label', '')}</td>
                  <td>{I('section1_serial', '')}</td>
                  <td>{I('section1_weight', '')}</td>
                  <td><span className="sz">{I('section1_width', "W")} X {I('section1_length', "L")}</span></td>
                </tr>
                <tr>
                  <td className="lb">Section 2:</td>
                  <td>{I('section2_label', '')}</td>
                  <td>{I('section2_serial', '')}</td>
                  <td>{I('section2_weight', '')}</td>
                  <td><span className="sz">{I('section2_width', "W")} X {I('section2_length', "L")}</span></td>
                </tr>
                <tr>
                  <td className="lb">Section 3:</td>
                  <td>{I('section3_label', '')}</td>
                  <td>{I('section3_serial', '')}</td>
                  <td>{I('section3_weight', '')}</td>
                  <td><span className="sz">{I('section3_width', "W")} X {I('section3_length', "L")}</span></td>
                </tr>
                <tr>
                  <td className="lb">Section 4:</td>
                  <td>{I('section4_label', '')}</td>
                  <td>{I('section4_serial', '')}</td>
                  <td>{I('section4_weight', '')}</td>
                  <td><span className="sz">{I('section4_width', "W")} X {I('section4_length', "L")}</span></td>
                </tr>
              </tbody>
            </table>
          </td></tr>
        </tbody></table>

        {/* ══ BLOCK 2(b) ══ */}
        <div className="b2b">
          <p><strong>2(b)</strong> &nbsp; DOES HOME HAVE A HUD LABEL OR TEXAS SEAL ATTACHED TO THE OUTSIDE OF THE HOME? &nbsp; Yes {C('has_hud_label')} &nbsp; No {C('no_hud_label')}</p>
          <p className="b2b-note"><strong>If there is/are no HUD Label(s) or Texas Seal(s)</strong> on your home, a Texas Seal will need to be purchased and will be issued to each section of your home at an additional cost of $35.00 per section.</p>
          <p><em>Indicate which section(s) need(s) Texas Seal:</em> &nbsp;
            Section One {C('seal_section1')} &nbsp;&nbsp;
            Section Two {C('seal_section2')} &nbsp;&nbsp;
            Section Three {C('seal_section3')} &nbsp;&nbsp;
            Section Four {C('seal_section4')}
          </p>
        </div>

        {/* ══ BLOCK 3 ══ */}
        <table className="bt"><tbody>
          <tr><td className="bth">BLOCK 3: &nbsp;Home Location (required)</td></tr>
          <tr><td className="btd">
            <table className="inner-tbl"><tbody>
              <tr>
                <td style={{ width: '22%' }}>
                  <p className="fl-sm">Physical Location of Home:</p>
                  <p className="fl-sm">(or 911 address)</p>
                </td>
                <td style={{ width: '78%' }}>
                  <p style={{ fontSize: '7.5px', fontStyle: 'italic', textAlign: 'center', marginBottom: 2 }}>Physical Address (cannot be a Rt. or P. O. Box)</p>
                  <div className="fr">{I('location_address', 'Physical address', 'f1')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', gap: 4, marginTop: 3 }}>
                    <div className="fr"><span className="fl">City:</span>{I('location_city', 'City', 'f1')}</div>
                    <div className="fr"><span className="fl">State:</span>{I('location_state', 'TX', 'f1')}</div>
                    <div className="fr"><span className="fl">ZIP:</span>{I('location_zip', 'ZIP', 'f1')}</div>
                    <div className="fr"><span className="fl">County:</span>{I('location_county', 'County', 'f1')}</div>
                  </div>
                </td>
              </tr>
            </tbody></table>

            <div style={{ marginTop: 4 }}>
              <span>Was Home Moved for this sale? &nbsp; Yes {C('home_moved')} &nbsp; No {C('home_moved_no')} &nbsp; If yes, include a copy of moving permit.</span>
            </div>
            <div style={{ marginTop: 2 }}>
              <span>Was Home Installed for this sale? &nbsp; Yes {C('home_installed')} &nbsp; No {C('home_installed_no')} &nbsp; If installed, date installed: {I('date_installed', 'mm/dd/yyyy', 'w120')} &nbsp;&nbsp; If yes, provide installer information below, if known.</span>
            </div>
            <div className="fr" style={{ marginTop: 3 }}><span className="fl">Installer Name and address:</span>{I('installer_name_address', 'Installer name and address', 'f1')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 3 }}>
              <div className="fr"><span className="fl">Installer Phone Number:</span>{I('installer_phone', '(xxx) xxx-xxxx', 'f1')}</div>
              <div className="fr"><span className="fl">Installer License Number:</span>{I('installer_license', 'License #', 'f1')}</div>
            </div>
          </td></tr>
        </tbody></table>

        {/* ══ BLOCK 4 ══ */}
        <table className="bt"><tbody>
          <tr><td colSpan={2} className="bth">BLOCK 4: &nbsp;Ownership Information (required)</td></tr>
          <tr>
            <td className="bth-sub" style={{ width: '50%' }}>4(a) &nbsp;Seller(s) or Transferor(s)</td>
            <td className="bth-sub" style={{ width: '50%' }}>4(b) &nbsp;Purchaser(s), Transferee(s), or Owner(s)</td>
          </tr>
          <tr>
            <td className="btd">
              <div className="own-row"><span className="own-l">Name</span><span className="own-v">{I('seller_name', 'Seller name', 'f1')}</span><span className="own-r">License # if Retailer: {I('seller_license', '#')}</span></div>
              <div className="own-row"><span className="own-l">Name</span><span className="own-v">{I('seller2_name', 'Co-seller', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Mailing Address</span><span className="own-v">{I('seller_address', 'Address', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">City/State/Zip</span><span className="own-v">{I('seller_city_state_zip', 'City, ST, ZIP', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Daytime Phone Number (include area code)</span><span className="own-v">{I('seller_phone', '(xxx) xxx-xxxx', 'f1')}</span></div>
            </td>
            <td className="btd">
              <div className="own-row"><span className="own-l">Name</span><span className="own-v">{I('buyer_name', 'Buyer name', 'f1')}</span><span className="own-r">License # if Retailer: {I('buyer_license', '#')}</span></div>
              <div className="own-row"><span className="own-l">Name</span><span className="own-v">{I('buyer2_name', 'Co-buyer', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Mailing Address</span><span className="own-v">{I('buyer_address', 'Address', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">City/State/Zip</span><span className="own-v">{I('buyer_city_state_zip', 'City, ST, ZIP', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Daytime Phone Number (include area code)</span><span className="own-v">{I('buyer_phone', '(xxx) xxx-xxxx', 'f1')}</span></div>
            </td>
          </tr>
          <tr>
            <td className="btd"><strong>4(c)</strong> &nbsp; Is this transaction a sale? &nbsp; Yes {C('is_sale')} &nbsp; No {C('is_sale_no')}</td>
            <td className="btd"><strong>4(d)</strong> &nbsp; Date of sale, transfer or ownership change: {I('sale_transfer_date', 'mm/dd/yyyy', 'w140')}</td>
          </tr>
        </tbody></table>

        <div className="page-footer">MHD FORM 1023 / Statement of Ownership Appl.doc &nbsp;&nbsp;&nbsp; Page 1 of 2 &nbsp;&nbsp;&nbsp; Rev. 09/19/25</div>

        {/* ════════════════════ PAGE 2 ════════════════════ */}
        <div className="page-break"></div>

        {/* Page 2 top row */}
        <table className="bt"><tbody>
          <tr>
            <td className="btd" style={{ width: '33%' }}><strong>HUD Label #:</strong> {I('page2_hud_label', 'HUD Label #', 'f1')}</td>
            <td className="btd" style={{ width: '34%' }}><strong>Serial #:</strong> {I('page2_serial', 'Serial #', 'f1')}</td>
            <td className="btd" style={{ width: '33%' }}><strong>GF# (for title co.):</strong> {I('page2_gf', 'GF#', 'f1')}</td>
          </tr>
        </tbody></table>

        {/* ══ BLOCK 5 ══ */}
        <table className="bt"><tbody>
          <tr><td className="bth">BLOCK 5: &nbsp;Right of Survivorship or Beneficiary Designation</td></tr>
          <tr><td className="btd">
            <p style={{ fontStyle: 'italic', marginBottom: 3 }}>If joint owners desire right of survivorship, check the applicable box below:</p>
            <div className="cg">{C('surv_married')} <strong>Married couple</strong> will be the only owners and agree that the ownership of the above described manufactured home shall, from this day forward, be held jointly and in the event of death, shall pass to the surviving owner.</div>
            <div className="cg">{C('surv_joint')} <strong>Joint owners</strong> are <u>other than</u> married couple, desire right of survivorship, <strong>and</strong> have attached a completed Affidavit of Fact for Right of Survivorship or other affidavits as necessary to meet the requirements of §1201.213 of the Standards Act.</div>
            <p style={{ fontStyle: 'italic', fontWeight: 700, marginTop: 4, marginBottom: 2 }}>If Beneficiary Designation is being made or changed, please check below: (THIS IS ONLY FOR PERSONAL PROPERTY)</p>
            <div className="cg">{C('surv_beneficiary')} All Owners would like to elect a Beneficiary Designation or change a current Beneficiary Designation <strong>and</strong> have attached a completed Affidavit of Fact Beneficiary Designation, Revocation or Change.</div>
          </td></tr>
        </tbody></table>

        {/* ══ BLOCK 6 ══ */}
        <table className="bt"><tbody>
          <tr><td className="bth">BLOCK 6: &nbsp;Election – Purchaser(s)/Transferee(s)/Owner(s) check one election type</td></tr>
          <tr><td className="btd">
            <p><strong>All manufactured housing is titled as Personal Property, unless elected as:</strong></p>
            <div className="cg b6-rp">{C('election_real_property')} <strong>Real Property</strong> – I (we) elect to treat this home as real property as <strong>(one box must be checked)</strong>:</div>
            <div className="b6-indent">
              <div className="cg">{C('election_own_land')} I (we) own the real property that the home is attached to. &nbsp;&nbsp;&nbsp; {C('election_lease_land')} I (we) have a qualifying long-term lease for the land that the home is attached to.</div>
              <div className="cg">{C('election_loan_holder')} The applicant or their authorized representative is the holder or servicer of the loan.</div>
            </div>
            <p className="b6-legal">I (We) understand that the home will not be considered to be real property until a certified copy of the Statement of Ownership has been filed in the real property records of the county in which the home is located AND a copy stamped &quot;Filed&quot; has been submitted to the Department.</p>
            <p className="b6-attach"><strong>Please attach a legal description of the real property to this application (Example: Exhibit A, Deed or Title Commitment).</strong></p>
            <div className="fr" style={{ marginTop: 2 }}><span className="fl">If a title company, list your file or GF #:</span>{I('election_gf_number', 'GF #', 'f1')}</div>
            <div className="cg" style={{ marginTop: 4 }}>{C('election_inventory')} <strong>Inventory</strong> – <strong><em>(FOR RETAILER USE ONLY)</em></strong> Retailer license number must be provided in Block 4b if this election is checked.</div>
          </td></tr>
        </tbody></table>

        {/* ══ BLOCK 7 ══ */}
        <table className="bt"><tbody>
          <tr><td className="bth">BLOCK 7: &nbsp;To Designate a Home as Business Use, Non-Residential, or Salvage</td></tr>
          <tr><td className="btd">
            <p>If home WILL NOT be used for residential use, indicate its designated use:</p>
            <div className="cg">{C('use_business')} <strong><em>Business Use</em></strong> (means the use of a manufactured home in conjunction with operating a business, for a purpose other than as a permanent or temporary residential dwelling)</div>
            <p className="b7-sub">Purchaser intends for a person to be present in the home for regularly scheduled work shifts of not less than eight hours each day.</p>
            <div className="cg">{C('use_non_residential')} <strong><em>Non-Residential Use Other than Business Use or Salvage</em></strong> (means use of a manufactured home for a purpose other than as a permanent or temporary residential dwelling)</div>
            <div className="cg">{C('use_salvage')} <strong><em>Salvage</em></strong> (For purposes of Chapter 1201 of the Standards Act, a manufactured home is salvaged if the home is scrapped, dismantled, or destroyed or if an insurance company pays the full insured value of the home.) A salvaged home may only be sold to a licensed Retailer (subject to inspection and approval prior to construction).</div>
          </td></tr>
        </tbody></table>

        {/* ══ BLOCK 8 ══ */}
        <table className="bt"><tbody>
          <tr><td colSpan={2} className="bth" style={{ padding: '3px 8px' }}>
            <strong>BLOCK 8(a): &nbsp;Liens:</strong> &nbsp;&nbsp;
            <span style={{ fontWeight: 400 }}>Will there be any liens on the home (other than a tax lien)? &nbsp; Yes {C('has_liens')} &nbsp; No {C('has_liens_no')} &nbsp; If yes, complete the below lien information.</span>
          </td></tr>
          <tr><td colSpan={2} className="bth" style={{ textAlign: 'center', fontWeight: 700 }}>BLOCK 8(b): &nbsp;Lien Information</td></tr>
          <tr>
            <td className="btd" style={{ width: '50%' }}>
              <div className="own-row"><span className="own-l">Date of First Lien:</span><span className="own-v">{I('lien1_date', 'mm/dd/yyyy', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Name of First Lienholder:</span><span className="own-v">{I('lien1_name', 'Name', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Mailing Address:</span><span className="own-v">{I('lien1_address', 'Address', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">City/State/Zip:</span><span className="own-v">{I('lien1_city_state_zip', 'City, ST, ZIP', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Daytime Phone:</span><span className="own-v">{I('lien1_phone', '(xxx) xxx-xxxx', 'f1')}</span></div>
            </td>
            <td className="btd" style={{ width: '50%' }}>
              <div className="own-row"><span className="own-l">Date of Second Lien:</span><span className="own-v">{I('lien2_date', 'mm/dd/yyyy', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Name of Second Lienholder:</span><span className="own-v">{I('lien2_name', 'Name', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Mailing Address:</span><span className="own-v">{I('lien2_address', 'Address', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">City/State/Zip:</span><span className="own-v">{I('lien2_city_state_zip', 'City, ST, ZIP', 'f1')}</span></div>
              <div className="own-row"><span className="own-l">Daytime Phone:</span><span className="own-v">{I('lien2_phone', '(xxx) xxx-xxxx', 'f1')}</span></div>
            </td>
          </tr>
        </tbody></table>

        {/* ══ BLOCK 9 ══ */}
        <table className="bt"><tbody>
          <tr><td colSpan={2} className="bth">BLOCK 9: &nbsp;Special Mailing Instructions</td></tr>
          <tr>
            <td className="btd" style={{ width: '40%', verticalAlign: 'middle' }}>
              <p><strong>IF</strong> a copy of a Statement of Ownership is to be mailed to anyone other than the owner or lienholder of record (such as a closing agent), please provide that mailing address here.</p>
            </td>
            <td className="btd" style={{ width: '60%' }}>
              <div className="own-row"><span className="own-l2">Name:</span><span className="own-v">{I('mailing_name', 'Name', 'f1')}</span></div>
              <div className="own-row"><span className="own-l2">Company:</span><span className="own-v">{I('mailing_company', 'Company', 'f1')}</span></div>
              <div className="own-row"><span className="own-l2">Mailing Address:</span><span className="own-v">{I('mailing_address', 'Address', 'f1')}</span></div>
              <div className="own-row"><span className="own-l2">City, State, Zip:</span><span className="own-v">{I('mailing_city_state_zip', 'City, ST, ZIP', 'f1')}</span></div>
              <div className="own-row"><span className="own-l2">Area Code/Phone:</span><span className="own-v">{I('mailing_phone', '(xxx) xxx-xxxx', 'f1')}</span></div>
              <div className="own-row"><span className="own-l2">Email:</span><span className="own-v">{I('mailing_email', 'email@example.com', 'f1')}</span></div>
            </td>
          </tr>
        </tbody></table>

        {/* ══ BLOCK 10 ══ */}
        <table className="bt"><tbody>
          <tr><td colSpan={2} className="bth" style={{ textAlign: 'center' }}>BLOCK 10: &nbsp;Signatures Required (Notarization is Optional)</td></tr>
          <tr>
            <td className="btd sig-col" style={{ width: '50%' }}>
              <p className="sig-h"><u>10(a) &nbsp;Signatures of each seller/transferor</u></p>
              <div className="sig-line"></div>
              <p className="sig-cap"><em>Signature of owner or authorized seller</em></p>
              <p className="sig-notary">Sworn and subscribed before me this ____ day of ____________, 20___</p>
              <div className="sig-line"></div>
              <p className="sig-cap"><em>Signature of Notary</em><br/><em>SEAL</em></p>
              <div className="sig-line" style={{ marginTop: 10 }}></div>
              <p className="sig-cap"><em>Signature of owner or authorized seller</em></p>
              <p className="sig-notary">Sworn and subscribed before me this ____ day of ____________, 20___</p>
              <div className="sig-line"></div>
              <p className="sig-cap"><em>Signature of Notary</em><br/><em>SEAL</em></p>
            </td>
            <td className="btd sig-col" style={{ width: '50%' }}>
              <p className="sig-h"><u>10(b) &nbsp;Signatures of each purchaser/transferee or owner</u></p>
              <div className="sig-line"></div>
              <p className="sig-cap"><em>Signature of purchaser/transferee or owner</em></p>
              <p className="sig-notary">Sworn and subscribed before me this ____ day of ____________, 20___</p>
              <div className="sig-line"></div>
              <p className="sig-cap"><em>Signature of Notary</em><br/><em>SEAL</em></p>
              <div className="sig-line" style={{ marginTop: 10 }}></div>
              <p className="sig-cap"><em>Signature of purchaser/transferee or owner</em></p>
              <p className="sig-notary">Sworn and subscribed before me this ____ day of ____________, 20___</p>
              <div className="sig-line"></div>
              <p className="sig-cap"><em>Signature of Notary</em><br/><em>SEAL</em></p>
            </td>
          </tr>
          <tr><td colSpan={2} className="bth" style={{ textAlign: 'center', fontWeight: 400 }}>10(c) &nbsp;For Lien Assignments Only</td></tr>
          <tr>
            <td className="btd sig-col">
              <div className="sig-line" style={{ marginTop: 10 }}></div>
              <p className="sig-cap"><em>Signature of authorized representative for previous lienholder</em></p>
            </td>
            <td className="btd sig-col">
              <div className="sig-line" style={{ marginTop: 10 }}></div>
              <p className="sig-cap"><em>Signature of authorized representative for new lender</em></p>
            </td>
          </tr>
        </tbody></table>

        <div className="page-footer">MHD FORM 1023 / Statement of Ownership Appl.doc &nbsp;&nbsp;&nbsp; Page 2 of 2 &nbsp;&nbsp;&nbsp; Rev. 09/19/25</div>

      </div>{/* end doc */}

      {/* ═══════════ STYLES ═══════════ */}
      <style>{`
        .taw { background: #f1f1f1; border-radius: 12px; overflow: hidden; }
        .toolbar {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 16px; background: #fff; border-bottom: 1px solid #ddd;
        }
        .badge { font-size: 11px; padding: 2px 10px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-weight: 600; }
        .tbtn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 7px;
          font-size: 12px; font-weight: 500; cursor: pointer; border: none; transition: all .15s; }
        .tpri { background: #1e1b4b; color: #c7d2fe; } .tpri:hover { background: #312e81; }
        .tsec { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; } .tsec:hover { background: #e5e7eb; }
        .tgho { background: transparent; color: #6b7280; } .tgho:hover { background: #f3f4f6; }

        /* ── Document ── */
        .doc {
          background: #fff; margin: 14px; padding: 18px 22px;
          border: 1px solid #ccc; border-radius: 2px;
          font-family: 'Times New Roman', Times, serif; font-size: 9.5px;
          color: #000; line-height: 1.35; box-shadow: 0 1px 6px rgba(0,0,0,.08);
        }

        /* Header */
        .hdr { text-align: center; margin-bottom: 4px; }
        .hdr-dept { font-size: 14px; font-weight: 700; letter-spacing: .5px; }
        .hdr-div { font-size: 12px; font-weight: 700; letter-spacing: .3px; }
        .hdr-addr { font-size: 9px; }
        .hdr-title { font-size: 15px; font-weight: 800; margin-top: 4px; border: 2px solid #000; padding: 3px 0; letter-spacing: .5px; }
        .sc { font-variant: small-caps; }

        .notice-box { border: 1.5px solid #000; padding: 4px 8px; margin: 6px 0 8px; font-size: 8.5px; }

        /* Block tables */
        .bt { width: 100%; border-collapse: collapse; margin-bottom: 0; border: 1.5px solid #000; }
        .bt + .bt { border-top: 0; }
        .bth { background: #e5e5e5; padding: 2px 8px; font-weight: 700; font-size: 10px; border: 1px solid #000; }
        .bth-sub { background: #f0f0f0; padding: 2px 8px; font-weight: 700; font-size: 9.5px; border: 1px solid #000; text-align: center; }
        .btd { padding: 5px 8px; border: 1px solid #000; vertical-align: top; }

        /* Block 1 columns */
        .b1c1, .b1c2, .b1c3 { padding: 6px 8px; border: 1px solid #000; vertical-align: top; }
        .b1h { font-weight: 700; font-size: 10px; text-align: center; margin-bottom: 2px; }
        .b1sub { font-size: 8px; text-align: center; margin-bottom: 4px; }
        .b1sec { margin-bottom: 4px; }
        .b1sh { font-size: 9px; font-weight: 600; margin-bottom: 2px; }
        .b1note { font-size: 8.5px; margin: 2px 0 0 18px; }
        .dept-grid { font-size: 9px; margin-top: 6px; }
        .dept-grid p { margin-bottom: 3px; }

        /* Checkbox groups */
        .cg { display: flex; align-items: flex-start; gap: 3px; margin-bottom: 2px; font-size: 9.5px; line-height: 1.35; }
        .cb { display: inline-block; font-size: 12px; vertical-align: middle; margin-right: 1px; }
        .ci { width: 12px; height: 12px; cursor: pointer; vertical-align: middle; margin-top: 1px; }

        /* Field row */
        .fr { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
        .fl { font-size: 9px; white-space: nowrap; min-width: 50px; }
        .fl-sm { font-size: 8.5px; }
        .f1 { flex: 1; }
        .w80 { width: 80px; }
        .w120 { width: 120px; }
        .w140 { width: 140px; }

        /* Inputs */
        .fi {
          border: none; border-bottom: 1px solid #888; font-size: 10px;
          font-family: 'Times New Roman', Times, serif; padding: 0 3px; background: #fffde7;
          outline: none; min-width: 30px; flex: 1;
        }
        .fi:focus { border-bottom-color: #1565c0; background: #e3f2fd; }
        .fv { font-size: 10px; min-height: 12px; border-bottom: 1px dotted #ccc; flex: 1; padding: 0 2px; }

        /* Inner tables */
        .inner-tbl { width: 100%; border-collapse: collapse; }
        .inner-tbl td { padding: 2px 4px; vertical-align: top; }

        /* Sections table */
        .sec-tbl { width: 100%; border-collapse: collapse; margin-top: 6px; }
        .sec-tbl th { border: 1.5px solid #000; padding: 2px 4px; font-size: 9px; background: #f0f0f0; text-align: center; }
        .sec-tbl td { border: 1.5px solid #000; padding: 2px 4px; font-size: 9.5px; text-align: center; }
        .sec-tbl .lb { font-weight: 700; text-align: left; }
        .sz { display: flex; align-items: center; justify-content: center; gap: 2px; }

        /* Block 2(b) */
        .b2b { border: 1.5px solid #000; border-top: 0; padding: 4px 8px; font-size: 9.5px; }
        .b2b-note { font-size: 8.5px; margin: 2px 0; padding-left: 20px; }

        /* Ownership rows */
        .own-row { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; border-bottom: 1px solid #ddd; padding-bottom: 2px; }
        .own-l { font-size: 9px; white-space: nowrap; min-width: 80px; }
        .own-l2 { font-size: 9px; white-space: nowrap; min-width: 100px; text-align: right; padding-right: 6px; }
        .own-v { flex: 1; }
        .own-r { font-size: 8.5px; white-space: nowrap; margin-left: auto; }

        /* Block 6 specifics */
        .b6-rp { margin-bottom: 2px; }
        .b6-indent { padding-left: 24px; margin-bottom: 3px; }
        .b6-legal { font-size: 8.5px; margin: 4px 0 2px 0; }
        .b6-attach { font-size: 9px; margin: 2px 0; }

        /* Block 7 */
        .b7-sub { font-size: 8.5px; padding-left: 24px; margin: 0 0 3px; }

        /* Signatures */
        .sig-col { padding: 6px 10px !important; }
        .sig-h { font-size: 9.5px; font-weight: 600; margin-bottom: 6px; }
        .sig-line { border-bottom: 1px solid #000; height: 22px; margin: 4px 0 2px; }
        .sig-cap { font-size: 8px; text-align: center; color: #333; }
        .sig-notary { font-size: 8.5px; margin: 6px 0 2px; font-style: italic; }

        /* Footer */
        .page-footer { margin-top: 8px; font-size: 8px; color: #555;
          display: flex; justify-content: space-between; padding: 4px 0; border-top: 1px solid #999; }

        /* Page break */
        .page-break { height: 20px; border-bottom: 2px dashed #bbb; margin: 12px 0; }

        @media print {
          .no-print { display: none !important; }
          .taw { background: white; border-radius: 0; }
          .doc { margin: 0; padding: 0; border: none; box-shadow: none; }
          .fi { border-bottom-color: #999; background: transparent; }
          .page-break { page-break-before: always; height: 0; border: none; margin: 0; }
        }
      `}</style>
    </div>
  )
}

function getPrintCSS(): string {
  return `
    .no-print{display:none!important}
    .doc{font-family:'Times New Roman',Times,serif;font-size:9px;color:#000;line-height:1.3}
    .hdr{text-align:center;margin-bottom:3px}.hdr-dept{font-size:13px;font-weight:700}.hdr-div{font-size:11px;font-weight:700}
    .hdr-addr{font-size:8px}.hdr-title{font-size:14px;font-weight:800;margin-top:3px;border:2px solid #000;padding:2px 0}
    .sc{font-variant:small-caps}.notice-box{border:1.5px solid #000;padding:3px 6px;margin:4px 0 6px;font-size:8px}
    .bt{width:100%;border-collapse:collapse;border:1.5px solid #000}.bt+.bt{border-top:0}
    .bth{background:#e5e5e5;padding:2px 6px;font-weight:700;font-size:9px;border:1px solid #000}
    .bth-sub{background:#f0f0f0;padding:2px 6px;font-weight:700;font-size:9px;border:1px solid #000;text-align:center}
    .btd{padding:4px 6px;border:1px solid #000;vertical-align:top}
    .b1c1,.b1c2,.b1c3{padding:4px 6px;border:1px solid #000;vertical-align:top}
    .b1h{font-weight:700;font-size:9px;text-align:center;margin-bottom:1px}
    .b1sub{font-size:7px;text-align:center;margin-bottom:3px}
    .b1sec{margin-bottom:3px}.b1sh{font-size:8px;font-weight:600;margin-bottom:1px}
    .b1note{font-size:8px;margin:1px 0 0 16px}.dept-grid{font-size:8px;margin-top:4px}.dept-grid p{margin-bottom:2px}
    .cg{display:flex;align-items:flex-start;gap:2px;margin-bottom:1px;font-size:9px;line-height:1.3}
    .cb{display:inline-block;font-size:11px;vertical-align:middle;margin-right:1px}
    .ci{width:11px;height:11px;vertical-align:middle;margin-top:1px}
    .fr{display:flex;align-items:center;gap:3px;margin-bottom:1px}
    .fl{font-size:8px;white-space:nowrap;min-width:40px}.fl-sm{font-size:8px}
    .f1{flex:1}.w80{width:60px}.w120{width:100px}.w140{width:120px}
    .fi{border:none;border-bottom:1px solid #999;font-size:9px;font-family:'Times New Roman';padding:0 2px;background:transparent;min-width:20px;flex:1}
    .fv{font-size:9px;min-height:10px;border-bottom:1px dotted #ccc;flex:1;padding:0 1px}
    .inner-tbl{width:100%;border-collapse:collapse}.inner-tbl td{padding:1px 3px;vertical-align:top}
    .sec-tbl{width:100%;border-collapse:collapse;margin-top:4px}
    .sec-tbl th{border:1.5px solid #000;padding:1px 3px;font-size:8px;background:#f0f0f0;text-align:center}
    .sec-tbl td{border:1.5px solid #000;padding:1px 3px;font-size:9px;text-align:center}
    .sec-tbl .lb{font-weight:700;text-align:left}
    .sz{display:flex;align-items:center;justify-content:center;gap:1px}
    .b2b{border:1.5px solid #000;border-top:0;padding:3px 6px;font-size:9px}
    .b2b-note{font-size:8px;margin:1px 0;padding-left:18px}
    .own-row{display:flex;align-items:center;gap:3px;margin-bottom:1px;border-bottom:1px solid #eee;padding-bottom:1px}
    .own-l{font-size:8px;white-space:nowrap;min-width:70px}
    .own-l2{font-size:8px;white-space:nowrap;min-width:90px;text-align:right;padding-right:4px}
    .own-v{flex:1}.own-r{font-size:8px;white-space:nowrap;margin-left:auto}
    .b6-rp{margin-bottom:1px}.b6-indent{padding-left:20px;margin-bottom:2px}
    .b6-legal{font-size:8px;margin:3px 0 1px}.b6-attach{font-size:8px;margin:1px 0}
    .b7-sub{font-size:8px;padding-left:20px;margin:0 0 2px}
    .sig-col{padding:4px 8px!important}.sig-h{font-size:9px;font-weight:600;margin-bottom:4px}
    .sig-line{border-bottom:1px solid #000;height:18px;margin:3px 0 1px}
    .sig-cap{font-size:7px;text-align:center;color:#333}
    .sig-notary{font-size:8px;margin:4px 0 1px;font-style:italic}
    .page-footer{margin-top:6px;font-size:7px;color:#555;display:flex;justify-content:space-between;padding:3px 0;border-top:1px solid #999}
    .page-break{page-break-before:always;height:0;border:none;margin:0}
  `
}

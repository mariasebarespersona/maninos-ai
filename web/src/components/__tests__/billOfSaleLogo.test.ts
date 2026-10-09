/**
 * Every generated Bill of Sale must carry the official Maninos Homes logo.
 */
import fs from 'fs'
import path from 'path'
import { TextEncoder, TextDecoder } from 'util'
import { generateSignedBillOfSalePDF, BILL_OF_SALE_LOGO_SRC } from '../BillOfSaleTemplate'

// jsdom lacks these; jsPDF's PNG decoder needs them.
Object.assign(global, { TextEncoder, TextDecoder })

const LOGO_FILE = path.join(__dirname, '../../../public', BILL_OF_SALE_LOGO_SRC)

const pdfText = async (file: File) =>
  Buffer.from(await new Promise<ArrayBuffer>((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.readAsArrayBuffer(file)
  })).toString('latin1')

describe('Bill of Sale logo', () => {
  afterEach(() => { (global as any).fetch = undefined })

  it('embeds the logo image in the generated PDF', async () => {
    const png = fs.readFileSync(LOGO_FILE)
    ;(global as any).fetch = jest.fn(async (url: string) => {
      expect(url).toBe(BILL_OF_SALE_LOGO_SRC)
      return { ok: true, status: 200, blob: async () => new Blob([png], { type: 'image/png' }) }
    })
    const file = await generateSignedBillOfSalePDF({ seller_name: 'Juan Perez', buyer_name: 'Maninos Homes LLC' })
    const text = await pdfText(file)
    expect(text).toMatch(/\/Subtype \/Image/)
    if (process.env.BOS_PDF_OUT) fs.writeFileSync(process.env.BOS_PDF_OUT, Buffer.from(text, 'latin1'))
  })

  it('refuses to generate a Bill of Sale without the logo', async () => {
    ;(global as any).fetch = jest.fn(async () => ({ ok: false, status: 404 }))
    await expect(generateSignedBillOfSalePDF({})).rejects.toThrow(/logo/)
  })
})

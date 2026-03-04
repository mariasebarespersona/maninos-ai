import { getMissingBlock2AFields, type Block2AValidationData } from '@/lib/titleApplicationValidation'

function makeBaseData(): Block2AValidationData {
  return {
    manufacturer: 'BRIGADIER HOMES A U.S. HOME COMPANY', manufacturer_address: '1001 SOUTH LOOP 340', manufacturer_city_state_zip: 'WACO, TX 76710',
    make: 'CENTURION', date_of_manufacture: '2005', year: '',
    total_sqft: '700', wind_zone: 'II',
    section1_label: 'TEX0012345', section1_serial: 'C3208', section1_width: '14', section1_length: '50',
    has_hud_label: true,
  }
}

describe('getMissingBlock2AFields', () => {
  it('returns empty for complete block 2a', () => {
    const data = makeBaseData()
    expect(getMissingBlock2AFields(data)).toEqual([])
  })

  it('returns missing fields when mandatory data is absent', () => {
    const data = makeBaseData()
    data.manufacturer_address = ''
    data.section1_serial = ''
    const missing = getMissingBlock2AFields(data)
    expect(missing).toContain('Address')
    expect(missing).toContain('Section 1 Complete Serial Number')
  })

  it('requires section label when has_hud_label is true', () => {
    const data = makeBaseData()
    data.section1_label = ''
    data.has_hud_label = true
    data.no_hud_label = false
    expect(getMissingBlock2AFields(data)).toContain('Section 1 Label/Seal Number')
  })

  it('does not require section label when no_hud_label is selected', () => {
    const data = makeBaseData()
    data.section1_label = ''
    data.has_hud_label = false
    data.no_hud_label = true
    expect(getMissingBlock2AFields(data)).not.toContain('Section 1 Label/Seal Number')
  })
})



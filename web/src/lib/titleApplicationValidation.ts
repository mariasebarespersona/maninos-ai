export interface Block2AValidationData {
  manufacturer: string
  manufacturer_address: string
  manufacturer_city_state_zip: string
  make: string
  date_of_manufacture: string
  year: string
  total_sqft: string
  wind_zone: string
  section1_label: string
  section1_serial: string
  section1_width: string
  section1_length: string
  has_hud_label: boolean
  no_hud_label?: boolean
}

const BLOCK2A_REQUIRED_LABELS: Array<{ key: keyof Block2AValidationData; label: string }> = [
  { key: 'manufacturer', label: 'Manufacturer Name' },
  { key: 'manufacturer_address', label: 'Address' },
  { key: 'manufacturer_city_state_zip', label: 'City, State, Zip' },
  { key: 'make', label: 'Model' },
  { key: 'total_sqft', label: 'Total Square Feet' },
  { key: 'wind_zone', label: 'Wind Zone' },
  { key: 'section1_serial', label: 'Section 1 Complete Serial Number' },
  { key: 'section1_width', label: 'Section 1 Size Width' },
  { key: 'section1_length', label: 'Section 1 Size Length' },
]

export function getMissingBlock2AFields(data: Block2AValidationData): string[] {
  const missing: string[] = []
  for (const item of BLOCK2A_REQUIRED_LABELS) {
    const raw = (data[item.key] ?? '') as string | boolean
    if (!String(raw).trim()) missing.push(item.label)
  }
  if (!String(data.date_of_manufacture || '').trim() && !String(data.year || '').trim()) {
    missing.push('Date of Manufacture')
  }
  if (data.has_hud_label && !data.no_hud_label && !String(data.section1_label || '').trim()) {
    missing.push('Section 1 Label/Seal Number')
  }
  return missing
}



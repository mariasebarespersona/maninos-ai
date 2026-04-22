import React from 'react'

type Props = {
  children: React.ReactNode
  className?: string
  hint?: boolean
}

export function ResponsiveTable({ children, className = '', hint = true }: Props) {
  return (
    <div className={`table-scroll ${hint ? 'table-scroll-hint' : ''} ${className}`}>
      {children}
    </div>
  )
}

export default ResponsiveTable

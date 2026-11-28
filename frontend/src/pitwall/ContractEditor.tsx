import type { ReactNode } from 'react'
import { ContractClause, ContractComparison, ContractFrame } from './v2/Contracts'

type Props = {
  type: string
  title: string
  eyebrow: string
  person?: { id: string; name: string }
  partner?: string
  subtitle?: string
  clause: string
  children: ReactNode
  comparison?: [string, string, string][]
}

export function ContractEditor({
  type,
  title,
  eyebrow,
  person,
  partner,
  subtitle,
  clause,
  comparison,
  children,
}: Props) {
  return (
    <ContractFrame
      type={type}
      title={title}
      eyebrow={eyebrow}
      person={person}
      counterparty={partner}
      subtitle={subtitle}
      aside={comparison && <ContractComparison rows={comparison} />}
      footer={null}
    >
      <ContractClause number={1} title={clause}>
        {children}
      </ContractClause>
    </ContractFrame>
  )
}

"use client"

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { InstanceTableRow } from "./instance-table-row"
import { useT } from "@/stores/language-store"
import type { InstanceResponse } from "@/types/instance"

interface InstanceTableProps {
  instances: InstanceResponse[]
  canManage: boolean
  onDetail: (instance: InstanceResponse) => void
  onEdit: (instance: InstanceResponse) => void
  onDelete: (instance: InstanceResponse) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onRestart: (id: string) => void
}

const headClass =
  "text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/60"

export function InstanceTable({
  instances,
  canManage,
  onDetail,
  onEdit,
  onDelete,
  onStart,
  onStop,
  onRestart,
}: InstanceTableProps) {
  const t = useT()
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b-0">
          <TableHead className={`${headClass} pl-4`}>{t('instance.tableName')}</TableHead>
          <TableHead className={`${headClass} w-24`}>{t('instance.tableStatus')}</TableHead>
          <TableHead className={`${headClass} text-center w-20`}>Agents</TableHead>
          <TableHead className={`${headClass} text-center w-20`}>{t('instance.tableSessions')}</TableHead>
          <TableHead className={`${headClass} text-center w-24`}>Channels</TableHead>
          <TableHead className={`${headClass} w-24`}>{t('instance.tableVersion')}</TableHead>
          <TableHead className={`${headClass} w-28`}>{t('instance.tableLastCheck')}</TableHead>
          <TableHead className={`${headClass} text-center w-14`}>{t('instance.tableConsole')}</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {instances.map((instance, index) => (
          <InstanceTableRow
            key={instance.id}
            instance={instance}
            index={index}
            canManage={canManage}
            onDetail={onDetail}
            onEdit={onEdit}
            onDelete={onDelete}
            onStart={onStart}
            onStop={onStop}
            onRestart={onRestart}
          />
        ))}
      </TableBody>
    </Table>
  )
}

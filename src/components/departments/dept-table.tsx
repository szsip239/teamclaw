"use client"

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DeptTableRow } from "./dept-table-row"
import type { DepartmentResponse } from "@/types/department"
import { useT } from "@/stores/language-store"

interface DeptTableProps {
  departments: DepartmentResponse[]
  canManage: boolean
  onDetail: (dept: DepartmentResponse) => void
  onEdit: (dept: DepartmentResponse) => void
  onDelete: (dept: DepartmentResponse) => void
}

const headClass =
  "text-[11px] font-semibold tracking-widest uppercase text-muted-foreground/60"

export function DeptTable({
  departments,
  canManage,
  onDetail,
  onEdit,
  onDelete,
}: DeptTableProps) {
  const t = useT()

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-b-0">
          <TableHead className={`${headClass} pl-4`}>{t('dept.tableName')}</TableHead>
          <TableHead className={headClass}>{t('dept.tableDesc')}</TableHead>
          <TableHead className={`${headClass} text-center w-24`}>
            {t('dept.tableMemberCount')}
          </TableHead>
          <TableHead className={`${headClass} text-center w-28`}>
            {t('dept.tableAccessCount')}
          </TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {departments.map((dept, index) => (
          <DeptTableRow
            key={dept.id}
            department={dept}
            index={index}
            canManage={canManage}
            onDetail={onDetail}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </TableBody>
    </Table>
  )
}

"use client"

import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useT } from "@/stores/language-store"

export function DeptTableSkeleton() {
  const t = useT()

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('dept.tableName')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('dept.tableDesc')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70 text-center">
            {t('dept.tableMemberCount')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70 text-center">
            {t('dept.tableAccessCount')}
          </TableHead>
          <TableHead className="w-[60px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 4 }).map((_, i) => (
          <TableRow key={i} className="border-b">
            <TableCell className="py-3.5">
              <Skeleton className="h-3.5 w-24 rounded" />
            </TableCell>
            <TableCell className="py-3.5">
              <Skeleton className="h-3.5 w-40 rounded" />
            </TableCell>
            <TableCell className="py-3.5 text-center">
              <Skeleton className="mx-auto h-3.5 w-10 rounded" />
            </TableCell>
            <TableCell className="py-3.5 text-center">
              <Skeleton className="mx-auto h-3.5 w-10 rounded" />
            </TableCell>
            <TableCell className="py-3.5">
              <Skeleton className="size-7 rounded" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

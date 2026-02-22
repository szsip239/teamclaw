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

export function InstanceTableSkeleton() {
  const t = useT()
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('instance.tableName')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('instance.tableStatus')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('instance.tableConnectionAddr')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('instance.tableVersion')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('instance.tableLastCheck')}
          </TableHead>
          <TableHead className="w-[60px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 4 }).map((_, i) => (
          <TableRow key={i} className="border-b">
            <TableCell className="py-3.5">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-3.5 w-28 rounded" />
                <Skeleton className="h-3 w-40 rounded opacity-50" />
              </div>
            </TableCell>
            <TableCell className="py-3.5">
              <Skeleton className="h-5 w-16 rounded-full" />
            </TableCell>
            <TableCell className="py-3.5">
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-3 rounded" />
                <Skeleton className="h-3.5 w-36 rounded" />
              </div>
            </TableCell>
            <TableCell className="py-3.5">
              <Skeleton className="h-3.5 w-12 rounded" />
            </TableCell>
            <TableCell className="py-3.5">
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-3 rounded" />
                <Skeleton className="h-3.5 w-16 rounded" />
              </div>
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

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

export function UserTableSkeleton() {
  const t = useT()

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('user.tableUser')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('user.tableEmail')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('user.tableRole')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('user.tableDepartment')}
          </TableHead>
          <TableHead className="text-xs font-medium tracking-wide uppercase text-muted-foreground/70">
            {t('user.tableStatus')}
          </TableHead>
          <TableHead className="w-[60px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i} className="border-b">
            <TableCell className="py-3.5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-3.5 w-20 rounded" />
              </div>
            </TableCell>
            <TableCell className="py-3.5">
              <Skeleton className="h-3.5 w-36 rounded" />
            </TableCell>
            <TableCell className="py-3.5">
              <Skeleton className="h-5 w-20 rounded-full" />
            </TableCell>
            <TableCell className="py-3.5">
              <Skeleton className="h-3.5 w-16 rounded" />
            </TableCell>
            <TableCell className="py-3.5">
              <div className="flex items-center gap-1.5">
                <Skeleton className="size-2 rounded-full" />
                <Skeleton className="h-3.5 w-10 rounded" />
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

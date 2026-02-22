"use client"

import { motion } from "motion/react"
import { TableCell } from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { MoreHorizontal, Eye, Pencil, Trash2, Users, Shield } from "lucide-react"
import type { DepartmentResponse } from "@/types/department"
import { useT } from "@/stores/language-store"

interface DeptTableRowProps {
  department: DepartmentResponse
  index: number
  canManage: boolean
  onDetail: (dept: DepartmentResponse) => void
  onEdit: (dept: DepartmentResponse) => void
  onDelete: (dept: DepartmentResponse) => void
}

export function DeptTableRow({
  department,
  index,
  canManage,
  onDetail,
  onEdit,
  onDelete,
}: DeptTableRowProps) {
  const t = useT()

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
      className="group border-b transition-colors hover:bg-muted/40 cursor-pointer"
      onClick={() => onDetail(department)}
    >
      {/* Name */}
      <TableCell className="py-3 pl-4">
        <span className="text-sm font-medium leading-none tracking-tight">
          {department.name}
        </span>
      </TableCell>

      {/* Description */}
      <TableCell className="py-3">
        <span className="text-muted-foreground/70 text-[13px] line-clamp-1">
          {department.description || "—"}
        </span>
      </TableCell>

      {/* User count */}
      <TableCell className="py-3 text-center">
        <div className="inline-flex items-center gap-1 text-sm tabular-nums">
          <Users className="size-3.5 text-muted-foreground/50" />
          <span className="font-medium">{department.userCount}</span>
        </div>
      </TableCell>

      {/* Access count */}
      <TableCell className="py-3 text-center">
        <div className="inline-flex items-center gap-1 text-sm tabular-nums">
          <Shield className="size-3.5 text-muted-foreground/50" />
          <span className="font-medium">{department.accessCount}</span>
        </div>
      </TableCell>

      {/* Actions */}
      <TableCell className="py-3 pr-2" onClick={(e) => e.stopPropagation()}>
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onDetail(department)}>
                <Eye className="mr-2 size-4" />
                {t('dept.viewDetail')}
              </DropdownMenuItem>
              {canManage && (
                <>
                  <DropdownMenuItem onClick={() => onEdit(department)}>
                    <Pencil className="mr-2 size-4" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(department)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 size-4" />
                    {t('delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </motion.tr>
  )
}

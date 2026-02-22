"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  KeyRound,
  Globe,
  Code,
  Clock,
  AlertCircle,
  User,
} from "lucide-react"
import { API_TYPES } from "@/lib/resources/providers"
import { useT } from "@/stores/language-store"
import type {
  ResourceDetail,
  ResourceConfig,
} from "@/types/resource"

interface ResourceConfigPanelProps {
  resource: ResourceDetail
}

export function ResourceConfigPanel({ resource }: ResourceConfigPanelProps) {
  const t = useT()
  const config = resource.config as ResourceConfig | null

  const apiTypeLabel = config?.apiType
    ? API_TYPES.find((t) => t.value === config.apiType)?.label ?? config.apiType
    : undefined

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Credentials info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t('resource.credentialInfo')}</CardTitle>
          <CardDescription>{t('resource.credentialDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow icon={KeyRound} label="API Key" value={resource.maskedKey} mono />
          {config?.envVarName && (
            <InfoRow icon={Code} label={t('resource.envVar')} value={config.envVarName} mono />
          )}
          {config?.baseUrl && (
            <InfoRow icon={Globe} label={t('resource.apiUrl')} value={config.baseUrl} mono />
          )}
          {apiTypeLabel && (
            <InfoRow icon={Code} label={t('resource.apiType')} value={apiTypeLabel} />
          )}
        </CardContent>
      </Card>

      {/* Status info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{t('resource.statusInfo')}</CardTitle>
          <CardDescription>{t('resource.statusDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InfoRow
            icon={Clock}
            label={t('resource.lastTest')}
            value={
              resource.lastTestedAt
                ? new Date(resource.lastTestedAt).toLocaleString()
                : t('resource.notTested')
            }
          />
          {resource.lastTestError && (
            <InfoRow
              icon={AlertCircle}
              label={t('resource.errorInfo')}
              value={resource.lastTestError}
              className="text-destructive"
            />
          )}
          <InfoRow icon={User} label={t('resource.creatorLabel')} value={resource.createdByName} />
          <InfoRow
            icon={Clock}
            label={t('resource.createdAtLabel')}
            value={new Date(resource.createdAt).toLocaleString()}
          />
        </CardContent>
      </Card>

      {/* Description */}
      {resource.description && (
        <Card className="sm:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{t('description')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {resource.description}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
  className,
}: {
  icon: typeof KeyRound
  label: string
  value: string
  mono?: boolean
  className?: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span
        className={`truncate ${mono ? "font-mono text-xs" : ""} ${className ?? ""}`}
      >
        {value}
      </span>
    </div>
  )
}

"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import {
  FolderOpen,
  Cpu,
  Shield,
  Users,
  MessageSquare,
  Star,
  Wrench,
  Hash,
  ExternalLink,
} from "lucide-react"
import { useT } from "@/stores/language-store"
import type { AgentDetail } from "@/types/agent"

interface AgentOverviewTabProps {
  agent: AgentDetail
  canManage: boolean
  instanceId: string
}

export function AgentOverviewTab({ agent, canManage, instanceId }: AgentOverviewTabProps) {
  const t = useT()
  const config = agent.config
  const defaults = agent.defaults

  const infoItems = [
    {
      icon: <Hash className="size-3.5" />,
      label: "Agent ID",
      value: agent.id,
      mono: true,
    },
    {
      icon: <FolderOpen className="size-3.5" />,
      label: t('agent.workspaceLabel'),
      value: agent.workspace,
      mono: true,
    },
  ]

  return (
    <div className="space-y-3">
      {/* Basic info */}
      <div className="space-y-1">
        {infoItems.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: i * 0.04 }}
            className="flex items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-muted/50"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {item.icon}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {item.label}
              </span>
              <div
                className={`truncate text-sm leading-tight ${item.mono ? "font-mono text-xs" : ""}`}
              >
                {item.value}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <Separator />

      {/* Config cards */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="grid grid-cols-2 gap-3"
      >
        {/* Models card */}
        <ConfigCard icon={<Cpu className="size-3.5" />} title={t('agent.modelSection')}>
          <ConfigValue
            label={t('agent.primaryModelLabel')}
            value={config.models?.primary}
            fallback={defaults.models?.primary}
            defaultLabel={t('agent.defaultValue')}
            mono
          />
          <ConfigValue
            label={t('agent.thinkingLabel', { mode: '' }).replace(/[:\s]*$/, '')}
            value={config.models?.thinking}
            fallback={defaults.models?.thinking}
            defaultLabel={t('agent.defaultValue')}
          />
          <ConfigValue
            label={t('agent.subAgentModel')}
            value={config.subagents?.model}
            fallback={defaults.subagents?.model}
            defaultLabel={t('agent.defaultValue')}
            mono
          />
          <ConfigValue
            label={t('agent.subAgentConcurrency')}
            value={config.subagents?.maxConcurrent != null ? String(config.subagents.maxConcurrent) : undefined}
            fallback={defaults.subagents?.maxConcurrent != null ? String(defaults.subagents.maxConcurrent) : undefined}
            defaultLabel={t('agent.defaultValue')}
          />
        </ConfigCard>

        {/* Sandbox card */}
        <ConfigCard icon={<Shield className="size-3.5" />} title={t('agent.sandboxSection')}>
          <ConfigValue
            label={t('agent.sandboxModeLabel')}
            value={config.sandbox?.mode}
            fallback={defaults.sandbox?.mode}
            defaultLabel={t('agent.defaultValue')}
          />
          <ConfigValue
            label={t('agent.sandboxScope')}
            value={config.sandbox?.scope}
            fallback={defaults.sandbox?.scope}
            defaultLabel={t('agent.defaultValue')}
          />
          <ConfigValue
            label={t('agent.workspaceLabel')}
            value={config.sandbox?.workspaceAccess}
            fallback={defaults.sandbox?.workspaceAccess}
            defaultLabel={t('agent.defaultValue')}
          />
        </ConfigCard>

        {/* Tools card */}
        <ConfigCard icon={<Wrench className="size-3.5" />} title={t('agent.toolsSection')}>
          <ToolChips
            label={t('agent.allowTools')}
            tools={config.tools?.allow}
            fallbackTools={defaults.tools?.allow}
            defaultLabel={t('agent.defaultValue')}
            notConfigured={t('agent.notConfigured')}
          />
          <ToolChips
            label={t('agent.denyTools')}
            tools={config.tools?.deny}
            fallbackTools={defaults.tools?.deny}
            defaultLabel={t('agent.defaultValue')}
            notConfigured={t('agent.notConfigured')}
          />
        </ConfigCard>

        {/* Session card */}
        <ConfigCard icon={<MessageSquare className="size-3.5" />} title={t('agent.sessionSection')}>
          <ConfigValue
            label={t('agent.dmScopeLabel')}
            value={config.session?.dmScope}
            fallback={defaults.session?.dmScope}
            defaultLabel={t('agent.defaultValue')}
          />
          <ConfigValue
            label={t('agent.bindingsCount', { n: '' }).replace(/[:\s]*$/, '')}
            value={config.bindings ? String(config.bindings.length) : undefined}
            fallback={undefined}
            defaultLabel={t('agent.defaultValue')}
          />
        </ConfigCard>
      </motion.div>

      <Separator />

      {/* Tags section */}
      <div>
        <div className="mb-3 flex items-center gap-2 px-1">
          <Wrench className="size-3.5 text-muted-foreground" />
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            {t('agent.featureTags')}
          </h4>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="flex flex-wrap gap-2 px-1"
        >
          {agent.isDefault && (
            <Badge
              variant="outline"
              className="gap-1 text-amber-600 border-amber-500/20 dark:text-amber-400"
            >
              <Star className="size-3 fill-current" />
              {t('agent.isDefaultAgent')}
            </Badge>
          )}
          {config.models?.thinking && config.models.thinking !== "off" && (
            <Badge variant="secondary" className="gap-1">
              <Cpu className="size-3" />
              {t('agent.thinkingLabel', { mode: config.models.thinking })}
            </Badge>
          )}
          {config.sandbox?.workspaceAccess && (
            <Badge variant="secondary" className="gap-1">
              <FolderOpen className="size-3" />
              workspace: {config.sandbox.workspaceAccess}
            </Badge>
          )}
          {config.tools?.allow && config.tools.allow.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Wrench className="size-3" />
              {t('agent.allowToolsCount', { n: config.tools.allow.length })}
            </Badge>
          )}
          {config.tools?.deny && config.tools.deny.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Wrench className="size-3" />
              {t('agent.denyToolsCount', { n: config.tools.deny.length })}
            </Badge>
          )}
          {config.bindings && config.bindings.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              {t('agent.bindingsCount', { n: config.bindings.length })}
            </Badge>
          )}
        </motion.div>
      </div>

      {/* Edit in config editor link */}
      {canManage && (
        <>
          <Separator />
          <div className="flex justify-center px-1 pb-1">
            <Link
              href={`/instances/${instanceId}/config`}
              className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline"
            >
              {t('agent.editInConfigEditor')}
              <ExternalLink className="size-3" />
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────── */

function ConfigCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5">
        <div className="text-muted-foreground">{icon}</div>
        <h4 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {title}
        </h4>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function ConfigValue({
  label,
  value,
  fallback,
  defaultLabel,
  mono,
}: {
  label: string
  value: string | undefined
  fallback: string | undefined
  defaultLabel: string
  mono?: boolean
}) {
  const resolved = value ?? fallback
  const isDefault = !value && !!fallback

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        {isDefault && (
          <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
            {defaultLabel}
          </Badge>
        )}
        <span
          className={`truncate text-[12px] ${mono ? "font-mono" : ""} ${isDefault ? "text-muted-foreground" : ""}`}
        >
          {resolved || "—"}
        </span>
      </div>
    </div>
  )
}

function ToolChips({
  label,
  tools,
  fallbackTools,
  defaultLabel,
  notConfigured,
}: {
  label: string
  tools: string[] | undefined
  fallbackTools: string[] | undefined
  defaultLabel: string
  notConfigured: string
}) {
  const resolved = tools ?? fallbackTools
  const isDefault = !tools && !!fallbackTools

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] text-muted-foreground">{label}</span>
        {isDefault && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
            {defaultLabel}
          </Badge>
        )}
      </div>
      {resolved && resolved.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {resolved.map((tool) => (
            <Badge
              key={tool}
              variant="secondary"
              className={`font-mono text-[10px] px-1.5 py-0 ${isDefault ? "opacity-60" : ""}`}
            >
              {tool}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-[11px] text-muted-foreground/60">{notConfigured}</span>
      )}
    </div>
  )
}

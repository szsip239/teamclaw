"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Trash2, Server, Bot, ArrowUpCircle } from "lucide-react"
import { toast } from "sonner"
import { useT } from "@/stores/language-store"
import {
  useSkillInstallations,
  useUninstallSkill,
  useSkillCheckUpgrade,
  useInstallSkill,
} from "@/hooks/use-skills"

interface SkillInstallationsTabProps {
  skillId: string
  canEdit: boolean
}

export function SkillInstallationsTab({ skillId, canEdit }: SkillInstallationsTabProps) {
  const t = useT()
  const { data, isLoading } = useSkillInstallations(skillId)
  const { data: upgradeData } = useSkillCheckUpgrade(skillId)
  const uninstallSkill = useUninstallSkill(skillId)
  const installSkill = useInstallSkill(skillId)

  const installations = data?.installations ?? []
  const outdatedSet = new Set(
    upgradeData?.outdated?.map(
      (o) => `${o.instanceId}:${o.agentId}:${o.installPath}`,
    ) ?? [],
  )

  async function handleUninstall(
    instanceId: string,
    agentId: string,
    installPath: string,
    instanceName: string,
  ) {
    try {
      await uninstallSkill.mutateAsync({ instanceId, agentId, installPath: installPath as 'workspace' | 'global' })
      toast.success(t('skill.uninstalledMsg', { name: instanceName }))
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('skill.uninstallFailed')
      toast.error(message)
    }
  }

  async function handleUpgrade(
    instanceId: string,
    agentId: string,
    installPath: string,
    instanceName: string,
  ) {
    try {
      await installSkill.mutateAsync({
        instanceId,
        agentId,
        installPath: installPath as 'workspace' | 'global',
      })
      toast.success(t('skill.upgradedMsg', { name: instanceName }))
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('skill.upgradeFailed')
      toast.error(message)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (installations.length === 0) {
    return (
      <div className="py-8 text-center text-[13px] text-muted-foreground">
        {t('skill.notInstalledYet')}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {upgradeData && upgradeData.upgradeableCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          {t('skill.upgradeAvailable', { n: upgradeData.upgradeableCount, version: upgradeData.currentVersion })}
        </div>
      )}
      {installations.map((inst) => {
        const isOutdated = outdatedSet.has(
          `${inst.instanceId}:${inst.agentId}:${inst.installPath}`,
        )
        return (
          <div
            key={inst.id}
            className={`flex items-center justify-between rounded-lg border p-3 ${
              isOutdated ? "border-amber-200 dark:border-amber-800" : ""
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[13px]">
                <span className="flex items-center gap-1">
                  <Server className="size-3 text-muted-foreground" />
                  <span className="font-medium">{inst.instanceName}</span>
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="flex items-center gap-1">
                  <Bot className="size-3 text-muted-foreground" />
                  <span className="font-medium">{inst.agentId}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Badge
                  variant="secondary"
                  className={`px-1.5 py-0 text-[10px] ${
                    isOutdated
                      ? "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                      : ""
                  }`}
                >
                  v{inst.installedVersion}
                  {isOutdated && ` → v${upgradeData?.currentVersion}`}
                </Badge>
                <span>{inst.installPath === "global" ? t('skill.installGlobal') : t('skill.installWorkspace')}</span>
                <span>·</span>
                <span>by {inst.installedByName}</span>
                <span>·</span>
                <span>{new Date(inst.installedAt).toLocaleDateString("zh-CN")}</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {isOutdated && (
                <Button
                  variant="outline"
                  size="icon"
                  className="size-7 text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
                  disabled={installSkill.isPending}
                  onClick={() =>
                    handleUpgrade(inst.instanceId, inst.agentId, inst.installPath, inst.instanceName)
                  }
                  title={t('upgrade')}
                >
                  {installSkill.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="size-3.5" />
                  )}
                </Button>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive"
                  disabled={uninstallSkill.isPending}
                  onClick={() =>
                    handleUninstall(inst.instanceId, inst.agentId, inst.installPath, inst.instanceName)
                  }
                  title={t('uninstall')}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

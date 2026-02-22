"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LOGO_SRC } from "@/lib/logo"
import {
  LayoutDashboard,
  MessageSquare,
  Server,
  Bot,
  Puzzle,
  Users,
  Building2,
  KeyRound,
  ScrollText,
  LogOut,
  UserCircle,
  ChevronsUpDown,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const t = useT()

  const navGroups = [
    {
      label: t('nav.workspace'),
      items: [
        { title: t('nav.dashboard'), icon: LayoutDashboard, href: "/" },
        { title: t('nav.chat'), icon: MessageSquare, href: "/chat" },
      ],
    },
    {
      label: t('nav.management'),
      items: [
        { title: t('nav.instances'), icon: Server, href: "/instances" },
        { title: t('nav.agents'), icon: Bot, href: "/agents" },
        { title: t('nav.skills'), icon: Puzzle, href: "/skills" },
      ],
    },
    {
      label: t('nav.organization'),
      items: [
        { title: t('nav.users'), icon: Users, href: "/users" },
        { title: t('nav.departments'), icon: Building2, href: "/departments" },
      ],
    },
    {
      label: t('nav.system'),
      items: [
        { title: t('nav.resources'), icon: KeyRound, href: "/resources" },
        { title: t('nav.logs'), icon: ScrollText, href: "/logs" },
      ],
    },
  ]

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U"

  async function handleLogout() {
    try {
      await logout()
      router.push("/login")
    } catch {
      toast.error(t('nav.logoutFailed'))
    }
  }

  return (
    <Sidebar collapsible="icon">
      {/* Header */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <div className="flex size-8 items-center justify-center">
                  <img src={LOGO_SRC} alt="TeamClaw" className="size-6 rounded-md object-cover" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">
                    TeamClaw
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {t('nav.subtitle')}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      {/* Navigation */}
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={
                        item.href === "/"
                          ? pathname === "/"
                          : pathname === item.href || pathname.startsWith(item.href + "/")
                      }
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* Footer - User */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar size="sm">
                    {user?.avatar && <AvatarImage src={user.avatar} />}
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">
                      {user?.name ?? t('nav.user')}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {user?.email ?? ""}
                    </span>
                  </div>
                  <ChevronsUpDown className="text-muted-foreground ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                side="top"
                align="start"
                sideOffset={8}
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">
                    {user?.name ?? t('nav.user')}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {user?.email ?? ""}
                  </p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <UserCircle className="mr-2 size-4" />
                  {t('nav.profile')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="mr-2 size-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

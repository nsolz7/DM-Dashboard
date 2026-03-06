"use client";

import { useState, type ReactNode } from "react";

import { NotificationsProvider } from "@/components/notifications/NotificationsProvider";
import { CampaignProvider } from "@/components/providers/CampaignProvider";
import { AppFooter } from "@/components/shell/AppFooter";
import { AppHeader } from "@/components/shell/AppHeader";
import { SideNav } from "@/components/shell/SideNav";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(true);

  return (
    <CampaignProvider>
      <NotificationsProvider>
        <div className="grid h-screen overflow-hidden grid-rows-[68px_minmax(0,1fr)_56px]">
          <AppHeader isNavOpen={navOpen} onToggleNav={() => setNavOpen((current) => !current)} />
          <div className="flex min-h-0 overflow-hidden">
            <SideNav isOpen={navOpen} onToggle={() => setNavOpen((current) => !current)} />
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</main>
          </div>
          <AppFooter />
        </div>
      </NotificationsProvider>
    </CampaignProvider>
  );
}

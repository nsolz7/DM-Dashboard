"use client";

import { faBars, faBell, faBookOpen, faHouse, faMap, faSackDollar, faSliders, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";

import { PartyQuickView } from "@/components/shell/PartyQuickView";
import { LogoutButton } from "@/components/shell/LogoutButton";

interface SideNavProps {
  isOpen: boolean;
  onToggle: () => void;
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: faHouse },
  { href: "/party", label: "Party", icon: faUsers },
  { href: "/scenario", label: "Scenario", icon: faMap },
  { href: "/loot", label: "Loot", icon: faSackDollar },
  { href: "/notifications", label: "Notifications", icon: faBell },
  { href: "/compendium", label: "Compendium", icon: faBookOpen },
  { href: "/settings", label: "Settings", icon: faSliders }
];

export function SideNav({ isOpen, onToggle }: SideNavProps) {
  if (!isOpen) {
    return (
      <aside className="hidden h-full w-[84px] shrink-0 overflow-hidden border-r-2 border-crt-border bg-crt-panel-2 p-3 md:block">
        <button
          className="flex h-12 w-full items-center justify-center border-2 border-crt-border bg-crt-panel text-xs font-bold uppercase tracking-[0.25em] text-crt-text"
          aria-label="Open navigation"
          onClick={onToggle}
          type="button"
        >
          <FontAwesomeIcon fixedWidth icon={faBars} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="fixed left-0 top-[68px] bottom-[56px] z-20 flex w-[88vw] max-w-[320px] flex-col overflow-hidden border-r-2 border-crt-border bg-crt-panel-2 md:static md:h-full md:w-[320px] md:shrink-0">
      <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-crt-muted">Navigation</p>
          <button
            className="inline-flex h-9 w-9 items-center justify-center border-2 border-crt-border bg-crt-panel text-xs font-bold text-crt-text transition hover:border-crt-accent"
            aria-label="Close navigation"
            onClick={onToggle}
            type="button"
          >
            <FontAwesomeIcon fixedWidth icon={faXmark} />
          </button>
        </div>
        <PartyQuickView />
        <div className="flex-1" />
        <nav className="space-y-2">
          {navLinks.map((link) => (
            <Link
              className="flex items-center gap-2 border-2 border-crt-border bg-crt-panel px-3 py-3 text-xs font-bold uppercase tracking-[0.22em] text-crt-text transition hover:border-crt-accent"
              href={link.href}
              key={link.href}
            >
              <FontAwesomeIcon className="text-[12px] text-crt-accent" fixedWidth icon={link.icon} />
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex h-[72px] items-center justify-between gap-3 border-t-2 border-crt-border px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold uppercase tracking-[0.14em] text-crt-text">DM Console</p>
          <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-crt-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-crt-accent" />
            <span>online</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center border-2 border-crt-border bg-crt-panel text-xs font-bold text-crt-text">
            DM
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}

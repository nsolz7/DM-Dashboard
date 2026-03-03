import { CampaignDropdown } from "@/components/shell/CampaignDropdown";

interface AppHeaderProps {
  isNavOpen: boolean;
  onToggleNav: () => void;
}

export function AppHeader({ isNavOpen, onToggleNav }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between gap-4 border-b-2 border-crt-border bg-crt-bg/95 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <button
          className="inline-flex h-10 w-10 items-center justify-center border-2 border-crt-border bg-crt-panel text-[10px] font-bold uppercase tracking-[0.18em] text-crt-text md:hidden"
          onClick={onToggleNav}
          type="button"
        >
          {isNavOpen ? "X" : "Nav"}
        </button>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-crt-accent">Septagon</p>
          <h1 className="text-lg font-bold uppercase tracking-[0.16em] text-crt-text">Dungeon Master Dashboard</h1>
        </div>
      </div>
      <CampaignDropdown />
    </header>
  );
}

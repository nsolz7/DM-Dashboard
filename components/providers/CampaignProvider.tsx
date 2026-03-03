"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { LoadingPanel } from "@/components/shared/LoadingPanel";
import {
  clearSelectedCampaignIdInBrowser,
  getSelectedCampaignIdFromBrowser,
  routeNeedsCampaign,
  setSelectedCampaignIdInBrowser
} from "@/lib/campaignSelection";

interface CampaignContextValue {
  campaignId: string;
  selectCampaign: (campaignId: string) => void;
  clearCampaign: () => void;
}

const CampaignContext = createContext<CampaignContextValue | null>(null);

interface CampaignProviderProps {
  children: ReactNode;
}

export function CampaignProvider({ children }: CampaignProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const selectedCampaignId = getSelectedCampaignIdFromBrowser();

    if (!selectedCampaignId) {
      if (routeNeedsCampaign(pathname)) {
        router.replace("/campaigns");
      }

      setHydrated(true);
      return;
    }

    setCampaignId(selectedCampaignId);
    setHydrated(true);
  }, [pathname, router]);

  const value = useMemo<CampaignContextValue | null>(() => {
    if (!campaignId) {
      return null;
    }

    return {
      campaignId,
      selectCampaign(nextCampaignId) {
        const normalized = setSelectedCampaignIdInBrowser(nextCampaignId);
        setCampaignId(normalized || null);
        router.refresh();
      },
      clearCampaign() {
        clearSelectedCampaignIdInBrowser();
        setCampaignId(null);
        router.replace("/campaigns");
      }
    };
  }, [campaignId, router]);

  if (!hydrated || (routeNeedsCampaign(pathname) && !value)) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center">
        <LoadingPanel label="Loading campaign context..." />
      </div>
    );
  }

  if (!value) {
    return <>{children}</>;
  }

  return <CampaignContext.Provider value={value}>{children}</CampaignContext.Provider>;
}

export function useCampaign() {
  const context = useContext(CampaignContext);

  if (!context) {
    throw new Error("useCampaign must be used inside CampaignProvider.");
  }

  return context;
}

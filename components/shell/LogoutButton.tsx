"use client";

import { faRightFromBracket } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/navigation";

import { clearSelectedCampaignIdInBrowser } from "@/lib/campaignSelection";
import { signOutDm } from "@/lib/firebase/auth";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await signOutDm();
    clearSelectedCampaignIdInBrowser();
    router.replace("/login");
  }

  return (
    <button
      aria-label="Logout"
      className="inline-flex h-9 w-9 items-center justify-center border-2 border-crt-border bg-crt-panel text-sm font-bold text-crt-text transition hover:border-crt-danger hover:text-crt-danger"
      onClick={() => void handleLogout()}
      type="button"
    >
      <FontAwesomeIcon fixedWidth icon={faRightFromBracket} />
    </button>
  );
}

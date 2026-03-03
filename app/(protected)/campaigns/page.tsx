import { CampaignSelector } from "@/components/campaign/CampaignSelector";

export default function CampaignsPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-6">
      <div className="w-full">
        <CampaignSelector />
      </div>
    </div>
  );
}

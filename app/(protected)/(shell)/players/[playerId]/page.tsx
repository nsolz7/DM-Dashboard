import { PlayerDetailView } from "@/components/campaign/PlayerDetailView";

interface PlayerPageProps {
  params: {
    playerId: string;
  };
}

export default function PlayerPage({ params }: PlayerPageProps) {
  return <PlayerDetailView playerId={params.playerId} />;
}

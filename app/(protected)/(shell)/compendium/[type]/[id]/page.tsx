import type { CompendiumType } from "@/types";
import { CompendiumDetail } from "@/components/compendium/CompendiumDetail";

const validCompendiumTypes: CompendiumType[] = [
  "monsters",
  "species",
  "traits",
  "tables",
  "items",
  "backgrounds",
  "classes",
  "spells"
];

interface CompendiumDetailPageProps {
  params: {
    type: string;
    id: string;
  };
}

export default function CompendiumDetailPage({ params }: CompendiumDetailPageProps) {
  const type = validCompendiumTypes.includes(params.type as CompendiumType)
    ? (params.type as CompendiumType)
    : "items";

  return <CompendiumDetail id={params.id} type={type} />;
}

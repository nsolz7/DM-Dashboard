import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faAsterisk,
  faBookOpen,
  faBoxOpen,
  faDragon,
  faScroll,
  faStar,
  faTable,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import type { CompendiumType } from "@/types";

const compendiumIcons: Record<CompendiumType, IconDefinition> = {
  monsters: faDragon,
  species: faUsers,
  traits: faAsterisk,
  tables: faTable,
  items: faBoxOpen,
  backgrounds: faScroll,
  classes: faBookOpen,
  spells: faStar
};

interface CompendiumTypeIconProps {
  type: CompendiumType;
  className?: string;
}

export function CompendiumTypeIcon({ type, className = "" }: CompendiumTypeIconProps) {
  return (
    <FontAwesomeIcon
      className={className}
      fixedWidth
      icon={compendiumIcons[type] ?? faBookOpen}
    />
  );
}

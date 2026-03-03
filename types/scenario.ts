export interface ScenarioItem {
  label: string;
  subtext?: string | null;
}

export interface ScenarioState {
  mode: string | null;
  title: string | null;
  text: string | null;
  imagePath: string | null;
  listItems: ScenarioItem[];
  updatedAt: string | null;
}

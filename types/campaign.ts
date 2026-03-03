export interface Campaign {
  id: string;
  name: string;
  status?: string | null;
  schemaVersion?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  dmNotes?: string | null;
}

export function getDmRecipientKey(uid: string): string {
  return `dm_${uid.trim()}`;
}

export function getPlayerRecipientKey(playerId: string): string {
  return `player_${playerId.trim()}`;
}

export function getPartyRecipientKey(campaignId: string): string {
  return `party_${campaignId.trim()}`;
}

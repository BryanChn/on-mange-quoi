// Vote optimiste : l'écran montre le choix de l'utilisateur dès le toucher, avant la réponse
// du serveur (useOptimistic dans l'écran du vote). Fonctions pures, sans import à l'exécution
// pour rester testables avec node --test (optimistic-vote.test.ts).

// Nom affiché pour l'utilisateur dans la liste des votants d'un plat.
export const MY_VOTER_NAME = "toi";

type VotableProposal = { id: string; hasMyVote: boolean; voteCount: number; voterNames: string[] };

// État absolu (« je veux avoir coché »), jamais une bascule : React peut rejouer l'action
// sur une liste rechargée entre-temps (temps réel) sans compter le vote deux fois.
export function withMyVote<P extends VotableProposal>(
  proposals: P[],
  proposalId: string,
  wantVote: boolean,
): P[] {
  return proposals.map((proposal) => {
    if (proposal.id !== proposalId || proposal.hasMyVote === wantVote) return proposal;
    return {
      ...proposal,
      hasMyVote: wantVote,
      voteCount: proposal.voteCount + (wantVote ? 1 : -1),
      voterNames: wantVote
        ? [MY_VOTER_NAME, ...proposal.voterNames]
        : proposal.voterNames.filter((name) => name !== MY_VOTER_NAME),
    };
  });
}

// Votants (au moins un plat coché) en tenant compte du choix provisoire de l'utilisateur.
export function voterIdsWithMe(voterIds: string[], userId: string, hasVoted: boolean): string[] {
  const others = voterIds.filter((voterId) => voterId !== userId);
  return hasVoted ? [...others, userId] : others;
}

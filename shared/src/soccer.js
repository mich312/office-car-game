// RC Soccer geometry the server and the client have to agree on.

// Goal posts are 2.8 units tall (the crossbar the client draws). A ball
// counts if its underside crosses the line below the crossbar — and a Giant
// Ball, taller than the posts, gets a mouth that fits it.
export const SOCCER_POST_H = 2.8;
export const soccerGoalHeight = (R) => Math.max(SOCCER_POST_H, 2 * R + 0.4);

// Kickoff spots: the map lists 12, four per side then two more per side
// (the ` i < 4 ? 0 : …` pattern). A car takes its team's spot by its ordinal
// within the team — unique per team and the same on every client.
export function soccerKickoff(map, team, ord) {
  const kick = map.SOCCER.kickoff;
  const spots = kick.filter((_, i) => (i < 4 ? 0 : i < 8 ? 1 : i < 10 ? 0 : 1) === team);
  return spots[Math.max(0, ord) % spots.length] || kick[0];
}

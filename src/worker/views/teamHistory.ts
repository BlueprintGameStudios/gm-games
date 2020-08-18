import { idb } from "../db";
import { g, helpers } from "../util";
import type { UpdateEvents, ViewInput } from "../../common/types";
import { getMostCommonPosition } from "../core/player/checkJerseyNumberRetirement";

const updateTeamHistory = async (
	inputs: ViewInput<"teamHistory">,
	updateEvents: UpdateEvents,
	state: any,
) => {
	if (
		updateEvents.includes("firstRun") ||
		updateEvents.includes("gameSim") ||
		updateEvents.includes("retiredJerseys") ||
		updateEvents.includes("gameAttributes") ||
		inputs.abbrev !== state.abbrev
	) {
		let bestRecord;
		let worstRecord;
		let bestWinp = -Infinity;
		let worstWinp = Infinity;
		let mostWon = 0;
		let mostLost = 0;

		const t = await idb.cache.teams.get(inputs.tid);
		if (!t) {
			throw new Error("Invalid team ID number");
		}

		const teamSeasons = await idb.getCopies.teamSeasons({
			tid: inputs.tid,
		});

		const retiredJerseyNumbers = await Promise.all(
			(t.retiredJerseyNumbers || []).map(async row => {
				const ts = teamSeasons.find(ts => ts.season === row.seasonTeamInfo);
				const teamInfo = {
					colors: ts ? ts.colors : t.colors,
					name: ts ? ts.name : t.name,
					region: ts ? ts.region : t.region,
				};

				let name;
				let pos;
				if (row.pid !== undefined) {
					const p = await idb.getCopy.players({ pid: row.pid });
					if (p) {
						name = `${p.firstName} ${p.lastName}`;
						pos = getMostCommonPosition(p, inputs.tid);
					}
				}

				return {
					...row,
					teamInfo,
					name,
					pos,
				};
			}),
		);

		const history: {
			season: number;
			won: number;
			lost: number;
			tied?: number;
			playoffRoundsWon: number;
			numPlayoffRounds: number;
			numConfs: number;
			name?: string;
		}[] = [];

		let totalWon = 0;
		let totalLost = 0;
		let totalTied = 0;
		let playoffAppearances = 0;
		let finalsAppearances = 0;
		let championships = 0;

		for (const teamSeason of teamSeasons) {
			const numPlayoffRounds = g.get("numGamesPlayoffSeries", teamSeason.season)
				.length;

			history.push({
				season: teamSeason.season,
				won: teamSeason.won,
				lost: teamSeason.lost,
				tied: teamSeason.tied,
				playoffRoundsWon: teamSeason.playoffRoundsWon,
				numPlayoffRounds,
				numConfs: g.get("confs", teamSeason.season).length,
				name:
					teamSeason.region && teamSeason.name
						? `${teamSeason.region} ${teamSeason.name}`
						: undefined,
			});
			totalWon += teamSeason.won;
			totalLost += teamSeason.lost;
			totalTied += teamSeason.tied;

			if (teamSeason.playoffRoundsWon >= 0) {
				playoffAppearances += 1;
			}

			if (teamSeason.playoffRoundsWon >= numPlayoffRounds - 1) {
				finalsAppearances += 1;
			}

			if (teamSeason.playoffRoundsWon === numPlayoffRounds) {
				championships += 1;
			}

			const winp = helpers.calcWinp(teamSeason);

			if (
				winp > bestWinp &&
				(teamSeason.season < g.get("season") || teamSeason.won >= mostWon)
			) {
				bestRecord = history[history.length - 1];
				bestWinp = winp;
				mostWon = teamSeason.won;
			}

			if (
				winp < worstWinp &&
				(teamSeason.season < g.get("season") || teamSeason.won >= mostLost)
			) {
				worstRecord = history[history.length - 1];
				worstWinp = winp;
				mostLost = teamSeason.lost;
			}
		}

		history.reverse(); // Show most recent season first

		const stats =
			process.env.SPORT === "basketball"
				? ["gp", "min", "pts", "trb", "ast", "per", "ewa"]
				: ["gp", "keyStats", "av"];
		const playersAll = await idb.getCopies.players({
			statsTid: inputs.tid,
		});
		let players = await idb.getCopies.playersPlus(playersAll, {
			attrs: ["pid", "name", "injury", "tid", "hof", "watch"],
			ratings: ["pos"],
			stats: ["season", "abbrev", ...stats],
			tid: inputs.tid,
		});

		// Not sure why this is necessary, but sometimes statsTids gets an entry but ratings doesn't
		players = players.filter(p => p.careerStats.gp > 0);

		for (const p of players) {
			p.stats.reverse();

			for (let j = 0; j < p.stats.length; j++) {
				if (p.stats[j].abbrev === g.get("teamInfoCache")[inputs.tid]?.abbrev) {
					p.lastYr = p.stats[j].season.toString();
					break;
				}
			}

			// Handle case where ratings don't exist
			p.pos = p.ratings.length > 0 ? p.ratings[p.ratings.length - 1].pos : "";
			delete p.ratings;
			delete p.stats;
		}

		const totalWinp = helpers.calcWinp({
			won: totalWon,
			lost: totalLost,
			tied: totalTied,
		});

		return {
			abbrev: inputs.abbrev,
			history,
			players,
			stats,
			team: {
				name: g.get("teamInfoCache")[inputs.tid]?.name,
				region: g.get("teamInfoCache")[inputs.tid]?.region,
				tid: inputs.tid,
			},
			totalWon,
			totalLost,
			totalTied,
			totalWinp,
			playoffAppearances,
			finalsAppearances,
			championships,
			bestRecord,
			worstRecord,
			tid: inputs.tid,
			userTid: g.get("userTid"),
			retiredJerseyNumbers,
			season: g.get("season"),
			godMode: g.get("godMode"),
		};
	}
};

export default updateTeamHistory;

import { idb } from "../../db";
import { player, league, draft } from "..";
import { g, updateStatus, updatePlayMenu, random, logEvent } from "../../util";
import { PHASE } from "../../../common";
import deleteUnreadMessages from "./deleteUnreadMessages";

const disable = async (tid: number) => {
	const t = await idb.cache.teams.get(tid);
	if (!t) {
		throw new Error(`Invalid tid ${tid}`);
	}

	t.disabled = true;
	await idb.cache.teams.put(t);

	if (tid === g.get("userTid")) {
		// If there is an unread message from the owner, it's not doing any good now
		await deleteUnreadMessages();

		if (g.get("userTids").length > 1) {
			// If it's multi team mode, just move to the next team
			const newUserTids = g.get("userTids").filter(userTid => userTid !== tid);
			const newUserTid = random.choice(newUserTids);
			await league.setGameAttributes({
				userTid: newUserTid,
				userTids: newUserTids,
			});
		} else {
			// If it's not multi team mode, then this is similar to being fired
			await league.setGameAttributes({
				gameOver: true,
			});
			await updateStatus();
			await updatePlayMenu();
		}
	}

	// Delete draft picks, and return traded ones to original owner
	const draftPicks = await idb.cache.draftPicks.getAll();
	for (const dp of draftPicks) {
		if (dp.originalTid === t.tid) {
			await idb.cache.draftPicks.delete(dp.dpid);
		} else if (dp.tid === t.tid) {
			dp.tid = dp.originalTid;
			await idb.cache.draftPicks.put(dp);
		}
	}

	// Make all players free agents
	const players = await idb.cache.players.indexGetAll("playersByTid", t.tid);
	const baseMoods = await player.genBaseMoods();

	for (const p of players) {
		player.addToFreeAgents(p, g.get("phase"), baseMoods);
		await idb.cache.players.put(p);
	}

	// In preseason, need to delete teamSeason and teamStats
	if (g.get("phase") < PHASE.PLAYOFFS) {
		const teamSeason = await idb.cache.teamSeasons.indexGet(
			"teamSeasonsByTidSeason",
			[t.tid, g.get("season")],
		);
		if (teamSeason) {
			idb.cache.teamSeasons.delete(teamSeason.rid);
		}

		const teamStats = await idb.cache.teamSeasons.indexGet(
			"teamStatsByPlayoffsTid",
			[false, t.tid],
		);
		if (teamStats) {
			await idb.cache.teamSeasons.delete(teamStats.rid);
		}
	}

	await draft.deleteLotteryResultIfNoDraftYet();

	const allTeams = await idb.cache.teams.getAll();
	await league.setGameAttributes({
		numActiveTeams: allTeams.filter(t => !t.disabled).length,
		numTeams: allTeams.length,
		teamInfoCache: allTeams.map(t => ({
			abbrev: t.abbrev,
			disabled: t.disabled,
			imgURL: t.imgURL,
			name: t.name,
			region: t.region,
		})),
	});

	logEvent({
		text: `The ${t.region} ${t.name} franchise is disbanding. All their players will become free agents.`,
		type: "teamContraction",
		tids: [t.tid],
		showNotification: false,
		score: 20,
	});
};

export default disable;
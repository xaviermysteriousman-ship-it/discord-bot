module.exports = {
    prefix: "!",
    timezone: "America/New_York",

    channels: {
        morning: "morning-est",
        evening: "evening-est",
        qotd: "qotd"
    },

    schedule: {
        morning: "06:00",
        evening: "17:00",
        qotd: "10:00",
        catchUpWindowMinutes: 10
    },

    dailyMessages: {
        morning: "Good morning! Hope everyone has a great day.",
        evening: "Good evening! Hope everyone had a good day."
    },

    moderation: {
        enabled: true,
        resetAfterDays: 14,

        // This list is intentionally conservative. Add/remove words for your server.
        // The filter checks whole words after limited leetspeak folding, so examples
        // like "sh!t" and "n!gg3r" are caught without making "3" or "!" dangerous by themselves.
        blockedWords: [
            "shit",
            "bullshit",
            "shitty",
            "fuck",
            "fucks",
            "fucker",
            "fucking",
            "cunt",
            "cunts",
            "bitch",
            "bitchs",
            "ass",
            "asshole",
            "dickhead",
            "nigger",
            "nigga",
            "faggot",
            "fag",
            "tranny",
            "retard",
            "retigga",
            "retigger"
        ],

        ignoredChannelIds: [],
        ignoredRoleIds: []
    }
};

module.exports = {
    prefix: "!",
    timezone: "America/New_York",

    channels: {
        morning: "Morning EST",
        evening: "Evening EST",
        qotd: "QOTD"
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
            "fucker",
            "fucking",
            "cunt",
            "bitch",
            "asshole",
            "dickhead",
            "nigger",
            "nigga",
            "faggot",
            "fag",
            "kike",
            "chink",
            "spic",
            "coon",
            "wetback",
            "beaner",
            "tranny",
            "retard"
        ],

        ignoredChannelIds: [],
        ignoredRoleIds: []
    }
};

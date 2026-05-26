require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");
const {
    Client,
    GatewayIntentBits,
    Partials,
    PermissionFlagsBits
} = require("discord.js");

const CONFIG_PATH = path.join(__dirname, "bot-config.js");
const QOTD_PATH = path.join(__dirname, "qotd.js");
const STATE_FILE = path.join(__dirname, "bot-state.json");

const token = process.env.DISCORD_TOKEN || process.env.TOKEN || process.env.TOKEN2;

if (!token) {
    throw new Error("Missing bot token. Set DISCORD_TOKEN or TOKEN in your .env file.");
}

const DEFAULT_CONFIG = {
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
        morning: `Good morning everyone! This is a scheduled daily message!
If you would not like to receive these messages, mute this channel.
Today is {dayName}. Have a wonderful day!`,

        evening: `Good evening everyone! Hope everyone is having a good day and will continue to have a good day!
This is a scheduled daily message! If you would not like to receive these messages, mute this channel.
In case you missed it this morning, today is {dayName}. Continue to enjoy your day!`
    },
    moderation: {
        enabled: true,
        resetAfterDays: 14,
        blockedWords: [],
        ignoredChannelIds: [],
        ignoredRoleIds: []
    }
};

const LEET_MAP = new Map([
    ["@", "a"],
    ["4", "a"],
    ["8", "b"],
    ["3", "e"],
    ["1", "i"],
    ["!", "i"],
    ["|", "i"],
    ["\u00a1", "i"],
    ["0", "o"],
    ["$", "s"],
    ["5", "s"],
    ["7", "t"],
    ["+", "t"]
]);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

let config = loadConfig();
let qotdBank = [];
let state = createDefaultState();
let moderationCache = buildModerationCache(config.moderation.blockedWords);

qotdBank = loadQotdBank();

function createDefaultState() {
    return {
        moderation: {
            users: {}
        },
        schedule: {
            sent: {}
        },
        qotd: {
            indices: {}
        }
    };
}

function asPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function mergeConfig(base, overrides) {
    const safeOverrides = asPlainObject(overrides);

    return {
        ...base,
        ...safeOverrides,
        channels: { ...base.channels, ...asPlainObject(safeOverrides.channels) },
        schedule: { ...base.schedule, ...asPlainObject(safeOverrides.schedule) },
        dailyMessages: { ...base.dailyMessages, ...asPlainObject(safeOverrides.dailyMessages) },
        moderation: { ...base.moderation, ...asPlainObject(safeOverrides.moderation) }
    };
}

function requireFresh(filePath) {
    const resolved = require.resolve(filePath);
    delete require.cache[resolved];
    return require(resolved);
}

function loadConfig() {
    try {
        return mergeConfig(DEFAULT_CONFIG, requireFresh(CONFIG_PATH));
    } catch (err) {
        console.error(`Could not load bot-config.js, using defaults: ${err.message}`);
        return DEFAULT_CONFIG;
    }
}

function loadQotdBank() {
    try {
        const loaded = requireFresh(QOTD_PATH);
        if (!Array.isArray(loaded)) {
            throw new Error("qotd.js must export an array of strings.");
        }

        return loaded
            .map(question => String(question).trim())
            .filter(Boolean);
    } catch (err) {
        console.error(`Could not load qotd.js: ${err.message}`);
        return qotdBank;
    }
}

function normalizeState(rawState) {
    const parsed = asPlainObject(rawState);
    const moderation = asPlainObject(parsed.moderation);
    const schedule = asPlainObject(parsed.schedule);
    const qotd = asPlainObject(parsed.qotd);

    return {
        moderation: {
            users: asPlainObject(moderation.users)
        },
        schedule: {
            sent: asPlainObject(schedule.sent)
        },
        qotd: {
            indices: asPlainObject(qotd.indices)
        }
    };
}

async function loadState() {
    try {
        const raw = await fs.readFile(STATE_FILE, "utf8");
        state = normalizeState(JSON.parse(raw));
    } catch (err) {
        if (err.code !== "ENOENT") {
            console.error(`Could not load ${STATE_FILE}: ${err.message}`);
        }
        state = createDefaultState();
    }
}

async function saveState() {
    await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function normalizeChannelName(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findConfiguredChannel(guild, configuredName) {
    const wanted = normalizeChannelName(configuredName);

    return guild.channels.cache.find(channel => (
        channel.isTextBased()
        && !channel.isDMBased?.()
        && normalizeChannelName(channel.name) === wanted
    ));
}

function parseClock(clock) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(clock).trim());
    if (!match) throw new Error(`Invalid clock time: ${clock}`);

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        throw new Error(`Invalid clock time: ${clock}`);
    }

    return hour * 60 + minute;
}

function getLocalDateTimeParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: config.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    });

    const parts = Object.fromEntries(
        formatter.formatToParts(date).map(part => [part.type, part.value])
    );

    return {
        dateKey: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute)
    };
}

function getLocalDayName(date = new Date()) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone: config.timezone,
        weekday: "long"
    }).format(date);
}

function renderScheduledMessage(messageText) {
    return String(messageText).replaceAll("{dayName}", getLocalDayName());
}

function shouldRunScheduledJob(guildId, jobName, clock) {
    const { dateKey, minutes } = getLocalDateTimeParts();
    const scheduledMinute = parseClock(clock);
    const catchUpWindow = Number(config.schedule.catchUpWindowMinutes || 10);
    const scheduleKey = `${guildId}:${jobName}`;

    if (state.schedule.sent[scheduleKey] === dateKey) return false;
    if (minutes < scheduledMinute) return false;
    if (minutes >= scheduledMinute + catchUpWindow) return false;

    return true;
}

async function markScheduledJobSent(guildId, jobName) {
    const { dateKey } = getLocalDateTimeParts();
    state.schedule.sent[`${guildId}:${jobName}`] = dateKey;
    await saveState();
}

async function sendWithoutMentions(channel, content) {
    return channel.send({
        content,
        allowedMentions: { parse: [] }
    });
}

async function maybeSendDailyMessage(guild, jobName, channelName, clock, messageText) {
    if (!shouldRunScheduledJob(guild.id, jobName, clock)) return;

    const channel = findConfiguredChannel(guild, channelName);
    if (!channel) {
        console.log(`Could not find channel "${channelName}" in ${guild.name}.`);
        return;
    }

    await sendWithoutMentions(channel, renderScheduledMessage(messageText));
    await markScheduledJobSent(guild.id, jobName);
}

async function sendQotd(guild) {
    qotdBank = loadQotdBank();

    const channel = findConfiguredChannel(guild, config.channels.qotd);
    if (!channel) {
        console.log(`Could not find channel "${config.channels.qotd}" in ${guild.name}.`);
        return false;
    }

    const currentIndex = Number(state.qotd.indices[guild.id] || 0);
    const question = qotdBank[currentIndex];

    if (!question) {
        await sendWithoutMentions(channel, "No question provided! Needs refilled!");
        return true;
    }

    await sendWithoutMentions(
        channel,
        `Question of the Day #${currentIndex + 1}\n${question}`
    );

    state.qotd.indices[guild.id] = currentIndex + 1;
    await saveState();
    return true;
}

async function maybeSendQotd(guild) {
    if (!shouldRunScheduledJob(guild.id, "qotd", config.schedule.qotd)) return;

    const sent = await sendQotd(guild);
    if (sent) await markScheduledJobSent(guild.id, "qotd");
}

async function runScheduledPosts() {
    for (const guild of client.guilds.cache.values()) {
        await maybeSendDailyMessage(
            guild,
            "morning",
            config.channels.morning,
            config.schedule.morning,
            config.dailyMessages.morning
        );

        await maybeSendDailyMessage(
            guild,
            "evening",
            config.channels.evening,
            config.schedule.evening,
            config.dailyMessages.evening
        );

        await maybeSendQotd(guild);
    }
}

function startScheduler() {
    const run = () => runScheduledPosts().catch(err => {
        console.error("Scheduled post check failed:", err);
    });

    run();
    setInterval(run, 30 * 1000);
}

function foldFilterChunk(chunk) {
    const trimmed = chunk
        .normalize("NFKC")
        .toLowerCase()
        .replace(/^[!\u00a1*._~"'`-]+|[!\u00a1*._~"'`-]+$/gu, "");

    let folded = "";

    for (const char of trimmed) {
        if (LEET_MAP.has(char)) {
            folded += LEET_MAP.get(char);
        } else if (/[\p{L}\p{N}]/u.test(char)) {
            folded += char;
        }
    }

    return folded;
}

function squashRepeats(value) {
    return value.replace(/(.)\1+/g, "$1");
}

function buildModerationCache(blockedWords) {
    const exact = new Set();
    const squashed = new Set();

    for (const word of asArray(blockedWords)) {
        const folded = foldFilterChunk(String(word));
        if (!folded) continue;

        exact.add(folded);
        squashed.add(squashRepeats(folded));
    }

    return { exact, squashed };
}

function findBlockedContent(content) {
    if (!config.moderation.enabled) return false;

    const chunks = String(content).match(/\S+/gu) || [];

    for (const chunk of chunks) {
        const folded = foldFilterChunk(chunk);
        if (!folded) continue;

        if (moderationCache.exact.has(folded)) return true;
        if (moderationCache.squashed.has(squashRepeats(folded))) return true;
    }

    return false;
}

function getModerationKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function getModerationRecord(guildId, userId) {
    const key = getModerationKey(guildId, userId);
    const now = Date.now();
    const resetAfterMs = Number(config.moderation.resetAfterDays || 14) * 24 * 60 * 60 * 1000;
    let record = state.moderation.users[key];

    if (!record || now - Number(record.windowStartedAt || 0) >= resetAfterMs) {
        record = {
            guildId,
            userId,
            count: 0,
            windowStartedAt: now,
            lastOffenseAt: null
        };
        state.moderation.users[key] = record;
    }

    return record;
}

function incrementModerationRecord(guildId, userId) {
    const record = getModerationRecord(guildId, userId);
    record.count += 1;
    record.lastOffenseAt = Date.now();
    return record;
}

function timeoutForOffense(count) {
    if (count >= 5) return 3 * 24 * 60 * 60 * 1000;
    if (count >= 3) return 60 * 60 * 1000;
    return 5 * 60 * 1000;
}

function formatDuration(ms) {
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (ms % day === 0) return `${ms / day} day${ms === day ? "" : "s"}`;
    if (ms % hour === 0) return `${ms / hour} hour${ms === hour ? "" : "s"}`;
    if (ms % minute === 0) return `${ms / minute} minute${ms === minute ? "" : "s"}`;
    return `${Math.round(ms / 1000)} seconds`;
}

async function handleAutoModeration(message) {
    if (!message.guild || message.author.bot) return false;
    if (!findBlockedContent(message.content)) return false;

    const ignoredChannelIds = asArray(config.moderation.ignoredChannelIds);
    if (ignoredChannelIds.includes(message.channel.id)) return false;

    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return false;

    const ignoredRoleIds = asArray(config.moderation.ignoredRoleIds);
    if (member.roles.cache.some(role => ignoredRoleIds.includes(role.id))) return false;

    const record = incrementModerationRecord(message.guild.id, message.author.id);
    const timeoutMs = timeoutForOffense(record.count);
    const timeoutText = formatDuration(timeoutMs);

    let timeoutApplied = false;
    try {
        if (member.moderatable) {
            await member.timeout(timeoutMs, `Auto-moderation: inappropriate language. Offense ${record.count}.`);
            timeoutApplied = true;
        }
    } catch (err) {
        console.error(`Could not timeout ${message.author.tag}: ${err.message}`);
    }

    await saveState();

    if (message.deletable) {
        await message.delete().catch(() => null);
    }

    const response = timeoutApplied
        ? `<@${message.author.id}>, you cannot say that! You have been timed out for ${timeoutText}.`
        : `<@${message.author.id}>, you cannot say that! I tried to time you out for ${timeoutText}, but I do not have permission.`;

    await message.channel.send({
        content: response,
        allowedMentions: { users: [message.author.id] }
    }).catch(err => {
        console.error(`Could not send moderation response: ${err.message}`);
    });

    return true;
}

function parseArgs(input) {
    const args = [];
    const pattern = /"([^"]+)"|'([^']+)'|`([^`]+)`|(\S+)/g;
    let match;

    while ((match = pattern.exec(input)) !== null) {
        args.push(match[1] || match[2] || match[3] || match[4]);
    }

    return args;
}

function parseDuration(value, fallbackMs) {
    if (!value) return fallbackMs;

    const match = /^(\d+)(s|m|h|d|w)$/i.exec(value);
    if (!match) return null;

    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };

    const ms = amount * multipliers[unit];
    const max = 28 * 24 * 60 * 60 * 1000;

    return Math.min(ms, max);
}

function looksLikeDuration(value) {
    return /^\d+(s|m|h|d|w)$/i.test(String(value || ""));
}

async function resolveMember(message, query) {
    if (!query) {
        return { error: "Please mention a user, provide a user ID, or provide a username." };
    }

    const mentioned = message.mentions.members.first();
    if (mentioned) return { member: mentioned };

    const idMatch = /^(?:<@!?)?(\d{17,20})>?$/.exec(query);
    if (idMatch) {
        const member = await message.guild.members.fetch(idMatch[1]).catch(() => null);
        if (member) return { member };
    }

    const lowerQuery = query.toLowerCase();
    const cachedExact = message.guild.members.cache.find(member => (
        member.user.username.toLowerCase() === lowerQuery
        || member.displayName.toLowerCase() === lowerQuery
    ));
    if (cachedExact) return { member: cachedExact };

    const fetched = await message.guild.members.fetch({ query, limit: 10 }).catch(() => null);
    if (!fetched || fetched.size === 0) {
        return { error: `Could not find a member matching "${query}". Try mentioning them instead.` };
    }

    const exact = fetched.find(member => (
        member.user.username.toLowerCase() === lowerQuery
        || member.displayName.toLowerCase() === lowerQuery
    ));
    if (exact) return { member: exact };

    if (fetched.size === 1) return { member: fetched.first() };

    return { error: `I found multiple members matching "${query}". Please mention the exact user.` };
}

async function getBotMember(guild) {
    return guild.members.me || guild.members.fetchMe();
}

async function getCommandMember(message) {
    return message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
}

async function requireUserPermission(message, permission, label) {
    const member = await getCommandMember(message);

    if (!member || !member.permissions.has(permission)) {
        await message.reply(`You need the ${label} permission to use this command.`);
        return false;
    }

    return true;
}

async function requireBotPermission(message, permission, label) {
    const botMember = await getBotMember(message.guild);

    if (!botMember.permissions.has(permission)) {
        await message.reply(`I need the ${label} permission to do that.`);
        return false;
    }

    return true;
}

async function commandHelp(message) {
    const prefix = config.prefix;

    await message.reply({
        content:
            `Commands using prefix ${prefix}\n\n`
            + "General:\n"
            + `${prefix}help, ${prefix}ping, ${prefix}hello, ${prefix}info, ${prefix}server, ${prefix}avatar [user], ${prefix}coin, ${prefix}roll [sides], ${prefix}choose a | b | c, ${prefix}uptime\n\n`
            + "Moderation/Admin:\n"
            + `${prefix}kick @user [reason]\n`
            + `${prefix}ban @user [reason]\n`
            + `${prefix}timeout @user [5m|1h|3d] [reason]\n`
            + `${prefix}untimeout @user [reason]\n`
            + `${prefix}purge 1-100\n`
            + `${prefix}slowmode seconds\n`
            + `${prefix}modcount @user\n`
            + `${prefix}resetmod @user\n`
            + `${prefix}qotdstatus, ${prefix}qotdset number, ${prefix}qotdnow, ${prefix}reloadbot`,
        allowedMentions: { parse: [] }
    });
}

async function commandKick(message, args) {
    if (!await requireUserPermission(message, PermissionFlagsBits.KickMembers, "Kick Members")) return;
    if (!await requireBotPermission(message, PermissionFlagsBits.KickMembers, "Kick Members")) return;

    const { member, error } = await resolveMember(message, args[0]);
    if (error) return message.reply(error);
    if (!member.kickable) return message.reply("I cannot kick that member. Their role may be above mine.");

    const reason = args.slice(1).join(" ") || "No reason provided.";
    await member.kick(reason);
    await message.reply(`Kicked ${member.user.tag}. Reason: ${reason}`);
}

async function commandBan(message, args) {
    if (!await requireUserPermission(message, PermissionFlagsBits.BanMembers, "Ban Members")) return;
    if (!await requireBotPermission(message, PermissionFlagsBits.BanMembers, "Ban Members")) return;

    const { member, error } = await resolveMember(message, args[0]);
    if (error) return message.reply(error);
    if (!member.bannable) return message.reply("I cannot ban that member. Their role may be above mine.");

    const reason = args.slice(1).join(" ") || "No reason provided.";
    await member.ban({ reason });
    await message.reply(`Banned ${member.user.tag}. Reason: ${reason}`);
}

async function commandTimeout(message, args) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ModerateMembers, "Moderate Members")) return;
    if (!await requireBotPermission(message, PermissionFlagsBits.ModerateMembers, "Moderate Members")) return;

    const { member, error } = await resolveMember(message, args[0]);
    if (error) return message.reply(error);
    if (!member.moderatable) return message.reply("I cannot timeout that member. Their role may be above mine.");

    const durationArg = args[1];
    const durationMs = looksLikeDuration(durationArg)
        ? parseDuration(durationArg, 5 * 60 * 1000)
        : 5 * 60 * 1000;
    const reasonStart = looksLikeDuration(durationArg) ? 2 : 1;
    const reason = args.slice(reasonStart).join(" ") || "No reason provided.";

    await member.timeout(durationMs, reason);
    await message.reply(`Timed out ${member.user.tag} for ${formatDuration(durationMs)}. Reason: ${reason}`);
}

async function commandUntimeout(message, args) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ModerateMembers, "Moderate Members")) return;
    if (!await requireBotPermission(message, PermissionFlagsBits.ModerateMembers, "Moderate Members")) return;

    const { member, error } = await resolveMember(message, args[0]);
    if (error) return message.reply(error);
    if (!member.moderatable) return message.reply("I cannot remove timeout from that member. Their role may be above mine.");

    const reason = args.slice(1).join(" ") || "No reason provided.";
    await member.timeout(null, reason);
    await message.reply(`Removed timeout from ${member.user.tag}. Reason: ${reason}`);
}

async function commandPurge(message, args) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ManageMessages, "Manage Messages")) return;
    if (!await requireBotPermission(message, PermissionFlagsBits.ManageMessages, "Manage Messages")) return;

    const count = Number(args[0]);
    if (!Number.isInteger(count) || count < 1 || count > 100) {
        return message.reply("Usage: !purge 1-100");
    }

    const deleted = await message.channel.bulkDelete(count + 1, true);
    const notice = await message.channel.send(`Deleted ${Math.max(deleted.size - 1, 0)} message(s).`);
    setTimeout(() => notice.delete().catch(() => null), 5000);
}

async function commandSlowmode(message, args) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ManageChannels, "Manage Channels")) return;
    if (!await requireBotPermission(message, PermissionFlagsBits.ManageChannels, "Manage Channels")) return;

    const seconds = Number(args[0]);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
        return message.reply("Usage: !slowmode seconds, from 0 to 21600.");
    }

    await message.channel.setRateLimitPerUser(seconds, `Slowmode changed by ${message.author.tag}`);
    await message.reply(seconds === 0 ? "Slowmode disabled." : `Slowmode set to ${seconds} second(s).`);
}

async function commandModCount(message, args) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ModerateMembers, "Moderate Members")) return;

    const { member, error } = await resolveMember(message, args[0]);
    if (error) return message.reply(error);

    const record = getModerationRecord(message.guild.id, member.id);
    await message.reply(`${member.user.tag} has ${record.count} auto-moderation offense(s) in the current 2-week window.`);
}

async function commandResetMod(message, args) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ModerateMembers, "Moderate Members")) return;

    const { member, error } = await resolveMember(message, args[0]);
    if (error) return message.reply(error);

    delete state.moderation.users[getModerationKey(message.guild.id, member.id)];
    await saveState();
    await message.reply(`Reset auto-moderation counter for ${member.user.tag}.`);
}

async function commandQotdStatus(message) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ManageGuild, "Manage Server")) return;

    qotdBank = loadQotdBank();
    const index = Number(state.qotd.indices[message.guild.id] || 0);
    await message.reply(`QOTD has ${qotdBank.length} question(s). Next question number: ${index + 1}.`);
}

async function commandQotdSet(message, args) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ManageGuild, "Manage Server")) return;

    const number = Number(args[0]);
    if (!Number.isInteger(number) || number < 1) {
        return message.reply("Usage: !qotdset 1");
    }

    state.qotd.indices[message.guild.id] = number - 1;
    await saveState();
    await message.reply(`Next QOTD number set to ${number}.`);
}

async function commandQotdNow(message) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ManageGuild, "Manage Server")) return;

    const sent = await sendQotd(message.guild);
    await message.reply(sent ? "QOTD sent." : `I could not find the ${config.channels.qotd} channel.`);
}

async function commandReloadBot(message) {
    if (!await requireUserPermission(message, PermissionFlagsBits.ManageGuild, "Manage Server")) return;

    config = loadConfig();
    qotdBank = loadQotdBank();
    moderationCache = buildModerationCache(config.moderation.blockedWords);

    await message.reply(`Reloaded config and QOTD bank. Loaded ${qotdBank.length} question(s).`);
}

async function handlePrefixCommand(message) {
    const prefix = config.prefix || "!";
    if (!message.content.startsWith(prefix)) return false;

    if (!message.guild) {
        await message.reply("Commands only work in servers right now.");
        return true;
    }

    const args = parseArgs(message.content.slice(prefix.length).trim());
    const command = (args.shift() || "").toLowerCase().replace(/!+$/g, "");

    if (!command) return false;

    switch (command) {
        case "help":
        case "commands":
            await commandHelp(message);
            break;
        case "ping":
            await message.reply("Pong!");
            break;
        case "hello":
            await message.reply(`Hey there, ${message.author.username}.`);
            break;
        case "info":
            await message.reply(`I am ${client.user.tag}. Prefix: ${prefix}. Servers: ${client.guilds.cache.size}. Created by: glacial.leader (Glacial King)`);
            break;
        case "server":
            await message.reply(`${message.guild.name} has ${message.guild.memberCount} member(s).`);
            break;
        case "avatar": {
            const target = message.mentions.users.first() || message.author;
            await message.reply(target.displayAvatarURL({ size: 1024, extension: "png" }));
            break;
        }
        case "coin":
            await message.reply(Math.random() < 0.5 ? "Heads" : "Tails");
            break;
        case "roll": {
            const sides = Math.min(Math.max(Number(args[0]) || 6, 2), 100000);
            await message.reply(`You rolled ${Math.floor(Math.random() * sides) + 1} out of ${sides}.`);
            break;
        }
        case "choose": {
            const joined = args.join(" ");
            const options = (joined.includes("|") ? joined.split("|") : args)
                .map(option => option.trim())
                .filter(Boolean);

            if (options.length < 2) {
                await message.reply("Usage: !choose option one | option two | option three");
            } else {
                await message.reply(options[Math.floor(Math.random() * options.length)]);
            }
            break;
        }
        case "uptime":
            await message.reply(`Uptime: ${formatDuration(client.uptime || 0)}.`);
            break;
        case "kick":
            await commandKick(message, args);
            break;
        case "ban":
            await commandBan(message, args);
            break;
        case "timeout":
        case "mute":
            await commandTimeout(message, args);
            break;
        case "untimeout":
        case "unmute":
            await commandUntimeout(message, args);
            break;
        case "purge":
        case "clear":
            await commandPurge(message, args);
            break;
        case "slowmode":
            await commandSlowmode(message, args);
            break;
        case "modcount":
            await commandModCount(message, args);
            break;
        case "resetmod":
            await commandResetMod(message, args);
            break;
        case "qotdstatus":
            await commandQotdStatus(message);
            break;
        case "qotdset":
            await commandQotdSet(message, args);
            break;
        case "qotdnow":
            await commandQotdNow(message);
            break;
        case "reloadbot":
            await commandReloadBot(message);
            break;
        default:
            await message.reply(`Unknown command. Use ${prefix}help.`);
            break;
    }

    return true;
}

client.once("ready", async () => {
    console.log(`Bot online as ${client.user.tag}`);
    console.log(`Prefix: ${config.prefix}`);
    console.log(`Loaded ${qotdBank.length} QOTD question(s).`);
    console.log(`Loaded ${moderationCache.exact.size} blocked word(s).`);
    startScheduler();
});

client.on("messageCreate", async message => {
    if (message.author.bot) return;

    try {
        const moderated = await handleAutoModeration(message);
        if (moderated) return;

        const handledCommand = await handlePrefixCommand(message);
        if (handledCommand) return;

        if (message.guild && message.mentions.has(client.user)) {
            await message.reply(`Hi. Use ${config.prefix}help to see what I can do.`);
        }
    } catch (err) {
        console.error("Message handler failed:", err);
        await message.reply("Something went wrong while handling that.").catch(() => null);
    }
});

process.on("unhandledRejection", err => {
    console.error("Unhandled promise rejection:", err);
});

async function main() {
    await loadState();
    await client.login(token);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

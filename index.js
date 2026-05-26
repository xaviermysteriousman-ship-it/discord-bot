require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once("ready", () => {
    console.log(`Bot online as ${client.user.tag}`);
});

// Helper: normalize commands
function normalizeContent(content) {
    return content
        .trim()
        .toLowerCase()
        .replace(/!+$/g, ""); // removes trailing !!!!
}

client.on("messageCreate", message => {
    if (message.author.bot) return;

    const raw = message.content;
    const content = normalizeContent(raw);

    const botMention = `<@${client.user.id}>`;
    const botMentionAlt = `<@!${client.user.id}>`;

    // =========================
    // PING COMMAND (case-insensitive)
    // =========================
    if (content === "!ping") {
        message.reply("Pong!");
    }

    // works for: !Ping, !PING!!, !piNg!!!
    if (content === "!hello") {
        message.reply("Hey there 👋");
    }

    // =========================
    // BOT MENTION FIX (THIS IS THE CORRECT WAY)
    // =========================
    if (raw.includes(botMention) || raw.includes(botMentionAlt)) {
        message.reply("Template Text (you mentioned me)");
    }

    // =========================
    // CUSTOM COMMAND EXAMPLES
    // =========================

    if (content === "!help") {
        message.reply(
            "Commands:\n" +
            "!hello - greet\n" +
            "!info - bot info\n" +
            "!coin - heads or tails?\n" +
            "!joke - hear a joke\n" +
            "@Glacial Knight - mention the bot"
        );
    }

    if (content === "!info") {
        message.reply(`I am ${client.user.tag}, a bot.`);
    }

    // =========================
    // FUN / EXPERIMENT COMMANDS (EDIT THESE)
    // =========================

    if (content === "!coin") {
        const result = Math.random() < 0.5 ? "Heads" : "Tails";
        message.reply(`🪙 ${result}`);
    }

    
    // =========================
    // TEMPLATE COMMAND (UNCOMMENT TO USE)
    // =========================
    if (content === "!joke") {
        const jokes = [
            "Template Text #1",
            "Template Text #2",
            "Template Text #3"
        ];

        const pick = jokes[Math.floor(Math.random() * jokes.length)];
        message.reply(pick);
    }
    

    /*
    // =========================
    // ROLE / ADMIN COMMAND TEMPLATE
    // =========================
    if (content === "!kickme") {
        if (!message.member.permissions.has("KickMembers")) {
            return message.reply("You don't have permission.");
        }

        message.reply("This is where kick logic would go.");
    }
    */
});

client.login(process.env.TOKEN);

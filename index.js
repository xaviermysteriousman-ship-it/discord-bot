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
    console.log("Bot online!");
});

client.on("messageCreate", message => {

    if (message.author.bot) return;

    if (message.content === "!ping") {
        message.reply("Pong!");
    }
    if (message.content === "@Glacial Knight ") {
        message.reply("Hello!");
    }
    if (message.content === "@Glacial Knight") {
        message.reply("Hello!");
    }
});

client.login(process.env.TOKEN);

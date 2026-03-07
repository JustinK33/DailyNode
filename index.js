import dotenv from 'dotenv';
dotenv.config()

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, GatewayIntentBits, Events, Collection, MessageFlags, ActivityType } from 'discord.js';
import { createAppContext } from './services/appContext.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ]
})

let appContext = null;

async function loadCommands() {
    client.commands = new Collection();

    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const imported = await import(pathToFileURL(filePath).href);
            const command = imported.default ?? imported;

            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }
}

client.once(Events.ClientReady, async (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	readyClient.user.setActivity('/help', { type: ActivityType.Playing });

    try {
        appContext = await createAppContext(client);
    } catch (error) {
        console.error('❌ Failed to initialize application context:', error);
        process.exit(1);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error('No command matching ${interaction.commandName} was found.');
        return;
    }

    try {
        if (!appContext) {
            await interaction.reply({
                content: 'The bot is still initializing. Please try again in a few seconds.',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await command.execute(interaction, appContext)
    } 
    catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
            });
        } else {
            await interaction.reply({
				content: 'There was an error while executing this command!',
				flags: MessageFlags.Ephemeral,
			});
        }
    }
});

await loadCommands();
client.login(process.env.DISCORD_TOKEN);
import dotenv from 'dotenv';
dotenv.config()

import { fs } from 'node.fs';
import { path } from 'node:path';
import { Client, GatewayIntentBits, Events, Collection, MessageFlags } from 'discord.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ]
})

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error('No command matching ${interaction.commandName} was found.');
        return;
    }

    try {
        await command.execute(interaction)
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

client.commands = new Collection();

const foldersPath = path.join(__dirname, 'commands');
const commandsFolders = fs.readdirSync(foldersPath);

for (const folder of commandsFolders) {
    const commandsPath = path.join(foldersPath, folder)
    const commandsFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
    for (const folder of commandsFolders) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command)
        } else {
            console.log('[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.');
        }
    }
}

client.login(process.env.DISCORD_TOKEN);